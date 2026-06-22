import { UserRole } from '@prisma/client';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/current-user';
import { prisma } from '@/lib/prisma';
import { getAuthorizedRestaurantsForUser } from '@/lib/vendor-permissions';
import VendorManagementNav from '../vendor-management-nav';
import { type GoogleAddressComponent } from './restaurant-address-autocomplete';
import VendorProfileManager from './vendor-profile-manager';

export const dynamic = 'force-dynamic';

type VendorProfilePageProps = {
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

export default async function VendorProfilePage({
    searchParams,
}: VendorProfilePageProps) {
    const resolvedSearchParams = await searchParams;
    const requestedRestaurantId = getSingleSearchParam(resolvedSearchParams?.restaurantId);
    const user = await getCurrentUser();

    if (!user) {
        redirect('/sign-in?redirectTo=/vendor/profile');
    }

    if (user.role !== UserRole.VENDOR && user.role !== UserRole.ADMIN) {
        redirect('/sign-in?redirectTo=/vendor/profile&switchAccount=1');
    }

    const accessibleRestaurants = await getAuthorizedRestaurantsForUser(user);
    const profileRestaurantAccess = accessibleRestaurants.filter((restaurant) => {
        return restaurant.permissions.canReadProfile;
    });
    const profileAccessByRestaurantId = new Map(profileRestaurantAccess.map((restaurant) => {
        return [restaurant.id, restaurant];
    }));
    const restaurants = await prisma.restaurant.findMany({
        where: {
            id: {
                in: profileRestaurantAccess.map((restaurant) => {
                    return restaurant.id;
                }),
            },
        },
        include: {
            address: true,
        },
        orderBy: {
            name: 'asc',
        },
    });
    const selectedRestaurant = restaurants.find((restaurant) => {
        return restaurant.id === requestedRestaurantId;
    }) ?? restaurants[0] ?? null;
    const selectedRestaurantAccess = selectedRestaurant
        ? profileAccessByRestaurantId.get(selectedRestaurant.id) ?? null
        : null;

    if (requestedRestaurantId && !selectedRestaurant) {
        return (
            <main className="min-h-screen bg-slate-50 p-6">
                <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        403 Forbidden
                    </p>
                    <h1 className="mt-2 text-2xl font-bold text-slate-950">
                        You cannot view this restaurant profile.
                    </h1>
                    <p className="mt-2 text-sm text-slate-600">
                        Ask a restaurant owner to grant profile access to your vendor account.
                    </p>
                </div>
            </main>
        );
    }

    if (restaurants.length > 1 && (!requestedRestaurantId || !selectedRestaurant)) {
        redirect('/vendor');
    }

    return (
        <main className="min-h-screen bg-slate-50">
            <VendorManagementNav
                active="profile"
                description="Keep customer-facing restaurant details, images, prep time, and location current."
                eyebrow="Menu Management"
                restaurantId={selectedRestaurant?.id}
                restaurantImageUrl={selectedRestaurant?.featureImageUrl}
                restaurantName={selectedRestaurant?.name}
                title="Restaurant Profile"
                userEmail={user.email}
                canViewDishes={Boolean(selectedRestaurantAccess?.permissions.canReadMenu)}
                canViewOrders={Boolean(selectedRestaurantAccess?.permissions.canReadOrders)}
                canViewProfile
                canManageStaff={canManageRestaurantStaff(selectedRestaurantAccess?.staffRole)}
            />

            <div className="mx-auto max-w-7xl px-6 py-8">
                <VendorProfileManager
                    initialRestaurantId={selectedRestaurant?.id ?? ''}
                    canEditProfile={Boolean(selectedRestaurantAccess?.permissions.canUpdateProfile)}
                    restaurants={restaurants.map((restaurant) => {
                        return {
                            id: restaurant.id,
                            name: restaurant.name,
                            phone: restaurant.phone,
                            featureImageUrl: restaurant.featureImageUrl,
                            averagePrepMinutes: restaurant.averagePrepMinutes,
                            address: {
                                line1: restaurant.address.line1,
                                line2: restaurant.address.line2,
                                city: restaurant.address.city,
                                province: restaurant.address.province,
                                postalCode: restaurant.address.postalCode,
                                country: restaurant.address.country,
                                latitude: restaurant.address.latitude,
                                longitude: restaurant.address.longitude,
                                formattedAddress: restaurant.address.formattedAddress,
                                googlePlaceId: restaurant.address.googlePlaceId,
                                googleMapsUri: restaurant.address.googleMapsUri,
                                addressComponents: Array.isArray(restaurant.address.addressComponents)
                                    ? restaurant.address.addressComponents as GoogleAddressComponent[]
                                    : null,
                            },
                        };
                    })}
                />
            </div>
        </main>
    );
}
