import {
    PaymentStatus,
    TimelineEventType,
} from '@prisma/client';
import Stripe from 'stripe';

import {
    enqueueDelaySyncJob,
    enqueueOrderNotificationJob,
} from '@/jobs/enqueue';
import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';

type PaymentSyncResult = {
    orderId: string | null;
    updated: boolean;
};

type MarkOrderPaidOptions = {
    customerId?: string;
    orderId?: string;
};

function getPaymentIntentId(session: Stripe.Checkout.Session): string | null {
    if (typeof session.payment_intent === 'string') {
        return session.payment_intent;
    }

    return session.payment_intent?.id ?? null;
}

export async function markOrderPaidFromCheckoutSession(
    session: Stripe.Checkout.Session,
    options: MarkOrderPaidOptions = {},
): Promise<PaymentSyncResult> {
    if (session.payment_status !== 'paid') {
        return {
            orderId: null,
            updated: false,
        };
    }

    const metadataOrderId = session.metadata?.orderId;
    const orderId = options.orderId ?? metadataOrderId;

    if (!orderId || (options.orderId && metadataOrderId && metadataOrderId !== options.orderId)) {
        return {
            orderId: null,
            updated: false,
        };
    }

    const order = await prisma.order.findFirst({
        where: {
            ...(options.customerId ? { customerId: options.customerId } : {}),
            OR: [
                {
                    stripeCheckoutSessionId: session.id,
                },
                {
                    id: orderId,
                },
            ],
        },
        select: {
            estimatedDeliveryAt: true,
            id: true,
            paymentStatus: true,
        },
    });

    if (!order) {
        return {
            orderId: null,
            updated: false,
        };
    }

    if (order.paymentStatus === PaymentStatus.PAID) {
        return {
            orderId: order.id,
            updated: false,
        };
    }

    const now = new Date();
    const paymentIntentId = getPaymentIntentId(session);

    await prisma.$transaction(async (transaction) => {
        await transaction.order.update({
            where: {
                id: order.id,
            },
            data: {
                paymentStatus: PaymentStatus.PAID,
                stripeCheckoutSessionId: session.id,
                stripePaymentIntentId: paymentIntentId,
                paidAt: now,
            },
        });
        await transaction.orderTimelineEvent.create({
            data: {
                orderId: order.id,
                type: TimelineEventType.PAYMENT_RECEIVED,
                title: 'Payment received',
                message: 'Stripe confirmed the payment. The restaurant can now process the order.',
                metadata: {
                    checkoutSessionId: session.id,
                    paymentIntentId,
                },
                createdAt: now,
            },
        });
        await enqueueOrderNotificationJob({
            kind: 'PAYMENT_RECEIVED_CUSTOMER',
            orderId: order.id,
        }, transaction);
        await enqueueOrderNotificationJob({
            kind: 'PAYMENT_RECEIVED_VENDOR',
            orderId: order.id,
        }, transaction);
        await enqueueDelaySyncJob({
            estimatedDeliveryAt: order.estimatedDeliveryAt,
            orderId: order.id,
        }, transaction);
    });

    return {
        orderId: order.id,
        updated: true,
    };
}

export async function syncPaidCheckoutSession(
    sessionId: string,
    options: MarkOrderPaidOptions = {},
): Promise<PaymentSyncResult> {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);

    return markOrderPaidFromCheckoutSession(session, options);
}
