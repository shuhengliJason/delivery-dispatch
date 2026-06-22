import { UserRole } from '@prisma/client';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/current-user';
import { prisma } from '@/lib/prisma';
import CustomerProfileManager from './customer-profile-manager';

export const dynamic = 'force-dynamic';

export default async function CustomerProfilePage() {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
        redirect('/sign-in?redirectTo=/customer/profile');
    }

    if (currentUser.role !== UserRole.CUSTOMER) {
        redirect('/sign-in?redirectTo=/customer/profile&switchAccount=1');
    }

    const user = await prisma.user.findUnique({
        where: {
            id: currentUser.id,
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
            image: true,
            name: true,
            updatedAt: true,
        },
    });

    if (!user) {
        redirect('/sign-in?redirectTo=/customer/profile');
    }

    return (
        <main className="min-h-screen bg-slate-50 p-6">
            <div className="mx-auto max-w-4xl">
                <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-cyan-700">
                                Customer App
                            </p>
                            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                                Profile
                            </h1>
                            <p className="mt-2 max-w-2xl text-sm text-slate-600">
                                Manage your customer account details.
                            </p>
                        </div>

                        <Link
                            href="/customer"
                            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Back to restaurants
                        </Link>
                    </div>
                </header>

                <div className="mt-8">
                    <CustomerProfileManager
                        initialProfile={{
                            createdAt: user.createdAt.toISOString(),
                            email: user.email,
                            emailVerified: user.emailVerified,
                            image: user.image,
                            name: user.name,
                            phone: user.customerProfile?.phone ?? '',
                            updatedAt: user.updatedAt.toISOString(),
                        }}
                    />
                </div>
            </div>
        </main>
    );
}
