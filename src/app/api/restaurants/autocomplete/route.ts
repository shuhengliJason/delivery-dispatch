import {
    after,
    type NextRequest,
    NextResponse,
} from 'next/server';

import { prisma } from '@/lib/prisma';
import {
    normalizeAutocompleteLimit,
    normalizeAutocompletePrefix,
    rankRestaurantAutocompleteSuggestions,
} from '@/lib/restaurant-autocomplete';
import {
    getCachedRestaurantSuggestions,
    setCachedRestaurantSuggestions,
} from '@/search/redis-autocomplete-cache';
import {
    isRestaurantSearchConfigured,
    searchRestaurantSuggestions,
} from '@/search/opensearch-restaurants';
import {
    areRestaurantSearchEventsConfigured,
    publishRestaurantSearchEvent,
} from '@/search/restaurant-search-events';
import { type RestaurantSearchSuggestion } from '@/search/restaurant-search-types';

/**
 * Emits an analytics-style event after the response path is chosen.
 *
 * `after()` keeps the autocomplete response fast; the customer does not wait for
 * Kafka just so we can record that a search happened.
 */
function publishSearchPerformedEvent(
    input: {
        limit: number;
        prefix: string;
        resultCount: number;
        source: string;
    },
): void {
    if (!areRestaurantSearchEventsConfigured()) {
        return;
    }

    after(() => {
        return publishRestaurantSearchEvent({
            limit: input.limit,
            prefix: input.prefix,
            resultCount: input.resultCount,
            source: input.source,
            type: 'search.performed',
        }).catch((error: unknown) => {
            console.error('Could not publish autocomplete search event', error);
        });
    });
}

/**
 * Safety net when OpenSearch is unavailable.
 *
 * Postgres is slower for autocomplete, but it is our source of truth. Keeping
 * this fallback means search still works during local OpenSearch startup,
 * outages, or index rebuilds.
 */
async function getPostgresSuggestions(
    prefix: string,
    limit: number,
): Promise<RestaurantSearchSuggestion[]> {
    const restaurants = await prisma.restaurant.findMany({
        where: {
            OR: [
                {
                    name: {
                        contains: prefix,
                        mode: 'insensitive',
                    },
                },
                {
                    address: {
                        city: {
                            contains: prefix,
                            mode: 'insensitive',
                        },
                    },
                },
                {
                    address: {
                        line1: {
                            contains: prefix,
                            mode: 'insensitive',
                        },
                    },
                },
            ],
        },
        include: {
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
        },
        orderBy: {
            name: 'asc',
        },
        take: 50,
    });

    return rankRestaurantAutocompleteSuggestions(
        restaurants.map((restaurant) => {
            return {
                address: restaurant.address,
                averagePrepMinutes: restaurant.averagePrepMinutes,
                id: restaurant.id,
                menuItemCount: restaurant._count.menuItems,
                name: restaurant.name,
            };
        }),
        prefix,
        limit,
    );
}

/**
 * Restaurant autocomplete endpoint.
 *
 * Request path:
 * 1. Normalize the user's prefix and limit.
 * 2. Try Redis for a hot-prefix cache hit.
 * 3. Query OpenSearch's completion suggester.
 * 4. Fall back to Postgres if OpenSearch fails.
 * 5. Cache whichever real result we found and record the search source.
 */
export async function GET(request: NextRequest) {
    const prefix = normalizeAutocompletePrefix(request.nextUrl.searchParams.get('prefix'));
    const limit = normalizeAutocompleteLimit(request.nextUrl.searchParams.get('limit'));

    if (!prefix) {
        return NextResponse.json({
            prefix,
            suggestions: [],
        });
    }

    // Fast path: repeated prefixes such as "piz" or "sushi" should not hit OpenSearch every time.
    const cachedSuggestions = await getCachedRestaurantSuggestions(prefix, limit);

    if (cachedSuggestions) {
        publishSearchPerformedEvent({
            limit,
            prefix,
            resultCount: cachedSuggestions.length,
            source: 'redis',
        });

        return NextResponse.json({
            prefix,
            source: 'redis',
            suggestions: cachedSuggestions,
        });
    }

    if (isRestaurantSearchConfigured()) {
        try {
            // Normal path: OpenSearch owns prefix ranking and suggestion lookup.
            const suggestions = await searchRestaurantSuggestions(prefix, limit);
            await setCachedRestaurantSuggestions(prefix, limit, suggestions);
            publishSearchPerformedEvent({
                limit,
                prefix,
                resultCount: suggestions.length,
                source: 'opensearch',
            });

            return NextResponse.json({
                prefix,
                source: 'opensearch',
                suggestions,
            });
        } catch (error) {
            console.warn('Falling back to Postgres restaurant autocomplete', error);
        }
    }

    // Fallback path: slower, but correct because it reads from the main DB.
    const suggestions = await getPostgresSuggestions(prefix, limit);
    await setCachedRestaurantSuggestions(prefix, limit, suggestions);
    publishSearchPerformedEvent({
        limit,
        prefix,
        resultCount: suggestions.length,
        source: 'postgres',
    });

    return NextResponse.json({
        prefix,
        source: 'postgres',
        suggestions,
    });
}
