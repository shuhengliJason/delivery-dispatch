import {
    DelayStatus,
    OrderStatus,
    TimelineEventType,
} from '@prisma/client';

import { getDelayStatusForEta } from '@/lib/delay-rules';

export function getOperationalDelayStatus(
    status: OrderStatus,
    estimatedDeliveryAt: Date,
    now = new Date(),
): DelayStatus {
    return getDelayStatusForEta({
        estimatedDeliveryAt,
        now,
        status,
    });
}

export function getVendorNextStatuses(status: OrderStatus): OrderStatus[] {
    if (status === OrderStatus.CREATED) {
        return [
            OrderStatus.CONFIRMED,
            OrderStatus.CANCELLED,
        ];
    }

    if (status === OrderStatus.CONFIRMED) {
        return [
            OrderStatus.PREPARING,
            OrderStatus.CANCELLED,
        ];
    }

    if (status === OrderStatus.PREPARING) {
        return [
            OrderStatus.READY_FOR_PICKUP,
            OrderStatus.CANCELLED,
        ];
    }

    if (status === OrderStatus.READY_FOR_PICKUP) {
        return [
            OrderStatus.CANCELLED,
        ];
    }

    return [];
}

export function canVendorAdjustEta(status: OrderStatus): boolean {
    return status === OrderStatus.CREATED
        || status === OrderStatus.CONFIRMED
        || status === OrderStatus.PREPARING;
}

export function getTimelineEventForStatus(status: OrderStatus): {
    type: TimelineEventType;
    title: string;
    message: string;
} | null {
    if (status === OrderStatus.CONFIRMED) {
        return {
            type: TimelineEventType.ORDER_CONFIRMED,
            title: 'Order confirmed',
            message: 'Restaurant confirmed the order.',
        };
    }

    if (status === OrderStatus.PREPARING) {
        return {
            type: TimelineEventType.PREPARATION_STARTED,
            title: 'Preparation started',
            message: 'Restaurant started preparing the order.',
        };
    }

    if (status === OrderStatus.READY_FOR_PICKUP) {
        return {
            type: TimelineEventType.READY_FOR_PICKUP,
            title: 'Ready for pickup',
            message: 'Restaurant marked the order ready for pickup.',
        };
    }

    if (status === OrderStatus.CANCELLED) {
        return {
            type: TimelineEventType.ORDER_CANCELLED,
            title: 'Order cancelled',
            message: 'Restaurant cancelled the order.',
        };
    }

    return null;
}
