import {
    createClient,
    type RedisClientType,
} from 'redis';

import { getConfiguredServiceUrl } from '@/lib/runtime-service-config';

import { type RestaurantSearchSuggestion } from './restaurant-search-types';

let redisClientPromise: Promise<RedisClientType> | undefined;

/**
 * Redis is optional for correctness. If it is missing, autocomplete still works
 * through OpenSearch/Postgres; it is only here to speed up hot prefixes.
 */
function getRedisUrl(): string | null {
    return getConfiguredServiceUrl('REDIS_URL');
}

/**
 * Short TTL keeps popular prefixes fast while allowing ranking/index changes to
 * show up soon after the cache expires.
 */
function getCacheTtlSeconds(): number {
    const ttl = Number(process.env.AUTOCOMPLETE_CACHE_SECONDS ?? 60);

    return Number.isInteger(ttl) && ttl > 0 ? ttl : 60;
}

/**
 * Cache key includes prefix and limit because `amb` with 5 results is a
 * different response from `amb` with 10 results.
 */
function getCacheKey(prefix: string, limit: number): string {
    return `autocomplete:restaurants:v1:${prefix.toLowerCase()}:${limit}`;
}

/**
 * Lazily creates and reuses one Redis connection for this Node process.
 */
async function getRedisClient(): Promise<RedisClientType> {
    const redisUrl = getRedisUrl();

    if (!redisUrl) {
        throw new Error('Redis autocomplete cache is not configured.');
    }

    if (!redisClientPromise) {
        redisClientPromise = (async () => {
            const client = createClient({
                url: redisUrl,
            });

            client.on('error', () => {
                // Let the next request try to create a fresh connection.
                redisClientPromise = undefined;
            });

            await client.connect();

            return client as RedisClientType;
        })();
    }

    return redisClientPromise;
}

/**
 * Reads hot autocomplete results from Redis.
 *
 * Returns `null` on cache miss or cache failure so callers can continue to
 * OpenSearch without special error handling.
 */
export async function getCachedRestaurantSuggestions(
    prefix: string,
    limit: number,
): Promise<RestaurantSearchSuggestion[] | null> {
    try {
        const client = await getRedisClient();
        const cached = await client.get(getCacheKey(prefix, limit));

        return cached ? JSON.parse(cached) as RestaurantSearchSuggestion[] : null;
    } catch {
        return null;
    }
}

/**
 * Stores autocomplete results in Redis for the next identical prefix request.
 */
export async function setCachedRestaurantSuggestions(
    prefix: string,
    limit: number,
    suggestions: RestaurantSearchSuggestion[],
): Promise<void> {
    try {
        const client = await getRedisClient();
        await client.set(getCacheKey(prefix, limit), JSON.stringify(suggestions), {
            EX: getCacheTtlSeconds(),
        });
    } catch {
        // Cache failures should not break autocomplete responses.
    }
}
