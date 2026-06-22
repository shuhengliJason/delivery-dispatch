import {
    DelayStatus,
    DriverStatus,
    OrderStatus,
    UserRole,
} from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';

import {
    getDriverNextStatus,
    getDriverTimelineEventForStatus,
} from '@/lib/driver-workflow';
import { getOperationalDelayStatus } from '@/lib/order-realtime';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type UpdateDriverAssignmentBody = {
    status?: unknown;
};

function isOrderStatus(value: unknown): value is OrderStatus {
    return typeof value === 'string' && Object.values(OrderStatus).includes(value as OrderStatus);
}

function getStatusTimestamps(
    status: OrderStatus,
    now: Date,
    acceptedAt?: Date | null,
) {
    if (status === OrderStatus.ACCEPTED_BY_DRIVER) {
        return {
            acceptedAt: now,
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

    return {};
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ assignmentId: string }> },
) {
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
        include: {
            driverProfile: true,
        },
    });

    if (!user || user.role !== UserRole.DRIVER || !user.driverProfile) {
        return NextResponse.json({ error: 'Driver access required.' }, { status: 403 });
    }

    const driverProfile = user.driverProfile;
    const { assignmentId } = await context.params;

    let body: UpdateDriverAssignmentBody;

    try {
        body = await request.json() as UpdateDriverAssignmentBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    if (!isOrderStatus(body.status)) {
        return NextResponse.json({ error: 'Invalid order status.' }, { status: 400 });
    }

    const requestedStatus = body.status;

    const assignment = await prisma.deliveryAssignment.findUnique({
        where: {
            id: assignmentId,
        },
        include: {
            order: true,
        },
    });

    if (!assignment || assignment.driverId !== driverProfile.id) {
        return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
    }

    if (assignment.cancelledAt) {
        return NextResponse.json({ error: 'This assignment is no longer active.' }, { status: 409 });
    }

    const nextStatus = getDriverNextStatus(assignment.order.status, assignment.order.readyForPickupAt);

    if (requestedStatus !== nextStatus) {
        return NextResponse.json({ error: 'This driver status transition is not allowed.' }, { status: 409 });
    }

    const now = new Date();
    const timestampData = getStatusTimestamps(requestedStatus, now, assignment.acceptedAt);
    const timelineEvent = getDriverTimelineEventForStatus(requestedStatus);
    const nextDelayStatus = getOperationalDelayStatus(requestedStatus, assignment.order.estimatedDeliveryAt, now);

    const updatedAssignment = await prisma.$transaction(async (transaction) => {
        const updatedOrder = await transaction.order.update({
            where: {
                id: assignment.orderId,
            },
            data: {
                status: requestedStatus,
                delayStatus: nextDelayStatus,
                pickedUpAt: requestedStatus === OrderStatus.PICKED_UP || requestedStatus === OrderStatus.ON_THE_WAY
                    ? now
                    : assignment.order.pickedUpAt,
                deliveredAt: requestedStatus === OrderStatus.DELIVERED
                    ? now
                    : assignment.order.deliveredAt,
            },
            select: {
                id: true,
                orderNumber: true,
                status: true,
                delayStatus: true,
                estimatedDeliveryAt: true,
            },
        });

        const updated = await transaction.deliveryAssignment.update({
            where: {
                    id: assignment.id,
            },
            data: timestampData,
            select: {
                id: true,
                acceptedAt: true,
                pickedUpAt: true,
                deliveredAt: true,
            },
        });

        if (timelineEvent) {
            await transaction.orderTimelineEvent.create({
                data: {
                    orderId: assignment.orderId,
                    ...timelineEvent,
                },
            });
        }

        if (requestedStatus === OrderStatus.ACCEPTED_BY_DRIVER || (
            requestedStatus === OrderStatus.PICKED_UP && !assignment.acceptedAt
        )) {
            await transaction.driverProfile.update({
                where: {
                    id: driverProfile.id,
                },
                data: {
                    status: DriverStatus.BUSY,
                    activeDeliveryCount: {
                        increment: 1,
                    },
                },
            });
        }

        if (requestedStatus === OrderStatus.DELIVERED) {
            await transaction.driverProfile.update({
                where: {
                    id: driverProfile.id,
                },
                data: {
                    status: DriverStatus.AVAILABLE,
                    activeDeliveryCount: driverProfile.activeDeliveryCount > 0
                        ? {
                            decrement: 1,
                        }
                        : undefined,
                    completedDeliveryCount: {
                        increment: 1,
                    },
                    lateDeliveryCount: nextDelayStatus === DelayStatus.DELAYED
                        ? {
                            increment: 1,
                        }
                        : undefined,
                },
            });
        }

        return {
            ...updated,
            order: updatedOrder,
        };
    });

    return NextResponse.json({ assignment: updatedAssignment });
}
