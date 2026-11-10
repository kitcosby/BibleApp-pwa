import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function searchApiPath(");
const end = html.indexOf("\nasync function search(", start);
assert.ok(start >= 0 && end > start, "search helpers should be present");

const context = {};
runInNewContext(html.slice(start, end), context);

test("passage meaning continues to use the existing verse embedding endpoint", () => {
  assert.equal(
    context.searchApiPath("light in darkness", "passages"),
    "/api/search?q=light%20in%20darkness",
  );
});

test("Hebrew spelling uses the separate variant embedding endpoint", () => {
  assert.equal(
    context.searchApiPath("בראשית", "hebrew"),
    "/api/search/variants?q=%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA",
  );
});

test("Hebrew mode rejects non-Hebrew input before making a request", () => {
  assert.equal(context.isHebrewSearchQuery("בראשית"), true);
  assert.equal(context.isHebrewSearchQuery("בְּרֵאשִׁית"), true);
  assert.equal(context.isHebrewSearchQuery("creation"), false);
});

test("exact Hebrew spelling results are distinguished from embedding neighbors", () => {
  assert.equal(context.searchResultLabel({ match_type: "exact" }, "hebrew"), "exact spelling");
  assert.equal(
    context.searchResultLabel({ match_type: "embedding", score: 0.81234 }, "hebrew"),
    "embedding similarity 0.81",
  );
});

test("passage result labels preserve the computed Young's provenance", () => {
  assert.equal(
    context.searchResultLabel({ source: "ylt-computed" }, "passages"),
    "Young's (computed) text",
  );
});

test("the search view exposes both modes and does not sample-fallback Hebrew queries", () => {
  assert.match(html, /option value="passages"/);
  assert.match(html, /option value="hebrew"/);
  assert.match(html, /mode === "passages" && \/light\/i/);
});


test("Hebrew variant requests have a longer timeout without changing other API timeouts", () => {
  assert.ok(html.includes("const API_TIMEOUT_MS = 8000;"));
  assert.ok(html.includes('path.startsWith("/api/search/variants?") ? 30000 : API_TIMEOUT_MS'));
});

test("Hebrew exact-only fallback visibly identifies unavailable semantic search", () => {
  assert.match(html, /X-Hebrew-Semantic-Search/);
  assert.match(html, /Exact spelling matches are shown; semantic similarity results are temporarily unavailable/);
});
