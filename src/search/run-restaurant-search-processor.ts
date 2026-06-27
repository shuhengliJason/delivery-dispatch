import 'dotenv/config';

import {
    createRestaurantSearchConsumer,
    getRestaurantSearchTopic,
    parseRestaurantSearchEvent,
} from './restaurant-search-events';
import { getRestaurantSearchDocumentById } from './restaurant-search-repository';
import { indexRestaurantSearchDocument } from './opensearch-restaurants';

/**
 * Long-running worker for the autocomplete indexing pipeline.
 *
 * Kafka is the buffer between app/database changes and OpenSearch. This worker
 * consumes those Kafka events, turns changed restaurant IDs into search
 * documents, and writes them into the OpenSearch autocomplete index.
 */
async function run(): Promise<void> {
    const consumer = await createRestaurantSearchConsumer();

    console.info(`Consuming Kafka topic "${getRestaurantSearchTopic()}" and indexing restaurant suggestions.`);

    /**
     * Disconnect cleanly when the terminal or container stops the worker.
     * This avoids leaving the Kafka consumer group in a messy state.
     */
    const shutdown = async (): Promise<void> => {
        console.info('Stopping restaurant search processor.');
        await consumer.disconnect();
        process.exit(0);
    };

    process.on('SIGINT', () => {
        void shutdown();
    });
    process.on('SIGTERM', () => {
        void shutdown();
    });

    await consumer.run({
        eachMessage: async ({ message }) => {
            // Every Kafka message should be one restaurant-search event.
            const event = parseRestaurantSearchEvent(message.value?.toString() ?? null);

            if (!event) {
                console.warn('Skipped invalid restaurant search event.');
                return;
            }

            // Search events are useful analytics, but they do not change the index.
            if (event.type === 'search.performed') {
                console.info('Observed autocomplete search', event);
                return;
            }

            // For a restaurant change, Postgres remains the source of truth.
            // The event only tells us which restaurant needs to be re-indexed.
            const document = await getRestaurantSearchDocumentById(event.restaurantId);

            if (!document) {
                console.warn('Restaurant not found for search indexing', {
                    restaurantId: event.restaurantId,
                });
                return;
            }

            // OpenSearch receives the denormalized document used by autocomplete.
            await indexRestaurantSearchDocument(document);

            console.info('Indexed restaurant suggestion', {
                restaurantId: document.id,
                restaurantName: document.name,
            });
        },
    });
}

run().catch((error: unknown) => {
    console.error('Restaurant search processor failed', error);
    process.exit(1);
});
