import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../config.js", import.meta.url), "utf8");

function configure(initial = {}) {
  const window = { ...initial };
  runInNewContext(source, { window });
  return window;
}

test("production defaults target the public core API and derive auth from it", () => {
  const config = configure();
  assert.equal(config.BIBLEAPP_API_BASE, "https://laptop.taila7a335.ts.net:8443/bible");
  assert.equal(config.BIBLEAPP_AUTH_BASE, "https://laptop.taila7a335.ts.net:8443/bible");
  assert.equal(config.BIBLEAPP_AUTHORING_API_BASE, "/api");
});

test("a separately hosted deployment can override all three service origins", () => {
  const config = configure({
    BIBLEAPP_API_BASE: "https://corpus.example",
    BIBLEAPP_AUTH_BASE: "https://accounts.example",
    BIBLEAPP_AUTHORING_API_BASE: "https://authoring.example/api",
  });
  assert.equal(config.BIBLEAPP_API_BASE, "https://corpus.example");
  assert.equal(config.BIBLEAPP_AUTH_BASE, "https://accounts.example");
  assert.equal(config.BIBLEAPP_AUTHORING_API_BASE, "https://authoring.example/api");
});

test("a same-origin deployment can retain its own API and auth bases", () => {
  const config = configure({
    BIBLEAPP_API_BASE: "/bible",
    BIBLEAPP_AUTH_BASE: "/bible",
  });
  assert.equal(config.BIBLEAPP_API_BASE, "/bible");
  assert.equal(config.BIBLEAPP_AUTH_BASE, "/bible");
});
