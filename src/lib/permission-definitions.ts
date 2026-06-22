import {
    DispatcherRole,
    RestaurantStaffRole,
} from '@prisma/client';

export type AccessPermissionDefinition = {
    description: string;
    key: string;
    name: string;
    scope: 'DISPATCHER' | 'GLOBAL' | 'RESTAURANT';
};

export type AccessRoleDefinition = {
    description: string;
    key: string;
    name: string;
    permissionKeys: string[];
    rank: number;
    scope: 'DISPATCHER' | 'GLOBAL' | 'RESTAURANT';
};

export const dispatcherPermissionKeyByPermission = {
    'orders:manage': 'dispatcher.orders.manage',
    'users:manage': 'dispatcher.users.manage',
} as const;

export const restaurantPermissionKeyByPermission = {
    'orders:read': 'restaurant.orders.read',
    'orders:update': 'restaurant.orders.update',
    'menu:read': 'restaurant.menu.read',
    'menu:update': 'restaurant.menu.update',
    'profile:read': 'restaurant.profile.read',
    'profile:update': 'restaurant.profile.update',
} as const;

export const permissionDefinitions = [
    {
        description: 'View and update dispatcher order exceptions.',
        key: dispatcherPermissionKeyByPermission['orders:manage'],
        name: 'Manage dispatcher orders',
        scope: 'DISPATCHER',
    },
    {
        description: 'Create and update dispatcher-managed user accounts.',
        key: dispatcherPermissionKeyByPermission['users:manage'],
        name: 'Manage dispatcher users',
        scope: 'DISPATCHER',
    },
    {
        description: 'View restaurant orders.',
        key: restaurantPermissionKeyByPermission['orders:read'],
        name: 'Read restaurant orders',
        scope: 'RESTAURANT',
    },
    {
        description: 'Update restaurant order status.',
        key: restaurantPermissionKeyByPermission['orders:update'],
        name: 'Update restaurant orders',
        scope: 'RESTAURANT',
    },
    {
        description: 'View menu items and option groups.',
        key: restaurantPermissionKeyByPermission['menu:read'],
        name: 'Read restaurant menu',
        scope: 'RESTAURANT',
    },
    {
        description: 'Update menu items and option groups.',
        key: restaurantPermissionKeyByPermission['menu:update'],
        name: 'Update restaurant menu',
        scope: 'RESTAURANT',
    },
    {
        description: 'View restaurant profile details.',
        key: restaurantPermissionKeyByPermission['profile:read'],
        name: 'Read restaurant profile',
        scope: 'RESTAURANT',
    },
    {
        description: 'Update restaurant profile details.',
        key: restaurantPermissionKeyByPermission['profile:update'],
        name: 'Update restaurant profile',
        scope: 'RESTAURANT',
    },
] satisfies AccessPermissionDefinition[];

export function getDispatcherAccessRoleKey(role: DispatcherRole): string {
    return `dispatcher.${role}`;
}

export function getRestaurantAccessRoleKey(role: RestaurantStaffRole): string {
    return `restaurant.${role}`;
}

export const accessRoleDefinitions = [
    {
        description: 'Can manage dispatcher order exceptions.',
        key: getDispatcherAccessRoleKey(DispatcherRole.ORDER_OPERATOR),
        name: 'Order Operator',
        permissionKeys: [
            dispatcherPermissionKeyByPermission['orders:manage'],
        ],
        rank: 1,
        scope: 'DISPATCHER',
    },
    {
        description: 'Can manage dispatcher user accounts.',
        key: getDispatcherAccessRoleKey(DispatcherRole.USER_MANAGER),
        name: 'User Manager',
        permissionKeys: [
            dispatcherPermissionKeyByPermission['users:manage'],
        ],
        rank: 2,
        scope: 'DISPATCHER',
    },
    {
        description: 'Can manage dispatcher orders and users.',
        key: getDispatcherAccessRoleKey(DispatcherRole.DISPATCHER_ADMIN),
        name: 'Dispatcher Admin',
        permissionKeys: [
            dispatcherPermissionKeyByPermission['orders:manage'],
            dispatcherPermissionKeyByPermission['users:manage'],
        ],
        rank: 3,
        scope: 'DISPATCHER',
    },
    {
        description: 'Can view restaurant orders.',
        key: getRestaurantAccessRoleKey(RestaurantStaffRole.VIEWER),
        name: 'Viewer',
        permissionKeys: [
            restaurantPermissionKeyByPermission['orders:read'],
        ],
        rank: 1,
        scope: 'RESTAURANT',
    },
    {
        description: 'Can view and update restaurant orders.',
        key: getRestaurantAccessRoleKey(RestaurantStaffRole.ORDER_STAFF),
        name: 'Order Staff',
        permissionKeys: [
            restaurantPermissionKeyByPermission['orders:read'],
            restaurantPermissionKeyByPermission['orders:update'],
        ],
        rank: 2,
        scope: 'RESTAURANT',
    },
    {
        description: 'Can manage orders and read menu/profile details.',
        key: getRestaurantAccessRoleKey(RestaurantStaffRole.MANAGER),
        name: 'Manager',
        permissionKeys: [
            restaurantPermissionKeyByPermission['orders:read'],
            restaurantPermissionKeyByPermission['orders:update'],
            restaurantPermissionKeyByPermission['menu:read'],
            restaurantPermissionKeyByPermission['profile:read'],
        ],
        rank: 3,
        scope: 'RESTAURANT',
    },
    {
        description: 'Can manage restaurant orders, menu, profile, and staff.',
        key: getRestaurantAccessRoleKey(RestaurantStaffRole.OWNER),
        name: 'Owner',
        permissionKeys: [
            restaurantPermissionKeyByPermission['orders:read'],
            restaurantPermissionKeyByPermission['orders:update'],
            restaurantPermissionKeyByPermission['menu:read'],
            restaurantPermissionKeyByPermission['menu:update'],
            restaurantPermissionKeyByPermission['profile:read'],
            restaurantPermissionKeyByPermission['profile:update'],
        ],
        rank: 4,
        scope: 'RESTAURANT',
    },
] satisfies AccessRoleDefinition[];
