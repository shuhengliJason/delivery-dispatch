import { describe, expect, it } from 'vitest';

import {
    buildOrderCheckoutStartFailedLogInput,
    buildOrderCheckoutStartedLogInput,
} from './order-events';

const orderDetails = {
    customerId: 'customer_123',
    itemCount: 3,
    orderId: 'order_123',
    orderNumber: 42,
    paymentStatus: 'PENDING',
    restaurantId: 'restaurant_123',
    status: 'CREATED',
    totalCents: 2599,
};

describe('order log events', () => {
    it('builds a safe order checkout started log', () => {
        expect(buildOrderCheckoutStartedLogInput(orderDetails)).toEqual({
            context: {
                customerId: 'customer_123',
                eventName: 'order.checkout_started',
                itemCount: 3,
                orderId: 'order_123',
                orderNumber: 42,
                paymentStatus: 'PENDING',
                restaurantId: 'restaurant_123',
                status: 'CREATED',
                totalCents: 2599,
            },
            level: 'info',
            message: 'Order checkout started',
            source: 'orders-api',
        });
    });

    it('does not include address, email, Stripe session, or raw error details', () => {
        const input = buildOrderCheckoutStartFailedLogInput(
            orderDetails,
            new Error('Stripe API key sk_test_private failed'),
        );
        const serialized = JSON.stringify(input);

        expect(input.context).toMatchObject({
            errorName: 'Error',
            eventName: 'order.checkout_start_failed',
        });
        expect(serialized).not.toContain('address');
        expect(serialized).not.toContain('email');
        expect(serialized).not.toContain('session');
        expect(serialized).not.toContain('sk_test_private');
    });
});
