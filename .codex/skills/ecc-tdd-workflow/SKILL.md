---
name: ecc-tdd-workflow
description: Use for nontrivial bug fixes, authorization changes, API behavior changes, and new user-facing workflows.
origin: adapted-from-ecc
---

# ECC TDD Workflow

Use test-first where the repo has a practical test surface. When tests are missing, still define the expected behavior before editing and verify with the closest available command or browser flow.

## Flow

1. State the user-visible behavior or bug.
2. Add or update the smallest test that proves the expected behavior.
3. Run it and confirm it fails for the intended reason.
4. Implement the smallest production change.
5. Re-run the same test and then relevant broader checks.
6. Refactor only after behavior is green.

## Authorization Cases

For permission work, cover:

- unauthenticated access,
- wrong app role,
- correct app role,
- wrong restaurant membership,
- correct restaurant membership,
- owner/manager/editor/viewer boundary cases,
- direct URL/API access.
