#!/usr/bin/env node

/**
 * Copy the complete verb-conjugation profiles from the supplied Worttag HTML
 * source into the packed wordbooks. The source page builds these profiles in
 * its inline script, so this runner evaluates that same source logic without
 * needing a browser DOM and keeps the generated data in the app's schema.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const sourcePath = path.resolve(process.argv[2] ?? "");
if (!sourcePath || sourcePath === root) {
  throw new Error("Usage: node scripts/import_full_conjugations.mjs <germany-words.html>");
}

const LEVELS = ["a1", "a2", "b1", "b2", "c1"];
const COLORS = {
  participle: "#4e8bc4",
  indicative: "#b03f8b",
  subjunctive1: "#dc7a00",
  subjunctive2: "#5b9d1f",
  imperative: "#008ea3",
};

function fakeElement() {
  const base = {
    style: {},
    dataset: {},
    children: [],
    classList: { contains: () => false },
    value: "",
    hidden: false,
  };
  return new Proxy(base, {
    get(target, property) {
      if (property in target) return target[property];
      if ([
        "addEventListener",
        "removeEventListener",
        "setAttribute",
        "replaceChildren",
        "append",
        "appendChild",
        "prepend",
        "insertBefore",
      ].includes(property)) return () => {};
      if (property === "querySelectorAll") return () => [];
      if (property === "querySelector") return () => null;
      if (property === "closest") return () => null;
      return undefined;
    },
  });
}

function buildSourceContext(sourceHtml) {
  const start = sourceHtml.indexOf("<script>");
  const end = sourceHtml.indexOf("</script>", start);
  if (start < 0 || end < 0) throw new Error("The source HTML has no conjugation script.");
  const sourceScript = sourceHtml.slice(start + "<script>".length, end);
  const document = new Proxy({
    querySelectorAll: () => [],
    querySelector: () => fakeElement(),
    createElement: () => fakeElement(),
    createTextNode: () => fakeElement(),
    createRange: () => ({ createContextualFragment: () => fakeElement() }),
    addEventListener: () => {},
  }, {
    get(target, property) {
      return property in target ? target[property] : () => fakeElement();
    },
  });
  const context = {
    document,
    window: {
      localStorage: { getItem: () => null, setItem: () => {} },
      speechSynthesis: { getVoices: () => [], cancel: () => {}, speak: () => {} },
    },
    console,
    Intl,
    SpeechSynthesisUtterance: function SpeechSynthesisUtterance() {},
    setTimeout,
    clearTimeout,
  };
  vm.createContext(context);
  const exportCode = `
    globalThis.__worttagConjugations = {
      a1: (term, pos) => { const profile = a1ConjCreateProfile(term); profile.auxiliary = a1ConjResolveAuxiliary(profile, term, pos); return a1ConjCardsForProfile(profile); },
      a2: (term, pos) => { const profile = a2ConjCreateProfile(term); profile.auxiliary = a2ConjResolveAuxiliary(profile, term, pos); return a1ConjCardsForProfile(profile); },
      b1: (term, pos) => { const profile = b1ConjCreateProfile(term); profile.auxiliary = b1ConjResolveAuxiliary(profile, term, pos); return a1ConjCardsForProfile(profile); },
      b2: (term, pos) => { const profile = b2ConjCreateProfile(term); profile.auxiliary = b2ConjResolveAuxiliary(profile, term, pos); return a1ConjCardsForProfile(profile); },
      c1: (term, pos) => { const profile = c1ConjCreateProfile(term); profile.auxiliary = c1ConjResolveAuxiliary(profile, term, pos); return a1ConjCardsForProfile(profile); },
    };
  `;
  vm.runInContext(`${sourceScript}\n${exportCode}`, context, { timeout: 30_000 });
  return context.__worttagConjugations;
}

function modernTable(term, pos, tabs) {
  const indicative = tabs.find((tab) => tab.key === "indicative");
  const present = indicative?.cards.find((card) => card.subtitle === "Indikativ Präsens");
  const past = indicative?.cards.find((card) => card.subtitle === "Indikativ Präteritum");
  const participle = tabs.find((tab) => tab.key === "participle")?.cards
    .find((card) => card.subtitle === "Partizip Perfekt");
  return {
    pos,
    rows: (present?.forms ?? []).map((form, index) => [
      ["ich", "du", "er/sie/es", "wir", "ihr", "sie/Sie"][index] ?? String(index + 1),
      form,
    ]),
    past: past?.forms?.[0] ?? "",
    participle: participle?.value ?? "",
    infinitive: term,
    lemma: term,
    tabs: tabs.map((tab) => ({
      key: tab.key,
      label: tab.label,
      color: COLORS[tab.key] ?? tab.color,
      cards: tab.cards.map((card) => ({
        title: card.title,
        subtitle: card.subtitle,
        ...(card.value === undefined ? {} : { value: card.value }),
        ...(card.forms === undefined ? {} : { forms: card.forms }),
        ...(card.rows === undefined ? {} : { rows: card.rows }),
        ...(card.note ? { note: card.note } : {}),
        ...(card.speechText ? { speechText: card.speechText } : {}),
      })),
    })),
  };
}

const sourceHtml = await readFile(sourcePath, "utf8");
const generators = buildSourceContext(sourceHtml);
const summary = {};

for (const level of LEVELS) {
  const filePath = path.join(root, "public", "wordbooks", `${level}-v2.json`);
  const book = JSON.parse(await readFile(filePath, "utf8"));
  let converted = 0;
  let fallback = 0;
  for (const row of book.words) {
    if (row[3] !== "v") continue;
    const term = row[1];
    const pos = row[7] || "V.";
    let tabs;
    try {
      tabs = generators[level](term, pos);
    } catch {
      tabs = null;
    }
    if (!Array.isArray(tabs) || tabs.length !== 5) {
      fallback += 1;
      continue;
    }
    row[10] = [modernTable(term, pos, tabs)];
    converted += 1;
  }
  await writeFile(filePath, `${JSON.stringify(book, null, 2)}\n`, "utf8");
  summary[level] = { converted, fallback };
}

console.log(JSON.stringify(summary, null, 2));
