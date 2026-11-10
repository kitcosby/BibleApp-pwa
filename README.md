# BibleApp — Build Your Own Translation

A Hebrew Bible study and reading app delivered as a static, installable progressive web app. The client can be hosted independently of the Bible corpus and authoring services.

## Install on your phone

The app must be opened over HTTPS (or on localhost) for installation and offline use.

**iPhone (Safari):** Open the app in Safari, tap Share, then **Add to Home Screen**.

**Android (Chrome):** Open the app in Chrome, then choose **Install app** or **Add to Home screen** from the browser menu.

The app shell works offline. Bible text and word data already viewed may be available from the service-worker cache. Account sign-in, translation synchronization, and server-backed editing require network access. Existing browser-local rendering choices are preserved; they are not automatically imported into an account translation.

## Files

- `index.html` — application views, rendering logic, and client-side state
- `config.js` — non-secret deployment configuration for corpus, authentication, and authoring API origins
- `manifest.webmanifest` — installable app metadata and icons
- `sw.js` — shell and public-corpus caching; authentication, bearer-authenticated authoring, and indexed word-option requests bypass shared caches
- `icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — app icons

## Service architecture

The PWA is static, but the complete account-backed application uses three independently configurable services:

1. **Corpus API (Flask / `bible-project`)** — public read-only Bible, lexicon, morphology, variant, alignment, and search data. It also supplies the exact live KJV/Young's phrase ordering used by the legacy dropdown.
2. **Account service (same Flask application)** — existing `user_accounts` identities and Werkzeug password hashes. The PWA uses JSON login/signup/logout with a session cookie and session-bound CSRF token.
3. **Authoring API (Express / `BibleApp`)** — translation ownership, translation metadata, Other options, Hebrew word choices, and forward-only lemma defaults. Flask issues a five-minute HS256 identity token; the PWA keeps it in memory and sends it as a bearer token. Express trusts only the verified account ID from that token.

The forum/comment integration remains a separate Lampy-specific service and is not required for core Bible reading or translation authoring.

## Deployment configuration

Set the following non-secret values in `config.js` (or define the corresponding `window.BIBLEAPP_*` values before it loads). Use HTTPS origins for cross-origin deployments and omit trailing slashes.

- `window.BIBLEAPP_API_BASE` — corpus API base; default `/bible`
- `window.BIBLEAPP_AUTH_BASE` — Flask account service base; defaults to the corpus API base
- `window.BIBLEAPP_AUTHORING_API_BASE` — Express API base; default `/api`

With the Lampy Apache mounts, the defaults resolve to Flask at `/bible/api/...` and Express at `/api/bible/...`. For a separately hosted PWA, set the origins independently; do not assume the Flask and Express services share a host.

For cross-origin account requests, configure the exact PWA origin in Flask's `BIBLEAPP_ALLOWED_ORIGINS`. The browser must use credentialed requests for Flask authentication. If the frontend and Flask are cross-site, the Flask session cookie requires `BIBLEAPP_COOKIE_SAMESITE=None` and `BIBLEAPP_COOKIE_SECURE=1`; browser third-party-cookie restrictions may still interfere, so same-site hosting is preferable.

Flask and Express must share the same generated `BIBLEAPP_IDENTITY_TOKEN_SECRET`. Keep it server-side and separate from the Flask session secret and any sandbox token. Configure `BIBLEAPP_SESSION_SECRET` as a stable server-side secret. Never put any of these secrets in `config.js`, the PWA bundle, browser storage, or deployment documentation.

Keep Express private/localhost-only until the shared secret, allowed origins, and full end-to-end ownership tests are configured and verified.

## Account translations and data preservation

- Existing Flask accounts and password hashes remain the identity authority; there is no parallel PWA identity system.
- Built-in KJV (ID 1) and Young's (ID 2) remain public/read-only.
- New translations are private to the authenticated owner.
- Server-backed per-word authoring currently covers the 264,217 Hebrew word IDs. Greek word-choice persistence is not implemented yet.
- Existing `localStorage` rendering choices are not deleted or automatically imported. A separate, explicit migration is required to avoid overwriting or misattributing work.
- A saved choice byte is positional. The client fetches current phrase options from Flask with `Cache-Control: no-store`, and the service worker bypasses its shared cache for that endpoint.
- Account translation edits do not work offline. Public corpus reading remains cacheable/offline where previously viewed.

## Core corpus API

The PWA reads Bible data through the configured corpus API base. Main endpoints include:

- `/api/books`
- `/api/chapters/<book>`
- `/api/verses/<book>/<chapter>`
- `/api/verse/<book>/<chapter>/<verse>`
- `/api/chapter/<book>/<chapter>`
- `/api/word/<Strong's>`
- `/api/word-options?wordIds=<comma-separated IDs>`
- `/api/search?q=<text>`
- `/api/search/variants?q=<Hebrew spelling>`

The word-options endpoint accepts 1–100 Hebrew word IDs and returns the lemma key plus KJV and Young's phrase groups. It is read-only and explicitly non-cacheable because the phrase ordering defines persisted choice bytes.

### Search modes

The Search page offers two separate retrieval paths:

- **Passage meaning** calls `/api/search` and ranks YLT verse text against the existing 31,102 verse embeddings (768-dimensional `nomic-embed-text` vectors).
- **Hebrew spelling** calls `/api/search/variants` and searches the 528,565 reconstructed spelling-variant embeddings. The index is keyed to `(word_id, variant_seq)`, uses the `letters` field (falling back to unpointed/variant text, and to the pointed word for 14 empty-field paseq rows), and retains the source/witness metadata from the corpus.

The variant endpoint accepts Hebrew-script queries, removes Hebrew combining marks before embedding, puts exact spelling matches first, then adds vector-nearest spellings. Its vectors use `nomic-embed-text:latest`, 768 dimensions. Similarity is model proximity, not proof that two forms are lexically or morphologically equivalent. The endpoint is `Cache-Control: no-store`; Hebrew spelling search does not use the offline Genesis sample.

The variant index is a separate read-only search database. The Flask service must be configured with the server-side `BIBLE_VARIANT_SEARCH_DATABASE_URL`; do not put its connection string in the PWA or repository. The existing verse index and `/api/search` behavior remain independent.

## Fallback and offline behavior

- If the corpus API is unreachable or returns non-JSON, the app may show its clearly labeled built-in sample (Genesis 1:1–5 only).
- A JSON `{"error":"not found"}` response with HTTP 404 is authoritative; the app does not substitute sample data.
- Only successful public corpus responses are eligible for the shared API cache.
- Authentication, private authoring requests, and word-option ordering requests bypass shared service-worker caches.
- Offline access does not imply that account changes have synchronized.

## License

Public domain under The Unlicense (see `LICENSE`).
