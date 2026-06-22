import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
        throw new Error('Stripe is not configured. Add STRIPE_SECRET_KEY to .env.');
    }

    stripeClient ??= new Stripe(secretKey);

    return stripeClient;
}

export function getAppUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL
        ?? process.env.BETTER_AUTH_URL
        ?? 'http://localhost:3000';
}
