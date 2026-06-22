'use client';

import { MenuOptionSelectionType } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';

type VendorRestaurant = {
    id: string;
    name: string;
    featureImageUrl: string | null;
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
        options: Array<{
            id: string;
            name: string;
            priceCents: number;
            isDefault: boolean;
        }>;
    }>;
};

type VendorMenuManagerProps = {
    restaurants: VendorRestaurant[];
    menuItems: VendorMenuItem[];
};

type OptionDraft = {
    name: string;
    price: string;
};

function formatCurrency(cents: number): string {
    return new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
    }).format(cents / 100);
}

export default function VendorMenuManager({
    restaurants,
    menuItems,
}: VendorMenuManagerProps) {
    const router = useRouter();
    const [restaurantId, setRestaurantId] = useState(restaurants[0]?.id ?? '');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [price, setPrice] = useState('');
    const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
    const [optionGroupName, setOptionGroupName] = useState('');
    const [selectionType, setSelectionType] = useState<MenuOptionSelectionType>(MenuOptionSelectionType.SINGLE);
    const [isRequired, setIsRequired] = useState(true);
    const [minSelections, setMinSelections] = useState('1');
    const [maxSelections, setMaxSelections] = useState('1');
    const [optionChoiceCount, setOptionChoiceCount] = useState('3');
    const [optionDrafts, setOptionDrafts] = useState<OptionDraft[]>([
        {
            name: 'Regular',
            price: '0',
        },
        {
            name: 'Extra meat',
            price: '2.50',
        },
        {
            name: 'No onions',
            price: '0',
        },
    ]);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingOptions, setIsSavingOptions] = useState(false);
    const [isSavingRestaurant, setIsSavingRestaurant] = useState(false);
    const [restaurantImageDrafts, setRestaurantImageDrafts] = useState<Record<string, string>>(() => {
        return Object.fromEntries(restaurants.map((restaurant) => {
            return [restaurant.id, restaurant.featureImageUrl ?? ''];
        }));
    });
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [optionErrorMessage, setOptionErrorMessage] = useState<string | null>(null);
    const [restaurantErrorMessage, setRestaurantErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [optionSuccessMessage, setOptionSuccessMessage] = useState<string | null>(null);
    const [restaurantSuccessMessage, setRestaurantSuccessMessage] = useState<string | null>(null);

    const selectedRestaurant = restaurants.find((restaurant) => {
        return restaurant.id === restaurantId;
    }) ?? null;

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

    const groupedMenuItems = useMemo(() => {
        return categories.map((categoryName) => {
            return {
                category: categoryName,
                items: selectedRestaurantItems.filter((item) => {
                    return item.category === categoryName;
                }),
            };
        });
    }, [categories, selectedRestaurantItems]);

    const selectedMenuItemForOptions = selectedRestaurantItems.find((item) => {
        return item.id === selectedMenuItemId;
    }) ?? selectedRestaurantItems[0] ?? null;

    const selectedRestaurantImageUrl = restaurantImageDrafts[restaurantId] ?? selectedRestaurant?.featureImageUrl ?? '';

    function updateOptionChoiceCount(nextValue: string): void {
        setOptionChoiceCount(nextValue);

        const nextCount = Number.parseInt(nextValue, 10);

        if (!Number.isInteger(nextCount) || nextCount < 1 || nextCount > 40) {
            return;
        }

        setOptionDrafts((currentDrafts) => {
            if (nextCount === currentDrafts.length) {
                return currentDrafts;
            }

            if (nextCount < currentDrafts.length) {
                return currentDrafts.slice(0, nextCount);
            }

            return [
                ...currentDrafts,
                ...Array.from({ length: nextCount - currentDrafts.length }, () => {
                    return {
                        name: '',
                        price: '0',
                    };
                }),
            ];
        });
    }

    function updateOptionDraft(
        index: number,
        field: keyof OptionDraft,
        value: string,
    ): void {
        setOptionDrafts((currentDrafts) => {
            return currentDrafts.map((draft, draftIndex) => {
                if (draftIndex !== index) {
                    return draft;
                }

                return {
                    ...draft,
                    [field]: value,
                };
            });
        });
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        const priceNumber = Number.parseFloat(price);

        if (!Number.isFinite(priceNumber)) {
            setErrorMessage('Enter a valid price.');
            return;
        }

        try {
            setIsSaving(true);
            setErrorMessage(null);
            setSuccessMessage(null);

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
            setSuccessMessage('Dish added to the customer menu.');
            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not add dish.');
        } finally {
            setIsSaving(false);
        }
    }

    async function handleRestaurantSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        if (!selectedRestaurant) {
            setRestaurantErrorMessage('Select a restaurant first.');
            return;
        }

        try {
            setIsSavingRestaurant(true);
            setRestaurantErrorMessage(null);
            setRestaurantSuccessMessage(null);

            const response = await fetch(`/api/vendor/restaurants/${selectedRestaurant.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    featureImageUrl: selectedRestaurantImageUrl,
                }),
            });
            const data = await response.json() as {
                restaurant?: {
                    id: string;
                    featureImageUrl: string | null;
                };
                error?: string;
            };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not update restaurant.');
            }

            if (data.restaurant) {
                const updatedRestaurant = data.restaurant;

                setRestaurantImageDrafts((currentDrafts) => {
                    return {
                        ...currentDrafts,
                        [updatedRestaurant.id]: updatedRestaurant.featureImageUrl ?? '',
                    };
                });
            }

            setRestaurantSuccessMessage('Feature image updated.');
            router.refresh();
        } catch (error) {
            setRestaurantErrorMessage(error instanceof Error ? error.message : 'Could not update restaurant.');
        } finally {
            setIsSavingRestaurant(false);
        }
    }

    async function handleOptionSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        const menuItemId = selectedMenuItemForOptions?.id ?? '';
        const parsedMinSelections = Number.parseInt(minSelections, 10);
        const parsedMaxSelections = selectionType === MenuOptionSelectionType.SINGLE
            ? 1
            : maxSelections.trim()
                ? Number.parseInt(maxSelections, 10)
                : null;
        const parsedChoiceCount = Number.parseInt(optionChoiceCount, 10);
        const options = optionDrafts
            .slice(0, Number.isInteger(parsedChoiceCount) ? parsedChoiceCount : optionDrafts.length)
            .map((draft) => {
                return {
                    name: draft.name.trim(),
                    priceCents: Math.round(Number.parseFloat(draft.price.trim() || '0') * 100),
                    isDefault: false,
                };
            });

        if (!menuItemId) {
            setOptionErrorMessage('Choose a dish first.');
            return;
        }

        if (!Number.isInteger(parsedMinSelections) || parsedMinSelections < 0) {
            setOptionErrorMessage('Enter a valid minimum selection count.');
            return;
        }

        if (!Number.isInteger(parsedChoiceCount) || parsedChoiceCount < 1 || parsedChoiceCount > 40) {
            setOptionErrorMessage('Total choices must be an integer from 1 to 40.');
            return;
        }

        if (parsedMaxSelections !== null && (!Number.isInteger(parsedMaxSelections) || parsedMaxSelections < 1)) {
            setOptionErrorMessage('Enter a valid maximum selection count.');
            return;
        }

        if (parsedMaxSelections !== null && parsedMaxSelections > parsedChoiceCount) {
            setOptionErrorMessage('Max picks cannot be greater than total choices.');
            return;
        }

        if (options.length !== parsedChoiceCount || options.some((option) => {
            return option.name.length === 0 || !Number.isInteger(option.priceCents) || option.priceCents < 0;
        })) {
            setOptionErrorMessage('Fill out every choice with a name and valid add-on price.');
            return;
        }

        try {
            setIsSavingOptions(true);
            setOptionErrorMessage(null);
            setOptionSuccessMessage(null);

            const response = await fetch(`/api/vendor/menu/${menuItemId}/option-groups`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: optionGroupName,
                    selectionType,
                    isRequired,
                    minSelections: parsedMinSelections,
                    maxSelections: parsedMaxSelections,
                    options,
                }),
            });
            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not add option group.');
            }

            setOptionGroupName('');
            setSelectionType(MenuOptionSelectionType.SINGLE);
            setIsRequired(true);
            setMinSelections('1');
            setMaxSelections('1');
            setOptionChoiceCount('3');
            setOptionDrafts([
                {
                    name: 'Regular',
                    price: '0',
                },
                {
                    name: 'Extra meat',
                    price: '2.50',
                },
                {
                    name: 'No onions',
                    price: '0',
                },
            ]);
            setOptionSuccessMessage('Option group added to this dish.');
            router.refresh();
        } catch (error) {
            setOptionErrorMessage(error instanceof Error ? error.message : 'Could not add option group.');
        } finally {
            setIsSavingOptions(false);
        }
    }

    if (restaurants.length === 0) {
        return (
            <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-950">
                    Menu CMS
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                    No restaurants are assigned to this vendor yet.
                </p>
            </section>
        );
    }

    return (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5">
                <h2 className="text-lg font-semibold text-slate-950">
                    Menu CMS
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                    Add dishes, assign categories, and publish them into the customer ordering menu.
                </p>
            </div>

            <div className="grid gap-6 p-5 xl:grid-cols-[380px_1fr]">
                <div className="space-y-5">
                    <form
                        onSubmit={(event) => {
                            void handleRestaurantSubmit(event);
                        }}
                        className="space-y-4 rounded-lg bg-slate-50 p-4"
                    >
                        <h3 className="text-base font-semibold text-slate-950">
                            Restaurant Profile
                        </h3>

                        <div>
                            <label
                                htmlFor="restaurant-feature-image"
                                className="text-sm font-medium text-slate-700"
                            >
                                Feature image URL
                            </label>
                            <input
                                id="restaurant-feature-image"
                                value={selectedRestaurantImageUrl}
                                disabled={isSavingRestaurant || !selectedRestaurant}
                                onChange={(event) => {
                                    setRestaurantImageDrafts((currentDrafts) => {
                                        return {
                                            ...currentDrafts,
                                            [restaurantId]: event.target.value,
                                        };
                                    });
                                    setRestaurantErrorMessage(null);
                                    setRestaurantSuccessMessage(null);
                                }}
                                placeholder="https://example.com/restaurant-photo.jpg"
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                            />
                            <p className="mt-2 text-xs text-slate-500">
                                This image appears on the customer restaurant card and vendor hero.
                            </p>
                        </div>

                        {selectedRestaurantImageUrl && (
                            <div
                                className="h-36 rounded-lg bg-slate-200 bg-cover bg-center ring-1 ring-slate-200"
                                style={{
                                    backgroundImage: `linear-gradient(to top, rgb(15 23 42 / 0.45), rgb(15 23 42 / 0)), url(${selectedRestaurantImageUrl})`,
                                }}
                            />
                        )}

                        {restaurantErrorMessage && (
                            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                {restaurantErrorMessage}
                            </p>
                        )}

                        {restaurantSuccessMessage && (
                            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                                {restaurantSuccessMessage}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={isSavingRestaurant || !selectedRestaurant}
                            className="w-full rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                            {isSavingRestaurant ? 'Saving...' : 'Save Restaurant Image'}
                        </button>
                    </form>

                    <form
                        onSubmit={(event) => {
                            void handleSubmit(event);
                        }}
                        className="space-y-4 rounded-lg bg-slate-50 p-4"
                    >
                        <h3 className="text-base font-semibold text-slate-950">
                            Add Dish
                        </h3>
                    <div>
                        <label
                            htmlFor="menu-restaurant"
                            className="text-sm font-medium text-slate-700"
                        >
                            Restaurant
                        </label>
                        <select
                            id="menu-restaurant"
                            value={restaurantId}
                            disabled={isSaving}
                            onChange={(event) => {
                                setRestaurantId(event.target.value);
                                setCategory('');
                                setErrorMessage(null);
                                setSuccessMessage(null);
                            }}
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                        >
                            {restaurants.map((restaurant) => {
                                return (
                                    <option
                                        key={restaurant.id}
                                        value={restaurant.id}
                                    >
                                        {restaurant.name}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    <div>
                        <label
                            htmlFor="menu-name"
                            className="text-sm font-medium text-slate-700"
                        >
                            Dish name
                        </label>
                        <input
                            id="menu-name"
                            value={name}
                            required
                            minLength={2}
                            maxLength={80}
                            disabled={isSaving}
                            onChange={(event) => {
                                setName(event.target.value);
                            }}
                            placeholder="Spicy miso ramen"
                            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="menu-category"
                            className="text-sm font-medium text-slate-700"
                        >
                            Category
                        </label>
                        <input
                            id="menu-category"
                            value={category}
                            required
                            minLength={2}
                            maxLength={40}
                            disabled={isSaving}
                            onChange={(event) => {
                                setCategory(event.target.value);
                            }}
                            placeholder="Bowls, Pizza, Drinks"
                            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                        />

                        {categories.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {categories.map((categoryName) => {
                                    return (
                                        <button
                                            key={categoryName}
                                            type="button"
                                            disabled={isSaving}
                                            onClick={() => {
                                                setCategory(categoryName);
                                            }}
                                            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                                        >
                                            {categoryName}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div>
                        <label
                            htmlFor="menu-price"
                            className="text-sm font-medium text-slate-700"
                        >
                            Price
                        </label>
                        <input
                            id="menu-price"
                            value={price}
                            required
                            type="number"
                            min="1"
                            max="1000"
                            step="0.01"
                            disabled={isSaving}
                            onChange={(event) => {
                                setPrice(event.target.value);
                            }}
                            placeholder="14.99"
                            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="menu-description"
                            className="text-sm font-medium text-slate-700"
                        >
                            Description
                        </label>
                        <textarea
                            id="menu-description"
                            value={description}
                            maxLength={280}
                            disabled={isSaving}
                            onChange={(event) => {
                                setDescription(event.target.value);
                            }}
                            placeholder="Short customer-facing description"
                            className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSaving || !restaurantId}
                        className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                        {isSaving ? 'Adding dish...' : 'Add dish'}
                    </button>

                    {errorMessage && (
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                            {errorMessage}
                        </p>
                    )}

                    {successMessage && (
                        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                            {successMessage}
                        </p>
                    )}
                    </form>

                    <form
                        onSubmit={(event) => {
                            void handleOptionSubmit(event);
                        }}
                        className="space-y-4 rounded-lg bg-cyan-50 p-4 ring-1 ring-cyan-100"
                    >
                        <h3 className="text-base font-semibold text-slate-950">
                            Add Options
                        </h3>
                        <p className="text-sm text-slate-600">
                            Build required or optional specs like soup base, spice level, toppings, and add-ons.
                        </p>

                        <div>
                            <label
                                htmlFor="option-dish"
                                className="text-sm font-medium text-slate-700"
                            >
                                Dish
                            </label>
                            <select
                                id="option-dish"
                                value={selectedMenuItemForOptions?.id ?? ''}
                                disabled={isSavingOptions || selectedRestaurantItems.length === 0}
                                onChange={(event) => {
                                    setSelectedMenuItemId(event.target.value);
                                    setOptionErrorMessage(null);
                                    setOptionSuccessMessage(null);
                                }}
                                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                            >
                                {selectedRestaurantItems.map((item) => {
                                    return (
                                        <option
                                            key={item.id}
                                            value={item.id}
                                        >
                                            {item.name}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        <div>
                            <label
                                htmlFor="option-group-name"
                                className="text-sm font-medium text-slate-700"
                            >
                                Option group
                            </label>
                            <input
                                id="option-group-name"
                                value={optionGroupName}
                                required
                                minLength={2}
                                maxLength={60}
                                disabled={isSavingOptions}
                                onChange={(event) => {
                                    setOptionGroupName(event.target.value);
                                }}
                                placeholder="Soup Base, Spice Level, Add-ons"
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                            />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                                <input
                                    type="radio"
                                    checked={selectionType === MenuOptionSelectionType.SINGLE}
                                    disabled={isSavingOptions}
                                    onChange={() => {
                                        setSelectionType(MenuOptionSelectionType.SINGLE);
                                        setMaxSelections('1');
                                    }}
                                    className="mr-2"
                                />
                                Pick one
                            </label>

                            <label className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                                <input
                                    type="radio"
                                    checked={selectionType === MenuOptionSelectionType.MULTIPLE}
                                    disabled={isSavingOptions}
                                    onChange={() => {
                                        setSelectionType(MenuOptionSelectionType.MULTIPLE);
                                        setMaxSelections('4');
                                    }}
                                    className="mr-2"
                                />
                                Pick many
                            </label>
                        </div>

                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <input
                                type="checkbox"
                                checked={isRequired}
                                disabled={isSavingOptions}
                                onChange={(event) => {
                                    setIsRequired(event.target.checked);
                                    setMinSelections(event.target.checked ? '1' : '0');
                                }}
                            />
                            Mandatory group
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label
                                    htmlFor="option-min"
                                    className="text-sm font-medium text-slate-700"
                                >
                                    Customer must pick
                                </label>
                                <input
                                    id="option-min"
                                    type="number"
                                    min="0"
                                    max="20"
                                    value={minSelections}
                                    disabled={isSavingOptions}
                                    onChange={(event) => {
                                        setMinSelections(event.target.value);
                                    }}
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="option-max"
                                    className="text-sm font-medium text-slate-700"
                                >
                                    Customer can pick up to
                                </label>
                                <input
                                    id="option-max"
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={maxSelections}
                                    disabled={isSavingOptions || selectionType === MenuOptionSelectionType.SINGLE}
                                    onChange={(event) => {
                                        setMaxSelections(event.target.value);
                                    }}
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                />
                            </div>
                        </div>

                        <div>
                            <label
                                htmlFor="option-choice-count"
                                className="text-sm font-medium text-slate-700"
                            >
                                Total choices in this group
                            </label>
                            <input
                                id="option-choice-count"
                                type="number"
                                min="1"
                                max="40"
                                value={optionChoiceCount}
                                required
                                disabled={isSavingOptions}
                                onChange={(event) => {
                                    updateOptionChoiceCount(event.target.value);
                                }}
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                            />
                            <p className="mt-1 text-xs text-slate-500">
                                Enter how many buttons the customer should see. The fields below will match this number.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <div className="grid grid-cols-[1fr_110px] gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <span>Choice name</span>
                                <span>Add-on price</span>
                            </div>

                            {optionDrafts.map((draft, index) => {
                                return (
                                    <div
                                        key={index}
                                        className="grid grid-cols-[1fr_110px] gap-3"
                                    >
                                        <input
                                            value={draft.name}
                                            required
                                            maxLength={80}
                                            disabled={isSavingOptions}
                                            onChange={(event) => {
                                                updateOptionDraft(index, 'name', event.target.value);
                                            }}
                                            placeholder={`Choice ${index + 1}`}
                                            aria-label={`Choice ${index + 1} name`}
                                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                        />
                                        <input
                                            value={draft.price}
                                            required
                                            type="number"
                                            min="0"
                                            max="1000"
                                            step="0.01"
                                            disabled={isSavingOptions}
                                            onChange={(event) => {
                                                updateOptionDraft(index, 'price', event.target.value);
                                            }}
                                            aria-label={`Choice ${index + 1} add-on price`}
                                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        <button
                            type="submit"
                            disabled={isSavingOptions || !selectedMenuItemForOptions}
                            className="w-full rounded-lg bg-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                            {isSavingOptions ? 'Adding options...' : 'Add option group'}
                        </button>

                        {optionErrorMessage && (
                            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                {optionErrorMessage}
                            </p>
                        )}

                        {optionSuccessMessage && (
                            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                                {optionSuccessMessage}
                            </p>
                        )}
                    </form>
                </div>

                <div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h3 className="text-base font-semibold text-slate-950">
                                {selectedRestaurant?.name ?? 'Menu'}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">
                                {selectedRestaurantItems.length} published item{selectedRestaurantItems.length === 1 ? '' : 's'}
                            </p>
                        </div>
                    </div>

                    {groupedMenuItems.length === 0 ? (
                        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                            No dishes yet. Add the first dish with a category.
                        </p>
                    ) : (
                        <div className="mt-4 space-y-5">
                            {groupedMenuItems.map((group) => {
                                return (
                                    <section key={group.category}>
                                        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                                            {group.category}
                                        </h4>

                                        <div className="mt-2 grid gap-3 md:grid-cols-2">
                                            {group.items.map((item) => {
                                                return (
                                                    <article
                                                        key={item.id}
                                                        className="rounded-lg border border-slate-200 p-4"
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <h5 className="font-semibold text-slate-950">
                                                                    {item.name}
                                                                </h5>
                                                                <p className="mt-1 text-sm text-slate-500">
                                                                    {item.description ?? 'No description.'}
                                                                </p>
                                                            </div>
                                                            <p className="shrink-0 text-sm font-bold text-slate-950">
                                                                {formatCurrency(item.priceCents)}
                                                            </p>
                                                        </div>

                                                        <p className={`mt-3 text-xs font-semibold ${item.isAvailable ? 'text-emerald-700' : 'text-slate-500'}`}>
                                                            {item.isAvailable ? 'Available' : 'Unavailable'}
                                                        </p>

                                                        {item.optionGroups.length > 0 && (
                                                            <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                                                                {item.optionGroups.map((group) => {
                                                                    return (
                                                                        <div key={group.id}>
                                                                            <p className="text-xs font-semibold text-slate-700">
                                                                                {group.name} / {group.selectionType === MenuOptionSelectionType.SINGLE ? 'pick one' : 'pick many'} / {group.isRequired ? 'mandatory' : 'optional'}
                                                                            </p>
                                                                            <p className="mt-1 text-xs text-slate-500">
                                                                                {group.options.map((option) => {
                                                                                    return `${option.name}${option.priceCents > 0 ? ` +${formatCurrency(option.priceCents)}` : ''}`;
                                                                                }).join(', ')}
                                                                            </p>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
