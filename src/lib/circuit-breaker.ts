import {
    CircuitBreakerState,
    type CircuitBreaker,
} from '@prisma/client';

import { prisma } from '@/lib/prisma';

type CircuitBreakerPolicy = {
    cooldownMs: number;
    failureThreshold: number;
    failureWindowMs: number;
    halfOpenProbeTimeoutMs: number;
    isFailure?: (error: unknown) => boolean;
};

type CircuitBreakerOptions<T> = {
    fallback?: (error: CircuitBreakerOpenError) => Promise<T> | T;
    now?: () => Date;
    operation: () => Promise<T>;
    policy?: Partial<CircuitBreakerPolicy>;
};

type CircuitBreakerDecision = {
    allowed: true;
    state: CircuitBreakerState;
} | {
    allowed: false;
    retryAt: Date;
    state: CircuitBreakerState;
};

const defaultPolicy: CircuitBreakerPolicy = {
    cooldownMs: 5 * 60 * 1000,
    failureThreshold: 3,
    failureWindowMs: 2 * 60 * 1000,
    halfOpenProbeTimeoutMs: 30 * 1000,
};

export const circuitBreakerPolicies = {
    aiProvider: {
        cooldownMs: 5 * 60 * 1000,
        failureThreshold: 3,
        failureWindowMs: 2 * 60 * 1000,
        halfOpenProbeTimeoutMs: 30 * 1000,
    },
    brevoEmail: {
        cooldownMs: 10 * 60 * 1000,
        failureThreshold: 3,
        failureWindowMs: 5 * 60 * 1000,
        halfOpenProbeTimeoutMs: 30 * 1000,
    },
    googleRoutes: {
        cooldownMs: 5 * 60 * 1000,
        failureThreshold: 5,
        failureWindowMs: 2 * 60 * 1000,
        halfOpenProbeTimeoutMs: 30 * 1000,
    },
} satisfies Record<string, CircuitBreakerPolicy>;

export class CircuitBreakerOpenError extends Error {
    retryAt: Date;
    serviceKey: string;

    constructor(serviceKey: string, retryAt: Date) {
        super(`Circuit breaker is open for ${serviceKey}.`);
        this.name = 'CircuitBreakerOpenError';
        this.retryAt = retryAt;
        this.serviceKey = serviceKey;
    }
}

function getPolicy(policy?: Partial<CircuitBreakerPolicy>): CircuitBreakerPolicy {
    return {
        ...defaultPolicy,
        ...policy,
    };
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message.slice(0, 2000);
    }

    return 'Unknown service failure.';
}

async function getOrCreateCircuitBreaker(
    serviceKey: string,
): Promise<CircuitBreaker> {
    const breaker = await prisma.circuitBreaker.findUnique({
        where: {
            serviceKey,
        },
    });

    if (breaker) {
        return breaker;
    }

    return prisma.circuitBreaker.create({
        data: {
            serviceKey,
        },
    });
}

async function getCircuitBreakerDecision(
    serviceKey: string,
    policy: CircuitBreakerPolicy,
    now: Date,
): Promise<CircuitBreakerDecision> {
    const breaker = await getOrCreateCircuitBreaker(serviceKey);

    if (breaker.state === CircuitBreakerState.CLOSED) {
        return {
            allowed: true,
            state: breaker.state,
        };
    }

    if (breaker.state === CircuitBreakerState.OPEN) {
        const openedUntil = breaker.openedUntil ?? new Date(now.getTime() + policy.cooldownMs);

        if (openedUntil.getTime() > now.getTime()) {
            return {
                allowed: false,
                retryAt: openedUntil,
                state: breaker.state,
            };
        }

        const probe = await prisma.circuitBreaker.updateMany({
            where: {
                openedUntil: {
                    lte: now,
                },
                serviceKey,
                state: CircuitBreakerState.OPEN,
            },
            data: {
                halfOpenProbeAt: now,
                state: CircuitBreakerState.HALF_OPEN,
                successCount: 0,
            },
        });

        if (probe.count === 1) {
            return {
                allowed: true,
                state: CircuitBreakerState.HALF_OPEN,
            };
        }

        return {
            allowed: false,
            retryAt: new Date(now.getTime() + policy.halfOpenProbeTimeoutMs),
            state: CircuitBreakerState.HALF_OPEN,
        };
    }

    const halfOpenProbeAt = breaker.halfOpenProbeAt;
    const probeInProgress = halfOpenProbeAt
        && now.getTime() - halfOpenProbeAt.getTime() < policy.halfOpenProbeTimeoutMs;

    if (probeInProgress) {
        return {
            allowed: false,
            retryAt: new Date(halfOpenProbeAt.getTime() + policy.halfOpenProbeTimeoutMs),
            state: CircuitBreakerState.HALF_OPEN,
        };
    }

    await prisma.circuitBreaker.update({
        where: {
            serviceKey,
        },
        data: {
            halfOpenProbeAt: now,
        },
    });

    return {
        allowed: true,
        state: CircuitBreakerState.HALF_OPEN,
    };
}

async function recordCircuitBreakerSuccess(
    serviceKey: string,
    now: Date,
): Promise<void> {
    await prisma.circuitBreaker.update({
        where: {
            serviceKey,
        },
        data: {
            failureCount: 0,
            halfOpenProbeAt: null,
            lastError: null,
            lastSuccessAt: now,
            openedUntil: null,
            state: CircuitBreakerState.CLOSED,
            successCount: {
                increment: 1,
            },
        },
    });
}

async function recordCircuitBreakerFailure(
    serviceKey: string,
    policy: CircuitBreakerPolicy,
    error: unknown,
    now: Date,
): Promise<void> {
    const breaker = await getOrCreateCircuitBreaker(serviceKey);
    const isInsideFailureWindow = breaker.lastFailureAt
        && now.getTime() - breaker.lastFailureAt.getTime() <= policy.failureWindowMs;
    const failureCount = isInsideFailureWindow
        ? breaker.failureCount + 1
        : 1;
    const shouldOpen = breaker.state === CircuitBreakerState.HALF_OPEN
        || failureCount >= policy.failureThreshold;

    await prisma.circuitBreaker.update({
        where: {
            serviceKey,
        },
        data: {
            failureCount,
            halfOpenProbeAt: null,
            lastError: getErrorMessage(error),
            lastFailureAt: now,
            openedUntil: shouldOpen
                ? new Date(now.getTime() + policy.cooldownMs)
                : null,
            state: shouldOpen
                ? CircuitBreakerState.OPEN
                : CircuitBreakerState.CLOSED,
            successCount: 0,
        },
    });
}

export async function withCircuitBreaker<T>(
    serviceKey: string,
    options: CircuitBreakerOptions<T>,
): Promise<T> {
    const policy = getPolicy(options.policy);
    const now = options.now?.() ?? new Date();
    const decision = await getCircuitBreakerDecision(serviceKey, policy, now);

    if (!decision.allowed) {
        const error = new CircuitBreakerOpenError(serviceKey, decision.retryAt);

        if (options.fallback) {
            return options.fallback(error);
        }

        throw error;
    }

    try {
        const result = await options.operation();

        await recordCircuitBreakerSuccess(serviceKey, now);

        return result;
    } catch (error) {
        if (policy.isFailure?.(error) ?? true) {
            await recordCircuitBreakerFailure(serviceKey, policy, error, now);
        }

        throw error;
    }
}
