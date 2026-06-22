import {
    BackgroundJobStatus,
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
            backgroundJob: {
                findMany: vi.fn(),
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

describe('processDueBackgroundJobs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('marks a claimed job succeeded after its handler completes', async () => {
        const { processDueBackgroundJobs } = await import('./worker');
        const job = {
            attempts: 1,
            id: 'job_1',
            maxAttempts: 5,
            payload: {
                orderId: 'order_1',
            },
            type: 'dispatch_ready_order',
        };
        mockDb.prisma.backgroundJob.findMany
            .mockResolvedValueOnce([{
                id: 'job_1',
            }])
            .mockResolvedValueOnce([job]);
        mockDb.prisma.backgroundJob.updateMany.mockResolvedValue({
            count: 1,
        });

        const result = await processDueBackgroundJobs({
            handlers: {
                dispatch_ready_order: vi.fn(async () => undefined),
            },
            now: new Date('2026-06-05T12:00:00.000Z'),
            workerId: 'worker_1',
        });

        expect(result).toEqual({
            failed: 0,
            processed: 1,
            succeeded: 1,
        });
        expect(mockDb.prisma.backgroundJob.update).toHaveBeenCalledWith({
            where: {
                id: 'job_1',
            },
            data: {
                lastError: null,
                lockedAt: null,
                lockedBy: null,
                status: BackgroundJobStatus.SUCCEEDED,
            },
        });
    });

    it('requeues retryable failures with their requested next run time', async () => {
        const {
            RetryableJobError,
            processDueBackgroundJobs,
        } = await import('./worker');
        const now = new Date('2026-06-05T12:00:00.000Z');
        const nextRunAt = new Date('2026-06-05T12:05:00.000Z');
        mockDb.prisma.backgroundJob.findMany
            .mockResolvedValueOnce([{
                id: 'job_1',
            }])
            .mockResolvedValueOnce([{
                attempts: 2,
                id: 'job_1',
                maxAttempts: 5,
                payload: {},
                type: 'dispatch_ready_order',
            }]);
        mockDb.prisma.backgroundJob.updateMany.mockResolvedValue({
            count: 1,
        });

        await processDueBackgroundJobs({
            handlers: {
                dispatch_ready_order: vi.fn(async () => {
                    throw new RetryableJobError('No drivers available.', nextRunAt);
                }),
            },
            now,
            workerId: 'worker_1',
        });

        expect(mockDb.prisma.backgroundJob.update).toHaveBeenCalledWith({
            where: {
                id: 'job_1',
            },
            data: {
                lastError: 'No drivers available.',
                lockedAt: null,
                lockedBy: null,
                runAt: nextRunAt,
                status: BackgroundJobStatus.QUEUED,
            },
        });
    });

    it('marks exhausted failures permanently failed', async () => {
        const { processDueBackgroundJobs } = await import('./worker');
        mockDb.prisma.backgroundJob.findMany
            .mockResolvedValueOnce([{
                id: 'job_1',
            }])
            .mockResolvedValueOnce([{
                attempts: 5,
                id: 'job_1',
                maxAttempts: 5,
                payload: {},
                type: 'dispatch_ready_order',
            }]);
        mockDb.prisma.backgroundJob.updateMany.mockResolvedValue({
            count: 1,
        });

        const result = await processDueBackgroundJobs({
            handlers: {
                dispatch_ready_order: vi.fn(async () => {
                    throw new Error('Still broken.');
                }),
            },
            now: new Date('2026-06-05T12:00:00.000Z'),
            workerId: 'worker_1',
        });

        expect(result.failed).toBe(1);
        expect(mockDb.prisma.backgroundJob.update).toHaveBeenCalledWith({
            where: {
                id: 'job_1',
            },
            data: {
                lastError: 'Still broken.',
                lockedAt: null,
                lockedBy: null,
                status: BackgroundJobStatus.FAILED,
            },
        });
    });
});
