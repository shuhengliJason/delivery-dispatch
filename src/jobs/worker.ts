import { randomUUID } from 'node:crypto';

import {
    BackgroundJobStatus,
    type BackgroundJob,
} from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { backgroundJobHandlers } from '@/jobs/handlers';
import { type BackgroundJobType } from '@/jobs/enqueue';

type BackgroundJobHandler = (job: BackgroundJob) => Promise<void>;

type ProcessDueBackgroundJobsOptions = {
    handlers?: Partial<Record<BackgroundJobType, BackgroundJobHandler>>;
    limit?: number;
    now?: Date;
    workerId?: string;
};

type ProcessDueBackgroundJobsResult = {
    failed: number;
    processed: number;
    succeeded: number;
};

export class RetryableJobError extends Error {
    nextRunAt: Date;

    constructor(message: string, nextRunAt: Date) {
        super(message);
        this.name = 'RetryableJobError';
        this.nextRunAt = nextRunAt;
    }
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message.slice(0, 2000);
    }

    return 'Unknown background job failure.';
}

function getBackoffRunAt(attempts: number, now: Date): Date {
    const minutes = Math.min(60, 2 ** Math.max(0, attempts - 1));

    return new Date(now.getTime() + minutes * 60 * 1000);
}

async function claimDueJobs(input: {
    limit: number;
    now: Date;
    workerId: string;
}): Promise<BackgroundJob[]> {
    const dueJobs = await prisma.backgroundJob.findMany({
        where: {
            runAt: {
                lte: input.now,
            },
            status: BackgroundJobStatus.QUEUED,
        },
        orderBy: [
            {
                runAt: 'asc',
            },
            {
                createdAt: 'asc',
            },
        ],
        select: {
            id: true,
        },
        take: input.limit,
    });

    const jobIds = dueJobs.map((job) => {
        return job.id;
    });

    if (jobIds.length === 0) {
        return [];
    }

    await prisma.backgroundJob.updateMany({
        where: {
            id: {
                in: jobIds,
            },
            status: BackgroundJobStatus.QUEUED,
        },
        data: {
            attempts: {
                increment: 1,
            },
            lockedAt: input.now,
            lockedBy: input.workerId,
            status: BackgroundJobStatus.RUNNING,
        },
    });

    return prisma.backgroundJob.findMany({
        where: {
            id: {
                in: jobIds,
            },
            lockedBy: input.workerId,
            status: BackgroundJobStatus.RUNNING,
        },
        orderBy: [
            {
                runAt: 'asc',
            },
            {
                createdAt: 'asc',
            },
        ],
    });
}

async function markJobSucceeded(jobId: string): Promise<void> {
    await prisma.backgroundJob.update({
        where: {
            id: jobId,
        },
        data: {
            lastError: null,
            lockedAt: null,
            lockedBy: null,
            status: BackgroundJobStatus.SUCCEEDED,
        },
    });
}

async function markJobFailed(
    job: BackgroundJob,
    error: unknown,
    now: Date,
): Promise<boolean> {
    const message = getErrorMessage(error);
    const exhausted = job.attempts >= job.maxAttempts;

    if (exhausted) {
        await prisma.backgroundJob.update({
            where: {
                id: job.id,
            },
            data: {
                lastError: message,
                lockedAt: null,
                lockedBy: null,
                status: BackgroundJobStatus.FAILED,
            },
        });

        return true;
    }

    const runAt = error instanceof RetryableJobError
        ? error.nextRunAt
        : getBackoffRunAt(job.attempts, now);

    await prisma.backgroundJob.update({
        where: {
            id: job.id,
        },
        data: {
            lastError: message,
            lockedAt: null,
            lockedBy: null,
            runAt,
            status: BackgroundJobStatus.QUEUED,
        },
    });

    return false;
}

export async function processDueBackgroundJobs({
    handlers = backgroundJobHandlers,
    limit = 10,
    now = new Date(),
    workerId = randomUUID(),
}: ProcessDueBackgroundJobsOptions = {}): Promise<ProcessDueBackgroundJobsResult> {
    const jobs = await claimDueJobs({
        limit,
        now,
        workerId,
    });
    let succeeded = 0;
    let failed = 0;

    for (const job of jobs) {
        const handler = handlers[job.type as BackgroundJobType];

        try {
            if (!handler) {
                throw new Error(`No handler registered for background job type "${job.type}".`);
            }

            await handler(job);
            await markJobSucceeded(job.id);
            succeeded += 1;
        } catch (error) {
            const permanentlyFailed = await markJobFailed(job, error, now);

            if (permanentlyFailed) {
                failed += 1;
            }
        }
    }

    return {
        failed,
        processed: jobs.length,
        succeeded,
    };
}

export type {
    BackgroundJobHandler,
};
