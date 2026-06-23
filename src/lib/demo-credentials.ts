export type DemoAccountRole = 'Customer' | 'Vendor' | 'Driver' | 'Dispatcher' | 'Admin';

export type DemoAccount = {
    role: DemoAccountRole;
    name: string;
    email: string;
    experienceKey: 'customer' | 'vendor' | 'driver' | 'dispatcher';
    route: string;
};

export const DEMO_PASSWORD = 'demo1234';

export const demoAccounts: DemoAccount[] = [
    {
        role: 'Customer',
        name: 'Sarah Chen',
        email: 'sarah.chen@example.com',
        experienceKey: 'customer',
        route: '/customer',
    },
    {
        role: 'Vendor',
        name: 'Burger Lab Vendor',
        email: 'vendor@example.com',
        experienceKey: 'vendor',
        route: '/vendor',
    },
    {
        role: 'Driver',
        name: 'Alex Driver',
        email: 'alex.driver@example.com',
        experienceKey: 'driver',
        route: '/driver',
    },
    {
        role: 'Dispatcher',
        name: 'Dispatch Manager',
        email: 'dispatcher@example.com',
        experienceKey: 'dispatcher',
        route: '/dispatcher',
    },
    {
        role: 'Admin',
        name: 'Platform Admin',
        email: 'admin@example.com',
        experienceKey: 'dispatcher',
        route: '/dispatcher',
    },
];
