import { prisma } from '@/lib/prisma';

import { buildRestaurantSearchDocument } from './restaurant-search-documents';
import { type RestaurantSearchDocument } from './restaurant-search-types';

const restaurantSearchInclude = {
    _count: {
        select: {
            menuItems: true,
        },
    },
    address: {
        select: {
            city: true,
            line1: true,
            province: true,
        },
    },
} as const;

/**
 * Reads the latest restaurant data from Postgres and builds the OpenSearch
 * document for one restaurant ID.
 */
export async function getRestaurantSearchDocumentById(
    restaurantId: string,
): Promise<RestaurantSearchDocument | null> {
    const restaurant = await prisma.restaurant.findUnique({
        include: restaurantSearchInclude,
        where: {
            id: restaurantId,
        },
    });

    return restaurant ? buildRestaurantSearchDocument(restaurant) : null;
}

/**
 * Lists every restaurant ID for a full autocomplete snapshot/backfill.
 */
export async function getAllRestaurantIds(): Promise<string[]> {
    const restaurants = await prisma.restaurant.findMany({
        orderBy: {
            name: 'asc',
        },
        select: {
            id: true,
        },
    });

    return restaurants.map((restaurant) => {
        return restaurant.id;
    });
}
