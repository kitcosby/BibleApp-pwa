Living document — update these diagrams when adding features.

# BibleApp-pwa — Architecture

**Build Your Own Translation (BYOT)** as an installable progressive web app: one static page (`index.html` — data, routes, styles, and script in a single file), a web app manifest, and a service worker. No build step and no server code of its own: any static host can serve the folder, including from a subpath. It is the reader client of the **bible-project** corpus: all Bible data arrives through bible-project's read-only JSON API (see bible-project's `docs/architecture.md`, Phase 3 API). This document was created in the 2026-11-07 diagram-maintenance run — the first architecture doc for this repo (created 2026-11-03; HEAD at writing `d915f4ac`, service-worker cache `byot-v16`).

The app has six views — Home (table of contents), Study (build-a-translation sentence), Read, Word (word card), Search, and About — covering the 66-book canon (OT 39 / NT 27, KJV order). Hebrew-track verses are built from the API's word frames; Greek-track (NT) verses from its `greek_words` frames, with Byzantine/SBLGNT variant frames swapped in when the reader's default tradition is not TR. When the API is unreachable the app falls back to a **labeled built-in sample (Genesis 1:1–5 only)** — nothing is invented beyond it — and the footer follows the data state (sample notice only while sample data is on screen; "Connected to the Bible database." when live).

## 1. Context diagram (level 0)

```mermaid
flowchart LR
    E1["Reader (phone or desktop browser)"]
    E2["Static file host"]
    E3["bible-project JSON API (Lampy host)"]
    P0("BibleApp-pwa (BYOT) system")
    E1 -->|"install and navigation requests (HTTPS)"| P0
    E2 -->|"app shell files (index.html, manifest, sw.js, icons)"| P0
    P0 -->|"app pages and offline-capable shell"| E1
    P0 -->|"read-only JSON API requests (GET /api/books, /api/chapters, /api/verses, /api/verse, /api/chapter, /api/word, /api/search)"| E3
    E3 -->|"JSON verse, word, and search payloads"| P0
    P0 -->|"rendered Study, Read, Word, Search, and About views"| E1
```

The static host is inside the delivery path only: it serves the shell once (and on updates); after the service worker registers, repeat visits are served from the shell cache. The system boundary is the app as delivered to the browser (page + service worker + browser storage); the API and its database are outside it.

## 2. Level-1 data flow diagram

```mermaid
flowchart LR
    E1["Reader (phone or desktop browser)"]
    E2["Static file host"]
    E3["bible-project JSON API (Lampy host)"]
    P1("1.0 Register service worker and cache app shell")
    P2("2.0 Probe API bases and fetch JSON payloads")
    P3("3.0 Render Home table of contents")
    P4("4.0 Build Study sentence from word frames")
    P5("5.0 Render Read view")
    P6("6.0 Render word card")
    P7("7.0 Search the corpus")
    P8("8.0 Fall back to built-in sample")
    D1[("D1 App shell cache (byot-v16)")]
    D2[("D2 API response cache (byot-api-v2)")]
    D3[("D3 Rendering choices (localStorage byotChoices)")]
    D4[("D4 Variant defaults and per-word overrides (localStorage byotVariantDefaults, byotVariantWords)")]
    D5[("D5 Base-text toggle (localStorage byotBase)")]
    D6[("D6 Pending search query (sessionStorage byotPendingQuery)")]
    D7[("D7 In-memory API memo (successful responses only)")]
    D8[("D8 Built-in sample corpus (Genesis 1:1-5, inside index.html)")]
    E1 -->|"first visit and update requests"| P1
    E2 -->|"shell files"| P1
    P1 -->|"shell files cached"| D1
    D1 -->|"shell files served offline"| P3
    E1 -->|"book, chapter, verse, word, and search requests"| P2
    P2 -->|"GET requests in probe order (public funnel, tailnet, same-host)"| E3
    E3 -->|"JSON payloads"| P2
    P2 -->|"successful JSON responses cached (stale-while-revalidate)"| D2
    D2 -->|"cached JSON responses offline"| P2
    P2 -->|"successful responses memoized"| D7
    D7 -->|"memoized payloads"| P4
    P2 -->|"unreachable or non-JSON response"| P8
    P8 -->|"sample books, verses, and words"| D8
    D8 -->|"labeled sample payloads"| P4
    P2 -->|"book list payload"| P3
    P3 -->|"table of contents (66 books, split by testament)"| E1
    P2 -->|"verse payload (word frames, variant frames, witnesses)"| P4
    D3 -->|"per-word rendering choices"| P4
    D4 -->|"default tradition per testament and per-word tradition overrides"| P4
    D5 -->|"base text preference per view (KJV or Young's)"| P4
    P4 -->|"Study sentence with reader substitutions"| E1
    E1 -->|"rendering choice selections"| P4
    P4 -->|"updated rendering choices"| D3
    P4 -->|"updated variant defaults and overrides"| D4
    P4 -->|"updated base-text preference"| D5
    P2 -->|"chapter payload (verse frames in English order)"| P5
    D3 -->|"per-word rendering choices"| P5
    D5 -->|"base text preference per view"| P5
    P5 -->|"Read pages with word links"| E1
    P2 -->|"word payload (lemma, gloss, renderings, context)"| P6
    P6 -->|"word card with verse-context navigation"| E1
    E1 -->|"search query"| P7
    P7 -->|"pending query hand-off"| D6
    D6 -->|"pending query"| P7
    P7 -->|"search request (via 2.0)"| P2
    P2 -->|"search result payload"| P7
    P7 -->|"search results"| E1
```

Process grounding (all in `index.html` unless noted): 1.0 registers `sw.js` on window load; the worker precaches the shell (`./`, `index.html`, `manifest.webmanifest`, four icons) cache-first under `byot-v16`, deletes non-keep caches on activate, and claims clients. 2.0 is the `apiGet`/`apiTry` layer: `API_BASES` in probe order — `https://laptop.taila7a335.ts.net:8443/bible` (public funnel), `https://laptop.taila7a335.ts.net/bible` (tailnet), `/bible` (same-host) — all reaching the same API; a base that answers stays selected for the session (`apiBaseIdx`); 8 s timeout per try; only successful results are memoized; after a failure the same path is not retried for 30 s (`API_COOLDOWN_MS`). Response classification: non-JSON (including an HTML 404 from a plain static server) = unreachable; JSON `{"error":"not found"}` with HTTP 404 = authoritative not-found, **no sample fallback**. API GETs are also cached by the service worker under `byot-api-v2` (stale-while-revalidate, successful JSON only; 503 when offline with no cache). 4.0 builds the Study sentence in English order from the verse's actual Young's text with the reader's choices substituted at each word's own phrase (KJV base = `kjv_sentence` anchor spans); under a non-TR default tradition the frames are that tradition's own (`greek_words_variants` byz/sbl arrays, with that tradition's bridge KJV/computed-Young's phrases). Choice semantics (`effective()`): a stored choice is `kjv`, `youngs`, or custom text; the default mode is KJV in Read and Young's in Study. 8.0 serves only the Genesis 1:1–5 sample, always labeled.

## 3. Entity–relationship diagram (browser-side data)

The app owns no server data. Its persistent data is browser storage: two service-worker caches and four Web Storage keys. Payload entities are the API's shapes as consumed (see bible-project's ERD for the server schema); only the fields this app reads are shown.

```mermaid
erDiagram
    RENDERING_CHOICE {
        string strongs PK "word key (H or G number)"
        string mode "kjv, youngs, or custom"
        string text "custom rendering text, custom mode only"
    }
    VARIANT_DEFAULT {
        string testament PK "OT or NT"
        string tradition "MT/SP/DSS set (OT) or tr/byz/sbl (NT)"
    }
    VARIANT_WORD_OVERRIDE {
        string word_key PK "per-word key"
        string tradition "tradition chosen for this word"
    }
    BASE_PREFERENCE {
        string view PK "study or read"
        string base "kjv or youngs"
    }
    PENDING_QUERY {
        string query "search text handed across views"
    }
    SHELL_FILE {
        string path PK "index.html, manifest.webmanifest, icons"
        string cache_name FK "byot-v16"
    }
    CACHED_API_RESPONSE {
        string url PK "API path requested"
        string cache_name FK "byot-api-v2"
        string json "successful JSON response body"
    }
    VERSE_PAYLOAD {
        int book_id FK
        int chapter
        int verse
        string testament "OT or NT"
    }
    WORD_FRAME {
        string strongs FK "links payload words to stored choices"
        string kjv "KJV phrase for the word"
        string ylt "computed Young's phrase for the word"
        string gloss "lemma gloss"
    }
    VARIANT_DEFAULT ||--o{ VARIANT_WORD_OVERRIDE : "overridden per word by"
    VERSE_PAYLOAD ||--o{ WORD_FRAME : "contains"
    WORD_FRAME o|--o| RENDERING_CHOICE : "rendered by"
    CACHED_API_RESPONSE o|--o{ VERSE_PAYLOAD : "carries"
```

Notes on the ERD: Web Storage keys are JSON objects, not tables — `byotChoices` maps a word's Strong's key to its choice (`mode` + optional custom `text`), `byotVariantDefaults` maps testament → tradition, `byotVariantWords` maps a per-word key → tradition, `byotBase` maps view → base text; `byotPendingQuery` (sessionStorage) is a single transient value, drawn as an entity for completeness. The storage keys share no storage-level foreign keys — the relationships above are the app's own logical links (a choice applies to a word frame by its Strong's key; an override refines a default). `SHELL_FILE` and `PENDING_QUERY` stand unconnected because nothing in storage references them by key. Cache names are versioned (`byot-v16`, `byot-api-v2` at HEAD) and old caches are deleted on worker activation.

## Grounding notes

- OBSERVED (README.md): one static page (`index.html` — "the whole app (data, routes, styles, script)"), installable PWA for iPhone/Android, no build step, any static host incl. subpath; HTTPS or localhost required for install/offline; viewed verses are kept in the phone's cache and reopen offline; rendering choices are saved on the phone (localStorage). README's file list names `manifest.webmanifest` and `sw.js` (its cache names there — `byot-v2` / `byot-api-v2` — are stale against the code at HEAD; see the sw.js bullet).
- OBSERVED (README.md, "Live data"): the app reads the Bible database only through the read-only GET JSON API on the same host as the app, base path constant `API_BASE` default `/bible`; endpoints used: `/api/books`, `/api/chapters/<book>`, `/api/verses/<book>/<chapter>`, `/api/verse/<book>/<chapter>/<verse>`, `/api/chapter/<book>/<chapter>`, `/api/word/<Strong's>`, `/api/search?q=<text>`; fallback rules as drawn in 2.0/8.0 (sample is Genesis 1:1–5 only; JSON 404 = not found, no sample; successes kept in memory; 30 s retry cooldown). The README's single-base description is superseded in detail by the `API_BASES` probe list observed in `index.html` at HEAD (three bases, session-sticky).
- OBSERVED (`index.html` at HEAD `d915f4ac`): the `API_BASES` array and probe/sticky/timeout/cooldown/memo rules quoted in the process grounding; the six view functions (`viewHome`, `viewStudy`, `viewRead`, `viewWord`, `viewSearch`, `viewAbout`); the choice store (`byotChoices`; `effective()` defaults: Read → KJV, Study → Young's; custom mode returns the stored text); variant stores (`byotVariantDefaults`, `byotVariantWords`); base toggle store (`byotBase`, sticky per view); search hand-off (`byotPendingQuery`, sessionStorage); service-worker registration of `sw.js` on load; the sample fallback block ("SAMPLE FALLBACK (Genesis 1:1–5 only)"); OT traditions named in code (Masoretic base, Samaritan Pentateuch witness "SP", DSS); NT variant frames consumed from `greek_words_variants` with per-tradition bridge phrases and "verse not present in this tradition" notes; footer text following the data state.
- OBSERVED (`sw.js` at HEAD): shell cache `CACHE = "byot-v16"`, API cache `API_CACHE = "byot-api-v2"`, `KEEP = [CACHE, API_CACHE]`; shell precache list (`./`, `index.html`, `manifest.webmanifest`, `icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`); API paths (pathname containing `/api/`) get stale-while-revalidate with only successful JSON cached and a plain-text 503 when offline with no cache; shell URLs cache-first; everything else network-first with cache fallback (successful and opaque responses kept).
- OBSERVED (`manifest.webmanifest` at HEAD): name "Build Your Own Translation", short_name "BYOT", `start_url`/`scope`/`id` relative (`.` / `./`), display `standalone`, orientation `portrait`, theme `#2B2118`, background `#FFFCF0`, four icons (192/512 any, 512 maskable, 180).
- OBSERVED (commit history, 2026-11-03/04/07): repo created 2026-11-03 from the round-4 prototype (492eab6b) with manifest/icons/SW byot-v1; live API client + sample fallback (8d8bf974); dual-base probe (e7b62455 — the third, same-host base is in the HEAD code); NT client with 66-book canon and G-number cards (222c9dda, 35b979a6); default-variant dropdowns sticky per testament + per-word overrides (b16f0e30); Study sentence rebuilt in English order and KJV/Young's base toggle sticky per view (3ea56403, 7e90d722); word-page Renderings panel from the API's corpus-wide phrase lists (97c55fe2); About tab with repo and license roll (bf5075b3); variant traditions speaking with their own bridge phrases (d915f4ac, 2026-11-07, HEAD).
- INFERRED: the DFD process boundaries group the single file's functions by view/feature; the repo has no module boundaries to observe. `VERSE_PAYLOAD` / `WORD_FRAME` attribute lists show only the fields the client code reads by name; the authoritative payload schema is bible-project's.
