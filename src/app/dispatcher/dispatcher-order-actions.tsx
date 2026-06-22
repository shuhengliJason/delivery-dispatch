'use client';

import { OrderStatus } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type DriverOption = {
    id: string;
    name: string;
    capacityLabel: string;
};

type DispatcherOrderActionsProps = {
    orderId: string;
    status: OrderStatus;
    hasAssignment: boolean;
    drivers: DriverOption[];
};

export default function DispatcherOrderActions({
    orderId,
    status,
    hasAssignment,
    drivers,
}: DispatcherOrderActionsProps) {
    const router = useRouter();
    const [driverId, setDriverId] = useState(drivers[0]?.id ?? '');
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    async function assignDriver(): Promise<void> {
        if (!driverId) {
            return;
        }

        try {
            setIsSaving(true);
            setErrorMessage(null);

            const response = await fetch(`/api/dispatcher/orders/${orderId}/assign`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    driverId,
                }),
            });

            const data = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not assign driver.');
            }

            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not assign driver.');
        } finally {
            setIsSaving(false);
        }
    }

    if (hasAssignment) {
        return (
            <span className="text-sm text-slate-500">
                Assigned
            </span>
        );
    }

    if (status !== OrderStatus.READY_FOR_PICKUP) {
        return (
            <span className="text-sm text-slate-500">
                Waiting
            </span>
        );
    }

    if (drivers.length === 0) {
        return (
            <span className="text-sm font-medium text-orange-600">
                No drivers
            </span>
        );
    }

    return (
        <div className="min-w-44 space-y-2">
            <select
                value={driverId}
                disabled={isSaving}
                onChange={(event) => {
                    setDriverId(event.target.value);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
                {drivers.map((driver) => {
                    return (
                        <option
                            key={driver.id}
                            value={driver.id}
                        >
                            {driver.name} ({driver.capacityLabel})
                        </option>
                    );
                })}
            </select>

            <button
                type="button"
                disabled={isSaving || !driverId}
                onClick={() => {
                    void assignDriver();
                }}
                className="w-full rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
                {isSaving ? 'Assigning...' : 'Assign'}
            </button>

            {errorMessage && (
                <p className="text-xs font-medium text-red-600">
                    {errorMessage}
                </p>
            )}
        </div>
    );
}
