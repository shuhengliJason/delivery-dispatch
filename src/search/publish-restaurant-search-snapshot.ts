import 'dotenv/config';

import {
    disconnectRestaurantSearchProducer,
    publishRestaurantSearchEvent,
} from './restaurant-search-events';
import { getAllRestaurantIds } from './restaurant-search-repository';

/**
 * Backfill command for rebuilding the autocomplete index from existing data.
 *
 * Instead of writing directly to OpenSearch, this publishes the same
 * `restaurant.changed` events the app emits after edits. That keeps the
 * snapshot path and the live-update path using the same Kafka processor.
 */
async function run(): Promise<void> {
    const restaurantIds = await getAllRestaurantIds();

    for (const restaurantId of restaurantIds) {
        // One event per restaurant lets Kafka spread the work across partitions.
        await publishRestaurantSearchEvent({
            restaurantId,
            type: 'restaurant.changed',
        });
    }

    await disconnectRestaurantSearchProducer();

    console.info('Published restaurant search snapshot events', {
        count: restaurantIds.length,
    });
}

run().catch(async (error: unknown) => {
    console.error('Could not publish restaurant search snapshot', error);
    await disconnectRestaurantSearchProducer();
    process.exit(1);
});
