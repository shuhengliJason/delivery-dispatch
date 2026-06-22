'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type CustomerProfile = {
    createdAt: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    name: string;
    phone: string;
    updatedAt: string;
};

type CustomerProfileManagerProps = {
    initialProfile: CustomerProfile;
};

type ProfileApiResponse = {
    error?: string;
    user?: CustomerProfile;
};

type EmailVerificationApiResponse = {
    email?: string;
    emailVerified?: boolean;
    error?: string;
};

function formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('en-CA', {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(new Date(value));
}

export default function CustomerProfileManager({
    initialProfile,
}: CustomerProfileManagerProps) {
    const router = useRouter();
    const [profile, setProfile] = useState(initialProfile);
    const [draft, setDraft] = useState({
        name: initialProfile.name,
        phone: initialProfile.phone,
    });
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');
    const [isSendingVerification, setIsSendingVerification] = useState(false);
    const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const profileInitial = profile.name.trim().charAt(0).toUpperCase() || profile.email.charAt(0).toUpperCase();

    function cancelEdit(): void {
        if (isSaving) {
            return;
        }

        setDraft({
            name: profile.name,
            phone: profile.phone,
        });
        setIsEditing(false);
        setErrorMessage(null);
    }

    async function saveProfile(): Promise<void> {
        try {
            setIsSaving(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch('/api/account/profile', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(draft),
            });
            const data = await response.json() as ProfileApiResponse;

            if (!response.ok || !data.user) {
                throw new Error(data.error ?? 'Could not update your profile.');
            }

            setProfile(data.user);
            setDraft({
                name: data.user.name,
                phone: data.user.phone,
            });
            setIsEditing(false);
            setSuccessMessage('Profile updated.');
            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not update your profile.');
        } finally {
            setIsSaving(false);
        }
    }

    async function sendVerificationCode(): Promise<void> {
        try {
            setIsSendingVerification(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch('/api/account/email-verification', {
                method: 'POST',
            });
            const data = await response.json() as EmailVerificationApiResponse;

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not send verification email.');
            }

            if (data.emailVerified) {
                setProfile((currentProfile) => {
                    return {
                        ...currentProfile,
                        emailVerified: true,
                    };
                });
                setSuccessMessage('Your email is already verified.');
                return;
            }

            setSuccessMessage(`Verification code sent to ${data.email ?? profile.email}.`);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not send verification email.');
        } finally {
            setIsSendingVerification(false);
        }
    }

    async function verifyEmailCode(): Promise<void> {
        try {
            setIsVerifyingEmail(true);
            setErrorMessage(null);
            setSuccessMessage(null);

            const response = await fetch('/api/account/email-verification', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code: verificationCode,
                }),
            });
            const data = await response.json() as EmailVerificationApiResponse;

            if (!response.ok) {
                throw new Error(data.error ?? 'Could not verify email.');
            }

            setProfile((currentProfile) => {
                return {
                    ...currentProfile,
                    emailVerified: true,
                };
            });
            setVerificationCode('');
            setSuccessMessage('Email verified.');
            router.refresh();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Could not verify email.');
        } finally {
            setIsVerifyingEmail(false);
        }
    }

    return (
        <section className="space-y-6">
            {(errorMessage || successMessage) && (
                <div className={`rounded-lg px-3 py-2 text-sm font-medium ${errorMessage
                    ? 'bg-red-50 text-red-700'
                    : 'bg-emerald-50 text-emerald-700'}`}
                >
                    {errorMessage ?? successMessage}
                </div>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-4">
                        {profile.image ? (
                            <div
                                aria-label="Profile image"
                                className="h-14 w-14 rounded-full border border-slate-200 bg-cover bg-center shadow-sm"
                                style={{
                                    backgroundImage: `url(${profile.image})`,
                                }}
                            />
                        ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-lg font-bold text-slate-600 shadow-sm">
                                {profileInitial}
                            </div>
                        )}

                        <div>
                            <h2 className="text-xl font-bold text-slate-950">
                                Account Details
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Last updated {formatDateTime(profile.updatedAt)}
                            </p>
                        </div>
                    </div>

                    {!isEditing ? (
                        <button
                            type="button"
                            onClick={() => {
                                setIsEditing(true);
                                setErrorMessage(null);
                                setSuccessMessage(null);
                            }}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Edit
                        </button>
                    ) : (
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={cancelEdit}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => {
                                    void saveProfile();
                                }}
                                className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    )}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                        Name
                        <input
                            value={isEditing ? draft.name : profile.name}
                            disabled={!isEditing || isSaving}
                            minLength={2}
                            maxLength={80}
                            onChange={(event) => {
                                setDraft((currentDraft) => {
                                    return {
                                        ...currentDraft,
                                        name: event.target.value,
                                    };
                                });
                            }}
                            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                        />
                    </label>

                    <label className="text-sm font-medium text-slate-700">
                        Phone
                        <input
                            value={isEditing ? draft.phone : profile.phone}
                            disabled={!isEditing || isSaving}
                            maxLength={40}
                            onChange={(event) => {
                                setDraft((currentDraft) => {
                                    return {
                                        ...currentDraft,
                                        phone: event.target.value,
                                    };
                                });
                            }}
                            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-950 disabled:bg-slate-100"
                        />
                    </label>

                    <label className="text-sm font-medium text-slate-700">
                        Email
                        <input
                            value={profile.email}
                            disabled
                            type="email"
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
                        />
                    </label>

                    <div className="text-sm font-medium text-slate-700">
                        Created
                        <p className="mt-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500">
                            {formatDateTime(profile.createdAt)}
                        </p>
                    </div>
                </div>
            </section>

            <section className={`rounded-xl border p-5 shadow-sm ${profile.emailVerified
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-amber-200 bg-amber-50'}`}
            >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className={`text-xl font-bold ${profile.emailVerified ? 'text-emerald-950' : 'text-amber-950'}`}>
                            {profile.emailVerified ? 'Email Verified' : 'Verify Email'}
                        </h2>
                        <p className={`mt-1 text-sm ${profile.emailVerified ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {profile.email}
                        </p>
                    </div>

                    {!profile.emailVerified && (
                        <button
                            type="button"
                            disabled={isSendingVerification}
                            onClick={() => {
                                void sendVerificationCode();
                            }}
                            className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:text-amber-300"
                        >
                            {isSendingVerification ? 'Sending code...' : 'Send code'}
                        </button>
                    )}
                </div>

                {!profile.emailVerified && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <input
                            value={verificationCode}
                            disabled={isVerifyingEmail}
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="6-digit code"
                            onChange={(event) => {
                                setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                            }}
                            className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-amber-700 disabled:bg-amber-100"
                        />
                        <button
                            type="button"
                            disabled={isVerifyingEmail || verificationCode.length !== 6}
                            onClick={() => {
                                void verifyEmailCode();
                            }}
                            className="rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-amber-300"
                        >
                            {isVerifyingEmail ? 'Verifying...' : 'Verify'}
                        </button>
                    </div>
                )}
            </section>
        </section>
    );
}
