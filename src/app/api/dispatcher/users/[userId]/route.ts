import {
    DispatcherRole,
    DriverStatus,
    Prisma,
    RestaurantStaffRole,
    UserRole,
} from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';

import {
    canAssignDispatcherRole,
    canManageDispatcherUserRole,
    requireDispatcherPermissionForRequest,
} from '@/lib/dispatcher-permissions';
import { prisma } from '@/lib/prisma';
import {
    adminRateLimitPolicies,
    enforceIpRateLimit,
    enforceUserRateLimit,
} from '@/lib/rate-limit';

type UpdateUserBody = {
    dispatcherRole?: unknown;
    driverStatus?: unknown;
    expectedRole?: unknown;
    name?: unknown;
    phone?: unknown;
    restaurantAccess?: unknown;
};

type DispatcherUserRouteContext = {
    params: Promise<{
        userId: string;
    }>;
};

const manageableRoles: UserRole[] = [
    UserRole.CUSTOMER,
    UserRole.VENDOR,
    UserRole.DRIVER,
    UserRole.DISPATCHER,
];

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isManageableRole(value: unknown): value is UserRole {
    return typeof value === 'string'
        && manageableRoles.includes(value as UserRole);
}

function isDriverStatus(value: unknown): value is DriverStatus {
    return typeof value === 'string'
        && Object.values(DriverStatus).includes(value as DriverStatus);
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

export async function PATCH(
    request: NextRequest,
    { params }: DispatcherUserRouteContext,
) {
    const ipRateLimitResponse = await enforceIpRateLimit(request, adminRateLimitPolicies.dispatcherUserMutationIp);

    if (ipRateLimitResponse) {
        return ipRateLimitResponse;
    }

    const dispatcherAdminAccess = await requireDispatcherPermissionForRequest(request, 'users:manage');
    const dispatcherAdminUser = dispatcherAdminAccess.user;

    if (!dispatcherAdminUser || !dispatcherAdminAccess.allowed) {
        return NextResponse.json({ error: 'Dispatcher admin access required.' }, { status: 403 });
    }

    const userRateLimitResponse = await enforceUserRateLimit(
        request,
        adminRateLimitPolicies.dispatcherUserMutationUser,
        dispatcherAdminUser.id,
    );

    if (userRateLimitResponse) {
        return userRateLimitResponse;
    }

    let body: UpdateUserBody;

    try {
        body = await request.json() as UpdateUserBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { userId } = await params;
    const name = normalizeText(body.name);
    const phone = normalizeText(body.phone);

    if (name.length < 2 || name.length > 80) {
        return NextResponse.json({ error: 'Name must be between 2 and 80 characters.' }, { status: 400 });
    }

    if (phone.length > 40) {
        return NextResponse.json({ error: 'Phone must be 40 characters or less.' }, { status: 400 });
    }

    if (!isManageableRole(body.expectedRole)) {
        return NextResponse.json({ error: 'Choose a valid user type.' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
        where: {
            id: userId,
        },
        select: {
            dispatcherProfile: {
                select: {
                    role: true,
                },
            },
            id: true,
            role: true,
        },
    });

    if (!existingUser || !manageableRoles.includes(existingUser.role)) {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    if (existingUser.role !== body.expectedRole) {
        return NextResponse.json({ error: 'This user belongs to a different account type.' }, { status: 409 });
    }

    if (existingUser.role === UserRole.DRIVER && !isDriverStatus(body.driverStatus)) {
        return NextResponse.json({ error: 'Choose a valid driver status.' }, { status: 400 });
    }

    const nextDispatcherRole = existingUser.role === UserRole.DISPATCHER
        ? body.dispatcherRole
        : undefined;

    if (existingUser.role === UserRole.DISPATCHER && !isDispatcherRole(nextDispatcherRole)) {
        return NextResponse.json({ error: 'Choose a valid dispatcher access level.' }, { status: 400 });
    }

    if (
        existingUser.role === UserRole.DISPATCHER
        && existingUser.dispatcherProfile
        && !canManageDispatcherUserRole(dispatcherAdminUser, existingUser.dispatcherProfile.role)
    ) {
        return NextResponse.json({ error: 'You cannot modify a dispatcher with a higher access level than your own.' }, { status: 403 });
    }

    if (
        existingUser.role === UserRole.DISPATCHER
        && isDispatcherRole(nextDispatcherRole)
        && !canAssignDispatcherRole(dispatcherAdminUser, nextDispatcherRole)
    ) {
        return NextResponse.json({ error: 'You cannot assign a dispatcher access level higher than your own.' }, { status: 403 });
    }

    if (
        existingUser.role === UserRole.DISPATCHER
        && dispatcherAdminUser.role !== UserRole.ADMIN
        && dispatcherAdminUser.dispatcherProfile?.role !== DispatcherRole.DISPATCHER_ADMIN
        && nextDispatcherRole !== existingUser.dispatcherProfile?.role
    ) {
        return NextResponse.json({ error: 'Dispatcher admin access is required to change dispatcher access levels.' }, { status: 403 });
    }

    if (
        existingUser.role === UserRole.DISPATCHER
        && dispatcherAdminUser.role !== UserRole.ADMIN
        && existingUser.id === dispatcherAdminUser.id
        && nextDispatcherRole !== existingUser.dispatcherProfile?.role
    ) {
        return NextResponse.json({ error: 'You cannot change your own dispatcher access level.' }, { status: 400 });
    }

    if (
        existingUser.role === UserRole.DISPATCHER
        && existingUser.dispatcherProfile?.role === DispatcherRole.DISPATCHER_ADMIN
        && nextDispatcherRole !== DispatcherRole.DISPATCHER_ADMIN
    ) {
        const adminCount = await prisma.dispatcherProfile.count({
            where: {
                role: DispatcherRole.DISPATCHER_ADMIN,
                user: {
                    role: UserRole.DISPATCHER,
                },
            },
        });

        if (adminCount <= 1) {
            return NextResponse.json({ error: 'At least one dispatcher admin must remain.' }, { status: 400 });
        }
    }

    const restaurantAccess = existingUser.role === UserRole.VENDOR
        ? parseRestaurantAccess(body.restaurantAccess)
        : null;

    if (existingUser.role === UserRole.VENDOR && restaurantAccess === null) {
        return NextResponse.json({ error: 'Choose valid restaurant access for this vendor.' }, { status: 400 });
    }

    if (restaurantAccess && restaurantAccess.length > 0) {
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
        const updatedUser = await prisma.$transaction(async (tx) => {
            const user = await tx.user.update({
                where: {
                    id: userId,
                },
                data: {
                    name,
                    updatedById: dispatcherAdminUser.id,
                },
                select: {
                    email: true,
                    id: true,
                    name: true,
                    role: true,
                },
            });

            if (existingUser.role === UserRole.CUSTOMER) {
                await tx.customerProfile.upsert({
                    where: {
                        userId,
                    },
                    update: {
                        phone: phone || null,
                    },
                    create: {
                        phone: phone || null,
                        userId,
                    },
                });
            }

            if (existingUser.role === UserRole.DRIVER) {
                await tx.driverProfile.upsert({
                    where: {
                        userId,
                    },
                    update: {
                        phone: phone || null,
                        status: body.driverStatus as DriverStatus,
                    },
                    create: {
                        phone: phone || null,
                        status: body.driverStatus as DriverStatus,
                        userId,
                    },
                });
            }

            if (existingUser.role === UserRole.DISPATCHER && isDispatcherRole(nextDispatcherRole)) {
                await tx.dispatcherProfile.upsert({
                    where: {
                        userId,
                    },
                    update: {
                        role: nextDispatcherRole,
                    },
                    create: {
                        role: nextDispatcherRole,
                        userId,
                    },
                });
            }

            if (existingUser.role === UserRole.VENDOR && restaurantAccess) {
                await tx.restaurantStaff.deleteMany({
                    where: {
                        userId,
                    },
                });

                if (restaurantAccess.length > 0) {
                    await tx.restaurantStaff.createMany({
                        data: restaurantAccess.map((access) => {
                            return {
                                restaurantId: access.restaurantId,
                                role: access.role,
                                userId,
                            };
                        }),
                    });
                }
            }

            return user;
        });

        return NextResponse.json({ user: updatedUser });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return NextResponse.json({ error: 'Another user already has that email address.' }, { status: 409 });
        }

        throw error;
    }
}
