import { describe, expect, it } from 'vitest';

import {
    normalizeAutocompleteLimit,
    normalizeAutocompletePrefix,
    rankRestaurantAutocompleteSuggestions,
    type RestaurantAutocompleteCandidate,
} from './restaurant-autocomplete';

const candidates: RestaurantAutocompleteCandidate[] = [
    {
        address: {
            city: 'Vancouver',
            line1: '100 Robson St',
            province: 'BC',
        },
        averagePrepMinutes: 18,
        id: 'sushi-1',
        menuItemCount: 12,
        name: 'Sakura Sushi',
    },
    {
        address: {
            city: 'Burnaby',
            line1: '200 Kingsway',
            province: 'BC',
        },
        averagePrepMinutes: 14,
        id: 'soup-1',
        menuItemCount: 6,
        name: 'Sakura Soup House',
    },
    {
        address: {
            city: 'Vancouver',
            line1: '300 Main St',
            province: 'BC',
        },
        averagePrepMinutes: 20,
        id: 'blocked-1',
        menuItemCount: 20,
        name: 'Nazi Noodles',
    },
];

describe('restaurant autocomplete helpers', () => {
    it('normalizes prefixes and limits', () => {
        expect(normalizeAutocompletePrefix('  sak   su  ')).toBe('sak su');
        expect(normalizeAutocompleteLimit('3')).toBe(3);
        expect(normalizeAutocompleteLimit('100')).toBe(10);
        expect(normalizeAutocompleteLimit('bad')).toBe(10);
    });

    it('ranks matching restaurant suggestions and filters blocked terms', () => {
        const suggestions = rankRestaurantAutocompleteSuggestions(candidates, 'sak', 5);

        expect(suggestions.map((suggestion) => {
            return suggestion.id;
        })).toEqual(['sushi-1', 'soup-1']);
        expect(suggestions[0].score).toBeGreaterThan(suggestions[1].score);
    });

    it('returns no suggestions for a blank prefix', () => {
        expect(rankRestaurantAutocompleteSuggestions(candidates, '   ', 5)).toEqual([]);
    });
});
