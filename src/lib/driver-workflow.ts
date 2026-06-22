import {
    OrderStatus,
    TimelineEventType,
} from '@prisma/client';

export function getDriverNextStatus(
    status: OrderStatus,
    readyForPickupAt?: Date | null,
): OrderStatus | null {
    if (status === OrderStatus.READY_FOR_PICKUP) {
        return OrderStatus.PICKED_UP;
    }

    if (status === OrderStatus.ASSIGNED) {
        if (readyForPickupAt) {
            return OrderStatus.PICKED_UP;
        }

        return OrderStatus.ACCEPTED_BY_DRIVER;
    }

    if (status === OrderStatus.ACCEPTED_BY_DRIVER) {
        if (!readyForPickupAt) {
            return null;
        }

        return OrderStatus.PICKED_UP;
    }

    if (status === OrderStatus.PICKED_UP) {
        return OrderStatus.ON_THE_WAY;
    }

    if (status === OrderStatus.ON_THE_WAY) {
        return OrderStatus.DELIVERED;
    }

    return null;
}

export function getDriverStatusLabel(status: OrderStatus): string {
    if (status === OrderStatus.ACCEPTED_BY_DRIVER) {
        return 'Accept delivery';
    }

    if (status === OrderStatus.PICKED_UP) {
        return 'Mark picked up';
    }

    if (status === OrderStatus.ON_THE_WAY) {
        return 'Start delivery';
    }

    if (status === OrderStatus.DELIVERED) {
        return 'Mark delivered';
    }

    return 'Update delivery';
}

export function getDriverTimelineEventForStatus(status: OrderStatus): {
    type: TimelineEventType;
    title: string;
    message: string;
} | null {
    if (status === OrderStatus.ACCEPTED_BY_DRIVER) {
        return {
            type: TimelineEventType.DRIVER_ACCEPTED,
            title: 'Driver accepted',
            message: 'Driver accepted the delivery.',
        };
    }

    if (status === OrderStatus.PICKED_UP) {
        return {
            type: TimelineEventType.ORDER_PICKED_UP,
            title: 'Order picked up',
            message: 'Driver picked up the order.',
        };
    }

    if (status === OrderStatus.ON_THE_WAY) {
        return {
            type: TimelineEventType.ORDER_ON_THE_WAY,
            title: 'Order on the way',
            message: 'Driver is heading to the customer.',
        };
    }

    if (status === OrderStatus.DELIVERED) {
        return {
            type: TimelineEventType.ORDER_DELIVERED,
            title: 'Order delivered',
            message: 'Driver completed the delivery.',
        };
    }

    return null;
}
