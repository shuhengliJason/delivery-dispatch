import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export async function GET() {
    const menuItems = await prisma.menuItem.findMany({
        where: {
            isAvailable: true,
        },
        include: {
            restaurant: {
                include: {
                    address: true,
                },
            },
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
        orderBy: [
            {
                category: 'asc',
            },
            {
                name: 'asc',
            },
        ],
    });

    return NextResponse.json({
        menuItems,
    });
}
