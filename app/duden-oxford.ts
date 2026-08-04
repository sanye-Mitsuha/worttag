import dictionaryIndex from "./duden-oxford-reverse-index.json" with { type: "json" };
import { dictionaryHeadword } from "./dictionary-links.ts";

export type DudenOxfordMatch = {
  english: string;
  german: string;
  match: "exact" | "compound";
};

export type DudenOxfordEvidence = {
  headword: string;
  found: boolean;
  matches: DudenOxfordMatch[];
  source: string;
  direction: string;
};

type DudenOxfordIndex = {
  records: Record<string, {
    headword: string;
    matches: DudenOxfordMatch[];
  }>;
};

const index = dictionaryIndex as DudenOxfordIndex;

export function lookupDudenOxford(term: string): DudenOxfordEvidence {
  const headword = dictionaryHeadword(term);
  const record = index.records[headword.normalize("NFC").toLowerCase()];

  return {
    headword,
    found: Boolean(record?.matches.length),
    matches: record?.matches ?? [],
    source: "杜登—牛津英德大词典（用户提供文件）",
    direction: "德语查询 → 英文对应",
  };
}
