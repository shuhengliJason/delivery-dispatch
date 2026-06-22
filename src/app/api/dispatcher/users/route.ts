import {
    DispatcherRole,
    Prisma,
    RestaurantStaffRole,
    UserRole,
} from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { type NextRequest, NextResponse } from 'next/server';

import {
    canAssignDispatcherRole,
    requireDispatcherPermissionForRequest,
} from '@/lib/dispatcher-permissions';
import { prisma } from '@/lib/prisma';
import {
    adminRateLimitPolicies,
    enforceIpRateLimit,
    enforceUserRateLimit,
} from '@/lib/rate-limit';

type CreateUserBody = {
    dispatcherRole?: unknown;
    email?: unknown;
    name?: unknown;
    password?: unknown;
    restaurantAccess?: unknown;
    role?: unknown;
};

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isDispatcherRole(value: unknown): value is DispatcherRole {
    return typeof value === 'string'
        && Object.values(DispatcherRole).includes(value as DispatcherRole);
}

function isRestaurantStaffRole(value: unknown): value is RestaurantStaffRole {
    return typeof value === 'string'
        && Object.values(RestaurantStaffRole).includes(value as RestaurantStaffRole);
}

function parseRestaurantAccess(value: unknown): Array<{
    restaurantId: string;
    role: RestaurantStaffRole;
}> | null {
    if (!Array.isArray(value)) {
        return null;
    }

    const parsed = value.map((item) => {
        if (typeof item !== 'object' || item === null) {
            return null;
        }

        const access = item as Record<string, unknown>;
        const restaurantId = normalizeText(access.restaurantId);

        if (!restaurantId || !isRestaurantStaffRole(access.role)) {
            return null;
        }

        return {
            restaurantId,
            role: access.role,
        };
    });

    if (parsed.some((item) => {
        return item === null;
    })) {
        return null;
    }

    const deduped = new Map<string, RestaurantStaffRole>();

    parsed.forEach((item) => {
        if (item) {
            deduped.set(item.restaurantId, item.role);
        }
    });

    return Array.from(deduped.entries()).map(([restaurantId, role]) => {
        return {
            restaurantId,
            role,
        };
    });
}

export async function POST(request: NextRequest) {
    const ipRateLimitResponse = await enforceIpRateLimit(request, adminRateLimitPolicies.dispatcherUserMutationIp);

    if (ipRateLimitResponse) {
        return ipRateLimitResponse;
    }

    const dispatcherAccess = await requireDispatcherPermissionForRequest(request, 'users:manage');
    const dispatcherUser = dispatcherAccess.user;

    if (!dispatcherUser || !dispatcherAccess.allowed) {
        return NextResponse.json({ error: 'User manager access required.' }, { status: 403 });
    }

    const userRateLimitResponse = await enforceUserRateLimit(
        request,
        adminRateLimitPolicies.dispatcherUserMutationUser,
        dispatcherUser.id,
    );

    if (userRateLimitResponse) {
        return userRateLimitResponse;
    }

    let body: CreateUserBody;

    try {
        body = await request.json() as CreateUserBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const name = normalizeText(body.name);
    const email = normalizeText(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';

    if (body.role !== UserRole.DISPATCHER && body.role !== UserRole.VENDOR) {
        return NextResponse.json({ error: 'User managers can create dispatchers and vendors only.' }, { status: 400 });
    }

    const userRole = body.role;

    if (name.length < 2 || name.length > 80) {
        return NextResponse.json({ error: 'Name must be between 2 and 80 characters.' }, { status: 400 });
    }

    if (!isValidEmail(email) || email.length > 255) {
        return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    if (password.length < 8 || password.length > 128) {
        return NextResponse.json({ error: 'Password must be between 8 and 128 characters.' }, { status: 400 });
    }

    const nextDispatcherRole = userRole === UserRole.DISPATCHER
        ? body.dispatcherRole
        : undefined;

    if (userRole === UserRole.DISPATCHER && !isDispatcherRole(nextDispatcherRole)) {
        return NextResponse.json({ error: 'Choose a valid dispatcher access level.' }, { status: 400 });
    }

    if (
        userRole === UserRole.DISPATCHER
        && isDispatcherRole(nextDispatcherRole)
        && !canAssignDispatcherRole(dispatcherUser, nextDispatcherRole)
    ) {
        return NextResponse.json({ error: 'You cannot create a dispatcher with a higher access level than your own.' }, { status: 403 });
    }

    const restaurantAccess = userRole === UserRole.VENDOR
        ? parseRestaurantAccess(body.restaurantAccess)
        : null;

    if (userRole === UserRole.VENDOR && (!restaurantAccess || restaurantAccess.length === 0)) {
        return NextResponse.json({ error: 'Choose at least one restaurant for this vendor.' }, { status: 400 });
    }

    if (restaurantAccess) {
        const existingRestaurantCount = await prisma.restaurant.count({
            where: {
                id: {
                    in: restaurantAccess.map((access) => {
                        return access.restaurantId;
                    }),
                },
            },
        });

        if (existingRestaurantCount !== restaurantAccess.length) {
            return NextResponse.json({ error: 'One or more selected restaurants could not be found.' }, { status: 400 });
        }
    }

    try {
        const createdUser = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email,
                    name,
                    role: userRole,
                    updatedById: dispatcherUser.id,
                    dispatcherProfile: userRole === UserRole.DISPATCHER && isDispatcherRole(nextDispatcherRole)
                        ? {
                            create: {
                                role: nextDispatcherRole,
                            },
                        }
                        : undefined,
                },
                select: {
                    email: true,
                    id: true,
                    name: true,
                    role: true,
                },
            });

            const now = new Date();
            const hashedPassword = await hashPassword(password);

            await tx.account.create({
                data: {
                    accountId: user.id,
                    createdAt: now,
                    id: `credential_${user.id}`,
                    password: hashedPassword,
                    providerId: 'credential',
                    updatedAt: now,
                    userId: user.id,
                },
            });

            if (userRole === UserRole.VENDOR && restaurantAccess) {
                await tx.restaurantStaff.createMany({
                    data: restaurantAccess.map((access) => {
                        return {
                            restaurantId: access.restaurantId,
                            role: access.role,
                            userId: user.id,
                        };
                    }),
                });
            }

            return user;
        });

        return NextResponse.json({ user: createdUser }, { status: 201 });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return NextResponse.json({ error: 'Another user already has that email address.' }, { status: 409 });
        }

        throw error;
    }
}
