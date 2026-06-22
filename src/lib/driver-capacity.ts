import { DriverStatus, OrderStatus } from '@prisma/client';

export const maxActiveDriverDeliveries = 3;

export const activeDriverOrderStatuses: OrderStatus[] = [
    OrderStatus.ASSIGNED,
    OrderStatus.ACCEPTED_BY_DRIVER,
    OrderStatus.PICKED_UP,
    OrderStatus.ON_THE_WAY,
];

export function canDriverAcceptMoreDeliveries(input: {
    status: DriverStatus;
    activeDeliveryCount: number;
}): boolean {
    return input.status !== DriverStatus.OFFLINE
        && input.activeDeliveryCount < maxActiveDriverDeliveries;
}

export function getDriverCapacityLabel(activeDeliveryCount: number): string {
    return `${activeDeliveryCount}/${maxActiveDriverDeliveries}`;
}
