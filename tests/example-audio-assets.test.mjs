import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const publicRoot = new URL("../public/", import.meta.url);
const wordbooksRoot = new URL("../public/wordbooks/", import.meta.url);

test("does not ship generated sentence audio", async () => {
  await assert.rejects(
    stat(new URL("audio/examples", publicRoot)),
    (error) => error?.code === "ENOENT",
  );
});

test("ships Anna word recordings for every active wordbook entry", async () => {
  const wordManifest = JSON.parse(await readFile(new URL("audio/manifest-v2.json", publicRoot), "utf8"));
  const activeFiles = ["a1-v2.json", "a2-v2.json", "b1-v2.json", "b2-v2.json", "c1-v2.json", "special-v2.json"];
  const entries = [];
  const ids = new Set();

  for (const file of activeFiles) {
    const payload = JSON.parse(await readFile(new URL(file, wordbooksRoot), "utf8"));
    for (const row of payload.words) {
      const [id] = row;
      assert.equal(ids.has(id), false, `duplicate active audio id: ${id}`);
      ids.add(id);
      entries.push({ id, level: payload.level.toLowerCase() });
    }
  }

  assert.equal(entries.length, 10151);
  assert.equal(wordManifest.count, entries.length);
  assert.equal(Object.keys(wordManifest.files).length, entries.length);

  await Promise.all(entries.map(async ({ id, level }) => {
    const wordUrl = wordManifest.files[id];
    assert.equal(wordUrl, `/audio/${level}/anna/${id}.m4a`);
    const wordFile = await stat(new URL(wordUrl.slice(1), publicRoot));
    assert.ok(wordFile.size > 0, `${id} has an empty word recording`);
  }));
});
