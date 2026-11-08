# BibleApp — Build Your Own Translation

A Hebrew Bible study and reading app, as one static page (`index.html`). It is also an installable app (PWA) for iPhone and Android. No build step and no server code: any static host can serve the folder, including from a subpath.

## Install on your phone

The app must be opened over HTTPS (or on localhost) for installing and offline use.

**iPhone (Safari):**

1. Open the app's address in Safari.
2. Tap the Share button.
3. Tap **Add to Home Screen**, then **Add**.

**Android (Chrome):**

1. Open the app's address in Chrome.
2. Tap the install prompt ("Install app"), or open the menu (⋮) and tap **Install app** / **Add to Home screen**.

The app opens offline. Verses you have viewed while online are kept in the phone's cache and reopen offline. Your rendering choices are saved on the phone (localStorage).

## Files

- `index.html` — the app (data, routes, styles, script)
- `config.js` — deployment-specific core API base URL (defaults to same-origin `/bible`)
- `manifest.webmanifest` — app name, colors, icons
- `sw.js` — service worker (cache `byot-v17`): the app shell and `config.js` are cached; database API responses use stale-while-revalidate (`byot-api-v2`); only successful JSON is cached
- `icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — app icons

## Live data (Lampy database API)

The app reads the Bible database only through a read-only JSON API (GET only). Set `window.BIBLEAPP_API_BASE` in `config.js` to the API base URL, without a trailing slash. The default is `/bible`, so a same-origin deployment calls `/bible/api/...`. For a portable deployment, set this value to the chosen core API origin/path. The client uses exactly this configured base; it no longer probes or falls back to hard-coded Lampy addresses. The API must permit the static app's origin through its CORS policy when hosted cross-origin.

Endpoints the app uses: `/api/books`, `/api/chapters/<book>`, `/api/verses/<book>/<chapter>`, `/api/verse/<book>/<chapter>/<verse>`, `/api/chapter/<book>/<chapter>`, `/api/word/<Strong's>`, `/api/search?q=<text>`.

Fallback rules:

- If the API is unreachable, or a reply is not JSON (for example an HTML 404 from a plain static server), the app shows the built-in sample with a notice. The sample is Genesis 1:1–5 only. Nothing is invented beyond it.
- A JSON reply `{"error":"not found"}` with HTTP 404 means the item is not in the database. The app shows "not found" and does not use the sample.
- Successful replies are kept in memory. After a failure, the same request is not retried for 30 seconds.

Your rendering choices stay on the device and apply on top of live data.

## License

Public domain under The Unlicense (see `LICENSE`).
