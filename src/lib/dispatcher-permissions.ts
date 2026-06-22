import {
    DispatcherRole,
    UserRole,
} from '@prisma/client';
import { type NextRequest } from 'next/server';

import { auth } from '@/lib/auth';
import {
    dispatcherPermissionKeyByPermission,
    getDispatcherAccessRoleKey,
} from '@/lib/permission-definitions';
import { prisma } from '@/lib/prisma';

export type DispatcherPermission =
    | 'orders:manage'
    | 'users:manage';

export type DispatcherPermissionUser = {
    id: string;
    name?: string;
    role: UserRole;
    dispatcherProfile?: {
        role: DispatcherRole;
    } | null;
};

const dispatcherRolePermissions: Record<DispatcherRole, DispatcherPermission[]> = {
    [DispatcherRole.ORDER_OPERATOR]: [
        'orders:manage',
    ],
    [DispatcherRole.USER_MANAGER]: [
        'users:manage',
    ],
    [DispatcherRole.DISPATCHER_ADMIN]: [
        'orders:manage',
        'users:manage',
    ],
};

const dispatcherRoleRanks: Record<DispatcherRole, number> = {
    [DispatcherRole.ORDER_OPERATOR]: 1,
    [DispatcherRole.USER_MANAGER]: 2,
    [DispatcherRole.DISPATCHER_ADMIN]: 3,
};

export const dispatcherRoleLabels: Record<DispatcherRole, string> = {
    [DispatcherRole.ORDER_OPERATOR]: 'Order Operator',
    [DispatcherRole.USER_MANAGER]: 'User Manager',
    [DispatcherRole.DISPATCHER_ADMIN]: 'Dispatcher Admin',
};

export function canManageDispatcherOrders(user: DispatcherPermissionUser | null): boolean {
    return hasDispatcherPermission(user, 'orders:manage');
}

export function canManageDispatcherUsers(user: DispatcherPermissionUser | null): boolean {
    return hasDispatcherPermission(user, 'users:manage');
}

export async function canManageDispatcherOrdersFromDatabase(user: DispatcherPermissionUser | null): Promise<boolean> {
    return hasDispatcherPermissionFromDatabase(user, 'orders:manage');
}

export async function canManageDispatcherUsersFromDatabase(user: DispatcherPermissionUser | null): Promise<boolean> {
    return hasDispatcherPermissionFromDatabase(user, 'users:manage');
}

export function canManageDispatcherAdminRole(user: DispatcherPermissionUser | null): boolean {
    if (!user) {
        return false;
    }

    return user.role === UserRole.ADMIN
        || user.dispatcherProfile?.role === DispatcherRole.DISPATCHER_ADMIN;
}

export function canManageDispatcherUserRole(
    user: DispatcherPermissionUser | null,
    targetRole: DispatcherRole,
): boolean {
    if (!user) {
        return false;
    }

    if (user.role === UserRole.ADMIN) {
        return true;
    }

    if (user.role !== UserRole.DISPATCHER || !user.dispatcherProfile) {
        return false;
    }

    return dispatcherRoleRanks[user.dispatcherProfile.role] >= dispatcherRoleRanks[targetRole];
}

export function canAssignDispatcherRole(
    user: DispatcherPermissionUser | null,
    targetRole: DispatcherRole,
): boolean {
    return canManageDispatcherUserRole(user, targetRole);
}

export function hasDispatcherPermission(
    user: DispatcherPermissionUser | null,
    permission: DispatcherPermission,
): boolean {
    if (!user) {
        return false;
    }

    if (user.role === UserRole.ADMIN) {
        return true;
    }

    if (user.role !== UserRole.DISPATCHER || !user.dispatcherProfile) {
        return false;
    }

    return dispatcherRolePermissions[user.dispatcherProfile.role].includes(permission);
}

export async function hasDispatcherPermissionFromDatabase(
    user: DispatcherPermissionUser | null,
    permission: DispatcherPermission,
): Promise<boolean> {
    if (!user) {
        return false;
    }

    if (user.role === UserRole.ADMIN) {
        return true;
    }

    if (user.role !== UserRole.DISPATCHER || !user.dispatcherProfile) {
        return false;
    }

    const permissionKey = dispatcherPermissionKeyByPermission[permission];
    const roleKey = getDispatcherAccessRoleKey(user.dispatcherProfile.role);

    try {
        const role = await prisma.accessRole.findUnique({
            where: {
                key: roleKey,
            },
            select: {
                permissions: {
                    where: {
                        permission: {
                            key: permissionKey,
                        },
                    },
                    select: {
                        permissionId: true,
                    },
                    take: 1,
                },
            },
        });

        if (!role) {
            return hasDispatcherPermission(user, permission);
        }

        return role.permissions.length > 0;
    } catch {
        return hasDispatcherPermission(user, permission);
    }
}

export async function getDispatcherPermissionUserById(userId: string): Promise<DispatcherPermissionUser | null> {
    return prisma.user.findUnique({
        where: {
            id: userId,
        },
        select: {
            id: true,
            name: true,
            role: true,
            dispatcherProfile: {
                select: {
                    role: true,
                },
            },
        },
    });
}

export async function requireDispatcherPermissionForRequest(
    request: NextRequest,
    permission: DispatcherPermission,
): Promise<{
    allowed: boolean;
    user: DispatcherPermissionUser | null;
}> {
    const session = await auth.api.getSession({
        headers: request.headers,
    });

    if (!session?.user?.id) {
        return {
            allowed: false,
            user: null,
        };
    }

    const user = await getDispatcherPermissionUserById(session.user.id);

    return {
        allowed: await hasDispatcherPermissionFromDatabase(user, permission),
        user,
    };
}
