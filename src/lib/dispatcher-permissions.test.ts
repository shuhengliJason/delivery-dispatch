import {
    DispatcherRole,
    UserRole,
} from '@prisma/client';
import type { NextRequest } from 'next/server';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

const mockServices = vi.hoisted(() => {
    return {
        auth: {
            api: {
                getSession: vi.fn(),
            },
        },
        prisma: {
            accessRole: {
                findUnique: vi.fn(),
            },
            user: {
                findUnique: vi.fn(),
            },
        },
    };
});

vi.mock('@/lib/auth', () => {
    return {
        auth: mockServices.auth,
    };
});

vi.mock('@/lib/prisma', () => {
    return {
        prisma: mockServices.prisma,
    };
});

function adminUser() {
    return {
        id: 'admin_1',
        role: UserRole.ADMIN,
    };
}

function dispatcherUser(role: DispatcherRole) {
    return {
        id: `dispatcher_${role}`,
        role: UserRole.DISPATCHER,
        dispatcherProfile: {
            role,
        },
    };
}

function customerUser() {
    return {
        id: 'customer_1',
        role: UserRole.CUSTOMER,
    };
}

describe('dispatcher permission helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('denies missing users and non-dispatcher app roles', async () => {
        const {
            canManageDispatcherOrders,
            canManageDispatcherUsers,
            canManageDispatcherUserRole,
            hasDispatcherPermission,
        } = await import('./dispatcher-permissions');

        expect(canManageDispatcherOrders(null)).toBe(false);
        expect(canManageDispatcherUsers(null)).toBe(false);
        expect(hasDispatcherPermission(customerUser(), 'orders:manage')).toBe(false);
        expect(canManageDispatcherUserRole(customerUser(), DispatcherRole.ORDER_OPERATOR)).toBe(false);
    });

    it('allows app admins to manage dispatcher orders, users, and dispatcher roles', async () => {
        const {
            canAssignDispatcherRole,
            canManageDispatcherAdminRole,
            canManageDispatcherOrders,
            canManageDispatcherUserRole,
            canManageDispatcherUsers,
            hasDispatcherPermission,
        } = await import('./dispatcher-permissions');
        const user = adminUser();

        expect(canManageDispatcherOrders(user)).toBe(true);
        expect(canManageDispatcherUsers(user)).toBe(true);
        expect(canManageDispatcherAdminRole(user)).toBe(true);
        expect(hasDispatcherPermission(user, 'orders:manage')).toBe(true);
        expect(hasDispatcherPermission(user, 'users:manage')).toBe(true);
        expect(canManageDispatcherUserRole(user, DispatcherRole.DISPATCHER_ADMIN)).toBe(true);
        expect(canAssignDispatcherRole(user, DispatcherRole.DISPATCHER_ADMIN)).toBe(true);
    });

    it('maps dispatcher roles to their allowed permission areas', async () => {
        const {
            canManageDispatcherOrders,
            canManageDispatcherUsers,
            hasDispatcherPermission,
        } = await import('./dispatcher-permissions');

        const orderOperator = dispatcherUser(DispatcherRole.ORDER_OPERATOR);
        const userManager = dispatcherUser(DispatcherRole.USER_MANAGER);
        const dispatcherAdmin = dispatcherUser(DispatcherRole.DISPATCHER_ADMIN);

        expect(canManageDispatcherOrders(orderOperator)).toBe(true);
        expect(canManageDispatcherUsers(orderOperator)).toBe(false);
        expect(hasDispatcherPermission(orderOperator, 'users:manage')).toBe(false);

        expect(canManageDispatcherOrders(userManager)).toBe(false);
        expect(canManageDispatcherUsers(userManager)).toBe(true);

        expect(canManageDispatcherOrders(dispatcherAdmin)).toBe(true);
        expect(canManageDispatcherUsers(dispatcherAdmin)).toBe(true);
    });

    it('uses dispatcher role rank for role management boundaries', async () => {
        const {
            canAssignDispatcherRole,
            canManageDispatcherAdminRole,
            canManageDispatcherUserRole,
        } = await import('./dispatcher-permissions');

        const userManager = dispatcherUser(DispatcherRole.USER_MANAGER);
        const dispatcherAdmin = dispatcherUser(DispatcherRole.DISPATCHER_ADMIN);

        expect(canManageDispatcherAdminRole(userManager)).toBe(false);
        expect(canManageDispatcherUserRole(userManager, DispatcherRole.ORDER_OPERATOR)).toBe(true);
        expect(canManageDispatcherUserRole(userManager, DispatcherRole.USER_MANAGER)).toBe(true);
        expect(canManageDispatcherUserRole(userManager, DispatcherRole.DISPATCHER_ADMIN)).toBe(false);
        expect(canAssignDispatcherRole(userManager, DispatcherRole.DISPATCHER_ADMIN)).toBe(false);

        expect(canManageDispatcherAdminRole(dispatcherAdmin)).toBe(true);
        expect(canManageDispatcherUserRole(dispatcherAdmin, DispatcherRole.DISPATCHER_ADMIN)).toBe(true);
    });

    it('uses database permission records when access roles exist', async () => {
        const { hasDispatcherPermissionFromDatabase } = await import('./dispatcher-permissions');
        mockServices.prisma.accessRole.findUnique.mockResolvedValue({
            permissions: [
                {
                    permissionId: 'permission_1',
                },
            ],
        });

        await expect(
            hasDispatcherPermissionFromDatabase(dispatcherUser(DispatcherRole.ORDER_OPERATOR), 'orders:manage'),
        ).resolves.toBe(true);
        expect(mockServices.prisma.accessRole.findUnique).toHaveBeenCalledWith({
            where: {
                key: 'dispatcher.ORDER_OPERATOR',
            },
            select: {
                permissions: {
                    where: {
                        permission: {
                            key: 'dispatcher.orders.manage',
                        },
                    },
                    select: {
                        permissionId: true,
                    },
                    take: 1,
                },
            },
        });
    });

    it('denies database-backed dispatcher permissions when the access role has no matching permission', async () => {
        const { hasDispatcherPermissionFromDatabase } = await import('./dispatcher-permissions');
        mockServices.prisma.accessRole.findUnique.mockResolvedValue({
            permissions: [],
        });

        await expect(
            hasDispatcherPermissionFromDatabase(dispatcherUser(DispatcherRole.ORDER_OPERATOR), 'orders:manage'),
        ).resolves.toBe(false);
    });

    it('falls back to static dispatcher permissions when access roles are missing or unavailable', async () => {
        const { hasDispatcherPermissionFromDatabase } = await import('./dispatcher-permissions');

        mockServices.prisma.accessRole.findUnique.mockResolvedValueOnce(null);
        await expect(
            hasDispatcherPermissionFromDatabase(dispatcherUser(DispatcherRole.ORDER_OPERATOR), 'orders:manage'),
        ).resolves.toBe(true);

        mockServices.prisma.accessRole.findUnique.mockRejectedValueOnce(new Error('database unavailable'));
        await expect(
            hasDispatcherPermissionFromDatabase(dispatcherUser(DispatcherRole.ORDER_OPERATOR), 'users:manage'),
        ).resolves.toBe(false);
    });

    it('loads dispatcher permission users by id', async () => {
        const { getDispatcherPermissionUserById } = await import('./dispatcher-permissions');
        const databaseUser = dispatcherUser(DispatcherRole.DISPATCHER_ADMIN);
        mockServices.prisma.user.findUnique.mockResolvedValue(databaseUser);

        await expect(getDispatcherPermissionUserById('user_1')).resolves.toEqual(databaseUser);
        expect(mockServices.prisma.user.findUnique).toHaveBeenCalledWith({
            where: {
                id: 'user_1',
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
    });

    it('requires a session and database-backed dispatcher permission for requests', async () => {
        const { requireDispatcherPermissionForRequest } = await import('./dispatcher-permissions');
        const request = {
            headers: new Headers(),
        } as NextRequest;

        mockServices.auth.api.getSession.mockResolvedValueOnce(null);
        await expect(requireDispatcherPermissionForRequest(request, 'orders:manage')).resolves.toEqual({
            allowed: false,
            user: null,
        });

        mockServices.auth.api.getSession.mockResolvedValueOnce({
            user: {
                id: 'user_1',
            },
        });
        mockServices.prisma.user.findUnique.mockResolvedValueOnce(dispatcherUser(DispatcherRole.ORDER_OPERATOR));
        mockServices.prisma.accessRole.findUnique.mockResolvedValueOnce({
            permissions: [
                {
                    permissionId: 'permission_1',
                },
            ],
        });

        await expect(requireDispatcherPermissionForRequest(request, 'orders:manage')).resolves.toEqual({
            allowed: true,
            user: dispatcherUser(DispatcherRole.ORDER_OPERATOR),
        });
    });
});
