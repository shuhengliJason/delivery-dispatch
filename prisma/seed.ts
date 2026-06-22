import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import {
    DelayReason,
    DelayStatus,
    DispatcherRole,
    DriverStatus,
    MenuOptionSelectionType,
    OrderStatus,
    PaymentStatus,
    PrismaClient,
    RestaurantStaffRole,
    TimelineEventType,
    UserRole,
} from '@prisma/client';

import {
    accessRoleDefinitions,
    permissionDefinitions,
} from '../src/lib/permission-definitions';
import { DEMO_PASSWORD } from '../src/lib/demo-credentials';

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
    adapter,
});

const seedPassword = DEMO_PASSWORD;

async function createCredentialAccount(userId: string): Promise<void> {
    const password = await hashPassword(seedPassword);
    const now = new Date();

    await prisma.account.create({
        data: {
            id: `credential_${userId}`,
            accountId: userId,
            providerId: 'credential',
            userId,
            password,
            createdAt: now,
            updatedAt: now,
        },
    });
}

async function syncAccessControlTables(): Promise<void> {
    const permissionsByKey = new Map<string, string>();

    for (const permission of permissionDefinitions) {
        const upsertedPermission = await prisma.permission.upsert({
            where: {
                key: permission.key,
            },
            update: {
                description: permission.description,
                name: permission.name,
                scope: permission.scope,
            },
            create: {
                description: permission.description,
                key: permission.key,
                name: permission.name,
                scope: permission.scope,
            },
            select: {
                id: true,
                key: true,
            },
        });

        permissionsByKey.set(upsertedPermission.key, upsertedPermission.id);
    }

    for (const role of accessRoleDefinitions) {
        const upsertedRole = await prisma.accessRole.upsert({
            where: {
                key: role.key,
            },
            update: {
                description: role.description,
                name: role.name,
                rank: role.rank,
                scope: role.scope,
            },
            create: {
                description: role.description,
                key: role.key,
                name: role.name,
                rank: role.rank,
                scope: role.scope,
            },
            select: {
                id: true,
            },
        });

        await prisma.rolePermission.deleteMany({
            where: {
                roleId: upsertedRole.id,
            },
        });

        await prisma.rolePermission.createMany({
            data: role.permissionKeys.map((permissionKey) => {
                const permissionId = permissionsByKey.get(permissionKey);

                if (!permissionId) {
                    throw new Error(`Permission ${permissionKey} was not seeded.`);
                }

                return {
                    permissionId,
                    roleId: upsertedRole.id,
                };
            }),
        });
    }
}

function minutesFromNow(minutes: number): Date {
    const date = new Date();

    date.setMinutes(date.getMinutes() + minutes);

    return date;
}

function minutesAgo(minutes: number): Date {
    const date = new Date();

    date.setMinutes(date.getMinutes() - minutes);

    return date;
}

async function main(): Promise<void> {
    await syncAccessControlTables();

    await prisma.delayEvent.deleteMany();
    await prisma.orderTimelineEvent.deleteMany();
    await prisma.deliveryAssignment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.menuItem.deleteMany();
    await prisma.restaurantStaff.deleteMany();
    await prisma.restaurant.deleteMany();
    await prisma.address.deleteMany();
    await prisma.driverProfile.deleteMany();
    await prisma.customerProfile.deleteMany();
    await prisma.user.deleteMany();

    const restaurantAddress = await prisma.address.create({
        data: {
            line1: '1200 Robson St',
            city: 'Vancouver',
            province: 'BC',
            postalCode: 'V6E 1C1',
            country: 'Canada',
            latitude: 49.287064,
            longitude: -123.126944,
        },
    });

    const restaurant = await prisma.restaurant.create({
        data: {
            name: 'Burger Lab',
            phone: '604-555-0101',
            featureImageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
            averagePrepMinutes: 20,
            addressId: restaurantAddress.id,
        },
    });

    const sushiAddress = await prisma.address.create({
        data: {
            line1: '433 Granville St',
            city: 'Vancouver',
            province: 'BC',
            postalCode: 'V6C 1T1',
            country: 'Canada',
            latitude: 49.2846,
            longitude: -123.1155,
        },
    });

    const sushiRestaurant = await prisma.restaurant.create({
        data: {
            name: 'Sakura Sushi',
            phone: '604-555-0102',
            featureImageUrl: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=80',
            averagePrepMinutes: 18,
            addressId: sushiAddress.id,
        },
    });

    const tacoAddress = await prisma.address.create({
        data: {
            line1: '86 Water St',
            city: 'Vancouver',
            province: 'BC',
            postalCode: 'V6B 1A4',
            country: 'Canada',
            latitude: 49.2841,
            longitude: -123.1069,
        },
    });

    const tacoRestaurant = await prisma.restaurant.create({
        data: {
            name: 'Pacific Tacos',
            phone: '604-555-0103',
            featureImageUrl: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=1200&q=80',
            averagePrepMinutes: 15,
            addressId: tacoAddress.id,
        },
    });

    const pizzaAddress = await prisma.address.create({
        data: {
            line1: '1505 W 1st Ave',
            city: 'Vancouver',
            province: 'BC',
            postalCode: 'V6J 1E8',
            country: 'Canada',
            latitude: 49.2707,
            longitude: -123.1392,
        },
    });

    const pizzaRestaurant = await prisma.restaurant.create({
        data: {
            name: 'Coal Oven Pizza',
            phone: '604-555-0104',
            featureImageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
            averagePrepMinutes: 22,
            addressId: pizzaAddress.id,
        },
    });

    const menuItems = await prisma.menuItem.createManyAndReturn({
        data: [
            {
                restaurantId: restaurant.id,
                name: 'Classic Burger',
                description: 'Beef patty, cheddar, lettuce, tomato, and house sauce.',
                category: 'Burgers',
                priceCents: 1399,
            },
            {
                restaurantId: restaurant.id,
                name: 'Spicy Chicken Burger',
                description: 'Crispy chicken, spicy mayo, pickles, and slaw.',
                category: 'Burgers',
                priceCents: 1499,
            },
            {
                restaurantId: restaurant.id,
                name: 'Truffle Fries',
                description: 'Crispy fries with parmesan and truffle oil.',
                category: 'Sides',
                priceCents: 799,
            },
            {
                restaurantId: restaurant.id,
                name: 'Caesar Salad',
                description: 'Romaine, parmesan, croutons, and caesar dressing.',
                category: 'Salads',
                priceCents: 1099,
            },
            {
                restaurantId: restaurant.id,
                name: 'Iced Lemon Tea',
                description: 'House-made lemon black tea.',
                category: 'Drinks',
                priceCents: 449,
            },
            {
                restaurantId: sushiRestaurant.id,
                name: 'Salmon Avocado Roll',
                description: 'Atlantic salmon, avocado, cucumber, and sesame.',
                category: 'Rolls',
                priceCents: 1299,
            },
            {
                restaurantId: sushiRestaurant.id,
                name: 'Spicy Tuna Roll',
                description: 'Tuna, spicy mayo, scallion, and crisp tempura bits.',
                category: 'Rolls',
                priceCents: 1399,
            },
            {
                restaurantId: sushiRestaurant.id,
                name: 'Chicken Teriyaki Bowl',
                description: 'Grilled chicken, steamed rice, vegetables, and teriyaki glaze.',
                category: 'Bowls',
                priceCents: 1599,
            },
            {
                restaurantId: sushiRestaurant.id,
                name: 'Miso Soup',
                description: 'Tofu, wakame, scallion, and miso broth.',
                category: 'Sides',
                priceCents: 399,
            },
            {
                restaurantId: tacoRestaurant.id,
                name: 'Carne Asada Tacos',
                description: 'Three steak tacos with onion, cilantro, salsa roja, and lime.',
                category: 'Tacos',
                priceCents: 1499,
            },
            {
                restaurantId: tacoRestaurant.id,
                name: 'Baja Fish Tacos',
                description: 'Crispy cod, cabbage slaw, crema, pico de gallo, and lime.',
                category: 'Tacos',
                priceCents: 1599,
            },
            {
                restaurantId: tacoRestaurant.id,
                name: 'Street Corn Bowl',
                description: 'Roasted corn, rice, beans, cotija, jalapeno, and crema.',
                category: 'Bowls',
                priceCents: 1299,
            },
            {
                restaurantId: tacoRestaurant.id,
                name: 'Churros',
                description: 'Cinnamon sugar churros with chocolate dip.',
                category: 'Desserts',
                priceCents: 699,
            },
            {
                restaurantId: pizzaRestaurant.id,
                name: 'Margherita Pizza',
                description: 'Tomato, fresh mozzarella, basil, and olive oil.',
                category: 'Pizza',
                priceCents: 1699,
            },
            {
                restaurantId: pizzaRestaurant.id,
                name: 'Spicy Pepperoni Pizza',
                description: 'Pepperoni, chili honey, mozzarella, and tomato sauce.',
                category: 'Pizza',
                priceCents: 1899,
            },
            {
                restaurantId: pizzaRestaurant.id,
                name: 'Garlic Knots',
                description: 'Baked knots with garlic butter, parsley, and marinara.',
                category: 'Sides',
                priceCents: 799,
            },
            {
                restaurantId: pizzaRestaurant.id,
                name: 'Tiramisu Cup',
                description: 'Espresso-soaked ladyfingers, mascarpone, and cocoa.',
                category: 'Desserts',
                priceCents: 849,
            },
        ],
    });

    const [classicBurger, spicyChickenBurger, truffleFries, icedLemonTea] = menuItems;

    await prisma.menuItemOptionGroup.create({
        data: {
            menuItemId: classicBurger.id,
            name: 'Doneness',
            selectionType: MenuOptionSelectionType.SINGLE,
            isRequired: true,
            minSelections: 1,
            maxSelections: 1,
            sortOrder: 0,
            options: {
                create: [
                    {
                        name: 'Medium',
                        isDefault: true,
                        sortOrder: 0,
                    },
                    {
                        name: 'Medium well',
                        sortOrder: 1,
                    },
                    {
                        name: 'Well done',
                        sortOrder: 2,
                    },
                ],
            },
        },
    });

    await prisma.menuItemOptionGroup.create({
        data: {
            menuItemId: classicBurger.id,
            name: 'Add-ons',
            selectionType: MenuOptionSelectionType.MULTIPLE,
            isRequired: false,
            minSelections: 0,
            maxSelections: 4,
            sortOrder: 1,
            options: {
                create: [
                    {
                        name: 'Extra patty',
                        priceCents: 450,
                        sortOrder: 0,
                    },
                    {
                        name: 'Bacon',
                        priceCents: 250,
                        sortOrder: 1,
                    },
                    {
                        name: 'Fried egg',
                        priceCents: 150,
                        sortOrder: 2,
                    },
                    {
                        name: 'Avocado',
                        priceCents: 200,
                        sortOrder: 3,
                    },
                ],
            },
        },
    });

    await prisma.menuItemOptionGroup.create({
        data: {
            menuItemId: classicBurger.id,
            name: 'Remove ingredients',
            selectionType: MenuOptionSelectionType.MULTIPLE,
            isRequired: false,
            minSelections: 0,
            maxSelections: 3,
            sortOrder: 2,
            options: {
                create: [
                    {
                        name: 'No onions',
                        sortOrder: 0,
                    },
                    {
                        name: 'No tomato',
                        sortOrder: 1,
                    },
                    {
                        name: 'No pickles',
                        sortOrder: 2,
                    },
                ],
            },
        },
    });

    const customerUser = await prisma.user.create({
        data: {
            name: 'Sarah Chen',
            email: 'sarah.chen@example.com',
            role: UserRole.CUSTOMER,
            customerProfile: {
                create: {
                    phone: '604-555-1001',
                },
            },
        },
        include: {
            customerProfile: true,
        },
    });

    const secondCustomerUser = await prisma.user.create({
        data: {
            name: 'Daniel Kim',
            email: 'daniel.kim@example.com',
            role: UserRole.CUSTOMER,
            customerProfile: {
                create: {
                    phone: '604-555-1002',
                },
            },
        },
        include: {
            customerProfile: true,
        },
    });

    const dispatcherUser = await prisma.user.create({
        data: {
            name: 'Dispatch Manager',
            email: 'dispatcher@example.com',
            role: UserRole.DISPATCHER,
            dispatcherProfile: {
                create: {
                    role: DispatcherRole.DISPATCHER_ADMIN,
                },
            },
        },
    });

    const orderDispatcherUser = await prisma.user.create({
        data: {
            name: 'Order Dispatcher',
            email: 'dispatcher.orders@example.com',
            role: UserRole.DISPATCHER,
            dispatcherProfile: {
                create: {
                    role: DispatcherRole.ORDER_OPERATOR,
                },
            },
        },
    });

    const userManagerDispatcherUser = await prisma.user.create({
        data: {
            name: 'User Manager Dispatcher',
            email: 'dispatcher.users@example.com',
            role: UserRole.DISPATCHER,
            dispatcherProfile: {
                create: {
                    role: DispatcherRole.USER_MANAGER,
                },
            },
        },
    });

    const adminUser = await prisma.user.create({
        data: {
            name: 'Platform Admin',
            email: 'admin@example.com',
            role: UserRole.ADMIN,
        },
    });

    const vendorUser = await prisma.user.create({
        data: {
            name: 'Burger Lab Vendor',
            email: 'vendor@example.com',
            role: UserRole.VENDOR,
        },
    });

    const sushiVendorUser = await prisma.user.create({
        data: {
            name: 'Sakura Sushi Vendor',
            email: 'sakura.vendor@example.com',
            role: UserRole.VENDOR,
        },
    });

    const tacoVendorUser = await prisma.user.create({
        data: {
            name: 'Pacific Tacos Vendor',
            email: 'tacos.vendor@example.com',
            role: UserRole.VENDOR,
        },
    });

    const pizzaVendorUser = await prisma.user.create({
        data: {
            name: 'Coal Oven Pizza Vendor',
            email: 'pizza.vendor@example.com',
            role: UserRole.VENDOR,
        },
    });

    const vendorManagerUser = await prisma.user.create({
        data: {
            name: 'Regional Vendor Manager',
            email: 'vendor.manager@example.com',
            role: UserRole.VENDOR,
        },
    });

    const vendorOrderStaffUser = await prisma.user.create({
        data: {
            name: 'Order Counter Staff',
            email: 'vendor.orders@example.com',
            role: UserRole.VENDOR,
        },
    });

    const vendorViewerUser = await prisma.user.create({
        data: {
            name: 'Read Only Vendor',
            email: 'vendor.viewer@example.com',
            role: UserRole.VENDOR,
        },
    });

    await Promise.all([
        prisma.restaurant.update({
            where: {
                id: restaurant.id,
            },
            data: {
                vendorId: vendorUser.id,
            },
        }),
        prisma.restaurant.update({
            where: {
                id: sushiRestaurant.id,
            },
            data: {
                vendorId: vendorUser.id,
            },
        }),
        prisma.restaurant.update({
            where: {
                id: tacoRestaurant.id,
            },
            data: {
                vendorId: vendorUser.id,
            },
        }),
        prisma.restaurant.update({
            where: {
                id: pizzaRestaurant.id,
            },
            data: {
                vendorId: vendorUser.id,
            },
        }),
    ]);

    await prisma.restaurantStaff.createMany({
        data: [
            {
                userId: vendorUser.id,
                restaurantId: restaurant.id,
                role: RestaurantStaffRole.OWNER,
            },
            {
                userId: vendorUser.id,
                restaurantId: sushiRestaurant.id,
                role: RestaurantStaffRole.OWNER,
            },
            {
                userId: vendorUser.id,
                restaurantId: tacoRestaurant.id,
                role: RestaurantStaffRole.OWNER,
            },
            {
                userId: vendorUser.id,
                restaurantId: pizzaRestaurant.id,
                role: RestaurantStaffRole.OWNER,
            },
            {
                userId: sushiVendorUser.id,
                restaurantId: sushiRestaurant.id,
                role: RestaurantStaffRole.MANAGER,
            },
            {
                userId: tacoVendorUser.id,
                restaurantId: tacoRestaurant.id,
                role: RestaurantStaffRole.MANAGER,
            },
            {
                userId: pizzaVendorUser.id,
                restaurantId: pizzaRestaurant.id,
                role: RestaurantStaffRole.MANAGER,
            },
            {
                userId: vendorManagerUser.id,
                restaurantId: restaurant.id,
                role: RestaurantStaffRole.MANAGER,
            },
            {
                userId: vendorManagerUser.id,
                restaurantId: sushiRestaurant.id,
                role: RestaurantStaffRole.MANAGER,
            },
            {
                userId: vendorOrderStaffUser.id,
                restaurantId: restaurant.id,
                role: RestaurantStaffRole.ORDER_STAFF,
            },
            {
                userId: vendorOrderStaffUser.id,
                restaurantId: tacoRestaurant.id,
                role: RestaurantStaffRole.ORDER_STAFF,
            },
            {
                userId: vendorViewerUser.id,
                restaurantId: restaurant.id,
                role: RestaurantStaffRole.VIEWER,
            },
        ],
    });

    const driverAlexUser = await prisma.user.create({
        data: {
            name: 'Alex Driver',
            email: 'alex.driver@example.com',
            role: UserRole.DRIVER,
            driverProfile: {
                create: {
                    phone: '604-555-2001',
                    status: DriverStatus.AVAILABLE,
                    currentLatitude: 49.2827,
                    currentLongitude: -123.1207,
                    activeDeliveryCount: 0,
                    completedDeliveryCount: 8,
                    lateDeliveryCount: 1,
                },
            },
        },
        include: {
            driverProfile: true,
        },
    });

    const driverMayaUser = await prisma.user.create({
        data: {
            name: 'Maya Driver',
            email: 'maya.driver@example.com',
            role: UserRole.DRIVER,
            driverProfile: {
                create: {
                    phone: '604-555-2002',
                    status: DriverStatus.BUSY,
                    currentLatitude: 49.2768,
                    currentLongitude: -123.1142,
                    activeDeliveryCount: 1,
                    completedDeliveryCount: 12,
                    lateDeliveryCount: 2,
                },
            },
        },
        include: {
            driverProfile: true,
        },
    });

    const driverLeoUser = await prisma.user.create({
        data: {
            name: 'Leo Driver',
            email: 'leo.driver@example.com',
            role: UserRole.DRIVER,
            driverProfile: {
                create: {
                    phone: '604-555-2003',
                    status: DriverStatus.AVAILABLE,
                    currentLatitude: 49.2904,
                    currentLongitude: -123.1374,
                    activeDeliveryCount: 0,
                    completedDeliveryCount: 5,
                    lateDeliveryCount: 0,
                },
            },
        },
        include: {
            driverProfile: true,
        },
    });

    const driverNinaUser = await prisma.user.create({
        data: {
            name: 'Nina Driver',
            email: 'nina.driver@example.com',
            role: UserRole.DRIVER,
            driverProfile: {
                create: {
                    phone: '604-555-2004',
                    status: DriverStatus.OFFLINE,
                    activeDeliveryCount: 0,
                    completedDeliveryCount: 4,
                    lateDeliveryCount: 0,
                },
            },
        },
        include: {
            driverProfile: true,
        },
    });

    const driverPriyaUser = await prisma.user.create({
        data: {
            name: 'Priya Driver',
            email: 'priya.driver@example.com',
            role: UserRole.DRIVER,
            driverProfile: {
                create: {
                    phone: '604-555-2005',
                    status: DriverStatus.AVAILABLE,
                    currentLatitude: 49.2819,
                    currentLongitude: -123.1086,
                    activeDeliveryCount: 0,
                    completedDeliveryCount: 7,
                    lateDeliveryCount: 1,
                },
            },
        },
        include: {
            driverProfile: true,
        },
    });

    const driverOmarUser = await prisma.user.create({
        data: {
            name: 'Omar Driver',
            email: 'omar.driver@example.com',
            role: UserRole.DRIVER,
            driverProfile: {
                create: {
                    phone: '604-555-2006',
                    status: DriverStatus.AVAILABLE,
                    currentLatitude: 49.2642,
                    currentLongitude: -123.1176,
                    activeDeliveryCount: 0,
                    completedDeliveryCount: 10,
                    lateDeliveryCount: 0,
                },
            },
        },
        include: {
            driverProfile: true,
        },
    });

    const driverGraceUser = await prisma.user.create({
        data: {
            name: 'Grace Driver',
            email: 'grace.driver@example.com',
            role: UserRole.DRIVER,
            driverProfile: {
                create: {
                    phone: '604-555-2007',
                    status: DriverStatus.AVAILABLE,
                    currentLatitude: 49.2864,
                    currentLongitude: -123.1315,
                    activeDeliveryCount: 0,
                    completedDeliveryCount: 6,
                    lateDeliveryCount: 0,
                },
            },
        },
        include: {
            driverProfile: true,
        },
    });

    const driverChenUser = await prisma.user.create({
        data: {
            name: 'Chen Driver',
            email: 'chen.driver@example.com',
            role: UserRole.DRIVER,
            driverProfile: {
                create: {
                    phone: '604-555-2008',
                    status: DriverStatus.AVAILABLE,
                    currentLatitude: 49.2721,
                    currentLongitude: -123.134,
                    activeDeliveryCount: 0,
                    completedDeliveryCount: 9,
                    lateDeliveryCount: 1,
                },
            },
        },
        include: {
            driverProfile: true,
        },
    });

    const driverSofiaUser = await prisma.user.create({
        data: {
            name: 'Sofia Driver',
            email: 'sofia.driver@example.com',
            role: UserRole.DRIVER,
            driverProfile: {
                create: {
                    phone: '604-555-2009',
                    status: DriverStatus.AVAILABLE,
                    currentLatitude: 49.2792,
                    currentLongitude: -123.1008,
                    activeDeliveryCount: 0,
                    completedDeliveryCount: 11,
                    lateDeliveryCount: 0,
                },
            },
        },
        include: {
            driverProfile: true,
        },
    });

    await Promise.all([
        createCredentialAccount(customerUser.id),
        createCredentialAccount(secondCustomerUser.id),
        createCredentialAccount(dispatcherUser.id),
        createCredentialAccount(orderDispatcherUser.id),
        createCredentialAccount(userManagerDispatcherUser.id),
        createCredentialAccount(adminUser.id),
        createCredentialAccount(vendorUser.id),
        createCredentialAccount(sushiVendorUser.id),
        createCredentialAccount(tacoVendorUser.id),
        createCredentialAccount(pizzaVendorUser.id),
        createCredentialAccount(vendorManagerUser.id),
        createCredentialAccount(vendorOrderStaffUser.id),
        createCredentialAccount(vendorViewerUser.id),
        createCredentialAccount(driverAlexUser.id),
        createCredentialAccount(driverMayaUser.id),
        createCredentialAccount(driverLeoUser.id),
        createCredentialAccount(driverNinaUser.id),
        createCredentialAccount(driverPriyaUser.id),
        createCredentialAccount(driverOmarUser.id),
        createCredentialAccount(driverGraceUser.id),
        createCredentialAccount(driverChenUser.id),
        createCredentialAccount(driverSofiaUser.id),
    ]);

    if (!customerUser.customerProfile || !secondCustomerUser.customerProfile) {
        throw new Error('Customer profiles were not created.');
    }

    if (!driverAlexUser.driverProfile || !driverMayaUser.driverProfile) {
        throw new Error('Driver profiles were not created.');
    }

    const orderOneAddress = await prisma.address.create({
        data: {
            line1: '88 Pacific Blvd',
            city: 'Vancouver',
            province: 'BC',
            postalCode: 'V6Z 2R6',
            country: 'Canada',
            latitude: 49.2734,
            longitude: -123.1052,
        },
    });

    const orderOne = await prisma.order.create({
        data: {
            customerId: customerUser.customerProfile.id,
            restaurantId: restaurant.id,
            deliveryAddressId: orderOneAddress.id,
            status: OrderStatus.PREPARING,
            delayStatus: DelayStatus.NONE,
            paymentStatus: PaymentStatus.PAID,
            customerNameSnapshot: customerUser.name,
            restaurantNameSnapshot: restaurant.name,
            deliveryAddressSnapshot: '88 Pacific Blvd, Vancouver, BC',
            subtotalCents: 2198,
            taxCents: 264,
            deliveryFeeCents: 399,
            totalCents: 2861,
            estimatedDeliveryAt: minutesFromNow(28),
            placedAt: minutesAgo(8),
            paidAt: minutesAgo(8),
            confirmedAt: minutesAgo(6),
            items: {
                create: [
                    {
                        menuItemId: classicBurger.id,
                        nameSnapshot: classicBurger.name,
                        unitPriceCents: classicBurger.priceCents,
                        quantity: 1,
                        lineTotalCents: classicBurger.priceCents,
                    },
                    {
                        menuItemId: truffleFries.id,
                        nameSnapshot: truffleFries.name,
                        unitPriceCents: truffleFries.priceCents,
                        quantity: 1,
                        lineTotalCents: truffleFries.priceCents,
                    },
                ],
            },
            timelineEvents: {
                create: [
                    {
                        type: TimelineEventType.ORDER_CREATED,
                        title: 'Order created',
                        message: 'Customer placed the order.',
                        createdAt: minutesAgo(8),
                    },
                    {
                        type: TimelineEventType.ORDER_CONFIRMED,
                        title: 'Order confirmed',
                        message: 'Restaurant confirmed the order.',
                        createdAt: minutesAgo(6),
                    },
                    {
                        type: TimelineEventType.PREPARATION_STARTED,
                        title: 'Preparation started',
                        message: 'Restaurant started preparing the order.',
                        createdAt: minutesAgo(5),
                    },
                ],
            },
        },
    });

    const orderTwoAddress = await prisma.address.create({
        data: {
            line1: '1022 Mainland St',
            city: 'Vancouver',
            province: 'BC',
            postalCode: 'V6B 2T4',
            country: 'Canada',
            latitude: 49.2755,
            longitude: -123.1211,
        },
    });

    const orderTwo = await prisma.order.create({
        data: {
            customerId: secondCustomerUser.customerProfile.id,
            restaurantId: restaurant.id,
            deliveryAddressId: orderTwoAddress.id,
            status: OrderStatus.READY_FOR_PICKUP,
            delayStatus: DelayStatus.AT_RISK,
            paymentStatus: PaymentStatus.PAID,
            customerNameSnapshot: secondCustomerUser.name,
            restaurantNameSnapshot: restaurant.name,
            deliveryAddressSnapshot: '1022 Mainland St, Vancouver, BC',
            subtotalCents: 2998,
            taxCents: 360,
            deliveryFeeCents: 399,
            totalCents: 3757,
            estimatedDeliveryAt: minutesFromNow(12),
            placedAt: minutesAgo(25),
            paidAt: minutesAgo(25),
            confirmedAt: minutesAgo(23),
            readyForPickupAt: minutesAgo(2),
            items: {
                create: [
                    {
                        menuItemId: spicyChickenBurger.id,
                        nameSnapshot: spicyChickenBurger.name,
                        unitPriceCents: spicyChickenBurger.priceCents,
                        quantity: 2,
                        lineTotalCents: spicyChickenBurger.priceCents * 2,
                    },
                ],
            },
            timelineEvents: {
                create: [
                    {
                        type: TimelineEventType.ORDER_CREATED,
                        title: 'Order created',
                        message: 'Customer placed the order.',
                        createdAt: minutesAgo(25),
                    },
                    {
                        type: TimelineEventType.ORDER_CONFIRMED,
                        title: 'Order confirmed',
                        message: 'Restaurant confirmed the order.',
                        createdAt: minutesAgo(23),
                    },
                    {
                        type: TimelineEventType.READY_FOR_PICKUP,
                        title: 'Ready for pickup',
                        message: 'Order is ready, but no driver has been assigned.',
                        createdAt: minutesAgo(2),
                    },
                ],
            },
        },
    });

    const orderThreeAddress = await prisma.address.create({
        data: {
            line1: '555 W Georgia St',
            city: 'Vancouver',
            province: 'BC',
            postalCode: 'V6B 1Z5',
            country: 'Canada',
            latitude: 49.2828,
            longitude: -123.1158,
        },
    });

    const orderThree = await prisma.order.create({
        data: {
            customerId: customerUser.customerProfile.id,
            restaurantId: restaurant.id,
            deliveryAddressId: orderThreeAddress.id,
            status: OrderStatus.ASSIGNED,
            delayStatus: DelayStatus.AT_RISK,
            paymentStatus: PaymentStatus.PAID,
            customerNameSnapshot: customerUser.name,
            restaurantNameSnapshot: restaurant.name,
            deliveryAddressSnapshot: '555 W Georgia St, Vancouver, BC',
            subtotalCents: 1848,
            taxCents: 222,
            deliveryFeeCents: 399,
            totalCents: 2469,
            estimatedDeliveryAt: minutesFromNow(8),
            placedAt: minutesAgo(30),
            paidAt: minutesAgo(30),
            confirmedAt: minutesAgo(28),
            readyForPickupAt: minutesAgo(6),
            items: {
                create: [
                    {
                        menuItemId: classicBurger.id,
                        nameSnapshot: classicBurger.name,
                        unitPriceCents: classicBurger.priceCents,
                        quantity: 1,
                        lineTotalCents: classicBurger.priceCents,
                    },
                    {
                        menuItemId: icedLemonTea.id,
                        nameSnapshot: icedLemonTea.name,
                        unitPriceCents: icedLemonTea.priceCents,
                        quantity: 1,
                        lineTotalCents: icedLemonTea.priceCents,
                    },
                ],
            },
            assignments: {
                create: [
                    {
                        driverId: driverAlexUser.driverProfile.id,
                    },
                ],
            },
            timelineEvents: {
                create: [
                    {
                        type: TimelineEventType.ORDER_CREATED,
                        title: 'Order created',
                        message: 'Customer placed the order.',
                        createdAt: minutesAgo(30),
                    },
                    {
                        type: TimelineEventType.READY_FOR_PICKUP,
                        title: 'Ready for pickup',
                        message: 'Order is ready for driver pickup.',
                        createdAt: minutesAgo(6),
                    },
                    {
                        type: TimelineEventType.DRIVER_ASSIGNED,
                        title: 'Driver assigned',
                        message: 'Alex Driver was assigned to this order.',
                        metadata: {
                            assignedBy: dispatcherUser.name,
                        },
                        createdAt: minutesAgo(4),
                    },
                ],
            },
        },
    });

    const orderFourAddress = await prisma.address.create({
        data: {
            line1: '777 Richards St',
            city: 'Vancouver',
            province: 'BC',
            postalCode: 'V6B 0M6',
            country: 'Canada',
            latitude: 49.2804,
            longitude: -123.1171,
        },
    });

    const orderFour = await prisma.order.create({
        data: {
            customerId: secondCustomerUser.customerProfile.id,
            restaurantId: restaurant.id,
            deliveryAddressId: orderFourAddress.id,
            status: OrderStatus.ON_THE_WAY,
            delayStatus: DelayStatus.DELAYED,
            paymentStatus: PaymentStatus.PAID,
            customerNameSnapshot: secondCustomerUser.name,
            restaurantNameSnapshot: restaurant.name,
            deliveryAddressSnapshot: '777 Richards St, Vancouver, BC',
            subtotalCents: 3097,
            taxCents: 372,
            deliveryFeeCents: 399,
            totalCents: 3868,
            estimatedDeliveryAt: minutesAgo(5),
            placedAt: minutesAgo(48),
            paidAt: minutesAgo(48),
            confirmedAt: minutesAgo(46),
            readyForPickupAt: minutesAgo(24),
            pickedUpAt: minutesAgo(16),
            items: {
                create: [
                    {
                        menuItemId: spicyChickenBurger.id,
                        nameSnapshot: spicyChickenBurger.name,
                        unitPriceCents: spicyChickenBurger.priceCents,
                        quantity: 1,
                        lineTotalCents: spicyChickenBurger.priceCents,
                    },
                    {
                        menuItemId: truffleFries.id,
                        nameSnapshot: truffleFries.name,
                        unitPriceCents: truffleFries.priceCents,
                        quantity: 2,
                        lineTotalCents: truffleFries.priceCents * 2,
                    },
                ],
            },
            assignments: {
                create: [
                    {
                        driverId: driverMayaUser.driverProfile.id,
                        acceptedAt: minutesAgo(22),
                        pickedUpAt: minutesAgo(16),
                    },
                ],
            },
            timelineEvents: {
                create: [
                    {
                        type: TimelineEventType.ORDER_CREATED,
                        title: 'Order created',
                        message: 'Customer placed the order.',
                        createdAt: minutesAgo(48),
                    },
                    {
                        type: TimelineEventType.DRIVER_ASSIGNED,
                        title: 'Driver assigned',
                        message: 'Maya Driver was assigned to this order.',
                        createdAt: minutesAgo(24),
                    },
                    {
                        type: TimelineEventType.DRIVER_ACCEPTED,
                        title: 'Driver accepted',
                        message: 'Maya Driver accepted the delivery.',
                        createdAt: minutesAgo(22),
                    },
                    {
                        type: TimelineEventType.ORDER_PICKED_UP,
                        title: 'Order picked up',
                        message: 'Driver picked up the order.',
                        createdAt: minutesAgo(16),
                    },
                    {
                        type: TimelineEventType.ORDER_ON_THE_WAY,
                        title: 'Order on the way',
                        message: 'Driver is heading to the customer.',
                        createdAt: minutesAgo(15),
                    },
                    {
                        type: TimelineEventType.DELAY_DETECTED,
                        title: 'Delay detected',
                        message: 'Traffic delay detected near downtown Vancouver.',
                        createdAt: minutesAgo(7),
                    },
                    {
                        type: TimelineEventType.CUSTOMER_NOTIFIED,
                        title: 'Customer notified',
                        message: 'Customer received an updated delivery message.',
                        createdAt: minutesAgo(6),
                    },
                ],
            },
            delayEvents: {
                create: [
                    {
                        reason: DelayReason.TRAFFIC,
                        delayMinutes: 12,
                        message: 'Traffic delay detected near downtown Vancouver.',
                        aiGeneratedMessage: 'Sorry, your order is taking longer than expected because your driver hit traffic downtown. Your updated delivery time is coming soon.',
                        createdAt: minutesAgo(7),
                    },
                ],
            },
        },
    });

    console.log('Seed complete.');
    console.log(`Restaurants: ${[
        restaurant,
        sushiRestaurant,
        tacoRestaurant,
        pizzaRestaurant,
    ].map((item) => {
        return item.name;
    }).join(', ')}`);
    console.log(`Menu items: ${menuItems.length}`);
    console.log(`Access roles: ${accessRoleDefinitions.length}`);
    console.log(`Permissions: ${permissionDefinitions.length}`);
    console.log(`Vendors: ${[
        vendorUser,
        sushiVendorUser,
        tacoVendorUser,
        pizzaVendorUser,
        vendorManagerUser,
        vendorOrderStaffUser,
        vendorViewerUser,
    ].length}`);
    console.log(`Dispatchers: ${[
        dispatcherUser,
        orderDispatcherUser,
        userManagerDispatcherUser,
    ].length}`);
    console.log(`Admins: ${[adminUser].length}`);
    console.log(`Drivers: ${[
        driverAlexUser,
        driverMayaUser,
        driverLeoUser,
        driverNinaUser,
        driverPriyaUser,
        driverOmarUser,
        driverGraceUser,
        driverChenUser,
        driverSofiaUser,
    ].length}`);
    console.log(`Orders: ${[
        orderOne,
        orderTwo,
        orderThree,
        orderFour,
    ].length}`);
    console.log(`Seed account password: ${seedPassword}`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
