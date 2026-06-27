import {
    OrderStatus,
    PaymentStatus,
    TimelineEventType,
    UserRole,
} from '@prisma/client';
import { after, type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { calculateDeliveryEta } from '@/lib/delivery-eta';
import { syncPaidCheckoutSession } from '@/lib/order-payment';
import { prisma } from '@/lib/prisma';
import { getAppUrl, getStripe, isStripeConfigured } from '@/lib/stripe';
import {
    logOrderCheckoutStartFailed,
    logOrderCheckoutStarted,
} from '@/logging/order-events';

type OrderItemInput = {
    menuItemId?: unknown;
    quantity?: unknown;
    selectedOptionIds?: unknown;
};

type CreateOrderRequestBody = {
    deliveryAddress?: unknown;
    deliveryLocation?: unknown;
    restaurantId?: unknown;
    items?: unknown;
};

type DeliveryLocationInput = {
    formattedAddress: string;
    line1: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
    latitude: number | null;
    longitude: number | null;
};

const deliveryFeeCents = 399;
const taxRate = 0.12;
function isOrderItemInput(value: unknown): value is OrderItemInput {
    return typeof value === 'object' && value !== null;
}

function getValidatedItems(items: unknown): Array<{
    menuItemId: string;
    quantity: number;
    selectedOptionIds: string[];
}> | null {
    if (!Array.isArray(items) || items.length === 0) {
        return null;
    }

    const validatedItems = items.map((item) => {
        const quantity = isOrderItemInput(item) ? item.quantity : null;

        if (!isOrderItemInput(item)
            || typeof item.menuItemId !== 'string'
            || typeof quantity !== 'number'
            || !Number.isInteger(quantity)
            || quantity < 1
            || quantity > 99
        ) {
            return null;
        }

        const selectedOptionIds = Array.isArray(item.selectedOptionIds)
            ? item.selectedOptionIds
            : [];

        if (selectedOptionIds.some((optionId) => {
            return typeof optionId !== 'string';
        })) {
            return null;
        }

        return {
            menuItemId: item.menuItemId,
            quantity,
            selectedOptionIds: Array.from(new Set(selectedOptionIds as string[])),
        };
    });

    if (validatedItems.some((item) => {
        return item === null;
    })) {
        return null;
    }

    return validatedItems as Array<{
        menuItemId: string;
        quantity: number;
        selectedOptionIds: string[];
    }>;
}

function isDeliveryLocationInput(value: unknown): value is DeliveryLocationInput {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const deliveryLocation = value as Record<string, unknown>;

    return typeof deliveryLocation.formattedAddress === 'string'
        && typeof deliveryLocation.line1 === 'string'
        && typeof deliveryLocation.city === 'string'
        && typeof deliveryLocation.province === 'string'
        && typeof deliveryLocation.postalCode === 'string'
        && typeof deliveryLocation.country === 'string'
        && (typeof deliveryLocation.latitude === 'number' || deliveryLocation.latitude === null)
        && (typeof deliveryLocation.longitude === 'number' || deliveryLocation.longitude === null);
}

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
        include: {
            customerProfile: true,
        },
    });

    if (!user || user.role !== UserRole.CUSTOMER || !user.customerProfile) {
        return NextResponse.json({ error: 'Customer access required.' }, { status: 403 });
    }

    const checkoutStatus = request.nextUrl.searchParams.get('checkout');
    const checkoutSessionId = request.nextUrl.searchParams.get('session_id');
    const checkoutOrderId = request.nextUrl.searchParams.get('orderId') ?? undefined;

    if (checkoutStatus === 'success' && checkoutSessionId) {
        await syncPaidCheckoutSession(checkoutSessionId, {
            customerId: user.customerProfile.id,
            orderId: checkoutOrderId,
        });
    }

    const orders = await prisma.order.findMany({
        where: {
            customerId: user.customerProfile.id,
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
    });

    return NextResponse.json({ orders });
}

export async function POST(request: NextRequest) {
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
            customerProfile: true,
        },
    });

    if (!user || user.role !== UserRole.CUSTOMER) {
        return NextResponse.json({ error: 'Customer access required.' }, { status: 403 });
    }

    if (!isStripeConfigured()) {
        return NextResponse.json({
            error: 'Payment is not configured. Add a Stripe test secret key to STRIPE_SECRET_KEY.',
        }, { status: 503 });
    }

    const customerProfile = user.customerProfile ?? await prisma.customerProfile.create({
        data: {
            userId: user.id,
        },
    });

    let body: CreateOrderRequestBody;

    try {
        body = await request.json() as CreateOrderRequestBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const deliveryAddress = typeof body.deliveryAddress === 'string'
        ? body.deliveryAddress.trim()
        : '';
    const deliveryLocation = isDeliveryLocationInput(body.deliveryLocation)
        ? body.deliveryLocation
        : null;
    const restaurantId = typeof body.restaurantId === 'string'
        ? body.restaurantId
        : '';
    const items = getValidatedItems(body.items);

    if (!deliveryAddress || !restaurantId || !items) {
        return NextResponse.json({ error: 'Delivery address, restaurant, and items are required.' }, { status: 400 });
    }

    const restaurant = await prisma.restaurant.findUnique({
        where: {
            id: restaurantId,
        },
        include: {
            address: true,
        },
    });

    if (!restaurant) {
        return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 });
    }

    const menuItems = await prisma.menuItem.findMany({
        where: {
            id: {
                in: items.map((item) => {
                    return item.menuItemId;
                }),
            },
            restaurantId,
            isAvailable: true,
        },
        include: {
            optionGroups: {
                where: {
                    isAvailable: true,
                },
                include: {
                    options: {
                        orderBy: {
                            sortOrder: 'asc',
                        },
                    },
                },
                orderBy: {
                    sortOrder: 'asc',
                },
            },
        },
    });

    if (menuItems.length !== items.length) {
        return NextResponse.json({ error: 'One or more menu items are unavailable.' }, { status: 400 });
    }

    const menuItemsById = new Map(menuItems.map((menuItem) => {
        return [menuItem.id, menuItem];
    }));

    const configuredItems = items.map((item) => {
        const menuItem = menuItemsById.get(item.menuItemId);

        if (!menuItem) {
            return null;
        }

        const allOptionIds = new Set(menuItem.optionGroups.flatMap((group) => {
            return group.options.map((option) => {
                return option.id;
            });
        }));

        if (item.selectedOptionIds.some((optionId) => {
            return !allOptionIds.has(optionId);
        })) {
            return null;
        }

        const selectedOptionsSnapshot = menuItem.optionGroups.map((group) => {
            const selectedOptions = group.options.filter((option) => {
                return item.selectedOptionIds.includes(option.id);
            });
            const selectionCount = selectedOptions.length;
            const maxSelections = group.maxSelections ?? group.options.length;

            if (selectionCount < group.minSelections || selectionCount > maxSelections) {
                return null;
            }

            return {
                groupId: group.id,
                groupName: group.name,
                selectionType: group.selectionType,
                isRequired: group.isRequired,
                options: selectedOptions.map((option) => {
                    return {
                        optionId: option.id,
                        name: option.name,
                        priceCents: option.priceCents,
                    };
                }),
            };
        });

        if (selectedOptionsSnapshot.some((snapshot) => {
            return snapshot === null;
        })) {
            return null;
        }

        const optionTotalCents = selectedOptionsSnapshot.reduce((total, group) => {
            if (!group) {
                return total;
            }

            return total + group.options.reduce((groupTotal, option) => {
                return groupTotal + option.priceCents;
            }, 0);
        }, 0);

        return {
            input: item,
            menuItem,
            optionTotalCents,
            selectedOptionsSnapshot,
            unitTotalCents: menuItem.priceCents + optionTotalCents,
        };
    });

    if (configuredItems.some((item) => {
        return item === null;
    })) {
        return NextResponse.json({ error: 'One or more menu item options are invalid or incomplete.' }, { status: 400 });
    }

    const validConfiguredItems = configuredItems as Array<{
        input: {
            menuItemId: string;
            quantity: number;
            selectedOptionIds: string[];
        };
        menuItem: NonNullable<(typeof configuredItems)[number]>['menuItem'];
        optionTotalCents: number;
        selectedOptionsSnapshot: NonNullable<(typeof configuredItems)[number]>['selectedOptionsSnapshot'];
        unitTotalCents: number;
    }>;

    const subtotalCents = validConfiguredItems.reduce((total, item) => {
        return total + item.unitTotalCents * item.input.quantity;
    }, 0);
    const itemCount = validConfiguredItems.reduce((total, item) => {
        return total + item.input.quantity;
    }, 0);
    const taxCents = Math.round(subtotalCents * taxRate);
    const totalCents = subtotalCents + taxCents + deliveryFeeCents;
    const deliveryEta = await calculateDeliveryEta({
        prepMinutes: restaurant.averagePrepMinutes,
        origin: restaurant.address.latitude !== null && restaurant.address.longitude !== null
            ? {
                latitude: restaurant.address.latitude,
                longitude: restaurant.address.longitude,
            }
            : null,
        destination: deliveryLocation
            && deliveryLocation.latitude !== null
            && deliveryLocation.longitude !== null
            ? {
                latitude: deliveryLocation.latitude,
                longitude: deliveryLocation.longitude,
            }
            : null,
    });

    const order = await prisma.$transaction(async (transaction) => {
        const address = await transaction.address.create({
            data: {
                line1: deliveryLocation?.line1 || deliveryAddress,
                city: deliveryLocation?.city || 'Vancouver',
                province: deliveryLocation?.province || 'BC',
                postalCode: deliveryLocation?.postalCode || 'Pending',
                country: deliveryLocation?.country || 'Canada',
                latitude: deliveryLocation?.latitude,
                longitude: deliveryLocation?.longitude,
            },
        });

        return transaction.order.create({
            data: {
                customerId: customerProfile.id,
                restaurantId,
                deliveryAddressId: address.id,
                status: OrderStatus.CREATED,
                paymentStatus: PaymentStatus.PENDING,
                customerNameSnapshot: user.name,
                restaurantNameSnapshot: restaurant.name,
                deliveryAddressSnapshot: deliveryAddress,
                subtotalCents,
                taxCents,
                deliveryFeeCents,
                totalCents,
                estimatedDeliveryAt: deliveryEta.estimatedDeliveryAt,
                items: {
                    create: validConfiguredItems.map((item) => {
                        return {
                            menuItemId: item.menuItem.id,
                            nameSnapshot: item.menuItem.name,
                            unitPriceCents: item.menuItem.priceCents,
                            optionTotalCents: item.optionTotalCents,
                            selectedOptionsSnapshot: item.selectedOptionsSnapshot,
                            quantity: item.input.quantity,
                            lineTotalCents: item.unitTotalCents * item.input.quantity,
                        };
                    }),
                },
                timelineEvents: {
                    create: {
                        type: TimelineEventType.ORDER_CREATED,
                        title: 'Order created',
                        message: `Customer started checkout. ETA calculated from ${deliveryEta.source.replaceAll('_', ' ')}.`,
                        metadata: {
                            driveMinutes: deliveryEta.driveMinutes,
                            distanceMeters: deliveryEta.distanceMeters,
                            etaSource: deliveryEta.source,
                        },
                    },
                },
            },
            select: {
                id: true,
                orderNumber: true,
                status: true,
                paymentStatus: true,
                estimatedDeliveryAt: true,
                totalCents: true,
            },
        });
    });

    try {
        const stripe = getStripe();
        const appUrl = getAppUrl();
        const checkoutSession = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: user.email,
            line_items: [
                ...validConfiguredItems.map((item) => {
                    const optionDescription = item.selectedOptionsSnapshot
                        .flatMap((group) => {
                            return group?.options.map((option) => {
                                return option.name;
                            }) ?? [];
                        })
                        .join(', ');

                    return {
                        quantity: item.input.quantity,
                        price_data: {
                            currency: 'cad',
                            unit_amount: item.unitTotalCents,
                            product_data: {
                                name: item.menuItem.name,
                                description: optionDescription || restaurant.name,
                            },
                        },
                    };
                }),
                {
                    quantity: 1,
                    price_data: {
                        currency: 'cad',
                        unit_amount: taxCents,
                        product_data: {
                            name: 'Estimated tax',
                        },
                    },
                },
                {
                    quantity: 1,
                    price_data: {
                        currency: 'cad',
                        unit_amount: deliveryFeeCents,
                        product_data: {
                            name: 'Delivery fee',
                        },
                    },
                },
            ],
            metadata: {
                orderId: order.id,
                orderNumber: String(order.orderNumber),
            },
            payment_intent_data: {
                metadata: {
                    orderId: order.id,
                    orderNumber: String(order.orderNumber),
                },
            },
            success_url: `${appUrl}/customer/orders?checkout=success&orderId=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appUrl}/customer/orders?checkout=cancelled&orderId=${order.id}`,
        }, {
            idempotencyKey: order.id,
        });

        await prisma.order.update({
            where: {
                id: order.id,
            },
            data: {
                stripeCheckoutSessionId: checkoutSession.id,
            },
        });

        after(() => {
            return logOrderCheckoutStarted({
                customerId: customerProfile.id,
                itemCount,
                orderId: order.id,
                orderNumber: order.orderNumber,
                paymentStatus: order.paymentStatus,
                restaurantId,
                status: order.status,
                totalCents: order.totalCents,
            }).catch((logError: unknown) => {
                console.error('Could not publish order checkout log', logError);
            });
        });

        return NextResponse.json({
            order,
            checkoutUrl: checkoutSession.url,
        }, { status: 201 });
    } catch (error) {
        console.error(error);

        await prisma.order.update({
            where: {
                id: order.id,
            },
            data: {
                paymentStatus: PaymentStatus.FAILED,
            },
        });

        after(() => {
            return logOrderCheckoutStartFailed({
                customerId: customerProfile.id,
                itemCount,
                orderId: order.id,
                orderNumber: order.orderNumber,
                paymentStatus: PaymentStatus.FAILED,
                restaurantId,
                status: order.status,
                totalCents: order.totalCents,
            }, error).catch((logError: unknown) => {
                console.error('Could not publish order checkout failure log', logError);
            });
        });

        return NextResponse.json({
            error: 'Could not start payment checkout. Please try again.',
        }, { status: 502 });
    }
}
