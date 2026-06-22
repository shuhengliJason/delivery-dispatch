import {
    DelayReason,
    DelayStatus,
    OrderStatus,
    PaymentStatus,
    TimelineEventType,
    UserRole,
} from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';

import {
    enqueueDelaySyncJob,
    enqueueDispatchReadyOrderJob,
    enqueueRefundJob,
} from '@/jobs/enqueue';
import { auth } from '@/lib/auth';
import {
    canVendorAdjustEta,
    getOperationalDelayStatus,
    getTimelineEventForStatus,
    getVendorNextStatuses,
} from '@/lib/order-realtime';
import { prisma } from '@/lib/prisma';
import {
    adminRateLimitPolicies,
    enforceIpRateLimit,
    enforceUserRateLimit,
} from '@/lib/rate-limit';
import { requireRestaurantPermission } from '@/lib/vendor-permissions';

type UpdateOrderBody = {
    status?: unknown;
    etaDeltaMinutes?: unknown;
};

function isOrderStatus(value: unknown): value is OrderStatus {
    return typeof value === 'string' && Object.values(OrderStatus).includes(value as OrderStatus);
}

function getStatusTimestamps(status: OrderStatus, now: Date) {
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

    if (status === OrderStatus.CANCELLED) {
        return {
            cancelledAt: now,
        };
    }

    return {};
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ orderId: string }> },
) {
    const ipRateLimitResponse = await enforceIpRateLimit(request, adminRateLimitPolicies.vendorOrderMutationIp);

    if (ipRateLimitResponse) {
        return ipRateLimitResponse;
    }

    const session = await auth.api.getSession({
        headers: request.headers,
    });

    if (!session?.user) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: {
            id: session.user.id,
        },
        select: {
            id: true,
            role: true,
        },
    });

    if (!user || (user.role !== UserRole.VENDOR && user.role !== UserRole.ADMIN)) {
        return NextResponse.json({ error: 'Vendor access required.' }, { status: 403 });
    }

    const userRateLimitResponse = await enforceUserRateLimit(
        request,
        adminRateLimitPolicies.vendorOrderMutationUser,
        user.id,
    );

    if (userRateLimitResponse) {
        return userRateLimitResponse;
    }

    const { orderId } = await context.params;

    let body: UpdateOrderBody;

    try {
        body = await request.json() as UpdateOrderBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
        where: {
            id: orderId,
        },
        select: {
            id: true,
            restaurantId: true,
            delayStatus: true,
            paymentStatus: true,
            status: true,
            estimatedDeliveryAt: true,
        },
    });

    if (!order) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const permission = await requireRestaurantPermission(user, order.restaurantId, 'orders:update');

    if (!permission.knownRestaurantMember) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (!permission.allowed) {
        return NextResponse.json({ error: 'You do not have permission to update this restaurant order.' }, { status: 403 });
    }

    if (order.paymentStatus !== PaymentStatus.PAID) {
        return NextResponse.json({ error: 'Order payment has not been confirmed.' }, { status: 409 });
    }

    const now = new Date();
    const data: {
        status?: OrderStatus;
        delayStatus?: DelayStatus;
        estimatedDeliveryAt?: Date;
        confirmedAt?: Date;
        readyForPickupAt?: Date;
        cancelledAt?: Date;
    } = {};
    const timelineEvents: Array<{
        type: TimelineEventType;
        title: string;
        message: string;
    }> = [];

    if (body.status !== undefined) {
        if (!isOrderStatus(body.status)) {
            return NextResponse.json({ error: 'Invalid order status.' }, { status: 400 });
        }

        const allowedStatuses = getVendorNextStatuses(order.status);

        if (!allowedStatuses.includes(body.status)) {
            return NextResponse.json({ error: 'This vendor status transition is not allowed.' }, { status: 409 });
        }

        const event = getTimelineEventForStatus(body.status);

        data.status = body.status;
        Object.assign(data, getStatusTimestamps(body.status, now));

        if (event) {
            timelineEvents.push(event);
        }
    }

    if (body.etaDeltaMinutes !== undefined) {
        if (!canVendorAdjustEta(order.status)) {
            return NextResponse.json({ error: 'ETA can only be adjusted before an order is ready for pickup.' }, { status: 409 });
        }

        if (typeof body.etaDeltaMinutes !== 'number'
            || !Number.isInteger(body.etaDeltaMinutes)
            || body.etaDeltaMinutes < -30
            || body.etaDeltaMinutes > 60
        ) {
            return NextResponse.json({ error: 'ETA adjustment must be an integer between -30 and 60 minutes.' }, { status: 400 });
        }

        data.estimatedDeliveryAt = new Date(order.estimatedDeliveryAt.getTime() + body.etaDeltaMinutes * 60 * 1000);
        timelineEvents.push({
            type: TimelineEventType.ETA_UPDATED,
            title: 'ETA updated',
            message: `Restaurant adjusted the ETA by ${body.etaDeltaMinutes} minutes.`,
        });
    }

    const effectiveStatus = data.status ?? order.status;
    const effectiveEta = data.estimatedDeliveryAt ?? order.estimatedDeliveryAt;
    const computedDelayStatus = getOperationalDelayStatus(effectiveStatus, effectiveEta, now);
    data.delayStatus = computedDelayStatus;

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

        if (computedDelayStatus === DelayStatus.DELAYED && order.delayStatus !== DelayStatus.DELAYED) {
            await transaction.delayEvent.create({
                data: {
                    orderId: order.id,
                    reason: DelayReason.RESTAURANT_RUNNING_LATE,
                    delayMinutes: Math.max(1, Math.ceil((now.getTime() - effectiveEta.getTime()) / 60000)),
                    message: 'Order ETA has passed before completion.',
                },
            });
        }

        if (data.status === OrderStatus.READY_FOR_PICKUP) {
            await enqueueDispatchReadyOrderJob(order.id, transaction);
        }

        if (data.status === OrderStatus.CANCELLED) {
            await enqueueRefundJob({
                orderId: order.id,
                reason: 'vendor_cancelled',
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
