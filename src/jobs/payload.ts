export function getStringPayloadValue(
    payload: unknown,
    key: string,
): string | null {
    if (typeof payload !== 'object' || payload === null) {
        return null;
    }

    const value = (payload as Record<string, unknown>)[key];

    return typeof value === 'string' && value.length > 0 ? value : null;
}
