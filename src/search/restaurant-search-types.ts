export type RestaurantSearchDocument = {
    address: {
        city: string;
        line1: string;
        province: string;
    };
    averagePrepMinutes: number;
    id: string;
    menuItemCount: number;
    name: string;
    suggest: {
        input: string[];
        weight: number;
    };
};

export type RestaurantSearchSuggestion = {
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

export type RestaurantSearchEvent =
    | {
        restaurantId: string;
        type: 'restaurant.changed';
    }
    | {
        limit: number;
        prefix: string;
        resultCount: number;
        source: string;
        type: 'search.performed';
    };
