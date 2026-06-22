import {
    CircuitBreakerState,
} from '@prisma/client';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

const mockDb = vi.hoisted(() => {
    return {
        prisma: {
            circuitBreaker: {
                create: vi.fn(),
                findUnique: vi.fn(),
                update: vi.fn(),
                updateMany: vi.fn(),
            },
        },
    };
});

vi.mock('@/lib/prisma', () => {
    return {
        prisma: mockDb.prisma,
    };
});

const now = new Date('2026-06-17T12:00:00.000Z');

function closedBreaker(overrides = {}) {
    return {
        createdAt: now,
        failureCount: 0,
        halfOpenProbeAt: null,
        lastError: null,
        lastFailureAt: null,
        lastSuccessAt: null,
        openedUntil: null,
        serviceKey: 'test-service',
        state: CircuitBreakerState.CLOSED,
        successCount: 0,
        updatedAt: now,
        ...overrides,
    };
}

describe('withCircuitBreaker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('allows a closed circuit and records success', async () => {
        const { withCircuitBreaker } = await import('./circuit-breaker');
        mockDb.prisma.circuitBreaker.findUnique.mockResolvedValue(closedBreaker());
        mockDb.prisma.circuitBreaker.update.mockResolvedValue(closedBreaker());

        const result = await withCircuitBreaker('test-service', {
            now: () => now,
            operation: vi.fn(async () => 'ok'),
        });

        expect(result).toBe('ok');
        expect(mockDb.prisma.circuitBreaker.update).toHaveBeenCalledWith({
            where: {
                serviceKey: 'test-service',
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
    });

    it('opens a closed circuit after the failure threshold', async () => {
        const { withCircuitBreaker } = await import('./circuit-breaker');
        const error = new Error('Provider unavailable.');
        mockDb.prisma.circuitBreaker.findUnique
            .mockResolvedValueOnce(closedBreaker({
                failureCount: 2,
                lastFailureAt: new Date('2026-06-17T11:59:30.000Z'),
            }))
            .mockResolvedValueOnce(closedBreaker({
                failureCount: 2,
                lastFailureAt: new Date('2026-06-17T11:59:30.000Z'),
            }));
        mockDb.prisma.circuitBreaker.update.mockResolvedValue(closedBreaker());

        await expect(withCircuitBreaker('test-service', {
            now: () => now,
            operation: vi.fn(async () => {
                throw error;
            }),
            policy: {
                cooldownMs: 60000,
                failureThreshold: 3,
                failureWindowMs: 120000,
            },
        })).rejects.toThrow('Provider unavailable.');

        expect(mockDb.prisma.circuitBreaker.update).toHaveBeenCalledWith({
            where: {
                serviceKey: 'test-service',
            },
            data: {
                failureCount: 3,
                halfOpenProbeAt: null,
                lastError: 'Provider unavailable.',
                lastFailureAt: now,
                openedUntil: new Date('2026-06-17T12:01:00.000Z'),
                state: CircuitBreakerState.OPEN,
                successCount: 0,
            },
        });
    });

    it('uses fallback without calling the provider while open', async () => {
        const { withCircuitBreaker } = await import('./circuit-breaker');
        const operation = vi.fn(async () => 'provider result');
        const retryAt = new Date('2026-06-17T12:05:00.000Z');
        mockDb.prisma.circuitBreaker.findUnique.mockResolvedValue(closedBreaker({
            openedUntil: retryAt,
            state: CircuitBreakerState.OPEN,
        }));

        const result = await withCircuitBreaker('test-service', {
            fallback: (error) => {
                expect(error.retryAt).toEqual(retryAt);

                return 'fallback result';
            },
            now: () => now,
            operation,
        });

        expect(result).toBe('fallback result');
        expect(operation).not.toHaveBeenCalled();
    });

    it('allows one half-open probe after cooldown and closes on success', async () => {
        const { withCircuitBreaker } = await import('./circuit-breaker');
        mockDb.prisma.circuitBreaker.findUnique.mockResolvedValue(closedBreaker({
            openedUntil: new Date('2026-06-17T11:59:00.000Z'),
            state: CircuitBreakerState.OPEN,
        }));
        mockDb.prisma.circuitBreaker.updateMany.mockResolvedValue({
            count: 1,
        });
        mockDb.prisma.circuitBreaker.update.mockResolvedValue(closedBreaker());

        const result = await withCircuitBreaker('test-service', {
            now: () => now,
            operation: vi.fn(async () => 'healthy'),
        });

        expect(result).toBe('healthy');
        expect(mockDb.prisma.circuitBreaker.updateMany).toHaveBeenCalledWith({
            where: {
                openedUntil: {
                    lte: now,
                },
                serviceKey: 'test-service',
                state: CircuitBreakerState.OPEN,
            },
            data: {
                halfOpenProbeAt: now,
                state: CircuitBreakerState.HALF_OPEN,
                successCount: 0,
            },
        });
        expect(mockDb.prisma.circuitBreaker.update).toHaveBeenLastCalledWith({
            where: {
                serviceKey: 'test-service',
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
    });
});
