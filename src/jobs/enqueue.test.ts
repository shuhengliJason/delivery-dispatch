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
                create: vi.fn(),
                upsert: vi.fn(),
            },
        },
    };
});

vi.mock('@/lib/prisma', () => {
    return {
        prisma: mockDb.prisma,
    };
});

describe('enqueueBackgroundJob', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a queued job without an idempotency key', async () => {
        const { enqueueBackgroundJob } = await import('./enqueue');
        const runAt = new Date('2026-06-05T12:00:00.000Z');
        mockDb.prisma.backgroundJob.create.mockResolvedValue({
            id: 'job_1',
        });

        await enqueueBackgroundJob({
            maxAttempts: 3,
            payload: {
                orderId: 'order_1',
            },
            runAt,
            type: 'dispatch_ready_order',
        });

        expect(mockDb.prisma.backgroundJob.create).toHaveBeenCalledWith({
            data: {
                maxAttempts: 3,
                payload: {
                    orderId: 'order_1',
                },
                runAt,
                status: BackgroundJobStatus.QUEUED,
                type: 'dispatch_ready_order',
            },
        });
    });

    it('uses upsert when an idempotency key is provided', async () => {
        const { enqueueBackgroundJob } = await import('./enqueue');
        const runAt = new Date('2026-06-05T12:00:00.000Z');
        mockDb.prisma.backgroundJob.upsert.mockResolvedValue({
            id: 'job_existing',
        });

        await enqueueBackgroundJob({
            idempotencyKey: 'dispatch:order_1',
            payload: {
                orderId: 'order_1',
            },
            runAt,
            type: 'dispatch_ready_order',
        });

        expect(mockDb.prisma.backgroundJob.upsert).toHaveBeenCalledWith({
            create: {
                idempotencyKey: 'dispatch:order_1',
                maxAttempts: 5,
                payload: {
                    orderId: 'order_1',
                },
                runAt,
                status: BackgroundJobStatus.QUEUED,
                type: 'dispatch_ready_order',
            },
            update: {},
            where: {
                idempotencyKey: 'dispatch:order_1',
            },
        });
    });
});
