import {
    describe,
    expect,
    it,
} from 'vitest';

import {
    DEMO_PASSWORD,
    demoAccounts,
    type DemoAccountRole,
} from './demo-credentials';

describe('demo credentials', () => {
    it('includes one copyable account for every portfolio role', () => {
        const roles = new Set<DemoAccountRole>(demoAccounts.map((account) => {
            return account.role;
        }));

        expect(roles).toEqual(new Set<DemoAccountRole>([
            'Customer',
            'Vendor',
            'Driver',
            'Dispatcher',
            'Admin',
        ]));
        expect(DEMO_PASSWORD).toBe('demo1234');
        expect(demoAccounts.every((account) => {
            return account.email.endsWith('@example.com')
                && account.route.startsWith('/')
                && account.experienceKey.length > 0;
        })).toBe(true);
    });
});
