import {
    type Consumer,
    type Producer,
} from 'kafkajs';

import { createKafkaClient } from '@/logging/kafka-client';

import { type RestaurantSearchEvent } from './restaurant-search-types';

let producerPromise: Promise<Producer> | undefined;

/**
 * Kafka topic used by both live restaurant updates and search analytics events.
 */
export function getRestaurantSearchTopic(): string {
    return process.env.RESTAURANT_SEARCH_KAFKA_TOPIC ?? 'restaurant.search.events';
}

/**
 * Lazily creates a Kafka producer and reuses it for this process.
 */
async function getProducer(): Promise<Producer> {
    if (!producerPromise) {
        producerPromise = (async () => {
            const producer = createKafkaClient('delivery-dispatch-restaurant-search-producer').producer();
            await producer.connect();

            return producer;
        })();
    }

    return producerPromise;
}

/**
 * Publishes one autocomplete pipeline event into Kafka.
 *
 * `restaurant.changed` events drive OpenSearch indexing. `search.performed`
 * events are useful for observing hot prefixes and future ranking work.
 */
export async function publishRestaurantSearchEvent(
    event: RestaurantSearchEvent,
): Promise<void> {
    const producer = await getProducer();

    await producer.send({
        messages: [
            {
                key: event.type === 'restaurant.changed' ? event.restaurantId : event.prefix,
                value: JSON.stringify(event),
            },
        ],
        topic: getRestaurantSearchTopic(),
    });
}

/**
 * Closes the shared Kafka producer, mostly used by one-shot scripts.
 */
export async function disconnectRestaurantSearchProducer(): Promise<void> {
    const producer = await producerPromise;

    if (producer) {
        await producer.disconnect();
    }

    producerPromise = undefined;
}

/**
 * Creates the Kafka consumer used by the restaurant search indexer worker.
 */
export async function createRestaurantSearchConsumer(
    groupId = 'delivery-dispatch-restaurant-search-indexer',
): Promise<Consumer> {
    const consumer = createKafkaClient('delivery-dispatch-restaurant-search-consumer').consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({
        fromBeginning: true,
        topic: getRestaurantSearchTopic(),
    });

    return consumer;
}

/**
 * Validates and normalizes raw Kafka message values into typed events.
 *
 * Invalid messages return `null` so the worker can skip them without crashing.
 */
export function parseRestaurantSearchEvent(value: Buffer | string | null): RestaurantSearchEvent | null {
    if (!value) {
        return null;
    }

    try {
        const parsed = JSON.parse(value.toString()) as Partial<RestaurantSearchEvent>;

        if (parsed.type === 'restaurant.changed' && typeof parsed.restaurantId === 'string') {
            return {
                restaurantId: parsed.restaurantId,
                type: 'restaurant.changed',
            };
        }

        if (parsed.type === 'search.performed'
            && typeof parsed.prefix === 'string'
            && typeof parsed.limit === 'number'
            && typeof parsed.resultCount === 'number'
            && typeof parsed.source === 'string'
        ) {
            return {
                limit: parsed.limit,
                prefix: parsed.prefix,
                resultCount: parsed.resultCount,
                source: parsed.source,
                type: 'search.performed',
            };
        }

        return null;
    } catch {
        return null;
    }
}
