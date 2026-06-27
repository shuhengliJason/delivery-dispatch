import { randomUUID } from 'node:crypto';

import { disconnectLogProducer, publishLogEvent } from './kafka-client';
import { buildLogEvent } from './log-event';

async function run(): Promise<void> {
    const event = buildLogEvent({
        context: {
            authorization: 'Bearer this-will-be-redacted',
            orderId: `order_${randomUUID()}`,
            requestId: `req_${randomUUID()}`,
            route: '/api/dispatcher/orders',
            serviceArea: 'demo',
        },
        level: 'info',
        message: 'Sample delivery-dispatch log event',
        source: 'sample-script',
    });

    await publishLogEvent(event);
    await disconnectLogProducer();

    console.info('Published sample log event to Kafka', {
        requestId: event.context?.requestId,
        topic: process.env.LOGS_KAFKA_TOPIC ?? 'app.logs',
    });
}

run().catch(async (error: unknown) => {
    console.error('Could not publish sample log event', error);
    await disconnectLogProducer();
    process.exit(1);
});
