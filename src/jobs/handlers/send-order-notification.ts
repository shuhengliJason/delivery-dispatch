import {
    TimelineEventType,
    type BackgroundJob,
} from '@prisma/client';

import { getStringPayloadValue } from '@/jobs/payload';
import { RetryableJobError } from '@/jobs/worker';
import {
    isBrevoConfigured,
    sendBrevoEmail,
} from '@/lib/brevo';
import { CircuitBreakerOpenError } from '@/lib/circuit-breaker';
import { prisma } from '@/lib/prisma';

type NotificationRecipient = {
    email: string;
    name: string | null;
};

type NotificationMessage = {
    htmlContent: string;
    subject: string;
    textContent: string;
};

function buildNotificationMessage(kind: string, orderNumber: number): NotificationMessage {
    if (kind === 'PAYMENT_RECEIVED_VENDOR') {
        return {
            htmlContent: `<p>Order #${orderNumber} has been paid and is ready for restaurant processing.</p>`,
            subject: `Order #${orderNumber} is paid`,
            textContent: `Order #${orderNumber} has been paid and is ready for restaurant processing.`,
        };
    }

    if (kind === 'DRIVER_ASSIGNED') {
        return {
            htmlContent: `<p>A driver has been assigned to order #${orderNumber}.</p>`,
            subject: `Driver assigned to order #${orderNumber}`,
            textContent: `A driver has been assigned to order #${orderNumber}.`,
        };
    }

    if (kind === 'REFUND_PROCESSED') {
        return {
            htmlContent: `<p>Your refund for order #${orderNumber} has been processed.</p>`,
            subject: `Refund processed for order #${orderNumber}`,
            textContent: `Your refund for order #${orderNumber} has been processed.`,
        };
    }

    return {
        htmlContent: `<p>Payment was received for order #${orderNumber}. The restaurant can now process it.</p>`,
        subject: `Payment received for order #${orderNumber}`,
        textContent: `Payment was received for order #${orderNumber}. The restaurant can now process it.`,
    };
}

async function getRecipient(
    kind: string,
    orderId: string,
    recipientUserId: string | null,
): Promise<NotificationRecipient | null> {
    if (recipientUserId) {
        const user = await prisma.user.findUnique({
            where: {
                id: recipientUserId,
            },
            select: {
                email: true,
                name: true,
            },
        });

        return user;
    }

    const order = await prisma.order.findUnique({
        where: {
            id: orderId,
        },
        select: {
            customer: {
                select: {
                    user: {
                        select: {
                            email: true,
                            name: true,
                        },
                    },
                },
            },
            restaurant: {
                select: {
                    vendor: {
                        select: {
                            email: true,
                            name: true,
                        },
                    },
                },
            },
        },
    });

    if (!order) {
        return null;
    }

    if (kind.endsWith('_VENDOR')) {
        return order.restaurant.vendor;
    }

    return order.customer.user;
}

export async function sendOrderNotification(job: BackgroundJob): Promise<void> {
    const orderId = getStringPayloadValue(job.payload, 'orderId');
    const kind = getStringPayloadValue(job.payload, 'kind') ?? 'PAYMENT_RECEIVED_CUSTOMER';
    const recipientUserId = getStringPayloadValue(job.payload, 'recipientUserId');

    if (!orderId) {
        throw new Error('Notification job is missing orderId.');
    }

    const order = await prisma.order.findUnique({
        where: {
            id: orderId,
        },
        select: {
            orderNumber: true,
        },
    });

    if (!order) {
        return;
    }

    const recipient = await getRecipient(kind, orderId, recipientUserId);

    if (!recipient) {
        return;
    }

    const message = buildNotificationMessage(kind, order.orderNumber);

    if (!isBrevoConfigured()) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Brevo is not configured for order notifications.');
        }

        return;
    }

    try {
        await sendBrevoEmail({
            ...message,
            to: recipient,
        });
    } catch (error) {
        if (error instanceof CircuitBreakerOpenError) {
            throw new RetryableJobError('Brevo email circuit is open.', error.retryAt);
        }

        throw error;
    }

    if (kind.includes('CUSTOMER') || kind === 'REFUND_PROCESSED') {
        await prisma.orderTimelineEvent.create({
            data: {
                orderId,
                type: TimelineEventType.CUSTOMER_NOTIFIED,
                title: 'Customer notified',
                message: message.textContent,
                metadata: {
                    notificationKind: kind,
                    recipientEmail: recipient.email,
                },
            },
        });
    }
}
