---
name: ecc-nextjs-turbopack
description: Use for Next.js 16+, App Router, route handlers, Turbopack, proxy/middleware naming, and framework behavior checks in this repo.
origin: adapted-from-ecc
---

# ECC Next.js And Turbopack

Use this skill when changing Next.js pages, route handlers, server actions, layouts, redirects, middleware/proxy behavior, build config, or development-server behavior.

## Required Checks

- Read the relevant guide under `node_modules/next/dist/docs/` before writing code that depends on Next.js behavior.
- Treat this repo as Next.js 16+ with Turbopack in development.
- Do not assume older App Router or Pages Router behavior from memory.
- In Next.js 16+, `proxy.ts` is the replacement for the older `middleware.ts` convention. Confirm against local docs before changing either file.
- Prefer official framework APIs over hand-rolled request parsing, redirects, or cache control.

## Verification

- Use `npm run lint` for static checks.
- Use `npm run build` for framework, route, and type integration.
- If dev cache appears stale after Prisma or framework changes, stop the dev server, remove `.next`, regenerate needed artifacts, and restart.
