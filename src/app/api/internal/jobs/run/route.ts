import { NextResponse } from 'next/server';

import { processDueBackgroundJobs } from '@/jobs/worker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: Request): boolean {
    const secret = process.env.INTERNAL_JOBS_SECRET;

    if (!secret) {
        return false;
    }

    const authorization = request.headers.get('authorization');
    const headerSecret = request.headers.get('x-internal-job-secret');

    return authorization === `Bearer ${secret}` || headerSecret === secret;
}

export async function POST(request: Request) {
    if (!process.env.INTERNAL_JOBS_SECRET) {
        return NextResponse.json({ error: 'Internal jobs runner is not configured.' }, { status: 500 });
    }

    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const result = await processDueBackgroundJobs({
        limit: Number(process.env.BACKGROUND_JOB_BATCH_SIZE ?? 10),
    });

    return NextResponse.json(result);
}
