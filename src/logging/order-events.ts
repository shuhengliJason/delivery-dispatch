import { emitLogEvent } from './app-logger';
import { type BuildLogEventInput } from './log-event';

type OrderCheckoutLogDetails = {
    customerId: string;
    itemCount: number;
    orderId: string;
    orderNumber: number;
    paymentStatus: string;
    restaurantId: string;
    status: string;
    totalCents: number;
};

function getOrderCheckoutContext(details: OrderCheckoutLogDetails) {
    return {
        customerId: details.customerId,
        itemCount: details.itemCount,
        orderId: details.orderId,
        orderNumber: details.orderNumber,
        paymentStatus: details.paymentStatus,
        restaurantId: details.restaurantId,
        status: details.status,
        totalCents: details.totalCents,
    };
}

export function buildOrderCheckoutStartedLogInput(
    details: OrderCheckoutLogDetails,
): BuildLogEventInput {
    return {
        context: {
            ...getOrderCheckoutContext(details),
            eventName: 'order.checkout_started',
        },
        level: 'info',
        message: 'Order checkout started',
        source: 'orders-api',
    };
}

export function buildOrderCheckoutStartFailedLogInput(
    details: OrderCheckoutLogDetails,
    error: unknown,
): BuildLogEventInput {
    return {
        context: {
            ...getOrderCheckoutContext(details),
            errorName: error instanceof Error ? error.name : typeof error,
            eventName: 'order.checkout_start_failed',
        },
        level: 'error',
        message: 'Order checkout start failed',
        source: 'orders-api',
    };
}

export function logOrderCheckoutStarted(details: OrderCheckoutLogDetails): Promise<void> {
    return emitLogEvent(buildOrderCheckoutStartedLogInput(details)).then(() => undefined);
}

export function logOrderCheckoutStartFailed(
    details: OrderCheckoutLogDetails,
    error: unknown,
): Promise<void> {
    return emitLogEvent(buildOrderCheckoutStartFailedLogInput(details, error)).then(() => undefined);
}
