---
name: ecc-frontend-patterns
description: Use for React/Next UI work, forms, modal editing, responsive layout, accessibility, and browser verification.
origin: adapted-from-ecc
---

# ECC Frontend Patterns

Use this skill when editing app screens, tabs, role-management UI, forms, modals, or responsive layouts.

## Principles

- Match the existing app style before adding new visual language.
- Prefer real controls for the job: tabs for views, selectors for user type, modal dialogs for focused edits, checkboxes/toggles for binary access, and disabled/read-only inputs for non-editable fields.
- Keep protected fields visibly read-only when they cannot be edited, but still enforce that on the server.
- Use accessible labels, focus management for modals, keyboard-friendly controls, and clear loading/error states.
- Keep admin/dispatcher tools dense and scannable rather than marketing-like.

## Verification

- Verify the relevant route in the browser after visible UI changes.
- Check desktop and narrow/mobile widths when layout changed.
- Confirm no text overlaps, clipped buttons, or hidden controls.
