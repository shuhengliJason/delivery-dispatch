import { type BackgroundJob } from '@prisma/client';

import { getStringPayloadValue } from '@/jobs/payload';
import { RetryableJobError } from '@/jobs/worker';
import { assignBestDriverToReadyOrder } from '@/lib/driver-assignment';

export async function dispatchReadyOrder(job: BackgroundJob): Promise<void> {
    const orderId = getStringPayloadValue(job.payload, 'orderId');

    if (!orderId) {
        throw new Error('Dispatch job is missing orderId.');
    }

    const result = await assignBestDriverToReadyOrder(orderId);

    if (!result.assigned && result.reason === 'NO_AVAILABLE_DRIVER') {
        throw new RetryableJobError(
            'No eligible drivers are currently available.',
            new Date(Date.now() + 5 * 60 * 1000),
        );
    }
}
