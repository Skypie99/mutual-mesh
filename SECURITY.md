# Security Policy

**Owner:** Steve (Safety & Robustness Engineer).
**Status:** Day-0 stub. Steve fills in disclosure channel + response timeline during Cycle 0 or earlier if needed.

## Reporting a vulnerability

If you discover a security or privacy vulnerability in Mutual Mesh, please **do not open a public GitHub issue or pull request.**

Until Steve publishes a formal disclosure channel, route reports through:

1. **Direct contact with Sky** (project owner) — preferred for now.
2. Encrypted email is welcome; ask for a public key.

We treat the following as security-significant:

- Any RLS bypass that exposes data across users.
- Any way to read or write `resources` while `is_verified = false`.
- Any way to obtain another user's contact information, phone number, or photo upload paths.
- Any EXIF metadata leakage on uploaded photos.
- Secret leakage in client bundles, logs, or commit history.
- Any auth bypass on the verification gate.

## Response targets

(Steve fills in. Suggested defaults: acknowledge within 72h, patch P0 within 7 days.)

## What we won't do

- We will not retaliate against good-faith reporters.
- We will not require disclosure of personally identifying reporter info beyond what's needed to coordinate a fix.
- We will not publish a fix without crediting the reporter unless they prefer anonymity.

## Scope (Day 0)

There's no production app yet, so there's nothing to attack. This file exists so that when the first deployment lands, a process is in place. Steve revisits at Cycle 7 (ship-readiness sweep).
