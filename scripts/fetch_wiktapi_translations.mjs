#!/usr/bin/env node

/**
 * Fetch German-Wiktionary translation records for the exact lookup lemmas
 * already frozen by scripts/audit_wordbooks.mjs.
 *
 * The generated cache is local evidence for the repair pipeline. It is not
 * committed because every record can be reproduced from the definition-cache
 * keys and the pinned endpoint recorded below.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function parseArguments(argv) {
  const options = {
    definitions: ".cache/wordbooks/wiktapi-de-2026-07-28.json",
    output: ".cache/wordbooks/wiktapi-translations-2026-07-28.json",
    concurrency: 16,
    max: Number.POSITIVE_INFINITY,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${value} requires a value.`);
      return argv[index];
    };
    if (value === "--definitions") options.definitions = next();
    else if (value === "--output") options.output = next();
    else if (value === "--concurrency") options.concurrency = Number(next());
    else if (value === "--max") options.max = Number(next());
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (
    !Number.isInteger(options.concurrency)
    || options.concurrency < 1
    || options.concurrency > 24
  ) {
    throw new Error("--concurrency must be an integer between 1 and 24.");
  }
  if (
    options.max !== Number.POSITIVE_INFINITY
    && (!Number.isInteger(options.max) || options.max < 1)
  ) {
    throw new Error("--max must be a positive integer.");
  }
  return options;
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, "utf8");
  await rename(temporary, filePath);
}

async function fetchTranslations(lemma) {
  const endpoint =
    `https://api.wiktapi.dev/v1/de/word/${encodeURIComponent(lemma)}/translations?lang=de`;
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return {
    status: response.status,
    fetchedAt: new Date().toISOString(),
    endpoint,
    response: body,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const definitionsPath = path.resolve(options.definitions);
  const outputPath = path.resolve(options.output);
  const definitions = JSON.parse(await readFile(definitionsPath, "utf8"));
  const lemmas = Object.keys(definitions.entries ?? {}).slice(0, options.max);

  let cache;
  try {
    cache = JSON.parse(await readFile(outputPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    cache = {
      schemaVersion: 1,
      provider: "WiktAPI",
      edition: "de",
      endpoint: "translations",
      language: "de",
      sourceDefinitionCache: path.basename(definitionsPath),
      updatedAt: null,
      entries: {},
    };
  }
  if (!cache.entries || Array.isArray(cache.entries)) cache.entries = {};

  const pending = lemmas.filter((lemma) => !(lemma in cache.entries));
  let cursor = 0;
  let completed = 0;
  let persistence = Promise.resolve();

  async function worker() {
    while (cursor < pending.length) {
      const lemma = pending[cursor];
      cursor += 1;
      try {
        cache.entries[lemma] = await fetchTranslations(lemma);
      } catch (error) {
        cache.entries[lemma] = {
          status: 0,
          fetchedAt: new Date().toISOString(),
          endpoint: null,
          error: error instanceof Error ? error.message : String(error),
          response: null,
        };
      }
      completed += 1;
      if (completed % 50 === 0 || completed === pending.length) {
        cache.updatedAt = new Date().toISOString();
        persistence = persistence.then(() => writeJsonAtomic(outputPath, cache));
        await persistence;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(options.concurrency, pending.length || 1)) },
      () => worker(),
    ),
  );
  process.stdout.write(
    `${JSON.stringify({
      requested: pending.length,
      totalLemmas: lemmas.length,
      cached: Object.keys(cache.entries).length,
      output: outputPath,
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
