'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { signOut } from '@/lib/auth-client';
import { confirmSignOut } from '@/lib/sign-out-confirmation';

type VendorSignOutButtonProps = {
    className?: string;
};

export default function VendorSignOutButton({
    className = 'font-semibold text-slate-950 hover:underline disabled:cursor-not-allowed disabled:text-slate-400',
}: VendorSignOutButtonProps) {
    const router = useRouter();
    const [isSigningOut, setIsSigningOut] = useState(false);

    async function handleSignOut(): Promise<void> {
        if (!confirmSignOut()) {
            return;
        }

        setIsSigningOut(true);
        await signOut();
        router.push('/sign-in?redirectTo=/vendor');
        router.refresh();
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
