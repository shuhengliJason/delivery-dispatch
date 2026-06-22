'use client';

import { OrderStatus } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatStatus } from '@/lib/order-format';
import { canVendorAdjustEta } from '@/lib/order-realtime';

type VendorOrderActionsProps = {
    currentStatus: OrderStatus;
    orderId: string;
    nextStatuses: OrderStatus[];
};

export default function VendorOrderActions({
    currentStatus,
    orderId,
    nextStatuses,
}: VendorOrderActionsProps) {
    const router = useRouter();
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const canAdjustEta = canVendorAdjustEta(currentStatus);

    async function updateOrder(body: Record<string, unknown>, pendingLabel: string): Promise<void> {
        try {
            setPendingAction(pendingLabel);
            setErrorMessage(null);

            const response = await fetch(`/api/vendor/orders/${orderId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not update order.');
            }

            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not update order.');
        } finally {
            setPendingAction(null);
        }
    }

    return (
        <div className="mt-4 space-y-3">
            {nextStatuses.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {nextStatuses.map((status) => {
                        const label = formatStatus(status);

                        return (
                            <button
                                key={status}
                                type="button"
                                disabled={pendingAction !== null}
                                onClick={() => {
                                    void updateOrder({ status }, label);
                                }}
                                className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                {pendingAction === label ? 'Saving...' : label}
                            </button>
                        );
                    })}
                </div>
            )}

            {canAdjustEta && (
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={pendingAction !== null}
                        onClick={() => {
                            void updateOrder({ etaDeltaMinutes: 5 }, '+5');
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                        +5 min ETA
                    </button>

                    <button
                        type="button"
                        disabled={pendingAction !== null}
                        onClick={() => {
                            void updateOrder({ etaDeltaMinutes: 10 }, '+10');
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                        +10 min ETA
                    </button>

                    <button
                        type="button"
                        disabled={pendingAction !== null}
                        onClick={() => {
                            void updateOrder({ etaDeltaMinutes: -5 }, '-5');
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                        -5 min ETA
                    </button>
                </div>
            )}

            {errorMessage && (
                <p className="text-xs font-medium text-red-600">
                    {errorMessage}
                </p>
            )}
        </div>
    );
}
