'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { signOut } from '@/lib/auth-client';
import { confirmSignOut } from '@/lib/sign-out-confirmation';

type DispatcherSignOutButtonProps = {
    className?: string;
    redirectTo?: string;
};

export default function DispatcherSignOutButton({
    className = 'inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300',
    redirectTo = '/dispatcher',
}: DispatcherSignOutButtonProps) {
    const router = useRouter();
    const [isSigningOut, setIsSigningOut] = useState(false);

    async function handleSignOut(): Promise<void> {
        if (!confirmSignOut()) {
            return;
        }

        try {
            setIsSigningOut(true);
            await signOut();
            router.push(`/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
            router.refresh();
        } finally {
            setIsSigningOut(false);
        }
    }

    return (
        <button
            type="button"
            disabled={isSigningOut}
            onClick={() => {
                void handleSignOut();
            }}
            className={className}
        >
            {isSigningOut ? 'Signing out...' : 'Sign out'}
        </button>
    );
}
