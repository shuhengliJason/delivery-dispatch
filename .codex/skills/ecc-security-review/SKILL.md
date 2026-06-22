---
name: ecc-security-review
description: Use when adding or changing authentication, authorization, API endpoints, user management, payments, secrets, or sensitive data handling.
origin: adapted-from-ecc
---

# ECC Security Review

Use this skill for auth, account management, dispatcher/admin tools, restaurant authorization, driver/customer/vendor data, payments, webhooks, and any server route that changes data.

## Checklist

- Keep authorization server-side. UI visibility is not an access control boundary.
- Separate restaurant authorization from app-level dispatcher/admin authorization.
- Centralize permission checks in helpers such as `canManageRestaurantStaff`, `canManageDispatcherUsers`, and `requireRestaurantPermission`.
- Validate all request bodies with a schema or explicit allowlist.
- Never allow clients to update protected fields such as email, role, restaurant access, ownership, or payment state unless the server route explicitly permits it.
- Do not log passwords, tokens, full payment data, reset links, or session cookies.
- Return generic errors to users and log detailed context server-side.
- Use Prisma parameterized APIs rather than raw string-built SQL.
- For state-changing actions, confirm authenticated user, role, target resource, and ownership before mutation.

## Verification

- Add or update tests for forbidden access paths when feasible.
- Check direct URL/API access, not only visible navigation.
- For role changes, verify downgrade, upgrade, cross-restaurant, and self-edit edge cases.
