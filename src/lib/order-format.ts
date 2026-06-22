import {
    DelayStatus,
    OrderStatus,
} from '@prisma/client';

export function formatCurrency(cents: number): string {
    return new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
    }).format(cents / 100);
}

export function formatStatus(status: OrderStatus | DelayStatus): string {
    return status
        .toLowerCase()
        .split('_')
        .map((word) => {
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

export function formatTime(date: Date | string): string {
    return new Intl.DateTimeFormat('en-CA', {
        hour: 'numeric',
        minute: '2-digit',
    }).format(new Date(date));
}

export function getStatusClass(status: OrderStatus): string {
    if (status === OrderStatus.READY_FOR_PICKUP) {
        return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    }

    if (status === OrderStatus.ASSIGNED || status === OrderStatus.ACCEPTED_BY_DRIVER) {
        return 'bg-purple-50 text-purple-700 ring-purple-600/20';
    }

    if (status === OrderStatus.PICKED_UP || status === OrderStatus.ON_THE_WAY) {
        return 'bg-green-50 text-green-700 ring-green-600/20';
    }

    if (status === OrderStatus.CANCELLED) {
        return 'bg-red-50 text-red-700 ring-red-600/20';
    }

    if (status === OrderStatus.DELIVERED) {
        return 'bg-gray-50 text-gray-700 ring-gray-600/20';
    }

    return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
}

export function getDelayClass(delayStatus: DelayStatus): string {
    if (delayStatus === DelayStatus.DELAYED) {
        return 'bg-red-50 text-red-700 ring-red-600/20';
    }

    if (delayStatus === DelayStatus.AT_RISK) {
        return 'bg-orange-50 text-orange-700 ring-orange-600/20';
    }

    if (delayStatus === DelayStatus.RESOLVED) {
        return 'bg-green-50 text-green-700 ring-green-600/20';
    }

    return 'bg-gray-50 text-gray-600 ring-gray-600/20';
}
