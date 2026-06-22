import { describe, expect, it } from 'vitest';

import {
    canTransitionOrderStatus,
    isActiveOrderStatus,
    isTerminalOrderStatus,
} from './order-status';

describe('order status state machine', () => {
    it('allows valid transitions', () => {
        expect(canTransitionOrderStatus('created', 'confirmed')).toBe(true);
        expect(canTransitionOrderStatus('confirmed', 'preparing')).toBe(true);
        expect(canTransitionOrderStatus('on_the_way', 'delivered')).toBe(true);
    });

    it('blocks invalid transitions', () => {
        expect(canTransitionOrderStatus('created', 'delivered')).toBe(false);
        expect(canTransitionOrderStatus('delivered', 'preparing')).toBe(false);
        expect(canTransitionOrderStatus('cancelled', 'confirmed')).toBe(false);
    });

    it('identifies terminal statuses', () => {
        expect(isTerminalOrderStatus('delivered')).toBe(true);
        expect(isTerminalOrderStatus('cancelled')).toBe(true);
        expect(isTerminalOrderStatus('preparing')).toBe(false);
    });

    it('identifies active statuses', () => {
        expect(isActiveOrderStatus('created')).toBe(true);
        expect(isActiveOrderStatus('on_the_way')).toBe(true);
        expect(isActiveOrderStatus('delivered')).toBe(false);
    });
});
