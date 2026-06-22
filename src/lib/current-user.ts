import { cache } from 'react';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const getCurrentUser = cache(async () => {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user?.id) {
        return null;
    }

    return prisma.user.findUnique({
        where: {
            id: session.user.id,
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            driverProfile: {
                select: {
                    id: true,
                    status: true,
                    phone: true,
                    currentLatitude: true,
                    currentLongitude: true,
                    activeDeliveryCount: true,
                    completedDeliveryCount: true,
                    lateDeliveryCount: true,
                },
            },
            dispatcherProfile: {
                select: {
                    role: true,
                },
            },
        },
    });
});
