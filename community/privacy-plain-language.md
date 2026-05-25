# Privacy in Plain Language

This is not a legal document. It's a plain-language explanation of what Mutual Mesh collects, what we don't, and what you control. The full data model lives in [`PRIVACY.md`](../PRIVACY.md) if you want the technical details.

---

## What we collect — only what you choose to share

- **A handle.** A name you make up. Not your real name.
- **Your email.** Used only to log you in and send you a one-time verification code. We don't send marketing emails.
- **A postal prefix.** The first three characters of your postal code — neighborhood-level, not building-level. Enough to connect you with nearby resources, not enough to find your door.
- **What you post.** Resource listings you create: name, description, photo (if you add one), and a contact handle you choose for each post.

That's the list. There is no hidden collection.

---

## What we don't collect

- Real name — not at signup, not anywhere in the app
- Phone number — ever
- Full address or GPS coordinates — ever
- Photos of you (profile photos aren't a thing here)
- Location data hidden in photos — we strip it, twice, before the image is stored
- Age, gender, or any demographic info
- Device fingerprint or IP address beyond what Supabase's platform logs as standard infrastructure

---

## Who can see your posts

Only verified community members — people who have been invited and approved by a human verification admin in your area. There is no public browsing. Someone who isn't logged in as a verified member sees nothing.

When you post a resource, your contact handle for that post is only revealed to the specific person who claims it. No one else sees it.

---

## How to delete everything

One button in the app. Settings → Delete my account. When you tap it, your account, your posts, and your photos are hard-deleted from the database immediately. There's no waiting period, no "we'll delete it in 30 days," no archive.

One honest caveat: Supabase (our database host) keeps encrypted backup snapshots for up to 7 days as a platform default. We can't reach into those backups to scrub your data — that's a platform limit we can't control. We disclose this in the deletion confirmation screen so it's not a surprise.

---

## If you have more questions

If something here doesn't add up, or you want to understand a specific detail, reach out to the person who invited you or to Sky directly. We'd rather answer an awkward question than have someone use the app with a misunderstanding about their safety.
