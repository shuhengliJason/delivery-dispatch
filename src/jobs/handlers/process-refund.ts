import {
    PaymentStatus,
    TimelineEventType,
    type BackgroundJob,
} from '@prisma/client';

import { enqueueOrderNotificationJob } from '@/jobs/enqueue';
import { getStringPayloadValue } from '@/jobs/payload';
import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';

export async function processRefund(job: BackgroundJob): Promise<void> {
    const orderId = getStringPayloadValue(job.payload, 'orderId');
    const reason = getStringPayloadValue(job.payload, 'reason') ?? 'order_cancelled';

    if (!orderId) {
        throw new Error('Refund job is missing orderId.');
    }

    const order = await prisma.order.findUnique({
        where: {
            id: orderId,
        },
        select: {
            id: true,
            paymentStatus: true,
            stripePaymentIntentId: true,
        },
    });

    if (!order || order.paymentStatus === PaymentStatus.REFUNDED) {
        return;
    }

    if (order.paymentStatus !== PaymentStatus.PAID) {
        return;
    }

    if (!order.stripePaymentIntentId) {
        throw new Error('Paid order is missing a Stripe payment intent ID.');
    }

    const refund = await getStripe().refunds.create({
        metadata: {
            orderId: order.id,
            reason,
        },
        payment_intent: order.stripePaymentIntentId,
    }, {
        idempotencyKey: `refund:${order.id}:${reason}`,
    });

    await prisma.$transaction(async (transaction) => {
        await transaction.order.update({
            where: {
                id: order.id,
            },
            data: {
                paymentStatus: PaymentStatus.REFUNDED,
            },
        });
        await transaction.orderTimelineEvent.create({
            data: {
                orderId: order.id,
                type: TimelineEventType.ORDER_CANCELLED,
                title: 'Refund processed',
                message: 'Stripe processed the payment refund.',
                metadata: {
                    refundId: refund.id,
                    reason,
                },
            },
        });
        await enqueueOrderNotificationJob({
            kind: 'REFUND_PROCESSED',
            orderId: order.id,
        }, transaction);
    });
}
