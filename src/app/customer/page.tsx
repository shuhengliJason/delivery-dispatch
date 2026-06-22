import { UserRole } from '@prisma/client';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/current-user';
import CustomerApp from './customer-app';

export const dynamic = 'force-dynamic';

export default async function CustomerPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect('/sign-in?redirectTo=/customer');
    }

    if (user.role !== UserRole.CUSTOMER) {
        redirect('/sign-in?redirectTo=/customer&switchAccount=1');
    }

    return <CustomerApp key="customer-home" />;
}
