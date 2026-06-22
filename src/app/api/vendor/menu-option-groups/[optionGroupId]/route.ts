import {
    MenuOptionSelectionType,
    UserRole,
} from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    adminRateLimitPolicies,
    enforceIpRateLimit,
    enforceUserRateLimit,
} from '@/lib/rate-limit';
import { requireRestaurantPermission } from '@/lib/vendor-permissions';

type UpdateOptionGroupBody = {
    name?: unknown;
    selectionType?: unknown;
    isRequired?: unknown;
    minSelections?: unknown;
    maxSelections?: unknown;
    isAvailable?: unknown;
};

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isSelectionType(value: unknown): value is MenuOptionSelectionType {
    return typeof value === 'string'
        && Object.values(MenuOptionSelectionType).includes(value as MenuOptionSelectionType);
}

async function getAuthorizedOptionGroup(
    optionGroupId: string,
) {
    const optionGroup = await prisma.menuItemOptionGroup.findUnique({
        where: {
            id: optionGroupId,
        },
        include: {
            menuItem: {
                select: {
                    restaurantId: true,
                },
            },
        },
    });

    if (!optionGroup) {
        return null;
    }

    return optionGroup;
}

async function getVendorUser(request: NextRequest) {
    const session = await auth.api.getSession({
        headers: request.headers,
    });

    if (!session?.user) {
        return null;
    }

    return prisma.user.findUnique({
        where: {
            id: session.user.id,
        },
        select: {
            id: true,
            role: true,
        },
    });
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ optionGroupId: string }> },
) {
    const ipRateLimitResponse = await enforceIpRateLimit(request, adminRateLimitPolicies.vendorMenuMutationIp);

    if (ipRateLimitResponse) {
        return ipRateLimitResponse;
    }

    const user = await getVendorUser(request);

    if (!user) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (user.role !== UserRole.VENDOR && user.role !== UserRole.ADMIN) {
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

    let body: UpdateOptionGroupBody;

    try {
        body = await request.json() as UpdateOptionGroupBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { optionGroupId } = await context.params;
    const optionGroup = await getAuthorizedOptionGroup(optionGroupId);

    if (!optionGroup) {
        return NextResponse.json({ error: 'Option group not found.' }, { status: 404 });
    }

    const permission = await requireRestaurantPermission(user, optionGroup.menuItem.restaurantId, 'menu:update');

    if (!permission.knownRestaurantMember) {
        return NextResponse.json({ error: 'Option group not found.' }, { status: 404 });
    }

    if (!permission.allowed) {
        return NextResponse.json({ error: 'You do not have permission to edit this restaurant menu.' }, { status: 403 });
    }

    const name = normalizeText(body.name);

    if (name.length < 2 || name.length > 60) {
        return NextResponse.json({ error: 'Option group name must be between 2 and 60 characters.' }, { status: 400 });
    }

    if (!isSelectionType(body.selectionType)) {
        return NextResponse.json({ error: 'Selection type is required.' }, { status: 400 });
    }

    if (typeof body.isRequired !== 'boolean') {
        return NextResponse.json({ error: 'Required flag is required.' }, { status: 400 });
    }

    if (typeof body.isAvailable !== 'boolean') {
        return NextResponse.json({ error: 'Availability is required.' }, { status: 400 });
    }

    if (typeof body.minSelections !== 'number'
        || !Number.isInteger(body.minSelections)
        || body.minSelections < 0
        || body.minSelections > 20
    ) {
        return NextResponse.json({ error: 'Minimum selections must be an integer from 0 to 20.' }, { status: 400 });
    }

    if (body.maxSelections !== null
        && (typeof body.maxSelections !== 'number'
            || !Number.isInteger(body.maxSelections)
            || body.maxSelections < 1
            || body.maxSelections > 20)
    ) {
        return NextResponse.json({ error: 'Maximum selections must be blank or an integer from 1 to 20.' }, { status: 400 });
    }

    const maxSelections = body.selectionType === MenuOptionSelectionType.SINGLE
        ? 1
        : body.maxSelections;
    const minSelections = body.isRequired
        ? Math.max(1, body.minSelections)
        : body.minSelections;

    if (typeof maxSelections === 'number' && minSelections > maxSelections) {
        return NextResponse.json({ error: 'Minimum selections cannot exceed maximum selections.' }, { status: 400 });
    }

    const updatedOptionGroup = await prisma.menuItemOptionGroup.update({
        where: {
            id: optionGroup.id,
        },
        data: {
            name,
            selectionType: body.selectionType,
            isRequired: body.isRequired,
            minSelections,
            maxSelections,
            isAvailable: body.isAvailable,
        },
    });

    return NextResponse.json({ optionGroup: updatedOptionGroup });
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ optionGroupId: string }> },
) {
    const ipRateLimitResponse = await enforceIpRateLimit(request, adminRateLimitPolicies.vendorMenuMutationIp);

    if (ipRateLimitResponse) {
        return ipRateLimitResponse;
    }

    const user = await getVendorUser(request);

    if (!user) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (user.role !== UserRole.VENDOR && user.role !== UserRole.ADMIN) {
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

    const { optionGroupId } = await context.params;
    const optionGroup = await getAuthorizedOptionGroup(optionGroupId);

    if (!optionGroup) {
        return NextResponse.json({ error: 'Option group not found.' }, { status: 404 });
    }

    const permission = await requireRestaurantPermission(user, optionGroup.menuItem.restaurantId, 'menu:update');

    if (!permission.knownRestaurantMember) {
        return NextResponse.json({ error: 'Option group not found.' }, { status: 404 });
    }

    if (!permission.allowed) {
        return NextResponse.json({ error: 'You do not have permission to edit this restaurant menu.' }, { status: 403 });
    }

    await prisma.menuItemOptionGroup.delete({
        where: {
            id: optionGroup.id,
        },
    });

    return NextResponse.json({ deleted: true });
}
