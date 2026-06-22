export type DemoAccountRole = 'Customer' | 'Vendor' | 'Driver' | 'Dispatcher' | 'Admin';

export type DemoAccount = {
    role: DemoAccountRole;
    name: string;
    email: string;
    route: string;
};

export const DEMO_PASSWORD = 'demo1234';

export const demoAccounts: DemoAccount[] = [
    {
        role: 'Customer',
        name: 'Sarah Chen',
        email: 'sarah.chen@example.com',
        route: '/customer',
    },
    {
        role: 'Vendor',
        name: 'Burger Lab Vendor',
        email: 'vendor@example.com',
        route: '/vendor',
    },
    {
        role: 'Driver',
        name: 'Alex Driver',
        email: 'alex.driver@example.com',
        route: '/driver',
    },
    {
        role: 'Dispatcher',
        name: 'Dispatch Manager',
        email: 'dispatcher@example.com',
        route: '/dispatcher',
    },
    {
        role: 'Admin',
        name: 'Platform Admin',
        email: 'admin@example.com',
        route: '/dispatcher',
    },
];
