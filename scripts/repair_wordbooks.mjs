#!/usr/bin/env node

/**
 * Deterministically repair Worttag's 5,900 packed wordbook rows.
 *
 * Evidence policy:
 * - German lemma/POS/example evidence: German Wiktionary through WiktAPI.
 * - German -> Chinese candidates: the locally generated HanDeDict reverse index.
 * - Parallel examples: OPUS/Tatoeba cmn-de, but only low-risk surface matches.
 * - Ambiguous senses are never invented. A neutral, POS-safe learning sentence
 *   and an explicit review marker are used when open evidence is insufficient.
 *
 * The seven-field deployable schema, IDs, levels and row counts are preserved.
 * Per-row provenance and unresolved editorial decisions live in a separate
 * report so the runtime payload stays compact.
 */

import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  buildAuditReport,
  expectedDictionaryPos,
} from "./audit_wordbooks.mjs";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const WORDBOOK_FILES = LEVELS.map(
  (level) => `public/wordbooks/${level.toLowerCase()}-v1.json`,
);
const HARD_MEANING_FLAGS = [
  "meaning_placeholder",
  "meaning_machine_prompt_residue",
  "meaning_latin_residue",
];
const HARD_EXAMPLE_FLAGS = [
  "example_synthetic_placeholder",
  "example_known_unrelated",
  "example_translation_known_unrelated",
  "example_target_not_detected",
];
const HARD_FLAGS = [...HARD_MEANING_FLAGS, ...HARD_EXAMPLE_FLAGS];

const MEANING_PROMPT_RE =
  /这(?:个|颗|首|项|条|一)?(?:德国|德语).*?(?:词典|意[义思]|含义|在[“"])|词典意[义思]|词典含义|dictionary meaning|在[“"][^”"]+[”"]中/u;
const LATIN_RE = /[A-Za-z]/u;
const HAN_ONLY_RE = /^[\p{Script=Han}]{1,12}$/u;
const ARTICLE_TYPE = { der: "nm", die: "nf", das: "nn" };

const POS_LABELS = {
  noun: ["Nomen", "名词"],
  verb: ["Verb", "动词"],
  adjective: ["Adjektiv", "形容词"],
  adverb: ["Adverb", "副词"],
  preposition: ["Präposition", "介词"],
  conjunction: ["Konjunktion", "连词"],
  pronoun: ["Pronomen", "代词"],
  determiner: ["Artikelwort", "限定词"],
  numeral: ["Zahlwort", "数词"],
  particle: ["Partikel", "助词"],
  interjection: ["Interjektion", "感叹词"],
  proper: ["Eigenname", "专有名词"],
  phrase: ["Ausdruck", "短语"],
  unknown: ["Ausdruck", "词语"],
};

const WIKT_POS = {
  noun: new Set(["noun", "name"]),
  verb: new Set(["verb"]),
  adjective: new Set(["adj", "adjective"]),
  adverb: new Set(["adv", "adverb"]),
  preposition: new Set(["prep", "preposition"]),
  conjunction: new Set(["conj", "conjunction"]),
  pronoun: new Set(["pron", "pronoun"]),
  determiner: new Set(["det", "determiner", "article"]),
  numeral: new Set(["num", "numeral"]),
  particle: new Set(["particle", "part"]),
  interjection: new Set(["intj", "interjection"]),
  proper: new Set(["name", "proper_noun"]),
  phrase: new Set(["phrase"]),
  unknown: new Set(),
};

function cleanSpace(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function caseFold(value) {
  return cleanSpace(value).toLocaleLowerCase("de-DE");
}

function unique(values) {
  const result = [];
  const seen = new Set();
  for (const raw of values) {
    const value = cleanSpace(raw);
    if (!value) continue;
    const key = value.normalize("NFC");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fileEvidence(filePath, root) {
  const bytes = await readFile(filePath);
  return {
    path: path.relative(root, filePath),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

async function writeJsonAtomic(filePath, value, { pretty = true } = {}) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  const serialized = pretty
    ? `${JSON.stringify(value, null, 2)}\n`
    : `${JSON.stringify(value)}\n`;
  await writeFile(temporary, serialized, "utf8");
  await rename(temporary, filePath);
}

function parseMeaningOverrides(source) {
  const start = source.indexOf("const MEANING_OVERRIDES");
  const end = source.indexOf("};", start);
  if (start < 0 || end < 0) return new Map();
  const block = source.slice(start, end);
  const result = new Map();
  const pairRe = /("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*")/gu;
  for (const match of block.matchAll(pairRe)) {
    result.set(JSON.parse(match[1]), JSON.parse(match[2]));
  }
  return result;
}

function cleanChineseMeaning(value) {
  return cleanSpace(value)
    .replace(/〇/gu, "零")
    .replace(/\[[^\]]*\]/gu, "")
    .replace(/\((?:der|die|das)\s+[^)]*\)/giu, "（对应名词义项）")
    .replace(/[A-Za-z]+/gu, "")
    .replace(/\s*；\s*/gu, "；")
    .replace(/；{2,}/gu, "；")
    .replace(/^[；、，,.\s]+|[；、，,\s]+$/gu, "")
    .trim();
}

function meaningHasHardError(value) {
  const meaning = cleanSpace(value);
  return (
    meaning === "词义见例句"
    || MEANING_PROMPT_RE.test(meaning)
    || LATIN_RE.test(meaning)
    || /\[[^\]]*\]/u.test(meaning)
  );
}

function splitChineseMeaning(value) {
  return unique(
    cleanChineseMeaning(value)
      .split(/[；;、，,／/]+/u)
      .map((part) => part.replace(/[（）()“”"']/gu, "").trim())
      .filter((part) => HAN_ONLY_RE.test(part)),
  );
}

function normalizedGlossAtoms(gloss) {
  const beforeExample = cleanSpace(gloss).split(/\bBsp\.\s*:/iu)[0];
  return beforeExample
    .replace(/\([^)]*\)/gu, " ")
    .split(/[,;/]|\boder\b/iu)
    .map((part) => caseFold(part))
    .filter(Boolean);
}

function strictHanCandidates(handedict, currentMeaning) {
  if (!handedict || handedict.status !== "pos_matched") return [];
  const lemma = caseFold(handedict.lemma);
  const currentParts = new Set(splitChineseMeaning(currentMeaning));
  const candidates = new Map();

  for (const match of handedict.matches ?? []) {
    const word = cleanSpace(match.simplified);
    if (!HAN_ONLY_RE.test(word)) continue;
    const atoms = normalizedGlossAtoms(match.germanGloss);
    const exactGloss = atoms.length === 1 && atoms[0] === lemma;
    const verified = caseFold(match.revisionStatus) === "verif";
    const inCurrent = currentParts.has(word);
    const length = [...word].length;
    const score =
      (inCurrent ? 1_000 : 0)
      + (verified ? 200 : 0)
      + (exactGloss ? 100 : 0)
      + (length >= 2 && length <= 4 ? 40 : length === 1 ? 8 : 0);
    const previous = candidates.get(word);
    if (!previous || score > previous.score) {
      candidates.set(word, {
        word,
        score,
        verified,
        inCurrent,
        exactGloss,
        sourceId: match.sourceId,
        revisionAt: match.revisionAt,
        revisionStatus: match.revisionStatus,
        germanGloss: match.germanGloss,
      });
    }
  }

  const ranked = [...candidates.values()].sort(
    (a, b) => b.score - a.score || a.word.localeCompare(b.word, "zh-CN"),
  );
  const corroboratedCurrent = ranked.filter((item) => item.inCurrent);
  if (corroboratedCurrent.length) return corroboratedCurrent.slice(0, 4);

  const exact = ranked.filter((item) => item.exactGloss);
  const verified = exact.filter((item) => item.verified);
  if (verified.length === 1) return verified;
  if (verified.length > 1) {
    // Multiple reverse matches can represent different senses. Keep the
    // evidence in the report, but do not publish an arbitrary synonym list.
    return [];
  }

  if (exact.length === 1) return exact;

  // A sole POS-matched Chinese candidate is usable even when the HanDeDict
  // gloss lists the German lemma beside a synonym. Multiple candidates remain
  // editorially ambiguous and are not concatenated.
  return ranked.length === 1 ? ranked : [];
}

function fallbackMeaning(expectedPos) {
  const [, chinesePos] = POS_LABELS[expectedPos] ?? POS_LABELS.unknown;
  return `${chinesePos}义项尚待人工核定`;
}

function wiktChineseTranslations(record, expectedPos) {
  const acceptedPos = WIKT_POS[expectedPos] ?? WIKT_POS.unknown;
  const groups = record?.response?.translations;
  if (!Array.isArray(groups)) return [];
  return unique(
    groups
      .filter((group) => (
        !acceptedPos.size || acceptedPos.has(caseFold(group?.pos))
      ))
      .flatMap((group) => (
        Array.isArray(group?.translations) ? group.translations : []
      ))
      .filter((translation) => translation?.lang_code === "zh")
      .map((translation) => cleanChineseMeaning(translation?.word))
      .filter((word) => HAN_ONLY_RE.test(word)),
  );
}

function chooseMeaning({ entry, override, handedict, wiktTranslation }) {
  if (override) {
    const meaning = cleanChineseMeaning(override);
    return {
      value: meaning,
      source: "worttag_curated_override",
      reviewStatus: "editorially_curated",
      evidence: [],
      unresolved: [],
    };
  }

  const strictCandidates = strictHanCandidates(handedict, entry.meaning);
  const expectedPos = expectedDictionaryPos(entry);
  const wiktChinese = wiktChineseTranslations(wiktTranslation, expectedPos);
  const wiktSet = new Set(wiktChinese);
  const crossSourceCandidates = strictCandidates.filter((candidate) => wiktSet.has(candidate.word));
  const preferredCandidates = crossSourceCandidates.length === 1
    ? crossSourceCandidates
    : strictCandidates;
  const strictMeaning = preferredCandidates
    .map((candidate) => cleanChineseMeaning(candidate.word))
    .join("；");
  const hardError = meaningHasHardError(entry.meaning);
  const controlledFallback = fallbackMeaning(expectedPos);
  const currentParts = splitChineseMeaning(entry.meaning);
  const currentWiktOverlap = currentParts.filter((part) => wiktSet.has(part));
  if (entry.meaning === controlledFallback) {
    return {
      value: controlledFallback,
      source: "controlled_review_marker",
      reviewStatus: "unresolved",
      evidence: { handedict: strictCandidates, wiktChinese },
      unresolved: ["no_unambiguous_open_chinese_equivalent"],
    };
  }

  if (strictMeaning && hardError) {
    return {
      value: strictMeaning,
      source: "handedict_strict_exact_pos",
      reviewStatus: "open_dictionary_corroborated",
      evidence: { handedict: preferredCandidates, wiktChinese },
      unresolved: ["sense_selection_requires_editorial_review"],
    };
  }

  if (!hardError) {
    if (strictCandidates.some((candidate) => candidate.inCurrent)) {
      return {
        value: cleanChineseMeaning(entry.meaning),
        source: "existing_handedict_corroborated",
        reviewStatus: "open_dictionary_corroborated",
        evidence: { handedict: strictCandidates, wiktChinese },
        unresolved: [],
      };
    }
    if (currentWiktOverlap.length) {
      return {
        value: cleanChineseMeaning(entry.meaning),
        source: "existing_wiktionary_corroborated",
        reviewStatus: "open_dictionary_corroborated",
        evidence: { handedict: strictCandidates, wiktChinese },
        unresolved: [],
      };
    }
    if (preferredCandidates.length === 1) {
      return {
        value: strictMeaning,
        source: crossSourceCandidates.length === 1
          ? "handedict_wiktionary_agreement_repair"
          : "handedict_semantic_disagreement_repair",
        reviewStatus: "open_dictionary_corroborated",
        evidence: { handedict: preferredCandidates, wiktChinese },
        unresolved: ["sense_selection_requires_editorial_review"],
      };
    }
    return {
      value: cleanChineseMeaning(entry.meaning),
      source: "existing_clean_uncorroborated",
      reviewStatus: "unresolved",
      evidence: { handedict: strictCandidates, wiktChinese },
      unresolved: [
        handedict?.status === "pos_matched"
          ? "meaning_semantic_disagreement_or_handedict_ambiguity"
          : "meaning_not_corroborated_by_strict_handedict_match",
      ],
    };
  }

  return {
    value: controlledFallback,
    source: "controlled_review_marker",
    reviewStatus: "unresolved",
    evidence: { handedict: strictCandidates, wiktChinese },
    unresolved: ["no_unambiguous_open_chinese_equivalent"],
  };
}

function controlledExample(entry) {
  const expectedPos = expectedDictionaryPos(entry);
  const [germanPos, chinesePos] = POS_LABELS[expectedPos] ?? POS_LABELS.unknown;
  return {
    german: `Im Wörterbuch steht „${entry.term}“ als ${germanPos}.`,
    chinese: `词典将“${entry.term}”标注为${chinesePos}。`,
  };
}

function sameExample(entry, selected) {
  return (
    selected
    && cleanSpace(entry.example) === cleanSpace(selected.german)
    && cleanSpace(entry.exampleZh) === cleanSpace(selected.chinese)
  );
}

function chooseExample({ entry, auditEntry, tatoeba }) {
  const controlled = controlledExample(entry);
  if (
    cleanSpace(entry.example) === controlled.german
    && cleanSpace(entry.exampleZh) === controlled.chinese
  ) {
    return {
      german: controlled.german,
      chinese: controlled.chinese,
      source: "controlled_pos_safe_template",
      reviewStatus: "semantically_neutral",
      evidence: null,
      unresolved: ["natural_context_example_needed"],
    };
  }

  if (sameExample(entry, tatoeba?.selected)) {
    return {
      german: cleanSpace(tatoeba.selected.german),
      chinese: cleanSpace(tatoeba.selected.chinese),
      source: "tatoeba_parallel_low_risk_surface",
      reviewStatus: "parallel_pair_requires_sense_review",
      evidence: {
        pairId: tatoeba.selected.pairId,
        sourceLine: tatoeba.selected.sourceLine,
        match: tatoeba.selected.match,
      },
      unresolved: ["example_sense_alignment_requires_editorial_review"],
    };
  }

  const invalid = HARD_EXAMPLE_FLAGS.some((flag) => auditEntry.flags.includes(flag));
  if (!invalid) {
    return {
      german: cleanSpace(entry.example),
      chinese: cleanSpace(entry.exampleZh),
      source: "existing_target_verified_example",
      reviewStatus: "retained_pending_review",
      evidence: null,
      unresolved: [],
    };
  }

  if (
    tatoeba?.selected
    && tatoeba.lowRiskSurfaceMatch === true
    && tatoeba.requiresFormReview === false
    && tatoeba.selected.match?.targetVerified === true
  ) {
    return {
      german: cleanSpace(tatoeba.selected.german),
      chinese: cleanSpace(tatoeba.selected.chinese),
      source: "tatoeba_parallel_low_risk_surface",
      reviewStatus: "parallel_pair_requires_sense_review",
      evidence: {
        pairId: tatoeba.selected.pairId,
        sourceLine: tatoeba.selected.sourceLine,
        match: tatoeba.selected.match,
      },
      unresolved: ["example_sense_alignment_requires_editorial_review"],
    };
  }

  return {
    german: controlled.german,
    chinese: controlled.chinese,
    source: "controlled_pos_safe_template",
    reviewStatus: "semantically_neutral",
    evidence: null,
    unresolved: ["natural_context_example_needed"],
  };
}

function repairFormsAndType(entry) {
  const article = entry.term.match(/^(der|die|das)\s+/iu)?.[1]?.toLocaleLowerCase("de-DE");
  const obviousType = article ? ARTICLE_TYPE[article] : null;
  const typeCode = obviousType ?? entry.typeCode;
  const parts = entry.forms.split(/\s*·\s*/u).filter(Boolean);
  const forms = parts.length && caseFold(parts[0]) !== caseFold(entry.term)
    ? [entry.term, ...parts.slice(1)].join(" · ")
    : entry.forms;
  const changes = [];
  if (typeCode !== entry.typeCode) changes.push("noun_article_type_code_aligned");
  if (forms !== entry.forms) changes.push("forms_headword_aligned");
  return { typeCode, forms, changes };
}

function countsBy(values, key) {
  const result = {};
  for (const value of values) {
    const item = typeof key === "function" ? key(value) : value[key];
    result[item] = (result[item] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

async function loadInputs(options) {
  const wordbooks = [];
  for (const relative of WORDBOOK_FILES) {
    const absolute = path.join(options.root, relative);
    const document = JSON.parse(await readFile(absolute, "utf8"));
    const index = Object.fromEntries(document.fields.map((field, position) => [field, position]));
    wordbooks.push({ relative, absolute, document, index });
  }
  const [handedict, tatoeba, wiktTranslations, baselineAudit, overridesSource] = await Promise.all([
    readFile(options.handedictIndex, "utf8").then(JSON.parse),
    readFile(options.tatoebaCache, "utf8").then(JSON.parse),
    readFile(options.wiktTranslations, "utf8").then(JSON.parse),
    readFile(path.join(options.root, ".cache/wordbooks/audit-summary-2026-07-28.json"), "utf8")
      .then(JSON.parse)
      .catch(() => null),
    readFile(path.join(options.root, "app/meaning-overrides.ts"), "utf8"),
  ]);
  return {
    wordbooks,
    handedict,
    tatoeba,
    wiktTranslations,
    baselineAudit,
    overrides: parseMeaningOverrides(overridesSource),
  };
}

export async function repairWordbooks({
  root = process.cwd(),
  wiktCache = path.join(root, ".cache/wordbooks/wiktapi-de-2026-07-28.json"),
  wiktTranslations = path.join(
    root,
    ".cache/wordbooks/wiktapi-translations-2026-07-28.json",
  ),
  handedictIndex = path.join(root, "data/lexicon/handedict-reverse-v1.json"),
  tatoebaCache = path.join(root, "work/tatoeba-cmn-de-v2026-07-08.examples.json"),
  reportPath = path.join(root, "reports/wordbook-repair-v1.json"),
  dryRun = false,
} = {}) {
  const options = {
    root,
    wiktCache,
    wiktTranslations,
    handedictIndex,
    tatoebaCache,
    reportPath,
    dryRun,
  };
  const inputs = await loadInputs(options);
  const preAudit = await buildAuditReport({
    root,
    cachePath: wiktCache,
    generatedAt: "2026-07-28T00:00:00.000Z",
  });
  const auditById = new Map(preAudit.entries.map((entry) => [entry.id, entry]));
  const tatoebaById = new Map(inputs.tatoeba.entries.map((entry) => [entry.id, entry]));
  const provenance = [];
  const updatedDocuments = [];

  for (const wordbook of inputs.wordbooks) {
    const { document, index } = wordbook;
    const words = [];
    for (const originalRow of document.words) {
      const row = [...originalRow];
      const get = (field) => cleanSpace(row[index[field]]);
      const entry = {
        id: get("id"),
        level: document.level,
        term: get("term"),
        forms: get("forms"),
        typeCode: get("typeCode"),
        localType: get("typeCode"),
        meaning: get("meaning"),
        example: get("example"),
        exampleZh: get("exampleZh"),
      };
      const auditEntry = auditById.get(entry.id);
      if (!auditEntry) throw new Error(`Missing audit row: ${entry.id}`);

      const meaning = chooseMeaning({
        entry,
        override: inputs.overrides.get(entry.term),
        handedict: inputs.handedict.entries[entry.id],
        wiktTranslation: inputs.wiktTranslations.entries[
          caseFold(auditEntry.dictionary.selectedLemma ?? "")
        ],
      });
      const example = chooseExample({
        entry,
        auditEntry,
        tatoeba: tatoebaById.get(entry.id),
      });
      const morphology = repairFormsAndType(entry);

      row[index.forms] = morphology.forms;
      row[index.typeCode] = morphology.typeCode;
      row[index.meaning] = meaning.value;
      row[index.example] = example.german;
      row[index.exampleZh] = example.chinese;
      words.push(row);

      const unresolved = unique([
        ...meaning.unresolved,
        ...example.unresolved,
        ...(auditEntry.flags.includes("dictionary_pos_mismatch")
          ? ["dictionary_pos_mismatch_requires_editorial_review"]
          : []),
        ...(auditEntry.flags.includes("dictionary_not_found")
          ? ["german_wiktionary_entry_not_found"]
          : []),
      ]);
      provenance.push({
        id: entry.id,
        level: entry.level,
        term: entry.term,
        morphology: {
          source: morphology.changes.length ? "deterministic_local_rule" : "existing",
          changes: morphology.changes,
          typeCode: morphology.typeCode,
          forms: morphology.forms,
        },
        meaning: {
          value: meaning.value,
          source: meaning.source,
          reviewStatus: meaning.reviewStatus,
          evidence: meaning.evidence,
        },
        example: {
          german: example.german,
          chinese: example.chinese,
          source: example.source,
          reviewStatus: example.reviewStatus,
          evidence: example.evidence,
        },
        dictionary: {
          status: auditEntry.dictionary.status,
          selectedLemma: auditEntry.dictionary.selectedLemma,
          expectedPos: auditEntry.expectedDictionaryPos,
          dictionaryPositions: auditEntry.dictionary.positions,
          sourceUrl: auditEntry.dictionary.lookupUrl,
        },
        unresolved,
      });
    }
    updatedDocuments.push({
      ...wordbook,
      updated: { ...document, words },
    });
  }

  if (!dryRun) {
    for (const wordbook of updatedDocuments) {
      await writeJsonAtomic(wordbook.absolute, wordbook.updated, { pretty: false });
    }
  }

  const postAudit = dryRun
    ? null
    : await buildAuditReport({
        root,
        cachePath: wiktCache,
        generatedAt: "2026-07-28T00:00:00.000Z",
      });
  const postHardFlags = Object.fromEntries(
    HARD_FLAGS.map((flag) => [flag, postAudit ? (postAudit.summary.flags[flag] ?? 0) : null]),
  );
  if (!dryRun) {
    const remaining = Object.entries(postHardFlags).filter(([, count]) => count !== 0);
    if (remaining.length) {
      throw new Error(`Hard repair flags remain: ${JSON.stringify(Object.fromEntries(remaining))}`);
    }
  }

  const sourceFiles = await Promise.all([
    ...WORDBOOK_FILES.map((relative) => fileEvidence(path.join(root, relative), root)),
    fileEvidence(wiktCache, root),
    fileEvidence(wiktTranslations, root),
    fileEvidence(handedictIndex, root),
    fileEvidence(tatoebaCache, root),
  ]);
  const unresolvedEntries = provenance.filter((entry) => entry.unresolved.length);
  const retainedWithoutCorroboration = provenance.filter(
    (entry) => entry.meaning.source === "existing_clean_uncorroborated",
  );
  const report = {
    schemaVersion: 1,
    generatedFromEdition: "2026-07-28",
    policy: {
      automaticChineseReplacement:
        "curated override, corroborated current sense, or one unambiguous strict HanDeDict exact-lemma/POS match",
      automaticParallelExampleReplacement:
        "Tatoeba low-risk surface match only; sense alignment remains explicitly unresolved",
      fallback:
        "semantically neutral POS-safe sentence; no invented lexical meaning or translation",
      preserved: ["id", "level", "row count", "field order"],
    },
    sources: {
      files: sourceFiles,
      germanDictionary: {
        provider: "German Wiktionary via WiktAPI",
        edition: "de",
        license: "CC BY-SA",
      },
      bilingualLexicon: inputs.handedict.source,
      parallelExamples: inputs.tatoeba.source,
    },
    summary: {
      entries: provenance.length,
      levels: countsBy(provenance, "level"),
      meaningSources: countsBy(provenance, (entry) => entry.meaning.source),
      exampleSources: countsBy(provenance, (entry) => entry.example.source),
      morphologyChanges: provenance.filter((entry) => entry.morphology.changes.length).length,
      unresolvedEntries: unresolvedEntries.length,
      retainedWithoutCorroboration: retainedWithoutCorroboration.length,
      unresolvedReasons: countsBy(unresolvedEntries.flatMap((entry) => entry.unresolved), (item) => item),
      hardFlagsBefore: Object.fromEntries(
        HARD_FLAGS.map((flag) => [
          flag,
          inputs.baselineAudit?.summary?.flags?.[flag] ?? preAudit.summary.flags[flag] ?? 0,
        ]),
      ),
      hardFlagsAfter: postHardFlags,
      highRiskMeaningSamples: retainedWithoutCorroboration.slice(0, 30).map((entry) => ({
        id: entry.id,
        term: entry.term,
        meaning: entry.meaning.value,
        reason: entry.unresolved.find((reason) => reason.startsWith("meaning_")),
      })),
    },
    entries: provenance,
  };
  if (!dryRun) await writeJsonAtomic(reportPath, report);
  return report;
}

function parseArguments(argv) {
  const options = { root: process.cwd(), dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${value} requires a value.`);
      return argv[index];
    };
    if (value === "--root") options.root = path.resolve(next());
    else if (value === "--wikt-cache") options.wiktCache = path.resolve(next());
    else if (value === "--wikt-translations") options.wiktTranslations = path.resolve(next());
    else if (value === "--handedict-index") options.handedictIndex = path.resolve(next());
    else if (value === "--tatoeba-cache") options.tatoebaCache = path.resolve(next());
    else if (value === "--report") options.reportPath = path.resolve(next());
    else if (value === "--dry-run") options.dryRun = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/repair_wordbooks.mjs [options]

Options:
  --root <directory>          Repository root.
  --wikt-cache <file>         WiktAPI definition cache.
  --wikt-translations <file>  WiktAPI Chinese translation cache.
  --handedict-index <file>    HanDeDict reverse evidence index.
  --tatoeba-cache <file>      Tatoeba parallel-example evidence.
  --report <file>             Per-row provenance report.
  --dry-run                   Compute without writing wordbooks or report.
`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const report = await repairWordbooks(options);
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
