import {
    DriverStatus,
    OrderStatus,
    PaymentStatus,
    UserRole,
} from '@prisma/client';
import { redirect } from 'next/navigation';

import DriverAssignmentActions from './driver-assignment-actions';
import DriverPickupClaimActions from './driver-pickup-claim-actions';
import DriverSignOutButton from './driver-sign-out-button';
import {
    formatCurrency,
    formatStatus,
    formatTime,
    getDelayClass,
    getStatusClass,
} from '@/lib/order-format';
import {
    getDriverNextStatus,
    getDriverStatusLabel,
} from '@/lib/driver-workflow';
import {
    canDriverAcceptMoreDeliveries,
    getDriverCapacityLabel,
    maxActiveDriverDeliveries,
} from '@/lib/driver-capacity';
import { getOperationalDelayStatus } from '@/lib/order-realtime';
import { getCurrentUser } from '@/lib/current-user';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function formatMetric(value: number): string {
    return new Intl.NumberFormat('en-CA').format(value);
}

function formatEnumLabel(value: string): string {
    return value
        .toLowerCase()
        .split('_')
        .map((word) => {
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

function DriverAccessDenied() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
            <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                <p className="text-sm font-medium text-slate-500">
                    Driver App
                </p>

                <h1 className="mt-1 text-2xl font-bold text-slate-950">
                    Driver access required
                </h1>

                <p className="mt-3 text-sm text-slate-600">
                    Your driver account is missing a driver profile. Ask an administrator to finish provisioning it.
                </p>

                <div className="mt-6 flex items-center justify-center gap-3 text-sm text-slate-600">
                    <DriverSignOutButton />
                </div>
            </section>
        </main>
    );
}

export default async function DriverPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect('/sign-in?redirectTo=/driver');
    }

    if (user.role !== UserRole.DRIVER) {
        redirect('/sign-in?redirectTo=/driver&switchAccount=1');
    }

    if (!user.driverProfile) {
        return <DriverAccessDenied />;
    }

    const assignments = await prisma.deliveryAssignment.findMany({
        where: {
            driverId: user.driverProfile.id,
            cancelledAt: null,
        },
        include: {
            order: {
                include: {
                    items: {
                        orderBy: {
                            createdAt: 'asc',
                        },
                    },
                    restaurant: true,
                },
            },
        },
        orderBy: {
            createdAt: 'desc',
        },
        take: 20,
    });

    const availablePickupOrders = await prisma.order.findMany({
        where: {
            status: OrderStatus.READY_FOR_PICKUP,
            paymentStatus: PaymentStatus.PAID,
            assignments: {
                none: {
                    cancelledAt: null,
                },
            },
        },
        include: {
            items: {
                orderBy: {
                    createdAt: 'asc',
                },
            },
            restaurant: true,
        },
        orderBy: {
            readyForPickupAt: 'asc',
        },
        take: 10,
    });

    const activeAssignments = assignments.filter((assignment) => {
        return assignment.order.status !== OrderStatus.DELIVERED
            && assignment.order.status !== OrderStatus.CANCELLED;
    });
    const completedAssignments = assignments.filter((assignment) => {
        return assignment.order.status === OrderStatus.DELIVERED;
    });
    const canClaimPickup = canDriverAcceptMoreDeliveries({
        status: user.driverProfile.status,
        activeDeliveryCount: activeAssignments.length,
    });
    const claimDisabledReason = user.driverProfile.status === DriverStatus.OFFLINE
        ? 'Go online before claiming pickups.'
        : activeAssignments.length >= maxActiveDriverDeliveries
            ? `Capacity reached: ${getDriverCapacityLabel(activeAssignments.length)} active deliveries.`
            : null;

    return (
        <main className="min-h-screen bg-slate-50 p-6">
            <div className="mx-auto max-w-7xl">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500">
                            Driver App
                        </p>

                        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                            My Deliveries
                        </h1>

                        <p className="mt-2 max-w-2xl text-sm text-slate-600">
                            Authenticated driver workspace for assigned deliveries and status updates.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 text-sm text-slate-600 sm:items-end">
                        <span className="font-medium text-slate-950">
                            {user.name}
                        </span>
                        <span>{user.email}</span>
                        <DriverSignOutButton />
                    </div>
                </header>

                <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">
                            Driver Status
                        </p>
                        <p className="mt-3 text-2xl font-bold text-slate-950">
                            {formatEnumLabel(user.driverProfile.status)}
                        </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">
                            Active Deliveries
                        </p>
                        <p className="mt-3 text-3xl font-bold text-blue-600">
                            {getDriverCapacityLabel(activeAssignments.length)}
                        </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">
                            Completed
                        </p>
                        <p className="mt-3 text-3xl font-bold text-green-600">
                            {formatMetric(user.driverProfile.completedDeliveryCount)}
                        </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">
                            Late Deliveries
                        </p>
                        <p className="mt-3 text-3xl font-bold text-orange-500">
                            {formatMetric(user.driverProfile.lateDeliveryCount)}
                        </p>
                    </div>
                </section>

                <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 p-5">
                        <h2 className="text-lg font-semibold text-slate-950">
                            Available Pickups
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Ready orders that have not been claimed by a driver yet.
                        </p>
                    </div>

                    {availablePickupOrders.length === 0 ? (
                        <p className="p-5 text-sm text-slate-500">
                            No ready pickups are available right now.
                        </p>
                    ) : (
                        <div className="divide-y divide-slate-200">
                            {availablePickupOrders.map((order) => {
                                const delayStatus = getOperationalDelayStatus(order.status, order.estimatedDeliveryAt);

                                return (
                                    <article
                                        key={order.id}
                                        className="grid gap-5 p-5 lg:grid-cols-[1fr_260px]"
                                    >
                                        <div>
                                            <div className="flex flex-wrap items-center gap-3">
                                                <h3 className="text-base font-bold text-slate-950">
                                                    Order #{order.orderNumber}
                                                </h3>

                                                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${getStatusClass(order.status)}`}>
                                                    {formatStatus(order.status)}
                                                </span>

                                                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${getDelayClass(delayStatus)}`}>
                                                    {delayStatus === 'NONE'
                                                        ? 'On Track'
                                                        : formatStatus(delayStatus)}
                                                </span>
                                            </div>

                                            <p className="mt-2 text-sm text-slate-600">
                                                {order.restaurant.name} / ETA {formatTime(order.estimatedDeliveryAt)}
                                            </p>

                                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                                <div>
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                        Pickup
                                                    </p>
                                                    <p className="mt-1 text-sm font-medium text-slate-950">
                                                        {order.restaurantNameSnapshot}
                                                    </p>
                                                </div>

                                                <div>
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                        Dropoff
                                                    </p>
                                                    <p className="mt-1 text-sm font-medium text-slate-950">
                                                        {order.deliveryAddressSnapshot}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-lg bg-slate-50 p-4">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                Customer
                                            </p>
                                            <p className="mt-1 text-sm font-medium text-slate-950">
                                                {order.customerNameSnapshot}
                                            </p>

                                            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                Total
                                            </p>
                                            <p className="mt-1 text-xl font-bold text-slate-950">
                                                {formatCurrency(order.totalCents)}
                                            </p>

                                            <DriverPickupClaimActions
                                                orderId={order.id}
                                                canClaim={canClaimPickup}
                                                disabledReason={claimDisabledReason}
                                            />
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 p-5">
                            <h2 className="text-lg font-semibold text-slate-950">
                                Active Assignments
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Only deliveries assigned to your authenticated driver profile are shown.
                            </p>
                        </div>

                        {activeAssignments.length === 0 ? (
                            <p className="p-5 text-sm text-slate-500">
                                No active assignments right now.
                            </p>
                        ) : (
                            <div className="divide-y divide-slate-200">
                                {activeAssignments.map((assignment) => {
                                    const order = assignment.order;
                                    const delayStatus = getOperationalDelayStatus(order.status, order.estimatedDeliveryAt);
                                    const nextStatus = getDriverNextStatus(order.status, order.readyForPickupAt);

                                    return (
                                        <article
                                            key={assignment.id}
                                            className="grid gap-5 p-5 lg:grid-cols-[1fr_260px]"
                                        >
                                            <div>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <h3 className="text-base font-bold text-slate-950">
                                                        Order #{order.orderNumber}
                                                    </h3>

                                                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${getStatusClass(order.status)}`}>
                                                        {formatStatus(order.status)}
                                                    </span>

                                                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${getDelayClass(delayStatus)}`}>
                                                        {delayStatus === 'NONE'
                                                            ? 'On Track'
                                                            : formatStatus(delayStatus)}
                                                    </span>
                                                </div>

                                                <p className="mt-2 text-sm text-slate-600">
                                                    {order.restaurant.name} / ETA {formatTime(order.estimatedDeliveryAt)}
                                                </p>

                                                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                                    <div>
                                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                            Pickup
                                                        </p>
                                                        <p className="mt-1 text-sm font-medium text-slate-950">
                                                            {order.restaurantNameSnapshot}
                                                        </p>
                                                    </div>

                                                    <div>
                                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                            Dropoff
                                                        </p>
                                                        <p className="mt-1 text-sm font-medium text-slate-950">
                                                            {order.deliveryAddressSnapshot}
                                                        </p>
                                                    </div>
                                                </div>

                                                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                                                    {order.items.map((item) => {
                                                        return (
                                                            <li
                                                                key={item.id}
                                                                className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                                            >
                                                                <span className="font-semibold text-slate-950">
                                                                    {item.quantity}x
                                                                </span>
                                                                {' '}
                                                                {item.nameSnapshot}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>

                                            <div className="rounded-lg bg-slate-50 p-4">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                    Customer
                                                </p>
                                                <p className="mt-1 text-sm font-medium text-slate-950">
                                                    {order.customerNameSnapshot}
                                                </p>

                                                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                    Total
                                                </p>
                                                <p className="mt-1 text-xl font-bold text-slate-950">
                                                    {formatCurrency(order.totalCents)}
                                                </p>

                                                <DriverAssignmentActions
                                                    assignmentId={assignment.id}
                                                    nextStatus={nextStatus}
                                                    label={nextStatus ? getDriverStatusLabel(nextStatus) : 'No action available'}
                                                />
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">
                            Driver Profile
                        </p>

                        <h2 className="mt-1 text-xl font-bold text-slate-950">
                            {user.name}
                        </h2>

                        <dl className="mt-6 space-y-4">
                            <div>
                                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Phone
                                </dt>
                                <dd className="mt-1 text-sm font-medium text-slate-950">
                                    {user.driverProfile.phone ?? 'Not provided'}
                                </dd>
                            </div>

                            <div>
                                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Current Location
                                </dt>
                                <dd className="mt-1 text-sm font-medium text-slate-950">
                                    {user.driverProfile.currentLatitude && user.driverProfile.currentLongitude
                                        ? `${user.driverProfile.currentLatitude.toFixed(4)}, ${user.driverProfile.currentLongitude.toFixed(4)}`
                                        : 'Not available'}
                                </dd>
                            </div>

                            <div>
                                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Recent Completed Assignments
                                </dt>
                                <dd className="mt-2 space-y-2">
                                    {completedAssignments.length === 0 ? (
                                        <p className="text-sm text-slate-500">
                                            No completed assignments in this view.
                                        </p>
                                    ) : completedAssignments.map((assignment) => {
                                        return (
                                            <p
                                                key={assignment.id}
                                                className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                            >
                                                Order #{assignment.order.orderNumber} / {formatCurrency(assignment.order.totalCents)}
                                            </p>
                                        );
                                    })}
                                </dd>
                            </div>
                        </dl>
                    </aside>
                </section>
            </div>
        </main>
    );
}
