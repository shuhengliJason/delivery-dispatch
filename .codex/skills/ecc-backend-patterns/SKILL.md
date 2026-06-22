---
name: ecc-backend-patterns
description: Use for API routes, Prisma data access, transactions, service helpers, authorization helpers, and error handling.
origin: adapted-from-ecc
---

# ECC Backend Patterns

Use this skill when changing route handlers, Prisma queries, auth helpers, role helpers, or mutation flows.

## Patterns

- Keep route handlers thin: authenticate, authorize, validate, call the domain operation, return a clear response.
- Put reusable permission logic in `src/lib` helpers rather than duplicating checks in pages and APIs.
- Use Prisma includes/selects intentionally; avoid over-fetching sensitive data.
- Use transactions when multiple writes must succeed or fail together.
- Prefer allowlisted update objects. Do not pass request JSON directly into Prisma mutations.
- Keep errors user-safe in responses and detailed in server logs.
- Preserve audit fields such as `updatedAt` and `updatedById` when modifying user/admin tools.

## Verification

- Check both page-level and API-level access.
- For Prisma changes, run `npx prisma generate` and a migration when needed.
- Watch for stale generated Prisma client or stale Next dev cache after schema changes.
