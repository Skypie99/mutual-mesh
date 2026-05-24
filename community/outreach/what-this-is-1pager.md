# What This Is — 1-page explainer

**Owner:** Casey. **Status:** DRAFT v1 — 2026-05-24. Sky reviews and approves before any send.

**When to use:** AFTER a listening session, if the partner asks "OK, so what is this exactly?" Never send unprompted. Never lead with it.

**Voice check:** plain language, factual, warm-but-not-saccharine. No marketing voice. No savior framing. No "join the revolution". No impact metrics.

---

## Mutual Mesh — what it is

Mutual Mesh is a way for people in the same neighborhood to share food, baby formula, harm-reduction supplies, and other survival resources without an app collecting your name or selling your data.

You sign up with a handle (not your real name) and a postal-code prefix (not your address). A community admin from your own network reviews your account in about 24 hours. After that, you can see what neighbors have to share, and post what you have extra. There's no chat in the app — when you find what you need, you contact the other person on whatever channel they trust (Signal, an email alias, a tenant-union Telegram) and meet up. No ads, no ratings, no points.

## What it isn't

- Not a charity. Nobody is "helping the unfortunate." It's neighbors with neighbors.
- Not an app-store growth story. We grow by serving small dense networks well, not by going broad.
- Not a data broker. We don't sell, share, or analyze user data. Ever.
- Not a delivery service. No drivers, no fees, no logistics layer.
- Not a messaging app. Coordination happens on tools you already trust.

## How verification works

- Invite-only. New users need an invite code from someone already inside.
- A verification admin (recruited from inside your network, not an outsider) reviews each new account.
- The admin sees: chosen handle, email, postal prefix, whether the invite code was valid. That's all.
- The admin does NOT see: real name, phone number, age, gender, address, IP, or any future activity.

## Privacy — the five things

- No real names. The app actively soft-warns if a chosen handle looks like one.
- No full location. Postal-code prefix only (the first 3 characters in Canada).
- All uploaded photos have their location metadata stripped automatically before upload.
- No in-app chat. Nothing for a subpoena to demand a transcript of.
- Delete-means-delete. One tap removes your account in a single transaction. Honest caveat: Supabase backups linger for 7 days, then they're gone too.

The full data inventory lives in [`PRIVACY.md`](../../PRIVACY.md) — read that instead of trusting this summary.

## Want to try it?

Reach out to Sky directly: **skylerhalisky@gmail.com**

The path forward, if it makes sense:

1. A second short conversation about what your network needs.
2. We pick someone from your network to be a verification admin. We train them.
3. We seed the marketplace with surplus your group already has, before inviting anyone in.
4. A three-week pilot. If it's not helping after three weeks, we wind it down gracefully — no hard feelings.

---

_This document is a snapshot. The actual law is `PRIVACY.md` and the codebase. If they ever disagree, the code wins and this doc is wrong — please tell Sky._
