# PRD — Mutual Mesh (working title: Anchor)

**Status:** Source PRD as authored by Sky on 2026-05-23.
**Important:** Some sections of this PRD are SUPERSEDED by Sky's decisions on 2026-05-23 (see `CLAUDE.md` → Decisions log). In particular:

- Stack is **Expo + React Native + Supabase**, not Adalo.
- Data model collected fields are being **redesigned by Jordan** for minimum-collection privacy. The final field list lives in `PRIVACY.md`, not here.
- MVP **excludes in-app chat**. Recipient sees the poster's chosen contact handle after Claim.

This file is preserved verbatim for reference and product-context. **`FEATURES.md` and `PRIVACY.md` are the source of truth for build work.**

---

## Project Name: Anchor (Alternative: Mutual Mesh)

**Target Platform:** Mobile-First Web App / Native Mobile (No-Code Architecture built in Adalo) — _SUPERSEDED: now Expo + RN + Supabase_

**Core Mission:** A safe, verified, community-run mutual aid network and social safety net for marginalized groups to share food, baby formula, and critical resources without corporate or state surveillance.

## 1. System Architecture & Database Schema

The database relies on a strict relational model to track who posts an item, who claims it, and who is authorized to view the marketplace.

```
       +-------------------+
       |       USERS       |
       +-------------------+
                 |
                 | 1-to-Many (Posted By)
                 | 1-to-Many (Claimed By)
                 v
       +-------------------+
       |  SHARED RESOURCES |
       +-------------------+
```

### Collection 1: Users

Tracks authentication, profile details, and vetting status.

- **Email** (Text / Unique Identifier)
- **Username** (Text)
- **Full Name** (Text) — _SUPERSEDED: see PRIVACY.md, likely chosen handle instead_
- **Gender** (Text) — _SUPERSEDED: see PRIVACY.md, likely optional + private_
- **Postal Code** (Text) — _SUPERSEDED: likely prefix-only_
- **Phone Number** (Integer/Text) — _SUPERSEDED: optional + encrypted_
- **Referred By** (Text) — _SUPERSEDED: likely token, not name_
- **Is Verified** (Boolean — **Critical Gateway Property**)
  - True = Granted entry to the marketplace.
  - False = Trapped in the verification holding room.

### Collection 2: Shared Resources

Tracks the actual food and survival items being distributed.

- **Name** (Text) — _e.g., "Sensitive Baby Formula", "2lbs Basmati Rice"_
- **Description** (Text) — _Details on quantity, expiration dates, allergens, dietary notes._
- **Photo of Item** (Image Upload) — \*Visual verification of the item for trust. **EXIF must be stripped on upload — see Steve + Jordan.\***
- **Pick up or delivery** (Location/Text) — \*Geographic coordinates or text instructions for drop-off. **Privacy-sensitive — see PRIVACY.md for granularity rules.\***
- **Status** (Text) — _Hardcoded states: "Available" or "Reserved"._
- **User** (Relationship) — _Many-to-One. Map to Users collection. Represents the **Owner/Poster**._
- **Claimed By** (Relationship) — _Many-to-One. Map to Users collection. Represents the **Recipient**._

## 2. User Flows & Screen Architecture

### Flow A: The Gatekeeper (Authentication & Vetting)

1. **Log In / Sign Up Screen:** User inputs basic credentials.
2. **Conditional Root Action (The Permissions Logic):**
   - _If_ Logged In User → Is Verified is `true` → **Link to: Home Screen**
   - _If_ Logged In User → Is Verified is `false` → **Link to: Waiting Room Screen**
3. **Waiting Room Screen:** A static page instructing unverified users that their profile is being manually reviewed by community admins (usually takes 24 hours). No access to data is provided on this screen.

### Flow B: The Feed (Home Screen)

1. **Simple List Component:** Bound directly to the Shared Resources collection.
2. **List Filtering Rules:** `Status == "Available"` (Ensures claimed items instantly disappear from public view).
3. **List Item Template Mapping:**
   - Title → `Name`
   - Subtitle → `Status`
   - Image → `Photo of Item`
4. **Floating Action Button (FAB):** A permanent round `+` button in the lower right corner linking directly to the **Add Resource Screen**.

### Flow C: Supply Creation (Add Resource Screen)

A manual data entry form exposed only to verified users.

- **Form Inputs:** Name, Description, Photo of Item, Pick up or delivery.
- **Hidden Action Items (Form Metadata):**
  - Set `Status` automatically to "Available" upon submission.
  - Set `User` (Poster) automatically to Logged In User.
- **Submit Button Action:** Creates the record and links back to the **Home Screen**.

### Flow D: Supply Consumption (Resource Detail Screen)

Triggered when a user clicks any item inside the Home Screen's Simple List.

1. **Image Component Display:** Mapped to `Photo of Item`.
2. **Text Fields:** Displays `Name`, `Description`, and `Status`.
3. **The "Claim Item" Button (Core MVP Functionality):**
   - When pressed, executes an **Update Action** on the current resource.
   - **Field Change 1:** Changes `Status` to "Reserved".
   - **Field Change 2:** Sets `Claimed By` to Logged In User.
   - **Redirect Action:** Moves the user to a success screen — _SUPERSEDED: MVP shows the poster's contact handle, no chat. Chat is v2._

## 3. High-Value Architecture Implementation Notes

When writing code or refining this system, ensure the following programmatic guards are met:

- **Data Context Preservation:** Ensure that the routing framework passes the singular state object (the specific resource ID) cleanly from the feed view to the detail view without refetching the entire array.
- **State Mutation Security:** The "Claim Item" operation must run atomically. If User A clicks "Claim," the backend must instantly flip the status bit to prevent concurrent User B from trying to claim the exact same item. — _Implementation: Postgres RPC with row-level lock. See `supabase/schema.sql`._
- **Strict Boolean Guardrails:** Do not allow any API endpoints fetching rows from Shared Resources to respond if the requesting session token belongs to an account where `Is Verified == false`. — _Implementation: RLS policy `is_verified = true` check on every SELECT._

---

_Original PRD ends here. See `FEATURES.md`, `PRIVACY.md`, `DESIGN.md`, and `CLAUDE.md` for implementation source-of-truth._
