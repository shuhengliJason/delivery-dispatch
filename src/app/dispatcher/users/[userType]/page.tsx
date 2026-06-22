import {
    DispatcherRole,
    DriverStatus,
    Prisma,
    RestaurantStaffRole,
    UserRole,
} from '@prisma/client';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/current-user';
import {
    canManageDispatcherAdminRole,
    canManageDispatcherOrdersFromDatabase,
    canManageDispatcherUsersFromDatabase,
    dispatcherRoleLabels,
} from '@/lib/dispatcher-permissions';
import { prisma } from '@/lib/prisma';
import DispatcherSignOutButton from '../../dispatcher-sign-out-button';
import DispatcherUserManager from './dispatcher-user-manager';

export const dynamic = 'force-dynamic';

type DispatcherUsersPageProps = {
    params: Promise<{
        userType: string;
    }>;
    searchParams?: Promise<{
        page?: string | string[];
        q?: string | string[];
    }>;
};

type UserTypeConfig = {
    description: string;
    label: string;
    role: UserRole;
    slug: string;
};

const userTypeConfigs = [
    {
        description: 'Customer accounts that place and track orders.',
        label: 'Customers',
        role: UserRole.CUSTOMER,
        slug: 'customers',
    },
    {
        description: 'Restaurant owner and staff accounts.',
        label: 'Vendors',
        role: UserRole.VENDOR,
        slug: 'vendors',
    },
    {
        description: 'Courier accounts and driver availability details.',
        label: 'Drivers',
        role: UserRole.DRIVER,
        slug: 'drivers',
    },
    {
        description: 'Dispatcher workspace accounts, including this app-level admin surface.',
        label: 'Dispatchers',
        role: UserRole.DISPATCHER,
        slug: 'dispatchers',
    },
] satisfies UserTypeConfig[];

const restaurantStaffRoleOrder = [
    RestaurantStaffRole.VIEWER,
    RestaurantStaffRole.ORDER_STAFF,
    RestaurantStaffRole.MANAGER,
    RestaurantStaffRole.OWNER,
];

const dispatcherRoleOrder = [
    DispatcherRole.ORDER_OPERATOR,
    DispatcherRole.USER_MANAGER,
    DispatcherRole.DISPATCHER_ADMIN,
];
const usersPerPage = 10;

function getUserTypeConfig(slug: string): UserTypeConfig | null {
    return userTypeConfigs.find((config) => {
        return config.slug === slug;
    }) ?? null;
}

function getRoleLabel(role: RestaurantStaffRole): string {
    return role.split('_').map((part) => {
        return part.charAt(0) + part.slice(1).toLowerCase();
    }).join(' ');
}

function getSingleSearchParam(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function getPageNumber(value: string | string[] | undefined): number {
    const page = Number.parseInt(getSingleSearchParam(value), 10);

    return Number.isFinite(page) && page > 0 ? page : 1;
}

export default async function DispatcherUsersPage({
    params,
    searchParams,
}: DispatcherUsersPageProps) {
    const { userType } = await params;
    const resolvedSearchParams = await searchParams;
    const userTypeConfig = getUserTypeConfig(userType);
    const searchQuery = getSingleSearchParam(resolvedSearchParams?.q).trim().slice(0, 120);
    const requestedPage = getPageNumber(resolvedSearchParams?.page);

    if (!userTypeConfig) {
        notFound();
    }

    const currentUser = await getCurrentUser();

    if (!currentUser) {
        redirect('/sign-in?redirectTo=/dispatcher/users');
    }

    if (currentUser.role !== UserRole.DISPATCHER && currentUser.role !== UserRole.ADMIN) {
        redirect('/sign-in?redirectTo=/dispatcher/users&switchAccount=1');
    }

    const [canManageOrders, canManageUsers] = await Promise.all([
        canManageDispatcherOrdersFromDatabase(currentUser),
        canManageDispatcherUsersFromDatabase(currentUser),
    ]);

    if (!canManageUsers) {
        if (canManageOrders) {
            redirect('/dispatcher');
        }

        redirect('/sign-in?redirectTo=/dispatcher/users&switchAccount=1');
    }

    const userWhere: Prisma.UserWhereInput = {
        role: userTypeConfig.role,
        ...(searchQuery
            ? {
                OR: [
                    {
                        name: {
                            contains: searchQuery,
                            mode: 'insensitive',
                        },
                    },
                    {
                        email: {
                            contains: searchQuery,
                            mode: 'insensitive',
                        },
                    },
                    {
                        customerProfile: {
                            phone: {
                                contains: searchQuery,
                                mode: 'insensitive',
                            },
                        },
                    },
                    {
                        driverProfile: {
                            phone: {
                                contains: searchQuery,
                                mode: 'insensitive',
                            },
                        },
                    },
                    {
                        restaurantStaff: {
                            some: {
                                restaurant: {
                                    name: {
                                        contains: searchQuery,
                                        mode: 'insensitive',
                                    },
                                },
                            },
                        },
                    },
                ],
            }
            : {}),
    };

    const [totalUsers, restaurants] = await Promise.all([
        prisma.user.count({
            where: userWhere,
        }),
        prisma.restaurant.findMany({
            select: {
                id: true,
                name: true,
            },
            orderBy: {
                name: 'asc',
            },
        }),
    ]);
    const totalPages = Math.max(1, Math.ceil(totalUsers / usersPerPage));
    const currentPage = Math.min(requestedPage, totalPages);
    const users = await prisma.user.findMany({
        where: userWhere,
        include: {
            customerProfile: {
                select: {
                    phone: true,
                },
            },
            driverProfile: {
                select: {
                    activeDeliveryCount: true,
                    completedDeliveryCount: true,
                    lateDeliveryCount: true,
                    phone: true,
                    status: true,
                },
            },
            dispatcherProfile: {
                select: {
                    role: true,
                },
            },
            restaurantStaff: {
                include: {
                    restaurant: {
                        select: {
                            name: true,
                        },
                    },
                },
                orderBy: {
                    restaurant: {
                        name: 'asc',
                    },
                },
            },
            updatedBy: {
                select: {
                    email: true,
                    name: true,
                },
            },
        },
        orderBy: [
            {
                name: 'asc',
            },
            {
                email: 'asc',
            },
        ],
        skip: (currentPage - 1) * usersPerPage,
        take: usersPerPage,
    });

    return (
        <main className="min-h-screen bg-slate-50 p-6">
            <div className="mx-auto max-w-7xl">
                <header className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-500">
                            Dispatcher Workspace
                        </p>

                        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                            User Management
                        </h1>

                        <p className="mt-2 max-w-2xl text-sm text-slate-600">
                            Select one account type before editing users, so customer, vendor, driver, and dispatcher records stay separated.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                        {canManageOrders && (
                            <Link
                                href="/dispatcher"
                                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                                Exception dashboard
                            </Link>
                        )}
                        <DispatcherSignOutButton redirectTo="/dispatcher/users" />
                    </div>
                </header>

                <DispatcherUserManager
                    canCreateAdminDispatcher={canManageDispatcherAdminRole(currentUser)}
                    currentDispatcherRole={currentUser.role === UserRole.ADMIN
                        ? 'ADMIN'
                        : currentUser.dispatcherProfile?.role ?? DispatcherRole.ORDER_OPERATOR}
                    currentUserId={currentUser.id}
                    dispatcherRoleOptions={dispatcherRoleOrder.map((role) => {
                        return {
                            label: dispatcherRoleLabels[role],
                            value: role,
                        };
                    })}
                    driverStatusOptions={Object.values(DriverStatus)}
                    restaurantOptions={restaurants}
                    restaurantStaffRoleOptions={restaurantStaffRoleOrder.map((role) => {
                        return {
                            label: getRoleLabel(role),
                            value: role,
                        };
                    })}
                    pagination={{
                        currentPage,
                        pageSize: usersPerPage,
                        totalPages,
                        totalUsers,
                    }}
                    searchQuery={searchQuery}
                    selectedUserType={userTypeConfig.slug}
                    userTypeOptions={userTypeConfigs.map((config) => {
                        return {
                            description: config.description,
                            label: config.label,
                            slug: config.slug,
                        };
                    })}
                    users={users.map((user) => {
                        return {
                            createdAt: user.createdAt.toISOString(),
                            customerProfile: user.customerProfile
                                ? {
                                    phone: user.customerProfile.phone,
                                }
                                : null,
                            driverProfile: user.driverProfile
                                ? {
                                    activeDeliveryCount: user.driverProfile.activeDeliveryCount,
                                    completedDeliveryCount: user.driverProfile.completedDeliveryCount,
                                    lateDeliveryCount: user.driverProfile.lateDeliveryCount,
                                    phone: user.driverProfile.phone,
                                    status: user.driverProfile.status,
                                }
                                : null,
                            dispatcherProfile: user.dispatcherProfile
                                ? {
                                    role: user.dispatcherProfile.role,
                                }
                                : null,
                            email: user.email,
                            id: user.id,
                            name: user.name,
                            restaurantStaff: user.restaurantStaff.map((membership) => {
                                return {
                                    restaurantId: membership.restaurantId,
                                    restaurantName: membership.restaurant.name,
                                    role: membership.role,
                                };
                            }),
                            role: user.role,
                            updatedAt: user.updatedAt.toISOString(),
                            updatedBy: user.updatedBy
                                ? {
                                    email: user.updatedBy.email,
                                    name: user.updatedBy.name,
                                }
                                : null,
                        };
                    })}
                />
            </div>
        </main>
    );
}
