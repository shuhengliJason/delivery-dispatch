import {
    PaymentStatus,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { markOrderPaidFromCheckoutSession } from '@/lib/order-payment';
import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function markOrderPaymentFailed(session: Stripe.Checkout.Session): Promise<void> {
    const orderId = session.metadata?.orderId;

    await prisma.order.updateMany({
        where: {
            paymentStatus: PaymentStatus.PENDING,
            OR: [
                {
                    stripeCheckoutSessionId: session.id,
                },
                ...(orderId
                    ? [
                        {
                            id: orderId,
                        },
                    ]
                    : []),
            ],
        },
        data: {
            paymentStatus: PaymentStatus.FAILED,
        },
    });
}

export async function POST(request: Request) {
    const signature = request.headers.get('stripe-signature');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
        return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 500 });
    }

    const body = await request.text();
    let event: Stripe.Event;

    try {
        event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid Stripe webhook signature.';
        return NextResponse.json({ error: message }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed'
        || event.type === 'checkout.session.async_payment_succeeded'
    ) {
        await markOrderPaidFromCheckoutSession(event.data.object as Stripe.Checkout.Session);
    }

    if (event.type === 'checkout.session.expired'
        || event.type === 'checkout.session.async_payment_failed'
    ) {
        await markOrderPaymentFailed(event.data.object as Stripe.Checkout.Session);
    }

    return NextResponse.json({ received: true });
}
