'use client';

import { MenuOptionSelectionType } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';

type VendorRestaurant = {
    id: string;
    name: string;
};

type VendorMenuOption = {
    id: string;
    name: string;
    priceCents: number;
    isDefault: boolean;
};

type VendorMenuItem = {
    id: string;
    restaurantId: string;
    restaurantName: string;
    name: string;
    description: string | null;
    category: string;
    priceCents: number;
    isAvailable: boolean;
    optionGroups: Array<{
        id: string;
        name: string;
        selectionType: MenuOptionSelectionType;
        isRequired: boolean;
        minSelections: number;
        maxSelections: number | null;
        isAvailable: boolean;
        options: VendorMenuOption[];
    }>;
};

type VendorDishesManagerProps = {
    initialRestaurantId: string;
    restaurants: VendorRestaurant[];
    canEditMenu: boolean;
    menuItems: VendorMenuItem[];
};

type DishDraft = {
    id: string;
    name: string;
    description: string;
    category: string;
    price: string;
    isAvailable: boolean;
};

type OptionGroupDraft = {
    id: string;
    name: string;
    selectionType: MenuOptionSelectionType;
    isRequired: boolean;
    minSelections: string;
    maxSelections: string;
    isAvailable: boolean;
};

function formatCurrency(cents: number): string {
    return new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
    }).format(cents / 100);
}

function optionModeLabel(selectionType: MenuOptionSelectionType): string {
    return selectionType === MenuOptionSelectionType.SINGLE ? 'pick one' : 'pick many';
}

export default function VendorDishesManager({
    initialRestaurantId,
    restaurants,
    canEditMenu,
    menuItems,
}: VendorDishesManagerProps) {
    const router = useRouter();
    const restaurantId = initialRestaurantId || (restaurants[0]?.id ?? '');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [price, setPrice] = useState('');
    const [isAddDishModalOpen, setIsAddDishModalOpen] = useState(false);
    const [isAddingDish, setIsAddingDish] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [addSuccess, setAddSuccess] = useState<string | null>(null);
    const [dishDraft, setDishDraft] = useState<DishDraft | null>(null);
    const [optionGroupDraft, setOptionGroupDraft] = useState<OptionGroupDraft | null>(null);
    const [modalError, setModalError] = useState<string | null>(null);
    const [isSavingModal, setIsSavingModal] = useState(false);
    const [deletingOptionGroupId, setDeletingOptionGroupId] = useState<string | null>(null);
    const [updatingDishId, setUpdatingDishId] = useState<string | null>(null);
    const [updatingOptionGroupId, setUpdatingOptionGroupId] = useState<string | null>(null);
    const [optionActionError, setOptionActionError] = useState<string | null>(null);

    const selectedRestaurantItems = menuItems.filter((item) => {
        return item.restaurantId === restaurantId;
    });
    const categories = useMemo(() => {
        return Array.from(new Set(selectedRestaurantItems.map((item) => {
            return item.category;
        }))).sort((firstCategory, secondCategory) => {
            return firstCategory.localeCompare(secondCategory);
        });
    }, [selectedRestaurantItems]);
    const groupedMenuItems = categories.map((categoryName) => {
        return {
            category: categoryName,
            items: selectedRestaurantItems.filter((item) => {
                return item.category === categoryName;
            }),
        };
    });
    const selectedRestaurant = restaurants.find((restaurant) => {
        return restaurant.id === restaurantId;
    }) ?? null;

    async function handleAddDish(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        const priceNumber = Number.parseFloat(price);

        if (!Number.isFinite(priceNumber)) {
            setAddError('Enter a valid price.');
            return;
        }

        try {
            setIsAddingDish(true);
            setAddError(null);
            setAddSuccess(null);

            const response = await fetch('/api/vendor/menu', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    restaurantId,
                    name,
                    description,
                    category,
                    priceCents: Math.round(priceNumber * 100),
                }),
            });
            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not add dish.');
            }

            setName('');
            setDescription('');
            setCategory('');
            setPrice('');
            setAddSuccess('Dish added.');
            setIsAddDishModalOpen(false);
            router.refresh();
        } catch (error) {
            setAddError(error instanceof Error ? error.message : 'Could not add dish.');
        } finally {
            setIsAddingDish(false);
        }
    }

    async function handleSaveDish(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        if (!dishDraft) {
            return;
        }

        const priceNumber = Number.parseFloat(dishDraft.price);

        if (!Number.isFinite(priceNumber)) {
            setModalError('Enter a valid price.');
            return;
        }

        try {
            setIsSavingModal(true);
            setModalError(null);

            const response = await fetch(`/api/vendor/menu/${dishDraft.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: dishDraft.name,
                    description: dishDraft.description,
                    category: dishDraft.category,
                    priceCents: Math.round(priceNumber * 100),
                    isAvailable: dishDraft.isAvailable,
                }),
            });
            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not update dish.');
            }

            setDishDraft(null);
            router.refresh();
        } catch (error) {
            setModalError(error instanceof Error ? error.message : 'Could not update dish.');
        } finally {
            setIsSavingModal(false);
        }
    }

    async function handleSaveOptionGroup(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        if (!optionGroupDraft) {
            return;
        }

        const minSelections = Number.parseInt(optionGroupDraft.minSelections, 10);
        const maxSelections = optionGroupDraft.selectionType === MenuOptionSelectionType.SINGLE
            ? 1
            : optionGroupDraft.maxSelections.trim()
                ? Number.parseInt(optionGroupDraft.maxSelections, 10)
                : null;

        try {
            setIsSavingModal(true);
            setModalError(null);

            const response = await fetch(`/api/vendor/menu-option-groups/${optionGroupDraft.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: optionGroupDraft.name,
                    selectionType: optionGroupDraft.selectionType,
                    isRequired: optionGroupDraft.isRequired,
                    minSelections,
                    maxSelections,
                    isAvailable: optionGroupDraft.isAvailable,
                }),
            });
            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not update option group.');
            }

            setOptionGroupDraft(null);
            router.refresh();
        } catch (error) {
            setModalError(error instanceof Error ? error.message : 'Could not update option group.');
        } finally {
            setIsSavingModal(false);
        }
    }

    async function handleSetDishAvailability(item: VendorMenuItem, isAvailable: boolean): Promise<void> {
        try {
            setUpdatingDishId(item.id);
            setOptionActionError(null);

            const response = await fetch(`/api/vendor/menu/${item.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: item.name,
                    description: item.description ?? '',
                    category: item.category,
                    priceCents: item.priceCents,
                    isAvailable,
                }),
            });
            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not update dish.');
            }

            router.refresh();
        } catch (error) {
            setOptionActionError(error instanceof Error ? error.message : 'Could not update dish.');
        } finally {
            setUpdatingDishId(null);
        }
    }

    async function handleDeleteDish(itemId: string): Promise<void> {
        const shouldDelete = window.confirm('Are you sure to delete this dish?');

        if (!shouldDelete) {
            return;
        }

        try {
            setUpdatingDishId(itemId);
            setOptionActionError(null);

            const response = await fetch(`/api/vendor/menu/${itemId}`, {
                method: 'DELETE',
            });
            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not delete dish.');
            }

            router.refresh();
        } catch (error) {
            setOptionActionError(error instanceof Error ? error.message : 'Could not delete dish.');
        } finally {
            setUpdatingDishId(null);
        }
    }

    async function handleSetOptionGroupAvailability(
        optionGroup: VendorMenuItem['optionGroups'][number],
        isAvailable: boolean,
    ): Promise<void> {
        try {
            setUpdatingOptionGroupId(optionGroup.id);
            setOptionActionError(null);

            const response = await fetch(`/api/vendor/menu-option-groups/${optionGroup.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: optionGroup.name,
                    selectionType: optionGroup.selectionType,
                    isRequired: optionGroup.isRequired,
                    minSelections: optionGroup.minSelections,
                    maxSelections: optionGroup.maxSelections,
                    isAvailable,
                }),
            });
            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not update option group.');
            }

            router.refresh();
        } catch (error) {
            setOptionActionError(error instanceof Error ? error.message : 'Could not update option group.');
        } finally {
            setUpdatingOptionGroupId(null);
        }
    }

    async function handleDeleteOptionGroup(optionGroupId: string): Promise<void> {
        const shouldDelete = window.confirm('Are you sure to delete this option?');

        if (!shouldDelete) {
            return;
        }

        try {
            setDeletingOptionGroupId(optionGroupId);
            setOptionActionError(null);

            const response = await fetch(`/api/vendor/menu-option-groups/${optionGroupId}`, {
                method: 'DELETE',
            });
            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not delete option group.');
            }

            router.refresh();
        } catch (error) {
            setOptionActionError(error instanceof Error ? error.message : 'Could not delete option group.');
        } finally {
            setDeletingOptionGroupId(null);
        }
    }

    if (restaurants.length === 0) {
        return (
            <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-950">
                    Existing dishes
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                    No restaurants are assigned to this vendor yet.
                </p>
            </section>
        );
    }

    return (
        <>
            <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Managing restaurant
                        </p>
                        <p className="mt-1 text-base font-bold text-slate-950">
                            {selectedRestaurant?.name ?? 'Selected restaurant'}
                        </p>
                    </div>

                    {canEditMenu && (
                        <button
                            type="button"
                            onClick={() => {
                                setAddError(null);
                                setAddSuccess(null);
                                setIsAddDishModalOpen(true);
                            }}
                            className="w-full rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 sm:w-auto"
                        >
                            Add dish
                        </button>
                    )}
                </div>

                {addSuccess && (
                    <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                        {addSuccess}
                    </p>
                )}
            </section>

            <section className="mt-8 space-y-6">
                {groupedMenuItems.length === 0 ? (
                    <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
                        No dishes yet.
                    </p>
                ) : groupedMenuItems.map((group) => {
                    return (
                        <div key={group.category}>
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                                {group.category}
                            </h2>

                            <div className="mt-3 grid gap-4">
                                {group.items.map((item) => {
                                    return (
                                        <article
                                            key={item.id}
                                            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div>
                                                    <h3 className="text-lg font-semibold text-slate-950">
                                                        {item.name}
                                                    </h3>
                                                    <p className="mt-1 text-sm text-slate-500">
                                                        {item.description ?? 'No description.'}
                                                    </p>
                                                </div>
                                                {canEditMenu && (
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setModalError(null);
                                                            setDishDraft({
                                                                id: item.id,
                                                                name: item.name,
                                                                description: item.description ?? '',
                                                                category: item.category,
                                                                price: String(item.priceCents / 100),
                                                                isAvailable: item.isAvailable,
                                                            });
                                                        }}
                                                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                                    >
                                                        Edit dish
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={updatingDishId === item.id}
                                                        onClick={() => {
                                                            void handleSetDishAvailability(item, !item.isAvailable);
                                                        }}
                                                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                                                    >
                                                        {item.isAvailable ? 'Inactivate' : 'Activate'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={updatingDishId === item.id}
                                                        onClick={() => {
                                                            void handleDeleteDish(item.id);
                                                        }}
                                                        className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:text-red-300"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                                )}
                                            </div>

                                            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                                                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                                                    {formatCurrency(item.priceCents)}
                                                </span>
                                                <span className={`rounded-full px-2 py-1 ${item.isAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    {item.isAvailable ? 'Available' : 'Unavailable'}
                                                </span>
                                                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                                                    {item.restaurantName}
                                                </span>
                                            </div>

                                            <div className="mt-5 space-y-4 border-t border-slate-200 pt-4">
                                                {item.optionGroups.length === 0 ? (
                                                    <p className="text-sm text-slate-500">
                                                        No options on this dish.
                                                    </p>
                                                ) : item.optionGroups.map((optionGroup) => {
                                                    return (
                                                        <section key={optionGroup.id}>
                                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                                <div>
                                                                    <p className="text-sm font-semibold text-slate-950">
                                                                        {optionGroup.name}
                                                                    </p>
                                                                    <p className="mt-1 text-xs text-slate-500">
                                                                        {optionModeLabel(optionGroup.selectionType)} / {optionGroup.isRequired ? 'mandatory' : 'optional'} / {optionGroup.isAvailable ? 'active' : 'inactive'}
                                                                    </p>
                                                                </div>

                                                                {canEditMenu && (
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setModalError(null);
                                                                            setOptionGroupDraft({
                                                                                id: optionGroup.id,
                                                                                name: optionGroup.name,
                                                                                selectionType: optionGroup.selectionType,
                                                                                isRequired: optionGroup.isRequired,
                                                                                minSelections: String(optionGroup.minSelections),
                                                                                maxSelections: optionGroup.maxSelections === null ? '' : String(optionGroup.maxSelections),
                                                                                isAvailable: optionGroup.isAvailable,
                                                                            });
                                                                        }}
                                                                        className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        disabled={updatingOptionGroupId === optionGroup.id}
                                                                        onClick={() => {
                                                                            void handleSetOptionGroupAvailability(optionGroup, !optionGroup.isAvailable);
                                                                        }}
                                                                        className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:text-slate-300"
                                                                    >
                                                                        {optionGroup.isAvailable ? 'Inactivate' : 'Activate'}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        disabled={deletingOptionGroupId === optionGroup.id}
                                                                        onClick={() => {
                                                                            void handleDeleteOptionGroup(optionGroup.id);
                                                                        }}
                                                                        className="rounded-lg bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:text-red-300"
                                                                    >
                                                                        {deletingOptionGroupId === optionGroup.id ? 'Deleting' : 'Delete'}
                                                                    </button>
                                                                </div>
                                                                )}
                                                            </div>
                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                {optionGroup.options.map((option) => {
                                                                    return (
                                                                        <span
                                                                            key={option.id}
                                                                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                                                                        >
                                                                            {option.name}{option.priceCents > 0 ? ` +${formatCurrency(option.priceCents)}` : ''}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        </section>
                                                    );
                                                })}
                                            </div>

                                            {optionActionError && (
                                                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                                    {optionActionError}
                                                </p>
                                            )}
                                        </article>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </section>

            {canEditMenu && isAddDishModalOpen && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
                    <form
                        onSubmit={(event) => {
                            void handleAddDish(event);
                        }}
                        className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl"
                    >
                        <h2 className="text-lg font-semibold text-slate-950">
                            Add dish
                        </h2>

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2 rounded-lg bg-slate-50 px-3 py-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Restaurant
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">
                                    {selectedRestaurant?.name ?? 'Selected restaurant'}
                                </p>
                            </div>

                            <div>
                                <label
                                    htmlFor="add-dish-name"
                                    className="text-sm font-medium text-slate-700"
                                >
                                    Dish name
                                </label>
                                <input
                                    id="add-dish-name"
                                    value={name}
                                    required
                                    disabled={isAddingDish}
                                    onChange={(event) => {
                                        setName(event.target.value);
                                    }}
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="add-dish-category"
                                    className="text-sm font-medium text-slate-700"
                                >
                                    Category
                                </label>
                                <input
                                    id="add-dish-category"
                                    value={category}
                                    required
                                    disabled={isAddingDish}
                                    onChange={(event) => {
                                        setCategory(event.target.value);
                                    }}
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="add-dish-price"
                                    className="text-sm font-medium text-slate-700"
                                >
                                    Price
                                </label>
                                <input
                                    id="add-dish-price"
                                    value={price}
                                    required
                                    type="number"
                                    min="1"
                                    step="0.01"
                                    disabled={isAddingDish}
                                    onChange={(event) => {
                                        setPrice(event.target.value);
                                    }}
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                />
                            </div>

                            <div className="sm:col-span-2">
                                <label
                                    htmlFor="add-dish-description"
                                    className="text-sm font-medium text-slate-700"
                                >
                                    Description
                                </label>
                                <textarea
                                    id="add-dish-description"
                                    value={description}
                                    disabled={isAddingDish}
                                    onChange={(event) => {
                                        setDescription(event.target.value);
                                    }}
                                    rows={3}
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                />
                            </div>
                        </div>

                        {addError && (
                            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                {addError}
                            </p>
                        )}

                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                disabled={isAddingDish}
                                onClick={() => {
                                    setAddError(null);
                                    setIsAddDishModalOpen(false);
                                }}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isAddingDish}
                                className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                {isAddingDish ? 'Adding...' : 'Add dish'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {canEditMenu && dishDraft && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
                    <form
                        onSubmit={(event) => {
                            void handleSaveDish(event);
                        }}
                        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
                    >
                        <h2 className="text-lg font-semibold text-slate-950">
                            Edit dish
                        </h2>
                        <div className="mt-4 grid gap-4">
                            <input
                                value={dishDraft.name}
                                required
                                onChange={(event) => {
                                    setDishDraft({ ...dishDraft, name: event.target.value });
                                }}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950"
                            />
                            <input
                                value={dishDraft.category}
                                required
                                onChange={(event) => {
                                    setDishDraft({ ...dishDraft, category: event.target.value });
                                }}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950"
                            />
                            <input
                                value={dishDraft.price}
                                required
                                type="number"
                                min="1"
                                step="0.01"
                                onChange={(event) => {
                                    setDishDraft({ ...dishDraft, price: event.target.value });
                                }}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950"
                            />
                            <textarea
                                value={dishDraft.description}
                                rows={3}
                                onChange={(event) => {
                                    setDishDraft({ ...dishDraft, description: event.target.value });
                                }}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950"
                            />
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={dishDraft.isAvailable}
                                    onChange={(event) => {
                                        setDishDraft({ ...dishDraft, isAvailable: event.target.checked });
                                    }}
                                />
                                Available to customers
                            </label>
                        </div>

                        {modalError && (
                            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                {modalError}
                            </p>
                        )}

                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setDishDraft(null);
                                }}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSavingModal}
                                className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
                            >
                                {isSavingModal ? 'Saving...' : 'Save dish'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {canEditMenu && optionGroupDraft && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
                    <form
                        onSubmit={(event) => {
                            void handleSaveOptionGroup(event);
                        }}
                        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
                    >
                        <h2 className="text-lg font-semibold text-slate-950">
                            Edit option group
                        </h2>
                        <div className="mt-4 grid gap-4">
                            <input
                                value={optionGroupDraft.name}
                                required
                                onChange={(event) => {
                                    setOptionGroupDraft({ ...optionGroupDraft, name: event.target.value });
                                }}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950"
                            />

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                                    <input
                                        type="radio"
                                        checked={optionGroupDraft.selectionType === MenuOptionSelectionType.SINGLE}
                                        onChange={() => {
                                            setOptionGroupDraft({
                                                ...optionGroupDraft,
                                                selectionType: MenuOptionSelectionType.SINGLE,
                                                maxSelections: '1',
                                            });
                                        }}
                                        className="mr-2"
                                    />
                                    Pick one
                                </label>

                                <label className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                                    <input
                                        type="radio"
                                        checked={optionGroupDraft.selectionType === MenuOptionSelectionType.MULTIPLE}
                                        onChange={() => {
                                            setOptionGroupDraft({
                                                ...optionGroupDraft,
                                                selectionType: MenuOptionSelectionType.MULTIPLE,
                                                maxSelections: optionGroupDraft.maxSelections === '1' ? '' : optionGroupDraft.maxSelections,
                                            });
                                        }}
                                        className="mr-2"
                                    />
                                    Pick many
                                </label>
                            </div>

                            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={optionGroupDraft.isRequired}
                                    onChange={(event) => {
                                        setOptionGroupDraft({
                                            ...optionGroupDraft,
                                            isRequired: event.target.checked,
                                            minSelections: event.target.checked ? '1' : '0',
                                        });
                                    }}
                                />
                                Mandatory group
                            </label>

                            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={optionGroupDraft.isAvailable}
                                    onChange={(event) => {
                                        setOptionGroupDraft({
                                            ...optionGroupDraft,
                                            isAvailable: event.target.checked,
                                        });
                                    }}
                                />
                                Active for customers
                            </label>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="text-sm font-medium text-slate-700">
                                    Customer must pick
                                    <input
                                        value={optionGroupDraft.minSelections}
                                        type="number"
                                        min="0"
                                        max="20"
                                        onChange={(event) => {
                                            setOptionGroupDraft({ ...optionGroupDraft, minSelections: event.target.value });
                                        }}
                                        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950"
                                    />
                                </label>

                                <label className="text-sm font-medium text-slate-700">
                                    Customer can pick up to
                                    <input
                                        value={optionGroupDraft.maxSelections}
                                        type="number"
                                        min="1"
                                        max="20"
                                        disabled={optionGroupDraft.selectionType === MenuOptionSelectionType.SINGLE}
                                        onChange={(event) => {
                                            setOptionGroupDraft({ ...optionGroupDraft, maxSelections: event.target.value });
                                        }}
                                        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 disabled:bg-slate-100"
                                    />
                                </label>
                            </div>
                        </div>

                        {modalError && (
                            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                {modalError}
                            </p>
                        )}

                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setOptionGroupDraft(null);
                                }}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSavingModal}
                                className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
                            >
                                {isSavingModal ? 'Saving...' : 'Save option group'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>
    );
}
