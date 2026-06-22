import {
    DriverStatus,
    UserRole,
} from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { assignDriverToReadyOrder } from '@/lib/driver-assignment';
import {
    activeDriverOrderStatuses,
    canDriverAcceptMoreDeliveries,
    maxActiveDriverDeliveries,
} from '@/lib/driver-capacity';
import { prisma } from '@/lib/prisma';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ orderId: string }> },
) {
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
        include: {
            driverProfile: true,
        },
    });

    if (!user || user.role !== UserRole.DRIVER || !user.driverProfile) {
        return NextResponse.json({ error: 'Driver access required.' }, { status: 403 });
    }

    const driverProfile = user.driverProfile;

    if (driverProfile.status === DriverStatus.OFFLINE) {
        return NextResponse.json({ error: 'Driver must be online to claim a pickup.' }, { status: 409 });
    }

    const activeDeliveryCount = await prisma.deliveryAssignment.count({
        where: {
            driverId: driverProfile.id,
            cancelledAt: null,
            order: {
                status: {
                    in: activeDriverOrderStatuses,
                },
            },
        },
    });

    if (!canDriverAcceptMoreDeliveries({
        status: driverProfile.status,
        activeDeliveryCount,
    })) {
        return NextResponse.json({
            error: `Driver capacity reached. Complete a delivery before claiming more than ${maxActiveDriverDeliveries} active orders.`,
        }, { status: 409 });
    }

    const { orderId } = await context.params;
    const result = await assignDriverToReadyOrder({
        actorName: user.name,
        driverId: driverProfile.id,
        orderId,
        source: 'driver_claim',
    });

    if (!result.assigned && result.reason === 'ORDER_NOT_FOUND') {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (!result.assigned && result.reason === 'ORDER_NOT_READY') {
        return NextResponse.json({ error: 'Only ready orders can be claimed.' }, { status: 409 });
    }

    if (!result.assigned && result.reason === 'PAYMENT_NOT_CONFIRMED') {
        return NextResponse.json({ error: 'Order payment has not been confirmed.' }, { status: 409 });
    }

    if (!result.assigned && result.reason === 'ORDER_ALREADY_ASSIGNED') {
        return NextResponse.json({ error: 'Order already has an active driver assignment.' }, { status: 409 });
    }

    if (!result.assigned) {
        return NextResponse.json({
            error: `Driver capacity reached. Complete a delivery before claiming more than ${maxActiveDriverDeliveries} active orders.`,
        }, { status: 409 });
    }

    return NextResponse.json({
        assignment: {
            driverId: result.driverId,
            id: result.assignmentId,
            orderId,
        },
    });
}
