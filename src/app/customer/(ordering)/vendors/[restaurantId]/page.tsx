import { UserRole } from '@prisma/client';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

type CustomerVendorPageProps = {
    params: Promise<{
        restaurantId: string;
    }>;
};

/**
 * Server-side guard for a restaurant detail route.
 *
 * The route param remains useful for auth redirects and shareable URLs. The
 * mounted customer shell reads the same URL client-side to select the vendor.
 */
export default async function CustomerVendorPage({ params }: CustomerVendorPageProps) {
    const user = await getCurrentUser();
    const { restaurantId } = await params;

    if (!user) {
        redirect(`/sign-in?redirectTo=/customer/vendors/${restaurantId}`);
    }

    if (user.role !== UserRole.CUSTOMER) {
        redirect(`/sign-in?redirectTo=/customer/vendors/${restaurantId}&switchAccount=1`);
    }

    return null;
}
