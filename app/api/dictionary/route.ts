import { dictionaryHeadword } from "../../dictionary-links.ts";
import {
  parseDwdsSnippet,
  parseWiktApiDefinitions,
  type DictionaryEvidence,
} from "../../dictionary-evidence.ts";

export const dynamic = "force-dynamic";

const UPSTREAM_TIMEOUT_MS = 7_000;

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawTerm = url.searchParams.get("term")?.normalize("NFC").trim() ?? "";
  if (!rawTerm || rawTerm.length > 100) {
    return Response.json({ error: "Invalid dictionary term." }, { status: 400 });
  }

  const headword = dictionaryHeadword(rawTerm);
  const encoded = encodeURIComponent(headword);
  const openDictionaryUrl =
    `https://api.wiktapi.dev/v1/de/word/${encoded}/definitions?lang=de`;
  const dwdsApiUrl = `https://www.dwds.de/api/wb/snippet/?q=${encoded}`;
  const dwdsFallbackUrl = `https://www.dwds.de/wb/${encoded}`;

  const [wiktapiResult, dwdsResult] = await Promise.allSettled([
    fetchJson(openDictionaryUrl),
    fetchJson(dwdsApiUrl),
  ]);
  const openDictionary = parseWiktApiDefinitions(
    wiktapiResult.status === "fulfilled" && wiktapiResult.value
      ? wiktapiResult.value as { definitions?: unknown }
      : {},
  );
  const dwds = parseDwdsSnippet(
    dwdsResult.status === "fulfilled" ? dwdsResult.value : null,
  );

  const evidence: DictionaryEvidence = {
    headword,
    reviewedAt: new Date().toISOString(),
    openDictionary: {
      ...openDictionary,
      sourceUrl:
        `https://de.wiktionary.org/wiki/${encodeURIComponent(headword)}`,
    },
    dwds: {
      found: dwds.found,
      lemma: dwds.lemma,
      wordClass: dwds.wordClass,
      sourceUrl: dwds.sourceUrl ?? dwdsFallbackUrl,
    },
  };

  return Response.json(evidence, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
