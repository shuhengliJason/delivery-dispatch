import { Prisma, RestaurantStaffRole, UserRole } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
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
    getRestaurantAuthorization,
} from '@/lib/vendor-permissions';

type CreateStaffBody = {
    email?: unknown;
    name?: unknown;
    password?: unknown;
    restaurantId?: unknown;
    role?: unknown;
};

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

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

export async function POST(request: NextRequest) {
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

    let body: CreateStaffBody;

    try {
        body = await request.json() as CreateStaffBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const restaurantId = normalizeText(body.restaurantId);
    const name = normalizeText(body.name);
    const email = normalizeText(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';

    if (!restaurantId) {
        return NextResponse.json({ error: 'Restaurant is required.' }, { status: 400 });
    }

    if (name.length < 2 || name.length > 80) {
        return NextResponse.json({ error: 'Name must be between 2 and 80 characters.' }, { status: 400 });
    }

    if (email.length > 255 || !isValidEmail(email)) {
        return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    if (password.length < 8 || password.length > 128) {
        return NextResponse.json({ error: 'Password must be between 8 and 128 characters.' }, { status: 400 });
    }

    if (!isRestaurantStaffRole(body.role)) {
        return NextResponse.json({ error: 'Choose a valid staff role.' }, { status: 400 });
    }

    const staffRole = body.role;

    const restaurantAuthorization = await getRestaurantAuthorization(staffManagementUser, restaurantId);

    if (!restaurantAuthorization) {
        return NextResponse.json({ error: 'Restaurant owner access required.' }, { status: 403 });
    }

    if (!canAssignRestaurantStaffRole(restaurantAuthorization.role, staffRole)) {
        return NextResponse.json({ error: 'You cannot create a vendor user with a role at or above your own.' }, { status: 403 });
    }

    const restaurant = await prisma.restaurant.findUnique({
        where: {
            id: restaurantId,
        },
        select: {
            id: true,
        },
    });

    if (!restaurant) {
        return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 });
    }

    try {
        const passwordHash = await hashPassword(password);
        const now = new Date();
        const result = await prisma.$transaction(async (tx) => {
            const vendorUser = await tx.user.create({
                data: {
                    email,
                    name,
                    role: UserRole.VENDOR,
                },
                select: {
                    email: true,
                    id: true,
                    name: true,
                },
            });

            await tx.account.create({
                data: {
                    accountId: vendorUser.id,
                    createdAt: now,
                    id: `credential_${vendorUser.id}`,
                    password: passwordHash,
                    providerId: 'credential',
                    updatedAt: now,
                    userId: vendorUser.id,
                },
            });

            const staffMembership = await tx.restaurantStaff.create({
                data: {
                    restaurantId,
                    role: staffRole,
                    userId: vendorUser.id,
                },
                select: {
                    id: true,
                    role: true,
                },
            });

            return {
                staffMembership,
                vendorUser,
            };
        });

        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 409 });
        }

        throw error;
    }
}
