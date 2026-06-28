'use client';

import { MenuOptionSelectionType } from '@prisma/client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import AddressAutocomplete, { type SelectedDeliveryPlace } from './address-autocomplete';
import { authClient, signOut } from '@/lib/auth-client';
import { confirmSignOut } from '@/lib/sign-out-confirmation';

type Restaurant = {
    id: string;
    name: string;
    phone: string | null;
    featureImageUrl: string | null;
    averagePrepMinutes: number;
    address: {
        line1: string;
        city: string;
        province: string;
    };
};

type RestaurantAutocompleteSuggestion = {
    address: {
        city: string;
        line1: string;
        province: string;
    };
    averagePrepMinutes: number;
    id: string;
    menuItemCount: number;
    name: string;
    score: number;
};

type MenuItem = {
    id: string;
    restaurantId: string;
    name: string;
    description: string | null;
    category: string;
    priceCents: number;
    isAvailable: boolean;
    restaurant: Restaurant;
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

type SelectedOptionGroup = {
    groupId: string;
    groupName: string;
    options: Array<{
        optionId: string;
        name: string;
        priceCents: number;
    }>;
};

type CartItem = {
    cartKey: string;
    menuItem: MenuItem;
    selectedOptions: SelectedOptionGroup[];
    optionTotalCents: number;
    quantity: number;
};

type CreatedOrder = {
    id: string;
    orderNumber: number;
    status: string;
    paymentStatus: string;
    estimatedDeliveryAt: string;
    totalCents: number;
};

type CustomerOrder = {
    id: string;
    orderNumber: number;
    status: string;
    paymentStatus: string;
    estimatedDeliveryAt: string;
    placedAt: string;
    deliveryAddressSnapshot: string;
    totalCents: number;
    restaurant: {
        name: string;
    };
    items: Array<{
        id: string;
        nameSnapshot: string;
        selectedOptionsSnapshot: SelectedOptionGroup[] | null;
        quantity: number;
        lineTotalCents: number;
    }>;
    assignments: Array<{
        driver: {
            user: {
                name: string;
            };
        };
    }>;
    timelineEvents: Array<{
        id: string;
        title: string;
        message: string | null;
        createdAt: string;
    }>;
};

type CreateOrderApiResponse = {
    order: CreatedOrder;
    checkoutUrl?: string;
    error?: string;
};

type CustomerOrdersApiResponse = {
    orders?: CustomerOrder[];
    error?: string;
};

type RestaurantAutocompleteApiResponse = {
    prefix: string;
    suggestions?: RestaurantAutocompleteSuggestion[];
};

type FetchCustomerOrdersOptions = {
    checkoutOrderId?: string | null;
    checkoutSessionId?: string | null;
    checkoutStatus?: string | null;
};

type CustomerSession = {
    user: {
        id: string;
        name: string;
        email: string;
        role: string;
    };
};

async function fetchCustomerOrders(options: FetchCustomerOrdersOptions = {}): Promise<CustomerOrder[]> {
    const params = new URLSearchParams();

    if (options.checkoutStatus) {
        params.set('checkout', options.checkoutStatus);
    }

    if (options.checkoutOrderId) {
        params.set('orderId', options.checkoutOrderId);
    }

    if (options.checkoutSessionId) {
        params.set('session_id', options.checkoutSessionId);
    }

    const url = params.size > 0
        ? `/api/orders?${params.toString()}`
        : '/api/orders';
    const response = await fetch(url);
    const data = await response.json() as CustomerOrdersApiResponse;

    if (!response.ok) {
        throw new Error(data.error ?? 'Failed to fetch orders.');
    }

    return data.orders ?? [];
}

function formatCurrency(cents: number): string {
    return new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
    }).format(cents / 100);
}

function formatDateTime(dateString: string): string {
    return new Intl.DateTimeFormat('en-CA', {
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        day: 'numeric',
    }).format(new Date(dateString));
}

function formatStatusLabel(status: string): string {
    return status
        .toLowerCase()
        .split('_')
        .map((word) => {
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

function getCustomerStatusClass(status: string): string {
    if (status === 'DELIVERED') {
        return 'bg-green-50 text-green-700 ring-green-600/20';
    }

    if (status === 'CANCELLED') {
        return 'bg-red-50 text-red-700 ring-red-600/20';
    }

    if (status === 'PICKED_UP' || status === 'ON_THE_WAY') {
        return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    }

    if (status === 'ASSIGNED' || status === 'ACCEPTED_BY_DRIVER') {
        return 'bg-purple-50 text-purple-700 ring-purple-600/20';
    }

    return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
}

function isDoneOrderStatus(status: string): boolean {
    return status === 'DELIVERED' || status === 'CANCELLED';
}

function getPaymentStatusClass(status: string): string {
    if (status === 'PAID') {
        return 'bg-green-50 text-green-700 ring-green-600/20';
    }

    if (status === 'FAILED' || status === 'REFUNDED') {
        return 'bg-red-50 text-red-700 ring-red-600/20';
    }

    return 'bg-amber-50 text-amber-700 ring-amber-600/20';
}

function getCartKey(menuItemId: string, selectedOptions: SelectedOptionGroup[]): string {
    const optionIds = selectedOptions
        .flatMap((group) => {
            return group.options.map((option) => {
                return option.optionId;
            });
        })
        .sort();

    return `${menuItemId}:${optionIds.join(',')}`;
}

function getCartItemUnitCents(cartItem: CartItem): number {
    return cartItem.menuItem.priceCents + cartItem.optionTotalCents;
}

function getRestaurantVisual(restaurantName: string, featureImageUrl?: string | null): {
    imageUrl: string;
    accentClass: string;
    cuisine: string;
} {
    const normalizedName = restaurantName.toLowerCase();

    if (normalizedName.includes('burger')) {
        return {
            imageUrl: featureImageUrl || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
            accentClass: 'from-amber-950/80 via-amber-900/25',
            cuisine: 'Burgers',
        };
    }

    if (normalizedName.includes('sushi')) {
        return {
            imageUrl: featureImageUrl || 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=80',
            accentClass: 'from-rose-950/75 via-rose-900/20',
            cuisine: 'Sushi',
        };
    }

    if (normalizedName.includes('taco')) {
        return {
            imageUrl: featureImageUrl || 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=1200&q=80',
            accentClass: 'from-emerald-950/80 via-emerald-900/20',
            cuisine: 'Tacos',
        };
    }

    if (normalizedName.includes('pizza')) {
        return {
            imageUrl: featureImageUrl || 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
            accentClass: 'from-red-950/80 via-red-900/25',
            cuisine: 'Pizza',
        };
    }

    return {
        imageUrl: featureImageUrl || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
        accentClass: 'from-slate-950/80 via-slate-900/25',
        cuisine: 'Restaurant',
    };
}

type CustomerAppProps = {
    initialRestaurantId?: string | null;
    view?: 'home' | 'restaurant' | 'orders' | 'history' | 'profile';
};

export default function CustomerPage({
    initialRestaurantId = null,
    view = 'home',
}: CustomerAppProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isOrderHistoryView = view === 'history';
    const isCurrentOrdersView = view === 'orders';
    const isRestaurantView = view === 'restaurant';
    const isRestaurantHomeView = view === 'home';
    const isProfileView = view === 'profile';
    const [session, setSession] = useState<CustomerSession | null>(null);
    const [isSessionPending, setIsSessionPending] = useState(true);
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const selectedRestaurantId = initialRestaurantId;
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [selectedDeliveryPlace, setSelectedDeliveryPlace] = useState<SelectedDeliveryPlace | null>(null);
    const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
    const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
    const [configuringMenuItem, setConfiguringMenuItem] = useState<MenuItem | null>(null);
    const [optionSelections, setOptionSelections] = useState<Record<string, string[]>>({});
    const [optionErrorMessage, setOptionErrorMessage] = useState<string | null>(null);
    const [isLoadingMenu, setIsLoadingMenu] = useState(false);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [restaurantSearch, setRestaurantSearch] = useState('');
    // Backend suggestions come from the Redis -> OpenSearch -> Postgres autocomplete route.
    const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<RestaurantAutocompleteSuggestion[]>([]);
    const [isLoadingAutocomplete, setIsLoadingAutocomplete] = useState(false);
    const checkoutStatus = searchParams.get('checkout');
    const checkoutOrderId = searchParams.get('orderId');
    const checkoutSessionId = searchParams.get('session_id');
    const checkoutNotice = checkoutStatus === 'success'
        ? 'Payment submitted. Your order will move to the restaurant queue as soon as Stripe confirms it.'
        : checkoutStatus === 'cancelled'
            ? 'Checkout was cancelled. Your order is still pending payment.'
            : null;

    useEffect(() => {
        let isCancelled = false;

        const loadSession = async (): Promise<void> => {
            const result = await authClient.getSession();
            const nextSession = (result.data as CustomerSession | null) ?? null;

            if (isCancelled) {
                return;
            }

            setSession(nextSession);
            setIsSessionPending(false);

            if (nextSession?.user.role !== 'CUSTOMER') {
                return;
            }

            try {
                setIsLoadingOrders(true);
                const orders = await fetchCustomerOrders({
                    checkoutOrderId,
                    checkoutSessionId,
                    checkoutStatus,
                });

                if (!isCancelled) {
                    setCustomerOrders(orders);
                }
            } catch (error) {
                console.error(error);

                if (!isCancelled) {
                    setCustomerOrders([]);
                }
            } finally {
                if (!isCancelled) {
                    setIsLoadingOrders(false);
                }
            }
        };

        void loadSession();

        return () => {
            isCancelled = true;
        };
    }, [checkoutOrderId, checkoutSessionId, checkoutStatus]);

    useEffect(() => {
        if (isSessionPending) {
            return;
        }

        if (!session?.user) {
            return;
        }

        const fetchMenu = async (): Promise<void> => {
            try {
                setIsLoadingMenu(true);
                const response = await fetch('/api/menu');

                if (!response.ok) {
                    throw new Error('Failed to fetch menu');
                }

                const data = await response.json();

                if (Array.isArray(data)) {
                    setMenuItems(data);
                    return;
                }

                if (Array.isArray(data.menuItems)) {
                    setMenuItems(data.menuItems);
                    return;
                }

                if (Array.isArray(data.items)) {
                    setMenuItems(data.items);
                    return;
                }

                setMenuItems([]);
            } catch (error) {
                console.error(error);
                setMenuItems([]);
            } finally {
                setIsLoadingMenu(false);
            }
        };

        fetchMenu();
    }, [isSessionPending, session?.user]);

    const loadCustomerOrders = useCallback(async (): Promise<void> => {
        try {
            setIsLoadingOrders(true);
            setCustomerOrders(await fetchCustomerOrders({
                checkoutOrderId,
                checkoutSessionId,
                checkoutStatus,
            }));
        } catch (error) {
            console.error(error);
            setCustomerOrders([]);
        } finally {
            setIsLoadingOrders(false);
        }
    }, [checkoutOrderId, checkoutSessionId, checkoutStatus]);

    const restaurants = useMemo(() => {
        const restaurantsById = new Map<string, Restaurant>();

        menuItems.forEach((item) => {
            restaurantsById.set(item.restaurant.id, item.restaurant);
        });

        return Array.from(restaurantsById.values()).sort((firstRestaurant, secondRestaurant) => {
            return firstRestaurant.name.localeCompare(secondRestaurant.name);
        });
    }, [menuItems]);

    const visibleRestaurants = useMemo(() => {
        const normalizedSearch = restaurantSearch.trim().toLowerCase();

        if (!normalizedSearch) {
            return restaurants;
        }

        // Local filtering keeps the grid responsive while the dropdown shows
        // ranked suggestions from the backend autocomplete pipeline.
        return restaurants.filter((restaurantOption) => {
            return [
                restaurantOption.name,
                restaurantOption.address.line1,
                restaurantOption.address.city,
                restaurantOption.address.province,
            ].some((value) => {
                return value.toLowerCase().includes(normalizedSearch);
            });
        });
    }, [restaurantSearch, restaurants]);

    const selectedRestaurant = restaurants.find((restaurant) => {
        return restaurant.id === selectedRestaurantId;
    }) ?? null;

    const visibleCustomerOrders = useMemo(() => {
        if (!isCurrentOrdersView && !isOrderHistoryView) {
            return [];
        }

        return customerOrders.filter((order) => {
            const isDoneOrder = isDoneOrderStatus(order.status);
            return isOrderHistoryView ? isDoneOrder : !isDoneOrder;
        });
    }, [customerOrders, isCurrentOrdersView, isOrderHistoryView]);

    const selectedMenuItems = useMemo(() => {
        if (!selectedRestaurantId) {
            return [];
        }

        return menuItems.filter((item) => {
            return item.restaurantId === selectedRestaurantId;
        });
    }, [menuItems, selectedRestaurantId]);

    const categories = useMemo(() => {
        return Array.from(new Set(selectedMenuItems.map((item) => {
            return item.category;
        })));
    }, [selectedMenuItems]);

    const restaurant = selectedRestaurant;
    // The customer shell persists across tab/restaurant routes, so keep cart
    // state alive but only show/order items for the active restaurant.
    const activeCartItems = useMemo(() => {
        if (!selectedRestaurantId) {
            return [];
        }

        return cartItems.filter((cartItem) => {
            return cartItem.menuItem.restaurantId === selectedRestaurantId;
        });
    }, [cartItems, selectedRestaurantId]);

    const subtotalCents = useMemo(() => {
        return activeCartItems.reduce((total, cartItem) => {
            return total + getCartItemUnitCents(cartItem) * cartItem.quantity;
        }, 0);
    }, [activeCartItems]);

    const taxCents = Math.round(subtotalCents * 0.12);
    const deliveryFeeCents = activeCartItems.length > 0 ? 399 : 0;
    const totalCents = subtotalCents + taxCents + deliveryFeeCents;

    const canPlaceOrder = Boolean(
        session?.user
            && deliveryAddress.trim()
            && activeCartItems.length > 0
            && restaurant
            && !isPlacingOrder,
    );
    const pageTitle = isOrderHistoryView
        ? 'Order History'
        : isCurrentOrdersView
            ? 'Current Orders'
            : selectedRestaurant
                ? `Order from ${selectedRestaurant.name}`
                : 'Restaurants';
    const pageDescription = isOrderHistoryView
        ? 'Review delivered and canceled orders without mixing them into live delivery tracking.'
        : isCurrentOrdersView
            ? 'Track live deliveries from confirmation through driver handoff.'
            : selectedRestaurant
                ? 'Build your cart from this vendor and place a delivery order.'
                : 'Browse available restaurants, then open one to view its menu and order.';
    const customerDisplayName = session?.user.name.trim() || session?.user.email || 'Customer';
    const navItems = [
        {
            href: '/customer',
            label: 'Restaurants',
            isActive: isRestaurantHomeView || isRestaurantView,
        },
        {
            href: '/customer/orders',
            label: 'Current Orders',
            isActive: isCurrentOrdersView,
        },
        {
            href: '/customer/order-history',
            label: 'Order History',
            isActive: isOrderHistoryView,
        },
    ];
    const showCustomerSectionNav = !isRestaurantView;
    const showMobileCartShortcut = isRestaurantView && activeCartItems.length > 0;

    function getInitialOptionSelections(menuItem: MenuItem): Record<string, string[]> {
        return Object.fromEntries(menuItem.optionGroups.map((group) => {
            const defaultOptionIds = group.options
                .filter((option) => {
                    return option.isDefault;
                })
                .slice(0, group.maxSelections ?? group.options.length)
                .map((option) => {
                    return option.id;
                });

            return [group.id, defaultOptionIds];
        }));
    }

    function openMenuItem(menuItem: MenuItem): void {
        setCreatedOrder(null);
        setErrorMessage(null);
        setOptionErrorMessage(null);

        if (menuItem.optionGroups.length === 0) {
            addConfiguredCartItem(menuItem, [], 0);
            return;
        }

        setConfiguringMenuItem(menuItem);
        setOptionSelections(getInitialOptionSelections(menuItem));
    }

    /**
     * Opens a restaurant picked from the autocomplete dropdown.
     *
     * The persistent customer shell reads the new URL and switches views without
     * remounting the whole customer app.
     */
    function openRestaurantFromAutocomplete(restaurantId: string): void {
        setRestaurantSearch('');
        setAutocompleteSuggestions([]);
        router.push(`/customer/vendors/${restaurantId}`);
    }

    function addConfiguredCartItem(
        menuItem: MenuItem,
        selectedOptions: SelectedOptionGroup[],
        optionTotalCents: number,
    ): void {
        const cartKey = getCartKey(menuItem.id, selectedOptions);

        setCartItems((currentItems) => {
            const existingItem = currentItems.find((cartItem) => {
                return cartItem.cartKey === cartKey;
            });

            if (!existingItem) {
                return [
                    ...currentItems,
                    {
                        cartKey,
                        menuItem,
                        selectedOptions,
                        optionTotalCents,
                        quantity: 1,
                    },
                ];
            }

            return currentItems.map((cartItem) => {
                if (cartItem.cartKey !== cartKey) {
                    return cartItem;
                }

                return {
                    ...cartItem,
                    quantity: cartItem.quantity + 1,
                };
            });
        });
    }

    function toggleOption(groupId: string, optionId: string): void {
        if (!configuringMenuItem) {
            return;
        }

        const group = configuringMenuItem.optionGroups.find((item) => {
            return item.id === groupId;
        });

        if (!group) {
            return;
        }

        setOptionErrorMessage(null);
        setOptionSelections((currentSelections) => {
            const currentOptionIds = currentSelections[groupId] ?? [];

            if (group.selectionType === MenuOptionSelectionType.SINGLE) {
                return {
                    ...currentSelections,
                    [groupId]: [optionId],
                };
            }

            if (currentOptionIds.includes(optionId)) {
                return {
                    ...currentSelections,
                    [groupId]: currentOptionIds.filter((currentOptionId) => {
                        return currentOptionId !== optionId;
                    }),
                };
            }

            const maxSelections = group.maxSelections ?? group.options.length;

            if (currentOptionIds.length >= maxSelections) {
                setOptionErrorMessage(`Choose at most ${maxSelections} option${maxSelections === 1 ? '' : 's'} for ${group.name}.`);
                return currentSelections;
            }

            return {
                ...currentSelections,
                [groupId]: [
                    ...currentOptionIds,
                    optionId,
                ],
            };
        });
    }

    function addConfiguredItemFromModal(): void {
        if (!configuringMenuItem) {
            return;
        }

        const selectedOptions = configuringMenuItem.optionGroups.map((group) => {
            const selectedOptionIds = optionSelections[group.id] ?? [];
            const selectedGroupOptions = group.options.filter((option) => {
                return selectedOptionIds.includes(option.id);
            });
            const maxSelections = group.maxSelections ?? group.options.length;

            if (selectedGroupOptions.length < group.minSelections || selectedGroupOptions.length > maxSelections) {
                return null;
            }

            return {
                groupId: group.id,
                groupName: group.name,
                options: selectedGroupOptions.map((option) => {
                    return {
                        optionId: option.id,
                        name: option.name,
                        priceCents: option.priceCents,
                    };
                }),
            };
        });

        if (selectedOptions.some((group) => {
            return group === null;
        })) {
            setOptionErrorMessage('Complete all mandatory choices before adding this dish.');
            return;
        }

        const validSelectedOptions = selectedOptions as SelectedOptionGroup[];
        const optionTotalCents = validSelectedOptions.reduce((total, group) => {
            return total + group.options.reduce((groupTotal, option) => {
                return groupTotal + option.priceCents;
            }, 0);
        }, 0);

        addConfiguredCartItem(configuringMenuItem, validSelectedOptions, optionTotalCents);
        setConfiguringMenuItem(null);
        setOptionSelections({});
        setOptionErrorMessage(null);
    }

    function decreaseQuantity(cartKey: string): void {
        setCreatedOrder(null);
        setErrorMessage(null);

        setCartItems((currentItems) => {
            return currentItems
                .map((cartItem) => {
                    if (cartItem.cartKey !== cartKey) {
                        return cartItem;
                    }

                    return {
                        ...cartItem,
                        quantity: cartItem.quantity - 1,
                    };
                })
                .filter((cartItem) => {
                    return cartItem.quantity > 0;
                });
        });
    }

    function removeFromCart(cartKey: string): void {
        setCreatedOrder(null);
        setErrorMessage(null);

        setCartItems((currentItems) => {
            return currentItems.filter((cartItem) => {
                return cartItem.cartKey !== cartKey;
            });
        });
    }

    async function placeOrder(): Promise<void> {
        if (!canPlaceOrder || !restaurant || !session?.user) {
            return;
        }

        try {
            setIsPlacingOrder(true);
            setErrorMessage(null);
            setCreatedOrder(null);

            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    deliveryAddress: deliveryAddress.trim(),
                    deliveryLocation: selectedDeliveryPlace,
                    restaurantId: restaurant.id,
                    items: activeCartItems.map((cartItem) => {
                        return {
                            menuItemId: cartItem.menuItem.id,
                            quantity: cartItem.quantity,
                            selectedOptionIds: cartItem.selectedOptions.flatMap((group) => {
                                return group.options.map((option) => {
                                    return option.optionId;
                                });
                            }),
                        };
                    }),
                }),
            });

            const data = await response.json() as CreateOrderApiResponse;

            if (!response.ok) {
                throw new Error(data.error ?? 'Failed to place order.');
            }

            setCreatedOrder(data.order);

            if (data.checkoutUrl) {
                window.location.assign(data.checkoutUrl);
                return;
            }

            setCartItems([]);
            setDeliveryAddress('');
            setSelectedDeliveryPlace(null);
            await loadCustomerOrders();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to place order.');
        } finally {
            setIsPlacingOrder(false);
        }
    }

    const handleManualAddressChange = useCallback((value: string) => {
        setDeliveryAddress(value);
        setSelectedDeliveryPlace(null);
    }, []);

    const handleDeliveryPlaceSelect = useCallback((place: SelectedDeliveryPlace) => {
        setDeliveryAddress(place.formattedAddress);
        setSelectedDeliveryPlace(place);
        setErrorMessage(null);
    }, []);

    /**
     * Debounced autocomplete request.
     *
     * Waiting 180ms prevents every keystroke from becoming a backend request.
     * AbortController cancels stale requests so older responses cannot overwrite
     * newer suggestions when the user types quickly.
     */
    useEffect(() => {
        const prefix = restaurantSearch.trim();

        if (!isRestaurantHomeView || prefix.length === 0) {
            return;
        }

        const controller = new AbortController();
        const timeout = window.setTimeout(() => {
            const fetchSuggestions = async (): Promise<void> => {
                try {
                    setIsLoadingAutocomplete(true);
                    const params = new URLSearchParams({
                        limit: '8',
                        prefix,
                    });
                    const response = await fetch(`/api/restaurants/autocomplete?${params.toString()}`, {
                        signal: controller.signal,
                    });

                    if (!response.ok) {
                        throw new Error('Failed to fetch restaurant suggestions.');
                    }

                    const data = await response.json() as RestaurantAutocompleteApiResponse;

                    setAutocompleteSuggestions(data.suggestions ?? []);
                } catch (error) {
                    if (!controller.signal.aborted) {
                        console.error(error);
                        setAutocompleteSuggestions([]);
                    }
                } finally {
                    if (!controller.signal.aborted) {
                        setIsLoadingAutocomplete(false);
                    }
                }
            };

            void fetchSuggestions();
        }, 180);

        return () => {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [isRestaurantHomeView, restaurantSearch]);

    async function handleSignOut(): Promise<void> {
        if (!confirmSignOut()) {
            return;
        }

        try {
            setIsSigningOut(true);
            await signOut();
            router.push('/sign-in');
            router.refresh();
        } finally {
            setIsSigningOut(false);
        }
    }

    const configuringOptionTotalCents = configuringMenuItem
        ? configuringMenuItem.optionGroups.reduce((total, group) => {
            const selectedOptionIds = optionSelections[group.id] ?? [];
            const selectedGroupTotal = group.options.reduce((groupTotal, option) => {
                return selectedOptionIds.includes(option.id)
                    ? groupTotal + option.priceCents
                    : groupTotal;
            }, 0);

            return total + selectedGroupTotal;
        }, 0)
        : 0;

    if (isSessionPending) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
                <p className="text-sm font-medium text-slate-600">
                    Loading your session...
                </p>
            </main>
        );
    }

    if (!session?.user) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
                <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                    <p className="text-sm font-medium text-slate-500">
                        Customer App
                    </p>

                    <h1 className="mt-1 text-2xl font-bold text-slate-950">
                        Sign in to order
                    </h1>

                    <p className="mt-3 text-sm text-slate-600">
                        Customer accounts keep order ownership tied to a verified session.
                    </p>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                        <Link
                            href="/sign-in"
                            className="flex-1 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                        >
                            Sign in
                        </Link>

                        <Link
                            href="/sign-up"
                            className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Create account
                        </Link>
                    </div>
                </section>
            </main>
        );
    }

    if (session.user.role !== 'CUSTOMER') {
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
                <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                    <p className="text-sm font-medium text-slate-500">
                        Customer App
                    </p>

                    <h1 className="mt-1 text-2xl font-bold text-slate-950">
                        Customer account required
                    </h1>

                    <p className="mt-3 text-sm text-slate-600">
                        You are signed in as {session.user.email}. Use a customer account to place orders.
                    </p>

                    <div className="mt-6">
                        <button
                            type="button"
                            disabled={isSigningOut}
                            onClick={() => {
                                void handleSignOut();
                            }}
                            className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                            {isSigningOut ? 'Signing out...' : 'Sign out'}
                        </button>
                    </div>
                </section>
            </main>
        );
    }

    return (
        <main className={`min-h-screen bg-slate-50 p-6 ${showMobileCartShortcut ? 'pb-24 md:pb-6' : ''}`}>
            <div className="mx-auto max-w-7xl">
                <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-cyan-700">
                                {isRestaurantView ? 'Restaurant ordering' : 'Customer App'}
                            </p>

                            {isRestaurantView && (
                                <Link
                                    href="/customer"
                                    className="mt-2 inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    Back to restaurants
                                </Link>
                            )}

                            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                                {pageTitle}
                            </h1>

                            <p className="mt-2 max-w-2xl text-sm text-slate-600">
                                {pageDescription}
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 lg:items-end">
                            {isRestaurantView && (
                                <div className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                                    {activeCartItems.length} cart item{activeCartItems.length === 1 ? '' : 's'}
                                </div>
                            )}

                            <div className="flex items-center gap-3 text-sm text-slate-600">
                                <div className="max-w-[220px] text-right">
                                    <p className="truncate font-semibold text-slate-950">
                                        {customerDisplayName}
                                    </p>
                                    <p className="truncate text-xs text-slate-500">
                                        {session.user.email}
                                    </p>
                                </div>
                                <Link
                                    href="/customer/profile"
                                    aria-label="Profile settings"
                                    title="Profile settings"
                                    className={`flex h-9 w-9 items-center justify-center rounded-lg border text-base font-semibold transition ${isProfileView
                                        ? 'border-slate-950 bg-slate-950 text-white'
                                        : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                                >
                                    {'\u2699'}
                                </Link>
                                <button
                                    type="button"
                                    disabled={isSigningOut}
                                    onClick={() => {
                                        void handleSignOut();
                                    }}
                                    className="font-semibold text-slate-950 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                                >
                                    {isSigningOut ? 'Signing out...' : 'Sign out'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {showCustomerSectionNav && (
                        <nav
                            aria-label="Customer sections"
                            className="mt-5 grid gap-2 rounded-xl bg-slate-100 p-1 sm:grid-cols-3"
                        >
                            {navItems.map((item) => {
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        aria-current={item.isActive ? 'page' : undefined}
                                        className={`rounded-lg px-4 py-3 text-center text-sm font-bold transition ${item.isActive
                                            ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200'
                                            : 'text-slate-600 hover:bg-white/70 hover:text-slate-950'}`}
                                    >
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </nav>
                    )}
                </header>

                {errorMessage && (
                    <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5">
                        <p className="text-sm font-semibold text-red-700">
                            Error
                        </p>

                        <p className="mt-1 text-sm text-red-700">
                            {errorMessage}
                        </p>
                    </section>
                )}

                {checkoutNotice && (
                    <section className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-5">
                        <p className="text-sm font-semibold text-blue-700">
                            Checkout
                        </p>

                        <p className="mt-1 text-sm text-blue-700">
                            {checkoutNotice}
                        </p>
                    </section>
                )}

                {createdOrder && (
                    <section className="mt-8 rounded-xl border border-green-200 bg-green-50 p-5">
                        <p className="text-sm font-semibold text-green-700">
                            Checkout started
                        </p>

                        <h2 className="mt-1 text-xl font-bold text-green-900">
                            Order #{createdOrder.orderNumber}
                        </h2>

                        <p className="mt-2 text-sm text-green-800">
                            Status: {createdOrder.status}
                        </p>

                        <p className="mt-1 text-sm text-green-800">
                            Payment: {formatStatusLabel(createdOrder.paymentStatus)}
                        </p>

                        <p className="mt-1 text-sm text-green-800">
                            Estimated delivery: {formatDateTime(createdOrder.estimatedDeliveryAt)}
                        </p>

                        <p className="mt-1 text-sm text-green-800">
                            Total: {formatCurrency(createdOrder.totalCents)}
                        </p>

                    </section>
                )}

                {(isCurrentOrdersView || isOrderHistoryView) && (
                <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-950">
                                {isOrderHistoryView ? 'Order History' : 'Current Deliveries'}
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                {isOrderHistoryView
                                    ? 'Delivered and canceled orders live here after they leave active tracking.'
                                    : 'Only orders still being prepared, assigned, picked up, or delivered show here.'}
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link
                                href={isOrderHistoryView ? '/customer/orders' : '/customer/order-history'}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                {isOrderHistoryView ? 'Current orders' : 'Order history'}
                            </Link>

                            <Link
                                href="/customer"
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                Restaurants
                            </Link>

                            <button
                                type="button"
                                disabled={isLoadingOrders}
                                onClick={() => {
                                    void loadCustomerOrders();
                                }}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                            >
                                {isLoadingOrders ? 'Refreshing...' : 'Refresh'}
                            </button>
                        </div>
                    </div>

                    {isLoadingOrders && customerOrders.length === 0 ? (
                        <p className="p-5 text-sm text-slate-500">
                            Loading your orders...
                        </p>
                    ) : visibleCustomerOrders.length === 0 ? (
                        <p className="p-5 text-sm text-slate-500">
                            {isOrderHistoryView
                                ? 'No completed orders yet.'
                                : 'No current delivery orders. Choose a vendor and place your first order.'}
                        </p>
                    ) : (
                        <div className="divide-y divide-slate-200">
                            {visibleCustomerOrders.map((order) => {
                                const latestAssignment = order.assignments[0] ?? null;

                                return (
                                    <article
                                        key={order.id}
                                        className="grid gap-5 p-5 lg:grid-cols-[1fr_320px]"
                                    >
                                        <div>
                                            <div className="flex flex-wrap items-center gap-3">
                                                <h3 className="text-base font-bold text-slate-950">
                                                    Order #{order.orderNumber}
                                                </h3>

                                                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${getCustomerStatusClass(order.status)}`}>
                                                    {formatStatusLabel(order.status)}
                                                </span>

                                                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${getPaymentStatusClass(order.paymentStatus)}`}>
                                                    {formatStatusLabel(order.paymentStatus)}
                                                </span>
                                            </div>

                                            <p className="mt-2 text-sm text-slate-600">
                                                {order.restaurant.name} / ETA {formatDateTime(order.estimatedDeliveryAt)}
                                            </p>

                                            <p className="mt-1 text-sm text-slate-500">
                                                Delivery to {order.deliveryAddressSnapshot}
                                            </p>

                                            {latestAssignment && (
                                                <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                                                    Driver: {latestAssignment.driver.user.name}
                                                </p>
                                            )}

                                            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                                                {order.items.map((item) => {
                                                    return (
                                                        <li
                                                            key={item.id}
                                                            className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                                        >
                                                            <span className="font-semibold text-slate-950">
                                                                {item.quantity}x
                                                            </span>
                                                            {' '}
                                                            {item.nameSnapshot}
                                                            <span className="ml-2 text-slate-500">
                                                                {formatCurrency(item.lineTotalCents)}
                                                            </span>
                                                            {item.selectedOptionsSnapshot && item.selectedOptionsSnapshot.length > 0 && (
                                                                <span className="mt-1 block text-xs text-slate-500">
                                                                    {item.selectedOptionsSnapshot.flatMap((group) => {
                                                                        return group.options.map((option) => {
                                                                            return `${group.groupName}: ${option.name}`;
                                                                        });
                                                                    }).join(' / ')}
                                                                </span>
                                                            )}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>

                                        <div className="rounded-lg bg-slate-50 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                    Timeline
                                                </p>
                                                <p className="text-sm font-bold text-slate-950">
                                                    {formatCurrency(order.totalCents)}
                                                </p>
                                            </div>

                                            <ol className="mt-4 space-y-3">
                                                {order.timelineEvents.length === 0 ? (
                                                    <li className="text-sm text-slate-500">
                                                        No updates yet.
                                                    </li>
                                                ) : order.timelineEvents.map((event) => {
                                                    return (
                                                        <li
                                                            key={event.id}
                                                            className="relative border-l border-slate-300 pl-4"
                                                        >
                                                            <span className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-slate-950" />
                                                            <p className="text-sm font-semibold text-slate-950">
                                                                {event.title}
                                                            </p>
                                                            <p className="mt-1 text-xs text-slate-500">
                                                                {formatDateTime(event.createdAt)}
                                                            </p>
                                                            {event.message && (
                                                                <p className="mt-1 text-sm text-slate-600">
                                                                    {event.message}
                                                                </p>
                                                            )}
                                                        </li>
                                                    );
                                                })}
                                            </ol>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
                )}

                {!isOrderHistoryView && !isCurrentOrdersView && (
                    <section className={`mt-8 grid gap-6 ${selectedRestaurant ? 'lg:grid-cols-[1fr_420px]' : ''}`}>
                    <div className="space-y-6">
                        {isLoadingMenu && (
                            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                                <p className="text-sm text-slate-500">
                                    Loading menu...
                                </p>
                            </section>
                        )}

                        {!isLoadingMenu && restaurants.length === 0 && (
                            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                                <p className="text-sm text-slate-500">
                                    No restaurants found. Make sure your database is seeded.
                                </p>
                            </section>
                        )}

                        {!isLoadingMenu && restaurants.length > 0 && !selectedRestaurant && (
                            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-950">
                                            Available Restaurants
                                        </h2>
                                        <p className="mt-1 text-sm text-slate-500">
                                            Pick a kitchen to browse its menu.
                                        </p>
                                    </div>

                                    <div className="relative w-full lg:max-w-sm">
                                        <label
                                            htmlFor="restaurant-search"
                                            className="sr-only"
                                        >
                                            Search restaurants
                                        </label>
                                        <input
                                            id="restaurant-search"
                                            type="search"
                                            value={restaurantSearch}
                                            onChange={(event) => {
                                                const nextValue = event.target.value;

                                                setRestaurantSearch(nextValue);

                                                if (!nextValue.trim()) {
                                                    setAutocompleteSuggestions([]);
                                                    setIsLoadingAutocomplete(false);
                                                }
                                            }}
                                            placeholder="Search restaurants"
                                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                                        />

                                        {(restaurantSearch.trim() || isLoadingAutocomplete) && (
                                            <div className="absolute right-0 left-0 z-20 mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                                                {isLoadingAutocomplete ? (
                                                    <p className="px-3 py-2 text-sm text-slate-500">
                                                        Searching...
                                                    </p>
                                                ) : autocompleteSuggestions.length > 0 ? (
                                                    <div className="max-h-80 overflow-y-auto py-1">
                                                        {autocompleteSuggestions.map((suggestion) => {
                                                            return (
                                                                <button
                                                                    key={suggestion.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        openRestaurantFromAutocomplete(suggestion.id);
                                                                    }}
                                                                    className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                                                                >
                                                                    <span className="block text-sm font-semibold text-slate-950">
                                                                        {suggestion.name}
                                                                    </span>
                                                                    <span className="mt-0.5 block text-xs text-slate-500">
                                                                        {suggestion.address.line1}, {suggestion.address.city} / {suggestion.menuItemCount} items / {suggestion.averagePrepMinutes} min
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <p className="px-3 py-2 text-sm text-slate-500">
                                                        No matches found.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {visibleRestaurants.length === 0 ? (
                                    <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
                                        No restaurants match your search.
                                    </p>
                                ) : (
                                <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                                    {visibleRestaurants.map((restaurantOption) => {
                                        const restaurantMenuItems = menuItems.filter((item) => {
                                            return item.restaurantId === restaurantOption.id;
                                        });
                                        const lowestPriceCents = restaurantMenuItems.length > 0
                                            ? Math.min(...restaurantMenuItems.map((item) => {
                                                return item.priceCents;
                                            }))
                                            : 0;
                                        const restaurantVisual = getRestaurantVisual(restaurantOption.name, restaurantOption.featureImageUrl);

                                        return (
                                            <Link
                                                key={restaurantOption.id}
                                                href={`/customer/vendors/${restaurantOption.id}`}
                                                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                                            >
                                                <div
                                                    className={`flex h-44 items-end bg-cover bg-center p-4 text-white bg-blend-multiply ${restaurantVisual.accentClass}`}
                                                    style={{
                                                        backgroundImage: `linear-gradient(to top, rgb(15 23 42 / 0.82), rgb(15 23 42 / 0.08)), url(${restaurantVisual.imageUrl})`,
                                                    }}
                                                >
                                                    <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-slate-950 shadow-sm">
                                                        {restaurantVisual.cuisine}
                                                    </span>
                                                </div>

                                                <div className="p-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <span className="block text-lg font-bold text-slate-950">
                                                            {restaurantOption.name}
                                                        </span>

                                                        <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-700">
                                                            {restaurantOption.averagePrepMinutes} min
                                                        </span>
                                                    </div>

                                                    <span className="mt-2 block text-sm text-slate-600">
                                                        {restaurantOption.address.line1}, {restaurantOption.address.city}
                                                    </span>

                                                    <span className="mt-4 block text-sm font-semibold text-slate-950">
                                                        {restaurantMenuItems.length} items / from {formatCurrency(lowestPriceCents)}
                                                    </span>
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                                )}
                            </section>
                        )}

                        {selectedRestaurant && (
                            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                <div
                                    className={`flex min-h-64 items-end bg-cover bg-center p-6 text-white ${getRestaurantVisual(selectedRestaurant.name, selectedRestaurant.featureImageUrl).accentClass}`}
                                    style={{
                                        backgroundImage: `linear-gradient(to top, rgb(15 23 42 / 0.88), rgb(15 23 42 / 0.12)), url(${getRestaurantVisual(selectedRestaurant.name, selectedRestaurant.featureImageUrl).imageUrl})`,
                                    }}
                                >
                                    <div className="max-w-2xl">
                                        <h2 className="text-3xl font-bold">
                                            {selectedRestaurant.name}
                                        </h2>

                                        <p className="mt-2 text-sm text-slate-100">
                                            {selectedRestaurant.averagePrepMinutes} min prep / {selectedRestaurant.address.line1}, {selectedRestaurant.address.city}
                                        </p>
                                    </div>
                                </div>
                            </section>
                        )}

                        {selectedRestaurant && categories.map((category) => {
                            const categoryItems = selectedMenuItems.filter((item) => {
                                return item.category === category;
                            });

                            return (
                                <section
                                    key={category}
                                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                                >
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                                        <h2 className="text-lg font-semibold text-slate-950">
                                            {category}
                                        </h2>

                                        <p className="text-sm text-slate-500">
                                            {selectedRestaurant.name}
                                        </p>
                                    </div>

                                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                                        {categoryItems.map((menuItem) => {
                                            return (
                                                <article
                                                    key={menuItem.id}
                                                    className="rounded-xl border border-slate-200 p-4"
                                                >
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div>
                                                            <h3 className="font-semibold text-slate-950">
                                                                {menuItem.name}
                                                            </h3>

                                                            <p className="mt-1 text-sm text-slate-500">
                                                                {menuItem.description ?? 'No description available.'}
                                                            </p>
                                                        </div>

                                                        <p className="font-semibold text-slate-950">
                                                            {formatCurrency(menuItem.priceCents)}
                                                        </p>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            openMenuItem(menuItem);
                                                        }}
                                                        className="mt-4 w-full rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                                                    >
                                                        {menuItem.optionGroups.length > 0 ? 'Choose Options' : 'Add to Cart'}
                                                    </button>
                                                </article>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </div>

                    {selectedRestaurant && (
                    <aside
                        id="customer-cart"
                        className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                        <h2 className="text-lg font-semibold text-slate-950">
                            Your Cart
                        </h2>

                        {selectedRestaurant && (
                            <p className="mt-1 text-sm text-slate-500">
                                {selectedRestaurant.name}
                            </p>
                        )}

                        {activeCartItems.length === 0 ? (
                            <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                                {selectedRestaurant
                                    ? 'Your cart is empty. Add items from the menu to start an order.'
                                    : 'Select a restaurant to start an order.'}
                            </p>
                        ) : (
                            <div className="mt-4 divide-y divide-slate-200">
                                {activeCartItems.map((cartItem) => {
                                    return (
                                        <div
                                            key={cartItem.cartKey}
                                            className="py-4"
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <p className="font-medium text-slate-950">
                                                        {cartItem.menuItem.name}
                                                    </p>

                                                    <p className="mt-1 text-sm text-slate-500">
                                                        {formatCurrency(getCartItemUnitCents(cartItem))} each
                                                    </p>

                                                    {cartItem.selectedOptions.length > 0 && (
                                                        <p className="mt-1 max-w-xs text-xs text-slate-500">
                                                            {cartItem.selectedOptions.flatMap((group) => {
                                                                return group.options.map((option) => {
                                                                    return `${group.groupName}: ${option.name}`;
                                                                });
                                                            }).join(' / ')}
                                                        </p>
                                                    )}
                                                </div>

                                                <p className="font-semibold text-slate-950">
                                                    {formatCurrency(getCartItemUnitCents(cartItem) * cartItem.quantity)}
                                                </p>
                                            </div>

                                            <div className="mt-3 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            decreaseQuantity(cartItem.cartKey);
                                                        }}
                                                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                                    >
                                                        -
                                                    </button>

                                                    <span className="w-6 text-center text-sm font-semibold text-slate-950">
                                                        {cartItem.quantity}
                                                    </span>

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            addConfiguredCartItem(cartItem.menuItem, cartItem.selectedOptions, cartItem.optionTotalCents);
                                                        }}
                                                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                                    >
                                                        +
                                                    </button>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        removeFromCart(cartItem.cartKey);
                                                    }}
                                                    className="text-sm font-medium text-red-600 hover:text-red-700"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="mt-6 space-y-3 border-t border-slate-200 pt-5">
                            <div className="flex justify-between text-sm text-slate-600">
                                <span>Subtotal</span>
                                <span>{formatCurrency(subtotalCents)}</span>
                            </div>

                            <div className="flex justify-between text-sm text-slate-600">
                                <span>Tax</span>
                                <span>{formatCurrency(taxCents)}</span>
                            </div>

                            <div className="flex justify-between text-sm text-slate-600">
                                <span>Delivery fee</span>
                                <span>{formatCurrency(deliveryFeeCents)}</span>
                            </div>

                            <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-950">
                                <span>Total</span>
                                <span>{formatCurrency(totalCents)}</span>
                            </div>
                        </div>

                        <div className="mt-6 space-y-4">
                            <div>
                                <label
                                    htmlFor="delivery-address"
                                    className="text-sm font-medium text-slate-700"
                                >
                                    Delivery address
                                </label>

                                <AddressAutocomplete
                                    value={deliveryAddress}
                                    onManualChange={handleManualAddressChange}
                                    onPlaceSelect={handleDeliveryPlaceSelect}
                                />
                            </div>

                            <button
                                type="button"
                                disabled={!canPlaceOrder}
                                onClick={() => {
                                    void placeOrder();
                                }}
                                className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                {isPlacingOrder ? 'Opening Checkout...' : 'Continue to Payment'}
                            </button>
                        </div>
                    </aside>
                    )}
                    </section>
                )}
            </div>

            {showMobileCartShortcut && (
                <a
                    href="#customer-cart"
                    className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-lg md:hidden"
                >
                    <span>
                        View cart
                    </span>
                    <span>
                        {activeCartItems.length} item{activeCartItems.length === 1 ? '' : 's'} / {formatCurrency(totalCents)}
                    </span>
                </a>
            )}

            {configuringMenuItem && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="menu-item-options-title"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
                >
                    <section className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                            <div>
                                <p className="text-sm font-medium text-slate-500">
                                    Configure dish
                                </p>
                                <h2
                                    id="menu-item-options-title"
                                    className="mt-1 text-2xl font-bold text-slate-950"
                                >
                                    {configuringMenuItem.name}
                                </h2>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setConfiguringMenuItem(null);
                                    setOptionSelections({});
                                    setOptionErrorMessage(null);
                                }}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="overflow-y-auto p-5">
                            <p className="text-sm text-slate-600">
                                {configuringMenuItem.description ?? 'Choose the required and optional specs for this dish.'}
                            </p>

                            <div className="mt-6 space-y-6">
                                {configuringMenuItem.optionGroups.map((group) => {
                                    const selectedOptionIds = optionSelections[group.id] ?? [];
                                    const maxSelections = group.maxSelections ?? group.options.length;

                                    return (
                                        <section key={group.id}>
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <h3 className="text-base font-semibold text-slate-950">
                                                    {group.name}
                                                </h3>
                                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                                    {group.isRequired ? 'Required' : 'Optional'} / {group.selectionType === MenuOptionSelectionType.SINGLE ? 'pick 1' : `pick ${group.minSelections}-${maxSelections}`}
                                                </span>
                                            </div>

                                            <div className="mt-3 flex flex-wrap gap-3">
                                                {group.options.map((option) => {
                                                    const isSelected = selectedOptionIds.includes(option.id);

                                                    return (
                                                        <button
                                                            key={option.id}
                                                            type="button"
                                                            onClick={() => {
                                                                toggleOption(group.id, option.id);
                                                            }}
                                                            className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${isSelected
                                                                ? 'border-cyan-500 bg-cyan-50 text-slate-950 ring-1 ring-cyan-400'
                                                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}
                                                        >
                                                            <span>{option.name}</span>
                                                            {option.priceCents > 0 && (
                                                                <span className="ml-2 font-bold text-red-500">
                                                                    +{formatCurrency(option.priceCents)}
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="border-t border-slate-200 bg-white p-5">
                            {optionErrorMessage && (
                                <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                    {optionErrorMessage}
                                </p>
                            )}

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-2xl font-bold text-slate-950">
                                    {formatCurrency(configuringMenuItem.priceCents + configuringOptionTotalCents)}
                                </p>

                                <button
                                    type="button"
                                    onClick={addConfiguredItemFromModal}
                                    className="rounded-lg bg-cyan-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-cyan-700"
                                >
                                    Add to Cart
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            )}
        </main>
    );
}
