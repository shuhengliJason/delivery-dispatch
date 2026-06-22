import {
    createHash,
    randomInt,
    randomUUID,
    timingSafeEqual,
} from 'crypto';

import { prisma } from '@/lib/prisma';

const emailVerificationTtlMinutes = 15;

function getVerificationIdentifier(userId: string, email: string): string {
    return `email-verification:${userId}:${email.toLowerCase()}`;
}

function hashVerificationCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
}

function codesMatch(expectedHash: string, code: string): boolean {
    const actualHash = hashVerificationCode(code);
    const expected = Buffer.from(expectedHash, 'hex');
    const actual = Buffer.from(actualHash, 'hex');

    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function generateEmailVerificationCode(): string {
    return String(randomInt(0, 1000000)).padStart(6, '0');
}

export async function createEmailVerificationCode({
    code,
    email,
    userId,
}: {
    code: string;
    email: string;
    userId: string;
}): Promise<Date> {
    const identifier = getVerificationIdentifier(userId, email);
    const expiresAt = new Date();

    expiresAt.setMinutes(expiresAt.getMinutes() + emailVerificationTtlMinutes);

    await prisma.$transaction([
        prisma.verification.deleteMany({
            where: {
                identifier,
            },
        }),
        prisma.verification.create({
            data: {
                expiresAt,
                id: randomUUID(),
                identifier,
                value: hashVerificationCode(code),
            },
        }),
    ]);

    return expiresAt;
}

export async function verifyEmailVerificationCode({
    code,
    email,
    userId,
}: {
    code: string;
    email: string;
    userId: string;
}): Promise<boolean> {
    const identifier = getVerificationIdentifier(userId, email);
    const verification = await prisma.verification.findFirst({
        where: {
            expiresAt: {
                gt: new Date(),
            },
            identifier,
        },
        orderBy: {
            createdAt: 'desc',
        },
        select: {
            value: true,
        },
    });

    if (!verification || !codesMatch(verification.value, code)) {
        return false;
    }

    await prisma.$transaction([
        prisma.user.update({
            where: {
                id: userId,
            },
            data: {
                emailVerified: true,
            },
        }),
        prisma.verification.deleteMany({
            where: {
                identifier,
            },
        }),
    ]);

    return true;
}
