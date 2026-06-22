import {
    DriverStatus,
    OrderStatus,
    PaymentStatus,
    TimelineEventType,
} from '@prisma/client';
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
            upsert: vi.fn(),
        },
        deliveryAssignment: {
            create: vi.fn(),
        },
        driverProfile: {
            update: vi.fn(),
        },
        order: {
            update: vi.fn(),
        },
        orderTimelineEvent: {
            create: vi.fn(),
        },
    };

    return {
        prisma: {
            $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => {
                return callback(tx);
            }),
            driverProfile: {
                findMany: vi.fn(),
            },
            order: {
                findUnique: vi.fn(),
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

describe('assignBestDriverToReadyOrder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('assigns the lowest-load eligible driver to a ready paid order', async () => {
        const { assignBestDriverToReadyOrder } = await import('./driver-assignment');
        mockDb.prisma.order.findUnique.mockResolvedValue({
            assignments: [],
            id: 'order_1',
            paymentStatus: PaymentStatus.PAID,
            status: OrderStatus.READY_FOR_PICKUP,
        });
        mockDb.prisma.driverProfile.findMany.mockResolvedValue([
            {
                activeDeliveryCount: 2,
                assignments: [
                    { id: 'assignment_a' },
                    { id: 'assignment_b' },
                ],
                id: 'driver_busy',
                status: DriverStatus.BUSY,
                user: {
                    name: 'Busy Driver',
                },
            },
            {
                activeDeliveryCount: 0,
                assignments: [],
                id: 'driver_available',
                status: DriverStatus.AVAILABLE,
                user: {
                    name: 'Available Driver',
                },
            },
        ]);
        mockDb.tx.deliveryAssignment.create.mockResolvedValue({
            driverId: 'driver_available',
            id: 'assignment_1',
            orderId: 'order_1',
        });

        const result = await assignBestDriverToReadyOrder('order_1');

        expect(result).toEqual({
            assigned: true,
            assignmentId: 'assignment_1',
            driverId: 'driver_available',
        });
        expect(mockDb.tx.order.update).toHaveBeenCalledWith({
            where: {
                id: 'order_1',
            },
            data: {
                status: OrderStatus.ASSIGNED,
            },
        });
        expect(mockDb.tx.orderTimelineEvent.create).toHaveBeenCalledWith({
            data: {
                message: 'Available Driver was automatically assigned to this order.',
                metadata: {
                    assignmentSource: 'background_dispatch',
                },
                orderId: 'order_1',
                title: 'Driver assigned',
                type: TimelineEventType.DRIVER_ASSIGNED,
            },
        });
        expect(mockDb.tx.backgroundJob.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                idempotencyKey: 'notify:DRIVER_ASSIGNED:order_1:derived',
            },
        }));
    });

    it('returns no_available_driver when every driver is offline or at capacity', async () => {
        const { assignBestDriverToReadyOrder } = await import('./driver-assignment');
        mockDb.prisma.order.findUnique.mockResolvedValue({
            assignments: [],
            id: 'order_1',
            paymentStatus: PaymentStatus.PAID,
            status: OrderStatus.READY_FOR_PICKUP,
        });
        mockDb.prisma.driverProfile.findMany.mockResolvedValue([
            {
                activeDeliveryCount: 0,
                assignments: [],
                id: 'driver_offline',
                status: DriverStatus.OFFLINE,
                user: {
                    name: 'Offline Driver',
                },
            },
            {
                activeDeliveryCount: 3,
                assignments: [
                    { id: 'a' },
                    { id: 'b' },
                    { id: 'c' },
                ],
                id: 'driver_full',
                status: DriverStatus.BUSY,
                user: {
                    name: 'Full Driver',
                },
            },
        ]);

        const result = await assignBestDriverToReadyOrder('order_1');

        expect(result).toEqual({
            assigned: false,
            reason: 'NO_AVAILABLE_DRIVER',
        });
        expect(mockDb.prisma.$transaction).not.toHaveBeenCalled();
    });
});
