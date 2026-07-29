import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../app/api/dictionary/route.ts";

test("dictionary route normalizes the headword and returns licensed evidence", async () => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.startsWith("https://api.wiktapi.dev/")) {
      return Response.json({
        definitions: [{
          pos: "noun",
          senses: [{
            glosses: ["Straße innerhalb eines Ortes"],
            examples: [{ text: "Die Straße ist ruhig." }],
          }],
        }],
      });
    }
    return Response.json([{
      lemma: "Straße",
      wortart: "Substantiv (Femininum)",
      url: "/wb/Straße",
    }]);
  };

  try {
    const response = await GET(
      new Request("https://worttag.example/api/dictionary?term=die%20Stra%C3%9Fe"),
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /stale-while-revalidate/);
    const payload = await response.json();
    assert.equal(payload.headword, "Straße");
    assert.equal(payload.openDictionary.found, true);
    assert.equal(payload.openDictionary.senses[0].gloss, "Straße innerhalb eines Ortes");
    assert.equal(payload.dwds.lemma, "Straße");
    assert.equal(
      payload.openDictionary.sourceUrl,
      "https://de.wiktionary.org/wiki/Stra%C3%9Fe",
    );
    assert.deepEqual(requested, [
      "https://api.wiktapi.dev/v1/de/word/Stra%C3%9Fe/definitions?lang=de",
      "https://www.dwds.de/api/wb/snippet/?q=Stra%C3%9Fe",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dictionary route rejects empty and oversized terms", async () => {
  const empty = await GET(new Request("https://worttag.example/api/dictionary"));
  assert.equal(empty.status, 400);
  const oversized = await GET(
    new Request(`https://worttag.example/api/dictionary?term=${"a".repeat(101)}`),
  );
  assert.equal(oversized.status, 400);
});

test("dictionary route keeps source links when upstream services are unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("upstream unavailable");
  };

  try {
    const response = await GET(
      new Request("https://worttag.example/api/dictionary?term=etwas"),
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.headword, "etwas");
    assert.equal(payload.openDictionary.found, false);
    assert.equal(payload.dwds.found, false);
    assert.equal(
      payload.openDictionary.sourceUrl,
      "https://de.wiktionary.org/wiki/etwas",
    );
    assert.equal(payload.dwds.sourceUrl, "https://www.dwds.de/wb/etwas");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
