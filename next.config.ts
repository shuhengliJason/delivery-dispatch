import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'better-auth',
    '@better-auth/core',
    '@better-auth/kysely-adapter',
    '@better-auth/prisma-adapter',
  ],
};

export default nextConfig;
