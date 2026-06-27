import {
    buildLogEvent,
    type BuildLogEventInput,
    type LogEvent,
} from './log-event';
import { publishLogEvent } from './kafka-client';

function writeToConsole(event: LogEvent): void {
    const line = JSON.stringify(event);

    if (event.level === 'error') {
        console.error(line);
        return;
    }

    if (event.level === 'warn') {
        console.warn(line);
        return;
    }

    console.info(line);
}

export async function emitLogEvent(input: BuildLogEventInput): Promise<LogEvent> {
    const event = buildLogEvent(input);

    writeToConsole(event);

    if (process.env.LOG_TO_KAFKA === '1') {
        await publishLogEvent(event);
    }

    return event;
}
