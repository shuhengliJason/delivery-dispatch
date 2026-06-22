---
name: ecc-verification-loop
description: Use before final handoff after code changes, especially when multiple files, authorization, Prisma, or UI flows changed.
origin: adapted-from-ecc
---

# ECC Verification Loop

Run the narrowest meaningful checks first, then broader checks before handoff when feasible.

## Standard Loop

1. Inspect changed files:
   - `git diff --stat`
   - `git diff -- <paths>`
2. Run targeted tests or checks for the touched area, if present.
3. Run static checks:
   - `npm run lint`
4. Run the production build:
   - `npm run build`
5. For Prisma schema changes:
   - `npx prisma generate`
   - create/apply a migration if the database shape changed.
6. For frontend-visible behavior, verify in the browser at the relevant route.

## Report

In the final response, mention which checks passed and any checks that could not be run.
