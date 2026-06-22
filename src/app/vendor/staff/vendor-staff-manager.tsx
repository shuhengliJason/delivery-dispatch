'use client';

import { type RestaurantStaffRole, type UserRole } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

type StaffRestaurant = {
    id: string;
    name: string;
    featureImageUrl: string | null;
};

type StaffUser = {
    id: string;
    name: string;
    email: string;
    role?: UserRole;
};

type StaffMembership = {
    id: string;
    role: RestaurantStaffRole;
    user: StaffUser;
};

type RoleOption = {
    value: RestaurantStaffRole;
    label: string;
};

type VendorStaffManagerProps = {
    currentUserStaffRole: RestaurantStaffRole | 'ADMIN';
    initialRestaurantId: string;
    restaurants: StaffRestaurant[];
    roleOptions: RoleOption[];
    staffMemberships: StaffMembership[];
};

type JsonResponse = {
    error?: string;
};

const restaurantStaffRoleRanks: Record<RestaurantStaffRole, number> = {
    VIEWER: 1,
    ORDER_STAFF: 2,
    MANAGER: 3,
    OWNER: 4,
};

function canManageStaffRole(
    currentUserStaffRole: RestaurantStaffRole | 'ADMIN',
    targetRole: RestaurantStaffRole,
): boolean {
    if (currentUserStaffRole === 'ADMIN') {
        return true;
    }

    return restaurantStaffRoleRanks[currentUserStaffRole] > restaurantStaffRoleRanks[targetRole];
}

function createMembershipDrafts(staffMemberships: StaffMembership[]): Record<string, RestaurantStaffRole> {
    return Object.fromEntries(staffMemberships.map((membership) => {
        return [membership.id, membership.role];
    })) as Record<string, RestaurantStaffRole>;
}

export default function VendorStaffManager({
    currentUserStaffRole,
    initialRestaurantId,
    restaurants,
    roleOptions,
    staffMemberships,
}: VendorStaffManagerProps) {
    const router = useRouter();
    const assignableRoleOptions = roleOptions.filter((role) => {
        return canManageStaffRole(currentUserStaffRole, role.value);
    });
    const selectedRestaurantId = initialRestaurantId || restaurants[0]?.id || '';
    const selectedRestaurant = restaurants.find((restaurant) => {
        return restaurant.id === selectedRestaurantId;
    }) ?? null;
    const [newUserName, setNewUserName] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newRole, setNewRole] = useState<RestaurantStaffRole>(assignableRoleOptions[0]?.value ?? ('VIEWER' as RestaurantStaffRole));
    const [membershipDrafts, setMembershipDrafts] = useState<Record<string, RestaurantStaffRole>>(() => {
        return createMembershipDrafts(staffMemberships);
    });
    const [isAdding, setIsAdding] = useState(false);
    const [pendingStaffId, setPendingStaffId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    function getRoleLabel(role: RestaurantStaffRole): string {
        return roleOptions.find((option) => {
            return option.value === role;
        })?.label ?? role;
    }

    function getLockedRoleTitle(role: RestaurantStaffRole): string | undefined {
        if (canManageStaffRole(currentUserStaffRole, role)) {
            return undefined;
        }

        return 'You cannot modify a vendor user with a role at or above your own.';
    }

    function handleRestaurantChange(restaurantId: string): void {
        const params = new URLSearchParams({
            restaurantId,
        });

        router.push(`/vendor/staff?${params.toString()}`);
    }

    async function handleAddStaff(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        if (!selectedRestaurantId) {
            return;
        }

        if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword) {
            setErrorMessage('Enter the new vendor user name, email, and password.');
            return;
        }

        try {
            setIsAdding(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch('/api/vendor/staff', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: newUserEmail,
                    name: newUserName,
                    password: newUserPassword,
                    restaurantId: selectedRestaurantId,
                    role: newRole,
                }),
            });
            const data = await response.json() as JsonResponse;

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not add staff member.');
            }

            setNewUserName('');
            setNewUserEmail('');
            setNewUserPassword('');
            setSuccessMessage('Vendor user created and added to this restaurant.');
            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not create vendor user.');
        } finally {
            setIsAdding(false);
        }
    }

    async function handleUpdateStaff(staffId: string): Promise<void> {
        const role = membershipDrafts[staffId];

        if (!role) {
            return;
        }

        try {
            setPendingStaffId(staffId);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch(`/api/vendor/staff/${staffId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    role,
                }),
            });
            const data = await response.json() as JsonResponse;

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not update staff role.');
            }

            setSuccessMessage('Staff role updated.');
            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not update staff role.');
        } finally {
            setPendingStaffId(null);
        }
    }

    async function handleRemoveStaff(staffId: string, userName: string): Promise<void> {
        const confirmed = window.confirm(`Remove ${userName} from this restaurant?`);

        if (!confirmed) {
            return;
        }

        try {
            setPendingStaffId(staffId);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch(`/api/vendor/staff/${staffId}`, {
                method: 'DELETE',
            });
            const data = await response.json() as JsonResponse;

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not remove staff member.');
            }

            setSuccessMessage('Staff member removed.');
            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not remove staff member.');
        } finally {
            setPendingStaffId(null);
        }
    }

    if (restaurants.length === 0 || !selectedRestaurant) {
        return (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">
                    No restaurants are available for staff role management.
                </p>
            </section>
        );
    }

    return (
        <section className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                            Restaurant access
                        </p>
                        <h2 className="mt-1 text-2xl font-bold text-slate-950">
                            Manage staff for {selectedRestaurant.name}
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm text-slate-600">
                            Create vendor users for this restaurant, change their operational role, or remove access.
                        </p>
                    </div>

                    <label className="text-sm font-medium text-slate-700">
                        Restaurant
                        <select
                            value={selectedRestaurantId}
                            onChange={(event) => {
                                handleRestaurantChange(event.target.value);
                            }}
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950"
                        >
                            {restaurants.map((restaurant) => {
                                return (
                                    <option key={restaurant.id} value={restaurant.id}>
                                        {restaurant.name}
                                    </option>
                                );
                            })}
                        </select>
                    </label>
                </div>
            </div>

            <form
                onSubmit={(event) => {
                    void handleAddStaff(event);
                }}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
                <div className="grid gap-4 lg:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                        New vendor name
                        <input
                            value={newUserName}
                            disabled={isAdding}
                            required
                            minLength={2}
                            maxLength={80}
                            onChange={(event) => {
                                setNewUserName(event.target.value);
                            }}
                            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                        />
                    </label>

                    <label className="text-sm font-medium text-slate-700">
                        Email
                        <input
                            value={newUserEmail}
                            disabled={isAdding}
                            required
                            type="email"
                            maxLength={255}
                            onChange={(event) => {
                                setNewUserEmail(event.target.value);
                            }}
                            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                        />
                    </label>

                    <label className="text-sm font-medium text-slate-700">
                        Temporary password
                        <input
                            value={newUserPassword}
                            disabled={isAdding}
                            required
                            type="password"
                            minLength={8}
                            maxLength={128}
                            onChange={(event) => {
                                setNewUserPassword(event.target.value);
                            }}
                            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                        />
                    </label>

                    <label className="text-sm font-medium text-slate-700">
                        Role
                        <select
                            value={newRole}
                            disabled={isAdding}
                            onChange={(event) => {
                                setNewRole(event.target.value as RestaurantStaffRole);
                            }}
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                        >
                            {assignableRoleOptions.map((role) => {
                                return (
                                    <option key={role.value} value={role.value}>
                                        {role.label}
                                    </option>
                                );
                            })}
                        </select>
                    </label>
                </div>

                <div className="mt-4 flex justify-end">
                    <button
                        type="submit"
                        disabled={isAdding}
                        className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                        {isAdding ? 'Creating...' : 'Create vendor user'}
                    </button>
                </div>
            </form>

            {(errorMessage || successMessage) && (
                <div className={`rounded-lg px-3 py-2 text-sm font-medium ${errorMessage
                    ? 'bg-red-50 text-red-700'
                    : 'bg-emerald-50 text-emerald-700'}`}
                >
                    {errorMessage ?? successMessage}
                </div>
            )}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-4">
                    <h3 className="text-lg font-semibold text-slate-950">
                        Current staff
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                        {staffMemberships.length} assigned {staffMemberships.length === 1 ? 'user' : 'users'}
                    </p>
                </div>

                {staffMemberships.length === 0 ? (
                    <p className="p-5 text-sm text-slate-500">
                        This restaurant does not have any vendor staff assigned yet.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-5 py-3">User</th>
                                    <th className="px-5 py-3">Current role</th>
                                    <th className="px-5 py-3">Change role</th>
                                    <th className="px-5 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {staffMemberships.map((membership) => {
                                    const draftRole = membershipDrafts[membership.id] ?? membership.role;
                                    const isPending = pendingStaffId === membership.id;
                                    const hasRoleChange = draftRole !== membership.role;
                                    const canManageMembership = canManageStaffRole(currentUserStaffRole, membership.role);
                                    const rowRoleOptions = canManageMembership
                                        ? assignableRoleOptions
                                        : roleOptions.filter((role) => {
                                            return role.value === membership.role;
                                        });

                                    return (
                                        <tr key={membership.id}>
                                            <td className="px-5 py-4">
                                                <p className="font-semibold text-slate-950">
                                                    {membership.user.name}
                                                </p>
                                                <p className="mt-1 text-slate-500">
                                                    {membership.user.email}
                                                </p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                                    {getRoleLabel(membership.role)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <select
                                                    value={draftRole}
                                                    disabled={isPending || !canManageMembership}
                                                    title={getLockedRoleTitle(membership.role)}
                                                    onChange={(event) => {
                                                        setMembershipDrafts((currentDrafts) => {
                                                            return {
                                                                ...currentDrafts,
                                                                [membership.id]: event.target.value as RestaurantStaffRole,
                                                            };
                                                        });
                                                    }}
                                                    className="w-full min-w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                                >
                                                    {rowRoleOptions.map((role) => {
                                                        return (
                                                            <option key={role.value} value={role.value}>
                                                                {role.label}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        disabled={!hasRoleChange || isPending || !canManageMembership}
                                                        title={getLockedRoleTitle(membership.role)}
                                                        onClick={() => {
                                                            void handleUpdateStaff(membership.id);
                                                        }}
                                                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                                                    >
                                                        {isPending && hasRoleChange ? 'Saving...' : 'Save'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={isPending || !canManageMembership}
                                                        title={getLockedRoleTitle(membership.role)}
                                                        onClick={() => {
                                                            void handleRemoveStaff(membership.id, membership.user.name);
                                                        }}
                                                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                                                    >
                                                        {isPending ? 'Working...' : 'Remove'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}
