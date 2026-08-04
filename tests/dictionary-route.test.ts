import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../app/api/dictionary/route.ts";

test("dictionary route normalizes the headword and returns local Duden-Oxford evidence", async () => {
  const response = await GET(
    new Request("https://worttag.example/api/dictionary?term=der%20Zertifikat"),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /stale-while-revalidate/);
  const payload = await response.json();
  assert.equal(payload.headword, "Zertifikat");
  assert.equal(payload.dudenOxford.direction, "德语查询 → 英文对应");
  assert.equal(payload.dudenOxford.found, true);
  assert.equal(payload.dudenOxford.matches[0].english, "leaving");
  assert.equal(payload.dudenOxford.matches[0].match, "compound");
});

test("dictionary route rejects empty and oversized terms", async () => {
  const empty = await GET(new Request("https://worttag.example/api/dictionary"));
  assert.equal(empty.status, 400);
  const oversized = await GET(
    new Request(`https://worttag.example/api/dictionary?term=${"a".repeat(101)}`),
  );
  assert.equal(oversized.status, 400);
});

test("dictionary route returns a stable empty result for an uncovered word", async () => {
  const response = await GET(
    new Request("https://worttag.example/api/dictionary?term=Bef%C3%A4higungsnachweis"),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.headword, "Befähigungsnachweis");
  assert.equal(payload.dudenOxford.found, false);
  assert.deepEqual(payload.dudenOxford.matches, []);
});
