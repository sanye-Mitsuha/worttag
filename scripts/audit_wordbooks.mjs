#!/usr/bin/env node

/**
 * Reproducible, machine-readable audit for Worttag's complete 6,000-entry corpus.
 *
 * The script deliberately separates three questions:
 *   1. Is the checked-in data structurally and internally plausible?
 *   2. Can the normalized headword be found in German Wiktionary?
 *   3. Which rows still require bilingual or editorial review?
 *
 * It never treats dictionary coverage as proof that a Chinese translation is
 * correct.  WiktAPI data is corroborating evidence, not an automatic verdict.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import OpenCC from "opencc-js";
import ts from "typescript";

export const AUDIT_SCHEMA_VERSION = 1;
export const WIKTAPI_CACHE_SCHEMA_VERSION = 1;

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const PACKED_FILES = LEVELS.map((level) => `public/wordbooks/${level.toLowerCase()}-v1.json`);
const EDITORIAL_FILES = LEVELS.map(
  (level) => `data/editorial/${level.toLowerCase()}-review.json`,
);
const CURATED_SOURCES = [];

const EXPECTED_PACKED_COUNTS = { A1: 700, A2: 700, B1: 1000, B2: 1600, C1: 2000 };
const EXPECTED_CURATED_COUNT = 0;

const FLAG_DEFINITIONS = {
  meaning_placeholder: {
    severity: "error",
    description: "Chinese meaning is a placeholder rather than a definition.",
  },
  meaning_machine_prompt_residue: {
    severity: "error",
    description: "Chinese meaning contains text leaked from a machine-translation prompt.",
  },
  meaning_latin_residue: {
    severity: "review",
    description: "Chinese meaning contains Latin-script material and needs editorial review.",
  },
  advanced_single_character_gloss: {
    severity: "error",
    description: "A B1-C1 entry uses an ambiguous one-character Chinese gloss.",
  },
  chinese_traditional_residue: {
    severity: "error",
    description: "The learner-facing Chinese contains Traditional-Chinese residue.",
  },
  chinese_corrupt_script: {
    severity: "error",
    description: "Learner-facing Chinese contains mojibake, bracketed interpolation, private-use glyphs, or Cyrillic text.",
  },
  chinese_known_garbage_phrase: {
    severity: "error",
    description: "Learner-facing Chinese contains a known mistranslation or malformed phrase.",
  },
  chinese_repeated_terminal_punctuation: {
    severity: "error",
    description: "The Chinese example repeats punctuation after a quoted sentence ending.",
  },
  verb_perfect_auxiliary_unconjugated: {
    severity: "error",
    description: "A verb form gives haben/sein instead of the third-person hat/ist auxiliary.",
  },
  example_synthetic_placeholder: {
    severity: "error",
    description: "German example only states that the item is a learning word or part of speech.",
  },
  example_known_unrelated: {
    severity: "error",
    description: "German example is a known generator fallback unrelated to the headword.",
  },
  example_translation_known_unrelated: {
    severity: "error",
    description: "Chinese example translation belongs to a known unrelated fallback sentence.",
  },
  example_target_not_detected: {
    severity: "review",
    description: "Neither the lemma nor a known local/dictionary form was detected in the example.",
  },
  example_reused_three_plus: {
    severity: "review",
    description: "The exact German example is reused by at least three lexical entries.",
  },
  noun_article_type_mismatch: {
    severity: "error",
    description: "The visible noun article disagrees with the local noun type code.",
  },
  dictionary_cache_miss: {
    severity: "coverage",
    description: "No cache record exists for any normalized lookup lemma.",
  },
  dictionary_not_found: {
    severity: "review",
    description: "Cached WiktAPI lookups did not find a German Wiktionary entry.",
  },
  dictionary_no_senses: {
    severity: "review",
    description: "The cached dictionary entry contains no usable senses.",
  },
  dictionary_pos_mismatch: {
    severity: "error",
    description: "The local part of speech is absent from the cached German Wiktionary entry.",
  },
  dictionary_noun_article_mismatch: {
    severity: "error",
    description: "The local noun article disagrees with nominative singular forms in Wiktionary.",
  },
  phrase_headword_only: {
    severity: "review",
    description: "A multiword learning item falls back to a component headword for dictionary lookup.",
  },
  exact_surface_homograph: {
    severity: "review",
    description: "The same visible term occurs in more than one lexical entry or part of speech.",
  },
  normalized_homograph: {
    severity: "review",
    description: "Multiple entries share the same article-free, case-folded surface form.",
  },
  provenance_missing: {
    severity: "coverage",
    description: "The row has no resolved editorial record or curated-source provenance.",
  },
  cefr_evidence_missing: {
    severity: "coverage",
    description: "The row has no resolved item-level editorial decision for its CEFR band.",
  },
};

const POS_ALIASES = {
  noun: new Set(["noun", "name", "proper_noun", "proper noun"]),
  verb: new Set(["verb"]),
  adjective: new Set(["adj", "adjective"]),
  adverb: new Set(["adv", "adverb"]),
  preposition: new Set(["prep", "preposition", "postp", "postposition"]),
  conjunction: new Set(["conj", "conjunction"]),
  pronoun: new Set(["pron", "pronoun"]),
  determiner: new Set(["det", "determiner", "article"]),
  numeral: new Set(["num", "numeral", "number"]),
  particle: new Set(["particle", "part"]),
  interjection: new Set(["intj", "interjection"]),
  proper: new Set(["name", "proper_noun", "proper noun"]),
  phrase: new Set(["phrase", "proverb", "verb", "noun"]),
};

const LOOKUP_FILLER_WORDS = new Set([
  "sich",
  "etwas",
  "etw",
  "jemand",
  "jemanden",
  "jemandem",
  "jdn",
  "jdm",
  "einer",
  "eine",
  "einem",
  "einen",
  "der",
  "die",
  "das",
]);

const FORM_STOP_WORDS = new Set([
  "als",
  "adjektiv",
  "unveränderlich",
  "meist",
  "ohne",
  "plural",
  "singular",
  "eigenname",
  "haben",
  "sein",
  "hat",
  "ist",
  "die",
  "der",
  "das",
  "sich",
]);

const LOCAL_SUPPLETIVE_OR_CONTRACTED_FORMS = {
  sein: ["bin", "bist", "ist", "sind", "seid", "war", "warst", "waren", "wart", "gewesen"],
  wissen: ["weiß", "weißt", "wissen", "wusste", "wussten", "gewusst"],
  scheißen: ["scheiße", "scheißt", "schiss", "geschissen"],
  sehen: ["sehe", "siehst", "sieht", "sehen", "sah", "gesehen"],
  geben: ["gebe", "gibst", "gibt", "geben", "gab", "gegeben"],
  nehmen: ["nehme", "nimmst", "nimmt", "nehmen", "nahm", "genommen"],
  sprechen: ["spreche", "sprichst", "spricht", "sprechen", "sprach", "gesprochen"],
  lesen: ["lese", "liest", "lesen", "las", "gelesen"],
  essen: ["esse", "isst", "essen", "aß", "gegessen"],
  helfen: ["helfe", "hilfst", "hilft", "helfen", "half", "geholfen"],
  treffen: ["treffe", "triffst", "trifft", "treffen", "traf", "getroffen"],
  fahren: ["fahre", "fährst", "fährt", "fahren", "fuhr", "gefahren"],
  laufen: ["laufe", "läufst", "läuft", "laufen", "lief", "gelaufen"],
  schlafen: ["schlafe", "schläfst", "schläft", "schlafen", "schlief", "geschlafen"],
  tragen: ["trage", "trägst", "trägt", "tragen", "trug", "getragen"],
  halten: ["halte", "hältst", "hält", "halten", "hielt", "gehalten"],
  lassen: ["lasse", "lässt", "lassen", "ließ", "gelassen"],
  fallen: ["falle", "fällst", "fällt", "fallen", "fiel", "gefallen"],
  fangen: ["fange", "fängst", "fängt", "fangen", "fing", "gefangen"],
  gelten: ["gelte", "giltst", "gilt", "gelten", "galt", "gegolten"],
  erkennen: ["erkenne", "erkennt", "erkannt", "erkannte"],
  vertreten: ["vertrete", "vertritt", "vertreten", "vertrat"],
  zwingen: ["zwinge", "zwingt", "zwang", "gezwungen"],
  einziehen: ["ziehe", "zieht", "zog", "eingezogen"],
  ausziehen: ["ziehe", "zieht", "zog", "ausgezogen"],
  aufheben: ["hebe", "hebt", "hob", "aufgehoben"],
  wehtun: ["tut", "weh", "tat", "getan"],
  werden: ["werde", "wirst", "wird", "werden", "wurde", "geworden"],
  haben: ["habe", "hast", "hat", "haben", "hatte", "gehabt"],
  scheren: ["schere", "schert", "scherte", "geschoren"],
  betreffen: ["betrifft", "betraf", "betroffen"],
  stoßen: ["stoße", "stößt", "stieß", "stießen", "gestoßen"],
  sinken: ["sinkt", "sank", "gesunken"],
  stehlen: ["stehle", "stiehlt", "stahl", "stahlen", "gestohlen"],
  schneiden: ["schneide", "schneidet", "schnitt", "geschnitten"],
  treten: ["trete", "tritt", "trat", "getreten"],
  beißen: ["beiße", "beißt", "biss", "gebissen"],
  schlagen: ["schlage", "schlägt", "schlug", "geschlagen"],
  werfen: ["werfe", "wirft", "warf", "geworfen"],
  ziehen: ["ziehe", "zieht", "zog", "gezogen"],
  ansprechen: ["spreche", "spricht", "ansprach", "angesprochen"],
  stechen: ["steche", "sticht", "stach", "gestochen"],
  erfinden: ["erfinde", "erfindet", "erfand", "erfunden"],
  unterbrechen: ["unterbricht", "unterbrach", "unterbrochen"],
  vornehmen: ["nimmt", "nahm", "vorgenommen"],
  weichen: ["weicht", "wich", "gewichen"],
  blasen: ["bläst", "blies", "geblasen"],
  auslösen: ["löst", "löste", "ausgelöst"],
  eingreifen: ["greift", "griff", "eingegriffen"],
  gedenken: ["gedenkt", "gedachte", "gedacht"],
  spinnen: ["spinnt", "spann", "gesponnen"],
  ausdenken: ["denkt", "dachte", "ausgedacht"],
  überstehen: ["übersteht", "überstand", "überstanden"],
  zusagen: ["sagt", "sagte", "zugesagt"],
  zunehmen: ["nimmt", "nahm", "zugenommen"],
  schmeißen: ["schmeißt", "schmiss", "geschmissen"],
  übertreffen: ["übertrifft", "übertraf", "übertroffen"],
  feuern: ["feuert", "feuerte", "gefeuert"],
  abheben: ["hebt", "hob", "abgehoben"],
  zuschlagen: ["schlägt", "schlug", "zugeschlagen"],
  umdrehen: ["dreht", "drehte", "umgedreht"],
  hinlegen: ["legt", "legte", "hingelegt"],
  zu: ["zum", "zur"],
  an: ["am", "ans"],
  auf: ["aufs"],
  bei: ["beim"],
  durch: ["durchs"],
  für: ["fürs"],
  hinter: ["hinters", "hinterm"],
  in: ["im", "ins"],
  über: ["übers"],
  um: ["ums"],
  unter: ["unters", "unterm"],
  von: ["vom"],
  vor: ["vors", "vorm"],
};

const SEPARABLE_VERB_PREFIXES = [
  "ab", "an", "auf", "aus", "ein", "durch", "dar", "fest", "fort", "her", "hin", "los", "mit", "nach", "vor", "weg", "weiter", "zu", "zurück", "um",
];

const SYNTHETIC_EXAMPLE_PATTERNS = [
  /\bist heute unser Lernwort\b/u,
  /\bHeute üben wir das Verb\b/u,
  /\bwird hier als Adjektiv verwendet\b/u,
  /\bist in diesem Satz besonders wichtig\b/u,
  /\bIm Wörterbuch steht\b.*\bals\b/u,
  /\bHeute geht es um\b/u,
  /\bWir können das heute\b/u,
  /\bDas wirkt wirklich\b/u,
];

const KNOWN_UNRELATED_EXAMPLES = new Set([
  "Sie haben recht.",
  "Bitte nicht traurig sein!",
]);

const KNOWN_UNRELATED_TRANSLATIONS = new Set([
  "你说得对。",
  "请别伤心。",
]);
const KNOWN_GARBAGE_CHINESE_PATTERN =
  /具乐部|股票农场|发觉者|强烈的词性|摄影师的模型|帧在其中|立前提|好行尸|皮尔和切柳叶|我叫建筑冷冻音乐|新奇的东西已经磨损|线路已经订婚|[什怎那这]幺/u;
const toMainlandSimplified = OpenCC.Converter({ from: "twp", to: "cn" });
const toSimplified = (value) => (
  toMainlandSimplified(value).replace(/([什怎那这])幺/gu, "$1么")
);

function cleanSpace(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function caseFold(value) {
  return cleanSpace(value).toLocaleLowerCase("de-DE");
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function staticValue(node) {
  const value = unwrapExpression(node);
  if (ts.isStringLiteralLike(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isNumericLiteral(value)) return Number(value.text);
  return undefined;
}

function objectLiteralToRecord(node) {
  const result = {};
  const object = unwrapExpression(node);
  if (!ts.isObjectLiteralExpression(object)) return result;

  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name;
    const key = ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
    if (!key) continue;
    const value = staticValue(property.initializer);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function extractNamedArrays(sourceText, sourcePath, wantedNames) {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const wanted = new Set(wantedNames);
  const found = new Map();

  function visit(node) {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && wanted.has(node.name.text)
      && node.initializer
    ) {
      const initializer = unwrapExpression(node.initializer);
      if (!ts.isArrayLiteralExpression(initializer)) {
        throw new Error(`${sourcePath}:${node.name.text} is not a static array literal.`);
      }
      found.set(node.name.text, initializer.elements.map(objectLiteralToRecord));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  for (const name of wanted) {
    if (!found.has(name)) throw new Error(`Could not find ${name} in ${sourcePath}.`);
  }
  return found;
}

function requireString(record, key, context) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${context} is missing a static string field: ${key}`);
  }
  return cleanSpace(value);
}

export async function loadCuratedEntries(root = process.cwd()) {
  const result = [];
  for (const source of CURATED_SOURCES) {
    const absolute = path.join(root, source.file);
    const sourceText = await readFile(absolute, "utf8");
    const arrays = extractNamedArrays(sourceText, source.file, source.arrays);
    for (const arrayName of source.arrays) {
      for (const raw of arrays.get(arrayName)) {
        const id = requireString(raw, "id", `${source.file}:${arrayName}`);
        result.push({
          id,
          level: requireString(raw, "level", id),
          term: requireString(raw, "term", id),
          forms: requireString(raw, "forms", id),
          localType: requireString(raw, "type", id),
          typeCode: null,
          meaning: requireString(raw, "meaning", id),
          example: requireString(raw, "example", id),
          exampleZh: requireString(raw, "exampleZh", id),
          sourceKind: "curated",
          sourceFile: source.file,
          sourceArray: arrayName,
        });
      }
    }
  }
  if (result.length !== EXPECTED_CURATED_COUNT) {
    throw new Error(`Expected ${EXPECTED_CURATED_COUNT} curated entries, found ${result.length}.`);
  }
  return result;
}

export async function loadPackedEntries(root = process.cwd()) {
  const result = [];
  for (const relative of PACKED_FILES) {
    const absolute = path.join(root, relative);
    const document = JSON.parse(await readFile(absolute, "utf8"));
    const fieldIndex = Object.fromEntries(document.fields.map((field, index) => [field, index]));
    const level = cleanSpace(document.level);
    if (!LEVELS.includes(level)) throw new Error(`${relative} has an invalid level: ${level}`);
    if (document.words.length !== EXPECTED_PACKED_COUNTS[level]) {
      throw new Error(
        `${relative} has ${document.words.length} entries; expected ${EXPECTED_PACKED_COUNTS[level]}.`,
      );
    }
    for (const row of document.words) {
      const get = (field) => cleanSpace(row[fieldIndex[field]]);
      result.push({
        id: get("id"),
        level,
        term: get("term"),
        forms: get("forms"),
        localType: get("typeCode"),
        typeCode: get("typeCode"),
        meaning: get("meaning"),
        example: get("example"),
        exampleZh: get("exampleZh"),
        sourceKind: "packed",
        sourceFile: relative,
        sourceArray: null,
      });
    }
  }
  return result;
}

async function loadEditorialReviews(root = process.cwd()) {
  const entries = new Map();
  const files = [];
  for (const relative of EDITORIAL_FILES) {
    let review;
    try {
      review = JSON.parse(await readFile(path.join(root, relative), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (!Array.isArray(review.entries)) {
      throw new Error(`${relative} must contain an entries array.`);
    }
    files.push(relative);
    for (const record of review.entries) {
      const id = cleanSpace(record?.after?.id ?? record?.id);
      if (!id) throw new Error(`${relative} contains an editorial row without an ID.`);
      if (entries.has(id)) throw new Error(`Duplicate editorial row for ${id}.`);
      entries.set(id, { ...record, sourceFile: relative });
    }
  }
  return { entries, files };
}

function editorialEvidenceFor(entry, editorialReviews) {
  if (entry.sourceKind === "packed") {
    return {
      status: "imported_source",
      sourceFile: entry.sourceFile,
      evidenceCount: 1,
      reasonCount: 1,
    };
  }
  if (entry.sourceKind === "curated") {
    return {
      status: "curated_source",
      sourceFile: entry.sourceFile,
      evidenceCount: 1,
      reasonCount: 1,
    };
  }
  const review = editorialReviews.entries.get(entry.id);
  if (!review) {
    return {
      status: "missing",
      sourceFile: null,
      evidenceCount: 0,
      reasonCount: 0,
    };
  }
  const unresolvedReasons = Array.isArray(review.unresolvedReasons)
    ? review.unresolvedReasons.filter(Boolean)
    : [];
  const resolved = review.unresolved === false && unresolvedReasons.length === 0;
  const afterMatches = [
    "id",
    "term",
    "forms",
    "typeCode",
    "meaning",
    "example",
    "exampleZh",
  ].every((field) => cleanSpace(review.after?.[field]) === cleanSpace(entry[field]));
  return {
    status: resolved && afterMatches
      ? "resolved"
      : resolved
        ? "stale"
        : "unresolved",
    sourceFile: review.sourceFile,
    evidenceCount: Array.isArray(review.evidence) ? review.evidence.length : 0,
    reasonCount: Array.isArray(review.reason) ? review.reason.length : 0,
  };
}

export function expectedDictionaryPos(entry) {
  const type = caseFold(entry.typeCode || entry.localType);
  if (["nm", "nf", "nn"].includes(type) || /nomen|名词/u.test(type)) return "noun";
  if (type === "v" || /verb|动词/u.test(type)) return "verb";
  if (type === "adj" || /adjektiv|形容词/u.test(type)) return "adjective";
  if (type === "adv" || /adverb|副词/u.test(type)) return "adverb";
  if (type === "prep" || /präposition|介词/u.test(type)) return "preposition";
  if (type === "conj" || /konjunktion|连词/u.test(type)) return "conjunction";
  if (type === "pron" || /pronomen|代词/u.test(type)) return "pronoun";
  if (type === "det" || /determiner|限定词|冠词/u.test(type)) return "determiner";
  if (type === "num" || /numeral|数词/u.test(type)) return "numeral";
  if (type === "part" || /partikel|小品词|语气词/u.test(type)) return "particle";
  if (type === "intj" || /interjektion|感叹词/u.test(type)) return "interjection";
  if (type === "prop" || /eigenname|专有名词/u.test(type)) return "proper";
  if (type === "phrase" || /搭配|短语/u.test(type)) return "phrase";
  return "unknown";
}

function stripNounArticle(term) {
  return cleanSpace(term).replace(/^(?:der|die|das)\s+/iu, "");
}

function uniqueStrings(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const cleaned = cleanSpace(value).replace(/[.,;:]+$/u, "");
    if (!cleaned) continue;
    const key = caseFold(cleaned);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cleaned);
    }
  }
  return result;
}

/**
 * Return ordered lookup candidates.  The first item is the preferred
 * dictionary headword; later items are fallbacks retained for phrases.
 */
export function normalizeLookupLemmas(term, localType = "") {
  const entry = { term: cleanSpace(term), localType, typeCode: localType };
  const expectedPos = expectedDictionaryPos(entry);
  const articleFree = expectedPos === "noun" ? stripNounArticle(entry.term) : entry.term;
  const noAnnotations = cleanSpace(articleFree.replace(/\([^)]*\)/gu, " "));
  const rawTokens = noAnnotations.split(/\s+/u).filter(Boolean);

  if (expectedPos === "verb") {
    const contentTokens = rawTokens.filter(
      (token) => !LOOKUP_FILLER_WORDS.has(caseFold(token).replace(/[.]/gu, "")),
    );
    const likelyInfinitives = contentTokens.filter((token) => /(?:en|ern|eln|tun|sein)$/iu.test(token));
    const head = likelyInfinitives.at(-1) || contentTokens.at(-1) || noAnnotations;
    return uniqueStrings([head, noAnnotations, contentTokens.join(" ")]);
  }

  if (expectedPos === "phrase" || rawTokens.length > 1) {
    const contentTokens = rawTokens.filter(
      (token) => !LOOKUP_FILLER_WORDS.has(caseFold(token).replace(/[.]/gu, "")),
    );
    const likelyVerb = [...contentTokens].reverse().find((token) => /(?:en|ern|eln|tun|sein)$/iu.test(token));
    return uniqueStrings([noAnnotations, likelyVerb, ...contentTokens]);
  }

  return uniqueStrings([noAnnotations]);
}

function normalizeCacheContainer(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return new Map();
  const container = raw.entries && typeof raw.entries === "object" && !Array.isArray(raw.entries)
    ? raw.entries
    : raw.lookups && typeof raw.lookups === "object" && !Array.isArray(raw.lookups)
      ? raw.lookups
      : raw;
  const map = new Map();
  for (const [key, value] of Object.entries(container)) {
    if (["schemaVersion", "provider", "edition", "language", "updatedAt"].includes(key)) continue;
    // German capitalisation is lexically significant: `ich` is a pronoun,
    // while `Ich` is the nominalised noun. Keep cache keys case-sensitive so
    // evidence for one cannot silently validate the other.
    map.set(key.normalize("NFC"), { key, value });
  }
  return map;
}

export async function loadWiktApiCache(cachePath) {
  if (!cachePath) return { provided: false, path: null, raw: null, index: new Map() };
  const raw = JSON.parse(await readFile(cachePath, "utf8"));
  return {
    provided: true,
    path: cachePath,
    raw,
    index: normalizeCacheContainer(raw),
  };
}

function cachePayload(record) {
  if (!record || typeof record !== "object") return null;
  return record.response ?? record.data ?? record.payload ?? record;
}

function cacheStatus(record) {
  if (!record || typeof record !== "object") return null;
  const status = Number(record.status ?? record.statusCode ?? record.httpStatus);
  return Number.isFinite(status) ? status : null;
}

function dictionaryRecords(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.definitions)) return payload.definitions;
  if (Array.isArray(payload.entries)) return payload.entries;
  if (Array.isArray(payload.forms)) return payload.forms;
  return [];
}

function extractDictionaryEvidence(record) {
  const payload = cachePayload(record);
  const status = cacheStatus(record);
  const records = dictionaryRecords(payload);
  const found = status === 404 ? false : records.length > 0;
  const positions = uniqueStrings(records.map((item) => item?.pos).filter(Boolean)).map(caseFold);
  const senses = records.flatMap((item) => Array.isArray(item?.senses) ? item.senses : []);
  const forms = records.flatMap((item) => Array.isArray(item?.forms) ? item.forms : []);
  const translations = records.flatMap(
    (item) => Array.isArray(item?.translations) ? item.translations : [],
  );
  const chineseTranslations = uniqueStrings(
    translations
      .filter((item) => item?.lang_code === "zh" || /chinesisch|chinese/iu.test(item?.lang || ""))
      .map((item) => item?.word)
      .filter(Boolean),
  );
  const nominativeArticles = uniqueStrings(
    forms
      .filter((item) => (
        Array.isArray(item?.tags)
        && item.tags.includes("nominative")
        && item.tags.includes("singular")
        && item.article
      ))
      .map((item) => item.article),
  );
  return {
    found,
    httpStatus: status,
    positions,
    senseCount: senses.length,
    formCount: forms.length,
    chineseTranslations,
    nominativeArticles,
  };
}

function dictionaryEvidenceFor(entry, cache) {
  const lemmas = normalizeLookupLemmas(entry.term, entry.typeCode || entry.localType);
  const attempted = [];
  for (const lemma of lemmas) {
    const cached = cache.index.get(lemma.normalize("NFC"));
    if (!cached) continue;
    const evidence = extractDictionaryEvidence(cached.value);
    attempted.push({ lemma, cacheKey: cached.key, ...evidence });
    if (evidence.found) {
      return {
        lemmas,
        selectedLemma: lemma,
        cacheKey: cached.key,
        ...evidence,
        status: "found",
        attempted,
      };
    }
  }
  if (attempted.length) {
    return {
      lemmas,
      selectedLemma: attempted[0].lemma,
      cacheKey: attempted[0].cacheKey,
      status: "not_found",
      found: false,
      positions: [],
      senseCount: 0,
      formCount: 0,
      chineseTranslations: [],
      nominativeArticles: [],
      attempted,
    };
  }
  return {
    lemmas,
    selectedLemma: lemmas[0] ?? null,
    cacheKey: null,
    status: cache.provided ? "cache_miss" : "not_checked",
    found: null,
    positions: [],
    senseCount: null,
    formCount: null,
    chineseTranslations: [],
    nominativeArticles: [],
    attempted: [],
  };
}

function expectedNounArticle(entry) {
  if (entry.typeCode === "nm") return "der";
  if (entry.typeCode === "nf") return "die";
  if (entry.typeCode === "nn") return "das";
  if (expectedDictionaryPos(entry) !== "noun") return null;
  const match = entry.term.match(/^(der|die|das)\s+/iu);
  return match ? caseFold(match[1]) : null;
}

function posMatches(expected, dictionaryPositions) {
  if (expected === "unknown" || !dictionaryPositions.length) return true;
  const accepted = POS_ALIASES[expected] ?? new Set([expected]);
  return dictionaryPositions.some((position) => accepted.has(caseFold(position)));
}

function localFormTokens(entry, dictionaryEvidence) {
  const candidates = [];
  candidates.push(...normalizeLookupLemmas(entry.term, entry.typeCode || entry.localType));
  candidates.push(
    ...entry.forms
      .split(/\s*[·;]\s*/u)
      .flatMap((part) => part.split(/\s+/u))
      .map((part) => part.replace(/[„“"'()[\],.!?…]/gu, "")),
  );
  if (dictionaryEvidence?.forms) {
    candidates.push(...dictionaryEvidence.forms.map((item) => item?.form).filter(Boolean));
  }
  return uniqueStrings(candidates)
    .flatMap((value) => value.split(/\s+/u))
    .map((value) => caseFold(value.replace(/[„“"'()[\],.!?…]/gu, "")))
    .filter((value) => value.length >= 3 && !FORM_STOP_WORDS.has(value));
}

function germanVerbStem(value) {
  const suffixes = ["ern", "eln", "en", "test", "tet", "ten", "est", "et", "te", "st", "t", "e"];
  for (const suffix of suffixes) {
    if (value.endsWith(suffix) && value.length - suffix.length >= 3) {
      return value.slice(0, -suffix.length);
    }
  }
  return value;
}

function normalizeGermanVerbSurface(value) {
  return caseFold(value)
    .replace(/ä/gu, "a")
    .replace(/ö/gu, "o")
    .replace(/ü/gu, "u")
    .replace(/ß/gu, "ss");
}

function verbSurfaceMatches(lemma, example) {
  const normalizedLemma = caseFold(lemma);
  const baseLemmas = [normalizedLemma];
  for (const prefix of SEPARABLE_VERB_PREFIXES) {
    if (normalizedLemma.startsWith(prefix) && normalizedLemma.length - prefix.length >= 4) {
      baseLemmas.push(normalizedLemma.slice(prefix.length));
    }
  }
  const stems = baseLemmas.flatMap((base) => {
    const normalized = normalizeGermanVerbSurface(base);
    return [normalized, normalizeGermanVerbSurface(germanVerbStem(normalized))]
      .filter((stem) => stem.length >= 3);
  });
  const variants = baseLemmas.flatMap((base) => LOCAL_SUPPLETIVE_OR_CONTRACTED_FORMS[base] ?? []);
  const exampleTokens = [...String(example ?? "").matchAll(/\p{L}+(?:['’\-]\p{L}+)?/gu)]
    .map((match) => normalizeGermanVerbSurface(match[0]));
  return variants.some((variant) => exampleTokens.includes(normalizeGermanVerbSurface(variant)))
    || stems.some((stem) => exampleTokens.some((token) => token.includes(stem)));
}

function exampleContainsTarget(entry, dictionaryEvidence) {
  const example = caseFold(entry.example);
  // Always test the declared surface headword before filtering short function
  // words and form metadata. This keeps the conservative form heuristic while
  // correctly recognizing explicit citations such as „zu“, „das“ and „S“.
  const directSurface = caseFold(
    expectedDictionaryPos(entry) === "noun" ? stripNounArticle(entry.term) : entry.term,
  );
  if (directSurface) {
    const escapedSurface = directSurface.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    if (
      new RegExp(
        `(?<![\\p{L}\\p{N}])${escapedSurface}(?![\\p{L}\\p{N}])`,
        "iu",
      ).test(example)
    ) {
      return true;
    }
  }
  if (expectedDictionaryPos(entry) === "noun" && directSurface) {
    const nounBase = normalizeGermanVerbSurface(directSurface);
    const nounTokens = [...String(entry.example ?? "").matchAll(/\p{L}+(?:['’\-]\p{L}+)?/gu)]
      .map((match) => normalizeGermanVerbSurface(match[0]));
    if (nounTokens.some((token) => token.startsWith(nounBase) && token.length - nounBase.length <= 3)) {
      return true;
    }
  }
  const localSpecialForms =
    LOCAL_SUPPLETIVE_OR_CONTRACTED_FORMS[directSurface] ?? [];
  if (
    localSpecialForms.some((form) => {
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      return new RegExp(
        `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
        "iu",
      ).test(example);
    })
  ) {
    return true;
  }
  if (expectedDictionaryPos(entry) === "verb" && verbSurfaceMatches(directSurface, entry.example)) {
    return true;
  }
  for (const candidate of localFormTokens(entry, dictionaryEvidence)) {
    const stem = expectedDictionaryPos(entry) === "verb" ? germanVerbStem(candidate) : candidate;
    if (stem.length < 3) continue;
    const escaped = stem.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    if (new RegExp(`(?<![\\p{L}])${escaped}[\\p{L}'’-]*(?![\\p{L}])`, "iu").test(example)) {
      return true;
    }
  }
  return false;
}

function normalizedSurface(entry) {
  return caseFold(stripNounArticle(entry.term));
}

function localFlags(entry, context, dictionary, editorial) {
  const flags = [];
  const add = (flag) => {
    if (!flags.includes(flag)) flags.push(flag);
  };

  if (
    entry.meaning === "词义见例句"
    || /义项尚待人工核定|尚待人工|待人工核定/u.test(entry.meaning)
  ) {
    add("meaning_placeholder");
  }
  if (
    ["B1", "B2", "C1"].includes(entry.level)
    && /^\p{Script=Han}$/u.test(entry.meaning)
  ) {
    add("advanced_single_character_gloss");
  }
  if (
    /这(?:个|颗|首|项|条|一)?(?:德国|德语).*?(?:词典|意[义思]|含义|在[“"])|词典意[义思]|词典含义|dictionary meaning|在[“"][^”"]+[”"]中/u.test(entry.meaning)
  ) {
    add("meaning_machine_prompt_residue");
  }
  const meaningWithoutEstablishedMixedScriptWords = entry.meaning
    // `T恤` is the standard Simplified-Chinese spelling, not leaked source
    // text or an untranslated German gloss.
    .replace(/T恤/gu, "");
  if (/[A-Za-z]|\[[^\]]*\]/u.test(meaningWithoutEstablishedMixedScriptWords)) {
    add("meaning_latin_residue");
  }
  const learnerChinese = `${entry.meaning}${entry.exampleZh}`;
  if (toSimplified(learnerChinese) !== learnerChinese) {
    add("chinese_traditional_residue");
  }
  if (/[\uE000-\uF8FF\uFFFD\[\]]|\p{Script=Cyrillic}/u.test(learnerChinese)) {
    add("chinese_corrupt_script");
  }
  if (KNOWN_GARBAGE_CHINESE_PATTERN.test(learnerChinese)) {
    add("chinese_known_garbage_phrase");
  }
  if (/[。！？][”」』"']。$/u.test(entry.exampleZh)) {
    add("chinese_repeated_terminal_punctuation");
  }
  if (
    entry.typeCode === "v"
    && !/^(?:haben|sein)\b/u.test(entry.forms)
    && /^(?:haben|sein)\b/u.test(entry.forms.split("·").at(-1)?.trim() ?? "")
  ) {
    add("verb_perfect_auxiliary_unconjugated");
  }
  if (entry.example) {
    if (SYNTHETIC_EXAMPLE_PATTERNS.some((pattern) => pattern.test(entry.example))) {
      add("example_synthetic_placeholder");
    }
    if (KNOWN_UNRELATED_EXAMPLES.has(entry.example)) add("example_known_unrelated");
    if (KNOWN_UNRELATED_TRANSLATIONS.has(entry.exampleZh)) add("example_translation_known_unrelated");
    if (!exampleContainsTarget(entry, dictionary)) add("example_target_not_detected");
    if ((context.exampleCounts.get(entry.example) ?? 0) >= 3) add("example_reused_three_plus");
  }

  const expectedArticle = expectedNounArticle(entry);
  const visibleArticle = entry.term.match(/^(der|die|das)\s+/iu)?.[1];
  if (
    entry.typeCode
    && ["nm", "nf", "nn"].includes(entry.typeCode)
    && expectedArticle !== caseFold(visibleArticle || "")
  ) {
    add("noun_article_type_mismatch");
  }

  if (dictionary.status === "cache_miss") add("dictionary_cache_miss");
  if (dictionary.status === "not_found") add("dictionary_not_found");
  if (dictionary.status === "found" && dictionary.senseCount === 0) add("dictionary_no_senses");
  const expectedPos = expectedDictionaryPos(entry);
  if (
    dictionary.status === "found"
    && dictionary.positions.length
    && !posMatches(expectedPos, dictionary.positions)
  ) {
    add("dictionary_pos_mismatch");
  }
  if (
    expectedArticle
    && dictionary.nominativeArticles.length
    && !dictionary.nominativeArticles.map(caseFold).includes(expectedArticle)
  ) {
    add("dictionary_noun_article_mismatch");
  }
  const fullVisibleTerm = stripNounArticle(entry.term);
  if (
    dictionary.lemmas.length > 1
    && dictionary.selectedLemma
    && caseFold(dictionary.selectedLemma) !== caseFold(fullVisibleTerm)
  ) {
    add("phrase_headword_only");
  }
  if ((context.exactSurfaceCounts.get(caseFold(entry.term)) ?? 0) > 1) {
    add("exact_surface_homograph");
  }
  if ((context.normalizedSurfaceCounts.get(normalizedSurface(entry)) ?? 0) > 1) {
    add("normalized_homograph");
  }

  if (!["resolved", "curated_source", "imported_source"].includes(editorial.status)) {
    add("provenance_missing");
    add("cefr_evidence_missing");
  }
  return flags;
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] ?? 0) + amount;
}

function summarize(audited) {
  const flags = {};
  const severity = {};
  const byLevel = Object.fromEntries(
    LEVELS.map((level) => [
      level,
      { total: 0, packed: 0, curated: 0, flags: {}, dictionary: {}, editorial: {} },
    ]),
  );
  const dictionary = {};
  const editorial = {};
  for (const entry of audited) {
    const level = byLevel[entry.level];
    level.total += 1;
    level[entry.sourceKind] += 1;
    increment(dictionary, entry.dictionary.status);
    increment(level.dictionary, entry.dictionary.status);
    increment(editorial, entry.editorial.status);
    increment(level.editorial, entry.editorial.status);
    for (const flag of entry.flags) {
      increment(flags, flag);
      increment(level.flags, flag);
      increment(severity, FLAG_DEFINITIONS[flag]?.severity ?? "unknown");
    }
  }
  return {
    total: audited.length,
    packed: audited.filter((entry) => entry.sourceKind === "packed").length,
    curated: audited.filter((entry) => entry.sourceKind === "curated").length,
    dictionary,
    editorial,
    flags,
    severity,
    byLevel,
  };
}

async function fileDigest(filePath) {
  const bytes = await readFile(filePath);
  return {
    path: filePath,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function buildAuditReport({
  root = process.cwd(),
  cachePath = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const [packed, curated, cache, editorialReviews] = await Promise.all([
    loadPackedEntries(root),
    loadCuratedEntries(root),
    loadWiktApiCache(cachePath),
    loadEditorialReviews(root),
  ]);
  const entries = [...packed, ...curated];
  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate corpus ID: ${entry.id}`);
    ids.add(entry.id);
  }
  if (entries.length !== 6000) throw new Error(`Expected 6000 total entries, found ${entries.length}.`);

  const exampleCounts = new Map();
  const exactSurfaceCounts = new Map();
  const normalizedSurfaceCounts = new Map();
  for (const entry of entries) {
    exampleCounts.set(entry.example, (exampleCounts.get(entry.example) ?? 0) + 1);
    const exact = caseFold(entry.term);
    exactSurfaceCounts.set(exact, (exactSurfaceCounts.get(exact) ?? 0) + 1);
    const normalized = normalizedSurface(entry);
    normalizedSurfaceCounts.set(normalized, (normalizedSurfaceCounts.get(normalized) ?? 0) + 1);
  }
  const context = { exampleCounts, exactSurfaceCounts, normalizedSurfaceCounts };

  const audited = entries.map((entry) => {
    const dictionary = dictionaryEvidenceFor(entry, cache);
    const editorial = editorialEvidenceFor(entry, editorialReviews);
    const flags = localFlags(entry, context, dictionary, editorial);
    return {
      ...entry,
      expectedDictionaryPos: expectedDictionaryPos(entry),
      editorial,
      dictionary: {
        provider: "German Wiktionary via WiktAPI",
        edition: "de",
        language: "de",
        lookupUrl: dictionary.selectedLemma
          ? `https://api.wiktapi.dev/v1/de/word/${encodeURIComponent(dictionary.selectedLemma)}?lang=de`
          : null,
        ...dictionary,
      },
      flags,
    };
  });

  const inputPaths = [
    ...PACKED_FILES,
    "public/wordbooks/manifest-v1.json",
  ];
  const inputs = await Promise.all(
    [...new Set(inputPaths)].map(async (relative) => {
      const digest = await fileDigest(path.join(root, relative));
      return { ...digest, path: relative };
    }),
  );
  if (cachePath) {
    const digest = await fileDigest(cachePath);
    inputs.push({ ...digest, path: cachePath, role: "wiktapi-cache" });
  }

  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    generatedAt,
    corpus: {
      expectedTotal: 6000,
      levels: LEVELS,
      inputs,
    },
    dictionaryCache: {
      provided: cache.provided,
      path: cache.path,
      records: cache.index.size,
      format: {
        schemaVersion: WIKTAPI_CACHE_SCHEMA_VERSION,
        provider: "WiktAPI",
        edition: "de",
        language: "de",
      },
    },
    flagDefinitions: FLAG_DEFINITIONS,
    summary: summarize(audited),
    entries: audited,
  };
}

function emptyCache() {
  return {
    schemaVersion: WIKTAPI_CACHE_SCHEMA_VERSION,
    provider: "WiktAPI",
    edition: "de",
    language: "de",
    updatedAt: null,
    entries: {},
  };
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

async function fetchOneDefinition(baseUrl, lemma) {
  const url = new URL(
    `/v1/de/word/${encodeURIComponent(lemma)}/definitions`,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  );
  url.searchParams.set("lang", "de");
  const response = await fetch(url, {
    headers: { accept: "application/json" },
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
    endpoint: url.toString(),
    response: body,
  };
}

export async function fetchMissingCacheEntries({
  root = process.cwd(),
  cachePath,
  maxFetch = 100,
  concurrency = 4,
  baseUrl = "https://api.wiktapi.dev",
} = {}) {
  if (!cachePath) throw new Error("--fetch-missing requires --cache <path>.");
  let cache;
  try {
    cache = JSON.parse(await readFile(cachePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    cache = emptyCache();
  }
  if (!cache.entries || Array.isArray(cache.entries)) cache.entries = {};
  const index = normalizeCacheContainer(cache);
  const [packed, curated] = await Promise.all([loadPackedEntries(root), loadCuratedEntries(root)]);
  const lemmas = uniqueStrings(
    [...packed, ...curated].flatMap((entry) => (
      normalizeLookupLemmas(entry.term, entry.typeCode || entry.localType)
    )),
  );
  const pending = lemmas
    .filter((lemma) => !index.has(lemma.normalize("NFC")))
    .slice(0, maxFetch);
  let cursor = 0;
  let completed = 0;
  let persistence = Promise.resolve();

  async function worker() {
    while (cursor < pending.length) {
      const lemma = pending[cursor];
      cursor += 1;
      try {
        cache.entries[lemma] = await fetchOneDefinition(baseUrl, lemma);
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
      if (completed % 25 === 0 || completed === pending.length) {
        cache.updatedAt = new Date().toISOString();
        persistence = persistence.then(() => writeJsonAtomic(cachePath, cache));
        await persistence;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, pending.length || 1)) }, () => worker()),
  );
  return { requested: pending.length, totalLemmas: lemmas.length, cacheEntries: Object.keys(cache.entries).length };
}

function parseArguments(argv) {
  const options = {
    root: process.cwd(),
    cachePath: null,
    output: null,
    summaryOnly: false,
    fetchMissing: false,
    maxFetch: 100,
    concurrency: 4,
    baseUrl: "https://api.wiktapi.dev",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${value} requires a value.`);
      return argv[index];
    };
    if (value === "--root") options.root = path.resolve(next());
    else if (value === "--cache") options.cachePath = path.resolve(next());
    else if (value === "--output") options.output = path.resolve(next());
    else if (value === "--summary-only") options.summaryOnly = true;
    else if (value === "--fetch-missing") options.fetchMissing = true;
    else if (value === "--max-fetch") options.maxFetch = Number(next());
    else if (value === "--concurrency") options.concurrency = Number(next());
    else if (value === "--base-url") options.baseUrl = next();
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!Number.isInteger(options.maxFetch) || options.maxFetch < 1) {
    throw new Error("--max-fetch must be a positive integer.");
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 16) {
    throw new Error("--concurrency must be an integer between 1 and 16.");
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/audit_wordbooks.mjs [options]

Options:
  --cache <file>       Consume a WiktAPI JSON cache.
  --fetch-missing      Fetch missing German definition records into --cache.
  --max-fetch <n>      Maximum records fetched in one run (default: 100).
  --concurrency <n>    Concurrent WiktAPI requests, 1-16 (default: 4).
  --output <file>      Write JSON to a file instead of stdout.
  --summary-only       Emit metadata and summary without the 6,000 row records.
  --root <directory>   Repository root (default: current directory).
  --base-url <url>     WiktAPI base URL (default: https://api.wiktapi.dev).
`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (options.fetchMissing) {
    const fetched = await fetchMissingCacheEntries(options);
    process.stderr.write(`${JSON.stringify({ wiktapiFetch: fetched })}\n`);
  }
  const report = await buildAuditReport(options);
  const output = options.summaryOnly
    ? {
        ...report,
        entries: undefined,
      }
    : report;
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  if (options.output) await writeJsonAtomic(options.output, JSON.parse(serialized));
  else process.stdout.write(serialized);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
