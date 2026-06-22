import { UserRole } from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { isBrevoConfigured, sendBrevoEmail } from '@/lib/brevo';
import {
    createEmailVerificationCode,
    generateEmailVerificationCode,
    verifyEmailVerificationCode,
} from '@/lib/email-verification';
import { prisma } from '@/lib/prisma';
import {
    accountRateLimitPolicies,
    enforceIpRateLimit,
    enforceUserRateLimit,
} from '@/lib/rate-limit';

type VerifyEmailBody = {
    code?: unknown;
};

async function getAuthenticatedCustomer(request: NextRequest) {
    const session = await auth.api.getSession({
        headers: request.headers,
    });

    if (!session?.user?.id) {
        return null;
    }

    return prisma.user.findUnique({
        where: {
            id: session.user.id,
        },
        select: {
            email: true,
            emailVerified: true,
            id: true,
            name: true,
            role: true,
        },
    });
}

export async function GET(request: NextRequest) {
    const user = await getAuthenticatedCustomer(request);

    if (!user) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (user.role !== UserRole.CUSTOMER) {
        return NextResponse.json({ error: 'Customer access required.' }, { status: 403 });
    }

    return NextResponse.json({
        email: user.email,
        emailVerified: user.emailVerified,
    });
}

export async function POST(request: NextRequest) {
    const ipRateLimitResponse = await enforceIpRateLimit(request, accountRateLimitPolicies.emailVerificationIp);

    if (ipRateLimitResponse) {
        return ipRateLimitResponse;
    }

    const user = await getAuthenticatedCustomer(request);

    if (!user) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (user.role !== UserRole.CUSTOMER) {
        return NextResponse.json({ error: 'Customer access required.' }, { status: 403 });
    }

    if (user.emailVerified) {
        return NextResponse.json({
            email: user.email,
            emailVerified: true,
        });
    }

    const userRateLimitResponse = await enforceUserRateLimit(
        request,
        accountRateLimitPolicies.emailVerificationUser,
        user.id,
    );

    if (userRateLimitResponse) {
        return userRateLimitResponse;
    }

    if (!isBrevoConfigured()) {
        return NextResponse.json({
            error: 'Email verification is not configured. Add BREVO_API_KEY, BREVO_SENDER_EMAIL, and BREVO_SENDER_NAME to .env.',
        }, { status: 503 });
    }

    const code = generateEmailVerificationCode();
    const expiresAt = await createEmailVerificationCode({
        code,
        email: user.email,
        userId: user.id,
    });

    await sendBrevoEmail({
        htmlContent: `
            <html>
                <body>
                    <p>Hello ${user.name},</p>
                    <p>Your Delivery Dispatch verification code is:</p>
                    <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${code}</p>
                    <p>This code expires in 15 minutes.</p>
                </body>
            </html>
        `,
        subject: 'Your Delivery Dispatch verification code',
        textContent: `Your Delivery Dispatch verification code is ${code}. This code expires in 15 minutes.`,
        to: {
            email: user.email,
            name: user.name,
        },
    });

    return NextResponse.json({
        email: user.email,
        emailVerified: false,
        expiresAt: expiresAt.toISOString(),
    });
}

export async function PUT(request: NextRequest) {
    const ipRateLimitResponse = await enforceIpRateLimit(request, accountRateLimitPolicies.emailVerificationIp);

    if (ipRateLimitResponse) {
        return ipRateLimitResponse;
    }

    const user = await getAuthenticatedCustomer(request);

    if (!user) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (user.role !== UserRole.CUSTOMER) {
        return NextResponse.json({ error: 'Customer access required.' }, { status: 403 });
    }

    const userRateLimitResponse = await enforceUserRateLimit(
        request,
        accountRateLimitPolicies.emailVerificationUser,
        user.id,
    );

    if (userRateLimitResponse) {
        return userRateLimitResponse;
    }

    let body: VerifyEmailBody;

    try {
        body = await request.json() as VerifyEmailBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const code = typeof body.code === 'string' ? body.code.trim() : '';

    if (!/^\d{6}$/.test(code)) {
        return NextResponse.json({ error: 'Enter the 6-digit verification code.' }, { status: 400 });
    }

    const verified = await verifyEmailVerificationCode({
        code,
        email: user.email,
        userId: user.id,
    });

    if (!verified) {
        return NextResponse.json({ error: 'That verification code is invalid or expired.' }, { status: 400 });
    }

    return NextResponse.json({
        email: user.email,
        emailVerified: true,
    });
}
