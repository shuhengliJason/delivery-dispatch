import {
    DriverStatus,
    OrderStatus,
    PaymentStatus,
    TimelineEventType,
} from '@prisma/client';

import {
    activeDriverOrderStatuses,
    canDriverAcceptMoreDeliveries,
} from '@/lib/driver-capacity';
import { enqueueOrderNotificationJob } from '@/jobs/enqueue';
import { prisma } from '@/lib/prisma';

type AssignmentSource = 'background_dispatch' | 'dispatcher_manual' | 'driver_claim';

type AssignmentResult = {
    assigned: true;
    assignmentId: string;
    driverId: string;
} | {
    assigned: false;
    reason:
        | 'ORDER_NOT_FOUND'
        | 'ORDER_NOT_READY'
        | 'PAYMENT_NOT_CONFIRMED'
        | 'ORDER_ALREADY_ASSIGNED'
        | 'NO_AVAILABLE_DRIVER';
};

type DriverCandidate = {
    activeDeliveryCount: number;
    assignments: Array<{
        id: string;
    }>;
    id: string;
    status: DriverStatus;
    user: {
        name: string;
    };
};

function getActiveDeliveryCount(driver: DriverCandidate): number {
    return Math.max(driver.activeDeliveryCount, driver.assignments.length);
}

function sortDriversByDispatchPriority(
    first: DriverCandidate,
    second: DriverCandidate,
): number {
    return getActiveDeliveryCount(first) - getActiveDeliveryCount(second)
        || first.user.name.localeCompare(second.user.name)
        || first.id.localeCompare(second.id);
}

function getAssignmentMessage(
    source: AssignmentSource,
    driverName: string,
    actorName?: string,
): string {
    if (source === 'driver_claim') {
        return `${driverName} claimed this ready pickup.`;
    }

    if (source === 'dispatcher_manual') {
        return `${driverName} was assigned to this order by ${actorName ?? 'Dispatcher'}.`;
    }

    return `${driverName} was automatically assigned to this order.`;
}

export async function assignDriverToReadyOrder(input: {
    actorName?: string;
    driverId: string;
    orderId: string;
    source: AssignmentSource;
}): Promise<AssignmentResult> {
    const [order, driver] = await Promise.all([
        prisma.order.findUnique({
            where: {
                id: input.orderId,
            },
            include: {
                assignments: {
                    where: {
                        cancelledAt: null,
                    },
                    select: {
                        id: true,
                    },
                },
            },
        }),
        prisma.driverProfile.findUnique({
            where: {
                id: input.driverId,
            },
            include: {
                assignments: {
                    where: {
                        cancelledAt: null,
                        order: {
                            status: {
                                in: activeDriverOrderStatuses,
                            },
                        },
                    },
                    select: {
                        id: true,
                    },
                },
                user: {
                    select: {
                        name: true,
                    },
                },
            },
        }),
    ]);

    if (!order) {
        return {
            assigned: false,
            reason: 'ORDER_NOT_FOUND',
        };
    }

    if (order.status !== OrderStatus.READY_FOR_PICKUP) {
        return {
            assigned: false,
            reason: 'ORDER_NOT_READY',
        };
    }

    if (order.paymentStatus !== PaymentStatus.PAID) {
        return {
            assigned: false,
            reason: 'PAYMENT_NOT_CONFIRMED',
        };
    }

    if (order.assignments.length > 0) {
        return {
            assigned: false,
            reason: 'ORDER_ALREADY_ASSIGNED',
        };
    }

    if (!driver || !canDriverAcceptMoreDeliveries({
        activeDeliveryCount: getActiveDeliveryCount(driver),
        status: driver.status,
    })) {
        return {
            assigned: false,
            reason: 'NO_AVAILABLE_DRIVER',
        };
    }

    return createReadyOrderAssignment({
        actorName: input.actorName,
        driver,
        orderId: order.id,
        source: input.source,
    });
}

async function createReadyOrderAssignment(input: {
    actorName?: string;
    driver: DriverCandidate;
    orderId: string;
    source: AssignmentSource;
}): Promise<AssignmentResult> {
    const assignment = await prisma.$transaction(async (transaction) => {
        const createdAssignment = await transaction.deliveryAssignment.create({
            data: {
                driverId: input.driver.id,
                orderId: input.orderId,
            },
            select: {
                driverId: true,
                id: true,
                orderId: true,
            },
        });

        await transaction.order.update({
            where: {
                id: input.orderId,
            },
            data: {
                status: OrderStatus.ASSIGNED,
            },
        });

        await transaction.driverProfile.update({
            where: {
                id: input.driver.id,
            },
            data: {
                status: input.driver.status === DriverStatus.AVAILABLE
                    ? DriverStatus.ASSIGNED
                    : input.driver.status,
            },
        });

        await transaction.orderTimelineEvent.create({
            data: {
                orderId: input.orderId,
                type: TimelineEventType.DRIVER_ASSIGNED,
                title: 'Driver assigned',
                message: getAssignmentMessage(input.source, input.driver.user.name, input.actorName),
                metadata: {
                    assignmentSource: input.source,
                },
            },
        });
        await enqueueOrderNotificationJob({
            kind: 'DRIVER_ASSIGNED',
            orderId: input.orderId,
        }, transaction);

        return createdAssignment;
    });

    return {
        assigned: true,
        assignmentId: assignment.id,
        driverId: assignment.driverId,
    };
}

export async function assignBestDriverToReadyOrder(orderId: string): Promise<AssignmentResult> {
    const order = await prisma.order.findUnique({
        where: {
            id: orderId,
        },
        include: {
            assignments: {
                where: {
                    cancelledAt: null,
                },
                select: {
                    id: true,
                },
            },
        },
    });

    if (!order) {
        return {
            assigned: false,
            reason: 'ORDER_NOT_FOUND',
        };
    }

    if (order.status !== OrderStatus.READY_FOR_PICKUP) {
        return {
            assigned: false,
            reason: 'ORDER_NOT_READY',
        };
    }

    if (order.paymentStatus !== PaymentStatus.PAID) {
        return {
            assigned: false,
            reason: 'PAYMENT_NOT_CONFIRMED',
        };
    }

    if (order.assignments.length > 0) {
        return {
            assigned: false,
            reason: 'ORDER_ALREADY_ASSIGNED',
        };
    }

    const drivers = await prisma.driverProfile.findMany({
        include: {
            assignments: {
                where: {
                    cancelledAt: null,
                    order: {
                        status: {
                            in: activeDriverOrderStatuses,
                        },
                    },
                },
                select: {
                    id: true,
                },
            },
            user: {
                select: {
                    name: true,
                },
            },
        },
        orderBy: [
            {
                activeDeliveryCount: 'asc',
            },
            {
                updatedAt: 'asc',
            },
        ],
    });

    const driver = drivers
        .filter((candidate) => {
            return canDriverAcceptMoreDeliveries({
                activeDeliveryCount: getActiveDeliveryCount(candidate),
                status: candidate.status,
            });
        })
        .sort(sortDriversByDispatchPriority)[0];

    if (!driver) {
        return {
            assigned: false,
            reason: 'NO_AVAILABLE_DRIVER',
        };
    }

    return createReadyOrderAssignment({
        driver,
        orderId: order.id,
        source: 'background_dispatch',
    });
}
