// Deployment configuration for the BibleApp core API.
// Keep this file free of credentials and other secrets.
// Use a relative path for same-origin deployments, or an HTTPS origin/path
// for a separately hosted core API. Do not add a trailing slash.
window.BIBLEAPP_API_BASE = window.BIBLEAPP_API_BASE || "https://laptop.taila7a335.ts.net:8443/bible";

// Authentication stays with the existing Flask account service.
// Defaults match the Lampy same-origin mount; portable deployments may
// configure the auth and authoring API origins independently.
window.BIBLEAPP_AUTH_BASE = window.BIBLEAPP_AUTH_BASE || window.BIBLEAPP_API_BASE || "/bible";
window.BIBLEAPP_AUTHORING_API_BASE = window.BIBLEAPP_AUTHORING_API_BASE || "/api";
