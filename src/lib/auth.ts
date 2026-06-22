import { UserRole } from '@prisma/client';
import { betterAuth } from 'better-auth/minimal';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';

import { prisma } from '@/lib/prisma';
import {
    authRateLimitStorage,
    isRateLimitingEnabled,
} from '@/lib/rate-limit';

const oneDayInSeconds = 60 * 60 * 24;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
    appName: 'Delivery Dispatch',
    baseURL: process.env.BETTER_AUTH_URL,
    database: prismaAdapter(prisma, {
        provider: 'postgresql',
    }),
    emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        maxPasswordLength: 128,
        autoSignIn: true,
    },
    socialProviders: googleClientId && googleClientSecret
        ? {
            google: {
                clientId: googleClientId,
                clientSecret: googleClientSecret,
                mapProfileToUser: (profile) => {
                    return {
                        email: profile.email.toLowerCase(),
                        emailVerified: profile.email_verified === true,
                        image: profile.picture,
                        name: profile.name || profile.email,
                    };
                },
                overrideUserInfoOnSignIn: true,
            },
        }
        : undefined,
    session: {
        expiresIn: oneDayInSeconds * 7,
        updateAge: oneDayInSeconds,
    },
    rateLimit: {
        enabled: isRateLimitingEnabled(),
        window: 60,
        max: 120,
        customStorage: authRateLimitStorage,
        customRules: {
            '/sign-in/email': {
                window: 60,
                max: 5,
            },
            '/sign-up/email': {
                window: 10 * 60,
                max: 5,
            },
            '/sign-in/social': {
                window: 60,
                max: 30,
            },
            '/callback/*': {
                window: 60,
                max: 60,
            },
            '/get-session': {
                window: 60,
                max: 120,
            },
        },
    },
    advanced: {
        ipAddress: {
            ipAddressHeaders: [
                'cf-connecting-ip',
                'x-real-ip',
                'x-forwarded-for',
            ],
            ipv6Subnet: 64,
        },
    },
    user: {
        additionalFields: {
            role: {
                type: 'string',
                input: false,
                returned: true,
                defaultValue: UserRole.CUSTOMER,
            },
        },
    },
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    await prisma.customerProfile.upsert({
                        where: {
                            userId: user.id,
                        },
                        update: {},
                        create: {
                            userId: user.id,
                        },
                    });
                },
            },
        },
    },
    plugins: [
        nextCookies(),
    ],
});
