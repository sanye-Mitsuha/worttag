import { dictionaryHeadword } from "../../dictionary-links.ts";
import { lookupDudenOxford } from "../../duden-oxford.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawTerm = url.searchParams.get("term")?.normalize("NFC").trim() ?? "";
  if (!rawTerm || rawTerm.length > 100) {
    return Response.json({ error: "Invalid dictionary term." }, { status: 400 });
  }

  const headword = dictionaryHeadword(rawTerm);
  const evidence = {
    headword,
    reviewedAt: new Date().toISOString(),
    dudenOxford: lookupDudenOxford(headword),
  };

  return Response.json(evidence, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
