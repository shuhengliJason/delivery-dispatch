import { createLogConsumer, getLogsTopic } from './kafka-client';
import { parseLogEvent } from './log-event';
import { indexLogEvent } from './opensearch-client';

async function run(): Promise<void> {
    const consumer = await createLogConsumer();

    console.info(`Consuming Kafka topic "${getLogsTopic()}" and indexing logs into OpenSearch.`);

    const shutdown = async (): Promise<void> => {
        console.info('Stopping log consumer.');
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
            const event = parseLogEvent(message.value?.toString() ?? null);

            if (!event) {
                console.warn('Skipped invalid log event.');
                return;
            }

            await indexLogEvent(event);

            console.info('Indexed log event', {
                level: event.level,
                message: event.message,
                service: event.service,
                timestamp: event.timestamp,
            });
        },
    });
}

run().catch((error: unknown) => {
    console.error('Log consumer failed', error);
    process.exit(1);
});
