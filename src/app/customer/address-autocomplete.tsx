'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SelectedDeliveryPlace = {
    formattedAddress: string;
    line1: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
    latitude: number | null;
    longitude: number | null;
    placeId: string | null;
};

type AddressAutocompleteProps = {
    value: string;
    onManualChange: (value: string) => void;
    onPlaceSelect: (place: SelectedDeliveryPlace) => void;
};

type GoogleMapsWindow = Window & {
    google?: {
        maps?: {
            importLibrary?: (libraryName: 'places') => Promise<unknown>;
            __ib__?: () => void;
        };
    };
    __googleMapsPlacesLoader?: Promise<void>;
};

type PlaceAutocompleteElementConstructor = new (options?: {
    componentRestrictions?: {
        country: string[];
    };
}) => HTMLElement;

type PlaceAddressComponent = {
    longText?: string;
    shortText?: string;
    types?: string[];
};

type PlaceLocation = {
    lat: () => number;
    lng: () => number;
};

type GooglePlace = {
    id?: string;
    formattedAddress?: string;
    location?: PlaceLocation | null;
    addressComponents?: PlaceAddressComponent[];
    fetchFields: (options: { fields: string[] }) => Promise<void>;
};

type PlacePrediction = {
    toPlace: () => GooglePlace;
};

type PlaceSelectEvent = Event & {
    placePrediction?: PlacePrediction;
    detail?: {
        placePrediction?: PlacePrediction;
    };
};

const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

function getAddressComponent(
    components: PlaceAddressComponent[] | undefined,
    type: string,
    textType: 'longText' | 'shortText' = 'longText',
): string {
    return components?.find((component) => {
        return component.types?.includes(type);
    })?.[textType] ?? '';
}

function buildStreetLine(components: PlaceAddressComponent[] | undefined, fallback: string): string {
    const streetNumber = getAddressComponent(components, 'street_number');
    const route = getAddressComponent(components, 'route');
    const line1 = [streetNumber, route].filter(Boolean).join(' ');

    return line1 || fallback;
}

async function loadGooglePlaces(): Promise<PlaceAutocompleteElementConstructor> {
    const mapsWindow = window as GoogleMapsWindow;

    if (mapsWindow.google?.maps?.importLibrary) {
        const placesLibrary = await mapsWindow.google.maps.importLibrary('places');

        if (placesLibrary
            && typeof placesLibrary === 'object'
            && 'PlaceAutocompleteElement' in placesLibrary
        ) {
            return placesLibrary.PlaceAutocompleteElement as PlaceAutocompleteElementConstructor;
        }
    }

    if (!mapsWindow.__googleMapsPlacesLoader) {
        mapsWindow.__googleMapsPlacesLoader = new Promise<void>((resolve, reject) => {
            if (mapsWindow.google?.maps?.importLibrary) {
                resolve();
                return;
            }

            const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-maps-loader="places"]');

            if (existingScript && !mapsWindow.google?.maps?.importLibrary) {
                existingScript.remove();
            }

            mapsWindow.google = mapsWindow.google ?? {};
            mapsWindow.google.maps = mapsWindow.google.maps ?? {};
            mapsWindow.google.maps.__ib__ = () => {
                resolve();
            };

            const script = document.createElement('script');
            const params = new URLSearchParams({
                key: googleMapsApiKey ?? '',
                v: 'weekly',
                libraries: 'places',
                loading: 'async',
                callback: 'google.maps.__ib__',
            });

            script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
            script.async = true;
            script.defer = true;
            script.dataset.googleMapsLoader = 'places';
            script.addEventListener('error', () => {
                reject(new Error('Could not load Google Maps.'));
            }, { once: true });
            document.head.appendChild(script);
        });
    }

    await mapsWindow.__googleMapsPlacesLoader;
    const placesLibrary = await mapsWindow.google?.maps?.importLibrary?.('places');

    if (!placesLibrary
        || typeof placesLibrary !== 'object'
        || !('PlaceAutocompleteElement' in placesLibrary)
    ) {
        throw new Error('Google Places autocomplete is unavailable.');
    }

    return placesLibrary.PlaceAutocompleteElement as PlaceAutocompleteElementConstructor;
}

export default function AddressAutocomplete({
    value,
    onManualChange,
    onPlaceSelect,
}: AddressAutocompleteProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const autocompleteRef = useRef<HTMLElement | null>(null);
    const [isGoogleUnavailable, setIsGoogleUnavailable] = useState(false);

    const handlePlaceSelect = useCallback(async (event: PlaceSelectEvent): Promise<void> => {
        const prediction = event.placePrediction ?? event.detail?.placePrediction;
        const place = prediction?.toPlace();

        if (!place) {
            return;
        }

        await place.fetchFields({
            fields: [
                'id',
                'formattedAddress',
                'location',
                'addressComponents',
            ],
        });

        const formattedAddress = place.formattedAddress ?? '';

        if (!formattedAddress) {
            return;
        }

        onPlaceSelect({
            formattedAddress,
            line1: buildStreetLine(place.addressComponents, formattedAddress),
            city: getAddressComponent(place.addressComponents, 'locality')
                || getAddressComponent(place.addressComponents, 'postal_town'),
            province: getAddressComponent(place.addressComponents, 'administrative_area_level_1', 'shortText'),
            postalCode: getAddressComponent(place.addressComponents, 'postal_code'),
            country: getAddressComponent(place.addressComponents, 'country'),
            latitude: place.location?.lat() ?? null,
            longitude: place.location?.lng() ?? null,
            placeId: place.id ?? null,
        });
    }, [onPlaceSelect]);

    useEffect(() => {
        if (!googleMapsApiKey || !containerRef.current) {
            return;
        }

        let isCancelled = false;

        const setupAutocomplete = async (): Promise<void> => {
            try {
                const PlaceAutocompleteElement = await loadGooglePlaces();

                if (isCancelled || !containerRef.current) {
                    return;
                }

                containerRef.current.replaceChildren();

                const autocompleteElement = new PlaceAutocompleteElement({
                    componentRestrictions: {
                        country: ['ca'],
                    },
                });

                autocompleteElement.id = 'delivery-address';
                autocompleteElement.setAttribute('aria-label', 'Delivery address');
                autocompleteElement.setAttribute('placeholder', '123 Main St, Vancouver');
                autocompleteElement.className = 'block w-full';
                autocompleteElement.addEventListener('gmp-select', (event) => {
                    void handlePlaceSelect(event as PlaceSelectEvent);
                });

                autocompleteRef.current = autocompleteElement;
                containerRef.current.appendChild(autocompleteElement);
            } catch {
                if (!isCancelled) {
                    setIsGoogleUnavailable(true);
                }
            }
        };

        void setupAutocomplete();

        return () => {
            isCancelled = true;
            autocompleteRef.current?.remove();
            autocompleteRef.current = null;
        };
    }, [handlePlaceSelect]);

    useEffect(() => {
        const input = autocompleteRef.current?.shadowRoot?.querySelector('input');

        if (!input) {
            return;
        }

        if (input.value !== value) {
            input.value = value;
        }
    }, [value]);

    if (!googleMapsApiKey || isGoogleUnavailable) {
        return (
            <input
                id="delivery-address"
                value={value}
                onChange={(event) => {
                    onManualChange(event.target.value);
                }}
                placeholder="123 Main St, Vancouver"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
            />
        );
    }

    return (
        <>
            <div
                ref={containerRef}
                className="mt-2 min-h-10 rounded-lg border border-slate-300 bg-white px-1 py-1 text-sm text-slate-950 focus-within:border-slate-950"
            />
            {value && (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                    Selected: {value}
                </p>
            )}
        </>
    );
}
