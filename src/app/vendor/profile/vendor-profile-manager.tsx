'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useState } from 'react';

import RestaurantAddressAutocomplete, {
    type GoogleAddressComponent,
    type SelectedRestaurantPlace,
} from './restaurant-address-autocomplete';

type VendorRestaurantProfile = {
    id: string;
    name: string;
    phone: string | null;
    featureImageUrl: string | null;
    averagePrepMinutes: number;
    address: {
        line1: string;
        line2: string | null;
        city: string;
        province: string;
        postalCode: string;
        country: string;
        latitude: number | null;
        longitude: number | null;
        formattedAddress: string | null;
        googlePlaceId: string | null;
        googleMapsUri: string | null;
        addressComponents: GoogleAddressComponent[] | null;
    };
};

type VendorProfileManagerProps = {
    initialRestaurantId: string;
    canEditProfile: boolean;
    restaurants: VendorRestaurantProfile[];
};

type ProfileDraft = {
    phone: string;
    featureImageUrl: string;
    averagePrepMinutes: string;
    line1: string;
    line2: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
    latitude: string;
    longitude: string;
    formattedAddress: string;
    googlePlaceId: string;
    googleMapsUri: string;
    addressComponents: GoogleAddressComponent[] | null;
};

function createDraft(restaurant: VendorRestaurantProfile): ProfileDraft {
    return {
        phone: restaurant.phone ?? '',
        featureImageUrl: restaurant.featureImageUrl ?? '',
        averagePrepMinutes: String(restaurant.averagePrepMinutes),
        line1: restaurant.address.line1,
        line2: restaurant.address.line2 ?? '',
        city: restaurant.address.city,
        province: restaurant.address.province,
        postalCode: restaurant.address.postalCode,
        country: restaurant.address.country,
        latitude: restaurant.address.latitude === null ? '' : String(restaurant.address.latitude),
        longitude: restaurant.address.longitude === null ? '' : String(restaurant.address.longitude),
        formattedAddress: restaurant.address.formattedAddress ?? '',
        googlePlaceId: restaurant.address.googlePlaceId ?? '',
        googleMapsUri: restaurant.address.googleMapsUri ?? '',
        addressComponents: restaurant.address.addressComponents,
    };
}

export default function VendorProfileManager({
    initialRestaurantId,
    canEditProfile,
    restaurants,
}: VendorProfileManagerProps) {
    const router = useRouter();
    const restaurantId = initialRestaurantId || (restaurants[0]?.id ?? '');
    const selectedRestaurant = restaurants.find((restaurant) => {
        return restaurant.id === restaurantId;
    }) ?? null;
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState<ProfileDraft | null>(() => {
        return selectedRestaurant ? createDraft(selectedRestaurant) : null;
    });
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    function updateDraft(field: keyof ProfileDraft, value: string): void {
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

    function updateManualAddressDraft(field: keyof ProfileDraft, value: string): void {
        setDraft((currentDraft) => {
            if (!currentDraft) {
                return currentDraft;
            }

            return {
                ...currentDraft,
                [field]: value,
                formattedAddress: '',
                googlePlaceId: '',
                googleMapsUri: '',
                addressComponents: null,
            };
        });
    }

    const handleRestaurantPlaceSelect = useCallback((place: SelectedRestaurantPlace) => {
        setDraft((currentDraft) => {
            if (!currentDraft) {
                return currentDraft;
            }

            return {
                ...currentDraft,
                line1: place.line1,
                city: place.city,
                province: place.province,
                postalCode: place.postalCode,
                country: place.country || currentDraft.country,
                latitude: place.latitude === null ? '' : String(place.latitude),
                longitude: place.longitude === null ? '' : String(place.longitude),
                formattedAddress: place.formattedAddress,
                googlePlaceId: place.googlePlaceId ?? '',
                googleMapsUri: place.googleMapsUri ?? '',
                addressComponents: place.addressComponents,
            };
        });
        setErrorMessage(null);
    }, []);

    async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        if (!selectedRestaurant || !draft) {
            return;
        }

        const averagePrepMinutes = Number.parseInt(draft.averagePrepMinutes, 10);
        const latitude = draft.latitude.trim() ? Number.parseFloat(draft.latitude) : null;
        const longitude = draft.longitude.trim() ? Number.parseFloat(draft.longitude) : null;

        try {
            setIsSaving(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch(`/api/vendor/restaurants/${selectedRestaurant.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    phone: draft.phone,
                    featureImageUrl: draft.featureImageUrl,
                    averagePrepMinutes,
                    address: {
                        line1: draft.line1,
                        line2: draft.line2,
                        city: draft.city,
                        province: draft.province,
                        postalCode: draft.postalCode,
                        country: draft.country,
                        latitude,
                        longitude,
                        formattedAddress: draft.formattedAddress,
                        googlePlaceId: draft.googlePlaceId,
                        googleMapsUri: draft.googleMapsUri,
                        addressComponents: draft.addressComponents,
                    },
                }),
            });
            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not update restaurant profile.');
            }

            setIsEditing(false);
            setSuccessMessage('Restaurant profile updated.');
            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not update restaurant profile.');
        } finally {
            setIsSaving(false);
        }
    }

    if (restaurants.length === 0 || !selectedRestaurant || !draft) {
        return (
            <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">
                    No restaurants are assigned to this vendor yet.
                </p>
            </section>
        );
    }

    const addressSearchValue = draft.formattedAddress
        || [draft.line1, draft.city, draft.province].filter(Boolean).join(', ');

    return (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="grid gap-6 p-5 lg:grid-cols-[360px_1fr]">
                <div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Managing restaurant
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">
                            {selectedRestaurant.name}
                        </p>
                    </div>

                    <div
                        className="mt-5 aspect-[4/3] rounded-xl bg-slate-200 bg-cover bg-center ring-1 ring-slate-200"
                        style={{
                            backgroundImage: draft.featureImageUrl
                                ? `linear-gradient(to top, rgb(15 23 42 / 0.52), rgb(15 23 42 / 0.08)), url(${draft.featureImageUrl})`
                                : undefined,
                        }}
                    />
                </div>

                <form
                    onSubmit={(event) => {
                        void handleSubmit(event);
                    }}
                    className="space-y-5"
                >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-950">
                                {selectedRestaurant.name}
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                {selectedRestaurant.address.line1}, {selectedRestaurant.address.city}
                            </p>
                        </div>
                        {canEditProfile && (
                            <button
                                type="button"
                                onClick={() => {
                                    setIsEditing((current) => {
                                        return !current;
                                    });
                                    setErrorMessage(null);
                                    setSuccessMessage(null);
                                }}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                {isEditing ? 'Stop editing' : 'Edit profile'}
                            </button>
                        )}
                    </div>

                    <fieldset
                        disabled={!canEditProfile || !isEditing || isSaving}
                        className="grid gap-4 md:grid-cols-2 disabled:opacity-70"
                    >
                        <label className="text-sm font-medium text-slate-700">
                            Feature image URL
                            <input
                                value={draft.featureImageUrl}
                                onChange={(event) => {
                                    updateDraft('featureImageUrl', event.target.value);
                                }}
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                            />
                        </label>

                        <label className="text-sm font-medium text-slate-700">
                            Phone
                            <input
                                value={draft.phone}
                                onChange={(event) => {
                                    updateDraft('phone', event.target.value);
                                }}
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                            />
                        </label>

                        <label className="text-sm font-medium text-slate-700">
                            Average prep minutes
                            <input
                                value={draft.averagePrepMinutes}
                                type="number"
                                min="5"
                                max="180"
                                onChange={(event) => {
                                    updateDraft('averagePrepMinutes', event.target.value);
                                }}
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                            />
                        </label>

                        <div className="md:col-span-2">
                            <label
                                htmlFor="restaurant-address-search"
                                className="text-sm font-medium text-slate-700"
                            >
                                Google address search
                            </label>
                            {isEditing ? (
                                <RestaurantAddressAutocomplete
                                    value={addressSearchValue}
                                    disabled={isSaving}
                                    onManualChange={(value) => {
                                        updateManualAddressDraft('line1', value);
                                    }}
                                    onPlaceSelect={handleRestaurantPlaceSelect}
                                />
                            ) : (
                                <p
                                    id="restaurant-address-search"
                                    className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
                                >
                                    {addressSearchValue}
                                </p>
                            )}
                            {(draft.googlePlaceId || draft.googleMapsUri) && (
                                <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                                    {draft.googlePlaceId && (
                                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                                            Google place saved
                                        </span>
                                    )}
                                    {draft.googleMapsUri && (
                                        <a
                                            href={draft.googleMapsUri}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded-full bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200"
                                        >
                                            View on Google Maps
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>

                        <label className="text-sm font-medium text-slate-700">
                            Address line 1
                            <input
                                value={draft.line1}
                                required
                                onChange={(event) => {
                                    updateManualAddressDraft('line1', event.target.value);
                                }}
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                            />
                        </label>

                        <label className="text-sm font-medium text-slate-700">
                            Address line 2
                            <input
                                value={draft.line2}
                                onChange={(event) => {
                                    updateDraft('line2', event.target.value);
                                }}
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                            />
                        </label>

                        <label className="text-sm font-medium text-slate-700">
                            City
                            <input
                                value={draft.city}
                                required
                                onChange={(event) => {
                                    updateManualAddressDraft('city', event.target.value);
                                }}
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                            />
                        </label>

                        <label className="text-sm font-medium text-slate-700">
                            Province
                            <input
                                value={draft.province}
                                required
                                onChange={(event) => {
                                    updateManualAddressDraft('province', event.target.value);
                                }}
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                            />
                        </label>

                        <label className="text-sm font-medium text-slate-700">
                            Postal code
                            <input
                                value={draft.postalCode}
                                required
                                onChange={(event) => {
                                    updateManualAddressDraft('postalCode', event.target.value);
                                }}
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                            />
                        </label>

                        <label className="text-sm font-medium text-slate-700">
                            Country
                            <input
                                value={draft.country}
                                required
                                onChange={(event) => {
                                    updateManualAddressDraft('country', event.target.value);
                                }}
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                            />
                        </label>

                        <label className="text-sm font-medium text-slate-700">
                            Latitude
                            <input
                                value={draft.latitude}
                                type="number"
                                step="any"
                                onChange={(event) => {
                                    updateManualAddressDraft('latitude', event.target.value);
                                }}
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                            />
                        </label>

                        <label className="text-sm font-medium text-slate-700">
                            Longitude
                            <input
                                value={draft.longitude}
                                type="number"
                                step="any"
                                onChange={(event) => {
                                    updateManualAddressDraft('longitude', event.target.value);
                                }}
                                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                            />
                        </label>
                    </fieldset>

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

                    {canEditProfile && isEditing && (
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                            {isSaving ? 'Saving...' : 'Save profile'}
                        </button>
                    )}
                </form>
            </div>
        </section>
    );
}
