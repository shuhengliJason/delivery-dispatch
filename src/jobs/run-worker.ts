import { processDueBackgroundJobs } from '@/jobs/worker';
import { emitLogEvent } from '@/logging/app-logger';

const pollMs = Number(process.env.BACKGROUND_JOB_POLL_MS ?? 5000);
const limit = Number(process.env.BACKGROUND_JOB_BATCH_SIZE ?? 10);

async function poll(): Promise<void> {
    try {
        const result = await processDueBackgroundJobs({
            limit,
        });

        if (result.processed > 0) {
            await emitLogEvent({
                context: {
                    failed: result.failed,
                    processed: result.processed,
                    succeeded: result.succeeded,
                },
                level: result.failed > 0 ? 'warn' : 'info',
                message: 'Processed background jobs',
                source: 'jobs-worker',
            });
        }
    } catch (error) {
        await emitLogEvent({
            context: {
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
            },
            level: 'error',
            message: 'Background job worker failed',
            source: 'jobs-worker',
        });
    }
}

async function run(): Promise<void> {
    await poll();
    setInterval(() => {
        void poll();
    }, pollMs);
}

void run();
