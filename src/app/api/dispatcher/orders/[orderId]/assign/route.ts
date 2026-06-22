import {
    maxActiveDriverDeliveries,
} from '@/lib/driver-capacity';
import { type NextRequest, NextResponse } from 'next/server';

import { assignDriverToReadyOrder } from '@/lib/driver-assignment';
import { requireDispatcherPermissionForRequest } from '@/lib/dispatcher-permissions';
import {
    adminRateLimitPolicies,
    enforceIpRateLimit,
    enforceUserRateLimit,
} from '@/lib/rate-limit';

type AssignDriverBody = {
    driverId?: unknown;
};

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ orderId: string }> },
) {
    const ipRateLimitResponse = await enforceIpRateLimit(request, adminRateLimitPolicies.dispatcherOrderMutationIp);

    if (ipRateLimitResponse) {
        return ipRateLimitResponse;
    }

    const access = await requireDispatcherPermissionForRequest(request, 'orders:manage');
    const user = access.user;

    if (!user) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (!access.allowed) {
        return NextResponse.json({ error: 'Dispatcher access required.' }, { status: 403 });
    }

    const userRateLimitResponse = await enforceUserRateLimit(
        request,
        adminRateLimitPolicies.dispatcherOrderMutationUser,
        user.id,
    );

    if (userRateLimitResponse) {
        return userRateLimitResponse;
    }

    let body: AssignDriverBody;

    try {
        body = await request.json() as AssignDriverBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    if (typeof body.driverId !== 'string' || body.driverId.length === 0) {
        return NextResponse.json({ error: 'Driver is required.' }, { status: 400 });
    }

    const { orderId } = await context.params;
    const result = await assignDriverToReadyOrder({
        actorName: user.name ?? 'Dispatcher',
        driverId: body.driverId,
        orderId,
        source: 'dispatcher_manual',
    });

    if (!result.assigned && result.reason === 'ORDER_NOT_FOUND') {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (!result.assigned && result.reason === 'ORDER_NOT_READY') {
        return NextResponse.json({ error: 'Only ready orders can be assigned.' }, { status: 409 });
    }

    if (!result.assigned && result.reason === 'PAYMENT_NOT_CONFIRMED') {
        return NextResponse.json({ error: 'Order payment has not been confirmed.' }, { status: 409 });
    }

    if (!result.assigned && result.reason === 'ORDER_ALREADY_ASSIGNED') {
        return NextResponse.json({ error: 'Order already has an active driver assignment.' }, { status: 409 });
    }

    if (!result.assigned) {
        return NextResponse.json({
            error: `Selected driver cannot take another delivery. Max active deliveries is ${maxActiveDriverDeliveries}.`,
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
