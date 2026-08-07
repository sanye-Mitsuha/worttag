import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

const publicRoot = new URL("../public/", import.meta.url);
const wordbooksRoot = new URL("../public/wordbooks/", import.meta.url);

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

test("ships Anna word and sentence recordings for every active wordbook entry", async () => {
  const wordManifest = JSON.parse(await readFile(new URL("audio/manifest-v2.json", publicRoot), "utf8"));
  const exampleManifest = JSON.parse(await readFile(new URL("audio/examples/manifest-v2.json", publicRoot), "utf8"));
  const activeFiles = ["a1-v2.json", "a2-v2.json", "b1-v2.json", "b2-v2.json", "c1-v2.json", "special-v2.json"];
  const entries = [];
  const ids = new Set();

  for (const file of activeFiles) {
    const payload = JSON.parse(await readFile(new URL(file, wordbooksRoot), "utf8"));
    for (const row of payload.words) {
      const [id, , , , , example] = row;
      assert.equal(ids.has(id), false, `duplicate active audio id: ${id}`);
      ids.add(id);
      entries.push({ id, level: payload.level.toLowerCase(), hasExample: Boolean(example?.trim()) });
    }
  }

  assert.equal(entries.length, 10151);
  assert.equal(wordManifest.count, entries.length);
  assert.equal(Object.keys(wordManifest.files).length, entries.length);
  assert.equal(exampleManifest.count, entries.filter((entry) => entry.hasExample).length);
  assert.equal(Object.keys(exampleManifest.files).length, exampleManifest.count);

  await Promise.all(entries.map(async ({ id, level, hasExample }) => {
    const wordUrl = wordManifest.files[id];
    assert.equal(wordUrl, `/audio/${level}/anna/${id}.m4a`);
    const wordFile = await stat(new URL(wordUrl.slice(1), publicRoot));
    assert.ok(wordFile.size > 0, `${id} has an empty word recording`);
    if (hasExample) {
      const exampleUrl = exampleManifest.files[id];
      assert.equal(exampleUrl, `/audio/examples/${level}/anna/${id}.m4a`);
      const exampleFile = await stat(new URL(exampleUrl.slice(1), publicRoot));
      assert.ok(exampleFile.size > 0, `${id} has an empty sentence recording`);
    }
  }));
});
