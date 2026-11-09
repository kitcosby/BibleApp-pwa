import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const workerSource = await readFile(new URL("../sw.js", import.meta.url), "utf8");

function makeWorker(fetchImpl, cache) {
  const handlers = new Map();
  const self = {
    registration: { scope: "https://reader.example/" },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener(name, handler) { handlers.set(name, handler); },
  };
  const caches = {
    open: async () => cache,
    keys: async () => ["byot-v17", "byot-api-v2"],
    delete: async () => true,
  };
  runInNewContext(workerSource, {
    self, caches, fetch: fetchImpl, URL, Request, Response, Promise,
  });
  return handlers.get("fetch");
}

function makeCache({ hit = null } = {}) {
  const state = { puts: 0, deletes: 0, matches: 0 };
  return {
    state,
    async match() { state.matches += 1; return hit; },
    async put() { state.puts += 1; },
    async delete() { state.deletes += 1; return true; },
  };
}

async function dispatch(handler, request) {
  let responsePromise;
  const event = {
    request,
    respondWith(promise) { responsePromise = Promise.resolve(promise); },
    waitUntil() {},
  };
  handler(event);
  assert.ok(responsePromise, "fetch handler should respond to this request");
  return responsePromise;
}

test("CSRF bootstrap GET bypasses the shared API cache", async () => {
  const cache = makeCache();
  let init;
  const handler = makeWorker(async (_req, options) => {
    init = options;
    return new Response('{"csrf_token":"session-bound"}', {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }, cache);
  const response = await dispatch(handler,
    new Request("https://reader.example/bible/api/auth/csrf"));
  assert.equal(response.status, 200);
  assert.equal(init.cache, "no-store");
  assert.equal(cache.state.matches, 0);
  assert.equal(cache.state.puts, 0);
});

test("bearer-authenticated translation GET bypasses the shared API cache", async () => {
  const cache = makeCache();
  let init;
  const handler = makeWorker(async (_req, options) => {
    init = options;
    return new Response('{"translations":[]}', {
      headers: { "content-type": "application/json", "cache-control": "private, no-store" },
    });
  }, cache);
  const request = new Request("https://reader.example/api/bible/translations", {
    headers: { Authorization: "Bearer user-token" },
  });
  const response = await dispatch(handler, request);
  assert.equal(response.status, 200);
  assert.equal(init.cache, "no-store");
  assert.equal(cache.state.matches, 0);
  assert.equal(cache.state.puts, 0);
});

test("public API no-store responses are not inserted into API cache", async () => {
  const cache = makeCache();
  const handler = makeWorker(async () => new Response('{"ok":true}', {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  }), cache);
  const response = await dispatch(handler,
    new Request("https://reader.example/bible/api/books"));
  assert.equal(response.status, 200);
  assert.equal(cache.state.puts, 0);
});

test("a previously cached no-store response is deleted rather than served", async () => {
  const oldHit = new Response('{"csrf_token":"old-session"}', {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
  const cache = makeCache({ hit: oldHit });
  const handler = makeWorker(async () => new Response('{"csrf_token":"fresh-session"}', {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  }), cache);
  const response = await dispatch(handler,
    new Request("https://reader.example/bible/api/books"));
  assert.equal(await response.text(), '{"csrf_token":"fresh-session"}');
  assert.equal(cache.state.deletes, 1);
  assert.equal(cache.state.puts, 0);
});
