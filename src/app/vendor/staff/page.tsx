import { RestaurantStaffRole, UserRole } from '@prisma/client';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/current-user';
import { prisma } from '@/lib/prisma';
import { getAuthorizedRestaurantsForUser } from '@/lib/vendor-permissions';
import VendorManagementNav from '../vendor-management-nav';
import VendorStaffManager from './vendor-staff-manager';

export const dynamic = 'force-dynamic';

type VendorStaffPageProps = {
    searchParams?: Promise<{
        restaurantId?: string | string[];
    }>;
};

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function getRoleLabel(role: RestaurantStaffRole): string {
    return role.split('_').map((part) => {
        return part.charAt(0) + part.slice(1).toLowerCase();
    }).join(' ');
}

function canManageRestaurantStaff(staffRole: string | null | undefined): boolean {
    return staffRole === 'ADMIN' || staffRole === 'OWNER';
}

const restaurantStaffRoleOrder = [
    RestaurantStaffRole.VIEWER,
    RestaurantStaffRole.ORDER_STAFF,
    RestaurantStaffRole.MANAGER,
    RestaurantStaffRole.OWNER,
];

export default async function VendorStaffPage({
    searchParams,
}: VendorStaffPageProps) {
    const resolvedSearchParams = await searchParams;
    const requestedRestaurantId = getSingleSearchParam(resolvedSearchParams?.restaurantId);
    const user = await getCurrentUser();

    if (!user) {
        redirect('/sign-in?redirectTo=/vendor/staff');
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.VENDOR) {
        return (
            <main className="min-h-screen bg-slate-50 p-6">
                <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        403 Forbidden
                    </p>
                    <h1 className="mt-2 text-2xl font-bold text-slate-950">
                        Vendor owner access is required to manage restaurant staff roles.
                    </h1>
                    <p className="mt-2 text-sm text-slate-600">
                        Sign in with an administrator or restaurant owner account to change restaurant staff assignments.
                    </p>
                </div>
            </main>
        );
    }

    const accessibleRestaurants = await getAuthorizedRestaurantsForUser(user);
    const restaurants = accessibleRestaurants.filter((restaurant) => {
        return canManageRestaurantStaff(restaurant.staffRole);
    });

    if (user.role === UserRole.VENDOR && restaurants.length === 0) {
        redirect('/vendor');
    }

    const selectedRestaurant = restaurants.find((restaurant) => {
        return restaurant.id === requestedRestaurantId;
    }) ?? restaurants[0] ?? null;

    if (requestedRestaurantId && !selectedRestaurant) {
        if (user.role === UserRole.VENDOR) {
            redirect('/vendor');
        }

        return (
            <main className="min-h-screen bg-slate-50 p-6">
                <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        404 Not Found
                    </p>
                    <h1 className="mt-2 text-2xl font-bold text-slate-950">
                        This restaurant could not be found.
                    </h1>
                </div>
            </main>
        );
    }

    const staffMemberships = selectedRestaurant
        ? await prisma.restaurantStaff.findMany({
            where: {
                restaurantId: selectedRestaurant.id,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
            },
            orderBy: [
                {
                    role: 'asc',
                },
                {
                    user: {
                        name: 'asc',
                    },
                },
            ],
        })
        : [];

    const roleOptions = restaurantStaffRoleOrder.map((role) => {
        return {
            value: role,
            label: getRoleLabel(role),
        };
    });
    return (
        <main className="min-h-screen bg-slate-50">
            <VendorManagementNav
                active="staff"
                description="Assign vendor users to restaurants and adjust the operational role each person has."
                eyebrow="Admin Management"
                restaurantId={selectedRestaurant?.id}
                restaurantImageUrl={selectedRestaurant?.featureImageUrl}
                restaurantName={selectedRestaurant?.name}
                title="Staff Roles"
                userEmail={user.email}
                canViewDishes={Boolean(selectedRestaurant?.permissions.canReadMenu)}
                canViewOrders={Boolean(selectedRestaurant?.permissions.canReadOrders)}
                canViewProfile={Boolean(selectedRestaurant?.permissions.canReadProfile)}
                canManageStaff
            />

            <div className="mx-auto max-w-7xl px-6 py-8">
                <VendorStaffManager
                    key={selectedRestaurant?.id ?? 'no-restaurant'}
                    currentUserStaffRole={selectedRestaurant?.staffRole ?? 'ADMIN'}
                    initialRestaurantId={selectedRestaurant?.id ?? ''}
                    restaurants={restaurants}
                    roleOptions={roleOptions}
                    staffMemberships={staffMemberships.map((membership) => {
                        return {
                            id: membership.id,
                            role: membership.role,
                            user: {
                                id: membership.user.id,
                                name: membership.user.name,
                                email: membership.user.email,
                                role: membership.user.role,
                            },
                        };
                    })}
                />
            </div>
        </main>
    );
}
