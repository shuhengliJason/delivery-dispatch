'use client';

import {
    type DispatcherRole,
    type DriverStatus,
    type RestaurantStaffRole,
    type UserRole,
} from '@prisma/client';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';

type UserTypeOption = {
    description: string;
    label: string;
    slug: string;
};

type RestaurantOption = {
    id: string;
    name: string;
};

type RestaurantStaffRoleOption = {
    label: string;
    value: RestaurantStaffRole;
};

type DispatcherRoleOption = {
    label: string;
    value: DispatcherRole;
};

type ManagedUser = {
    createdAt: string;
    customerProfile: {
        phone: string | null;
    } | null;
    driverProfile: {
        activeDeliveryCount: number;
        completedDeliveryCount: number;
        lateDeliveryCount: number;
        phone: string | null;
        status: DriverStatus;
    } | null;
    dispatcherProfile: {
        role: DispatcherRole;
    } | null;
    email: string;
    id: string;
    name: string;
    restaurantStaff: Array<{
        restaurantId: string;
        restaurantName: string;
        role: RestaurantStaffRole;
    }>;
    role: UserRole;
    updatedAt: string;
    updatedBy: {
        email: string;
        name: string;
    } | null;
};

type DispatcherUserManagerProps = {
    canCreateAdminDispatcher: boolean;
    currentDispatcherRole: DispatcherRole | 'ADMIN';
    currentUserId: string;
    dispatcherRoleOptions: DispatcherRoleOption[];
    driverStatusOptions: DriverStatus[];
    restaurantOptions: RestaurantOption[];
    restaurantStaffRoleOptions: RestaurantStaffRoleOption[];
    pagination: {
        currentPage: number;
        pageSize: number;
        totalPages: number;
        totalUsers: number;
    };
    searchQuery: string;
    selectedUserType: string;
    userTypeOptions: UserTypeOption[];
    users: ManagedUser[];
};

type UserDraft = {
    dispatcherRole: DispatcherRole | '';
    driverStatus: DriverStatus | '';
    name: string;
    phone: string;
    restaurantAccess: Record<string, {
        enabled: boolean;
        role: RestaurantStaffRole;
    }>;
};

type CreateUserDraft = {
    dispatcherRole: DispatcherRole | '';
    email: string;
    name: string;
    password: string;
    restaurantAccess: Record<string, {
        enabled: boolean;
        role: RestaurantStaffRole;
    }>;
};

type JsonResponse = {
    error?: string;
};

const dispatcherRoleRanks: Record<DispatcherRole, number> = {
    ORDER_OPERATOR: 1,
    USER_MANAGER: 2,
    DISPATCHER_ADMIN: 3,
};

function canManageDispatcherRole(
    currentDispatcherRole: DispatcherRole | 'ADMIN',
    targetRole: DispatcherRole,
): boolean {
    if (currentDispatcherRole === 'ADMIN') {
        return true;
    }

    return dispatcherRoleRanks[currentDispatcherRole] >= dispatcherRoleRanks[targetRole];
}

function getFallbackRestaurantStaffRole(
    restaurantStaffRoleOptions: RestaurantStaffRoleOption[],
): RestaurantStaffRole {
    return restaurantStaffRoleOptions.find((role) => {
        return role.value === 'VIEWER';
    })?.value ?? restaurantStaffRoleOptions[0]?.value ?? 'VIEWER';
}

function createEmptyRestaurantAccess(
    restaurantOptions: RestaurantOption[],
    restaurantStaffRoleOptions: RestaurantStaffRoleOption[],
): Record<string, {
    enabled: boolean;
    role: RestaurantStaffRole;
}> {
    const fallbackRole = getFallbackRestaurantStaffRole(restaurantStaffRoleOptions);

    return Object.fromEntries(restaurantOptions.map((restaurant) => {
        return [
            restaurant.id,
            {
                enabled: false,
                role: fallbackRole,
            },
        ];
    }));
}

function createDraft(
    user: ManagedUser,
    restaurantOptions: RestaurantOption[],
    restaurantStaffRoleOptions: RestaurantStaffRoleOption[],
): UserDraft {
    const fallbackRole = getFallbackRestaurantStaffRole(restaurantStaffRoleOptions);
    const membershipsByRestaurantId = new Map(user.restaurantStaff.map((membership) => {
        return [membership.restaurantId, membership];
    }));

    return {
        dispatcherRole: user.dispatcherProfile?.role ?? 'ORDER_OPERATOR',
        driverStatus: user.driverProfile?.status ?? '',
        name: user.name,
        phone: user.driverProfile?.phone ?? user.customerProfile?.phone ?? '',
        restaurantAccess: Object.fromEntries(restaurantOptions.map((restaurant) => {
            const membership = membershipsByRestaurantId.get(restaurant.id);

            return [
                restaurant.id,
                {
                    enabled: Boolean(membership),
                    role: membership?.role ?? fallbackRole,
                },
            ];
        })),
    };
}

function createEmptyCreateDraft(
    restaurantOptions: RestaurantOption[],
    restaurantStaffRoleOptions: RestaurantStaffRoleOption[],
): CreateUserDraft {
    return {
        dispatcherRole: 'ORDER_OPERATOR',
        email: '',
        name: '',
        password: '',
        restaurantAccess: createEmptyRestaurantAccess(restaurantOptions, restaurantStaffRoleOptions),
    };
}

function formatLabel(value: string): string {
    return value
        .toLowerCase()
        .split('_')
        .map((word) => {
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

function formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('en-CA', {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(new Date(value));
}

function buildUserManagementUrl(userType: string, page: number, searchQuery: string): string {
    const params = new URLSearchParams();
    const trimmedSearchQuery = searchQuery.trim();

    if (trimmedSearchQuery) {
        params.set('q', trimmedSearchQuery);
    }

    if (page > 1) {
        params.set('page', String(page));
    }

    const queryString = params.toString();

    return queryString
        ? `/dispatcher/users/${userType}?${queryString}`
        : `/dispatcher/users/${userType}`;
}

function getPaginationPages(currentPage: number, totalPages: number): number[] {
    const pages = new Set<number>([
        1,
        totalPages,
    ]);

    for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
        if (page >= 1 && page <= totalPages) {
            pages.add(page);
        }
    }

    return Array.from(pages).sort((firstPage, secondPage) => {
        return firstPage - secondPage;
    });
}

export default function DispatcherUserManager({
    canCreateAdminDispatcher,
    currentDispatcherRole,
    currentUserId,
    dispatcherRoleOptions,
    driverStatusOptions,
    restaurantOptions,
    restaurantStaffRoleOptions,
    pagination,
    searchQuery,
    selectedUserType,
    userTypeOptions,
    users,
}: DispatcherUserManagerProps) {
    const router = useRouter();
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [draft, setDraft] = useState<UserDraft | null>(null);
    const [createUserDraft, setCreateUserDraft] = useState<CreateUserDraft | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [pendingUserId, setPendingUserId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const selectedOption = userTypeOptions.find((option) => {
        return option.slug === selectedUserType;
    }) ?? userTypeOptions[0];

    const userById = useMemo(() => {
        return new Map(users.map((user) => {
            return [user.id, user];
        }));
    }, [users]);

    const editingUser = editingUserId ? userById.get(editingUserId) ?? null : null;
    const isPending = pendingUserId !== null;
    const canCreateSelectedUserType = selectedUserType === 'vendors' || selectedUserType === 'dispatchers';
    const createButtonLabel = selectedUserType === 'vendors'
        ? 'Create vendor'
        : selectedUserType === 'dispatchers'
            ? 'Create dispatcher'
            : '';
    const createDispatcherRoleOptions = dispatcherRoleOptions.filter((role) => {
        return canCreateAdminDispatcher || canManageDispatcherRole(currentDispatcherRole, role.value);
    });
    const editDispatcherRoleOptions = dispatcherRoleOptions.filter((role) => {
        return canManageDispatcherRole(currentDispatcherRole, role.value);
    });

    function canEditUser(user: ManagedUser): boolean {
        if (user.role !== 'DISPATCHER') {
            return true;
        }

        const targetRole = user.dispatcherProfile?.role ?? 'ORDER_OPERATOR';

        return canManageDispatcherRole(currentDispatcherRole, targetRole);
    }

    function getEditButtonTitle(user: ManagedUser): string | undefined {
        if (canEditUser(user)) {
            return undefined;
        }

        return 'You cannot edit a dispatcher with a higher access level than your own.';
    }

    function handleUserTypeChange(nextUserType: string): void {
        router.push(buildUserManagementUrl(nextUserType, 1, searchQuery));
    }

    function handleSearchSubmit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();

        const formData = new FormData(event.currentTarget);
        const nextSearchQuery = String(formData.get('q') ?? '');

        router.push(buildUserManagementUrl(selectedUserType, 1, nextSearchQuery));
    }

    function handleSearchClear(): void {
        router.push(buildUserManagementUrl(selectedUserType, 1, ''));
    }

    function goToPage(page: number): void {
        router.push(buildUserManagementUrl(selectedUserType, page, searchQuery));
    }

    function openCreateModal(): void {
        if (!canCreateSelectedUserType) {
            return;
        }

        setCreateUserDraft(createEmptyCreateDraft(restaurantOptions, restaurantStaffRoleOptions));
        setIsCreateModalOpen(true);
        setErrorMessage(null);
        setSuccessMessage(null);
    }

    function closeCreateModal(): void {
        if (isCreating) {
            return;
        }

        setIsCreateModalOpen(false);
        setCreateUserDraft(null);
        setErrorMessage(null);
    }

    function openEditor(user: ManagedUser): void {
        if (!canEditUser(user)) {
            return;
        }

        setEditingUserId(user.id);
        setDraft(createDraft(user, restaurantOptions, restaurantStaffRoleOptions));
        setErrorMessage(null);
        setSuccessMessage(null);
    }

    function closeEditor(): void {
        if (isPending) {
            return;
        }

        setEditingUserId(null);
        setDraft(null);
        setErrorMessage(null);
    }

    function updateDraft(field: keyof UserDraft, value: string): void {
        setDraft((currentDraft) => {
            if (!currentDraft) {
                return currentDraft;
            }

            return {
                ...currentDraft,
                [field]: value,
            };
        });
    }

    function updateRestaurantAccess(
        restaurantId: string,
        update: Partial<{
            enabled: boolean;
            role: RestaurantStaffRole;
        }>,
    ): void {
        setDraft((currentDraft) => {
            if (!currentDraft) {
                return currentDraft;
            }

            const currentAccess = currentDraft.restaurantAccess[restaurantId] ?? {
                enabled: false,
                role: restaurantStaffRoleOptions.find((role) => {
                    return role.value === 'VIEWER';
                })?.value ?? restaurantStaffRoleOptions[0]?.value ?? 'VIEWER',
            };

            return {
                ...currentDraft,
                restaurantAccess: {
                    ...currentDraft.restaurantAccess,
                    [restaurantId]: {
                        ...currentAccess,
                        ...update,
                    },
                },
            };
        });
    }

    function updateCreateDraft(
        field: keyof Omit<CreateUserDraft, 'restaurantAccess'>,
        value: string,
    ): void {
        setCreateUserDraft((currentDraft) => {
            if (!currentDraft) {
                return currentDraft;
            }

            return {
                ...currentDraft,
                [field]: value,
            };
        });
    }

    function updateCreateRestaurantAccess(
        restaurantId: string,
        update: Partial<{
            enabled: boolean;
            role: RestaurantStaffRole;
        }>,
    ): void {
        setCreateUserDraft((currentDraft) => {
            if (!currentDraft) {
                return currentDraft;
            }

            const currentAccess = currentDraft.restaurantAccess[restaurantId] ?? {
                enabled: false,
                role: getFallbackRestaurantStaffRole(restaurantStaffRoleOptions),
            };

            return {
                ...currentDraft,
                restaurantAccess: {
                    ...currentDraft.restaurantAccess,
                    [restaurantId]: {
                        ...currentAccess,
                        ...update,
                    },
                },
            };
        });
    }

    async function handleCreateUser(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        if (!createUserDraft || !canCreateSelectedUserType) {
            return;
        }

        try {
            setIsCreating(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch('/api/dispatcher/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    dispatcherRole: selectedUserType === 'dispatchers'
                        ? createUserDraft.dispatcherRole || undefined
                        : undefined,
                    email: createUserDraft.email,
                    name: createUserDraft.name,
                    password: createUserDraft.password,
                    restaurantAccess: selectedUserType === 'vendors'
                        ? Object.entries(createUserDraft.restaurantAccess)
                            .filter(([, access]) => {
                                return access.enabled;
                            })
                            .map(([restaurantId, access]) => {
                                return {
                                    restaurantId,
                                    role: access.role,
                                };
                            })
                        : undefined,
                    role: selectedUserType === 'vendors' ? 'VENDOR' : 'DISPATCHER',
                }),
            });
            const data = await response.json() as JsonResponse;

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not create user.');
            }

            setSuccessMessage(selectedUserType === 'vendors' ? 'Vendor created.' : 'Dispatcher created.');
            setIsCreateModalOpen(false);
            setCreateUserDraft(null);
            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not create user.');
        } finally {
            setIsCreating(false);
        }
    }

    async function handleSaveUser(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        if (!editingUser || !draft) {
            return;
        }

        try {
            setPendingUserId(editingUser.id);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch(`/api/dispatcher/users/${editingUser.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    driverStatus: draft.driverStatus || undefined,
                    dispatcherRole: editingUser.role === 'DISPATCHER'
                        ? draft.dispatcherRole || undefined
                        : undefined,
                    expectedRole: editingUser.role,
                    name: draft.name,
                    phone: draft.phone,
                    restaurantAccess: editingUser.role === 'VENDOR'
                        ? Object.entries(draft.restaurantAccess)
                            .filter(([, access]) => {
                                return access.enabled;
                            })
                            .map(([restaurantId, access]) => {
                                return {
                                    restaurantId,
                                    role: access.role,
                                };
                            })
                        : undefined,
                }),
            });
            const data = await response.json() as JsonResponse;

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not update user.');
            }

            setSuccessMessage(editingUser.id === currentUserId ? 'Your dispatcher account was updated.' : 'User updated.');
            setEditingUserId(null);
            setDraft(null);
            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not update user.');
        } finally {
            setPendingUserId(null);
        }
    }

    const hasSearchQuery = searchQuery.length > 0;
    const firstVisibleUser = pagination.totalUsers === 0
        ? 0
        : (pagination.currentPage - 1) * pagination.pageSize + 1;
    const lastVisibleUser = Math.min(pagination.currentPage * pagination.pageSize, pagination.totalUsers);
    const pageNumbers = getPaginationPages(pagination.currentPage, pagination.totalPages);

    return (
        <section className="mt-8 space-y-6">
            <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        Account type
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-950">
                        {selectedOption.label}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm text-slate-600">
                        {selectedOption.description}
                    </p>
                </div>

                <label className="text-sm font-medium text-slate-700">
                    Show user type
                    <select
                        value={selectedUserType}
                        onChange={(event) => {
                            handleUserTypeChange(event.target.value);
                        }}
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950"
                    >
                        {userTypeOptions.map((option) => {
                            return (
                                <option key={option.slug} value={option.slug}>
                                    {option.label}
                                </option>
                            );
                        })}
                    </select>
                </label>
            </div>

            {(errorMessage || successMessage) && !editingUser && (
                <div className={`rounded-lg px-3 py-2 text-sm font-medium ${errorMessage
                    ? 'bg-red-50 text-red-700'
                    : 'bg-emerald-50 text-emerald-700'}`}
                >
                    {errorMessage ?? successMessage}
                </div>
            )}

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-950">
                            {selectedOption.label}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                            Showing {firstVisibleUser}-{lastVisibleUser} of {pagination.totalUsers} {pagination.totalUsers === 1 ? 'account' : 'accounts'}
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <form
                            onSubmit={handleSearchSubmit}
                            className="flex flex-col gap-2 sm:min-w-[320px]"
                        >
                            <label className="text-sm font-medium text-slate-700">
                                Search accounts
                                <input
                                    key={`${selectedUserType}-${searchQuery}`}
                                    name="q"
                                    defaultValue={searchQuery}
                                    type="search"
                                    maxLength={120}
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                                />
                            </label>
                            <div className="flex gap-2">
                                <button
                                    type="submit"
                                    className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    Search
                                </button>
                                {hasSearchQuery && (
                                    <button
                                        type="button"
                                        onClick={handleSearchClear}
                                        className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </form>

                        {canCreateSelectedUserType && (
                            <button
                                type="button"
                                onClick={openCreateModal}
                                className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                            >
                                {createButtonLabel}
                            </button>
                        )}
                    </div>
                </div>

                {users.length === 0 ? (
                    <p className="p-5 text-sm text-slate-500">
                        {hasSearchQuery
                            ? 'No accounts match this search.'
                            : 'No accounts exist for this type yet.'}
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-5 py-3">User</th>
                                    <th className="px-5 py-3">Details</th>
                                    <th className="px-5 py-3">Last edit</th>
                                    <th className="px-5 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {users.map((user) => {
                                    const isDriver = user.role === 'DRIVER';
                                    const isCustomer = user.role === 'CUSTOMER';
                                    const phone = user.driverProfile?.phone ?? user.customerProfile?.phone ?? null;
                                    const userCanBeEdited = canEditUser(user);

                                    return (
                                        <tr key={user.id}>
                                            <td className="px-5 py-4">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="font-semibold text-slate-950">
                                                        {user.name}
                                                    </p>
                                                    {user.id === currentUserId && (
                                                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                                                            You
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="mt-1 text-slate-500">
                                                    {user.email}
                                                </p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="space-y-2">
                                                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                                        {formatLabel(user.role)}
                                                    </span>
                                                    {(isDriver || isCustomer) && (
                                                        <p className="text-slate-600">
                                                            Phone: {phone || 'Not set'}
                                                        </p>
                                                    )}
                                                    {isDriver && user.driverProfile && (
                                                        <p className="text-slate-600">
                                    Status: {formatLabel(user.driverProfile.status)}
                                                        </p>
                                                    )}
                                                    {user.role === 'DISPATCHER' && (
                                                        <p className="text-slate-600">
                                                            Dispatcher access: {user.dispatcherProfile
                                                                ? formatLabel(user.dispatcherProfile.role)
                                                                : 'Not set'}
                                                        </p>
                                                    )}
                                                    {user.restaurantStaff.length > 0 && (
                                                        <div className="flex flex-wrap gap-2">
                                                            {user.restaurantStaff.map((membership) => {
                                                                return (
                                                                    <span
                                                                        key={`${membership.restaurantId}-${membership.role}`}
                                                                        className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
                                                                    >
                                                                        {membership.restaurantName}: {formatLabel(membership.role)}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="font-medium text-slate-950">
                                                    {formatDateTime(user.updatedAt)}
                                                </p>
                                                <p className="mt-1 text-slate-500">
                                                    Updated by {user.updatedBy?.name ?? 'System'}
                                                </p>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <button
                                                    type="button"
                                                    disabled={!userCanBeEdited}
                                                    title={getEditButtonTitle(user)}
                                                    onClick={() => {
                                                        openEditor(user);
                                                    }}
                                                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                                                >
                                                    Edit
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-500">
                        Page {pagination.currentPage} of {pagination.totalPages}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={pagination.currentPage <= 1}
                            onClick={() => {
                                goToPage(pagination.currentPage - 1);
                            }}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                        >
                            Previous
                        </button>
                        {pageNumbers.map((page, index) => {
                            const previousPage = pageNumbers[index - 1];
                            const hasGap = previousPage !== undefined && page - previousPage > 1;

                            return (
                                <div key={page} className="flex items-center gap-2">
                                    {hasGap && (
                                        <span className="px-1 text-sm text-slate-400">
                                            ...
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        aria-current={page === pagination.currentPage ? 'page' : undefined}
                                        onClick={() => {
                                            goToPage(page);
                                        }}
                                        className={`min-w-10 rounded-lg border px-3 py-2 text-sm font-semibold ${page === pagination.currentPage
                                            ? 'border-slate-950 bg-slate-950 text-white'
                                            : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                                    >
                                        {page}
                                    </button>
                                </div>
                            );
                        })}
                        <button
                            type="button"
                            disabled={pagination.currentPage >= pagination.totalPages}
                            onClick={() => {
                                goToPage(pagination.currentPage + 1);
                            }}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {isCreateModalOpen && createUserDraft && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="dispatcher-user-create-title"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
                >
                    <form
                        onSubmit={(event) => {
                            void handleCreateUser(event);
                        }}
                        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl"
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                            <div>
                                <p className="text-sm font-medium text-slate-500">
                                    {selectedUserType === 'vendors' ? 'Vendor account' : 'Dispatcher account'}
                                </p>
                                <h2
                                    id="dispatcher-user-create-title"
                                    className="mt-1 text-2xl font-bold text-slate-950"
                                >
                                    {createButtonLabel}
                                </h2>
                            </div>

                            <button
                                type="button"
                                disabled={isCreating}
                                onClick={closeCreateModal}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                                Close
                            </button>
                        </div>

                        <div className="grid gap-4 p-5 md:grid-cols-2">
                            <label className="text-sm font-medium text-slate-700">
                                Name
                                <input
                                    value={createUserDraft.name}
                                    disabled={isCreating}
                                    required
                                    minLength={2}
                                    maxLength={80}
                                    onChange={(event) => {
                                        updateCreateDraft('name', event.target.value);
                                    }}
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                />
                            </label>

                            <label className="text-sm font-medium text-slate-700">
                                Email
                                <input
                                    value={createUserDraft.email}
                                    disabled={isCreating}
                                    required
                                    type="email"
                                    maxLength={255}
                                    onChange={(event) => {
                                        updateCreateDraft('email', event.target.value);
                                    }}
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                />
                            </label>

                            <label className="text-sm font-medium text-slate-700">
                                Temporary password
                                <input
                                    value={createUserDraft.password}
                                    disabled={isCreating}
                                    required
                                    type="password"
                                    minLength={8}
                                    maxLength={128}
                                    onChange={(event) => {
                                        updateCreateDraft('password', event.target.value);
                                    }}
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                />
                            </label>

                            {selectedUserType === 'dispatchers' && (
                                <label className="text-sm font-medium text-slate-700">
                                    Dispatcher access
                                    <select
                                        value={createUserDraft.dispatcherRole}
                                        disabled={isCreating}
                                        required
                                        onChange={(event) => {
                                            updateCreateDraft('dispatcherRole', event.target.value);
                                        }}
                                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                    >
                                        {createDispatcherRoleOptions.map((role) => {
                                            return (
                                                <option key={role.value} value={role.value}>
                                                    {role.label}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </label>
                            )}

                            {selectedUserType === 'vendors' && (
                                <div className="md:col-span-2">
                                    <p className="text-sm font-semibold text-slate-950">
                                        Restaurant access
                                    </p>
                                    <div className="mt-3 grid gap-3">
                                        {restaurantOptions.map((restaurant) => {
                                            const access = createUserDraft.restaurantAccess[restaurant.id] ?? {
                                                enabled: false,
                                                role: getFallbackRestaurantStaffRole(restaurantStaffRoleOptions),
                                            };

                                            return (
                                                <div
                                                    key={restaurant.id}
                                                    className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_220px]"
                                                >
                                                    <label className="flex items-center gap-3 text-sm font-semibold text-slate-950">
                                                        <input
                                                            type="checkbox"
                                                            checked={access.enabled}
                                                            disabled={isCreating}
                                                            onChange={(event) => {
                                                                updateCreateRestaurantAccess(restaurant.id, {
                                                                    enabled: event.target.checked,
                                                                });
                                                            }}
                                                            className="h-4 w-4 rounded border-slate-300"
                                                        />
                                                        {restaurant.name}
                                                    </label>

                                                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                        Staff role
                                                        <select
                                                            value={access.role}
                                                            disabled={isCreating || !access.enabled}
                                                            onChange={(event) => {
                                                                updateCreateRestaurantAccess(restaurant.id, {
                                                                    role: event.target.value as RestaurantStaffRole,
                                                                });
                                                            }}
                                                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100 disabled:text-slate-400"
                                                        >
                                                            {restaurantStaffRoleOptions.map((role) => {
                                                                return (
                                                                    <option key={role.value} value={role.value}>
                                                                        {role.label}
                                                                    </option>
                                                                );
                                                            })}
                                                        </select>
                                                    </label>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {errorMessage && (
                            <p className="mx-5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                {errorMessage}
                            </p>
                        )}

                        <div className="flex justify-end gap-2 border-t border-slate-200 p-5">
                            <button
                                type="button"
                                disabled={isCreating}
                                onClick={closeCreateModal}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isCreating}
                                className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                {isCreating ? 'Creating...' : createButtonLabel}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {editingUser && draft && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="dispatcher-user-editor-title"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
                >
                    <form
                        onSubmit={(event) => {
                            void handleSaveUser(event);
                        }}
                        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl"
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                            <div>
                                <p className="text-sm font-medium text-slate-500">
                                    {formatLabel(editingUser.role)} account
                                </p>
                                <h2
                                    id="dispatcher-user-editor-title"
                                    className="mt-1 text-2xl font-bold text-slate-950"
                                >
                                    Edit {editingUser.name}
                                </h2>
                            </div>

                            <button
                                type="button"
                                disabled={isPending}
                                onClick={closeEditor}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                                Close
                            </button>
                        </div>

                        <div className="grid gap-4 p-5 md:grid-cols-2">
                            <label className="text-sm font-medium text-slate-700">
                                Name
                                <input
                                    value={draft.name}
                                    disabled={isPending}
                                    required
                                    minLength={2}
                                    maxLength={80}
                                    onChange={(event) => {
                                        updateDraft('name', event.target.value);
                                    }}
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                />
                            </label>

                            <label className="text-sm font-medium text-slate-700">
                                Email
                                <input
                                    value={editingUser.email}
                                    disabled
                                    type="email"
                                    className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
                                />
                            </label>

                            {(editingUser.role === 'DRIVER' || editingUser.role === 'CUSTOMER') && (
                                <label className="text-sm font-medium text-slate-700">
                                    Phone
                                    <input
                                        value={draft.phone}
                                        disabled={isPending}
                                        maxLength={40}
                                        onChange={(event) => {
                                            updateDraft('phone', event.target.value);
                                        }}
                                        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                    />
                                </label>
                            )}

                            {editingUser.role === 'DRIVER' && (
                                <label className="text-sm font-medium text-slate-700">
                                    Driver status
                                    <select
                                        value={draft.driverStatus}
                                        disabled={isPending}
                                        onChange={(event) => {
                                            updateDraft('driverStatus', event.target.value);
                                        }}
                                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                    >
                                        {driverStatusOptions.map((status) => {
                                            return (
                                                <option key={status} value={status}>
                                                    {formatLabel(status)}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </label>
                            )}

                            {editingUser.role === 'DISPATCHER' && (
                                <label className="text-sm font-medium text-slate-700">
                                    Dispatcher access
                                    <select
                                        value={draft.dispatcherRole}
                                        disabled={isPending}
                                        required
                                        onChange={(event) => {
                                            updateDraft('dispatcherRole', event.target.value);
                                        }}
                                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                    >
                                        {editDispatcherRoleOptions.map((role) => {
                                            return (
                                                <option key={role.value} value={role.value}>
                                                    {role.label}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </label>
                            )}

                            {editingUser.role === 'VENDOR' && (
                                <div className="md:col-span-2">
                                    <p className="text-sm font-semibold text-slate-950">
                                        Restaurant access
                                    </p>
                                    <div className="mt-3 grid gap-3">
                                        {restaurantOptions.map((restaurant) => {
                                            const access = draft.restaurantAccess[restaurant.id] ?? {
                                                enabled: false,
                                                role: restaurantStaffRoleOptions.find((role) => {
                                                    return role.value === 'VIEWER';
                                                })?.value ?? restaurantStaffRoleOptions[0]?.value ?? 'VIEWER',
                                            };

                                            return (
                                                <div
                                                    key={restaurant.id}
                                                    className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_220px]"
                                                >
                                                    <label className="flex items-center gap-3 text-sm font-semibold text-slate-950">
                                                        <input
                                                            type="checkbox"
                                                            checked={access.enabled}
                                                            disabled={isPending}
                                                            onChange={(event) => {
                                                                updateRestaurantAccess(restaurant.id, {
                                                                    enabled: event.target.checked,
                                                                });
                                                            }}
                                                            className="h-4 w-4 rounded border-slate-300"
                                                        />
                                                        {restaurant.name}
                                                    </label>

                                                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                        Staff role
                                                        <select
                                                            value={access.role}
                                                            disabled={isPending || !access.enabled}
                                                            onChange={(event) => {
                                                                updateRestaurantAccess(restaurant.id, {
                                                                    role: event.target.value as RestaurantStaffRole,
                                                                });
                                                            }}
                                                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100 disabled:text-slate-400"
                                                        >
                                                            {restaurantStaffRoleOptions.map((role) => {
                                                                return (
                                                                    <option key={role.value} value={role.value}>
                                                                        {role.label}
                                                                    </option>
                                                                );
                                                            })}
                                                        </select>
                                                    </label>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 md:col-span-2">
                                <p>
                                    Last edited {formatDateTime(editingUser.updatedAt)}
                                </p>
                                <p className="mt-1">
                                    Updated by {editingUser.updatedBy?.name ?? 'System'}
                                </p>
                            </div>
                        </div>

                        {errorMessage && (
                            <p className="mx-5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                {errorMessage}
                            </p>
                        )}

                        <div className="flex justify-end gap-2 border-t border-slate-200 p-5">
                            <button
                                type="button"
                                disabled={isPending}
                                onClick={closeEditor}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isPending}
                                className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                {isPending ? 'Saving...' : 'Save changes'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </section>
    );
}
