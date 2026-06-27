import { type ReactNode } from 'react';

import CustomerOrderingShell from '../customer-ordering-shell';

/**
 * Shared layout for customer ordering routes.
 *
 * Because this layout wraps `/customer`, `/customer/orders`,
 * `/customer/order-history`, and `/customer/vendors/:id`, the customer shell
 * stays mounted while only the tiny route page underneath changes.
 */
export default function CustomerOrderingLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <>
            <CustomerOrderingShell />
            {children}
        </>
    );
}
