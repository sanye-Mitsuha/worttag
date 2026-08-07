import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const publicRoot = new URL("../public/", import.meta.url);
const wordbooksRoot = new URL("../public/wordbooks/", import.meta.url);

test("ships an Anna sentence manifest for the active wordbook", async () => {
  const manifest = JSON.parse(await readFile(new URL("audio/examples/manifest-v2.json", publicRoot), "utf8"));
  assert.equal(manifest.voice, "Anna");
  assert.equal(manifest.language, "de-DE");
  assert.equal(manifest.format, "m4a/aac");
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.kind, "example");
  assert.equal(manifest.count, 7501);
  assert.equal(Object.keys(manifest.files).length, 7501);
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
