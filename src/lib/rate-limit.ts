import { createHash } from 'crypto';

import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

type RateLimitValue = {
    key: string;
    count: number;
    lastRequest: number;
};

type RateLimitPolicy = {
    identifier?: string;
    max: number;
    scope: string;
    windowSeconds: number;
};

type IdentifiedRateLimitPolicy = Omit<RateLimitPolicy, 'identifier'>;

type RateLimitCheck = {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
    retryAfter: number;
};

type RateLimitRow = {
    count: number;
    lastRequest: bigint;
};

let lastCleanupAt = 0;

export const authRateLimitStorage = {
    async get(key: string): Promise<RateLimitValue | null> {
        const row = await prisma.rateLimit.findUnique({
            where: {
                key: hashRateLimitKey(`better-auth:${key}`),
            },
        });

        if (!row) {
            return null;
        }

        return {
            key,
            count: row.count,
            lastRequest: Number(row.lastRequest),
        };
    },
    async set(key: string, value: RateLimitValue): Promise<void> {
        scheduleRateLimitCleanup();

        await prisma.rateLimit.upsert({
            where: {
                key: hashRateLimitKey(`better-auth:${key}`),
            },
            create: {
                count: value.count,
                key: hashRateLimitKey(`better-auth:${key}`),
                lastRequest: BigInt(value.lastRequest),
            },
            update: {
                count: value.count,
                lastRequest: BigInt(value.lastRequest),
            },
        });
    },
};

export const adminRateLimitPolicies = {
    dispatcherUserMutationIp: {
        max: 60,
        scope: 'admin:dispatcher-users:ip',
        windowSeconds: 60,
    },
    dispatcherUserMutationUser: {
        max: 30,
        scope: 'admin:dispatcher-users:user',
        windowSeconds: 60,
    },
    dispatcherOrderMutationIp: {
        max: 120,
        scope: 'admin:dispatcher-orders:ip',
        windowSeconds: 60,
    },
    dispatcherOrderMutationUser: {
        max: 60,
        scope: 'admin:dispatcher-orders:user',
        windowSeconds: 60,
    },
    vendorOrderMutationIp: {
        max: 120,
        scope: 'admin:vendor-orders:ip',
        windowSeconds: 60,
    },
    vendorOrderMutationUser: {
        max: 60,
        scope: 'admin:vendor-orders:user',
        windowSeconds: 60,
    },
    vendorMenuMutationIp: {
        max: 90,
        scope: 'admin:vendor-menu:ip',
        windowSeconds: 60,
    },
    vendorMenuMutationUser: {
        max: 45,
        scope: 'admin:vendor-menu:user',
        windowSeconds: 60,
    },
    vendorStaffMutationIp: {
        max: 60,
        scope: 'admin:vendor-staff:ip',
        windowSeconds: 60,
    },
    vendorStaffMutationUser: {
        max: 30,
        scope: 'admin:vendor-staff:user',
        windowSeconds: 60,
    },
    vendorRestaurantMutationIp: {
        max: 90,
        scope: 'admin:vendor-restaurant:ip',
        windowSeconds: 60,
    },
    vendorRestaurantMutationUser: {
        max: 45,
        scope: 'admin:vendor-restaurant:user',
        windowSeconds: 60,
    },
} satisfies Record<string, Omit<RateLimitPolicy, 'identifier'>>;

export const accountRateLimitPolicies = {
    emailVerificationIp: {
        max: 10,
        scope: 'account:email-verification:ip',
        windowSeconds: 15 * 60,
    },
    emailVerificationUser: {
        max: 5,
        scope: 'account:email-verification:user',
        windowSeconds: 15 * 60,
    },
} satisfies Record<string, Omit<RateLimitPolicy, 'identifier'>>;

export function isRateLimitingEnabled(): boolean {
    return process.env.NODE_ENV === 'production'
        || process.env.RATE_LIMIT_ENABLED === '1';
}

export async function enforceRateLimit(
    request: Request,
    policy: RateLimitPolicy,
): Promise<NextResponse | null> {
    if (!isRateLimitingEnabled()) {
        return null;
    }

    scheduleRateLimitCleanup();

    const identifier = policy.identifier ?? getClientIdentifier(request);
    const result = await checkRateLimit({
        ...policy,
        identifier,
    });

    if (result.allowed) {
        return null;
    }

    return createRateLimitResponse(result);
}

export async function enforceIpRateLimit(
    request: Request,
    policy: IdentifiedRateLimitPolicy,
): Promise<NextResponse | null> {
    return enforceRateLimit(request, policy);
}

export async function enforceUserRateLimit(
    request: Request,
    policy: IdentifiedRateLimitPolicy,
    userId: string,
): Promise<NextResponse | null> {
    return enforceRateLimit(request, {
        ...policy,
        identifier: userId,
    });
}

export async function enforceRateLimits(
    request: Request,
    policies: RateLimitPolicy[],
): Promise<NextResponse | null> {
    for (const policy of policies) {
        const response = await enforceRateLimit(request, policy);

        if (response) {
            return response;
        }
    }

    return null;
}

async function checkRateLimit(policy: Required<RateLimitPolicy>): Promise<RateLimitCheck> {
    const now = Date.now();
    const windowMs = policy.windowSeconds * 1000;
    const key = hashRateLimitKey(`${policy.scope}:${policy.identifier}`);

    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
            INSERT INTO "RateLimit" ("key", "count", "lastRequest", "createdAt", "updatedAt")
            VALUES (${key}, 0, ${BigInt(0)}, NOW(), NOW())
            ON CONFLICT ("key") DO NOTHING
        `;

        const rows = await tx.$queryRaw<RateLimitRow[]>`
            SELECT "count", "lastRequest"
            FROM "RateLimit"
            WHERE "key" = ${key}
            FOR UPDATE
        `;
        const row = rows[0];
        const lastRequest = Number(row?.lastRequest ?? 0);
        const currentCount = row?.count ?? 0;
        const isExpired = now - lastRequest > windowMs;
        const resetAt = isExpired ? now + windowMs : lastRequest + windowMs;

        if (!isExpired && currentCount >= policy.max) {
            return {
                allowed: false,
                limit: policy.max,
                remaining: 0,
                resetAt,
                retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
            };
        }

        const nextCount = isExpired ? 1 : currentCount + 1;

        await tx.rateLimit.update({
            where: {
                key,
            },
            data: {
                count: nextCount,
                lastRequest: BigInt(now),
            },
        });

        return {
            allowed: true,
            limit: policy.max,
            remaining: Math.max(0, policy.max - nextCount),
            resetAt: now + windowMs,
            retryAfter: 0,
        };
    });
}

function createRateLimitResponse(result: RateLimitCheck): NextResponse {
    return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
            headers: {
                'RateLimit-Limit': String(result.limit),
                'RateLimit-Remaining': String(result.remaining),
                'RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
                'Retry-After': String(result.retryAfter),
            },
            status: 429,
        },
    );
}

function getClientIdentifier(request: Request): string {
    const headers = request.headers;
    const forwardedFor = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const ip = headers.get('cf-connecting-ip')
        ?? headers.get('x-real-ip')
        ?? forwardedFor
        ?? 'unknown-client';

    return `ip:${ip}`;
}

function hashRateLimitKey(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function scheduleRateLimitCleanup(): void {
    const now = Date.now();
    const oneHourMs = 60 * 60 * 1000;

    if (now - lastCleanupAt < oneHourMs) {
        return;
    }

    lastCleanupAt = now;

    void prisma.rateLimit.deleteMany({
        where: {
            updatedAt: {
                lt: new Date(now - 24 * oneHourMs),
            },
        },
    }).catch(() => {
        lastCleanupAt = 0;
    });
}
