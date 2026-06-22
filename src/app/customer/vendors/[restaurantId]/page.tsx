import { UserRole } from '@prisma/client';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/current-user';
import CustomerApp from '../../customer-app';

export const dynamic = 'force-dynamic';

type CustomerVendorPageProps = {
    params: Promise<{
        restaurantId: string;
    }>;
};

export default async function CustomerVendorPage({ params }: CustomerVendorPageProps) {
    const user = await getCurrentUser();
    const { restaurantId } = await params;

    if (!user) {
        redirect(`/sign-in?redirectTo=/customer/vendors/${restaurantId}`);
    }

    if (user.role !== UserRole.CUSTOMER) {
        redirect(`/sign-in?redirectTo=/customer/vendors/${restaurantId}&switchAccount=1`);
    }

    return (
        <CustomerApp
            key={restaurantId}
            initialRestaurantId={restaurantId}
            view="restaurant"
        />
    );
}
