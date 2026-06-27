export const logLevels = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof logLevels)[number];

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type LogEvent = {
    context?: Record<string, JsonValue>;
    level: LogLevel;
    message: string;
    service: string;
    source?: string;
    timestamp: string;
};

export type BuildLogEventInput = {
    context?: Record<string, JsonValue>;
    level: LogLevel;
    message: string;
    service?: string;
    source?: string;
};

const sensitiveKeyFragments = [
    'apikey',
    'authorization',
    'cookie',
    'password',
    'secret',
    'session',
    'token',
];

function isRecord(value: unknown): value is Record<string, JsonValue> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');

    return sensitiveKeyFragments.some((fragment) => normalized.includes(fragment));
}

function redactJsonValue(value: JsonValue, key?: string): JsonValue {
    if (key && isSensitiveKey(key)) {
        return '[REDACTED]';
    }

    if (Array.isArray(value)) {
        return value.map((item) => redactJsonValue(item));
    }

    if (isRecord(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([entryKey, entryValue]) => [
                entryKey,
                redactJsonValue(entryValue, entryKey),
            ]),
        );
    }

    return value;
}

function normalizeLevel(level: unknown): LogLevel {
    return logLevels.includes(level as LogLevel) ? level as LogLevel : 'info';
}

export function sanitizeLogEvent(event: LogEvent): LogEvent {
    return {
        ...event,
        context: event.context ? redactJsonValue(event.context) as Record<string, JsonValue> : undefined,
        level: normalizeLevel(event.level),
        message: String(event.message).slice(0, 5000),
        service: String(event.service || 'delivery-dispatch').slice(0, 200),
        source: event.source ? String(event.source).slice(0, 200) : undefined,
        timestamp: Number.isNaN(Date.parse(event.timestamp))
            ? new Date().toISOString()
            : new Date(event.timestamp).toISOString(),
    };
}

export function buildLogEvent(
    input: BuildLogEventInput,
    now = new Date(),
): LogEvent {
    return sanitizeLogEvent({
        context: input.context,
        level: input.level,
        message: input.message,
        service: input.service ?? 'delivery-dispatch',
        source: input.source ?? 'app',
        timestamp: now.toISOString(),
    });
}

export function getLogIndexName(timestamp: string): string {
    const date = Number.isNaN(Date.parse(timestamp)) ? new Date() : new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    return `app-logs-${year}.${month}.${day}`;
}

export function parseLogEvent(value: Buffer | string | null): LogEvent | null {
    if (!value) {
        return null;
    }

    try {
        const parsed = JSON.parse(value.toString()) as Partial<LogEvent>;

        if (!parsed.message || !parsed.timestamp) {
            return null;
        }

        return sanitizeLogEvent({
            context: isRecord(parsed.context) ? parsed.context : undefined,
            level: normalizeLevel(parsed.level),
            message: parsed.message,
            service: parsed.service ?? 'delivery-dispatch',
            source: parsed.source,
            timestamp: parsed.timestamp,
        });
    } catch {
        return null;
    }
}
