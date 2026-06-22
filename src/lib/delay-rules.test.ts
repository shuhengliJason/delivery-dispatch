import {
    DelayStatus,
    OrderStatus,
} from '@prisma/client';
import {
    describe,
    expect,
    it,
} from 'vitest';

import {
    atRiskWindowMinutes,
    getDelayStatusForEta,
} from './delay-rules';

const now = new Date('2026-01-01T12:00:00.000Z');

function minutesFromNow(minutes: number): Date {
    return new Date(now.getTime() + minutes * 60 * 1000);
}

describe('delay rules', () => {
    it('resolves delivered and cancelled orders regardless of ETA', () => {
        expect(getDelayStatusForEta({
            estimatedDeliveryAt: minutesFromNow(-30),
            now,
            status: OrderStatus.DELIVERED,
        })).toBe(DelayStatus.RESOLVED);

        expect(getDelayStatusForEta({
            estimatedDeliveryAt: minutesFromNow(30),
            now,
            status: OrderStatus.CANCELLED,
        })).toBe(DelayStatus.RESOLVED);
    });

    it('marks active orders delayed only after the ETA has passed', () => {
        expect(getDelayStatusForEta({
            estimatedDeliveryAt: minutesFromNow(-1),
            now,
            status: OrderStatus.ON_THE_WAY,
        })).toBe(DelayStatus.DELAYED);

        expect(getDelayStatusForEta({
            estimatedDeliveryAt: minutesFromNow(0),
            now,
            status: OrderStatus.ON_THE_WAY,
        })).not.toBe(DelayStatus.DELAYED);
    });

    it('marks active orders at risk inside the ETA risk window', () => {
        expect(getDelayStatusForEta({
            estimatedDeliveryAt: minutesFromNow(atRiskWindowMinutes),
            now,
            status: OrderStatus.PREPARING,
        })).toBe(DelayStatus.AT_RISK);

        expect(getDelayStatusForEta({
            estimatedDeliveryAt: minutesFromNow(0),
            now,
            status: OrderStatus.PREPARING,
        })).toBe(DelayStatus.AT_RISK);
    });

    it('keeps active orders on track outside the ETA risk window', () => {
        expect(getDelayStatusForEta({
            estimatedDeliveryAt: minutesFromNow(atRiskWindowMinutes + 1),
            now,
            status: OrderStatus.CONFIRMED,
        })).toBe(DelayStatus.NONE);
    });

    it('uses the current time by default', () => {
        expect(getDelayStatusForEta({
            estimatedDeliveryAt: new Date(Date.now() - 60 * 1000),
            status: OrderStatus.ASSIGNED,
        })).toBe(DelayStatus.DELAYED);
    });
});
