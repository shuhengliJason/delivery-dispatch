import {
    PaymentStatus,
    TimelineEventType,
} from '@prisma/client';
import Stripe from 'stripe';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

const mockDb = vi.hoisted(() => {
    const tx = {
        backgroundJob: {
            upsert: vi.fn((input) => {
                return input;
            }),
        },
        order: {
            update: vi.fn((input) => {
                return input;
            }),
        },
        orderTimelineEvent: {
            create: vi.fn((input) => {
                return input;
            }),
        },
    };

    return {
        prisma: {
            $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => {
                return callback(tx);
            }),
            order: {
                findFirst: vi.fn(),
            },
        },
        tx,
    };
});

vi.mock('@/lib/prisma', () => {
    return {
        prisma: mockDb.prisma,
    };
});

function createCheckoutSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
    return {
        id: 'cs_test_paid',
        metadata: {
            orderId: 'order_123',
        },
        payment_intent: 'pi_test_123',
        payment_status: 'paid',
        ...overrides,
    } as Stripe.Checkout.Session;
}

describe('markOrderPaidFromCheckoutSession', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('marks a pending local order paid from a paid checkout session', async () => {
        const { markOrderPaidFromCheckoutSession } = await import('./order-payment');
        mockDb.prisma.order.findFirst.mockResolvedValue({
            estimatedDeliveryAt: new Date('2026-06-05T13:00:00.000Z'),
            id: 'order_123',
            paymentStatus: PaymentStatus.PENDING,
        });

        const result = await markOrderPaidFromCheckoutSession(createCheckoutSession());

        expect(result).toEqual({
            orderId: 'order_123',
            updated: true,
        });
        expect(mockDb.prisma.order.findFirst).toHaveBeenCalledWith({
            where: {
                OR: [
                    {
                        stripeCheckoutSessionId: 'cs_test_paid',
                    },
                    {
                        id: 'order_123',
                    },
                ],
            },
            select: {
                estimatedDeliveryAt: true,
                id: true,
                paymentStatus: true,
            },
        });
        expect(mockDb.tx.order.update).toHaveBeenCalledWith({
            where: {
                id: 'order_123',
            },
            data: expect.objectContaining({
                paidAt: expect.any(Date) as Date,
                paymentStatus: PaymentStatus.PAID,
                stripeCheckoutSessionId: 'cs_test_paid',
                stripePaymentIntentId: 'pi_test_123',
            }),
        });
        expect(mockDb.tx.orderTimelineEvent.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                orderId: 'order_123',
                title: 'Payment received',
                type: TimelineEventType.PAYMENT_RECEIVED,
            }),
        });
        expect(mockDb.tx.backgroundJob.upsert).toHaveBeenCalledTimes(3);
        expect(mockDb.prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('does not update when Stripe has not marked the checkout paid', async () => {
        const { markOrderPaidFromCheckoutSession } = await import('./order-payment');

        const result = await markOrderPaidFromCheckoutSession(createCheckoutSession({
            payment_status: 'unpaid',
        }));

        expect(result).toEqual({
            orderId: null,
            updated: false,
        });
        expect(mockDb.prisma.order.findFirst).not.toHaveBeenCalled();
        expect(mockDb.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not update when the checkout metadata conflicts with the expected order', async () => {
        const { markOrderPaidFromCheckoutSession } = await import('./order-payment');

        const result = await markOrderPaidFromCheckoutSession(
            createCheckoutSession(),
            {
                orderId: 'different_order',
            },
        );

        expect(result).toEqual({
            orderId: null,
            updated: false,
        });
        expect(mockDb.prisma.order.findFirst).not.toHaveBeenCalled();
    });

    it('limits customer success reconciliation to that customer orders', async () => {
        const { markOrderPaidFromCheckoutSession } = await import('./order-payment');
        mockDb.prisma.order.findFirst.mockResolvedValue({
            estimatedDeliveryAt: new Date('2026-06-05T13:00:00.000Z'),
            id: 'order_123',
            paymentStatus: PaymentStatus.PENDING,
        });

        await markOrderPaidFromCheckoutSession(
            createCheckoutSession(),
            {
                customerId: 'customer_123',
                orderId: 'order_123',
            },
        );

        expect(mockDb.prisma.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                customerId: 'customer_123',
                OR: [
                    {
                        stripeCheckoutSessionId: 'cs_test_paid',
                    },
                    {
                        id: 'order_123',
                    },
                ],
            }) as unknown,
        }));
    });

    it('does not duplicate payment timeline events for already-paid orders', async () => {
        const { markOrderPaidFromCheckoutSession } = await import('./order-payment');
        mockDb.prisma.order.findFirst.mockResolvedValue({
            id: 'order_123',
            paymentStatus: PaymentStatus.PAID,
        });

        const result = await markOrderPaidFromCheckoutSession(createCheckoutSession());

        expect(result).toEqual({
            orderId: 'order_123',
            updated: false,
        });
        expect(mockDb.tx.order.update).not.toHaveBeenCalled();
        expect(mockDb.tx.orderTimelineEvent.create).not.toHaveBeenCalled();
        expect(mockDb.prisma.$transaction).not.toHaveBeenCalled();
    });
});
