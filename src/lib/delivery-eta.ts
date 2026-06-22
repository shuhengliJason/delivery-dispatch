import {
    circuitBreakerPolicies,
    withCircuitBreaker,
} from '@/lib/circuit-breaker';

type Coordinate = {
    latitude: number;
    longitude: number;
};

type DeliveryEtaInput = {
    origin: Coordinate | null;
    destination: Coordinate | null;
    prepMinutes: number;
    now?: Date;
};

type GoogleRoutesResponse = {
    routes?: Array<{
        duration?: string;
        distanceMeters?: number;
    }>;
};

type DeliveryEtaResult = {
    estimatedDeliveryAt: Date;
    driveMinutes: number;
    distanceMeters: number | null;
    source: 'google_routes' | 'distance_fallback' | 'default_fallback';
};

const defaultDeliveryBufferMinutes = 30;
const handoffBufferMinutes = 8;
const fallbackAverageSpeedKmh = 24;
const minimumDriveMinutes = 8;

class GoogleRoutesError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'GoogleRoutesError';
        this.status = status;
    }
}

function isGoogleRoutesCircuitBreakerFailure(error: unknown): boolean {
    if (error instanceof GoogleRoutesError) {
        return error.status === 429 || error.status >= 500;
    }

    return true;
}

function toRadians(value: number): number {
    return value * Math.PI / 180;
}

function getDistanceMeters(origin: Coordinate, destination: Coordinate): number {
    const earthRadiusMeters = 6371000;
    const latitudeDelta = toRadians(destination.latitude - origin.latitude);
    const longitudeDelta = toRadians(destination.longitude - origin.longitude);
    const originLatitude = toRadians(origin.latitude);
    const destinationLatitude = toRadians(destination.latitude);

    const a = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(originLatitude)
        * Math.cos(destinationLatitude)
        * Math.sin(longitudeDelta / 2) ** 2;

    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseGoogleDurationSeconds(duration: string | undefined): number | null {
    if (!duration) {
        return null;
    }

    const match = duration.match(/^(\d+(?:\.\d+)?)s$/);

    if (!match) {
        return null;
    }

    return Number(match[1]);
}

async function getGoogleRouteDuration(input: {
    origin: Coordinate;
    destination: Coordinate;
}): Promise<{ driveMinutes: number; distanceMeters: number | null } | null> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
        || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        return null;
    }

    try {
        return await withCircuitBreaker('google-routes', {
            fallback: () => null,
            operation: async () => {
                const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': apiKey,
                        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
                    },
                    body: JSON.stringify({
                        origin: {
                            location: {
                                latLng: {
                                    latitude: input.origin.latitude,
                                    longitude: input.origin.longitude,
                                },
                            },
                        },
                        destination: {
                            location: {
                                latLng: {
                                    latitude: input.destination.latitude,
                                    longitude: input.destination.longitude,
                                },
                            },
                        },
                        travelMode: 'DRIVE',
                        routingPreference: 'TRAFFIC_AWARE',
                    }),
                });

                if (!response.ok) {
                    throw new GoogleRoutesError(response.status, response.statusText);
                }

                const data = await response.json() as GoogleRoutesResponse;
                const route = data.routes?.[0];
                const durationSeconds = parseGoogleDurationSeconds(route?.duration);

                if (!durationSeconds) {
                    return null;
                }

                return {
                    driveMinutes: Math.max(minimumDriveMinutes, Math.ceil(durationSeconds / 60)),
                    distanceMeters: route?.distanceMeters ?? null,
                };
            },
            policy: {
                ...circuitBreakerPolicies.googleRoutes,
                isFailure: isGoogleRoutesCircuitBreakerFailure,
            },
        });
    } catch {
        return null;
    }
}

export async function calculateDeliveryEta({
    origin,
    destination,
    prepMinutes,
    now = new Date(),
}: DeliveryEtaInput): Promise<DeliveryEtaResult> {
    if (!origin || !destination) {
        return {
            estimatedDeliveryAt: new Date(now.getTime() + (prepMinutes + defaultDeliveryBufferMinutes) * 60 * 1000),
            driveMinutes: defaultDeliveryBufferMinutes,
            distanceMeters: null,
            source: 'default_fallback',
        };
    }

    const googleRoute = await getGoogleRouteDuration({
        origin,
        destination,
    });

    if (googleRoute) {
        return {
            estimatedDeliveryAt: new Date(now.getTime() + (prepMinutes + handoffBufferMinutes + googleRoute.driveMinutes) * 60 * 1000),
            driveMinutes: googleRoute.driveMinutes,
            distanceMeters: googleRoute.distanceMeters,
            source: 'google_routes',
        };
    }

    const distanceMeters = getDistanceMeters(origin, destination);
    const distanceKm = distanceMeters / 1000;
    const driveMinutes = Math.max(
        minimumDriveMinutes,
        Math.ceil((distanceKm / fallbackAverageSpeedKmh) * 60),
    );

    return {
        estimatedDeliveryAt: new Date(now.getTime() + (prepMinutes + handoffBufferMinutes + driveMinutes) * 60 * 1000),
        driveMinutes,
        distanceMeters: Math.round(distanceMeters),
        source: 'distance_fallback',
    };
}
