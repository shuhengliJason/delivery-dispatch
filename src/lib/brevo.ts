import {
    circuitBreakerPolicies,
    withCircuitBreaker,
} from '@/lib/circuit-breaker';

type SendEmailInput = {
    htmlContent: string;
    subject: string;
    textContent: string;
    to: {
        email: string;
        name?: string | null;
    };
};

export class BrevoEmailError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'BrevoEmailError';
        this.status = status;
    }
}

function isBrevoCircuitBreakerFailure(error: unknown): boolean {
    if (error instanceof BrevoEmailError) {
        return error.status === 429 || error.status >= 500;
    }

    return true;
}

export function isBrevoConfigured(): boolean {
    return Boolean(
        process.env.BREVO_API_KEY
        && process.env.BREVO_SENDER_EMAIL
        && process.env.BREVO_SENDER_NAME,
    );
}

export async function sendBrevoEmail({
    htmlContent,
    subject,
    textContent,
    to,
}: SendEmailInput): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME;

    if (!apiKey || !senderEmail || !senderName) {
        throw new Error('Brevo is not configured. Add BREVO_API_KEY, BREVO_SENDER_EMAIL, and BREVO_SENDER_NAME to .env.');
    }

    await withCircuitBreaker('brevo-email', {
        operation: async () => {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey,
                },
                body: JSON.stringify({
                    sender: {
                        email: senderEmail,
                        name: senderName,
                    },
                    to: [
                        {
                            email: to.email,
                            name: to.name ?? undefined,
                        },
                    ],
                    subject,
                    htmlContent,
                    textContent,
                }),
            });

            if (!response.ok) {
                const message = await response.text();

                throw new BrevoEmailError(
                    response.status,
                    `Brevo email failed: ${message || response.statusText}`.slice(0, 2000),
                );
            }
        },
        policy: {
            ...circuitBreakerPolicies.brevoEmail,
            isFailure: isBrevoCircuitBreakerFailure,
        },
    });
}
