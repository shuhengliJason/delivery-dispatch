import { RestaurantStaffRole, UserRole } from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
    adminRateLimitPolicies,
    enforceIpRateLimit,
    enforceUserRateLimit,
} from '@/lib/rate-limit';
import {
    canAssignRestaurantStaffRole,
    canManageRestaurantStaffRole,
    getRestaurantAuthorization,
} from '@/lib/vendor-permissions';

type UpdateStaffBody = {
    role?: unknown;
};

type VendorStaffRouteContext = {
    params: Promise<{
        staffId: string;
    }>;
};

function isRestaurantStaffRole(value: unknown): value is RestaurantStaffRole {
    return typeof value === 'string'
        && Object.values(RestaurantStaffRole).includes(value as RestaurantStaffRole);
}

type StaffManagementUser = {
    id: string;
    role: UserRole;
};

async function getStaffManagementUser(request: NextRequest): Promise<StaffManagementUser | null> {
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
    { params }: VendorStaffRouteContext,
) {
    const ipRateLimitResponse = await enforceIpRateLimit(request, adminRateLimitPolicies.vendorStaffMutationIp);

    if (ipRateLimitResponse) {
        return ipRateLimitResponse;
    }

    const staffManagementUser = await getStaffManagementUser(request);

    if (!staffManagementUser) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const userRateLimitResponse = await enforceUserRateLimit(
        request,
        adminRateLimitPolicies.vendorStaffMutationUser,
        staffManagementUser.id,
    );

    if (userRateLimitResponse) {
        return userRateLimitResponse;
    }

    let body: UpdateStaffBody;

    try {
        body = await request.json() as UpdateStaffBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    if (!isRestaurantStaffRole(body.role)) {
        return NextResponse.json({ error: 'Choose a valid staff role.' }, { status: 400 });
    }

    const { staffId } = await params;
    const existingMembership = await prisma.restaurantStaff.findUnique({
        where: {
            id: staffId,
        },
        select: {
            id: true,
            restaurantId: true,
            role: true,
            userId: true,
        },
    });

    if (!existingMembership) {
        return NextResponse.json({ error: 'Staff membership not found.' }, { status: 404 });
    }

    const restaurantAuthorization = await getRestaurantAuthorization(staffManagementUser, existingMembership.restaurantId);

    if (!restaurantAuthorization) {
        return NextResponse.json({ error: 'Restaurant owner access required.' }, { status: 403 });
    }

    if (!canManageRestaurantStaffRole(restaurantAuthorization.role, existingMembership.role)) {
        return NextResponse.json({ error: 'You cannot modify a vendor user with a role at or above your own.' }, { status: 403 });
    }

    if (!canAssignRestaurantStaffRole(restaurantAuthorization.role, body.role)) {
        return NextResponse.json({ error: 'You cannot assign a vendor role at or above your own.' }, { status: 403 });
    }

    const staffMembership = await prisma.restaurantStaff.update({
        where: {
            id: staffId,
        },
        data: {
            role: body.role,
        },
        select: {
            id: true,
            role: true,
        },
    });

    return NextResponse.json({ staffMembership });
}

export async function DELETE(
    request: NextRequest,
    { params }: VendorStaffRouteContext,
) {
    const ipRateLimitResponse = await enforceIpRateLimit(request, adminRateLimitPolicies.vendorStaffMutationIp);

    if (ipRateLimitResponse) {
        return ipRateLimitResponse;
    }

    const staffManagementUser = await getStaffManagementUser(request);

    if (!staffManagementUser) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const userRateLimitResponse = await enforceUserRateLimit(
        request,
        adminRateLimitPolicies.vendorStaffMutationUser,
        staffManagementUser.id,
    );

    if (userRateLimitResponse) {
        return userRateLimitResponse;
    }

    const { staffId } = await params;
    const existingMembership = await prisma.restaurantStaff.findUnique({
        where: {
            id: staffId,
        },
        select: {
            id: true,
            restaurantId: true,
            role: true,
            userId: true,
        },
    });

    if (!existingMembership) {
        return NextResponse.json({ error: 'Staff membership not found.' }, { status: 404 });
    }

    const restaurantAuthorization = await getRestaurantAuthorization(staffManagementUser, existingMembership.restaurantId);

    if (!restaurantAuthorization) {
        return NextResponse.json({ error: 'Restaurant owner access required.' }, { status: 403 });
    }

    if (!canManageRestaurantStaffRole(restaurantAuthorization.role, existingMembership.role)) {
        return NextResponse.json({ error: 'You cannot remove a vendor user with a role at or above your own.' }, { status: 403 });
    }

    await prisma.restaurantStaff.delete({
        where: {
            id: staffId,
        },
    });

    return NextResponse.json({ success: true });
}
