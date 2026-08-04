import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

const publicRoot = new URL("../public/", import.meta.url);

test("ships one fixed Anna sentence recording for every Core 6000 word", async () => {
  const manifest = JSON.parse(await readFile(new URL("audio/examples/manifest.json", publicRoot), "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.voice, "Anna");
  assert.equal(manifest.language, "de-DE");
  assert.equal(manifest.format, "m4a/aac");
  assert.equal(manifest.count, 6000);
  assert.equal(Object.keys(manifest.files).length, 6000);

  const levelCounts = new Map();
  await Promise.all(Object.entries(manifest.files).map(async ([id, url]) => {
    assert.match(id, /^core6000-/u);
    assert.match(url, /^\/audio\/examples\/(?:a1|a2|b1|b2|c1)\/anna\/core6000-[^/]+\.m4a$/u);
    const path = new URL(url.slice(1), publicRoot);
    const file = await stat(path);
    assert.ok(file.size > 0, `${id} has an empty recording`);
    const level = url.split("/")[3];
    levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
  }));

  assert.deepEqual(Object.fromEntries(levelCounts), {
    a1: 700,
    a2: 700,
    b1: 1000,
    b2: 1600,
    c1: 2000,
  });
  await access(new URL("audio/examples/a1/anna/core6000-a1-0001.m4a", publicRoot));
});
