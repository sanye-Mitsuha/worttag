import type { DudenOxfordEvidence, DudenOxfordMatch } from "./duden-oxford";

export type { DudenOxfordEvidence, DudenOxfordMatch };

export type DictionaryEvidence = {
  headword: string;
  reviewedAt: string;
  dudenOxford: DudenOxfordEvidence;
};

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

export function parseDictionaryEvidencePayload(
  payload: unknown,
): DictionaryEvidence | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as {
    headword?: unknown;
    reviewedAt?: unknown;
    dudenOxford?: unknown;
  };
  const headword = cleanText(record.headword, 100);
  const reviewedAt = cleanText(record.reviewedAt, 60);
  if (
    !headword ||
    !reviewedAt ||
    Number.isNaN(Date.parse(reviewedAt)) ||
    !record.dudenOxford ||
    typeof record.dudenOxford !== "object"
  ) {
    return null;
  }

  const dudenRecord = record.dudenOxford as {
    headword?: unknown;
    found?: unknown;
    matches?: unknown;
    source?: unknown;
    direction?: unknown;
  };
  const matches: DudenOxfordMatch[] = [];
  if (Array.isArray(dudenRecord.matches)) {
    for (const item of dudenRecord.matches.slice(0, 6)) {
      if (!item || typeof item !== "object") continue;
      const english = cleanText((item as { english?: unknown }).english, 120);
      const german = cleanText((item as { german?: unknown }).german, 360);
      const match = (item as { match?: unknown }).match;
      if (!english || !german || (match !== "exact" && match !== "compound")) continue;
      matches.push({ english, german, match });
    }
  }
  const dudenHeadword = cleanText(dudenRecord.headword, 100);
  const source = cleanText(dudenRecord.source, 180);
  const direction = cleanText(dudenRecord.direction, 80);
  if (!dudenHeadword || !source || !direction) return null;

  return {
    headword,
    reviewedAt: new Date(reviewedAt).toISOString(),
    dudenOxford: {
      headword: dudenHeadword,
      found: dudenRecord.found === true && matches.length > 0,
      matches,
      source,
      direction,
    },
  };
}
