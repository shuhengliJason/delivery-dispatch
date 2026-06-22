import {
    RestaurantStaffRole,
    UserRole,
} from '@prisma/client';

import {
    getRestaurantAccessRoleKey,
    restaurantPermissionKeyByPermission,
} from './permission-definitions';
import { prisma } from './prisma';

export type VendorPermission =
    | 'orders:read'
    | 'orders:update'
    | 'menu:read'
    | 'menu:update'
    | 'profile:read'
    | 'profile:update';

export type VendorPermissionSet = {
    canReadOrders: boolean;
    canUpdateOrders: boolean;
    canReadMenu: boolean;
    canUpdateMenu: boolean;
    canReadProfile: boolean;
    canUpdateProfile: boolean;
};

export type AuthorizedRestaurant = {
    id: string;
    name: string;
    featureImageUrl: string | null;
    staffRole: RestaurantStaffRole | 'ADMIN';
    permissions: VendorPermissionSet;
};

const rolePermissions: Record<RestaurantStaffRole, VendorPermission[]> = {
    [RestaurantStaffRole.OWNER]: [
        'orders:read',
        'orders:update',
        'menu:read',
        'menu:update',
        'profile:read',
        'profile:update',
    ],
    [RestaurantStaffRole.MANAGER]: [
        'orders:read',
        'orders:update',
        'menu:read',
        'profile:read',
    ],
    [RestaurantStaffRole.ORDER_STAFF]: [
        'orders:read',
        'orders:update',
    ],
    [RestaurantStaffRole.VIEWER]: [
        'orders:read',
    ],
};

const restaurantStaffRoleRanks: Record<RestaurantStaffRole, number> = {
    [RestaurantStaffRole.VIEWER]: 1,
    [RestaurantStaffRole.ORDER_STAFF]: 2,
    [RestaurantStaffRole.MANAGER]: 3,
    [RestaurantStaffRole.OWNER]: 4,
};

function permissionsFromList(permissions: VendorPermission[]): VendorPermissionSet {
    const permissionSet = new Set(permissions);

    return {
        canReadOrders: permissionSet.has('orders:read'),
        canUpdateOrders: permissionSet.has('orders:update'),
        canReadMenu: permissionSet.has('menu:read'),
        canUpdateMenu: permissionSet.has('menu:update'),
        canReadProfile: permissionSet.has('profile:read'),
        canUpdateProfile: permissionSet.has('profile:update'),
    };
}

export function canManageRestaurantStaffRole(
    actorRole: RestaurantStaffRole | 'ADMIN',
    targetRole: RestaurantStaffRole,
): boolean {
    if (actorRole === 'ADMIN') {
        return true;
    }

    return restaurantStaffRoleRanks[actorRole] > restaurantStaffRoleRanks[targetRole];
}

export function canAssignRestaurantStaffRole(
    actorRole: RestaurantStaffRole | 'ADMIN',
    targetRole: RestaurantStaffRole,
): boolean {
    return canManageRestaurantStaffRole(actorRole, targetRole);
}

export function getPermissionsForStaffRole(
    role: RestaurantStaffRole | 'ADMIN',
): VendorPermissionSet {
    if (role === 'ADMIN') {
        return permissionsFromList([
            'orders:read',
            'orders:update',
            'menu:read',
            'menu:update',
            'profile:read',
            'profile:update',
        ]);
    }

    return permissionsFromList(rolePermissions[role]);
}

export function hasVendorPermission(
    role: RestaurantStaffRole | 'ADMIN',
    permission: VendorPermission,
): boolean {
    if (role === 'ADMIN') {
        return true;
    }

    return rolePermissions[role].includes(permission);
}

function isRestaurantStaffRole(value: string): value is RestaurantStaffRole {
    return Object.values(RestaurantStaffRole).includes(value as RestaurantStaffRole);
}

function getRestaurantRoleFromAccessRoleKey(roleKey: string): RestaurantStaffRole | null {
    const role = roleKey.replace(/^restaurant\./, '');

    return isRestaurantStaffRole(role) ? role : null;
}

async function getRestaurantStaffRolesForPermission(
    permission: VendorPermission,
): Promise<RestaurantStaffRole[]> {
    const permissionKey = restaurantPermissionKeyByPermission[permission];

    try {
        const [roleCount, roles] = await Promise.all([
            prisma.accessRole.count({
                where: {
                    scope: 'RESTAURANT',
                },
            }),
            prisma.accessRole.findMany({
                where: {
                    scope: 'RESTAURANT',
                    permissions: {
                        some: {
                            permission: {
                                key: permissionKey,
                            },
                        },
                    },
                },
                select: {
                    key: true,
                },
            }),
        ]);

        if (roleCount === 0) {
            return Object.entries(rolePermissions)
                .filter(([, permissions]) => {
                    return permissions.includes(permission);
                })
                .map(([role]) => {
                    return role as RestaurantStaffRole;
                });
        }

        return roles.flatMap((role) => {
            const restaurantRole = getRestaurantRoleFromAccessRoleKey(role.key);

            return restaurantRole ? [restaurantRole] : [];
        });
    } catch {
        return Object.entries(rolePermissions)
            .filter(([, permissions]) => {
                return permissions.includes(permission);
            })
            .map(([role]) => {
                return role as RestaurantStaffRole;
            });
    }
}

async function hasVendorPermissionFromDatabase(
    role: RestaurantStaffRole | 'ADMIN',
    permission: VendorPermission,
): Promise<boolean> {
    if (role === 'ADMIN') {
        return true;
    }

    const permissionKey = restaurantPermissionKeyByPermission[permission];
    const roleKey = getRestaurantAccessRoleKey(role);

    try {
        const accessRole = await prisma.accessRole.findUnique({
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

        if (!accessRole) {
            return hasVendorPermission(role, permission);
        }

        return accessRole.permissions.length > 0;
    } catch {
        return hasVendorPermission(role, permission);
    }
}

async function getPermissionsForStaffRoleFromDatabase(
    role: RestaurantStaffRole | 'ADMIN',
): Promise<VendorPermissionSet> {
    if (role === 'ADMIN') {
        return getPermissionsForStaffRole('ADMIN');
    }

    const roleKey = getRestaurantAccessRoleKey(role);
    const permissionKeysByPermission = Object.entries(restaurantPermissionKeyByPermission) as Array<[
        VendorPermission,
        string,
    ]>;

    try {
        const accessRole = await prisma.accessRole.findUnique({
            where: {
                key: roleKey,
            },
            select: {
                permissions: {
                    select: {
                        permission: {
                            select: {
                                key: true,
                            },
                        },
                    },
                },
            },
        });

        if (!accessRole) {
            return getPermissionsForStaffRole(role);
        }

        const permissionKeys = new Set(accessRole.permissions.map((rolePermission) => {
            return rolePermission.permission.key;
        }));
        const permissions = permissionKeysByPermission
            .filter(([, permissionKey]) => {
                return permissionKeys.has(permissionKey);
            })
            .map(([permission]) => {
                return permission;
            });

        return permissionsFromList(permissions);
    } catch {
        return getPermissionsForStaffRole(role);
    }
}

export async function getAuthorizedRestaurantsForUser(
    user: {
        id: string;
        role: UserRole;
    },
    permission?: VendorPermission,
): Promise<AuthorizedRestaurant[]> {
    if (user.role === UserRole.ADMIN) {
        const restaurants = await prisma.restaurant.findMany({
            orderBy: {
                name: 'asc',
            },
            select: {
                id: true,
                name: true,
                featureImageUrl: true,
            },
        });

        const permissions = await getPermissionsForStaffRoleFromDatabase('ADMIN');

        return restaurants.map((restaurant) => {
            return {
                ...restaurant,
                staffRole: 'ADMIN',
                permissions,
            };
        });
    }

    if (user.role !== UserRole.VENDOR) {
        return [];
    }

    const permittedRoles = permission
        ? await getRestaurantStaffRolesForPermission(permission)
        : null;

    const memberships = await prisma.restaurantStaff.findMany({
        where: {
            userId: user.id,
            ...(permission
                ? {
                    role: {
                        in: permittedRoles ?? [],
                    },
                }
                : {}),
        },
        include: {
            restaurant: {
                select: {
                    id: true,
                    name: true,
                    featureImageUrl: true,
                },
            },
        },
        orderBy: {
            restaurant: {
                name: 'asc',
            },
        },
    });

    return Promise.all(memberships.map(async (membership) => {
        return {
            id: membership.restaurant.id,
            name: membership.restaurant.name,
            featureImageUrl: membership.restaurant.featureImageUrl,
            staffRole: membership.role,
            permissions: await getPermissionsForStaffRoleFromDatabase(membership.role),
        };
    }));
}

export async function getRestaurantAuthorization(
    user: {
        id: string;
        role: UserRole;
    },
    restaurantId: string,
) {
    if (user.role === UserRole.ADMIN) {
        const restaurant = await prisma.restaurant.findUnique({
            where: {
                id: restaurantId,
            },
            select: {
                id: true,
            },
        });

        return restaurant
            ? {
                role: 'ADMIN' as const,
                permissions: await getPermissionsForStaffRoleFromDatabase('ADMIN'),
            }
            : null;
    }

    if (user.role !== UserRole.VENDOR) {
        return null;
    }

    const membership = await prisma.restaurantStaff.findUnique({
        where: {
            userId_restaurantId: {
                userId: user.id,
                restaurantId,
            },
        },
        select: {
            role: true,
        },
    });

    if (membership) {
        return {
            role: membership.role,
            permissions: await getPermissionsForStaffRoleFromDatabase(membership.role),
        };
    }

    const legacyOwnedRestaurant = await prisma.restaurant.findFirst({
        where: {
            id: restaurantId,
            vendorId: user.id,
        },
        select: {
            id: true,
        },
    });

    return legacyOwnedRestaurant
        ? {
            role: RestaurantStaffRole.OWNER,
            permissions: await getPermissionsForStaffRoleFromDatabase(RestaurantStaffRole.OWNER),
        }
        : null;
}

export async function requireRestaurantPermission(
    user: {
        id: string;
        role: UserRole;
    },
    restaurantId: string,
    permission: VendorPermission,
) {
    const authorization = await getRestaurantAuthorization(user, restaurantId);

    if (!authorization) {
        return {
            allowed: false,
            knownRestaurantMember: false,
        } as const;
    }

    return {
        allowed: await hasVendorPermissionFromDatabase(authorization.role, permission),
        knownRestaurantMember: true,
        authorization,
    } as const;
}
