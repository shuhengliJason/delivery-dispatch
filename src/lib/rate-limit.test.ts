import { createHash } from 'node:crypto';

import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

type StoredRateLimitRow = {
    count: number;
    lastRequest: bigint;
    updatedAt: number;
};

const mockDb = vi.hoisted(() => {
    const rows = new Map<string, StoredRateLimitRow>();
    const flags = {
        rejectCleanup: false,
    };

    const rateLimit = {
        findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
            const row = rows.get(where.key);

            return row
                ? {
                    key: where.key,
                    count: row.count,
                    lastRequest: row.lastRequest,
                }
                : null;
        }),
        upsert: vi.fn(async ({
            create,
            update,
            where,
        }: {
            create: { count: number; lastRequest: bigint };
            update: { count: number; lastRequest: bigint };
            where: { key: string };
        }) => {
            const data = rows.has(where.key) ? update : create;

            rows.set(where.key, {
                count: data.count,
                lastRequest: data.lastRequest,
                updatedAt: Date.now(),
            });

            return rows.get(where.key);
        }),
        update: vi.fn(async ({
            data,
            where,
        }: {
            data: { count: number; lastRequest: bigint };
            where: { key: string };
        }) => {
            rows.set(where.key, {
                count: data.count,
                lastRequest: data.lastRequest,
                updatedAt: Date.now(),
            });

            return rows.get(where.key);
        }),
        deleteMany: vi.fn(async ({
            where,
        }: {
            where: { updatedAt: { lt: Date } };
        }) => {
            if (flags.rejectCleanup) {
                throw new Error('cleanup failed');
            }

            const cutoff = where.updatedAt.lt.getTime();
            let count = 0;

            for (const [key, row] of rows.entries()) {
                if (row.updatedAt < cutoff) {
                    rows.delete(key);
                    count += 1;
                }
            }

            return { count };
        }),
    };

    const tx = {
        $executeRaw: vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
            const key = values[0] as string;

            if (!rows.has(key)) {
                rows.set(key, {
                    count: 0,
                    lastRequest: BigInt(0),
                    updatedAt: Date.now(),
                });
            }

            return 1;
        }),
        $queryRaw: vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
            const key = values[0] as string;
            const row = rows.get(key);

            return row
                ? [{
                    count: row.count,
                    lastRequest: row.lastRequest,
                }]
                : [];
        }),
        rateLimit: {
            update: rateLimit.update,
        },
    };

    return {
        flags,
        prisma: {
            $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => {
                return callback(tx);
            }),
            rateLimit,
        },
        rows,
        tx,
    };
});

vi.mock('@/lib/prisma', () => {
    return {
        prisma: mockDb.prisma,
    };
});

const baseTime = Date.UTC(2026, 0, 1, 0, 0, 0);

function hashKey(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function createRequest(headers: HeadersInit = {}): Request {
    return new Request('https://delivery-dispatch.test/api/example', {
        headers,
        method: 'POST',
    });
}

async function loadRateLimitModule() {
    return import('./rate-limit');
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockDb.rows.clear();
    mockDb.flags.rejectCleanup = false;
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('RATE_LIMIT_ENABLED', '1');
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

describe('isRateLimitingEnabled', () => {
    it('is enabled in production', async () => {
        vi.stubEnv('RATE_LIMIT_ENABLED', '');
        vi.stubEnv('NODE_ENV', 'production');

        const { isRateLimitingEnabled } = await loadRateLimitModule();

        expect(isRateLimitingEnabled()).toBe(true);
    });

    it('is enabled by RATE_LIMIT_ENABLED in non-production environments', async () => {
        vi.stubEnv('NODE_ENV', 'test');
        vi.stubEnv('RATE_LIMIT_ENABLED', '1');

        const { isRateLimitingEnabled } = await loadRateLimitModule();

        expect(isRateLimitingEnabled()).toBe(true);
    });

    it('is disabled outside production without the explicit flag', async () => {
        vi.stubEnv('NODE_ENV', 'test');
        vi.stubEnv('RATE_LIMIT_ENABLED', '');

        const { isRateLimitingEnabled } = await loadRateLimitModule();

        expect(isRateLimitingEnabled()).toBe(false);
    });
});

describe('enforceIpRateLimit', () => {
    it('does not touch storage when rate limiting is disabled', async () => {
        vi.stubEnv('RATE_LIMIT_ENABLED', '');
        const { enforceIpRateLimit } = await loadRateLimitModule();

        const response = await enforceIpRateLimit(createRequest(), {
            max: 1,
            scope: 'test:disabled',
            windowSeconds: 60,
        });

        expect(response).toBeNull();
        expect(mockDb.prisma.$transaction).not.toHaveBeenCalled();
        expect(mockDb.prisma.rateLimit.deleteMany).not.toHaveBeenCalled();
    });

    it('uses the trusted client IP headers for the default identifier', async () => {
        const { enforceIpRateLimit } = await loadRateLimitModule();

        await enforceIpRateLimit(
            createRequest({
                'cf-connecting-ip': '203.0.113.10',
                'x-forwarded-for': '198.51.100.10, 198.51.100.11',
                'x-real-ip': '192.0.2.10',
            }),
            {
                max: 2,
                scope: 'test:ip',
                windowSeconds: 60,
            },
        );

        expect(mockDb.rows.has(hashKey('test:ip:ip:203.0.113.10'))).toBe(true);
    });

    it('falls back to the first x-forwarded-for address', async () => {
        const { enforceIpRateLimit } = await loadRateLimitModule();

        await enforceIpRateLimit(
            createRequest({
                'x-forwarded-for': '198.51.100.20, 198.51.100.21',
            }),
            {
                max: 2,
                scope: 'test:forwarded',
                windowSeconds: 60,
            },
        );

        expect(mockDb.rows.has(hashKey('test:forwarded:ip:198.51.100.20'))).toBe(true);
    });

    it('allows requests until the policy maximum is reached', async () => {
        const { enforceIpRateLimit } = await loadRateLimitModule();
        const request = createRequest({ 'x-real-ip': '192.0.2.1' });
        const policy = {
            max: 2,
            scope: 'test:allow',
            windowSeconds: 60,
        };

        await expect(enforceIpRateLimit(request, policy)).resolves.toBeNull();
        await expect(enforceIpRateLimit(request, policy)).resolves.toBeNull();

        const row = mockDb.rows.get(hashKey('test:allow:ip:192.0.2.1'));

        expect(row).toMatchObject({
            count: 2,
            lastRequest: BigInt(baseTime),
        });
    });

    it('returns a 429 response without incrementing after the maximum is exceeded', async () => {
        const { enforceIpRateLimit } = await loadRateLimitModule();
        const request = createRequest({ 'x-real-ip': '192.0.2.2' });
        const policy = {
            max: 2,
            scope: 'test:block',
            windowSeconds: 60,
        };

        await enforceIpRateLimit(request, policy);
        await enforceIpRateLimit(request, policy);
        const response = await enforceIpRateLimit(request, policy);
        const row = mockDb.rows.get(hashKey('test:block:ip:192.0.2.2'));

        expect(response?.status).toBe(429);
        await expect(response?.json()).resolves.toEqual({
            error: 'Too many requests. Please try again later.',
        });
        expect(response?.headers.get('RateLimit-Limit')).toBe('2');
        expect(response?.headers.get('RateLimit-Remaining')).toBe('0');
        expect(response?.headers.get('RateLimit-Reset')).toBe(String(Math.ceil((baseTime + 60000) / 1000)));
        expect(response?.headers.get('Retry-After')).toBe('60');
        expect(row?.count).toBe(2);
    });

    it('starts a fresh window after the previous window expires', async () => {
        const { enforceIpRateLimit } = await loadRateLimitModule();
        const request = createRequest({ 'x-real-ip': '192.0.2.3' });
        const policy = {
            max: 1,
            scope: 'test:reset',
            windowSeconds: 60,
        };

        await enforceIpRateLimit(request, policy);
        vi.setSystemTime(baseTime + 60001);
        const response = await enforceIpRateLimit(request, policy);
        const row = mockDb.rows.get(hashKey('test:reset:ip:192.0.2.3'));

        expect(response).toBeNull();
        expect(row).toMatchObject({
            count: 1,
            lastRequest: BigInt(baseTime + 60001),
        });
    });
});

describe('enforceUserRateLimit', () => {
    it('uses the authenticated user ID instead of the request IP', async () => {
        const { enforceUserRateLimit } = await loadRateLimitModule();

        await enforceUserRateLimit(
            createRequest({ 'x-real-ip': '192.0.2.44' }),
            {
                max: 2,
                scope: 'test:user',
                windowSeconds: 60,
            },
            'user_123',
        );

        expect(mockDb.rows.has(hashKey('test:user:user_123'))).toBe(true);
        expect(mockDb.rows.has(hashKey('test:user:ip:192.0.2.44'))).toBe(false);
    });

    it('keeps separate counters for separate users', async () => {
        const { enforceUserRateLimit } = await loadRateLimitModule();
        const request = createRequest();
        const policy = {
            max: 1,
            scope: 'test:user-separate',
            windowSeconds: 60,
        };

        await enforceUserRateLimit(request, policy, 'user_a');
        await enforceUserRateLimit(request, policy, 'user_b');

        expect(mockDb.rows.get(hashKey('test:user-separate:user_a'))?.count).toBe(1);
        expect(mockDb.rows.get(hashKey('test:user-separate:user_b'))?.count).toBe(1);
    });
});

describe('enforceRateLimits', () => {
    it('stops at the first blocked policy', async () => {
        const { enforceRateLimits } = await loadRateLimitModule();
        const request = createRequest();
        const firstPolicy = {
            identifier: 'subject',
            max: 1,
            scope: 'test:first',
            windowSeconds: 60,
        };

        await enforceRateLimits(request, [firstPolicy]);

        const response = await enforceRateLimits(request, [
            firstPolicy,
            {
                identifier: 'subject',
                max: 1,
                scope: 'test:second',
                windowSeconds: 60,
            },
        ]);

        expect(response?.status).toBe(429);
        expect(mockDb.rows.has(hashKey('test:first:subject'))).toBe(true);
        expect(mockDb.rows.has(hashKey('test:second:subject'))).toBe(false);
    });
});

describe('authRateLimitStorage', () => {
    it('returns null for missing Better Auth storage keys', async () => {
        const { authRateLimitStorage } = await loadRateLimitModule();

        await expect(authRateLimitStorage.get('missing')).resolves.toBeNull();
    });

    it('sets and gets Better Auth counters with hashed storage keys', async () => {
        const { authRateLimitStorage } = await loadRateLimitModule();

        await authRateLimitStorage.set('sign-in-key', {
            count: 3,
            key: 'sign-in-key',
            lastRequest: baseTime,
        });

        await expect(authRateLimitStorage.get('sign-in-key')).resolves.toEqual({
            count: 3,
            key: 'sign-in-key',
            lastRequest: baseTime,
        });
        expect(mockDb.rows.has(hashKey('better-auth:sign-in-key'))).toBe(true);
    });

    it('updates an existing Better Auth counter', async () => {
        const { authRateLimitStorage } = await loadRateLimitModule();

        await authRateLimitStorage.set('callback-key', {
            count: 1,
            key: 'callback-key',
            lastRequest: baseTime,
        });
        await authRateLimitStorage.set('callback-key', {
            count: 2,
            key: 'callback-key',
            lastRequest: baseTime + 1000,
        });

        await expect(authRateLimitStorage.get('callback-key')).resolves.toEqual({
            count: 2,
            key: 'callback-key',
            lastRequest: baseTime + 1000,
        });
    });
});

describe('rate limit cleanup', () => {
    it('deletes stale rows at most once per hour', async () => {
        const { enforceIpRateLimit } = await loadRateLimitModule();
        const staleKey = hashKey('stale');
        const freshKey = hashKey('fresh');

        mockDb.rows.set(staleKey, {
            count: 1,
            lastRequest: BigInt(baseTime - 25 * 60 * 60 * 1000),
            updatedAt: baseTime - 25 * 60 * 60 * 1000,
        });
        mockDb.rows.set(freshKey, {
            count: 1,
            lastRequest: BigInt(baseTime),
            updatedAt: baseTime,
        });

        await enforceIpRateLimit(createRequest(), {
            max: 10,
            scope: 'test:cleanup',
            windowSeconds: 60,
        });
        await enforceIpRateLimit(createRequest(), {
            max: 10,
            scope: 'test:cleanup',
            windowSeconds: 60,
        });

        expect(mockDb.prisma.rateLimit.deleteMany).toHaveBeenCalledTimes(1);
        expect(mockDb.rows.has(staleKey)).toBe(false);
        expect(mockDb.rows.has(freshKey)).toBe(true);

        vi.setSystemTime(baseTime + 60 * 60 * 1000 + 1);
        await enforceIpRateLimit(createRequest(), {
            max: 10,
            scope: 'test:cleanup',
            windowSeconds: 60,
        });

        expect(mockDb.prisma.rateLimit.deleteMany).toHaveBeenCalledTimes(2);
    });

    it('still enforces limits when background cleanup fails', async () => {
        const { enforceIpRateLimit } = await loadRateLimitModule();

        mockDb.flags.rejectCleanup = true;
        const response = await enforceIpRateLimit(createRequest(), {
            max: 1,
            scope: 'test:cleanup-failure',
            windowSeconds: 60,
        });

        await Promise.resolve();

        expect(response).toBeNull();
        expect(mockDb.rows.get(hashKey('test:cleanup-failure:ip:unknown-client'))?.count).toBe(1);
    });
});
