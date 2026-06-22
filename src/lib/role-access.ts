import { UserRole } from '@prisma/client';

export function getHomePathForRole(role: UserRole): string {
    if (role === UserRole.CUSTOMER) {
        return '/customer';
    }

    if (role === UserRole.VENDOR) {
        return '/vendor';
    }

    if (role === UserRole.DRIVER) {
        return '/driver';
    }

    return '/dispatcher';
}

export function isAllowedRole(role: UserRole, allowedRoles: UserRole[]): boolean {
    return allowedRoles.includes(role);
}
