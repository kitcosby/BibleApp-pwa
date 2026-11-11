import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const helperStart = html.indexOf("function searchApiPath(");
const helperEnd = html.indexOf("\nasync function search(q, mode", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "search helpers should be present");
const searchStart = helperEnd + 1;
const searchEnd = html.indexOf("\n/* ============ RENDERING PIECES", searchStart);
assert.ok(searchEnd > searchStart, "search function should be present");
const searchSource = html.slice(helperStart, searchEnd);
const timeoutStart = html.indexOf("async function apiTry(");
const timeoutEnd = html.indexOf("\nasync function apiGet(", timeoutStart);
assert.ok(timeoutStart >= 0 && timeoutEnd > timeoutStart, "API request helper should be present");
const timeoutSource = html.slice(timeoutStart, timeoutEnd);
const viewStart = html.indexOf("async function viewSearch(");
const viewEnd = html.indexOf("\n/* ============ ROUTER + EVENTS", viewStart);
assert.ok(viewStart >= 0 && viewEnd > viewStart, "search view should be present");
const viewSource = html.slice(viewStart, viewEnd);
const modeStart = html.indexOf("function handleSearchModeChange(");
const modeEnd = html.indexOf("\ndocument.addEventListener(\"change\"", modeStart);
assert.ok(modeStart >= 0 && modeEnd > modeStart, "search mode change helper should be present");
const modeSource = html.slice(modeStart, modeEnd);
const footerStart = html.indexOf("function footerNote(");
const footerEnd = html.indexOf("\nfunction setFooter(", footerStart);
assert.ok(footerStart >= 0 && footerEnd > footerStart, "footer state helper should be present");

function basicSearchContext(overrides = {}) {
  const context = {
    API_TIMEOUT_MS: 8000,
    fromApi: async (_path, fallback) => ({
      data: fallback ? fallback() : [],
      sample: false,
    }),
    sampleSearch: q => [{ ref: "Genesis 1:1", text: q, source: "sample" }],
    arr: value => Array.isArray(value) ? value : [],
    ...overrides,
  };
  runInNewContext(searchSource, context);
  return context;
}

test("passage meaning continues to use the existing verse embedding endpoint", () => {
  const context = basicSearchContext();
  assert.equal(context.searchApiPath("light in darkness", "passages"), "/api/search?q=light%20in%20darkness");
});

test("Hebrew spelling uses the separate variant embedding endpoint", () => {
  const context = basicSearchContext();
  assert.equal(context.searchApiPath("בראשית", "hebrew"), "/api/search/variants?q=%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA");
});

test("Hebrew mode rejects non-Hebrew input before making a request", () => {
  const context = basicSearchContext();
  assert.equal(context.isHebrewSearchQuery("בראשית"), true);
  assert.equal(context.isHebrewSearchQuery("בְּרֵאשִׁית"), true);
  assert.equal(context.isHebrewSearchQuery("creation"), false);
});

test("exact Hebrew spelling results are distinguished from embedding neighbors", () => {
  const context = basicSearchContext();
  assert.equal(context.searchResultLabel({ match_type: "exact" }, "hebrew"), "exact spelling");
  assert.equal(context.searchResultLabel({ match_type: "embedding", score: 0.81234 }, "hebrew"), "embedding similarity 0.81");
});

test("passage result labels preserve the computed Young's provenance", () => {
  const context = basicSearchContext();
  assert.equal(context.searchResultLabel({ source: "ylt-computed" }, "passages"), "Young's (computed) text");
});

test("the search view exposes both modes and gates the Genesis sample to passage mode", () => {
  assert.match(html, /option value="passages"/);
  assert.match(html, /option value="hebrew"/);
  assert.match(html, /mode === "passages" && \/light\/i/);
});

test("Hebrew variant requests use 45 seconds while passage requests keep 8 seconds", async () => {
  const delays = [];
  class FakeAbortController { constructor(){ this.signal = {}; } abort(){} }
  const context = {
    API_TIMEOUT_MS: 8000,
    AbortController: FakeAbortController,
    setTimeout: (_fn, ms) => { delays.push(ms); return delays.length; },
    clearTimeout: () => {},
    fetch: async () => ({ ok:true, status:200, headers:{get:()=>null}, text:async()=>"[]" }),
    JSON,
  };
  runInNewContext(timeoutSource, context);
  await context.apiTry("/api", "/api/search/variants?q=בראשית");
  await context.apiTry("/api", "/api/search?q=light");
  assert.deepEqual(delays, [45000, 8000]);
});

test("Hebrew exact-only outage warning is shown while exact results remain rendered", async () => {
  const context = {
    lastSearchMode: "hebrew",
    esc: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;"),
    errorBlock: message => "<ERROR>" + message,
    bannerFor: () => "",
    searchResultLabel: result => result.match_type === "exact" ? "exact spelling" : "embedding similarity",
    search: async () => ({
      data: [{ match_type:"exact", spelling:"בראשית", score:null, ref:"Genesis 1:1",
        book_id:1, chapter:1, verse:1, pointed:"בְּרֵאשִׁית", strongs:"H7225",
        variant_source:"OSHB", witness:"MT" }],
      sample:false, semanticUnavailable:true,
    }),
  };
  runInNewContext(viewSource, context);
  const view = await context.viewSearch("בראשית");
  assert.match(view.html, /Exact spelling matches are shown; semantic similarity results are temporarily unavailable/);
  assert.match(view.html, /בראשית/);
  assert.match(view.html, /Genesis 1:1/);
  assert.match(view.html, /exact spelling/);
  assert.equal(view.sample, false);
});

test("Hebrew search never invokes the Genesis sample fallback; passage mode may", async () => {
  const calls = [];
  const context = basicSearchContext({
    fromApi: async (path, fallback) => {
      calls.push({ path, fallbackValue: fallback ? fallback() : null });
      return { data:[], sample:false };
    },
  });
  await context.search("בראשית", "hebrew");
  await context.search("light", "passages");
  assert.equal(calls[0].path, "/api/search/variants?q=%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA");
  assert.equal(calls[0].fallbackValue, null);
  assert.equal(calls[1].fallbackValue[0].source, "sample");
});

test("switching search modes preserves the typed query and re-renders the selected mode", async () => {
  const context = { lastQuery:null, lastSearchMode:"passages", renderCount:0, rendered:[] };
  context.render = async () => {
    context.renderCount += 1;
    context.rendered.push({ query:context.lastQuery, mode:context.lastSearchMode });
    return context.rendered.at(-1);
  };
  runInNewContext(modeSource, context);
  await context.handleSearchModeChange("hebrew", "בראשית");
  await context.handleSearchModeChange("passages", "light");
  assert.equal(context.renderCount, 2);
  assert.deepEqual(context.rendered, [
    { query:"בראשית", mode:"hebrew" },
    { query:"light", mode:"passages" },
  ]);
});

test("D11 fixed: footer claims a connection only after live data is confirmed", () => {
  const context = {};
  runInNewContext(html.slice(footerStart, footerEnd), context);
  // Not yet known: no connection claim.
  const initial = context.footerNote(false, false);
  assert.ok(!initial.includes("Connected to the Bible database"),
    "initial footer must not claim a connection before any request has run");
  assert.equal(initial, "Reads from the Bible database when it is reachable; otherwise a labeled built-in sample (Genesis 1:1–5). Young's renderings are computed alignments, labeled as such.");
  // Live data confirmed by an actual API answer: the claim is earned.
  assert.equal(context.footerNote(false, true), "Connected to the Bible database. Young's renderings are computed alignments, labeled as such.");
  // Sample state dominates, whatever the live flag says.
  const sampleNote = "Showing the built-in sample (Genesis 1:1–5) — the Bible database is unreachable right now. Young's renderings are computed alignments, labeled as such.";
  assert.equal(context.footerNote(true, false), sampleNote);
  assert.equal(context.footerNote(true, true), sampleNote);
});
