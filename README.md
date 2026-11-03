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

After installing, the app opens offline with the sample data. Your rendering choices are saved on the phone (localStorage).

## Files

- `index.html` — the whole app (data, routes, styles, script)
- `manifest.webmanifest` — app name, colors, icons
- `sw.js` — service worker: the app shell is cached (cache `byot-v1`), other requests go to the network first
- `icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — app icons

## Coming later: live data and semantic search

The sample corpus is Genesis 1:1–5 only. Live corpus data and semantic search will come through the Lampy API. The `SearchResult` shape in `index.html` is the contract that API must return.

## License

Public domain under The Unlicense (see `LICENSE`).
