# Mutual Mesh saved-session demo privacy review request — 2026-09-26

## DECISIONS FOR SKY

- [ ] **Define and review the guest-demo isolation boundary.** Recommend a separate, read-only privacy review of the exact candidate before authorizing a runtime change. The alternative is to leave the demo isolation claim withdrawn and defer repair. This affects whether a visitor with a saved account session can trigger account-related effects while viewing synthetic demo data.
  - Owner authorization is required for authentication or data-handling changes and any real-account or hosted test. This request authorizes none of them.
- [ ] **Resolve public-source metadata wording.** Recommend “Public source for an invite-only mutual-aid application with a synthetic guest interface.” The existing GitHub description says private while the repository is public. The alternative is owner-selected wording or visibility. Only Sky changes metadata or visibility; no service-data privacy guarantee is implied.

## Candidate and evidence

The reviewed public baseline is `93f5928c3a5d8607f75d5889f502499033249aae` on `Skypie99/mutual-mesh/main`. The implementation branch is `codex/public-estate-p0p1-mutualmesh-20260926`. It changes documentation only; authentication and map source bytes remain identical to that baseline.

The controlling public-estate audit identifies an unconditional `AuthProvider` mount at `App.tsx:77` and saved-session/profile/realtime/activity effects in `src/lib/auth.tsx:90` onward without a demo guard. The web map uses OpenStreetMap tiles. These are source observations, not proof of deployed data exposure. No private session, account, credentials, backend, or real data was accessed in this session.

## Scope for the separately authorized reviewer

1. Recompute the exact candidate commit/tree, inspect the auth-provider mount and all demo-route effects, and map saved-session reads, profile fetches, subscriptions, and activity writes.
2. Define expected behavior for a fresh visitor and a visitor with a saved session. Use isolated local mocks or synthetic fixtures first; obtain explicit owner authority before any hosted or real-account action.
3. Separate browser tile requests from authentication/backend requests. Verify which routes can reach each effect, and record limits without logging tokens, account identifiers, or private payloads.
4. Report confirmed source paths, unresolved runtime behavior, and a minimal proposed repair. Stop for Sky before modifying authentication, location, disability, or data-handling code.

## Current documentation result and limit

The README now describes public source separately from service access and withdraws the absolute zero-network and no-real-listings guarantee. Guest-interface isolation from an existing saved account session remains **UNVERIFIED**. P1 MM-01 remains open for owner review; a wording correction does not establish runtime isolation.

No credentials rotated; no product behavior, backend, configuration, production, history, or visibility changed.
