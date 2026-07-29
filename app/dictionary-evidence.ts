export type OpenDictionarySense = {
  gloss: string;
  example: string | null;
};

export type DictionaryEvidence = {
  headword: string;
  reviewedAt: string;
  openDictionary: {
    found: boolean;
    partsOfSpeech: string[];
    senses: OpenDictionarySense[];
    sourceUrl: string;
  };
  dwds: {
    found: boolean;
    lemma: string | null;
    wordClass: string | null;
    sourceUrl: string;
  };
};

type WiktApiDefinitions = {
  definitions?: unknown;
};

type DwdsSnippet = {
  lemma?: unknown;
  wortart?: unknown;
  url?: unknown;
};

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function cleanSourceUrl(
  value: unknown,
  allowedHosts: string[],
  baseUrl?: string,
) {
  const cleaned = cleanText(value, 500);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned, baseUrl);
    if (
      url.protocol !== "https:" ||
      !allowedHosts.includes(url.hostname.toLowerCase())
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function parseWiktApiDefinitions(
  payload: WiktApiDefinitions,
  maxSenses = 6,
) {
  const definitions = Array.isArray(payload.definitions) ? payload.definitions : [];
  const partsOfSpeech: string[] = [];
  const senses: OpenDictionarySense[] = [];

  for (const definition of definitions) {
    if (!definition || typeof definition !== "object") continue;
    const record = definition as { pos?: unknown; senses?: unknown };
    const partOfSpeech = cleanText(record.pos, 32);
    if (partOfSpeech && !partsOfSpeech.includes(partOfSpeech)) {
      partsOfSpeech.push(partOfSpeech);
    }
    if (!Array.isArray(record.senses)) continue;

    for (const sense of record.senses) {
      if (!sense || typeof sense !== "object") continue;
      const senseRecord = sense as { glosses?: unknown; examples?: unknown };
      const glosses = Array.isArray(senseRecord.glosses) ? senseRecord.glosses : [];
      const gloss = glosses
        .map((value) => cleanText(value, 360))
        .filter((value): value is string => Boolean(value))
        .at(-1);
      if (!gloss || senses.some((item) => item.gloss === gloss)) continue;

      const examples = Array.isArray(senseRecord.examples) ? senseRecord.examples : [];
      let example: string | null = null;
      for (const candidate of examples) {
        if (!candidate || typeof candidate !== "object") continue;
        example = cleanText((candidate as { text?: unknown }).text, 320);
        if (example) break;
      }
      senses.push({ gloss, example });
      if (senses.length >= maxSenses) break;
    }
    if (senses.length >= maxSenses) break;
  }

  return {
    found: senses.length > 0,
    partsOfSpeech,
    senses,
  };
}

export function parseDwdsSnippet(payload: unknown) {
  const rows = Array.isArray(payload) ? payload : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as DwdsSnippet;
    const lemma = cleanText(record.lemma, 100);
    const wordClass = cleanText(record.wortart, 100);
    const sourceUrl = cleanSourceUrl(
      record.url,
      ["dwds.de", "www.dwds.de"],
      "https://www.dwds.de",
    );
    if (lemma || wordClass || sourceUrl) {
      return { found: true, lemma, wordClass, sourceUrl };
    }
  }
  return {
    found: false,
    lemma: null,
    wordClass: null,
    sourceUrl: null,
  };
}

export function parseDictionaryEvidencePayload(
  payload: unknown,
): DictionaryEvidence | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as {
    headword?: unknown;
    reviewedAt?: unknown;
    openDictionary?: unknown;
    dwds?: unknown;
  };
  const headword = cleanText(record.headword, 100);
  const reviewedAt = cleanText(record.reviewedAt, 60);
  if (
    !headword ||
    !reviewedAt ||
    Number.isNaN(Date.parse(reviewedAt)) ||
    !record.openDictionary ||
    typeof record.openDictionary !== "object" ||
    !record.dwds ||
    typeof record.dwds !== "object"
  ) {
    return null;
  }

  const openRecord = record.openDictionary as {
    found?: unknown;
    partsOfSpeech?: unknown;
    senses?: unknown;
    sourceUrl?: unknown;
  };
  const dwdsRecord = record.dwds as {
    found?: unknown;
    lemma?: unknown;
    wordClass?: unknown;
    sourceUrl?: unknown;
  };
  const openSourceUrl = cleanSourceUrl(
    openRecord.sourceUrl,
    ["de.wiktionary.org"],
  );
  const dwdsSourceUrl = cleanSourceUrl(
    dwdsRecord.sourceUrl,
    ["dwds.de", "www.dwds.de"],
    "https://www.dwds.de",
  );
  if (!openSourceUrl || !dwdsSourceUrl) return null;

  const partsOfSpeech = Array.isArray(openRecord.partsOfSpeech)
    ? openRecord.partsOfSpeech
      .map((value) => cleanText(value, 32))
      .filter((value): value is string => Boolean(value))
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 12)
    : [];
  const senses: OpenDictionarySense[] = [];
  if (Array.isArray(openRecord.senses)) {
    for (const sense of openRecord.senses.slice(0, 6)) {
      if (!sense || typeof sense !== "object") continue;
      const gloss = cleanText((sense as { gloss?: unknown }).gloss, 360);
      if (!gloss || senses.some((item) => item.gloss === gloss)) continue;
      senses.push({
        gloss,
        example: cleanText((sense as { example?: unknown }).example, 320),
      });
    }
  }

  return {
    headword,
    reviewedAt: new Date(reviewedAt).toISOString(),
    openDictionary: {
      found: openRecord.found === true && senses.length > 0,
      partsOfSpeech,
      senses,
      sourceUrl: openSourceUrl,
    },
    dwds: {
      found: dwdsRecord.found === true,
      lemma: cleanText(dwdsRecord.lemma, 100),
      wordClass: cleanText(dwdsRecord.wordClass, 100),
      sourceUrl: dwdsSourceUrl,
    },
  };
}
