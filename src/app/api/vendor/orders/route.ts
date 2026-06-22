import { PaymentStatus, UserRole } from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import {
    getOperationalDelayStatus,
    getVendorNextStatuses,
} from '@/lib/order-realtime';
import { prisma } from '@/lib/prisma';
import {
    getAuthorizedRestaurantsForUser,
    requireRestaurantPermission,
} from '@/lib/vendor-permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const session = await auth.api.getSession({
        headers: request.headers,
    });

    if (!session?.user) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: {
            id: session.user.id,
        },
        select: {
            id: true,
            role: true,
        },
    });

    if (!user || (user.role !== UserRole.VENDOR && user.role !== UserRole.ADMIN)) {
        return NextResponse.json({ error: 'Vendor access required.' }, { status: 403 });
    }

    const restaurantId = request.nextUrl.searchParams.get('restaurantId') ?? undefined;
    const authorizedRestaurants = restaurantId
        ? []
        : await getAuthorizedRestaurantsForUser(user, 'orders:read');

    if (restaurantId) {
        const permission = await requireRestaurantPermission(user, restaurantId, 'orders:read');

        if (!permission.knownRestaurantMember) {
            return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 });
        }

        if (!permission.allowed) {
            return NextResponse.json({ error: 'You do not have permission to view this restaurant orders.' }, { status: 403 });
        }
    }

    if (!restaurantId && user.role !== UserRole.ADMIN && authorizedRestaurants.length === 0) {
        return NextResponse.json({ orders: [] });
    }

    const orders = await prisma.order.findMany({
        where: {
            paymentStatus: PaymentStatus.PAID,
            ...(restaurantId
                ? { restaurantId }
                : user.role === UserRole.ADMIN
                    ? {}
                    : {
                        restaurantId: {
                            in: authorizedRestaurants.map((restaurant) => {
                                return restaurant.id;
                            }),
                        },
                    }),
        },
        include: {
            items: {
                orderBy: {
                    createdAt: 'asc',
                },
            },
            restaurant: true,
            assignments: {
                include: {
                    driver: {
                        include: {
                            user: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
                take: 1,
            },
            timelineEvents: {
                orderBy: {
                    createdAt: 'asc',
                },
            },
        },
        orderBy: {
            placedAt: 'desc',
        },
        take: 50,
    });

    return NextResponse.json({
        orders: orders.map((order) => {
            return {
                ...order,
                operationalDelayStatus: getOperationalDelayStatus(order.status, order.estimatedDeliveryAt),
                nextVendorStatuses: getVendorNextStatuses(order.status),
            };
        }),
    });
}
