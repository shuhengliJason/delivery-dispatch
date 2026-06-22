import { DelayStatus, OrderStatus, PaymentStatus, UserRole } from '@prisma/client';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/current-user';
import {
    formatCurrency,
    formatStatus,
    formatTime,
    getDelayClass,
    getStatusClass,
} from '@/lib/order-format';
import {
    getOperationalDelayStatus,
    getVendorNextStatuses,
} from '@/lib/order-realtime';
import { prisma } from '@/lib/prisma';
import { getAuthorizedRestaurantsForUser } from '@/lib/vendor-permissions';
import VendorManagementNav from './vendor-management-nav';
import VendorOrderActions from './vendor-order-actions';
import VendorSignOutButton from './vendor-sign-out-button';

export const dynamic = 'force-dynamic';

type VendorPageProps = {
    searchParams?: Promise<{
        page?: string | string[];
        queue?: string | string[];
        restaurantId?: string | string[];
    }>;
};

type VendorOrderQueue = 'incoming' | 'preparing' | 'attention' | 'completed';

const ordersPerPage = 5;

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function getVendorOrderQueue(value: string | undefined): VendorOrderQueue {
    if (value === 'preparing' || value === 'attention' || value === 'completed') {
        return value;
    }

    return 'incoming';
}

function getRequestedPage(value: string | undefined): number {
    const page = Number(value);

    return Number.isInteger(page) && page > 0 ? page : 1;
}

function getRestaurantScopedHref(pathname: string, restaurantId: string, params?: Record<string, string | number>): string {
    const searchParams = new URLSearchParams({
        restaurantId,
    });

    Object.entries(params ?? {}).forEach(([key, value]) => {
        searchParams.set(key, String(value));
    });

    return `${pathname}?${searchParams.toString()}`;
}

function canManageRestaurantStaff(staffRole: string | null | undefined): boolean {
    return staffRole === 'ADMIN' || staffRole === 'OWNER';
}

export default async function VendorPage({
    searchParams,
}: VendorPageProps) {
    const resolvedSearchParams = await searchParams;
    const requestedOrderQueueParam = getSingleSearchParam(resolvedSearchParams?.queue);
    const requestedOrderQueue = getVendorOrderQueue(requestedOrderQueueParam);
    const requestedPage = getRequestedPage(getSingleSearchParam(resolvedSearchParams?.page));
    const requestedRestaurantId = getSingleSearchParam(resolvedSearchParams?.restaurantId);
    const user = await getCurrentUser();

    if (!user) {
        redirect('/sign-in?redirectTo=/vendor');
    }

    if (user.role !== UserRole.VENDOR && user.role !== UserRole.ADMIN) {
        redirect('/sign-in?redirectTo=/vendor&switchAccount=1');
    }

    const accessibleRestaurants = await getAuthorizedRestaurantsForUser(user);
    const hasStaffManagementAccess = accessibleRestaurants.some((restaurant) => {
        return canManageRestaurantStaff(restaurant.staffRole);
    });
    const vendorRestaurants = accessibleRestaurants.filter((restaurant) => {
        return restaurant.permissions.canReadOrders;
    });

    if (vendorRestaurants.length === 0) {
        const menuRestaurant = accessibleRestaurants.find((restaurant) => {
            return restaurant.permissions.canReadMenu;
        });
        const profileRestaurant = accessibleRestaurants.find((restaurant) => {
            return restaurant.permissions.canReadProfile;
        });

        if (menuRestaurant) {
            redirect(`/vendor/dishes?restaurantId=${menuRestaurant.id}`);
        }

        if (profileRestaurant) {
            redirect(`/vendor/profile?restaurantId=${profileRestaurant.id}`);
        }
    }

    const selectedRestaurant = vendorRestaurants.find((restaurant) => {
        return restaurant.id === requestedRestaurantId;
    }) ?? (vendorRestaurants.length === 1 ? vendorRestaurants[0] : null);
    const selectedRestaurantId = selectedRestaurant?.id ?? null;

    if (vendorRestaurants.length > 1 && !selectedRestaurant) {
        return (
            <main className="min-h-screen bg-slate-50 p-6">
                <div className="mx-auto max-w-7xl">
                    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500">
                                Vendor Dashboard
                            </p>

                            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                                Select Restaurant
                            </h1>

                            <p className="mt-2 max-w-2xl text-sm text-slate-600">
                                Choose which restaurant you want to manage. Orders, dishes, and profile settings stay separated by restaurant.
                            </p>
                        </div>

                        <div className="flex flex-col gap-2 text-sm text-slate-600 sm:items-end">
                            <span className="font-medium text-slate-950">
                                {user.email}
                            </span>
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                                {hasStaffManagementAccess && (
                                    <Link
                                        href="/vendor/staff"
                                        className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                                    >
                                        Staff roles
                                    </Link>
                                )}
                                <VendorSignOutButton />
                            </div>
                        </div>
                    </header>

                    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {vendorRestaurants.map((restaurant) => {
                            return (
                                <Link
                                    key={restaurant.id}
                                    href={getRestaurantScopedHref('/vendor', restaurant.id)}
                                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                                >
                                    <p className="text-sm font-medium text-slate-500">
                                        Restaurant
                                    </p>
                                    <h2 className="mt-2 text-xl font-bold text-slate-950">
                                        {restaurant.name}
                                    </h2>
                                    <p className="mt-3 text-sm font-semibold text-slate-700">
                                        Manage orders
                                    </p>
                                    {canManageRestaurantStaff(restaurant.staffRole) && (
                                        <p className="mt-2 text-sm font-semibold text-slate-500">
                                            Staff roles available
                                        </p>
                                    )}
                                </Link>
                            );
                        })}
                    </section>
                </div>
            </main>
        );
    }

    if (requestedRestaurantId && !selectedRestaurant) {
        return (
            <main className="min-h-screen bg-slate-50 p-6">
                <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        403 Forbidden
                    </p>
                    <h1 className="mt-2 text-2xl font-bold text-slate-950">
                        You cannot view orders for this restaurant.
                    </h1>
                    <p className="mt-2 text-sm text-slate-600">
                        Ask a restaurant owner to add order access to your vendor account.
                    </p>
                </div>
            </main>
        );
    }

    const orderWhere = {
        paymentStatus: PaymentStatus.PAID,
        ...(selectedRestaurantId
            ? {
                restaurantId: selectedRestaurantId,
            }
            : user.role === UserRole.ADMIN
                ? {}
                : {
                    restaurantId: {
                        in: vendorRestaurants.map((restaurant) => {
                            return restaurant.id;
                        }),
                    },
                }),
    };

    const orderSummaries = await prisma.order.findMany({
        where: orderWhere,
        select: {
            id: true,
            status: true,
            estimatedDeliveryAt: true,
        },
        orderBy: {
            placedAt: 'desc',
        },
    });

    const attentionOrderSummaries = orderSummaries.filter((order) => {
        const delayStatus = getOperationalDelayStatus(order.status, order.estimatedDeliveryAt);
        return delayStatus === DelayStatus.DELAYED || delayStatus === DelayStatus.AT_RISK;
    });

    const attentionOrderIds = new Set(attentionOrderSummaries.map((order) => {
        return order.id;
    }));

    const incomingOrderSummaries = orderSummaries.filter((order) => {
        return !attentionOrderIds.has(order.id)
            && (order.status === OrderStatus.CREATED || order.status === OrderStatus.CONFIRMED);
    });

    const preparingOrderSummaries = orderSummaries.filter((order) => {
        return !attentionOrderIds.has(order.id)
            && (order.status === OrderStatus.PREPARING || order.status === OrderStatus.READY_FOR_PICKUP);
    });

    const completedOrderSummaries = orderSummaries.filter((order) => {
        return order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED;
    });

    const defaultOrderQueue: VendorOrderQueue = incomingOrderSummaries.length > 0
        ? 'incoming'
        : preparingOrderSummaries.length > 0
            ? 'preparing'
            : attentionOrderSummaries.length > 0
                ? 'attention'
                : completedOrderSummaries.length > 0
                    ? 'completed'
                    : 'incoming';
    const activeOrderQueue = requestedOrderQueueParam ? requestedOrderQueue : defaultOrderQueue;

    const queueOrderSummariesByType: Record<VendorOrderQueue, typeof orderSummaries> = {
        incoming: incomingOrderSummaries,
        preparing: preparingOrderSummaries,
        attention: attentionOrderSummaries,
        completed: completedOrderSummaries,
    };
    const selectedOrderSummaries = queueOrderSummariesByType[activeOrderQueue];
    const totalSelectedOrders = selectedOrderSummaries.length;
    const totalPages = Math.max(1, Math.ceil(totalSelectedOrders / ordersPerPage));
    const currentPage = Math.min(requestedPage, totalPages);
    const pageStartIndex = (currentPage - 1) * ordersPerPage;
    const selectedOrderIds = selectedOrderSummaries.slice(pageStartIndex, pageStartIndex + ordersPerPage).map((order) => {
        return order.id;
    });

    const orders = selectedOrderIds.length > 0
        ? await prisma.order.findMany({
            where: {
                id: {
                    in: selectedOrderIds,
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
                placedAt: 'desc',
            },
        })
        : [];
    const selectedQueueLabel = activeOrderQueue === 'attention'
        ? 'Needs Attention'
        : activeOrderQueue === 'completed'
            ? 'Completed'
            : activeOrderQueue === 'preparing'
                ? 'Preparing'
                : 'Incoming';
    const queueLinks: Array<{
        count: number;
        description: string;
        href: string;
        queue: VendorOrderQueue;
        title: string;
        valueClassName: string;
    }> = [
        {
            count: incomingOrderSummaries.length,
            description: 'New orders waiting for confirmation.',
            href: selectedRestaurantId ? getRestaurantScopedHref('/vendor', selectedRestaurantId, { queue: 'incoming' }) : '/vendor?queue=incoming',
            queue: 'incoming',
            title: 'Incoming',
            valueClassName: 'text-slate-950',
        },
        {
            count: preparingOrderSummaries.length,
            description: 'Confirmed orders in prep or ready for pickup.',
            href: selectedRestaurantId ? getRestaurantScopedHref('/vendor', selectedRestaurantId, { queue: 'preparing' }) : '/vendor?queue=preparing',
            queue: 'preparing',
            title: 'Preparing',
            valueClassName: 'text-blue-600',
        },
        {
            count: attentionOrderSummaries.length,
            description: 'At-risk and delayed orders to resolve first.',
            href: selectedRestaurantId ? getRestaurantScopedHref('/vendor', selectedRestaurantId, { queue: 'attention' }) : '/vendor?queue=attention',
            queue: 'attention',
            title: 'Needs Attention',
            valueClassName: 'text-orange-500',
        },
        {
            count: completedOrderSummaries.length,
            description: 'Delivered and cancelled orders for reference.',
            href: selectedRestaurantId ? getRestaurantScopedHref('/vendor', selectedRestaurantId, { queue: 'completed' }) : '/vendor?queue=completed',
            queue: 'completed',
            title: 'Completed',
            valueClassName: 'text-emerald-600',
        },
    ];
    const previousPageHref = currentPage > 1
        ? selectedRestaurantId
            ? getRestaurantScopedHref('/vendor', selectedRestaurantId, { queue: activeOrderQueue, page: currentPage - 1 })
            : `/vendor?queue=${activeOrderQueue}&page=${currentPage - 1}`
        : null;
    const nextPageHref = currentPage < totalPages
        ? selectedRestaurantId
            ? getRestaurantScopedHref('/vendor', selectedRestaurantId, { queue: activeOrderQueue, page: currentPage + 1 })
            : `/vendor?queue=${activeOrderQueue}&page=${currentPage + 1}`
        : null;

    return (
        <main className="min-h-screen bg-slate-50">
            <VendorManagementNav
                active="orders"
                description={user.role === UserRole.ADMIN
                    ? selectedRestaurant
                        ? `Admin view for ${selectedRestaurant.name}.`
                        : 'Admin view across restaurant order queues.'
                    : `Live orders for ${selectedRestaurant?.name ?? 'your restaurant'}.`}
                eyebrow="Vendor Dashboard"
                restaurantId={selectedRestaurantId}
                restaurantImageUrl={selectedRestaurant?.featureImageUrl}
                restaurantName={selectedRestaurant?.name}
                title="Restaurant Order Queue"
                userEmail={user.email}
                canViewDishes={Boolean(selectedRestaurant?.permissions.canReadMenu)}
                canViewOrders
                canViewProfile={Boolean(selectedRestaurant?.permissions.canReadProfile)}
                canManageStaff={canManageRestaurantStaff(selectedRestaurant?.staffRole)}
            />

            <div className="mx-auto max-w-7xl px-6 py-8">
                <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {queueLinks.map((queueLink) => {
                        const isSelectedQueue = activeOrderQueue === queueLink.queue;

                        return (
                            <Link
                                key={queueLink.queue}
                                href={queueLink.href}
                                aria-current={isSelectedQueue ? 'page' : undefined}
                                className={`rounded-xl border p-5 shadow-sm transition ${isSelectedQueue
                                    ? 'border-slate-950 bg-white ring-2 ring-slate-950/10'
                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'}`}
                            >
                                <p className="text-sm font-medium text-slate-500">
                                    {queueLink.title}
                                </p>
                                <p className={`mt-3 text-3xl font-bold ${queueLink.valueClassName}`}>
                                    {queueLink.count}
                                </p>
                                <p className="mt-2 text-xs text-slate-500">
                                    {queueLink.description}
                                </p>
                            </Link>
                        );
                    })}
                </section>

                <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-2 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-950">
                                {selectedQueueLabel} Orders
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Showing up to {ordersPerPage} orders per page.
                            </p>
                        </div>

                        <p className="text-sm font-medium text-slate-600">
                            {totalSelectedOrders} total
                        </p>
                    </div>

                    {orders.length === 0 ? (
                        <p className="p-5 text-sm text-slate-500">
                            No {selectedQueueLabel.toLowerCase()} orders right now.
                        </p>
                    ) : (
                        <>
                        <div className="divide-y divide-slate-200">
                            {orders.map((order) => {
                                const delayStatus = getOperationalDelayStatus(order.status, order.estimatedDeliveryAt);
                                const nextStatuses = getVendorNextStatuses(order.status);

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
                                                    {delayStatus === DelayStatus.NONE
                                                        ? 'On Track'
                                                        : formatStatus(delayStatus)}
                                                </span>
                                            </div>

                                            <p className="mt-2 text-sm text-slate-600">
                                                {order.customerNameSnapshot} · {order.restaurant.name} · ETA {formatTime(order.estimatedDeliveryAt)}
                                            </p>

                                            <p className="mt-1 text-xs text-slate-500">
                                                Delay state is calculated from the current time and this order&apos;s ETA.
                                            </p>

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
                                                Total
                                            </p>
                                            <p className="mt-1 text-xl font-bold text-slate-950">
                                                {formatCurrency(order.totalCents)}
                                            </p>
                                            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                Delivery
                                            </p>
                                            <p className="mt-1 text-sm text-slate-700">
                                                {order.deliveryAddressSnapshot}
                                            </p>

                                            {selectedRestaurant?.permissions.canUpdateOrders && (
                                                <VendorOrderActions
                                                    currentStatus={order.status}
                                                    orderId={order.id}
                                                    nextStatuses={nextStatuses}
                                                />
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                        <div className="flex flex-col gap-3 border-t border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-slate-500">
                                Page {currentPage} of {totalPages}
                            </p>

                            <div className="flex gap-2">
                                {previousPageHref ? (
                                    <Link
                                        href={previousPageHref}
                                        className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                                    >
                                        Previous
                                    </Link>
                                ) : (
                                    <span className="rounded-lg border border-slate-100 px-4 py-2 text-sm font-semibold text-slate-300">
                                        Previous
                                    </span>
                                )}

                                {nextPageHref ? (
                                    <Link
                                        href={nextPageHref}
                                        className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                                    >
                                        Next
                                    </Link>
                                ) : (
                                    <span className="rounded-lg border border-slate-100 px-4 py-2 text-sm font-semibold text-slate-300">
                                        Next
                                    </span>
                                )}
                            </div>
                        </div>
                        </>
                    )}
                </section>
            </div>
        </main>
    );
}
