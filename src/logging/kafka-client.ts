import {
    Kafka,
    logLevel,
    type Consumer,
    type Producer,
} from 'kafkajs';

import { type LogEvent } from './log-event';

let producerPromise: Promise<Producer> | undefined;

export function getKafkaBrokers(): string[] {
    return (process.env.KAFKA_BROKERS ?? 'localhost:9092')
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean);
}

export function getLogsTopic(): string {
    return process.env.LOGS_KAFKA_TOPIC ?? 'app.logs';
}

export function createKafkaClient(clientId: string): Kafka {
    return new Kafka({
        brokers: getKafkaBrokers(),
        clientId,
        logLevel: logLevel.WARN,
    });
}

export async function createLogConsumer(groupId = 'delivery-dispatch-log-indexer'): Promise<Consumer> {
    const consumer = createKafkaClient('delivery-dispatch-log-consumer').consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({
        fromBeginning: true,
        topic: getLogsTopic(),
    });

    return consumer;
}

async function getLogProducer(): Promise<Producer> {
    if (!producerPromise) {
        producerPromise = (async () => {
            const producer = createKafkaClient('delivery-dispatch-log-producer').producer();
            await producer.connect();

            return producer;
        })();
    }

    return producerPromise;
}

export async function publishLogEvent(event: LogEvent): Promise<void> {
    const producer = await getLogProducer();

    await producer.send({
        messages: [
            {
                key: event.context?.requestId?.toString() ?? event.context?.traceId?.toString(),
                value: JSON.stringify(event),
            },
        ],
        topic: getLogsTopic(),
    });
}

export async function disconnectLogProducer(): Promise<void> {
    const producer = await producerPromise;

    if (producer) {
        await producer.disconnect();
    }

    producerPromise = undefined;
}
