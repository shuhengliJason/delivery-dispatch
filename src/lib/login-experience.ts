export type LoginExperienceKey = 'customer' | 'vendor' | 'driver' | 'dispatcher';

export type LoginExperience = {
    key: LoginExperienceKey;
    title: string;
    eyebrow: string;
    purpose: string;
    description: string;
    imagePath: string;
    iconPath: string;
    emailPlaceholder: string;
    demoEmail: string;
    accentClass: string;
    panelClass: string;
    ringClass: string;
    bullets: string[];
};

export const loginExperiences: Record<LoginExperienceKey, LoginExperience> = {
    customer: {
        key: 'customer',
        title: 'Customer ordering',
        eyebrow: 'Customer App',
        purpose: 'Find restaurants, place orders, and track delivery progress.',
        description: 'Use this entrance for the diner journey: restaurant selection, cart checkout, delivery address, and live order timeline.',
        imagePath: '/auth/customer-feature.svg',
        iconPath: '/auth/customer-icon.svg',
        emailPlaceholder: 'sarah.chen@example.com',
        demoEmail: 'sarah.chen@example.com',
        accentClass: 'bg-emerald-600',
        panelClass: 'from-emerald-50 via-white to-sky-50',
        ringClass: 'ring-emerald-600/20',
        bullets: [
            'Browse restaurants',
            'Place delivery orders',
            'Track timeline updates',
        ],
    },
    vendor: {
        key: 'vendor',
        title: 'Restaurant operations',
        eyebrow: 'Vendor Portal',
        purpose: 'Confirm orders, manage preparation, and mark food ready for pickup.',
        description: 'Use this entrance for restaurant staff. Each vendor only sees orders for their own restaurant.',
        imagePath: '/auth/vendor-feature.svg',
        iconPath: '/auth/vendor-icon.svg',
        emailPlaceholder: 'vendor@example.com',
        demoEmail: 'vendor@example.com',
        accentClass: 'bg-amber-500',
        panelClass: 'from-amber-50 via-white to-lime-50',
        ringClass: 'ring-amber-500/25',
        bullets: [
            'Confirm incoming orders',
            'Update prep status',
            'Protect restaurant ownership',
        ],
    },
    driver: {
        key: 'driver',
        title: 'Driver workspace',
        eyebrow: 'Driver App',
        purpose: 'Claim ready pickups, batch active deliveries, and complete dropoffs.',
        description: 'Use this entrance for couriers. Drivers see their own assignments and claimable ready pickups.',
        imagePath: '/auth/driver-feature.svg',
        iconPath: '/auth/driver-icon.svg',
        emailPlaceholder: 'alex.driver@example.com',
        demoEmail: 'alex.driver@example.com',
        accentClass: 'bg-blue-600',
        panelClass: 'from-blue-50 via-white to-cyan-50',
        ringClass: 'ring-blue-600/20',
        bullets: [
            'Claim ready pickups',
            'Respect capacity limits',
            'Update delivery status',
        ],
    },
    dispatcher: {
        key: 'dispatcher',
        title: 'Ops exception desk',
        eyebrow: 'Dispatcher Console',
        purpose: 'Watch late, stuck, unclaimed, and capacity-risk orders.',
        description: 'Use this entrance for internal operations. Dispatch is for exceptions, not the happy path.',
        imagePath: '/auth/dispatcher-feature.svg',
        iconPath: '/auth/dispatcher-icon.svg',
        emailPlaceholder: 'dispatcher@example.com',
        demoEmail: 'dispatcher@example.com',
        accentClass: 'bg-rose-600',
        panelClass: 'from-rose-50 via-white to-slate-100',
        ringClass: 'ring-rose-600/20',
        bullets: [
            'Spot stuck orders',
            'Watch driver capacity',
            'Intervene manually',
        ],
    },
};

export function getLoginExperienceKey(redirectTo: string | null | undefined): LoginExperienceKey {
    if (redirectTo?.startsWith('/vendor')) {
        return 'vendor';
    }

    if (redirectTo?.startsWith('/driver')) {
        return 'driver';
    }

    if (redirectTo?.startsWith('/dispatcher')) {
        return 'dispatcher';
    }

    return 'customer';
}

export function getLoginExperience(redirectTo: string | null | undefined): LoginExperience {
    return loginExperiences[getLoginExperienceKey(redirectTo)];
}
