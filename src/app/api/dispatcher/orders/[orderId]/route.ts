import {
    DelayReason,
    DelayStatus,
    DriverStatus,
    OrderStatus,
    PaymentStatus,
    TimelineEventType,
} from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';

import {
    enqueueDelaySyncJob,
    enqueueDispatchReadyOrderJob,
    enqueueRefundJob,
} from '@/jobs/enqueue';
import { requireDispatcherPermissionForRequest } from '@/lib/dispatcher-permissions';
import { getOperationalDelayStatus } from '@/lib/order-realtime';
import { prisma } from '@/lib/prisma';
import {
    adminRateLimitPolicies,
    enforceIpRateLimit,
    enforceUserRateLimit,
} from '@/lib/rate-limit';

type UpdateDispatcherOrderBody = {
    status?: unknown;
    etaDeltaMinutes?: unknown;
};

const dispatcherStatusOptions: OrderStatus[] = [
    OrderStatus.CONFIRMED,
    OrderStatus.PREPARING,
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.ASSIGNED,
    OrderStatus.ACCEPTED_BY_DRIVER,
    OrderStatus.PICKED_UP,
    OrderStatus.ON_THE_WAY,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
];

function isOrderStatus(value: unknown): value is OrderStatus {
    return typeof value === 'string' && Object.values(OrderStatus).includes(value as OrderStatus);
}

function requiresAssignment(status: OrderStatus): boolean {
    return status === OrderStatus.ASSIGNED
        || status === OrderStatus.ACCEPTED_BY_DRIVER
        || status === OrderStatus.PICKED_UP
        || status === OrderStatus.ON_THE_WAY
        || status === OrderStatus.DELIVERED;
}

function getOrderTimestampData(status: OrderStatus, now: Date) {
    if (status === OrderStatus.CONFIRMED) {
        return {
            confirmedAt: now,
        };
    }

    if (status === OrderStatus.READY_FOR_PICKUP) {
        return {
            readyForPickupAt: now,
        };
    }

    if (status === OrderStatus.PICKED_UP || status === OrderStatus.ON_THE_WAY) {
        return {
            pickedUpAt: now,
        };
    }

    if (status === OrderStatus.DELIVERED) {
        return {
            deliveredAt: now,
        };
    }

    if (status === OrderStatus.CANCELLED) {
        return {
            cancelledAt: now,
        };
    }

    return {};
}

function getAssignmentTimestampData(
    status: OrderStatus,
    now: Date,
    acceptedAt?: Date | null,
) {
    if (status === OrderStatus.ACCEPTED_BY_DRIVER) {
        return {
            acceptedAt: acceptedAt ?? now,
        };
    }

    if (status === OrderStatus.PICKED_UP || status === OrderStatus.ON_THE_WAY) {
        return {
            acceptedAt: acceptedAt ?? now,
            pickedUpAt: now,
        };
    }

    if (status === OrderStatus.DELIVERED) {
        return {
            deliveredAt: now,
        };
    }

    if (status === OrderStatus.CANCELLED) {
        return {
            cancelledAt: now,
        };
    }

    return {};
}

function getTimelineEvent(
    status: OrderStatus,
    dispatcherName: string,
): {
    type: TimelineEventType;
    title: string;
    message: string;
} {
    if (status === OrderStatus.CONFIRMED) {
        return {
            type: TimelineEventType.ORDER_CONFIRMED,
            title: 'Order confirmed by dispatcher',
            message: `${dispatcherName} manually confirmed the order.`,
        };
    }

    if (status === OrderStatus.PREPARING) {
        return {
            type: TimelineEventType.PREPARATION_STARTED,
            title: 'Preparation marked started',
            message: `${dispatcherName} manually moved the order into preparation.`,
        };
    }

    if (status === OrderStatus.READY_FOR_PICKUP) {
        return {
            type: TimelineEventType.READY_FOR_PICKUP,
            title: 'Ready for pickup',
            message: `${dispatcherName} manually marked the order ready for pickup.`,
        };
    }

    if (status === OrderStatus.ASSIGNED) {
        return {
            type: TimelineEventType.DRIVER_ASSIGNED,
            title: 'Driver assignment confirmed',
            message: `${dispatcherName} manually confirmed the driver assignment.`,
        };
    }

    if (status === OrderStatus.ACCEPTED_BY_DRIVER) {
        return {
            type: TimelineEventType.DRIVER_ACCEPTED,
            title: 'Driver accepted',
            message: `${dispatcherName} manually marked the delivery accepted by driver.`,
        };
    }

    if (status === OrderStatus.PICKED_UP) {
        return {
            type: TimelineEventType.ORDER_PICKED_UP,
            title: 'Order picked up',
            message: `${dispatcherName} manually marked the order picked up.`,
        };
    }

    if (status === OrderStatus.ON_THE_WAY) {
        return {
            type: TimelineEventType.ORDER_ON_THE_WAY,
            title: 'Order on the way',
            message: `${dispatcherName} manually started delivery.`,
        };
    }

    if (status === OrderStatus.DELIVERED) {
        return {
            type: TimelineEventType.ORDER_DELIVERED,
            title: 'Order delivered',
            message: `${dispatcherName} manually marked the order delivered.`,
        };
    }

    return {
        type: TimelineEventType.ORDER_CANCELLED,
        title: 'Order cancelled',
        message: `${dispatcherName} manually cancelled the order.`,
    };
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ orderId: string }> },
) {
    const ipRateLimitResponse = await enforceIpRateLimit(request, adminRateLimitPolicies.dispatcherOrderMutationIp);

    if (ipRateLimitResponse) {
        return ipRateLimitResponse;
    }

    const access = await requireDispatcherPermissionForRequest(request, 'orders:manage');
    const user = access.user;

    if (!user) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (!access.allowed) {
        return NextResponse.json({ error: 'Dispatcher access required.' }, { status: 403 });
    }

    const userRateLimitResponse = await enforceUserRateLimit(
        request,
        adminRateLimitPolicies.dispatcherOrderMutationUser,
        user.id,
    );

    if (userRateLimitResponse) {
        return userRateLimitResponse;
    }

    let body: UpdateDispatcherOrderBody;

    try {
        body = await request.json() as UpdateDispatcherOrderBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { orderId } = await context.params;
    const order = await prisma.order.findUnique({
        where: {
            id: orderId,
        },
        include: {
            assignments: {
                where: {
                    cancelledAt: null,
                },
                include: {
                    driver: true,
                },
                orderBy: {
                    createdAt: 'desc',
                },
                take: 1,
            },
        },
    });

    if (!order) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (order.paymentStatus !== PaymentStatus.PAID) {
        return NextResponse.json({ error: 'Order payment has not been confirmed.' }, { status: 409 });
    }

    const now = new Date();
    const assignment = order.assignments[0] ?? null;
    const data: {
        status?: OrderStatus;
        delayStatus?: DelayStatus;
        estimatedDeliveryAt?: Date;
        confirmedAt?: Date;
        readyForPickupAt?: Date;
        pickedUpAt?: Date;
        deliveredAt?: Date;
        cancelledAt?: Date;
    } = {};
    const timelineEvents: Array<{
        type: TimelineEventType;
        title: string;
        message: string;
    }> = [];

    if (body.status !== undefined) {
        if (!isOrderStatus(body.status) || !dispatcherStatusOptions.includes(body.status)) {
            return NextResponse.json({ error: 'Invalid dispatcher status.' }, { status: 400 });
        }

        if (requiresAssignment(body.status) && !assignment) {
            return NextResponse.json({ error: 'Assign a driver before moving this order into a driver status.' }, { status: 409 });
        }

        data.status = body.status;
        Object.assign(data, getOrderTimestampData(body.status, now));
        timelineEvents.push(getTimelineEvent(body.status, user.name ?? 'Dispatcher'));
    }

    if (body.etaDeltaMinutes !== undefined) {
        if (typeof body.etaDeltaMinutes !== 'number'
            || !Number.isInteger(body.etaDeltaMinutes)
            || body.etaDeltaMinutes < -30
            || body.etaDeltaMinutes > 90
        ) {
            return NextResponse.json({ error: 'ETA adjustment must be an integer between -30 and 90 minutes.' }, { status: 400 });
        }

        data.estimatedDeliveryAt = new Date(order.estimatedDeliveryAt.getTime() + body.etaDeltaMinutes * 60 * 1000);
        timelineEvents.push({
            type: TimelineEventType.ETA_UPDATED,
            title: 'ETA updated by dispatcher',
            message: `${user.name ?? 'Dispatcher'} adjusted the ETA by ${body.etaDeltaMinutes} minutes.`,
        });
    }

    if (!data.status && !data.estimatedDeliveryAt) {
        return NextResponse.json({ error: 'No dispatcher update was provided.' }, { status: 400 });
    }

    const effectiveStatus = data.status ?? order.status;
    const effectiveEta = data.estimatedDeliveryAt ?? order.estimatedDeliveryAt;
    const nextDelayStatus = getOperationalDelayStatus(effectiveStatus, effectiveEta, now);
    data.delayStatus = nextDelayStatus;

    const updatedOrder = await prisma.$transaction(async (transaction) => {
        const updated = await transaction.order.update({
            where: {
                id: order.id,
            },
            data,
            select: {
                id: true,
                orderNumber: true,
                status: true,
                delayStatus: true,
                estimatedDeliveryAt: true,
            },
        });

        if (assignment && data.status) {
            await transaction.deliveryAssignment.update({
                where: {
                    id: assignment.id,
                },
                data: getAssignmentTimestampData(data.status, now, assignment.acceptedAt),
            });

            if (
                data.status === OrderStatus.ACCEPTED_BY_DRIVER
                || data.status === OrderStatus.PICKED_UP
                || data.status === OrderStatus.ON_THE_WAY
            ) {
                await transaction.driverProfile.update({
                    where: {
                        id: assignment.driverId,
                    },
                    data: {
                        status: DriverStatus.BUSY,
                    },
                });
            }

            if (data.status === OrderStatus.DELIVERED || data.status === OrderStatus.CANCELLED) {
                await transaction.driverProfile.update({
                    where: {
                        id: assignment.driverId,
                    },
                    data: {
                        status: DriverStatus.AVAILABLE,
                        activeDeliveryCount: assignment.driver.activeDeliveryCount > 0
                            ? {
                                decrement: 1,
                            }
                            : undefined,
                        completedDeliveryCount: data.status === OrderStatus.DELIVERED
                            ? {
                                increment: 1,
                            }
                            : undefined,
                        lateDeliveryCount: data.status === OrderStatus.DELIVERED && nextDelayStatus === DelayStatus.DELAYED
                            ? {
                                increment: 1,
                            }
                            : undefined,
                    },
                });
            }
        }

        if (timelineEvents.length > 0) {
            await transaction.orderTimelineEvent.createMany({
                data: timelineEvents.map((event) => {
                    return {
                        orderId: order.id,
                        ...event,
                    };
                }),
            });
        }

        if (nextDelayStatus === DelayStatus.DELAYED && order.delayStatus !== DelayStatus.DELAYED) {
            await transaction.delayEvent.create({
                data: {
                    orderId: order.id,
                    reason: DelayReason.UNKNOWN,
                    delayMinutes: Math.max(1, Math.ceil((now.getTime() - effectiveEta.getTime()) / 60000)),
                    message: 'Dispatcher exception handling detected a late order.',
                },
            });
        }

        if (data.status === OrderStatus.READY_FOR_PICKUP) {
            await enqueueDispatchReadyOrderJob(order.id, transaction);
        }

        if (data.status === OrderStatus.CANCELLED) {
            await enqueueRefundJob({
                orderId: order.id,
                reason: 'dispatcher_cancelled',
            }, transaction);
        }

        if (data.estimatedDeliveryAt) {
            await enqueueDelaySyncJob({
                estimatedDeliveryAt: data.estimatedDeliveryAt,
                orderId: order.id,
            }, transaction);
        }

        return updated;
    });

    return NextResponse.json({ order: updatedOrder });
}
