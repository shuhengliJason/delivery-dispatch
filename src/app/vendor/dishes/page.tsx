import { UserRole } from '@prisma/client';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/current-user';
import { prisma } from '@/lib/prisma';
import { getAuthorizedRestaurantsForUser } from '@/lib/vendor-permissions';
import VendorManagementNav from '../vendor-management-nav';
import VendorDishesManager from './vendor-dishes-manager';

export const dynamic = 'force-dynamic';

type VendorDishesPageProps = {
    searchParams?: Promise<{
        restaurantId?: string | string[];
    }>;
};

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function canManageRestaurantStaff(staffRole: string | null | undefined): boolean {
    return staffRole === 'ADMIN' || staffRole === 'OWNER';
}

export default async function VendorDishesPage({
    searchParams,
}: VendorDishesPageProps) {
    const resolvedSearchParams = await searchParams;
    const requestedRestaurantId = getSingleSearchParam(resolvedSearchParams?.restaurantId);
    const user = await getCurrentUser();

    if (!user) {
        redirect('/sign-in?redirectTo=/vendor/dishes');
    }

    if (user.role !== UserRole.VENDOR && user.role !== UserRole.ADMIN) {
        redirect('/sign-in?redirectTo=/vendor/dishes&switchAccount=1');
    }

    const accessibleRestaurants = await getAuthorizedRestaurantsForUser(user);
    const restaurants = accessibleRestaurants.filter((restaurant) => {
        return restaurant.permissions.canReadMenu;
    });
    const selectedRestaurant = restaurants.find((restaurant) => {
        return restaurant.id === requestedRestaurantId;
    }) ?? restaurants[0] ?? null;

    if (requestedRestaurantId && !selectedRestaurant) {
        return (
            <main className="min-h-screen bg-slate-50 p-6">
                <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        403 Forbidden
                    </p>
                    <h1 className="mt-2 text-2xl font-bold text-slate-950">
                        You cannot view existing dishes for this restaurant.
                    </h1>
                    <p className="mt-2 text-sm text-slate-600">
                        Ask a restaurant owner to grant menu access to your vendor account.
                    </p>
                </div>
            </main>
        );
    }

    if (restaurants.length > 1 && (!requestedRestaurantId || !selectedRestaurant)) {
        redirect('/vendor');
    }

    const menuItems = await prisma.menuItem.findMany({
        where: selectedRestaurant
            ? {
                restaurantId: selectedRestaurant.id,
            }
            : user.role === UserRole.ADMIN
                ? undefined
                : {
                    restaurantId: {
                        in: restaurants.map((restaurant) => {
                            return restaurant.id;
                        }),
                    },
                },
        include: {
            restaurant: {
                select: {
                    name: true,
                },
            },
            optionGroups: {
                include: {
                    options: {
                        orderBy: {
                            sortOrder: 'asc',
                        },
                    },
                },
                orderBy: {
                    sortOrder: 'asc',
                },
            },
        },
        orderBy: [
            {
                restaurant: {
                    name: 'asc',
                },
            },
            {
                category: 'asc',
            },
            {
                name: 'asc',
            },
        ],
    });

    return (
        <main className="min-h-screen bg-slate-50">
            <VendorManagementNav
                active="dishes"
                description="Review published dishes, edit dish details, and tune customer-facing options."
                eyebrow="Menu Management"
                restaurantId={selectedRestaurant?.id}
                restaurantImageUrl={selectedRestaurant?.featureImageUrl}
                restaurantName={selectedRestaurant?.name}
                title="Existing Dishes"
                userEmail={user.email}
                canViewDishes
                canViewOrders={Boolean(selectedRestaurant?.permissions.canReadOrders)}
                canViewProfile={Boolean(selectedRestaurant?.permissions.canReadProfile)}
                canManageStaff={canManageRestaurantStaff(selectedRestaurant?.staffRole)}
            />

            <div className="mx-auto max-w-7xl px-6 py-8">
                <VendorDishesManager
                    initialRestaurantId={selectedRestaurant?.id ?? ''}
                    restaurants={restaurants}
                    canEditMenu={Boolean(selectedRestaurant?.permissions.canUpdateMenu)}
                    menuItems={menuItems.map((item) => {
                        return {
                            id: item.id,
                            restaurantId: item.restaurantId,
                            restaurantName: item.restaurant.name,
                            name: item.name,
                            description: item.description,
                            category: item.category,
                            priceCents: item.priceCents,
                            isAvailable: item.isAvailable,
                            optionGroups: item.optionGroups.map((group) => {
                                return {
                                    id: group.id,
                                    name: group.name,
                                    selectionType: group.selectionType,
                                    isRequired: group.isRequired,
                                    minSelections: group.minSelections,
                                    maxSelections: group.maxSelections,
                                    isAvailable: group.isAvailable,
                                    options: group.options.map((option) => {
                                        return {
                                            id: option.id,
                                            name: option.name,
                                            priceCents: option.priceCents,
                                            isDefault: option.isDefault,
                                        };
                                    }),
                                };
                            }),
                        };
                    })}
                />
            </div>
        </main>
    );
}
