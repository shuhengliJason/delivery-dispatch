'use client';

import { usePathname } from 'next/navigation';

import CustomerApp from './customer-app';

type CustomerOrderingView = 'home' | 'restaurant' | 'orders' | 'history';

/**
 * Translates the current URL into the view props expected by CustomerApp.
 *
 * This is what lets `/customer/orders` and `/customer/vendors/:id` keep using
 * the same mounted customer shell instead of remounting the whole page.
 */
function getOrderingRouteState(pathname: string): {
    restaurantId: string | null;
    view: CustomerOrderingView;
} {
    const normalizedPathname = pathname.endsWith('/') && pathname !== '/'
        ? pathname.slice(0, -1)
        : pathname;

    if (normalizedPathname === '/customer/orders') {
        return {
            restaurantId: null,
            view: 'orders',
        };
    }

    if (normalizedPathname === '/customer/order-history') {
        return {
            restaurantId: null,
            view: 'history',
        };
    }

    const vendorMatch = normalizedPathname.match(/^\/customer\/vendors\/([^/]+)$/);

    if (vendorMatch) {
        return {
            restaurantId: decodeURIComponent(vendorMatch[1]),
            view: 'restaurant',
        };
    }

    return {
        restaurantId: null,
        view: 'home',
    };
}

/**
 * Persistent client shell for customer ordering routes.
 *
 * The route pages still do server-side auth, but this component survives tab
 * navigation and updates CustomerApp based on the URL.
 */
export default function CustomerOrderingShell() {
    const pathname = usePathname();
    const routeState = getOrderingRouteState(pathname);

    return (
        <CustomerApp
            initialRestaurantId={routeState.restaurantId}
            view={routeState.view}
        />
    );
}
