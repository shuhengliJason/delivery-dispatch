import { Prisma, UserRole } from '@prisma/client';
import { after } from 'next/server';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    adminRateLimitPolicies,
    enforceIpRateLimit,
    enforceUserRateLimit,
} from '@/lib/rate-limit';
import { requireRestaurantPermission } from '@/lib/vendor-permissions';
import { publishRestaurantSearchEvent } from '@/search/restaurant-search-events';

type UpdateRestaurantBody = {
    phone?: unknown;
    featureImageUrl?: unknown;
    averagePrepMinutes?: unknown;
    address?: {
        line1?: unknown;
        line2?: unknown;
        city?: unknown;
        province?: unknown;
        postalCode?: unknown;
        country?: unknown;
        latitude?: unknown;
        longitude?: unknown;
        formattedAddress?: unknown;
        googlePlaceId?: unknown;
        googleMapsUri?: unknown;
        addressComponents?: unknown;
    };
};

type VendorRestaurantRouteContext = {
    params: Promise<{
        restaurantId: string;
    }>;
};

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isValidImageUrl(value: string): boolean {
    if (!value) {
        return true;
    }

    if (value.length > 500 || /\s/.test(value)) {
        return false;
    }

    if (value.startsWith('/')) {
        return true;
    }

    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function isValidOptionalUrl(value: string): boolean {
    if (!value) {
        return true;
    }

    if (value.length > 500 || /\s/.test(value)) {
        return false;
    }

    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function getAddressComponents(value: unknown): Prisma.InputJsonValue | null {
    if (!Array.isArray(value)) {
        return null;
    }

    const components = value.map((component) => {
        if (typeof component !== 'object' || component === null) {
            return null;
        }

        const addressComponent = component as Record<string, unknown>;
        const types = Array.isArray(addressComponent.types)
            ? addressComponent.types.filter((type) => {
                return typeof type === 'string';
            })
            : [];

        return {
            longText: normalizeText(addressComponent.longText),
            shortText: normalizeText(addressComponent.shortText),
            types,
        };
    });

    if (components.some((component) => {
        return component === null;
    })) {
        return null;
    }

    const json = JSON.stringify(components);

    return json.length <= 10000
        ? components as Prisma.InputJsonValue
        : null;
}

export async function PATCH(
    request: NextRequest,
    { params }: VendorRestaurantRouteContext,
) {
    const ipRateLimitResponse = await enforceIpRateLimit(request, adminRateLimitPolicies.vendorRestaurantMutationIp);

    if (ipRateLimitResponse) {
        return ipRateLimitResponse;
    }

    const session = await auth.api.getSession({
        headers: request.headers,
    });

    if (!session?.user) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: {
            id: session.user.id,
        },
        select: {
            id: true,
            role: true,
        },
    });

    if (!user || (user.role !== UserRole.VENDOR && user.role !== UserRole.ADMIN)) {
        return NextResponse.json({ error: 'Vendor access required.' }, { status: 403 });
    }

    const userRateLimitResponse = await enforceUserRateLimit(
        request,
        adminRateLimitPolicies.vendorRestaurantMutationUser,
        user.id,
    );

    if (userRateLimitResponse) {
        return userRateLimitResponse;
    }

    let body: UpdateRestaurantBody;

    try {
        body = await request.json() as UpdateRestaurantBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { restaurantId } = await params;
    const phone = normalizeText(body.phone);
    const featureImageUrl = normalizeText(body.featureImageUrl);
    const averagePrepMinutes = body.averagePrepMinutes;
    const address = typeof body.address === 'object' && body.address !== null ? body.address : null;
    const line1 = normalizeText(address?.line1);
    const line2 = normalizeText(address?.line2);
    const city = normalizeText(address?.city);
    const province = normalizeText(address?.province);
    const postalCode = normalizeText(address?.postalCode);
    const country = normalizeText(address?.country) || 'Canada';
    const latitude = address?.latitude;
    const longitude = address?.longitude;
    const formattedAddress = normalizeText(address?.formattedAddress);
    const googlePlaceId = normalizeText(address?.googlePlaceId);
    const googleMapsUri = normalizeText(address?.googleMapsUri);
    const addressComponents = getAddressComponents(address?.addressComponents);

    if (phone.length > 40) {
        return NextResponse.json({ error: 'Phone must be 40 characters or less.' }, { status: 400 });
    }

    if (!isValidImageUrl(featureImageUrl)) {
        return NextResponse.json({ error: 'Enter a valid image URL.' }, { status: 400 });
    }

    if (typeof averagePrepMinutes !== 'number'
        || !Number.isInteger(averagePrepMinutes)
        || averagePrepMinutes < 5
        || averagePrepMinutes > 180
    ) {
        return NextResponse.json({ error: 'Average prep time must be an integer from 5 to 180 minutes.' }, { status: 400 });
    }

    if (line1.length < 2 || line1.length > 120) {
        return NextResponse.json({ error: 'Address line 1 must be between 2 and 120 characters.' }, { status: 400 });
    }

    if (line2.length > 120 || city.length < 2 || city.length > 80 || province.length < 2 || province.length > 40 || postalCode.length < 2 || postalCode.length > 20 || country.length < 2 || country.length > 60) {
        return NextResponse.json({ error: 'Enter a valid restaurant address.' }, { status: 400 });
    }

    if (latitude !== null && latitude !== undefined && (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
        return NextResponse.json({ error: 'Latitude must be between -90 and 90.' }, { status: 400 });
    }

    if (longitude !== null && longitude !== undefined && (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
        return NextResponse.json({ error: 'Longitude must be between -180 and 180.' }, { status: 400 });
    }

    if (formattedAddress.length > 500 || googlePlaceId.length > 255) {
        return NextResponse.json({ error: 'Google address metadata is too long.' }, { status: 400 });
    }

    if (!isValidOptionalUrl(googleMapsUri)) {
        return NextResponse.json({ error: 'Enter a valid Google Maps URL.' }, { status: 400 });
    }

    const permission = await requireRestaurantPermission(user, restaurantId, 'profile:update');

    if (!permission.knownRestaurantMember) {
        return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 });
    }

    if (!permission.allowed) {
        return NextResponse.json({ error: 'You do not have permission to edit this restaurant profile.' }, { status: 403 });
    }

    const updatedRestaurant = await prisma.restaurant.update({
        where: {
            id: restaurantId,
        },
        data: {
            phone: phone || null,
            featureImageUrl: featureImageUrl || null,
            averagePrepMinutes,
            address: {
                update: {
                    line1,
                    line2: line2 || null,
                    city,
                    province,
                    postalCode,
                    country,
                    latitude: typeof latitude === 'number' ? latitude : null,
                    longitude: typeof longitude === 'number' ? longitude : null,
                    formattedAddress: formattedAddress || null,
                    googlePlaceId: googlePlaceId || null,
                    googleMapsUri: googleMapsUri || null,
                    addressComponents: addressComponents ?? Prisma.JsonNull,
                },
            },
        },
        select: {
            id: true,
            name: true,
            phone: true,
            featureImageUrl: true,
            averagePrepMinutes: true,
            address: true,
        },
    });

    // After the DB update succeeds, publish a lightweight change event.
    // The Kafka search processor will re-read the restaurant from Postgres and
    // update the OpenSearch autocomplete document.
    after(async () => {
        try {
            await publishRestaurantSearchEvent({
                type: 'restaurant.changed',
                restaurantId: updatedRestaurant.id,
            });
        } catch (error) {
            console.warn('Failed to publish restaurant search change event', {
                error,
                restaurantId: updatedRestaurant.id,
            });
        }
    });

    return NextResponse.json({ restaurant: updatedRestaurant });
}
