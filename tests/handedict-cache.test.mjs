import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const cachePath = path.join(root, "data/lexicon/handedict-reverse-v1.json");
const reportPath = path.join(root, "reports/handedict-coverage-v1.json");
const EXPECTED_EXPORT_SHA256 = "3eb3b82764ab950db0fd61a3a116d8dcafe889902fede2ab32fea904fe001b93";

test("checked-in HanDeDict evidence covers the complete corpus without auto-application", async () => {
  const [cache, report] = await Promise.all([
    readFile(cachePath, "utf8").then(JSON.parse),
    readFile(reportPath, "utf8").then(JSON.parse),
  ]);
  assert.equal(cache.schemaVersion, 1);
  assert.equal(cache.generatedAt, "2026-07-28T02:30:01Z");
  assert.equal(cache.source.license, "CC-BY-SA 3.0");
  assert.equal(cache.source.compressedSha256, EXPECTED_EXPORT_SHA256);
  assert.equal(cache.corpus.entries, 6000);

  const entries = Object.values(cache.entries);
  assert.equal(entries.length, 6000);
  assert.ok(entries.every((entry) => entry.autoApply === false));
  assert.ok(
    entries.every((entry) => entry.chineseHeadwords.every(
      (headword) => /^\p{Script=Han}{1,12}$/u.test(headword),
    )),
  );

  assert.equal(report.coverage.total.total, 6000);
  assert.equal(report.coverage.total.anyExactMatch, 5367);
  assert.equal(report.coverage.total.explicitPosMatch, 4947);
  assert.equal(report.coverage.total.verifiedExplicitPosMatch, 1727);
  assert.equal(report.coverage.total.notFound, 633);
  assert.equal(
    Object.values(report.coverage.levels).reduce((sum, level) => sum + level.total, 0),
    6000,
  );
});
