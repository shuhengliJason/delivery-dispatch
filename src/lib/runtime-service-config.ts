const loopbackHosts = new Set([
    '0.0.0.0',
    '127.0.0.1',
    '::1',
    'kafka',
    'localhost',
    'opensearch',
    'redis',
]);

function isVercelRuntime(): boolean {
    return process.env.VERCEL === '1';
}

function isLoopbackHost(host: string): boolean {
    const normalizedHost = host.toLowerCase().replace(/^\[|\]$/g, '');

    return loopbackHosts.has(normalizedHost);
}

function shouldUseHost(host: string): boolean {
    return !isVercelRuntime() || !isLoopbackHost(host);
}

export function getConfiguredServiceUrl(envName: string): string | null {
    const rawUrl = process.env[envName]?.trim();

    if (!rawUrl) {
        return null;
    }

    try {
        const url = new URL(rawUrl);

        if (!shouldUseHost(url.hostname)) {
            return null;
        }

        return rawUrl;
    } catch {
        return null;
    }
}

export function getConfiguredBrokerList(envName: string): string[] {
    const rawBrokers = process.env[envName]?.trim();

    if (!rawBrokers) {
        return [];
    }

    return rawBrokers
        .split(',')
        .map((broker) => {
            return broker.trim();
        })
        .filter((broker) => {
            if (!broker) {
                return false;
            }

            const host = broker.split(':')[0] ?? '';

            return shouldUseHost(host);
        });
}
