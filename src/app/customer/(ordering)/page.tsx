import { UserRole } from '@prisma/client';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

/**
 * Server-side guard for the restaurant browsing route.
 *
 * The shared layout renders the actual customer app; this page only protects
 * the route and returns `null` when the user is allowed through.
 */
export default async function CustomerPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect('/sign-in?redirectTo=/customer');
    }

    if (user.role !== UserRole.CUSTOMER) {
        redirect('/sign-in?redirectTo=/customer&switchAccount=1');
    }

    return null;
}
