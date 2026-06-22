<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Codex Setup

This repo uses a selective ECC integration. The full ECC rule pack is intentionally not imported; this app's Next.js, Prisma, Better Auth, and local authorization patterns take priority.

Project-local Codex config lives in `.codex/config.toml`. It registers a small set of ECC-derived skills:

- `ecc-nextjs-turbopack`: Next.js 16+, App Router, route handlers, Turbopack, and proxy/middleware checks.
- `ecc-security-review`: authentication, authorization, API endpoints, user input, secrets, payments, and sensitive data.
- `ecc-verification-loop`: run focused verification before finishing code changes.
- `ecc-tdd-workflow`: use for nontrivial bugs, authorization changes, and new user-facing behavior.
- `ecc-frontend-patterns`: React/Next UI work, forms, accessibility, responsive layout, and browser verification.
- `ecc-backend-patterns`: API, Prisma, transactions, authorization helpers, and error handling.

When a task touches framework behavior, first read the relevant file under `node_modules/next/dist/docs/`. When a task touches permissions or account management, centralize authorization in helper functions and verify server-side checks, not only UI visibility.

Use PowerShell-compatible commands on Windows. Prefer `rg` for search. For normal code changes, run the narrowest meaningful checks first, then `npm run lint` and `npm run build` before final handoff when feasible. After Prisma schema changes, run `npx prisma generate`; use a migration when the database shape changes.
