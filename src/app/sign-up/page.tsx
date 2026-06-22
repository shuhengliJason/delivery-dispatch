'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { signIn, signUp } from '@/lib/auth-client';

export default function SignUpPage() {
    const router = useRouter();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        setErrorMessage(null);
        setIsSubmitting(true);

        const formData = new FormData(event.currentTarget);
        const name = String(formData.get('name') ?? '').trim();
        const email = String(formData.get('email') ?? '').trim().toLowerCase();
        const password = String(formData.get('password') ?? '');

        const result = await signUp.email({
            name,
            email,
            password,
        });

        setIsSubmitting(false);

        if (result.error) {
            setErrorMessage(result.error.message ?? 'Could not create your account.');
            return;
        }

        router.push('/customer');
        router.refresh();
    }

    async function handleGoogleSignUp(): Promise<void> {
        setErrorMessage(null);
        setIsGoogleSubmitting(true);

        const result = await signIn.social({
            provider: 'google',
            callbackURL: '/customer',
            newUserCallbackURL: '/customer',
            errorCallbackURL: '/sign-up',
            requestSignUp: true,
        });

        if (result.error) {
            setIsGoogleSubmitting(false);
            setErrorMessage(result.error.message ?? 'Could not start Google sign up.');
        }
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
            <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-500">
                    Customer Account
                </p>

                <h1 className="mt-1 text-2xl font-bold text-slate-950">
                    Create your account
                </h1>

                {errorMessage && (
                    <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {errorMessage}
                    </p>
                )}

                <button
                    type="button"
                    disabled={isGoogleSubmitting}
                    onClick={() => {
                        void handleGoogleSignUp();
                    }}
                    className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-bold text-slate-700">
                        G
                    </span>
                    {isGoogleSubmitting ? 'Opening Google...' : 'Continue with Google'}
                </button>

                <div className="my-6 flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="text-xs font-semibold uppercase text-slate-400">
                        or
                    </span>
                    <div className="h-px flex-1 bg-slate-200" />
                </div>

                <form
                    onSubmit={(event) => {
                        void handleSubmit(event);
                    }}
                    className="space-y-4"
                >
                    <div>
                        <label
                            htmlFor="name"
                            className="text-sm font-medium text-slate-700"
                        >
                            Name
                        </label>
                        <input
                            id="name"
                            name="name"
                            required
                            minLength={2}
                            autoComplete="name"
                            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="email"
                            className="text-sm font-medium text-slate-700"
                        >
                            Email
                        </label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            required
                            autoComplete="email"
                            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="password"
                            className="text-sm font-medium text-slate-700"
                        >
                            Password
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            minLength={8}
                            maxLength={128}
                            autoComplete="new-password"
                            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                        {isSubmitting ? 'Creating account...' : 'Create account'}
                    </button>
                </form>

                <p className="mt-5 text-center text-sm text-slate-600">
                    Already have an account?{' '}
                    <Link
                        href="/sign-in"
                        className="font-semibold text-slate-950 hover:underline"
                    >
                        Sign in
                    </Link>
                </p>
            </section>
        </main>
    );
}
