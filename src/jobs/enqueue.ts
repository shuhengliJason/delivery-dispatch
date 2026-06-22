import {
    BackgroundJobStatus,
    type Prisma,
} from '@prisma/client';

import { atRiskWindowMinutes } from '@/lib/delay-rules';
import { prisma } from '@/lib/prisma';

export const backgroundJobTypes = [
    'send_order_notification',
    'dispatch_ready_order',
    'sync_order_delay_status',
    'process_refund',
] as const;

export type BackgroundJobType = (typeof backgroundJobTypes)[number];

type BackgroundJobClient = Pick<Prisma.TransactionClient, 'backgroundJob'>;

type EnqueueBackgroundJobInput = {
    idempotencyKey?: string;
    maxAttempts?: number;
    payload: Prisma.InputJsonValue;
    runAt?: Date;
    type: BackgroundJobType;
};

export async function enqueueBackgroundJob(
    input: EnqueueBackgroundJobInput,
    client: BackgroundJobClient = prisma,
) {
    const data = {
        maxAttempts: input.maxAttempts ?? 5,
        payload: input.payload,
        runAt: input.runAt,
        status: BackgroundJobStatus.QUEUED,
        type: input.type,
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    };

    if (input.idempotencyKey) {
        return client.backgroundJob.upsert({
            create: data,
            update: {},
            where: {
                idempotencyKey: input.idempotencyKey,
            },
        });
    }

    return client.backgroundJob.create({
        data,
    });
}

export function enqueueOrderNotificationJob(
    input: {
        kind: string;
        orderId: string;
        recipientUserId?: string;
        runAt?: Date;
    },
    client?: BackgroundJobClient,
) {
    const recipientKey = input.recipientUserId ?? 'derived';

    return enqueueBackgroundJob({
        idempotencyKey: `notify:${input.kind}:${input.orderId}:${recipientKey}`,
        payload: {
            kind: input.kind,
            orderId: input.orderId,
            recipientUserId: input.recipientUserId,
        },
        runAt: input.runAt,
        type: 'send_order_notification',
    }, client);
}

export function enqueueDispatchReadyOrderJob(
    orderId: string,
    client?: BackgroundJobClient,
) {
    return enqueueBackgroundJob({
        idempotencyKey: `dispatch-ready-order:${orderId}`,
        payload: {
            orderId,
        },
        type: 'dispatch_ready_order',
    }, client);
}

export function enqueueDelaySyncJob(
    input: {
        estimatedDeliveryAt?: Date;
        orderId: string;
    },
    client?: BackgroundJobClient,
) {
    const runAt = input.estimatedDeliveryAt
        ? new Date(input.estimatedDeliveryAt.getTime() - atRiskWindowMinutes * 60 * 1000)
        : undefined;

    return enqueueBackgroundJob({
        idempotencyKey: `delay-sync:${input.orderId}`,
        payload: {
            orderId: input.orderId,
        },
        runAt,
        type: 'sync_order_delay_status',
    }, client);
}

export function enqueueRefundJob(
    input: {
        orderId: string;
        reason: string;
    },
    client?: BackgroundJobClient,
) {
    return enqueueBackgroundJob({
        idempotencyKey: `refund:${input.orderId}:${input.reason}`,
        maxAttempts: 8,
        payload: input,
        type: 'process_refund',
    }, client);
}
