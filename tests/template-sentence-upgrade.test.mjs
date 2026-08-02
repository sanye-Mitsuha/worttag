import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { buildAuditReport } from "../scripts/audit_wordbooks.mjs";

const LEVELS = ["a1", "a2", "b1", "b2", "c1"];
const root = process.cwd();

const LEGACY_TEMPLATE_PATTERNS = [
  /^Im Alltag hilft es, wenn man die Aufgabe gut .+ kann\.$/u,
  /^Im Alltag ist es hilfreich, wenn man .+ kann\.$/u,
  /^Nach dem Gespräch war die Stimmung im Raum deutlich .+\.$/u,
  /^(?:Anna|Ben|Clara|David|Lea|Mina|Jonas|Paul|Wir) spricht heute über .+ im (?:Museum|Büro|Markt|Bibliothek|Wohnung|Bahnhof|Kurs|Park)\.$/u,
  /^Wir spricht heute über .+\.$/u,
  /^Heute sprechen wir über .+ im (?:Museum|Büro|Markt|Bibliothek|Wohnung|Bahnhof|Kurs|Park)\.$/u,
  /^(?:Anna|Ben|Clara|David|Lea|Mina|Jonas) trifft sich heute am Bahnhof und spricht .+ über den Plan\.$/u,
  /^Wir trifft sich heute am Eingang und spricht irgendwie über den Plan\.$/u,
  /^(?:Anna|Ben|Clara|David|Lea|Mina|Jonas|Paul) liest den Text, .+ notiert die wichtigsten Wörter\.$/u,
  /^(?:Anna|Ben|Clara|David|Lea|Mina|Jonas|Paul) sagt, dass .+ heute selbst entscheiden darf\.$/u,
];

test("all deterministic template examples have been replaced", async () => {
  const quality = JSON.parse(await readFile("public/wordbooks/example-quality-v1.json", "utf8"));
  const ledger = JSON.parse(await readFile("reports/example-review-ledger-v1.json", "utf8"));
  assert.equal(quality.summary.byStatus.template, 0);
  assert.deepEqual(quality.summary.templateFamilies, {});
  const correctedIds = new Set(
    ledger.entries
      .filter((entry) => entry.action.startsWith("replaced_") || entry.action.startsWith("repaired_"))
      .map((entry) => entry.id),
  );
  assert.equal(correctedIds.size, ledger.summary.replaced);
  assert.ok([...correctedIds].every((id) => quality.entries[id]?.status === "approved"));
});

test("legacy fixed sentence families are absent from the complete corpus", async () => {
  for (const level of LEVELS) {
    const book = JSON.parse(await readFile(`public/wordbooks/${level}-v1.json`, "utf8"));
    const index = Object.fromEntries(book.fields.map((field, position) => [field, position]));
    for (const row of book.words) {
      assert.ok(
        !LEGACY_TEMPLATE_PATTERNS.some((pattern) => pattern.test(row[index.example])),
        `${row[index.id]} still contains a legacy template sentence`,
      );
    }
  }
});

test("literary attributions are explicit and examples pass target/reuse checks", async () => {
  const allowedTitles = new Set([
    "Faust: Der Tragödie erster Teil",
    "Die Räuber: Ein Schauspiel",
  ]);
  let literaryCount = 0;
  for (const level of LEVELS) {
    const book = JSON.parse(await readFile(`public/wordbooks/${level}-v1.json`, "utf8"));
    const index = Object.fromEntries(book.fields.map((field, position) => [field, position]));
    for (const row of book.words) {
      assert.ok(row[index.example].trim());
      assert.ok(row[index.exampleZh].trim());
      const match = row[index.example].match(/——《([^》]+)》$/u);
      if (match) {
        literaryCount += 1;
        assert.ok(allowedTitles.has(match[1]), `unknown literary title: ${match[1]}`);
      }
      assert.doesNotMatch(row[index.example], /Im Gespräch kann man .* passend verwenden\.|Im Satz beschreibt .* eine Eigenschaft\./u);
    }
  }
  assert.ok(literaryCount >= 20, `expected a meaningful literary sample, got ${literaryCount}`);

  const audit = await buildAuditReport({ root });
  for (const flag of ["example_target_not_detected", "example_reused_three_plus", "example_synthetic_placeholder"]) {
    assert.equal(audit.summary.flags[flag] ?? 0, 0, `${flag} must be zero after the upgrade`);
  }
});
