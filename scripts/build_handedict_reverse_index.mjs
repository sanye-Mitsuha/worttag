#!/usr/bin/env node

/**
 * Build a conservative German -> Simplified Chinese evidence cache from
 * HanDeDict's Chinese -> German CEDICT export.
 *
 * Important: the output is review evidence, not an automatic translation
 * oracle. HanDeDict is a collaborative dictionary and one German headword can
 * legitimately map to several Chinese senses. Accordingly every corpus row is
 * marked `autoApply: false`, while explicit part-of-speech matches are retained
 * as candidates for the separate editorial repair pipeline.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

import {
  expectedDictionaryPos,
  loadCuratedEntries,
  loadPackedEntries,
  normalizeLookupLemmas,
} from "./audit_wordbooks.mjs";

export const HANDEDICT_CACHE_SCHEMA_VERSION = 1;
export const HANDEDICT_REPORT_SCHEMA_VERSION = 1;

const DEFAULT_SOURCE_URL = "https://handedict.zydeo.net/api/export/download";
const HANDEDICT_HOMEPAGE = "https://handedict.zydeo.net/";
const HANDEDICT_REPOSITORY = "https://github.com/gugray/HanDeDict";
const LICENSE_NAME = "CC BY-SA 3.0";
const LICENSE_URL = "https://creativecommons.org/licenses/by-sa/3.0/deed.de";

const GRAMMATICAL_TAGS = new Map([
  ["s", "noun"],
  ["subst", "noun"],
  ["v", "verb"],
  ["adj", "adjective"],
  ["adv", "adverb"],
  ["präp", "preposition"],
  ["praep", "preposition"],
  ["konj", "conjunction"],
  ["pron", "pronoun"],
  ["num", "numeral"],
  ["zähl", "numeral"],
  ["zaehl", "numeral"],
  ["part", "particle"],
  ["interj", "interjection"],
  ["int", "interjection"],
  ["eig", "proper"],
]);

const METADATA_TAGS = new Set([
  "arch",
  "astron",
  "bio",
  "bot",
  "chem",
  "edv",
  "ess",
  "fam",
  "fin",
  "geo",
  "gesch",
  "jur",
  "lit",
  "ling",
  "math",
  "med",
  "mil",
  "mus",
  "pers",
  "pharm",
  "phil",
  "phys",
  "pol",
  "psych",
  "tech",
  "umg",
  "vulg",
  "wirtsch",
  "x",
]);

const EXPECTED_POS_COMPATIBILITY = {
  noun: new Set(["noun"]),
  verb: new Set(["verb"]),
  adjective: new Set(["adjective"]),
  adverb: new Set(["adverb"]),
  preposition: new Set(["preposition"]),
  conjunction: new Set(["conjunction"]),
  pronoun: new Set(["pronoun"]),
  determiner: new Set(),
  numeral: new Set(["numeral"]),
  particle: new Set(["particle"]),
  interjection: new Set(["interjection"]),
  proper: new Set(["proper"]),
  phrase: new Set(),
  unknown: new Set(),
};

const GERMAN_USAGE_PREFIX = /^(?:(?:sich|etw\.?|etwas|jdn\.?|jdm\.?|jemanden|jemandem)\s+)+/iu;
const GERMAN_ARTICLE_PREFIX = /^(?:der|die|das)\s+/iu;
const REFERENCE_GLOSS = /^(?:abkürzung|kurzform|variante|alternative|siehe|vgl\.?)\b/iu;
const HAN_ONLY = /^\p{Script=Han}{1,12}$/u;

function cleanSpace(value) {
  return String(value ?? "").normalize("NFC").replace(/^\uFEFF/u, "").replace(/\s+/gu, " ").trim();
}

function caseFold(value) {
  return cleanSpace(value).toLocaleLowerCase("de-DE");
}

function unique(values, key = (value) => value) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const identity = key(value);
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(value);
  }
  return result;
}

export function normalizeGermanHeadword(value) {
  return caseFold(
    cleanSpace(value)
      .replace(/[„“”"'’]+/gu, "")
      .replace(/^\(sich\)\s+/iu, "")
      .replace(GERMAN_USAGE_PREFIX, "")
      .replace(GERMAN_ARTICLE_PREFIX, "")
      .replace(/[.,;:!?…]+$/gu, ""),
  );
}

function splitTopLevel(value, delimiter) {
  const result = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    else if (character === ")" && depth > 0) depth -= 1;
    else if (character === delimiter && depth === 0) {
      result.push(value.slice(start, index));
      start = index + 1;
    }
  }
  result.push(value.slice(start));
  return result;
}

function parseTagGroup(raw) {
  const values = raw
    .split(/[,/]/u)
    .map((value) => caseFold(value).replace(/\.$/u, ""))
    .filter(Boolean);
  const positions = [];
  let allMetadata = values.length > 0;
  for (const value of values) {
    const grammatical = GRAMMATICAL_TAGS.get(value);
    if (grammatical) positions.push(grammatical);
    else if (!METADATA_TAGS.has(value) && !/^\d{3,4}(?:\s*-\s*\d{0,4})?$/u.test(value)) {
      allMetadata = false;
    }
  }
  return {
    positions: unique(positions),
    removable: allMetadata,
  };
}

function parseGlossPiece(raw) {
  let text = cleanSpace(raw);
  const positions = [];
  text = text.replace(/\(([^()]*)\)/gu, (match, group) => {
    const tags = parseTagGroup(group);
    positions.push(...tags.positions);
    if (tags.removable || caseFold(group) === "sich") return " ";
    return match;
  });
  text = cleanSpace(text)
    .replace(/^[–—-]+\s*/u, "")
    .replace(/\s*[–—-]+$/u, "")
    .replace(/[.;:]+$/u, "");
  return { text, positions: unique(positions) };
}

/**
 * HanDeDict often writes "verstehen, begreifen (V)": the trailing tag applies
 * to both comma-separated synonyms. POS information is propagated only within
 * a semicolon group, never across a stronger sense boundary.
 */
export function extractGermanCandidates(rawGloss) {
  const candidates = [];
  for (const semicolonGroup of splitTopLevel(cleanSpace(rawGloss), ";")) {
    const pieces = splitTopLevel(semicolonGroup, ",").map(parseGlossPiece);
    let followingPositions = [];
    for (let index = pieces.length - 1; index >= 0; index -= 1) {
      if (pieces[index].positions.length) followingPositions = pieces[index].positions;
      else if (followingPositions.length) pieces[index].positions = followingPositions;
    }
    for (const piece of pieces) {
      for (const alternative of piece.text.split(/\s+(?:oder|bzw\.)\s+/iu)) {
        const display = cleanSpace(alternative);
        const normalized = normalizeGermanHeadword(display);
        if (
          !normalized
          || REFERENCE_GLOSS.test(display)
          || /[\[\]{}<>/=]/u.test(display)
          || /\p{Script=Han}/u.test(display)
          || [...display].length > 80
          || display.split(/\s+/u).length > 8
        ) {
          continue;
        }
        candidates.push({
          display,
          normalized,
          positions: [...piece.positions],
        });
      }
    }
  }
  return unique(
    candidates,
    (candidate) => `${candidate.normalized}\0${candidate.positions.slice().sort().join(",")}`,
  );
}

export function parseHanDeDictEntryLine(line, metadata = {}) {
  const cleaned = cleanSpace(line);
  const match = cleaned.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.*)\/$/u);
  if (!match) return null;
  const [, traditional, simplified, pinyin, definitionBlob] = match;
  const definitions = definitionBlob
    .split("/")
    .map(cleanSpace)
    .filter(Boolean)
    .map((gloss) => ({
      gloss,
      candidates: extractGermanCandidates(gloss),
    }))
    .filter((definition) => definition.candidates.length);
  return {
    sourceId: metadata.sourceId ?? null,
    revisionAt: metadata.revisionAt ?? null,
    revisionStatus: metadata.revisionStatus ?? null,
    traditional,
    simplified,
    pinyin: cleanSpace(pinyin),
    definitions,
  };
}

function parseRevisionLine(line) {
  const match = line.match(
    /^#\s+Ver\s+(\S+)\s+(\S+)\s+Stat-([A-Za-z]+)(?:\s+.*)?$/u,
  );
  if (!match) return null;
  return {
    revisionAt: match[1],
    revisionAuthor: match[2],
    revisionStatus: match[3],
  };
}

function createSourceStream(sourcePath) {
  const input = createReadStream(sourcePath);
  return sourcePath.endsWith(".gz") ? input.pipe(createGunzip()) : input;
}

export async function readHanDeDict(sourcePath) {
  const entries = [];
  const source = {
    dataDate: null,
    declaredLicense: null,
    declaredLicenseUrl: null,
  };
  const stats = {
    currentLines: 0,
    parsedEntries: 0,
    malformedCurrentLines: 0,
    usableChineseEntries: 0,
    definitionCount: 0,
    candidateCount: 0,
  };
  let sourceId = null;
  let revision = null;

  const lines = readline.createInterface({
    input: createSourceStream(sourcePath),
    crlfDelay: Infinity,
  });
  for await (const rawLine of lines) {
    const line = cleanSpace(rawLine);
    if (!line) continue;
    const idMatch = line.match(/^#\s+ID-(\S+)/u);
    if (idMatch) {
      sourceId = `ID-${idMatch[1]}`;
      revision = null;
      continue;
    }
    const parsedRevision = parseRevisionLine(line);
    if (parsedRevision) {
      revision = parsedRevision;
      continue;
    }
    if (line.startsWith("#")) {
      const dateMatch = line.match(/^#\s+Datenstand:\s*(\S+)/iu);
      if (dateMatch) source.dataDate = dateMatch[1];
      const licenseMatch = line.match(/^#\s+Lizenz:\s*(.+)$/iu);
      if (licenseMatch) source.declaredLicense = cleanSpace(licenseMatch[1]);
      const urlMatch = line.match(/^#\s+(https:\/\/creativecommons\.org\/licenses\/\S+)/iu);
      if (urlMatch) source.declaredLicenseUrl = urlMatch[1];
      continue;
    }

    stats.currentLines += 1;
    const entry = parseHanDeDictEntryLine(line, { sourceId, ...revision });
    if (!entry) {
      stats.malformedCurrentLines += 1;
      continue;
    }
    stats.parsedEntries += 1;
    stats.definitionCount += entry.definitions.length;
    stats.candidateCount += entry.definitions.reduce(
      (total, definition) => total + definition.candidates.length,
      0,
    );
    if (HAN_ONLY.test(entry.simplified)) {
      entries.push(entry);
      stats.usableChineseEntries += 1;
    }
  }
  return { entries, source, stats };
}

async function digestFile(filePath) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: hash.digest("hex"), bytes };
}

function buildReverseIndex(sourceEntries) {
  const index = new Map();
  for (const entry of sourceEntries) {
    for (const definition of entry.definitions) {
      for (const candidate of definition.candidates) {
        if (!index.has(candidate.normalized)) index.set(candidate.normalized, []);
        index.get(candidate.normalized).push({
          sourceId: entry.sourceId,
          revisionAt: entry.revisionAt,
          revisionStatus: entry.revisionStatus,
          traditional: entry.traditional,
          simplified: entry.simplified,
          pinyin: entry.pinyin,
          germanGloss: definition.gloss,
          matchedDisplay: candidate.display,
          positions: candidate.positions,
        });
      }
    }
  }
  for (const [lemma, matches] of index) {
    index.set(
      lemma,
      unique(
        matches,
        (match) => [
          match.sourceId,
          match.simplified,
          match.germanGloss,
          match.positions.slice().sort().join(","),
        ].join("\0"),
      ),
    );
  }
  return index;
}

function posRelation(expectedPos, positions) {
  if (!positions.length) return "untyped";
  if (expectedPos === "phrase" || expectedPos === "unknown" || expectedPos === "determiner") {
    return "unresolved";
  }
  const accepted = EXPECTED_POS_COMPATIBILITY[expectedPos] ?? new Set();
  return positions.some((position) => accepted.has(position)) ? "match" : "conflict";
}

function compactMatch(match) {
  return {
    sourceId: match.sourceId,
    revisionAt: match.revisionAt,
    revisionStatus: match.revisionStatus,
    simplified: match.simplified,
    traditional: match.traditional,
    pinyin: match.pinyin,
    germanGloss: match.germanGloss,
    matchedDisplay: match.matchedDisplay,
    positions: match.positions,
  };
}

function corpusIdentity(entry) {
  const lemmas = normalizeLookupLemmas(entry.term, entry.typeCode || entry.localType);
  return {
    lemma: lemmas[0] ?? cleanSpace(entry.term),
    normalizedLemma: normalizeGermanHeadword(lemmas[0] ?? entry.term),
    expectedPos: expectedDictionaryPos(entry),
  };
}

function summarizeMatches(entry, reverseIndex, homographCounts) {
  const identity = corpusIdentity(entry);
  const allMatches = reverseIndex.get(identity.normalizedLemma) ?? [];
  const classified = allMatches.map((match) => ({
    ...match,
    relation: posRelation(identity.expectedPos, match.positions),
  }));
  const matching = classified.filter((match) => match.relation === "match");
  const untyped = classified.filter(
    (match) => match.relation === "untyped" || match.relation === "unresolved",
  );
  const conflicts = classified.filter((match) => match.relation === "conflict");
  const accepted = matching.length ? matching : untyped;
  const chineseHeadwords = unique(accepted.map((match) => match.simplified)).slice(0, 12);
  const verifiedChineseHeadwords = unique(
    matching
      .filter((match) => caseFold(match.revisionStatus) === "verif")
      .map((match) => match.simplified),
  ).slice(0, 12);
  const homographKey = `${identity.normalizedLemma}\0${identity.expectedPos}`;
  const samePosCorpusRows = homographCounts.get(homographKey) ?? 1;
  const sourceHasOtherPartsOfSpeech = matching.length > 0 && conflicts.length > 0;

  let status = "not_found";
  if (matching.length) status = "pos_matched";
  else if (untyped.length) status = "untyped_only";
  else if (conflicts.length) status = "pos_conflict_only";
  if (identity.expectedPos === "phrase" && allMatches.length) status = "phrase_review";
  if (samePosCorpusRows > 1 && allMatches.length) status = "same_pos_homograph_review";

  let confidence = "none";
  if (matching.length) {
    confidence = (
      samePosCorpusRows === 1
      && !sourceHasOtherPartsOfSpeech
      && verifiedChineseHeadwords.length > 0
      && verifiedChineseHeadwords.length <= 6
    ) ? "high" : "medium";
  } else if (untyped.length) {
    confidence = "low";
  }

  return {
    id: entry.id,
    level: entry.level,
    term: entry.term,
    lemma: identity.lemma,
    normalizedLemma: identity.normalizedLemma,
    expectedPos: identity.expectedPos,
    status,
    confidence,
    autoApply: false,
    reviewReasons: [
      ...(samePosCorpusRows > 1 ? ["same_pos_corpus_homograph"] : []),
      ...(sourceHasOtherPartsOfSpeech ? ["source_has_other_parts_of_speech"] : []),
      ...(matching.length === 0 && untyped.length > 0 ? ["source_pos_untyped"] : []),
      ...(identity.expectedPos === "phrase" ? ["phrase_requires_sense_alignment"] : []),
      ...(chineseHeadwords.length > 6 ? ["many_chinese_candidates"] : []),
      ...(matching.length > 0 && verifiedChineseHeadwords.length === 0
        ? ["no_verified_handedict_revision"]
        : []),
    ],
    chineseHeadwords,
    verifiedChineseHeadwords,
    proposedMeaning: matching.length && chineseHeadwords.length
      ? chineseHeadwords.join("；")
      : null,
    matchCounts: {
      all: allMatches.length,
      posMatched: matching.length,
      untyped: untyped.length,
      posConflicting: conflicts.length,
      samePosCorpusRows,
    },
    matches: unique(
      accepted.map(compactMatch),
      (match) => `${match.sourceId}\0${match.simplified}\0${match.germanGloss}`,
    ).slice(0, 24),
    conflictingMatches: unique(
      conflicts.map(compactMatch),
      (match) => `${match.sourceId}\0${match.simplified}\0${match.germanGloss}`,
    ).slice(0, 8),
  };
}

function emptyCoverage() {
  return {
    total: 0,
    anyExactMatch: 0,
    explicitPosMatch: 0,
    verifiedExplicitPosMatch: 0,
    highConfidenceReviewCandidate: 0,
    mediumConfidenceReviewCandidate: 0,
    untypedOnly: 0,
    posConflictOnly: 0,
    phraseReview: 0,
    samePosHomographReview: 0,
    notFound: 0,
  };
}

function addCoverage(coverage, entry) {
  coverage.total += 1;
  if (entry.status !== "not_found") coverage.anyExactMatch += 1;
  if (entry.matchCounts.posMatched > 0) coverage.explicitPosMatch += 1;
  if (entry.verifiedChineseHeadwords.length > 0) coverage.verifiedExplicitPosMatch += 1;
  if (entry.confidence === "high") coverage.highConfidenceReviewCandidate += 1;
  if (entry.confidence === "medium") coverage.mediumConfidenceReviewCandidate += 1;
  if (entry.status === "untyped_only") coverage.untypedOnly += 1;
  if (entry.status === "pos_conflict_only") coverage.posConflictOnly += 1;
  if (entry.status === "phrase_review") coverage.phraseReview += 1;
  if (entry.status === "same_pos_homograph_review") coverage.samePosHomographReview += 1;
  if (entry.status === "not_found") coverage.notFound += 1;
}

function withRates(coverage) {
  const result = { ...coverage, rates: {} };
  for (const [key, value] of Object.entries(coverage)) {
    if (key === "total") continue;
    result.rates[key] = coverage.total ? Number((value / coverage.total).toFixed(4)) : 0;
  }
  return result;
}

export function buildCorpusCache(corpusEntries, sourceEntries) {
  const reverseIndex = buildReverseIndex(sourceEntries);
  const homographCounts = new Map();
  for (const entry of corpusEntries) {
    const identity = corpusIdentity(entry);
    const key = `${identity.normalizedLemma}\0${identity.expectedPos}`;
    homographCounts.set(key, (homographCounts.get(key) ?? 0) + 1);
  }
  return corpusEntries.map((entry) => summarizeMatches(entry, reverseIndex, homographCounts));
}

function buildCoverageReport(entries) {
  const total = emptyCoverage();
  const levels = {};
  const statusExamples = {};
  for (const entry of entries) {
    if (!levels[entry.level]) levels[entry.level] = emptyCoverage();
    addCoverage(total, entry);
    addCoverage(levels[entry.level], entry);
    if (!statusExamples[entry.status]) statusExamples[entry.status] = [];
    if (statusExamples[entry.status].length < 12) {
      statusExamples[entry.status].push({
        id: entry.id,
        term: entry.term,
        expectedPos: entry.expectedPos,
        chineseHeadwords: entry.chineseHeadwords,
      });
    }
  }
  return {
    total: withRates(total),
    levels: Object.fromEntries(
      Object.entries(levels).map(([level, coverage]) => [level, withRates(coverage)]),
    ),
    statusExamples,
  };
}

async function writeJsonAtomic(filePath, value, { pretty = true } = {}) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, "utf8");
  await rename(temporary, filePath);
}

async function writeTextAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, filePath);
}

function percentage(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function coverageCell(row, field) {
  return `${row[field].toLocaleString("en-US")} (${percentage(row.rates[field])})`;
}

function makeCoverageMarkdown(report) {
  const total = report.coverage.total;
  const levelRows = Object.entries(report.coverage.levels)
    .map(([level, row]) => (
      `| ${level} | ${row.total.toLocaleString("en-US")} | ${coverageCell(row, "anyExactMatch")} | ${coverageCell(row, "explicitPosMatch")} | ${coverageCell(row, "verifiedExplicitPosMatch")} | ${row.notFound.toLocaleString("en-US")} |`
    ))
    .join("\n");
  return `# HanDeDict coverage of the Worttag 6,000-word corpus

## Result

The HanDeDict edition dated \`${report.source.editionDate}\` provides an exact German
gloss-segment match for **${total.anyExactMatch.toLocaleString("en-US")} of ${total.total.toLocaleString("en-US")} Worttag entries (${percentage(total.rates.anyExactMatch)})**. An explicit
part-of-speech tag agrees with Worttag for **${coverageCell(total, "explicitPosMatch")}**. Of
those entries, **${coverageCell(total, "verifiedExplicitPosMatch")}** have at least one
agreeing HanDeDict record whose latest revision is marked \`Stat-Verif\`.

| Level | Entries | Exact match | Explicit POS match | \`Stat-Verif\` POS match | No match |
|---|---:|---:|---:|---:|---:|
${levelRows}
| **Total** | **${total.total.toLocaleString("en-US")}** | **${coverageCell(total, "anyExactMatch")}** | **${coverageCell(total, "explicitPosMatch")}** | **${coverageCell(total, "verifiedExplicitPosMatch")}** | **${total.notFound.toLocaleString("en-US")}** |

## Method

- Parsed all **${report.source.parseStats.currentLines.toLocaleString("en-US")}** current, uncommented CEDICT records in the official export; **${report.source.parseStats.malformedCurrentLines.toLocaleString("en-US")}** current records failed structural parsing.
- Ignored commented historical versions while retaining each current record's source ID, latest revision timestamp and revision status.
- Reversed only exact, normalised German gloss segments. The matcher does not use substring, fuzzy or embedding similarity.
- Preferred explicit compatible POS evidence and kept untyped or conflicting records in separate review categories.
- Accepted a Simplified Chinese headword only when it consists of 1–12 Han characters.
- Held same-POS corpus homographs and phrases for manual sense alignment.
- Marked every candidate \`autoApply: false\`.

## Interpretation

This is a **coverage measurement and editorial evidence cache**, not a finding that
every matched Worttag Chinese meaning is correct. HanDeDict is collaboratively edited;
exact German homographs can still represent different senses. A candidate should be
accepted only after its part of speech, sense and example are aligned with independent
German lexicographic evidence.

The ${total.notFound.toLocaleString("en-US")} unmatched Worttag entries require another bilingual source or editorial
translation. The ${total.posConflictOnly.toLocaleString("en-US")} POS-conflict-only entries remain useful audit leads.

## Reproducibility and license

- Official export: <${report.source.downloadUrl}>
- Export SHA-256: \`${report.source.compressedSha256}\`
- HanDeDict license: **${report.source.license}**
- Detailed attribution: [\`data/lexicon/HANDEDICT_ATTRIBUTION.md\`](../data/lexicon/HANDEDICT_ATTRIBUTION.md)
- Machine-readable report: [\`handedict-coverage-v1.json\`](handedict-coverage-v1.json)
- Evidence cache: [\`data/lexicon/handedict-reverse-v1.json\`](../data/lexicon/handedict-reverse-v1.json)

Rebuild command:

\`\`\`sh
node scripts/build_handedict_reverse_index.mjs \\
  --source /path/to/handedict.u8.gz
\`\`\`
`;
}

export async function buildHanDeDictArtifacts({
  root = process.cwd(),
  sourcePath,
  cachePath = path.join(root, "data/lexicon/handedict-reverse-v1.json"),
  reportPath = path.join(root, "reports/handedict-coverage-v1.json"),
  markdownPath = path.join(root, "reports/handedict-coverage-v1.md"),
} = {}) {
  if (!sourcePath) throw new Error("A HanDeDict export is required via --source <file>.");
  const absoluteSource = path.resolve(sourcePath);
  await stat(absoluteSource);
  const [{ entries: sourceEntries, source: declared, stats: parseStats }, digest, packed, curated] =
    await Promise.all([
      readHanDeDict(absoluteSource),
      digestFile(absoluteSource),
      loadPackedEntries(root),
      loadCuratedEntries(root),
    ]);
  const corpusEntries = [...packed, ...curated];
  const matchedEntries = buildCorpusCache(corpusEntries, sourceEntries);
  const coverage = buildCoverageReport(matchedEntries);
  const generatedAt = declared.dataDate ?? null;
  const source = {
    name: "HanDeDict",
    editionDate: declared.dataDate,
    downloadUrl: DEFAULT_SOURCE_URL,
    homepage: HANDEDICT_HOMEPAGE,
    repository: HANDEDICT_REPOSITORY,
    license: declared.declaredLicense ?? LICENSE_NAME,
    licenseUrl: declared.declaredLicenseUrl ?? LICENSE_URL,
    compressedSha256: digest.sha256,
    compressedBytes: digest.bytes,
    parseStats,
  };
  const cache = {
    schemaVersion: HANDEDICT_CACHE_SCHEMA_VERSION,
    generatedAt,
    source,
    policy: {
      matching: "exact normalized German gloss segment",
      posHandling: "explicit POS match preferred; untyped and conflicting evidence separated",
      chineseFilter: "Simplified headword must contain only 1-12 Han characters",
      automaticReplacement: false,
      note: "HanDeDict candidates require sense-level editorial review before publication.",
    },
    corpus: {
      entries: corpusEntries.length,
      packedEntries: packed.length,
      curatedEntries: curated.length,
    },
    entries: Object.fromEntries(matchedEntries.map((entry) => [entry.id, entry])),
  };
  const report = {
    schemaVersion: HANDEDICT_REPORT_SCHEMA_VERSION,
    generatedAt,
    source,
    policy: cache.policy,
    coverage,
  };
  await Promise.all([
    // The evidence cache is generated and large; compact JSON keeps the
    // repository/source archive materially smaller. The report stays readable.
    writeJsonAtomic(path.resolve(cachePath), cache, { pretty: false }),
    writeJsonAtomic(path.resolve(reportPath), report),
    writeTextAtomic(path.resolve(markdownPath), makeCoverageMarkdown(report)),
  ]);
  return { cache, report };
}

function parseArguments(argv) {
  const options = {
    root: process.cwd(),
    sourcePath: process.env.HANDEDICT_SOURCE ?? null,
    cachePath: null,
    reportPath: null,
    markdownPath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${value} requires a value.`);
      return argv[index];
    };
    if (value === "--root") options.root = path.resolve(next());
    else if (value === "--source") options.sourcePath = path.resolve(next());
    else if (value === "--cache") options.cachePath = path.resolve(next());
    else if (value === "--report") options.reportPath = path.resolve(next());
    else if (value === "--markdown") options.markdownPath = path.resolve(next());
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/build_handedict_reverse_index.mjs --source <handedict.u8[.gz]> [options]

Options:
  --source <file>   Official HanDeDict CEDICT export (or HANDEDICT_SOURCE).
  --cache <file>    Evidence cache output (default: data/lexicon/handedict-reverse-v1.json).
  --report <file>   Coverage report output (default: reports/handedict-coverage-v1.json).
  --markdown <file> Coverage summary output (default: reports/handedict-coverage-v1.md).
  --root <dir>      Worttag repository root (default: current directory).
`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const result = await buildHanDeDictArtifacts({
    root: options.root,
    sourcePath: options.sourcePath,
    cachePath: options.cachePath ?? path.join(options.root, "data/lexicon/handedict-reverse-v1.json"),
    reportPath: options.reportPath ?? path.join(options.root, "reports/handedict-coverage-v1.json"),
    markdownPath: options.markdownPath ?? path.join(options.root, "reports/handedict-coverage-v1.md"),
  });
  process.stdout.write(`${JSON.stringify(result.report.coverage.total, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
