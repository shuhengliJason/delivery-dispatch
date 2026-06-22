import {
    DelayStatus,
    OrderStatus,
} from '@prisma/client';

export const atRiskWindowMinutes = 10;

type DelayStatusForEtaInput = {
    estimatedDeliveryAt: Date;
    now?: Date;
    status: OrderStatus;
};

export function getDelayStatusForEta({
    estimatedDeliveryAt,
    now = new Date(),
    status,
}: DelayStatusForEtaInput): DelayStatus {
    if (status === OrderStatus.DELIVERED || status === OrderStatus.CANCELLED) {
        return DelayStatus.RESOLVED;
    }

    const minutesUntilEta = (estimatedDeliveryAt.getTime() - now.getTime()) / 60000;

    if (minutesUntilEta < 0) {
        return DelayStatus.DELAYED;
    }

    if (minutesUntilEta <= atRiskWindowMinutes) {
        return DelayStatus.AT_RISK;
    }

    return DelayStatus.NONE;
}
