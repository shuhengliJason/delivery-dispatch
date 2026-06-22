import {
    DelayReason,
    DelayStatus,
    OrderStatus,
    PaymentStatus,
    TimelineEventType,
    type BackgroundJob,
} from '@prisma/client';

import { getStringPayloadValue } from '@/jobs/payload';
import { getOperationalDelayStatus } from '@/lib/order-realtime';
import { prisma } from '@/lib/prisma';

const activeOrderStatuses = [
    OrderStatus.CREATED,
    OrderStatus.CONFIRMED,
    OrderStatus.PREPARING,
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.ASSIGNED,
    OrderStatus.ACCEPTED_BY_DRIVER,
    OrderStatus.PICKED_UP,
    OrderStatus.ON_THE_WAY,
];

async function syncDelayStatusForOrder(order: {
    delayStatus: DelayStatus;
    estimatedDeliveryAt: Date;
    id: string;
    status: OrderStatus;
}, now: Date): Promise<void> {
    const nextDelayStatus = getOperationalDelayStatus(order.status, order.estimatedDeliveryAt, now);

    if (nextDelayStatus === order.delayStatus) {
        return;
    }

    await prisma.$transaction(async (transaction) => {
        await transaction.order.update({
            where: {
                id: order.id,
            },
            data: {
                delayStatus: nextDelayStatus,
            },
        });

        if (nextDelayStatus === DelayStatus.DELAYED) {
            const delayMinutes = Math.max(1, Math.ceil((now.getTime() - order.estimatedDeliveryAt.getTime()) / 60000));

            await transaction.delayEvent.create({
                data: {
                    delayMinutes,
                    message: 'Background monitoring detected a late order.',
                    orderId: order.id,
                    reason: DelayReason.UNKNOWN,
                },
            });
            await transaction.orderTimelineEvent.create({
                data: {
                    message: 'Background monitoring detected a late order.',
                    orderId: order.id,
                    title: 'Delay detected',
                    type: TimelineEventType.DELAY_DETECTED,
                },
            });
        }

        if (nextDelayStatus === DelayStatus.RESOLVED && order.delayStatus !== DelayStatus.RESOLVED) {
            await transaction.delayEvent.updateMany({
                where: {
                    orderId: order.id,
                    resolvedAt: null,
                },
                data: {
                    resolvedAt: now,
                },
            });
            await transaction.orderTimelineEvent.create({
                data: {
                    message: 'The order is no longer delayed.',
                    orderId: order.id,
                    title: 'Delay resolved',
                    type: TimelineEventType.DELAY_RESOLVED,
                },
            });
        }
    });
}

export async function syncOrderDelayStatus(job: BackgroundJob): Promise<void> {
    const orderId = getStringPayloadValue(job.payload, 'orderId');
    const now = new Date();

    if (orderId) {
        const order = await prisma.order.findUnique({
            where: {
                id: orderId,
            },
            select: {
                delayStatus: true,
                estimatedDeliveryAt: true,
                id: true,
                status: true,
            },
        });

        if (order) {
            await syncDelayStatusForOrder(order, now);
        }

        return;
    }

    const orders = await prisma.order.findMany({
        where: {
            paymentStatus: PaymentStatus.PAID,
            status: {
                in: activeOrderStatuses,
            },
        },
        select: {
            delayStatus: true,
            estimatedDeliveryAt: true,
            id: true,
            status: true,
        },
        take: 100,
    });

    for (const order of orders) {
        await syncDelayStatusForOrder(order, now);
    }
}
