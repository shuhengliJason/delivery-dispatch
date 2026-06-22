import {
    RestaurantStaffRole,
    UserRole,
} from '@prisma/client';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

const mockDb = vi.hoisted(() => {
    return {
        prisma: {
            accessRole: {
                count: vi.fn(),
                findMany: vi.fn(),
                findUnique: vi.fn(),
            },
            restaurant: {
                findFirst: vi.fn(),
                findMany: vi.fn(),
                findUnique: vi.fn(),
            },
            restaurantStaff: {
                findMany: vi.fn(),
                findUnique: vi.fn(),
            },
        },
    };
});

vi.mock('./prisma', () => {
    return {
        prisma: mockDb.prisma,
    };
});

function vendorUser(id = 'vendor_1') {
    return {
        id,
        role: UserRole.VENDOR,
    };
}

function adminUser() {
    return {
        id: 'admin_1',
        role: UserRole.ADMIN,
    };
}

function customerUser() {
    return {
        id: 'customer_1',
        role: UserRole.CUSTOMER,
    };
}

function databasePermissionSet(permissionKeys: string[]) {
    return {
        permissions: permissionKeys.map((key) => {
            return {
                permission: {
                    key,
                },
            };
        }),
    };
}

describe('vendor permission helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('maps restaurant staff roles to static permissions', async () => {
        const {
            getPermissionsForStaffRole,
            hasVendorPermission,
        } = await import('./vendor-permissions');

        expect(getPermissionsForStaffRole(RestaurantStaffRole.OWNER)).toEqual({
            canReadOrders: true,
            canUpdateOrders: true,
            canReadMenu: true,
            canUpdateMenu: true,
            canReadProfile: true,
            canUpdateProfile: true,
        });

        expect(getPermissionsForStaffRole(RestaurantStaffRole.MANAGER)).toMatchObject({
            canReadOrders: true,
            canUpdateOrders: true,
            canReadMenu: true,
            canUpdateMenu: false,
            canReadProfile: true,
            canUpdateProfile: false,
        });

        expect(getPermissionsForStaffRole(RestaurantStaffRole.ORDER_STAFF)).toMatchObject({
            canReadOrders: true,
            canUpdateOrders: true,
            canReadMenu: false,
        });

        expect(getPermissionsForStaffRole(RestaurantStaffRole.VIEWER)).toMatchObject({
            canReadOrders: true,
            canUpdateOrders: false,
        });

        expect(hasVendorPermission(RestaurantStaffRole.VIEWER, 'orders:read')).toBe(true);
        expect(hasVendorPermission(RestaurantStaffRole.VIEWER, 'orders:update')).toBe(false);
        expect(hasVendorPermission('ADMIN', 'profile:update')).toBe(true);
    });

    it('uses strict restaurant staff hierarchy for staff management and assignment', async () => {
        const {
            canAssignRestaurantStaffRole,
            canManageRestaurantStaffRole,
        } = await import('./vendor-permissions');

        expect(canManageRestaurantStaffRole('ADMIN', RestaurantStaffRole.OWNER)).toBe(true);
        expect(canManageRestaurantStaffRole(RestaurantStaffRole.OWNER, RestaurantStaffRole.MANAGER)).toBe(true);
        expect(canManageRestaurantStaffRole(RestaurantStaffRole.OWNER, RestaurantStaffRole.OWNER)).toBe(false);
        expect(canManageRestaurantStaffRole(RestaurantStaffRole.MANAGER, RestaurantStaffRole.OWNER)).toBe(false);
        expect(canManageRestaurantStaffRole(RestaurantStaffRole.MANAGER, RestaurantStaffRole.ORDER_STAFF)).toBe(true);
        expect(canAssignRestaurantStaffRole(RestaurantStaffRole.ORDER_STAFF, RestaurantStaffRole.VIEWER)).toBe(true);
        expect(canAssignRestaurantStaffRole(RestaurantStaffRole.ORDER_STAFF, RestaurantStaffRole.ORDER_STAFF)).toBe(false);
    });

    it('returns all restaurants with admin permissions for app admins', async () => {
        const { getAuthorizedRestaurantsForUser } = await import('./vendor-permissions');
        mockDb.prisma.restaurant.findMany.mockResolvedValue([
            {
                featureImageUrl: null,
                id: 'restaurant_1',
                name: 'Sakura Sushi',
            },
        ]);

        const restaurants = await getAuthorizedRestaurantsForUser(adminUser(), 'orders:read');

        expect(restaurants).toEqual([
            {
                featureImageUrl: null,
                id: 'restaurant_1',
                name: 'Sakura Sushi',
                staffRole: 'ADMIN',
                permissions: {
                    canReadOrders: true,
                    canUpdateOrders: true,
                    canReadMenu: true,
                    canUpdateMenu: true,
                    canReadProfile: true,
                    canUpdateProfile: true,
                },
            },
        ]);
        expect(mockDb.prisma.restaurant.findMany).toHaveBeenCalledWith({
            orderBy: {
                name: 'asc',
            },
            select: {
                id: true,
                name: true,
                featureImageUrl: true,
            },
        });
    });

    it('returns no authorized restaurants for non-vendor users', async () => {
        const { getAuthorizedRestaurantsForUser } = await import('./vendor-permissions');

        await expect(getAuthorizedRestaurantsForUser(customerUser(), 'orders:read')).resolves.toEqual([]);
        expect(mockDb.prisma.restaurantStaff.findMany).not.toHaveBeenCalled();
    });

    it('filters vendor restaurants by roles permitted for the requested permission', async () => {
        const { getAuthorizedRestaurantsForUser } = await import('./vendor-permissions');
        mockDb.prisma.accessRole.count.mockResolvedValue(0);
        mockDb.prisma.restaurantStaff.findMany.mockResolvedValue([
            {
                role: RestaurantStaffRole.ORDER_STAFF,
                restaurant: {
                    featureImageUrl: 'image.jpg',
                    id: 'restaurant_1',
                    name: 'Sakura Sushi',
                },
            },
        ]);
        mockDb.prisma.accessRole.findUnique.mockResolvedValue(null);

        const restaurants = await getAuthorizedRestaurantsForUser(vendorUser(), 'orders:update');

        expect(mockDb.prisma.restaurantStaff.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                userId: 'vendor_1',
                role: {
                    in: [
                        RestaurantStaffRole.OWNER,
                        RestaurantStaffRole.MANAGER,
                        RestaurantStaffRole.ORDER_STAFF,
                    ],
                },
            },
        }));
        expect(restaurants).toEqual([
            expect.objectContaining({
                id: 'restaurant_1',
                staffRole: RestaurantStaffRole.ORDER_STAFF,
                permissions: expect.objectContaining({
                    canUpdateOrders: true,
                    canUpdateMenu: false,
                }) as unknown,
            }),
        ]);
    });

    it('uses database restaurant role definitions when they exist', async () => {
        const { getAuthorizedRestaurantsForUser } = await import('./vendor-permissions');
        mockDb.prisma.accessRole.count.mockResolvedValue(4);
        mockDb.prisma.accessRole.findMany.mockResolvedValue([
            {
                key: 'restaurant.OWNER',
            },
        ]);
        mockDb.prisma.restaurantStaff.findMany.mockResolvedValue([
            {
                role: RestaurantStaffRole.OWNER,
                restaurant: {
                    featureImageUrl: null,
                    id: 'restaurant_1',
                    name: 'Owner Only',
                },
            },
        ]);
        mockDb.prisma.accessRole.findUnique.mockResolvedValue(databasePermissionSet([
            'restaurant.orders.read',
            'restaurant.profile.update',
        ]));

        const restaurants = await getAuthorizedRestaurantsForUser(vendorUser(), 'profile:update');

        expect(mockDb.prisma.accessRole.findMany).toHaveBeenCalledWith({
            where: {
                scope: 'RESTAURANT',
                permissions: {
                    some: {
                        permission: {
                            key: 'restaurant.profile.update',
                        },
                    },
                },
            },
            select: {
                key: true,
            },
        });
        expect(restaurants[0]?.permissions).toMatchObject({
            canReadOrders: true,
            canUpdateProfile: true,
            canUpdateMenu: false,
        });
    });

    it('returns admin restaurant authorization only for existing restaurants', async () => {
        const { getRestaurantAuthorization } = await import('./vendor-permissions');

        mockDb.prisma.restaurant.findUnique.mockResolvedValueOnce(null);
        await expect(getRestaurantAuthorization(adminUser(), 'missing')).resolves.toBeNull();

        mockDb.prisma.restaurant.findUnique.mockResolvedValueOnce({
            id: 'restaurant_1',
        });
        await expect(getRestaurantAuthorization(adminUser(), 'restaurant_1')).resolves.toEqual({
            role: 'ADMIN',
            permissions: expect.objectContaining({
                canUpdateMenu: true,
                canUpdateProfile: true,
            }) as unknown,
        });
    });

    it('returns null restaurant authorization for wrong app roles and wrong memberships', async () => {
        const { getRestaurantAuthorization } = await import('./vendor-permissions');

        await expect(getRestaurantAuthorization(customerUser(), 'restaurant_1')).resolves.toBeNull();

        mockDb.prisma.restaurantStaff.findUnique.mockResolvedValue(null);
        mockDb.prisma.restaurant.findFirst.mockResolvedValue(null);

        await expect(getRestaurantAuthorization(vendorUser(), 'restaurant_1')).resolves.toBeNull();
    });

    it('authorizes direct restaurant memberships before legacy ownership', async () => {
        const { getRestaurantAuthorization } = await import('./vendor-permissions');
        mockDb.prisma.restaurantStaff.findUnique.mockResolvedValue({
            role: RestaurantStaffRole.MANAGER,
        });
        mockDb.prisma.accessRole.findUnique.mockResolvedValue(null);

        await expect(getRestaurantAuthorization(vendorUser(), 'restaurant_1')).resolves.toEqual({
            role: RestaurantStaffRole.MANAGER,
            permissions: expect.objectContaining({
                canReadMenu: true,
                canUpdateMenu: false,
            }) as unknown,
        });
        expect(mockDb.prisma.restaurant.findFirst).not.toHaveBeenCalled();
    });

    it('supports legacy vendor-owned restaurants as owner authorization', async () => {
        const { getRestaurantAuthorization } = await import('./vendor-permissions');
        mockDb.prisma.restaurantStaff.findUnique.mockResolvedValue(null);
        mockDb.prisma.restaurant.findFirst.mockResolvedValue({
            id: 'restaurant_1',
        });
        mockDb.prisma.accessRole.findUnique.mockResolvedValue(null);

        await expect(getRestaurantAuthorization(vendorUser(), 'restaurant_1')).resolves.toEqual({
            role: RestaurantStaffRole.OWNER,
            permissions: expect.objectContaining({
                canUpdateMenu: true,
                canUpdateProfile: true,
            }) as unknown,
        });
    });

    it('requires the requested restaurant permission for known memberships', async () => {
        const { requireRestaurantPermission } = await import('./vendor-permissions');
        mockDb.prisma.restaurantStaff.findUnique.mockResolvedValue({
            role: RestaurantStaffRole.VIEWER,
        });
        mockDb.prisma.accessRole.findUnique.mockResolvedValue({
            permissions: [],
        });

        await expect(requireRestaurantPermission(vendorUser(), 'restaurant_1', 'orders:update')).resolves.toEqual({
            allowed: false,
            authorization: {
                role: RestaurantStaffRole.VIEWER,
                permissions: expect.objectContaining({
                    canReadOrders: false,
                }) as unknown,
            },
            knownRestaurantMember: true,
        });

        mockDb.prisma.accessRole.findUnique.mockResolvedValueOnce({
            permissions: [
                {
                    permissionId: 'permission_1',
                },
            ],
        }).mockResolvedValueOnce(databasePermissionSet([
            'restaurant.orders.read',
        ]));

        await expect(requireRestaurantPermission(vendorUser(), 'restaurant_1', 'orders:read')).resolves.toMatchObject({
            allowed: true,
            knownRestaurantMember: true,
        });
    });

    it('marks unknown restaurants or memberships as not known to the user', async () => {
        const { requireRestaurantPermission } = await import('./vendor-permissions');
        mockDb.prisma.restaurantStaff.findUnique.mockResolvedValue(null);
        mockDb.prisma.restaurant.findFirst.mockResolvedValue(null);

        await expect(requireRestaurantPermission(vendorUser(), 'restaurant_1', 'orders:read')).resolves.toEqual({
            allowed: false,
            knownRestaurantMember: false,
        });
    });
});
