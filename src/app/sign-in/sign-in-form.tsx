'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

import { authClient, signIn, signOut } from '@/lib/auth-client';
import {
    DEMO_PASSWORD,
    demoAccounts,
} from '@/lib/demo-credentials';
import {
    getLoginExperience,
    type LoginExperienceKey,
} from '@/lib/login-experience';

type UserRole = 'CUSTOMER' | 'VENDOR' | 'DRIVER' | 'DISPATCHER' | 'ADMIN';

type SessionWithRole = {
    user?: {
        role?: UserRole;
    };
};

type SignInFormProps = {
    initialExperienceKey: LoginExperienceKey;
};

function getSafeRedirectTo(): string | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const redirectTo = new URLSearchParams(window.location.search).get('redirectTo');

    if (!redirectTo || !redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
        return null;
    }

    return redirectTo;
}

function canAccessRoute(role: UserRole | undefined, pathname: string): boolean {
    if (pathname.startsWith('/driver')) {
        return role === 'DRIVER';
    }

    if (pathname.startsWith('/vendor')) {
        return role === 'VENDOR' || role === 'ADMIN';
    }

    if (pathname.startsWith('/dispatcher')) {
        return role === 'DISPATCHER' || role === 'ADMIN';
    }

    return true;
}

function getDefaultRoute(role: UserRole | undefined): string {
    if (role === 'DRIVER') {
        return '/driver';
    }

    if (role === 'VENDOR') {
        return '/vendor';
    }

    if (role === 'DISPATCHER' || role === 'ADMIN') {
        return '/dispatcher';
    }

    return '/customer';
}

function updateFavicon(iconPath: string): void {
    const existingIcons = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]');

    existingIcons.forEach((icon) => {
        icon.remove();
    });

    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.type = 'image/svg+xml';
    icon.href = iconPath;
    document.head.appendChild(icon);
}

function copyWithFallback(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text);
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '-1000px';
    document.body.appendChild(textArea);
    textArea.select();

    const wasCopied = document.execCommand('copy');
    document.body.removeChild(textArea);

    return wasCopied
        ? Promise.resolve()
        : Promise.reject(new Error('Copy command failed.'));
}

export default function SignInForm({
    initialExperienceKey,
}: SignInFormProps) {
    const router = useRouter();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
    const [isPreparingSwitch, setIsPreparingSwitch] = useState(false);
    const [copiedCredential, setCopiedCredential] = useState<string | null>(null);
    const experience = getLoginExperience(`/${initialExperienceKey}`);
    const isCustomerExperience = initialExperienceKey === 'customer';

    useEffect(() => {
        const redirectTo = getSafeRedirectTo();
        const nextExperience = getLoginExperience(redirectTo);

        updateFavicon(nextExperience.iconPath);
        document.title = `${nextExperience.eyebrow} Sign In`;
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const searchParams = new URLSearchParams(window.location.search);

        if (searchParams.get('switchAccount') !== '1') {
            return;
        }

        let isCancelled = false;

        const prepareAccountSwitch = async (): Promise<void> => {
            setIsPreparingSwitch(true);
            await signOut();

            if (isCancelled) {
                return;
            }

            searchParams.delete('switchAccount');
            const queryString = searchParams.toString();
            const nextUrl = queryString
                ? `${window.location.pathname}?${queryString}`
                : window.location.pathname;

            window.history.replaceState(null, '', nextUrl);
            setIsPreparingSwitch(false);
        };

        void prepareAccountSwitch();

        return () => {
            isCancelled = true;
        };
    }, []);

    async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        setErrorMessage(null);
        setIsSubmitting(true);

        const formData = new FormData(event.currentTarget);
        const email = String(formData.get('email') ?? '').trim().toLowerCase();
        const password = String(formData.get('password') ?? '');

        const result = await signIn.email({
            email,
            password,
        });

        setIsSubmitting(false);

        if (result.error) {
            setErrorMessage(result.error.message ?? 'Could not sign you in.');
            return;
        }

        const sessionResult = await authClient.getSession();
        const role = (sessionResult.data as SessionWithRole | null)?.user?.role;
        const redirectTo = getSafeRedirectTo();

        router.push(redirectTo && canAccessRoute(role, redirectTo)
            ? redirectTo
            : getDefaultRoute(role));
        router.refresh();
    }

    async function handleGoogleSignIn(): Promise<void> {
        setErrorMessage(null);
        setIsGoogleSubmitting(true);

        const redirectTo = getSafeRedirectTo();
        const callbackURL = redirectTo && canAccessRoute('CUSTOMER', redirectTo)
            ? redirectTo
            : '/customer';

        const result = await signIn.social({
            provider: 'google',
            callbackURL,
            newUserCallbackURL: callbackURL,
            errorCallbackURL: '/sign-in',
        });

        if (result.error) {
            setIsGoogleSubmitting(false);
            setErrorMessage(result.error.message ?? 'Could not start Google sign in.');
        }
    }

    async function handleCopyCredential(text: string, credentialKey: string): Promise<void> {
        setErrorMessage(null);

        try {
            await copyWithFallback(text);
            setCopiedCredential(credentialKey);
            window.setTimeout(() => {
                setCopiedCredential((currentCredential) => {
                    return currentCredential === credentialKey ? null : currentCredential;
                });
            }, 1800);
        } catch {
            setErrorMessage('Could not copy that credential. You can still select and copy it manually.');
        }
    }

    return (
        <main className={`min-h-screen overflow-x-hidden bg-gradient-to-br ${experience.panelClass} p-4 sm:p-6`}>
            <section className="mx-auto grid min-h-[calc(100vh-32px)] w-full max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/80 bg-white shadow-xl ring-1 ring-slate-200 sm:max-w-[calc(100vw-3rem)] lg:min-h-[calc(100vh-48px)] lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_430px]">
                <div className="flex min-w-0 min-h-[360px] flex-col justify-between p-6 sm:p-10">
                    <div>
                        <div className="flex items-center gap-3">
                            <span className={`h-3 w-3 rounded-full ${experience.accentClass}`} />
                            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                                {experience.eyebrow}
                            </p>
                        </div>

                        <h1 className="mt-4 max-w-2xl break-words text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                            {experience.title}
                        </h1>

                        <p className="mt-4 max-w-2xl break-words text-base font-medium leading-7 text-slate-700 sm:text-lg">
                            {experience.purpose}
                        </p>

                        <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-slate-600">
                            {experience.description}
                        </p>
                    </div>

                    <div className="mt-8">
                        <Image
                            src={experience.imagePath}
                            alt=""
                            width={760}
                            height={520}
                            className="h-auto w-full max-w-2xl"
                        />

                        <div className="mt-6 grid gap-3 sm:grid-cols-3">
                            {experience.bullets.map((bullet) => {
                                return (
                                    <div
                                        key={bullet}
                                        className={`rounded-lg bg-white/80 px-3 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ${experience.ringClass}`}
                                    >
                                        {bullet}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex min-w-0 items-center bg-slate-950 p-6 sm:p-8">
                    <section className="min-w-0 w-full rounded-xl bg-white p-4 shadow-sm sm:p-6">
                        <div className="flex items-center gap-3">
                            <Image
                                src={experience.iconPath}
                                alt=""
                                width={48}
                                height={48}
                                className="h-12 w-12 rounded-xl"
                            />
                            <div>
                                <p className="text-sm font-medium text-slate-500">
                                    Secure sign in
                                </p>
                                <h2 className="text-2xl font-bold text-slate-950">
                                    {experience.eyebrow}
                                </h2>
                            </div>
                        </div>

                        <section
                            aria-labelledby="demo-accounts-heading"
                            className="mt-4 rounded-lg border border-slate-200 bg-slate-50"
                        >
                            <div className="border-b border-slate-200 px-3 py-3">
                                <h3
                                    id="demo-accounts-heading"
                                    className="text-sm font-bold text-slate-950"
                                >
                                    Portfolio demo accounts
                                </h3>
                                <p className="mt-1 text-xs leading-5 text-slate-600">
                                    Each account uses the same demo password.
                                </p>
                            </div>

                            <div className="divide-y divide-slate-200">
                                {demoAccounts.map((account) => {
                                    const emailKey = `${account.role}-email`;
                                    const passwordKey = `${account.role}-password`;

                                    return (
                                        <div
                                            key={account.email}
                                            className="grid gap-2 px-3 py-3"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold uppercase text-slate-500">
                                                        {account.role}
                                                    </p>
                                                    <p className="truncate text-sm font-semibold text-slate-950">
                                                        {account.name}
                                                    </p>
                                                </div>
                                                <a
                                                    href={`/sign-in?redirectTo=${encodeURIComponent(account.route)}`}
                                                    className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                                >
                                                    Open
                                                </a>
                                            </div>

                                            <div className="grid gap-2">
                                                <div className="flex items-center gap-2">
                                                    <code className="min-w-0 flex-1 truncate rounded-md bg-white px-2 py-1.5 text-xs text-slate-700 ring-1 ring-slate-200">
                                                        {account.email}
                                                    </code>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            void handleCopyCredential(account.email, emailKey);
                                                        }}
                                                        className="w-16 rounded-md bg-slate-900 px-2 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                                                    >
                                                        {copiedCredential === emailKey ? 'Copied' : 'Email'}
                                                    </button>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <code className="min-w-0 flex-1 truncate rounded-md bg-white px-2 py-1.5 text-xs text-slate-700 ring-1 ring-slate-200">
                                                        {DEMO_PASSWORD}
                                                    </code>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            void handleCopyCredential(DEMO_PASSWORD, passwordKey);
                                                        }}
                                                        className="w-16 rounded-md bg-slate-900 px-2 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                                                    >
                                                        {copiedCredential === passwordKey ? 'Copied' : 'Pass'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        {isCustomerExperience && (
                            <button
                                type="button"
                                disabled={isGoogleSubmitting || isPreparingSwitch}
                                onClick={() => {
                                    void handleGoogleSignIn();
                                }}
                                className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                            >
                                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-bold text-slate-700">
                                    G
                                </span>
                                {isGoogleSubmitting ? 'Opening Google...' : 'Continue with Google'}
                            </button>
                        )}

                        {isPreparingSwitch && (
                            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                Preparing a fresh sign in...
                            </p>
                        )}

                        {errorMessage && (
                            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {errorMessage}
                            </p>
                        )}

                        <form
                            onSubmit={(event) => {
                                void handleSubmit(event);
                            }}
                            className={`${isCustomerExperience ? 'mt-4' : 'mt-6'} space-y-4`}
                        >
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
                                    disabled={isPreparingSwitch}
                                    autoComplete="email"
                                    placeholder={experience.emailPlaceholder}
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
                                    disabled={isPreparingSwitch}
                                    autoComplete="current-password"
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting || isPreparingSwitch}
                                className={`w-full rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-sm ${experience.accentClass} disabled:cursor-not-allowed disabled:bg-slate-300`}
                            >
                                {isSubmitting || isPreparingSwitch ? 'Signing in...' : 'Sign in'}
                            </button>
                        </form>
                    </section>
                </div>
            </section>
        </main>
    );
}
