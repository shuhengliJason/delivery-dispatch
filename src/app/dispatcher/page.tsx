import {
    DelayStatus,
    OrderStatus,
    PaymentStatus,
    UserRole,
} from '@prisma/client';
import { redirect } from 'next/navigation';

import DispatcherExceptionDashboard from './dispatcher-exception-dashboard';
import {
    canManageDispatcherOrdersFromDatabase,
    canManageDispatcherUsersFromDatabase,
} from '@/lib/dispatcher-permissions';
import {
    activeDriverOrderStatuses,
    canDriverAcceptMoreDeliveries,
    getDriverCapacityLabel,
} from '@/lib/driver-capacity';
import { getCurrentUser } from '@/lib/current-user';
import { formatTime } from '@/lib/order-format';
import { getOperationalDelayStatus } from '@/lib/order-realtime';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const stuckThresholdMinutesByStatus: Partial<Record<OrderStatus, number>> = {
    [OrderStatus.CREATED]: 15,
    [OrderStatus.CONFIRMED]: 20,
    [OrderStatus.PREPARING]: 35,
    [OrderStatus.READY_FOR_PICKUP]: 10,
    [OrderStatus.ASSIGNED]: 15,
    [OrderStatus.ACCEPTED_BY_DRIVER]: 15,
    [OrderStatus.PICKED_UP]: 20,
    [OrderStatus.ON_THE_WAY]: 35,
};

function minutesAgo(date: Date): number {
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

function minutesPast(date: Date): number {
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

function getStuckThresholdMinutes(status: OrderStatus): number | null {
    return stuckThresholdMinutesByStatus[status] ?? null;
}

function getInterventionOwner(status: OrderStatus, driverName: string | null): string {
    if (driverName) {
        return `Driver: ${driverName}`;
    }

    if (status === OrderStatus.READY_FOR_PICKUP) {
        return 'Dispatcher: assign pickup';
    }

    if (
        status === OrderStatus.CREATED
        || status === OrderStatus.CONFIRMED
        || status === OrderStatus.PREPARING
    ) {
        return 'Restaurant follow-up';
    }

    return 'Dispatcher review';
}

export default async function DispatcherPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect('/sign-in?redirectTo=/dispatcher');
    }

    if (user.role !== UserRole.DISPATCHER && user.role !== UserRole.ADMIN) {
        redirect('/sign-in?redirectTo=/dispatcher&switchAccount=1');
    }

    const [canManageOrders, canManageUsers] = await Promise.all([
        canManageDispatcherOrdersFromDatabase(user),
        canManageDispatcherUsersFromDatabase(user),
    ]);

    if (!canManageOrders) {
        if (canManageUsers) {
            redirect('/dispatcher/users');
        }

        redirect('/sign-in?redirectTo=/dispatcher&switchAccount=1');
    }

    const [orders, drivers] = await Promise.all([
        prisma.order.findMany({
            where: {
                paymentStatus: PaymentStatus.PAID,
                status: {
                    notIn: [
                        OrderStatus.DELIVERED,
                        OrderStatus.CANCELLED,
                    ],
                },
            },
            include: {
                items: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
                restaurant: true,
                assignments: {
                    where: {
                        cancelledAt: null,
                    },
                    include: {
                        driver: {
                            include: {
                                user: true,
                            },
                        },
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                },
                timelineEvents: {
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: 1,
                },
            },
            orderBy: [
                {
                    estimatedDeliveryAt: 'asc',
                },
                {
                    placedAt: 'asc',
                },
            ],
            take: 80,
        }),
        prisma.driverProfile.findMany({
            include: {
                user: true,
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
            },
            orderBy: {
                user: {
                    name: 'asc',
                },
            },
        }),
    ]);

    const driverOptions = drivers
        .filter((driver) => {
            return canDriverAcceptMoreDeliveries({
                status: driver.status,
                activeDeliveryCount: driver.assignments.length,
            });
        })
        .map((driver) => {
            return {
                id: driver.id,
                name: driver.user.name,
                capacityLabel: getDriverCapacityLabel(driver.assignments.length),
            };
        });

    const delayedOrders = orders.filter((order) => {
        return getOperationalDelayStatus(order.status, order.estimatedDeliveryAt) === DelayStatus.DELAYED;
    });

    const atRiskOrders = orders.filter((order) => {
        return getOperationalDelayStatus(order.status, order.estimatedDeliveryAt) === DelayStatus.AT_RISK;
    });

    const unassignedReadyPickups = orders.filter((order) => {
        return order.status === OrderStatus.READY_FOR_PICKUP && order.assignments.length === 0;
    });

    const stuckOrders = orders.filter((order) => {
        const thresholdMinutes = getStuckThresholdMinutes(order.status);
        const latestEventAt = order.timelineEvents[0]?.createdAt ?? order.placedAt;

        return thresholdMinutes !== null && minutesAgo(latestEventAt) >= thresholdMinutes;
    });

    const toExceptionOrder = (order: (typeof orders)[number]) => {
        const assignment = order.assignments[0] ?? null;
        const latestEventAt = order.timelineEvents[0]?.createdAt ?? order.placedAt;
        const thresholdMinutes = getStuckThresholdMinutes(order.status);
        const latestEventAgeMinutes = minutesAgo(latestEventAt);
        const readyAgeMinutes = order.status === OrderStatus.READY_FOR_PICKUP
            ? minutesAgo(order.readyForPickupAt ?? latestEventAt)
            : null;

        return {
            id: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customerNameSnapshot,
            restaurantName: order.restaurant.name,
            deliveryAddress: order.deliveryAddressSnapshot,
            status: order.status,
            delayStatus: getOperationalDelayStatus(order.status, order.estimatedDeliveryAt),
            estimatedDeliveryAt: order.estimatedDeliveryAt.toISOString(),
            etaLabel: formatTime(order.estimatedDeliveryAt),
            hasAssignment: Boolean(assignment),
            assignedDriverName: assignment?.driver.user.name ?? null,
            latestEventAgeMinutes,
            delayedByMinutes: getOperationalDelayStatus(order.status, order.estimatedDeliveryAt) === DelayStatus.DELAYED
                ? minutesPast(order.estimatedDeliveryAt)
                : null,
            stuckOverMinutes: thresholdMinutes !== null && latestEventAgeMinutes >= thresholdMinutes
                ? latestEventAgeMinutes - thresholdMinutes
                : null,
            readyAgeMinutes,
            ownerLabel: getInterventionOwner(order.status, assignment?.driver.user.name ?? null),
            items: order.items.map((item) => {
                return {
                    id: item.id,
                    quantity: item.quantity,
                    name: item.nameSnapshot,
                };
            }),
        };
    };

    const refreshedAt = new Intl.DateTimeFormat('en-CA', {
        hour: 'numeric',
        minute: '2-digit',
    }).format(new Date());

    return (
        <DispatcherExceptionDashboard
            canManageUsers={canManageUsers}
            dispatcherName={user.name}
            refreshedAt={refreshedAt}
            drivers={driverOptions}
            queues={{
                delayed: delayedOrders.map(toExceptionOrder),
                atRisk: atRiskOrders.map(toExceptionOrder),
                unassigned: unassignedReadyPickups.map(toExceptionOrder),
                stuck: stuckOrders.map(toExceptionOrder),
            }}
        />
    );
}
