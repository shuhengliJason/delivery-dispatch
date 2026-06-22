'use client';

import {
    DelayStatus,
    OrderStatus,
} from '@prisma/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { signOut } from '@/lib/auth-client';
import { formatStatus } from '@/lib/order-format';
import { confirmSignOut } from '@/lib/sign-out-confirmation';

export type DispatcherDriverOption = {
    id: string;
    name: string;
    capacityLabel: string;
};

export type DispatcherExceptionOrder = {
    id: string;
    orderNumber: number;
    customerName: string;
    restaurantName: string;
    deliveryAddress: string;
    status: OrderStatus;
    delayStatus: DelayStatus;
    estimatedDeliveryAt: string;
    etaLabel: string;
    hasAssignment: boolean;
    assignedDriverName: string | null;
    latestEventAgeMinutes: number;
    delayedByMinutes: number | null;
    stuckOverMinutes: number | null;
    readyAgeMinutes: number | null;
    ownerLabel: string;
    items: Array<{
        id: string;
        quantity: number;
        name: string;
    }>;
};

type QueueKey = 'delayed' | 'atRisk' | 'unassigned' | 'stuck';

type DispatcherExceptionDashboardProps = {
    canManageUsers: boolean;
    dispatcherName: string;
    refreshedAt: string;
    drivers: DispatcherDriverOption[];
    queues: Record<QueueKey, DispatcherExceptionOrder[]>;
};

type PendingAction = 'assign' | 'status' | 'eta' | null;

const queueLabels: Record<QueueKey, string> = {
    delayed: 'Delayed',
    atRisk: 'At Risk',
    unassigned: 'Ready / No Driver',
    stuck: 'Stuck',
};

const queueDescriptions: Record<QueueKey, string> = {
    delayed: 'Past promised delivery ETA.',
    atRisk: 'Inside the ETA risk window.',
    unassigned: 'Ready for pickup with no active assignment.',
    stuck: 'No lifecycle movement beyond threshold.',
};

const statusOptions = [
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

function requiresAssignment(status: OrderStatus): boolean {
    return status === OrderStatus.ASSIGNED
        || status === OrderStatus.ACCEPTED_BY_DRIVER
        || status === OrderStatus.PICKED_UP
        || status === OrderStatus.ON_THE_WAY
        || status === OrderStatus.DELIVERED;
}

function getStatusBadgeClass(status: OrderStatus): string {
    if (status === OrderStatus.READY_FOR_PICKUP) {
        return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    }

    if (status === OrderStatus.ASSIGNED || status === OrderStatus.ACCEPTED_BY_DRIVER) {
        return 'bg-violet-50 text-violet-700 ring-violet-600/20';
    }

    if (status === OrderStatus.PICKED_UP || status === OrderStatus.ON_THE_WAY || status === OrderStatus.DELIVERED) {
        return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
    }

    if (status === OrderStatus.CANCELLED) {
        return 'bg-red-50 text-red-700 ring-red-600/20';
    }

    return 'bg-amber-50 text-amber-700 ring-amber-600/20';
}

function getDelayBadgeClass(delayStatus: DelayStatus): string {
    if (delayStatus === DelayStatus.DELAYED) {
        return 'bg-red-50 text-red-700 ring-red-600/20';
    }

    if (delayStatus === DelayStatus.AT_RISK) {
        return 'bg-orange-50 text-orange-700 ring-orange-600/20';
    }

    return 'bg-slate-100 text-slate-600 ring-slate-500/20';
}

function getPrimaryExceptionLabel(order: DispatcherExceptionOrder, queueKey: QueueKey): string {
    if (queueKey === 'delayed' && order.delayedByMinutes !== null) {
        return `Late by ${order.delayedByMinutes} min`;
    }

    if (queueKey === 'stuck' && order.stuckOverMinutes !== null) {
        return `${order.stuckOverMinutes} min over`;
    }

    if (queueKey === 'unassigned' && order.readyAgeMinutes !== null) {
        return `Ready ${order.readyAgeMinutes} min`;
    }

    return order.delayStatus === DelayStatus.NONE ? 'On Track' : formatStatus(order.delayStatus);
}

function QueueButton({
    queueKey,
    count,
    isActive,
    onClick,
}: {
    queueKey: QueueKey;
    count: number;
    isActive: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={isActive}
            className={`rounded-lg border p-5 text-left shadow-sm transition ${isActive
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-950 hover:border-slate-400'}`}
        >
            <span className={`text-sm font-medium ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                {queueLabels[queueKey]}
            </span>
            <span className="mt-3 block text-3xl font-bold">
                {count}
            </span>
            <span className={`mt-3 block text-sm ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                {queueDescriptions[queueKey]}
            </span>
        </button>
    );
}

export default function DispatcherExceptionDashboard({
    canManageUsers,
    dispatcherName,
    refreshedAt,
    drivers,
    queues,
}: DispatcherExceptionDashboardProps) {
    const router = useRouter();
    const [activeQueue, setActiveQueue] = useState<QueueKey | null>(null);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [driverId, setDriverId] = useState(drivers[0]?.id ?? '');
    const [nextStatus, setNextStatus] = useState<OrderStatus>(OrderStatus.READY_FOR_PICKUP);
    const [pendingAction, setPendingAction] = useState<PendingAction>(null);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const ordersById = useMemo(() => {
        const map = new Map<string, DispatcherExceptionOrder>();

        Object.values(queues).forEach((orders) => {
            orders.forEach((order) => {
                map.set(order.id, order);
            });
        });

        return map;
    }, [queues]);

    const selectedOrder = selectedOrderId ? ordersById.get(selectedOrderId) ?? null : null;
    const visibleOrders = activeQueue ? queues[activeQueue] : [];
    const openExceptionCount = ordersById.size;

    function openOrder(order: DispatcherExceptionOrder): void {
        setSelectedOrderId(order.id);
        setNextStatus(order.status);
        setErrorMessage(null);
    }

    function closeModal(): void {
        setSelectedOrderId(null);
        setErrorMessage(null);
        setPendingAction(null);
    }

    async function assignDriver(): Promise<void> {
        if (!selectedOrder || !driverId) {
            return;
        }

        try {
            setPendingAction('assign');
            setErrorMessage(null);

            const response = await fetch(`/api/dispatcher/orders/${selectedOrder.id}/assign`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    driverId,
                }),
            });
            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not assign driver.');
            }

            closeModal();
            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not assign driver.');
        } finally {
            setPendingAction(null);
        }
    }

    async function updateOrder(body: Record<string, unknown>, action: PendingAction): Promise<void> {
        if (!selectedOrder) {
            return;
        }

        try {
            setPendingAction(action);
            setErrorMessage(null);

            const response = await fetch(`/api/dispatcher/orders/${selectedOrder.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not update order.');
            }

            closeModal();
            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not update order.');
        } finally {
            setPendingAction(null);
        }
    }

    async function handleSignOut(): Promise<void> {
        if (!confirmSignOut()) {
            return;
        }

        try {
            setIsSigningOut(true);
            await signOut();
            router.push('/sign-in?redirectTo=/dispatcher');
            router.refresh();
        } finally {
            setIsSigningOut(false);
        }
    }

    return (
        <main className="min-h-screen bg-slate-50 p-6">
            <div className="mx-auto max-w-7xl">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500">
                            Dispatcher Workspace
                        </p>

                        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                            Ops Exception Dashboard
                        </h1>

                        <p className="mt-2 max-w-2xl text-sm text-slate-600">
                            Manual intervention only: choose an exception type, inspect the order, then assign a driver or update status from the popup.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm sm:items-end">
                        <div>
                            <span className="font-medium text-slate-950">
                                {dispatcherName}
                            </span>
                            <span className="mx-2 text-slate-300">/</span>
                            <span>Refreshed {refreshedAt}</span>
                        </div>
                        <div className="flex flex-wrap gap-3 sm:justify-end">
                            {canManageUsers && (
                                <Link
                                    href="/dispatcher/users"
                                    className="font-semibold text-slate-950 hover:underline"
                                >
                                    User management
                                </Link>
                            )}
                            <button
                                type="button"
                                disabled={isSigningOut}
                                onClick={() => {
                                    void handleSignOut();
                                }}
                                className="font-semibold text-slate-950 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                            >
                                {isSigningOut ? 'Signing out...' : 'Sign out'}
                            </button>
                        </div>
                    </div>
                </header>

                <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {(['delayed', 'atRisk', 'unassigned', 'stuck'] as QueueKey[]).map((queueKey) => {
                        return (
                            <QueueButton
                                key={queueKey}
                                queueKey={queueKey}
                                count={queues[queueKey].length}
                                isActive={activeQueue === queueKey}
                                onClick={() => {
                                    setActiveQueue(activeQueue === queueKey ? null : queueKey);
                                }}
                            />
                        );
                    })}
                </section>

                <section className="mt-8 rounded-lg border border-slate-200 bg-white shadow-sm">
                    {activeQueue === null ? (
                        <div className="p-6">
                            <h2 className="text-lg font-semibold text-slate-950">
                                {openExceptionCount === 0 ? 'All clear' : `${openExceptionCount} open exceptions`}
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Select an exception type above to open its queue.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="border-b border-slate-200 p-5">
                                <h2 className="text-lg font-semibold text-slate-950">
                                    {queueLabels[activeQueue]}
                                </h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    {queueDescriptions[activeQueue]} Click an order to handle it.
                                </p>
                            </div>

                            {visibleOrders.length === 0 ? (
                                <p className="p-5 text-sm text-slate-500">
                                    No orders in this queue right now.
                                </p>
                            ) : (
                                <div className="divide-y divide-slate-200">
                                    {visibleOrders.map((order) => {
                                        return (
                                            <button
                                                key={order.id}
                                                type="button"
                                                onClick={() => {
                                                    openOrder(order);
                                                }}
                                                className="grid w-full gap-4 p-5 text-left hover:bg-slate-50 lg:grid-cols-[1fr_220px]"
                                            >
                                                <span>
                                                    <span className="flex flex-wrap items-center gap-2">
                                                        <span className="font-semibold text-slate-950">
                                                            Order #{order.orderNumber}
                                                        </span>
                                                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${getStatusBadgeClass(order.status)}`}>
                                                            {formatStatus(order.status)}
                                                        </span>
                                                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${getDelayBadgeClass(order.delayStatus)}`}>
                                                            {getPrimaryExceptionLabel(order, activeQueue)}
                                                        </span>
                                                    </span>
                                                    <span className="mt-2 block text-sm text-slate-600">
                                                        {order.restaurantName} / {order.customerName}
                                                    </span>
                                                    <span className="mt-1 block text-sm text-slate-500">
                                                        {order.ownerLabel}
                                                    </span>
                                                </span>

                                                <span className="text-sm text-slate-600 lg:text-right">
                                                    <span className="block font-medium text-slate-950">
                                                        ETA {order.etaLabel}
                                                    </span>
                                                    <span className="mt-1 block">
                                                        Last update {order.latestEventAgeMinutes} min ago
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </section>
            </div>

            {selectedOrder && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="dispatcher-order-modal-title"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
                >
                    <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                            <div>
                                <p className="text-sm font-medium text-slate-500">
                                    Exception handling
                                </p>
                                <h2
                                    id="dispatcher-order-modal-title"
                                    className="mt-1 text-2xl font-bold text-slate-950"
                                >
                                    Order #{selectedOrder.orderNumber}
                                </h2>
                            </div>

                            <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_260px]">
                            <div>
                                <div className="flex flex-wrap gap-2">
                                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${getStatusBadgeClass(selectedOrder.status)}`}>
                                        {formatStatus(selectedOrder.status)}
                                    </span>
                                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${getDelayBadgeClass(selectedOrder.delayStatus)}`}>
                                        {selectedOrder.delayStatus === DelayStatus.NONE
                                            ? 'On Track'
                                            : formatStatus(selectedOrder.delayStatus)}
                                    </span>
                                </div>

                                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                                    <div>
                                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            Restaurant
                                        </dt>
                                        <dd className="mt-1 font-medium text-slate-950">
                                            {selectedOrder.restaurantName}
                                        </dd>
                                    </div>

                                    <div>
                                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            Customer
                                        </dt>
                                        <dd className="mt-1 font-medium text-slate-950">
                                            {selectedOrder.customerName}
                                        </dd>
                                    </div>

                                    <div>
                                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            Driver
                                        </dt>
                                        <dd className="mt-1 font-medium text-slate-950">
                                            {selectedOrder.assignedDriverName ?? 'Unassigned'}
                                        </dd>
                                    </div>

                                    <div>
                                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            ETA
                                        </dt>
                                        <dd className="mt-1 font-medium text-slate-950">
                                            {selectedOrder.etaLabel}
                                        </dd>
                                    </div>

                                    <div className="sm:col-span-2">
                                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            Delivery
                                        </dt>
                                        <dd className="mt-1 font-medium text-slate-950">
                                            {selectedOrder.deliveryAddress}
                                        </dd>
                                    </div>
                                </dl>

                                <div className="mt-6">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Items
                                    </p>
                                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                                        {selectedOrder.items.map((item) => {
                                            return (
                                                <li
                                                    key={item.id}
                                                    className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                                >
                                                    <span className="font-semibold text-slate-950">
                                                        {item.quantity}x
                                                    </span>
                                                    {' '}
                                                    {item.name}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            </div>

                            <div className="space-y-5">
                                <section>
                                    <h3 className="text-sm font-semibold text-slate-950">
                                        Assign Driver
                                    </h3>
                                    <p className="mt-1 text-xs text-slate-500">
                                        Available drivers are filtered by status and capacity.
                                    </p>

                                    {selectedOrder.hasAssignment ? (
                                        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                            Already assigned to {selectedOrder.assignedDriverName}.
                                        </p>
                                    ) : selectedOrder.status !== OrderStatus.READY_FOR_PICKUP ? (
                                        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                            Mark the order ready for pickup before assigning a driver.
                                        </p>
                                    ) : drivers.length === 0 ? (
                                        <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-700">
                                            No eligible idle drivers are available.
                                        </p>
                                    ) : (
                                        <div className="mt-3 space-y-3">
                                            <select
                                                value={driverId}
                                                disabled={pendingAction !== null}
                                                onChange={(event) => {
                                                    setDriverId(event.target.value);
                                                }}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100"
                                            >
                                                {drivers.map((driver) => {
                                                    return (
                                                        <option
                                                            key={driver.id}
                                                            value={driver.id}
                                                        >
                                                            {driver.name} ({driver.capacityLabel})
                                                        </option>
                                                    );
                                                })}
                                            </select>

                                            <button
                                                type="button"
                                                disabled={pendingAction !== null || !driverId}
                                                onClick={() => {
                                                    void assignDriver();
                                                }}
                                                className="w-full rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                                            >
                                                {pendingAction === 'assign' ? 'Assigning...' : 'Assign driver'}
                                            </button>
                                        </div>
                                    )}
                                </section>

                                <section>
                                    <h3 className="text-sm font-semibold text-slate-950">
                                        Change Status
                                    </h3>

                                    <div className="mt-3 space-y-3">
                                        <select
                                            value={nextStatus}
                                            disabled={pendingAction !== null}
                                            onChange={(event) => {
                                                setNextStatus(event.target.value as OrderStatus);
                                            }}
                                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100"
                                        >
                                            {statusOptions.map((status) => {
                                                const disabled = requiresAssignment(status) && !selectedOrder.hasAssignment;

                                                return (
                                                    <option
                                                        key={status}
                                                        value={status}
                                                        disabled={disabled}
                                                    >
                                                        {formatStatus(status)}{disabled ? ' (needs driver)' : ''}
                                                    </option>
                                                );
                                            })}
                                        </select>

                                        <button
                                            type="button"
                                            disabled={pendingAction !== null || nextStatus === selectedOrder.status}
                                            onClick={() => {
                                                void updateOrder({ status: nextStatus }, 'status');
                                            }}
                                            className="w-full rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                                        >
                                            {pendingAction === 'status' ? 'Saving...' : 'Save status'}
                                        </button>
                                    </div>
                                </section>

                                <section>
                                    <h3 className="text-sm font-semibold text-slate-950">
                                        Adjust ETA
                                    </h3>
                                    <div className="mt-3 grid grid-cols-3 gap-2">
                                        {[-5, 10, 20].map((minutes) => {
                                            return (
                                                <button
                                                    key={minutes}
                                                    type="button"
                                                    disabled={pendingAction !== null}
                                                    onClick={() => {
                                                        void updateOrder({ etaDeltaMinutes: minutes }, 'eta');
                                                    }}
                                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                                                >
                                                    {minutes > 0 ? `+${minutes}` : minutes} min
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>

                                {errorMessage && (
                                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                        {errorMessage}
                                    </p>
                                )}
                            </div>
                        </div>
                    </section>
                </div>
            )}
        </main>
    );
}
