import {
    getLogIndexName,
    type LogEvent,
} from './log-event';

type FetchLike = typeof fetch;

export function getOpenSearchUrl(): string {
    return (process.env.OPENSEARCH_URL ?? 'http://localhost:9200').replace(/\/$/, '');
}

export async function indexLogEvent(
    event: LogEvent,
    options: {
        fetchImpl?: FetchLike;
        openSearchUrl?: string;
        refresh?: boolean;
    } = {},
): Promise<void> {
    const indexName = getLogIndexName(event.timestamp);
    const refresh = options.refresh ?? process.env.OPENSEARCH_REFRESH === 'true';
    const url = new URL(`${options.openSearchUrl ?? getOpenSearchUrl()}/${indexName}/_doc`);

    if (refresh) {
        url.searchParams.set('refresh', 'true');
    }

    const response = await (options.fetchImpl ?? fetch)(url, {
        body: JSON.stringify(event),
        headers: {
            'content-type': 'application/json',
        },
        method: 'POST',
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenSearch index failed with ${response.status}: ${body.slice(0, 500)}`);
    }
}
