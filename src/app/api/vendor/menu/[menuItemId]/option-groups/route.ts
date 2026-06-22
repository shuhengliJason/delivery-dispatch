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

type CreateOptionGroupBody = {
    name?: unknown;
    selectionType?: unknown;
    isRequired?: unknown;
    minSelections?: unknown;
    maxSelections?: unknown;
    options?: unknown;
};

type OptionInput = {
    name?: unknown;
    priceCents?: unknown;
    isDefault?: unknown;
};

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isSelectionType(value: unknown): value is MenuOptionSelectionType {
    return typeof value === 'string'
        && Object.values(MenuOptionSelectionType).includes(value as MenuOptionSelectionType);
}

function isOptionInput(value: unknown): value is OptionInput {
    return typeof value === 'object' && value !== null;
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ menuItemId: string }> },
) {
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

    let body: CreateOptionGroupBody;

    try {
        body = await request.json() as CreateOptionGroupBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { menuItemId } = await context.params;
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

    if (!Array.isArray(body.options) || body.options.length === 0 || body.options.length > 40) {
        return NextResponse.json({ error: 'Add between 1 and 40 options.' }, { status: 400 });
    }

    const optionData = body.options.map((option, index) => {
        if (!isOptionInput(option)) {
            return null;
        }

        const optionName = normalizeText(option.name);

        if (optionName.length < 1 || optionName.length > 80) {
            return null;
        }

        if (typeof option.priceCents !== 'number'
            || !Number.isInteger(option.priceCents)
            || option.priceCents < 0
            || option.priceCents > 100000
        ) {
            return null;
        }

        return {
            name: optionName,
            priceCents: option.priceCents,
            isDefault: typeof option.isDefault === 'boolean' ? option.isDefault : false,
            sortOrder: index,
        };
    });

    if (optionData.some((option) => {
        return option === null;
    })) {
        return NextResponse.json({ error: 'Each option needs a name and valid add-on price.' }, { status: 400 });
    }

    const menuItem = await prisma.menuItem.findUnique({
        where: {
            id: menuItemId,
        },
        select: {
            id: true,
            restaurantId: true,
            optionGroups: {
                select: {
                    id: true,
                },
            },
        },
    });

    if (!menuItem) {
        return NextResponse.json({ error: 'Menu item not found.' }, { status: 404 });
    }

    const permission = await requireRestaurantPermission(user, menuItem.restaurantId, 'menu:update');

    if (!permission.knownRestaurantMember) {
        return NextResponse.json({ error: 'Menu item not found.' }, { status: 404 });
    }

    if (!permission.allowed) {
        return NextResponse.json({ error: 'You do not have permission to edit this restaurant menu.' }, { status: 403 });
    }

    const optionGroup = await prisma.menuItemOptionGroup.create({
        data: {
            menuItemId: menuItem.id,
            name,
            selectionType: body.selectionType,
            isRequired: body.isRequired,
            minSelections,
            maxSelections,
            sortOrder: menuItem.optionGroups.length,
            options: {
                create: optionData as Array<{
                    name: string;
                    priceCents: number;
                    isDefault: boolean;
                    sortOrder: number;
                }>,
            },
        },
        include: {
            options: {
                orderBy: {
                    sortOrder: 'asc',
                },
            },
        },
    });

    return NextResponse.json({ optionGroup }, { status: 201 });
}
