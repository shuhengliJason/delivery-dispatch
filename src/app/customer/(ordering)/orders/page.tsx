import { UserRole } from '@prisma/client';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

/**
 * Server-side guard for the current orders tab.
 *
 * Rendering stays in the shared customer shell so tab navigation does not
 * remount the customer app.
 */
export default async function CustomerCurrentOrdersPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect('/sign-in?redirectTo=/customer/orders');
    }

    if (user.role !== UserRole.CUSTOMER) {
        redirect('/sign-in?redirectTo=/customer/orders&switchAccount=1');
    }

    return null;
}
