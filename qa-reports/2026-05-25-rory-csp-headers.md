# Rory — CSP Headers Proposal: vercel.json

**Date:** 2026-05-25
**Author:** Rory (DevOps Engineer)
**Branch:** `release/auto-2026-05-25-rory-csp-headers`
**Trigger:** Steve's web security pass (`2026-05-25-steve-web-security.md`) flagged ADVISORY (MEDIUM): no Content Security Policy headers on the Vercel deployment.
**Mode:** Config file proposal — NOT a deployment action (Const. Art. 5). Sky deploys when ready.

---

## Summary

Added `headers` block to `vercel.json` with a Content Security Policy and three supporting security headers. Also tightened the existing `rewrites` rule to the more precise SPA-safe pattern.

**One adjustment from the task template:** `https://unpkg.com` was removed from `style-src`. Reason: Leaflet CSS is loaded via `import 'leaflet/dist/leaflet.css'` in `src/components/PlatformMapView.web.tsx` — Metro/Expo bundles it at build time. No CDN fetch occurs at runtime, so allowing `https://unpkg.com` would be unnecessary exposure.

---

## Final `vercel.json` Content

```json
{
  "buildCommand": "npx expo export --platform web",
  "installCommand": "npm install --legacy-peer-deps",
  "outputDirectory": "dist",
  "framework": null,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://exp.host; img-src 'self' data: https://*.tile.openstreetmap.org blob:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/((?!api/.*).*)",
      "destination": "/index.html"
    }
  ]
}
```

---

## CSP Directive Breakdown

### `default-src 'self'`

The catch-all fallback. Any resource type not explicitly listed below falls back to this — only same-origin loads are permitted. This means an attacker-injected `<object>`, `<embed>`, `<applet>`, or any other resource type not covered by a specific directive will be blocked by default.

### `script-src 'self' 'unsafe-inline'`

- `'self'` — allows loading `.js` files served from the same origin (the Vercel deployment).
- `'unsafe-inline'` — **required for Expo web.** Metro's runtime bundles inline scripts into `index.html` to bootstrap the React Native web runtime. Removing this would break the app on every page load. This is a known Expo web limitation — Metro does not use nonces or hashes for its inline bootstrap script, so `'unsafe-inline'` is the only viable option until Expo provides CSP-hash support.

**Why not `'nonce-...'` or `'hash-...'`?** Expo's web build tool (`@expo/webpack-config` or Metro web bundler) does not output CSP hashes for its inline scripts, and the hashes change every build. A hash-based approach would require a custom post-build script and maintenance overhead. `'unsafe-inline'` is the accepted trade-off for Expo web until upstream support lands.

### `style-src 'self' 'unsafe-inline'`

- `'self'` — allows bundled stylesheets served from the Vercel origin.
- `'unsafe-inline'` — React Native Web applies styles via JavaScript-generated inline `style` attributes and `<style>` tags. This is how RNW handles its cross-platform layout engine; removing it breaks the app visually.
- **`https://unpkg.com` was intentionally omitted.** Leaflet CSS is imported as `import 'leaflet/dist/leaflet.css'` in `src/components/PlatformMapView.web.tsx`, which causes Metro/Expo to bundle the CSS at build time into the static output. No runtime CDN fetch occurs. Allowing `https://unpkg.com` would be unnecessary exposure surface.

### `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://exp.host`

- `'self'` — same-origin XHR/fetch.
- `https://*.supabase.co` — covers Supabase REST API calls (PostgREST), Auth API, and Storage API. The wildcard is needed because the project URL includes the project ref (e.g., `abcdefgh.supabase.co`).
- `wss://*.supabase.co` — covers Supabase Realtime websocket connections. The app subscribes to resource changes in real time; this directive allows the WSS handshake and persistent connection.
- `https://exp.host` — Expo's update/OTA manifest host. The web build may check for updates on load. Safe to include; blocked if absent on OTA-enabled builds.

### `img-src 'self' data: https://*.tile.openstreetmap.org blob:`

- `'self'` — images served from the Vercel origin (Expo web may inline some assets as same-origin files).
- `data:` — base64-encoded data URIs. React Native Web and some icon libraries (including Expo Vector Icons on web) embed small images as `data:` URIs. Required for icon rendering.
- `https://*.tile.openstreetmap.org` — **load-bearing for the map screen.** Leaflet's `TileLayer` fetches map tiles from OpenStreetMap's tile CDN (`tile.openstreetmap.org`, `a.tile.openstreetmap.org`, `b.tile.openstreetmap.org`, `c.tile.openstreetmap.org`). The wildcard captures all subdomains. Removing this would show a blank map.
- `blob:` — Expo web occasionally creates `blob:` object URLs for image assets (e.g., when using `expo-image` or certain React Native Image implementations on web). Including this prevents blank images in edge cases.

### `font-src 'self'`

Fonts are bundled by Metro into the static output and served from the same Vercel origin. No CDN font loads occur. `'self'` is sufficient and more restrictive than the alternatives.

### `frame-ancestors 'none'`

Prevents the app from being embedded in an `<iframe>` on any other domain. This is a clickjacking mitigation. Works in tandem with `X-Frame-Options: DENY` (below) — `frame-ancestors` is the modern CSP equivalent; `X-Frame-Options` is the fallback for older browsers that don't parse CSP.

### `base-uri 'self'`

Restricts `<base href="...">` to same-origin values only. Without this, a stored XSS attack could inject a `<base>` tag to redirect all relative URLs to an attacker-controlled origin. A low-cost, high-value directive.

---

## Supporting Headers

### `X-Frame-Options: DENY`

Legacy clickjacking protection for browsers that do not process `frame-ancestors` in CSP. Dual-layer with `frame-ancestors 'none'` above. Vercel passes this through as a static header on all routes.

### `X-Content-Type-Options: nosniff`

Prevents the browser from MIME-sniffing a response away from the declared `Content-Type`. Without this, a browser might execute a JavaScript file served with a wrong MIME type, or treat an image response as HTML. Simple header, blocks an entire class of content-type confusion attacks.

### `Referrer-Policy: strict-origin-when-cross-origin`

Controls how much referrer information is sent in the `Referer` HTTP header:
- **Same-origin requests:** full URL is sent (useful for analytics).
- **Cross-origin HTTPS→HTTPS:** only the origin is sent (e.g., `https://mutual-mesh.vercel.app`), not the path.
- **HTTPS→HTTP (downgrade):** no referrer is sent at all.

This protects user navigation paths from leaking to third-party origins (Supabase, OpenStreetMap) while preserving same-origin referrer data. Important for a privacy-first app: a path like `/resource/abc123` in the Referer header could expose resource IDs to map tile servers.

---

## Rewrites Rule Change

**Before:** `"source": "/(.*)"` — matches everything including `/api/` routes.

**After:** `"source": "/((?!api/.*).*)"` — excludes `/api/` paths from the SPA fallback. This is the standard Expo web SPA rewrite pattern. MutualMesh currently has no `/api/` routes (it's a static export), but this future-proofs the config: if a Vercel Edge Function or API route is added later under `/api/`, it won't be swallowed by the SPA rewrite.

---

## Pre-Commit Verification Checklist

| Check | Result |
|---|---|
| `connect-src` includes `https://*.supabase.co` | PASS |
| `connect-src` includes `wss://*.supabase.co` (Realtime) | PASS |
| `img-src` includes `https://*.tile.openstreetmap.org` (Leaflet tiles) | PASS |
| `img-src` includes `blob:` (Expo web image edge cases) | PASS |
| `style-src` includes `https://unpkg.com` — needed? | NOT NEEDED — Leaflet CSS is bundled by Metro via `import 'leaflet/dist/leaflet.css'` in `PlatformMapView.web.tsx`. Omitted. |
| `script-src 'unsafe-inline'` preserved for Expo web Metro runtime | PASS |
| Existing build config (`buildCommand`, `installCommand`, `outputDirectory`, `framework`) preserved | PASS |
| SPA rewrite preserved with improved `api/` exclusion pattern | PASS |
| No `app.json` or `eas.json` modified | PASS |
| No `~/.claude/**` modified | PASS |
| Branch is NOT main | PASS — `release/auto-2026-05-25-rory-csp-headers` |

---

## Decisions for Sky

None required. This is a safe config-file addition with no live deployment action.

**When ready to ship:** merge `release/auto-2026-05-25-rory-csp-headers` to main and trigger a new Vercel deployment. CSP headers will take effect immediately on the next deployment.

**Optional follow-up (not blocking):** Once the app is stable in production with this CSP, consider adding `Content-Security-Policy-Report-Only` mode first to validate the directives against real traffic before enforcing. This requires a CSP violation report endpoint (e.g., a Supabase Edge Function or a third-party service like Report URI).
