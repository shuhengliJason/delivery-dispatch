import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';

import {
    getConfiguredBrokerList,
    getConfiguredServiceUrl,
} from './runtime-service-config';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('runtime service config', () => {
    it('requires service URLs to be explicitly configured', () => {
        delete process.env.REDIS_URL;

        expect(getConfiguredServiceUrl('REDIS_URL')).toBeNull();
    });

    it('allows localhost services outside Vercel for Docker Compose development', () => {
        delete process.env.VERCEL;
        process.env.OPENSEARCH_URL = 'http://localhost:9200';
        process.env.KAFKA_BROKERS = 'localhost:9092';

        expect(getConfiguredServiceUrl('OPENSEARCH_URL')).toBe('http://localhost:9200');
        expect(getConfiguredBrokerList('KAFKA_BROKERS')).toEqual(['localhost:9092']);
    });

    it('ignores local Docker services on Vercel so routes can use fallbacks', () => {
        process.env.VERCEL = '1';
        process.env.OPENSEARCH_URL = 'http://localhost:9200';
        process.env.REDIS_URL = 'redis://redis:6379';
        process.env.KAFKA_BROKERS = 'localhost:9092,kafka:29092,broker.example.com:9092';

        expect(getConfiguredServiceUrl('OPENSEARCH_URL')).toBeNull();
        expect(getConfiguredServiceUrl('REDIS_URL')).toBeNull();
        expect(getConfiguredBrokerList('KAFKA_BROKERS')).toEqual(['broker.example.com:9092']);
    });
});
