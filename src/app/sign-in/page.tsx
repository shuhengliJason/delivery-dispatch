import type { Metadata } from 'next';

import SignInForm from './sign-in-form';
import {
    getLoginExperience,
    getLoginExperienceKey,
} from '@/lib/login-experience';

type SignInPageProps = {
    searchParams: Promise<{
        redirectTo?: string | string[];
    }>;
};

function getRedirectTo(searchParams: {
    redirectTo?: string | string[];
}): string | null {
    const redirectTo = Array.isArray(searchParams.redirectTo)
        ? searchParams.redirectTo[0]
        : searchParams.redirectTo;

    if (!redirectTo || !redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
        return null;
    }

    return redirectTo;
}

export async function generateMetadata({
    searchParams,
}: SignInPageProps): Promise<Metadata> {
    const resolvedSearchParams = await searchParams;
    const experience = getLoginExperience(getRedirectTo(resolvedSearchParams));

    return {
        title: `${experience.eyebrow} Sign In`,
        description: experience.purpose,
        icons: {
            icon: [
                {
                    url: experience.iconPath,
                    type: 'image/svg+xml',
                },
            ],
        },
    };
}

export default async function SignInPage({
    searchParams,
}: SignInPageProps) {
    const resolvedSearchParams = await searchParams;

    return (
        <SignInForm
            initialExperienceKey={getLoginExperienceKey(getRedirectTo(resolvedSearchParams))}
        />
    );
}
