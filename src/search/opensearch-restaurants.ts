import { getOpenSearchUrl } from '@/logging/opensearch-client';
import { getConfiguredServiceUrl } from '@/lib/runtime-service-config';

import {
    type RestaurantSearchDocument,
    type RestaurantSearchSuggestion,
} from './restaurant-search-types';

type SearchResponse = {
    suggest?: {
        restaurants?: Array<{
            options?: Array<{
                _score?: number;
                _source?: Omit<RestaurantSearchDocument, 'suggest'>;
            }>;
        }>;
    };
};

const openSearchRequestTimeoutMs = 1500;

export function isRestaurantSearchConfigured(): boolean {
    return getConfiguredServiceUrl('OPENSEARCH_URL') !== null;
}

/**
 * Allows local/dev/prod environments to use different autocomplete index names.
 */
export function getRestaurantSearchIndexName(): string {
    return process.env.RESTAURANT_SEARCH_INDEX ?? 'restaurants-autocomplete-v1';
}

/**
 * Small wrapper around OpenSearch HTTP calls so every request uses the same base
 * URL and JSON headers.
 */
async function fetchOpenSearch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${getOpenSearchUrl()}${path}`, {
        ...init,
        headers: {
            'content-type': 'application/json',
            ...init?.headers,
        },
        signal: init?.signal ?? AbortSignal.timeout(openSearchRequestTimeoutMs),
    });
}

/**
 * Creates the restaurant autocomplete index on demand.
 *
 * The important field is `suggest`, which uses OpenSearch's completion
 * suggester. Internally, that gives us prefix autocomplete behavior without
 * scanning every restaurant document for each keystroke.
 */
export async function ensureRestaurantSearchIndex(): Promise<void> {
    const indexName = getRestaurantSearchIndexName();
    const existsResponse = await fetchOpenSearch(`/${indexName}`, {
        method: 'HEAD',
    });

    if (existsResponse.ok) {
        return;
    }

    if (existsResponse.status !== 404) {
        throw new Error(`OpenSearch index check failed with ${existsResponse.status}`);
    }

    const createResponse = await fetchOpenSearch(`/${indexName}`, {
        body: JSON.stringify({
            mappings: {
                properties: {
                    address: {
                        properties: {
                            city: {
                                fields: {
                                    keyword: {
                                        type: 'keyword',
                                    },
                                },
                                type: 'text',
                            },
                            line1: {
                                fields: {
                                    keyword: {
                                        type: 'keyword',
                                    },
                                },
                                type: 'text',
                            },
                            province: {
                                type: 'keyword',
                            },
                        },
                    },
                    averagePrepMinutes: {
                        type: 'integer',
                    },
                    id: {
                        type: 'keyword',
                    },
                    menuItemCount: {
                        type: 'integer',
                    },
                    name: {
                        fields: {
                            keyword: {
                                type: 'keyword',
                            },
                        },
                        type: 'text',
                    },
                    suggest: {
                        type: 'completion',
                    },
                },
            },
        }),
        method: 'PUT',
    });

    if (!createResponse.ok) {
        const body = await createResponse.text();
        throw new Error(`OpenSearch index create failed with ${createResponse.status}: ${body.slice(0, 500)}`);
    }
}

export async function indexRestaurantSearchDocument(
    document: RestaurantSearchDocument,
): Promise<void> {
    // Index creation is idempotent, so callers do not need a separate setup step.
    await ensureRestaurantSearchIndex();

    const response = await fetchOpenSearch(`/${getRestaurantSearchIndexName()}/_doc/${document.id}?refresh=true`, {
        body: JSON.stringify(document),
        method: 'PUT',
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Restaurant search index failed with ${response.status}: ${body.slice(0, 500)}`);
    }
}

/**
 * Queries OpenSearch for prefix suggestions.
 *
 * The response is shaped back into the same suggestion type the customer UI
 * expects, regardless of whether the final source is OpenSearch, Redis, or
 * Postgres fallback.
 */
export async function searchRestaurantSuggestions(
    prefix: string,
    limit: number,
): Promise<RestaurantSearchSuggestion[]> {
    await ensureRestaurantSearchIndex();

    const response = await fetchOpenSearch(`/${getRestaurantSearchIndexName()}/_search`, {
        body: JSON.stringify({
            _source: [
                'address',
                'averagePrepMinutes',
                'id',
                'menuItemCount',
                'name',
            ],
            suggest: {
                restaurants: {
                    completion: {
                        field: 'suggest',
                        size: limit,
                        skip_duplicates: true,
                    },
                    prefix,
                },
            },
        }),
        method: 'POST',
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Restaurant suggestion search failed with ${response.status}: ${body.slice(0, 500)}`);
    }

    const data = await response.json() as SearchResponse;
    const options = data.suggest?.restaurants?.[0]?.options ?? [];

    return options.flatMap((option) => {
        if (!option._source) {
            return [];
        }

        return {
            ...option._source,
            score: Math.round(option._score ?? 0),
        };
    });
}
