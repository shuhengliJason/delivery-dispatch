import { type RestaurantSearchDocument } from './restaurant-search-types';

type RestaurantForSearch = {
    _count: {
        menuItems: number;
    };
    address: {
        city: string;
        line1: string;
        province: string;
    };
    averagePrepMinutes: number;
    id: string;
    name: string;
};

/**
 * Builds the list of strings OpenSearch should autocomplete against.
 *
 * We include the full restaurant name, location fields, and individual name
 * words so prefixes like "pac", "kitsi", or "tacos" can all suggest a vendor.
 */
function getSuggestionInputs(restaurant: RestaurantForSearch): string[] {
    const parts = [
        restaurant.name,
        restaurant.address.city,
        restaurant.address.line1,
        ...restaurant.name.split(/\s+/),
    ];

    return Array.from(new Set(parts.map((part) => {
        return part.trim();
    }).filter(Boolean)));
}

/**
 * Gives OpenSearch a ranking hint for completion suggestions.
 *
 * More menu items and faster prep time make a restaurant slightly more likely
 * to appear above similar prefix matches.
 */
function getSuggestionWeight(restaurant: RestaurantForSearch): number {
    const menuWeight = Math.min(restaurant._count.menuItems, 30) * 5;
    const prepWeight = Math.max(0, 60 - restaurant.averagePrepMinutes);

    return 1000 + menuWeight + prepWeight;
}

/**
 * Converts a Prisma restaurant record into the denormalized document stored in
 * OpenSearch for autocomplete.
 */
export function buildRestaurantSearchDocument(
    restaurant: RestaurantForSearch,
): RestaurantSearchDocument {
    return {
        address: restaurant.address,
        averagePrepMinutes: restaurant.averagePrepMinutes,
        id: restaurant.id,
        menuItemCount: restaurant._count.menuItems,
        name: restaurant.name,
        suggest: {
            input: getSuggestionInputs(restaurant),
            weight: getSuggestionWeight(restaurant),
        },
    };
}
