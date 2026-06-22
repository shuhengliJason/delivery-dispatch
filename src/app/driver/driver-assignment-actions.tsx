'use client';

import { OrderStatus } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type DriverAssignmentActionsProps = {
    assignmentId: string;
    nextStatus: OrderStatus | null;
    label: string;
};

export default function DriverAssignmentActions({
    assignmentId,
    nextStatus,
    label,
}: DriverAssignmentActionsProps) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    async function updateStatus(): Promise<void> {
        if (!nextStatus) {
            return;
        }

        try {
            setIsSaving(true);
            setErrorMessage(null);

            const response = await fetch(`/api/driver/assignments/${assignmentId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    status: nextStatus,
                }),
            });

            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not update delivery.');
            }

            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not update delivery.');
        } finally {
            setIsSaving(false);
        }
    }

    if (!nextStatus) {
        return null;
    }

    return (
        <div className="mt-4">
            <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                    void updateStatus();
                }}
                className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
                {isSaving ? 'Saving...' : label}
            </button>

            {errorMessage && (
                <p className="mt-2 text-xs font-medium text-red-600">
                    {errorMessage}
                </p>
            )}
        </div>
    );
}
