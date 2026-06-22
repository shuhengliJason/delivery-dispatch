import { UserRole } from '@prisma/client';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/current-user';
import CustomerApp from '../customer-app';

export const dynamic = 'force-dynamic';

export default async function CustomerCurrentOrdersPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect('/sign-in?redirectTo=/customer/orders');
    }

    if (user.role !== UserRole.CUSTOMER) {
        redirect('/sign-in?redirectTo=/customer/orders&switchAccount=1');
    }

    return (
        <CustomerApp
            key="customer-current-orders"
            view="orders"
        />
    );
}
