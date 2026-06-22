import { UserRole } from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    adminRateLimitPolicies,
    enforceIpRateLimit,
    enforceUserRateLimit,
} from '@/lib/rate-limit';
import { requireRestaurantPermission } from '@/lib/vendor-permissions';

type CreateMenuItemBody = {
    restaurantId?: unknown;
    name?: unknown;
    description?: unknown;
    category?: unknown;
    priceCents?: unknown;
};

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: NextRequest) {
    const ipRateLimitResponse = await enforceIpRateLimit(request, adminRateLimitPolicies.vendorMenuMutationIp);

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
        adminRateLimitPolicies.vendorMenuMutationUser,
        user.id,
    );

    if (userRateLimitResponse) {
        return userRateLimitResponse;
    }

    let body: CreateMenuItemBody;

    try {
        body = await request.json() as CreateMenuItemBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const restaurantId = normalizeText(body.restaurantId);
    const name = normalizeText(body.name);
    const category = normalizeText(body.category);
    const description = normalizeText(body.description);

    if (!restaurantId) {
        return NextResponse.json({ error: 'Restaurant is required.' }, { status: 400 });
    }

    if (name.length < 2 || name.length > 80) {
        return NextResponse.json({ error: 'Dish name must be between 2 and 80 characters.' }, { status: 400 });
    }

    if (category.length < 2 || category.length > 40) {
        return NextResponse.json({ error: 'Category must be between 2 and 40 characters.' }, { status: 400 });
    }

    if (description.length > 280) {
        return NextResponse.json({ error: 'Description must be 280 characters or less.' }, { status: 400 });
    }

    if (typeof body.priceCents !== 'number'
        || !Number.isInteger(body.priceCents)
        || body.priceCents < 100
        || body.priceCents > 100000
    ) {
        return NextResponse.json({ error: 'Price must be between $1.00 and $1,000.00.' }, { status: 400 });
    }

    const permission = await requireRestaurantPermission(user, restaurantId, 'menu:update');

    if (!permission.knownRestaurantMember) {
        return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 });
    }

    if (!permission.allowed) {
        return NextResponse.json({ error: 'You do not have permission to edit this restaurant menu.' }, { status: 403 });
    }

    const menuItem = await prisma.menuItem.create({
        data: {
            restaurantId,
            name,
            description: description || null,
            category,
            priceCents: body.priceCents,
            isAvailable: true,
        },
        select: {
            id: true,
            restaurantId: true,
            name: true,
            description: true,
            category: true,
            priceCents: true,
            isAvailable: true,
        },
    });

    return NextResponse.json({ menuItem }, { status: 201 });
}
