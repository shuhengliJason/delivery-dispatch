'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type DriverPickupClaimActionsProps = {
    orderId: string;
    canClaim: boolean;
    disabledReason: string | null;
};

export default function DriverPickupClaimActions({
    orderId,
    canClaim,
    disabledReason,
}: DriverPickupClaimActionsProps) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    async function claimPickup(): Promise<void> {
        if (!canClaim) {
            return;
        }

        try {
            setIsSaving(true);
            setErrorMessage(null);

            const response = await fetch(`/api/driver/orders/${orderId}/claim`, {
                method: 'POST',
            });

            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not claim pickup.');
            }

            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not claim pickup.');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="mt-4">
            <button
                type="button"
                disabled={!canClaim || isSaving}
                onClick={() => {
                    void claimPickup();
                }}
                className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
                {isSaving ? 'Claiming...' : 'Claim pickup'}
            </button>

            {!canClaim && (
                <p className="mt-2 text-xs font-medium text-slate-500">
                    {disabledReason ?? 'You cannot claim more pickups right now.'}
                </p>
            )}

            {errorMessage && (
                <p className="mt-2 text-xs font-medium text-red-600">
                    {errorMessage}
                </p>
            )}
        </div>
    );
}
