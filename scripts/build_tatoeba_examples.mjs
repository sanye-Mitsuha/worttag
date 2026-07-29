#!/usr/bin/env node

/**
 * Build a deterministic candidate cache of human-translated German–Chinese
 * example sentences for Worttag's complete 6,000-entry corpus.
 *
 * Source:
 *   OPUS Tatoeba v2026-07-08, cmn-de, Moses format
 *   https://opus.nlpl.eu/legacy/Tatoeba-v2026-07-08.php
 *   CC BY 2.0 FR
 *
 * This script intentionally does not edit public/wordbooks/*.json.  It emits
 * evidence that a separate editorial repair step can consume.  A selected
 * sentence is never assigned to more than one word, and ambiguous homographs
 * are marked for sense review instead of being presented as automatically safe.
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  expectedDictionaryPos,
  loadCuratedEntries,
  loadPackedEntries,
  normalizeLookupLemmas,
} from "./audit_wordbooks.mjs";

const execFileAsync = promisify(execFile);

export const TATOEBA_EXAMPLE_SCHEMA_VERSION = 1;
export const TATOEBA_RELEASE = "v2026-07-08";
export const DEFAULT_MAX_CANDIDATES = 3;

const SOURCE_FILES = {
  german: "Tatoeba.cmn-de.de",
  chinese: "Tatoeba.cmn-de.cmn",
  readme: "README",
  license: "LICENSE",
};

const SOURCE_METADATA = {
  corpus: "Tatoeba",
  distributor: "OPUS",
  release: TATOEBA_RELEASE,
  languagePair: "cmn-de",
  format: "Moses parallel text",
  license: "CC BY 2.0 FR",
  licenseUrl: "https://creativecommons.org/licenses/by/2.0/fr/",
  corpusUrl: "https://opus.nlpl.eu/legacy/Tatoeba-v2026-07-08.php",
  tatoebaUrl: "https://tatoeba.org/",
  citation:
    "Jörg Tiedemann (2012), Parallel Data, Tools and Interfaces in OPUS, LREC 2012.",
};

const MODE_SCORE = {
  headword_phrase: 150,
  declared_phrase: 145,
  headword_exact: 140,
  declared_form: 132,
  adjective_inflection: 124,
};

const ARTICLES = new Set([
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "ein",
  "eine",
  "einer",
  "einem",
  "einen",
  "eines",
]);

const FORM_META_WORDS = new Set([
  "als",
  "adjektiv",
  "adverb",
  "eigenname",
  "feminin",
  "maskulin",
  "neutral",
  "nomen",
  "ohne",
  "plural",
  "singular",
  "unveränderlich",
  "meist",
  "trennbar",
  "untrennbar",
]);

const VERB_HELPERS = new Set([
  "bin",
  "bist",
  "ist",
  "sind",
  "seid",
  "war",
  "waren",
  "sein",
  "hat",
  "hast",
  "haben",
  "hatte",
  "hatten",
  "wird",
  "werden",
  "wurde",
  "worden",
  "sich",
  "mich",
  "dich",
  "uns",
  "euch",
]);

const TERM_FILLERS = new Set([
  "sich",
  "etwas",
  "etw",
  "jemand",
  "jemanden",
  "jemandem",
  "jdn",
  "jdm",
]);

const SEPARABLE_PARTICLES = new Set([
  "ab",
  "an",
  "auf",
  "aus",
  "bei",
  "ein",
  "fest",
  "fort",
  "her",
  "hin",
  "los",
  "mit",
  "nach",
  "vor",
  "weg",
  "weiter",
  "zu",
  "zurück",
  "zusammen",
]);

const CLAUSE_BOUNDARY_WORDS = new Set([
  "aber",
  "als",
  "bevor",
  "bis",
  "da",
  "damit",
  "dann",
  "denn",
  "doch",
  "falls",
  "nachdem",
  "obwohl",
  "oder",
  "seitdem",
  "sondern",
  "sowie",
  "und",
  "während",
  "weil",
  "wenn",
]);

const SHORT_AMBIGUOUS = new Set([
  "an",
  "am",
  "auf",
  "aus",
  "da",
  "der",
  "die",
  "das",
  "du",
  "ein",
  "er",
  "es",
  "im",
  "in",
  "ich",
  "ja",
  "mit",
  "nach",
  "sie",
  "um",
  "von",
  "vor",
  "was",
  "weg",
  "wie",
  "wir",
  "zu",
]);

function cleanSpace(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function caseFold(value) {
  return cleanSpace(value).toLocaleLowerCase("de-DE");
}

export function tokenizeGerman(value) {
  return [...cleanSpace(value).matchAll(/\p{L}+(?:['’\-]\p{L}+)?/gu)]
    .map((match) => caseFold(match[0]));
}

function tokenizeGermanSurface(value) {
  return [...cleanSpace(value).matchAll(/\p{L}+(?:['’\-]\p{L}+)?/gu)]
    .map((match) => match[0].normalize("NFC"));
}

function stripNounArticle(term) {
  const tokens = tokenizeGerman(term);
  if (tokens.length > 1 && ARTICLES.has(tokens[0])) return tokens.slice(1);
  return tokens;
}

function uniquePatterns(patterns) {
  const seen = new Set();
  const result = [];
  for (const pattern of patterns) {
    const key = `${pattern.mode}\0${pattern.tokens.join("\0")}\0${Boolean(pattern.particleFinal)}`;
    if (!pattern.tokens.length || seen.has(key)) continue;
    seen.add(key);
    result.push(pattern);
  }
  return result;
}

function adjectiveVariants(lemma) {
  if (!lemma || lemma.includes("-")) return [];
  const suffixes = lemma.endsWith("e") ? ["", "n", "r", "s", "m"] : ["", "e", "en", "er", "es", "em"];
  return suffixes.map((suffix) => `${lemma}${suffix}`);
}

/**
 * Build conservative, explainable surface-form match patterns.
 *
 * No generic haben/sein tokens are accepted as verb evidence.  Separable and
 * multiword forms retain at least two lexical tokens, which prevents a lone
 * particle such as "auf" from matching an unrelated sentence.
 */
export function buildMatchPatterns(entry) {
  const expectedPos = expectedDictionaryPos(entry);
  const patterns = [];
  const casePolicy = ["noun", "proper"].includes(expectedPos)
    ? "upper"
    : ["verb", "adjective", "adverb", "preposition", "conjunction"].includes(expectedPos)
      ? "lower_unless_sentence_initial"
      : "none";
  let headTokens = expectedPos === "noun"
    ? stripNounArticle(entry.term)
    : tokenizeGerman(entry.term);
  headTokens = headTokens.filter((token) => !TERM_FILLERS.has(token));

  if (headTokens.length === 1) {
    patterns.push({
      mode: "headword_exact",
      tokens: headTokens,
      maxGap: 0,
      casePolicy,
      caseTokenIndex: expectedPos === "noun" ? headTokens.length - 1 : 0,
    });
  } else if (headTokens.length > 1) {
    patterns.push({
      mode: "headword_phrase",
      tokens: headTokens,
      maxGap: 8,
      casePolicy,
      caseTokenIndex: expectedPos === "noun" ? headTokens.length - 1 : 0,
    });
  }

  for (const rawFragment of cleanSpace(entry.forms).split(/\s*·\s*/u)) {
    let tokens = tokenizeGerman(rawFragment);
    if (!tokens.length || tokens.every((token) => FORM_META_WORDS.has(token))) continue;
    if (expectedPos === "noun" && tokens.length > 1 && ARTICLES.has(tokens[0])) {
      tokens = tokens.slice(1);
    }
    if (expectedPos === "verb" || expectedPos === "phrase") {
      tokens = tokens.filter((token) => !VERB_HELPERS.has(token) && !TERM_FILLERS.has(token));
    }
    tokens = tokens.filter((token) => !FORM_META_WORDS.has(token));
    if (
      tokens.length === 1
      && (tokens[0].length >= 4 || headTokens.includes(tokens[0]))
    ) {
      patterns.push({
        mode: "declared_form",
        tokens,
        maxGap: 0,
        casePolicy,
        caseTokenIndex: 0,
      });
    } else if (tokens.length > 1) {
      patterns.push({
        mode: "declared_phrase",
        tokens,
        maxGap: 8,
        casePolicy,
        caseTokenIndex: expectedPos === "noun" ? tokens.length - 1 : 0,
        particleFinal: (
          expectedPos === "verb"
          && tokens.length === 2
          && SEPARABLE_PARTICLES.has(tokens.at(-1))
        ),
      });
    }
  }

  if (expectedPos === "adjective" && headTokens.length === 1) {
    for (const token of adjectiveVariants(headTokens[0])) {
      patterns.push({
        mode: "adjective_inflection",
        tokens: [token],
        maxGap: 0,
        casePolicy,
        caseTokenIndex: 0,
      });
    }
  }

  return uniquePatterns(patterns).sort((left, right) => (
    MODE_SCORE[right.mode] - MODE_SCORE[left.mode]
    || right.tokens.length - left.tokens.length
    || left.tokens.join(" ").localeCompare(right.tokens.join(" "), "de")
  ));
}

function casingMatches(pattern, positions, surfaceTokens) {
  if (!surfaceTokens || pattern.casePolicy === "none") {
    return { matches: true, sentenceInitialAmbiguous: false };
  }
  const patternIndex = Math.min(pattern.caseTokenIndex ?? 0, positions.length - 1);
  const sentenceIndex = positions[patternIndex];
  const surface = surfaceTokens[sentenceIndex] ?? "";
  if (pattern.casePolicy === "upper") {
    return {
      matches: /^\p{Lu}/u.test(surface),
      sentenceInitialAmbiguous: sentenceIndex === 0,
    };
  }
  if (pattern.casePolicy === "lower_unless_sentence_initial") {
    return {
      matches: sentenceIndex === 0 || /^\p{Ll}/u.test(surface),
      sentenceInitialAmbiguous: sentenceIndex === 0 && /^\p{Lu}/u.test(surface),
    };
  }
  return { matches: true, sentenceInitialAmbiguous: false };
}

function orderedTokensMatch(sentenceTokens, pattern, surfaceTokens) {
  const { tokens: patternTokens, maxGap, particleFinal } = pattern;
  if (patternTokens.length === 1) {
    for (let index = 0; index < sentenceTokens.length; index += 1) {
      if (sentenceTokens[index] !== patternTokens[0]) continue;
      const casing = casingMatches(pattern, [index], surfaceTokens);
      if (casing.matches) return { positions: [index], ...casing };
    }
    return null;
  }
  for (let start = 0; start < sentenceTokens.length; start += 1) {
    if (sentenceTokens[start] !== patternTokens[0]) continue;
    let sentenceIndex = start + 1;
    let previous = start;
    let matched = 1;
    const positions = [start];
    while (sentenceIndex < sentenceTokens.length && matched < patternTokens.length) {
      if (sentenceIndex - previous - 1 > maxGap) break;
      if (sentenceTokens[sentenceIndex] === patternTokens[matched]) {
        previous = sentenceIndex;
        positions.push(sentenceIndex);
        matched += 1;
      }
      sentenceIndex += 1;
    }
    if (matched === patternTokens.length) {
      if (
        particleFinal
        && sentenceTokens[previous + 1]
        && !CLAUSE_BOUNDARY_WORDS.has(sentenceTokens[previous + 1])
      ) {
        continue;
      }
      const casing = casingMatches(pattern, positions, surfaceTokens);
      if (casing.matches) return { positions, ...casing };
    }
  }
  return null;
}

export function matchSentence(patterns, sentenceTokens, surfaceTokens = null) {
  for (const pattern of patterns) {
    const match = orderedTokensMatch(sentenceTokens, pattern, surfaceTokens);
    if (match) return { ...pattern, ...match };
  }
  return null;
}

function validPair(german, chinese) {
  const germanTokens = tokenizeGerman(german);
  const chineseCharacters = chinese.match(/[\p{Script=Han}]/gu) ?? [];
  return (
    german.length >= 4
    && german.length <= 180
    && germanTokens.length >= 2
    && germanTokens.length <= 26
    && chinese.length >= 1
    && chinese.length <= 160
    && chineseCharacters.length >= 1
    && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(`${german}${chinese}`)
    && !/(?:https?:\/\/|www\.)/iu.test(`${german}${chinese}`)
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readZipMember(zipPath, member) {
  const { stdout } = await execFileAsync("unzip", ["-p", zipPath, member], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (!stdout) throw new Error(`${zipPath} does not contain readable member ${member}.`);
  return stdout;
}

async function readSourceMember(sourcePath, member) {
  const sourceStat = await stat(sourcePath);
  if (sourceStat.isDirectory()) return readFile(path.join(sourcePath, member), "utf8");
  if (sourceStat.isFile() && sourcePath.toLocaleLowerCase().endsWith(".zip")) {
    return readZipMember(sourcePath, member);
  }
  throw new Error("--source must be an extracted OPUS directory or its .zip archive.");
}

/**
 * Read line-aligned Moses files without sorting or otherwise breaking their
 * one-to-one relation.  sourceLine is one-based and points to both files.
 */
export async function loadParallelCorpus(sourcePath) {
  const [germanRaw, chineseRaw] = await Promise.all([
    readSourceMember(sourcePath, SOURCE_FILES.german),
    readSourceMember(sourcePath, SOURCE_FILES.chinese),
  ]);
  const germanLines = germanRaw.replace(/\r\n?/gu, "\n").split("\n");
  const chineseLines = chineseRaw.replace(/\r\n?/gu, "\n").split("\n");
  if (germanLines.at(-1) === "") germanLines.pop();
  if (chineseLines.at(-1) === "") chineseLines.pop();
  if (germanLines.length !== chineseLines.length) {
    throw new Error(
      `Parallel files are misaligned: ${germanLines.length} German lines vs `
      + `${chineseLines.length} Chinese lines.`,
    );
  }

  const pairs = [];
  const seenPairs = new Map();
  let rejected = 0;
  for (let index = 0; index < germanLines.length; index += 1) {
    const german = cleanSpace(germanLines[index]);
    const chinese = cleanSpace(chineseLines[index]);
    if (!validPair(german, chinese)) {
      rejected += 1;
      continue;
    }
    const pairId = sha256(`${german}\0${chinese}`).slice(0, 20);
    const existing = seenPairs.get(pairId);
    if (existing && existing.german === german && existing.chinese === chinese) {
      existing.duplicateLines.push(index + 1);
      continue;
    }
    const pair = {
      pairId,
      sourceLine: index + 1,
      duplicateLines: [],
      german,
      chinese,
      tokens: tokenizeGerman(german),
      surfaceTokens: tokenizeGermanSurface(german),
    };
    seenPairs.set(pairId, pair);
    pairs.push(pair);
  }
  return {
    sourceLineCount: germanLines.length,
    rejected,
    duplicatePairs: [...seenPairs.values()].reduce(
      (total, pair) => total + pair.duplicateLines.length,
      0,
    ),
    pairs,
    sourceDigests: {
      germanSha256: sha256(germanRaw),
      chineseSha256: sha256(chineseRaw),
    },
  };
}

function candidateScore(pair, pattern) {
  const tokenCount = pair.tokens.length;
  const sentenceLengthScore = Math.max(0, 20 - Math.abs(9 - tokenCount) * 2);
  const translationLengthScore = Math.max(0, 8 - Math.floor(Math.abs(18 - pair.chinese.length) / 6));
  const phraseBonus = Math.min(12, (pattern.tokens.length - 1) * 6);
  return MODE_SCORE[pattern.mode] + sentenceLengthScore + translationLengthScore + phraseBonus;
}

function buildTokenIndex(pairs) {
  const index = new Map();
  for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
    for (const token of new Set(pairs[pairIndex].tokens)) {
      if (!index.has(token)) index.set(token, []);
      index.get(token).push(pairIndex);
    }
  }
  return index;
}

function candidatePairIndexes(patterns, tokenIndex) {
  const indexes = new Set();
  for (const pattern of patterns) {
    let shortestPosting = null;
    for (const token of pattern.tokens) {
      const posting = tokenIndex.get(token) ?? [];
      if (!shortestPosting || posting.length < shortestPosting.length) shortestPosting = posting;
    }
    for (const pairIndex of shortestPosting ?? []) indexes.add(pairIndex);
  }
  return indexes;
}

function headwordKey(entry) {
  const lemmas = normalizeLookupLemmas(entry.term, entry.typeCode || entry.localType);
  return caseFold(lemmas[0] || entry.term);
}

function candidateRecord(pair, pattern, score) {
  return {
    pairId: pair.pairId,
    sourceLine: pair.sourceLine,
    german: pair.german,
    chinese: pair.chinese,
    match: {
      mode: pattern.mode,
      forms: pattern.tokens,
      targetVerified: true,
      tokenPositions: pattern.positions,
      sentenceInitialCapitalizationAmbiguous: pattern.sentenceInitialAmbiguous,
    },
    score,
  };
}

/**
 * Allocate at most one selected word to each German sentence.  Scarce words
 * choose first; ties are stable by corpus ID.  Alternative candidates remain
 * visible as evidence but are never presented as the unique recommendation.
 */
export function selectUniqueCandidates(entryCandidates) {
  const usedGerman = new Set();
  const selections = new Map();
  const ordered = [...entryCandidates].sort((left, right) => (
    left.candidates.length - right.candidates.length
    || left.entry.id.localeCompare(right.entry.id, "en")
  ));
  for (const item of ordered) {
    const selected = item.candidates.find((candidate) => !usedGerman.has(candidate.german));
    if (!selected) continue;
    usedGerman.add(selected.german);
    selections.set(item.entry.id, selected);
  }
  return selections;
}

function increment(target, key, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

function summarizeEntries(entries, sourceKinds) {
  const summary = {
    corpusEntries: entries.length,
    matchedEntries: 0,
    selectedUniqueEntries: 0,
    lowRiskSurfaceMatches: 0,
    requiresFormReview: 0,
    requiresSenseReview: 0,
    unmatchedEntries: 0,
    selectedGermanSentenceReuse: 0,
    byLevel: {},
    byPartOfSpeech: {},
    selectedMatchModes: {},
    sourceKinds,
  };
  const selectedGerman = new Map();
  for (const entry of entries) {
    const level = summary.byLevel[entry.level] ??= {
      total: 0,
      matched: 0,
      selectedUnique: 0,
      lowRiskSurfaceMatches: 0,
    };
    level.total += 1;
    const pos = summary.byPartOfSpeech[entry.partOfSpeech] ??= {
      total: 0,
      matched: 0,
      selectedUnique: 0,
    };
    pos.total += 1;
    if (entry.candidateCount) {
      summary.matchedEntries += 1;
      level.matched += 1;
      pos.matched += 1;
    } else {
      summary.unmatchedEntries += 1;
    }
    if (entry.selected) {
      summary.selectedUniqueEntries += 1;
      level.selectedUnique += 1;
      pos.selectedUnique += 1;
      increment(summary.selectedMatchModes, entry.selected.match.mode);
      selectedGerman.set(
        entry.selected.german,
        (selectedGerman.get(entry.selected.german) ?? 0) + 1,
      );
    }
    if (entry.lowRiskSurfaceMatch) {
      summary.lowRiskSurfaceMatches += 1;
      level.lowRiskSurfaceMatches += 1;
    }
    if (entry.requiresFormReview) summary.requiresFormReview += 1;
    if (entry.requiresSenseReview) summary.requiresSenseReview += 1;
  }
  summary.selectedGermanSentenceReuse = [...selectedGerman.values()]
    .filter((count) => count > 1)
    .reduce((total, count) => total + count - 1, 0);
  return summary;
}

function makeReport(cache) {
  const { summary, source, policy } = cache;
  const percent = (count) => `${((count / summary.corpusEntries) * 100).toFixed(1)}%`;
  const levelRows = Object.entries(summary.byLevel)
    .map(([level, values]) => (
      `| ${level} | ${values.total} | ${values.matched} | ${values.selectedUnique} `
      + `| ${values.lowRiskSurfaceMatches} |`
    ))
    .join("\n");
  const modeRows = Object.entries(summary.selectedMatchModes)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([mode, count]) => `| ${mode} | ${count} |`)
    .join("\n");
  return `# Tatoeba 中德人工例句覆盖报告

## 结果

- Worttag 词条总数：${summary.corpusEntries}
- 能找到目标词头或已声明词形的词条：${summary.matchedEntries}（${percent(summary.matchedEntries)}）
- 在“同一德语句子只分配一次”的约束下选中的词条：${summary.selectedUniqueEntries}（${percent(summary.selectedUniqueEntries)}）
- 低风险表面匹配：${summary.lowRiskSurfaceMatches}（${percent(summary.lowRiskSurfaceMatches)}）
- 因大小写、词形或词性歧义而需要额外形式核对：${summary.requiresFormReview}
- 必须核对具体义项的已选词条：${summary.requiresSenseReview}
- 未覆盖词条：${summary.unmatchedEntries}
- 已选德语句重复分配次数：${summary.selectedGermanSentenceReuse}

“命中”只证明句中含有词头或本地词形，不证明该句对应词条的具体义项。因此所有
已选句都标记为 \`requiresSenseReview\`；修复脚本必须再把句义与该词条的中文义项
进行核对。短词、同形异义词、派生形容词和单个变位形式还会额外标记为
\`requiresFormReview\`。

## 各等级覆盖

| 等级 | 总数 | 有候选 | 唯一选中 | 低风险表面匹配 |
| --- | ---: | ---: | ---: | ---: |
${levelRows}

## 已选匹配方式

| 匹配方式 | 数量 |
| --- | ---: |
${modeRows}

## 对齐与选择规则

1. 德语文件和中文文件必须行数完全相同；\`sourceLine\` 同时指向两边的同一行。
2. 只接受包含汉字的中文句，并过滤网址、控制字符和过长句。
3. 动词匹配会排除 \`haben\`、\`sein\` 等助动词，避免把助动词误当目标词。
4. 可分动词和多词搭配要求其多个词形按顺序、在有限间隔内共同出现。
5. 全局按“候选越少越先选”分配；一个德语句子最多成为一个词条的 \`selected\`。
6. 德语名词必须命中首字母大写的表面形式；其他主要词类若仅在句首因首字母大写
   而命中，会标记为形式歧义。
7. \`lowRiskSurfaceMatch\` 只表示表面词形可靠，绝不表示义项已经核对完成。

本次候选上限为每词 ${policy.maxCandidates} 条；缓存保留原始中文，不做机器翻译或繁简转换。

## 交给词库修复流程

1. 用词条 \`id\` 读取缓存中的同名记录；没有 \`selected\` 就保持原例句并进入其他来源流程。
2. 先排除 \`requiresFormReview: true\` 的记录；这些只能交给人工或额外词性分析。
3. 即使 \`lowRiskSurfaceMatch: true\`，仍须把 \`selected.chinese\` 所表达的义项与词条释义核对，
   因为表面词形命中不能消除一词多义。
4. 义项吻合后，使用 \`selected.german\` 和 \`selected.chinese\` 成对替换，绝不能分别从不同
   候选取句；\`selected.sourceLine\` 是两种语言共同的原始行号。
5. 若产品要求简体中文，应在保留原文证据后另做可复现的繁简转换，并记录转换工具和版本。
6. 发布包含这些句子的词库时，保留下面的 Tatoeba、OPUS 与 CC BY 2.0 FR 归属信息。

## 来源与许可

- 语料：${source.corpus}，${source.release}，${source.languagePair}
- 分发：${source.distributor}（${source.format}）
- 许可：[${source.license}](${source.licenseUrl})
- [OPUS 版本页](${source.corpusUrl})
- [Tatoeba](${source.tatoebaUrl})
- 建议引用：${source.citation}

缓存中的德语和中文句子继续受 CC BY 2.0 FR 约束；应用代码的 MIT 许可不替代该语料许可。
`;
}

async function writeAtomic(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, filePath);
}

export async function buildTatoebaExampleCache({
  root = process.cwd(),
  sourcePath,
  maxCandidates = DEFAULT_MAX_CANDIDATES,
} = {}) {
  if (!sourcePath) throw new Error("sourcePath is required.");
  const [packed, curated, parallel] = await Promise.all([
    loadPackedEntries(root),
    loadCuratedEntries(root),
    loadParallelCorpus(sourcePath),
  ]);
  const corpusEntries = [...packed, ...curated];
  if (corpusEntries.length !== 6000) {
    throw new Error(`Expected 6000 Worttag entries, found ${corpusEntries.length}.`);
  }

  const tokenIndex = buildTokenIndex(parallel.pairs);
  const headwordCounts = new Map();
  for (const entry of corpusEntries) {
    const key = headwordKey(entry);
    headwordCounts.set(key, (headwordCounts.get(key) ?? 0) + 1);
  }

  const raw = corpusEntries.map((entry) => {
    const patterns = buildMatchPatterns(entry);
    const candidates = [];
    for (const pairIndex of candidatePairIndexes(patterns, tokenIndex)) {
      const pair = parallel.pairs[pairIndex];
      const matchedPattern = matchSentence(patterns, pair.tokens, pair.surfaceTokens);
      if (!matchedPattern) continue;
      candidates.push(candidateRecord(
        pair,
        matchedPattern,
        candidateScore(pair, matchedPattern),
      ));
    }
    candidates.sort((left, right) => (
      right.score - left.score
      || left.sourceLine - right.sourceLine
      || left.pairId.localeCompare(right.pairId, "en")
    ));
    return {
      entry,
      headword: headwordKey(entry),
      patterns,
      candidates,
    };
  });

  const selections = selectUniqueCandidates(raw);
  const entries = raw.map((item) => {
    const selected = selections.get(item.entry.id) ?? null;
    const homographCount = headwordCounts.get(item.headword) ?? 1;
    const partOfSpeech = expectedDictionaryPos(item.entry);
    const primaryTokens = tokenizeGerman(item.headword);
    const ambiguousShortHeadword = (
      primaryTokens.length === 1
      && (primaryTokens[0].length <= 2 || SHORT_AMBIGUOUS.has(primaryTokens[0]))
    );
    const reviewReasons = [
      ...(homographCount > 1 ? [`headword_shared_by_${homographCount}_entries`] : []),
      ...(ambiguousShortHeadword ? ["short_or_high_frequency_headword"] : []),
      ...(
        selected?.match.sentenceInitialCapitalizationAmbiguous
          ? ["sentence_initial_capitalization_is_pos_ambiguous"]
          : []
      ),
      ...(
        ["adjective", "adverb", "unknown"].includes(partOfSpeech)
          ? [`${partOfSpeech}_requires_contextual_pos_review`]
          : []
      ),
      ...(
        selected?.match.mode === "adjective_inflection"
          ? ["derived_adjective_form_can_be_homographic"]
          : []
      ),
      ...(
        selected?.match.mode === "declared_form"
          ? ["single_declared_form_can_be_homographic"]
          : []
      ),
    ];
    const requiresFormReview = Boolean(selected && reviewReasons.length);
    return {
      id: item.entry.id,
      level: item.entry.level,
      sourceKind: item.entry.sourceKind,
      term: item.entry.term,
      forms: item.entry.forms,
      partOfSpeech,
      normalizedHeadword: item.headword,
      targetPatterns: item.patterns,
      candidateCount: item.candidates.length,
      selected,
      lowRiskSurfaceMatch: Boolean(selected && !requiresFormReview),
      requiresFormReview,
      requiresSenseReview: Boolean(selected),
      reviewReasons,
      candidates: item.candidates.slice(0, maxCandidates),
    };
  });

  const sourceStat = await stat(sourcePath);
  const sourceDigest = sourceStat.isFile()
    ? { archiveSha256: sha256(await readFile(sourcePath)) }
    : parallel.sourceDigests;
  const inputCorpusDigest = sha256(
    corpusEntries
      .map((entry) => [entry.id, entry.level, entry.term, entry.forms].join("\0"))
      .join("\n"),
  );
  const sourceKinds = Object.fromEntries(
    ["packed", "curated"].map((kind) => [
      kind,
      corpusEntries.filter((entry) => entry.sourceKind === kind).length,
    ]),
  );

  const cache = {
    schemaVersion: TATOEBA_EXAMPLE_SCHEMA_VERSION,
    source: {
      ...SOURCE_METADATA,
      sourceLineCount: parallel.sourceLineCount,
      acceptedUniquePairs: parallel.pairs.length,
      rejectedPairs: parallel.rejected,
      duplicatePairs: parallel.duplicatePairs,
      digests: sourceDigest,
    },
    worttagCorpus: {
      entryCount: corpusEntries.length,
      digestAlgorithm: "sha256(ids, levels, terms, forms)",
      digest: inputCorpusDigest,
    },
    policy: {
      maxCandidates,
      selectedGermanSentenceMaximumUses: 1,
      parallelAlignment: "same one-based line in both Moses files",
      chineseNormalization: "none; original cmn line retained",
      automaticUseRequires: [
        "No selected sentence is safe for direct replacement without sense alignment.",
        "lowRiskSurfaceMatch only certifies a conservative surface-form match.",
        "requiresSenseReview is true for every selected sentence.",
      ],
      capitalization:
        "German nouns/proper names require uppercase target forms; major non-noun classes "
        + "require lowercase forms except at sentence start, which is flagged.",
    },
    summary: null,
    entries,
  };
  cache.summary = summarizeEntries(entries, sourceKinds);
  return cache;
}

function parseArguments(argv) {
  const options = {
    root: process.cwd(),
    sourcePath: null,
    output: null,
    report: null,
    maxCandidates: DEFAULT_MAX_CANDIDATES,
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
    else if (value === "--output") options.output = path.resolve(next());
    else if (value === "--report") options.report = path.resolve(next());
    else if (value === "--max-candidates") options.maxCandidates = Number(next());
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!Number.isInteger(options.maxCandidates) || options.maxCandidates < 1 || options.maxCandidates > 10) {
    throw new Error("--max-candidates must be an integer between 1 and 10.");
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/build_tatoeba_examples.mjs --source <zip-or-directory> [options]

Required:
  --source <path>          OPUS cmn-de .zip or extracted directory.

Options:
  --output <file>          Write the machine-readable candidate cache.
  --report <file>          Write a Markdown coverage report.
  --max-candidates <n>     Retain 1-10 candidates per word (default: 3).
  --root <directory>       Worttag repository root (default: current directory).

Example:
  node scripts/build_tatoeba_examples.mjs \\
    --source /tmp/tatoeba-cmn-de.zip \\
    --output work/tatoeba-cmn-de-v2026-07-08.examples.json \\
    --report reports/tatoeba-cmn-de-v2026-07-08-coverage.md
`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (!options.sourcePath) throw new Error("--source is required.");
  if (!options.output && !options.report) {
    throw new Error("At least one of --output or --report is required.");
  }
  const cache = await buildTatoebaExampleCache(options);
  if (options.output) await writeAtomic(options.output, `${JSON.stringify(cache, null, 2)}\n`);
  if (options.report) await writeAtomic(options.report, makeReport(cache));
  process.stderr.write(`${JSON.stringify({ tatoebaExamples: cache.summary })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
