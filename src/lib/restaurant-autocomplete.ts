export type RestaurantAutocompleteCandidate = {
    address: {
        city: string;
        line1: string;
        province: string;
    };
    averagePrepMinutes: number;
    id: string;
    menuItemCount: number;
    name: string;
};

export type RestaurantAutocompleteSuggestion = RestaurantAutocompleteCandidate & {
    score: number;
};

const blockedSuggestionTerms = [
    'hate',
    'kill',
    'nazi',
    'porn',
];

/**
 * Cleans user input before it is used by any autocomplete backend.
 */
export function normalizeAutocompletePrefix(prefix: string | null): string {
    return (prefix ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

/**
 * Lowercases text so prefix checks are case-insensitive.
 */
function getNormalizedSearchText(value: string): string {
    return value.toLowerCase();
}

/**
 * Simple safety filter for fallback suggestions.
 */
function isAllowedSuggestion(candidate: RestaurantAutocompleteCandidate): boolean {
    const searchText = getNormalizedSearchText([
        candidate.name,
        candidate.address.line1,
        candidate.address.city,
    ].join(' '));

    return !blockedSuggestionTerms.some((term) => {
        return searchText.includes(term);
    });
}

/**
 * Scores fallback Postgres candidates when OpenSearch is unavailable.
 *
 * Name prefix matches matter most, then city/address matches, then small boosts
 * for menu size and faster prep time.
 */
function getSuggestionScore(
    candidate: RestaurantAutocompleteCandidate,
    prefix: string,
): number {
    const normalizedPrefix = getNormalizedSearchText(prefix);
    const normalizedName = getNormalizedSearchText(candidate.name);
    const normalizedCity = getNormalizedSearchText(candidate.address.city);
    const normalizedLine1 = getNormalizedSearchText(candidate.address.line1);

    let score = 0;

    if (normalizedName.startsWith(normalizedPrefix)) {
        score += 1000;
    } else if (normalizedName.includes(normalizedPrefix)) {
        score += 700;
    }

    if (normalizedCity.startsWith(normalizedPrefix)) {
        score += 350;
    } else if (normalizedCity.includes(normalizedPrefix)) {
        score += 200;
    }

    if (normalizedLine1.includes(normalizedPrefix)) {
        score += 100;
    }

    score += Math.min(candidate.menuItemCount, 20) * 5;
    score += Math.max(0, 60 - candidate.averagePrepMinutes);

    return score;
}

/**
 * Ranks Postgres fallback candidates into the same suggestion shape used by the
 * OpenSearch path.
 */
export function rankRestaurantAutocompleteSuggestions(
    candidates: RestaurantAutocompleteCandidate[],
    prefix: string,
    limit: number,
): RestaurantAutocompleteSuggestion[] {
    const normalizedPrefix = normalizeAutocompletePrefix(prefix);

    if (!normalizedPrefix) {
        return [];
    }

    return candidates
        .filter(isAllowedSuggestion)
        .map((candidate) => {
            return {
                ...candidate,
                score: getSuggestionScore(candidate, normalizedPrefix),
            };
        })
        .filter((suggestion) => {
            return suggestion.score > 0;
        })
        .sort((firstSuggestion, secondSuggestion) => {
            if (secondSuggestion.score !== firstSuggestion.score) {
                return secondSuggestion.score - firstSuggestion.score;
            }

            return firstSuggestion.name.localeCompare(secondSuggestion.name);
        })
        .slice(0, limit);
}

/**
 * Keeps the API response size bounded even if the caller passes a huge limit.
 */
export function normalizeAutocompleteLimit(limit: string | null): number {
    const parsedLimit = Number(limit);

    if (!Number.isInteger(parsedLimit)) {
        return 10;
    }

    return Math.min(Math.max(parsedLimit, 1), 10);
}
