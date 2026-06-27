import { describe, expect, it } from 'vitest';

import {
    buildLogEvent,
    getLogIndexName,
    sanitizeLogEvent,
} from './log-event';

describe('log event helpers', () => {
    it('redacts sensitive context fields recursively', () => {
        const event = sanitizeLogEvent({
            context: {
                authorization: 'Bearer secret-token',
                nested: {
                    apiKey: 'abc123',
                    ok: 'visible',
                },
                password: 'demo1234',
                userId: 'user_123',
            },
            level: 'info',
            message: 'User signed in',
            service: 'delivery-dispatch',
            timestamp: '2026-06-25T12:30:15.000Z',
        });

        expect(event.context).toEqual({
            authorization: '[REDACTED]',
            nested: {
                apiKey: '[REDACTED]',
                ok: 'visible',
            },
            password: '[REDACTED]',
            userId: 'user_123',
        });
    });

    it('builds a normalized log event', () => {
        expect(buildLogEvent({
            context: {
                orderId: 'order_123',
                token: 'private',
            },
            level: 'error',
            message: 'Checkout failed',
        }, new Date('2026-06-25T12:30:15.000Z'))).toEqual({
            context: {
                orderId: 'order_123',
                token: '[REDACTED]',
            },
            level: 'error',
            message: 'Checkout failed',
            service: 'delivery-dispatch',
            source: 'app',
            timestamp: '2026-06-25T12:30:15.000Z',
        });
    });

    it('uses a daily OpenSearch index name', () => {
        expect(getLogIndexName('2026-06-25T23:59:59.000Z')).toBe('app-logs-2026.06.25');
    });
});
