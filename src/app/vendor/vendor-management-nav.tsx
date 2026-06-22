import Link from 'next/link';

import VendorSignOutButton from './vendor-sign-out-button';

type VendorManagementNavProps = {
    active: 'orders' | 'dishes' | 'profile' | 'staff';
    description: string;
    eyebrow: string;
    restaurantId?: string | null;
    restaurantImageUrl?: string | null;
    restaurantName?: string | null;
    title: string;
    userEmail: string;
    canViewDishes?: boolean;
    canViewOrders?: boolean;
    canViewProfile?: boolean;
    canManageStaff?: boolean;
};

const navItems: Array<{
    key: VendorManagementNavProps['active'];
    href: string;
    label: string;
}> = [
    {
        key: 'orders',
        href: '/vendor',
        label: 'Orders',
    },
    {
        key: 'dishes',
        href: '/vendor/dishes',
        label: 'Existing dishes',
    },
    {
        key: 'profile',
        href: '/vendor/profile',
        label: 'Restaurant profile',
    },
    {
        key: 'staff',
        href: '/vendor/staff',
        label: 'Staff roles',
    },
];

function withRestaurantId(href: string, restaurantId: string | null | undefined): string {
    if (!restaurantId) {
        return href;
    }

    const params = new URLSearchParams({
        restaurantId,
    });

    return `${href}?${params.toString()}`;
}

export default function VendorManagementNav({
    active,
    description,
    eyebrow,
    restaurantId,
    restaurantImageUrl,
    restaurantName,
    title,
    userEmail,
    canViewDishes = true,
    canViewOrders = true,
    canViewProfile = true,
    canManageStaff = false,
}: VendorManagementNavProps) {
    const visibleNavItems = navItems.filter((item) => {
        if (item.key === 'orders') {
            return canViewOrders;
        }

        if (item.key === 'dishes') {
            return canViewDishes;
        }

        if (item.key === 'staff') {
            return canManageStaff;
        }

        return canViewProfile;
    });

    return (
        <section
            className="relative overflow-hidden bg-slate-950 bg-cover bg-center shadow-2xl shadow-slate-950/20"
            style={{
                backgroundImage: restaurantImageUrl
                    ? `linear-gradient(180deg, rgb(2 6 23 / 0.88), rgb(15 23 42 / 0.58) 46%, rgb(15 23 42 / 0.9)), url(${restaurantImageUrl})`
                    : 'linear-gradient(180deg, rgb(15 23 42), rgb(30 41 59))',
            }}
        >
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent" />
            <div className="relative mx-auto flex min-h-[320px] max-w-7xl flex-col justify-between gap-8 px-6 py-6 sm:px-8 lg:px-10">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-3xl">
                        <p className="text-sm font-semibold text-white/75">
                            {eyebrow}
                        </p>
                        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                            {title}
                        </h1>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/78">
                            {description}
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 text-sm text-white/80 sm:items-end">
                        <span className="font-semibold text-white">
                            {userEmail}
                        </span>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                            {restaurantId && (
                                <Link
                                    href="/vendor"
                                    className="inline-flex items-center justify-center rounded-lg border border-white/25 bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25"
                                >
                                    Change restaurants
                                </Link>
                            )}
                            <VendorSignOutButton className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 disabled:cursor-not-allowed disabled:text-white/50" />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                            Managing restaurant
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <p className="text-2xl font-bold text-white">
                                {restaurantName ?? 'Choose a restaurant'}
                            </p>
                            {restaurantId && (
                                <span className="rounded-full bg-emerald-400/16 px-2.5 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-200/25">
                                    Active
                                </span>
                            )}
                        </div>
                    </div>

                    <nav
                        aria-label="Vendor management"
                        className="flex w-full flex-col gap-2 rounded-xl border border-white/15 bg-white/12 p-2 backdrop-blur sm:w-fit sm:flex-row"
                    >
                        {visibleNavItems.map((item) => {
                            const isActive = item.key === active;

                            return (
                                <Link
                                    key={item.key}
                                    href={withRestaurantId(item.href, restaurantId)}
                                    aria-current={isActive ? 'page' : undefined}
                                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${isActive
                                        ? 'bg-white text-slate-950 shadow-sm'
                                        : 'text-white/82 hover:bg-white/15 hover:text-white'}`}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            </div>
        </section>
    );
}
