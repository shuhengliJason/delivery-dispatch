import { processDueBackgroundJobs } from '@/jobs/worker';

const pollMs = Number(process.env.BACKGROUND_JOB_POLL_MS ?? 5000);
const limit = Number(process.env.BACKGROUND_JOB_BATCH_SIZE ?? 10);

async function poll(): Promise<void> {
    try {
        const result = await processDueBackgroundJobs({
            limit,
        });

        if (result.processed > 0) {
            console.info('Processed background jobs', result);
        }
    } catch (error) {
        console.error('Background job worker failed', error);
    }
}

async function run(): Promise<void> {
    await poll();
    setInterval(() => {
        void poll();
    }, pollMs);
}

void run();
