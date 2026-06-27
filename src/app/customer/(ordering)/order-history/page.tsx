import { UserRole } from '@prisma/client';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

/**
 * Server-side guard for the order history tab.
 *
 * The page returns no UI because the persistent customer shell decides which
 * view to show from the URL.
 */
export default async function CustomerOrderHistoryPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect('/sign-in?redirectTo=/customer/order-history');
    }

    if (user.role !== UserRole.CUSTOMER) {
        redirect('/sign-in?redirectTo=/customer/order-history&switchAccount=1');
    }

    return null;
}
