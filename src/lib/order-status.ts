export const ORDER_STATUSES = [
    'created',
    'confirmed',
    'preparing',
    'ready_for_pickup',
    'assigned',
    'accepted_by_driver',
    'picked_up',
    'on_the_way',
    'delivered',
    'cancelled',
] as const;

export type OrderStatus = typeof ORDER_STATUSES[number];

export const orderStatusTransitions: Record<OrderStatus, OrderStatus[]> = {
    created: [
        'confirmed',
        'cancelled',
    ],
    confirmed: [
        'preparing',
        'cancelled',
    ],
    preparing: [
        'ready_for_pickup',
        'cancelled',
    ],
    ready_for_pickup: [
        'assigned',
        'cancelled',
    ],
    assigned: [
        'accepted_by_driver',
        'cancelled',
    ],
    accepted_by_driver: [
        'picked_up',
        'cancelled',
    ],
    picked_up: [
        'on_the_way',
        'cancelled',
    ],
    on_the_way: [
        'delivered',
        'cancelled',
    ],
    delivered: [],
    cancelled: [],
};

export function canTransitionOrderStatus(
    currentStatus: OrderStatus,
    nextStatus: OrderStatus,
): boolean {
    return orderStatusTransitions[currentStatus].includes(nextStatus);
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
    return [
        'delivered',
        'cancelled',
    ].includes(status);
}

export function isActiveOrderStatus(status: OrderStatus): boolean {
    return !isTerminalOrderStatus(status);
}