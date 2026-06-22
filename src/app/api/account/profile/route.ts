import { UserRole } from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type UpdateProfileBody = {
    name?: unknown;
    phone?: unknown;
};

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

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
            createdAt: true,
            customerProfile: {
                select: {
                    phone: true,
                },
            },
            email: true,
            emailVerified: true,
            id: true,
            image: true,
            name: true,
            role: true,
            updatedAt: true,
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
        user: {
            createdAt: user.createdAt.toISOString(),
            email: user.email,
            emailVerified: user.emailVerified,
            image: user.image,
            name: user.name,
            phone: user.customerProfile?.phone ?? '',
            updatedAt: user.updatedAt.toISOString(),
        },
    });
}

export async function PATCH(request: NextRequest) {
    const user = await getAuthenticatedCustomer(request);

    if (!user) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (user.role !== UserRole.CUSTOMER) {
        return NextResponse.json({ error: 'Customer access required.' }, { status: 403 });
    }

    let body: UpdateProfileBody;

    try {
        body = await request.json() as UpdateProfileBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const name = normalizeText(body.name);
    const phone = normalizeText(body.phone);

    if (name.length < 2 || name.length > 80) {
        return NextResponse.json({ error: 'Name must be between 2 and 80 characters.' }, { status: 400 });
    }

    if (phone.length > 40) {
        return NextResponse.json({ error: 'Phone must be 40 characters or less.' }, { status: 400 });
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
        const nextUser = await tx.user.update({
            where: {
                id: user.id,
            },
            data: {
                name,
            },
            select: {
                createdAt: true,
                email: true,
                emailVerified: true,
                image: true,
                name: true,
                updatedAt: true,
            },
        });

        const customerProfile = await tx.customerProfile.upsert({
            where: {
                userId: user.id,
            },
            update: {
                phone: phone || null,
            },
            create: {
                phone: phone || null,
                userId: user.id,
            },
            select: {
                phone: true,
            },
        });

        return {
            ...nextUser,
            phone: customerProfile.phone ?? '',
        };
    });

    return NextResponse.json({
        user: {
            createdAt: updatedUser.createdAt.toISOString(),
            email: updatedUser.email,
            emailVerified: updatedUser.emailVerified,
            image: updatedUser.image,
            name: updatedUser.name,
            phone: updatedUser.phone,
            updatedAt: updatedUser.updatedAt.toISOString(),
        },
    });
}
