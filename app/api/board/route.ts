import { and, count, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../../../db";
import { guestBoardMessages } from "../../../db/schema";
import { moderateBoardMessage } from "../../board-moderation";

export const dynamic = "force-dynamic";

const RATE_WINDOW_MS = 10 * 60_000;
const GLOBAL_RATE_WINDOW_MS = 60_000;
const MAX_PER_CLIENT = 3;
const MAX_GLOBAL_PER_MINUTE = 120;
const MAX_REQUEST_BYTES = 16_000;

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function publicMessage(row: typeof guestBoardMessages.$inferSelect) {
  return {
    id: row.id,
    nickname: row.nickname,
    content: row.content,
    createdAt: row.createdAt,
  };
}

async function clientKeyHash(request: Request) {
  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const input = new TextEncoder().encode(`worttag-board-v1\0${ip}\0${userAgent}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET() {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: guestBoardMessages.id,
        nickname: guestBoardMessages.nickname,
        content: guestBoardMessages.content,
        createdAt: guestBoardMessages.createdAt,
      })
      .from(guestBoardMessages)
      .orderBy(desc(guestBoardMessages.createdAt), desc(guestBoardMessages.id))
      .limit(80);

    return noStoreJson({ messages: rows });
  } catch (error) {
    console.error("Unable to read Worttag public board", error);
    return noStoreJson({ error: "留言板暂时无法连接。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: { content?: unknown; nickname?: unknown };
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return noStoreJson({ error: "留言内容过大。" }, { status: 413 });
    }
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return noStoreJson({ error: "留言格式无效。" }, { status: 400 });
  }

  const moderated = moderateBoardMessage(body.content, body.nickname);
  if (!moderated.ok) {
    return noStoreJson({ error: moderated.message }, { status: 422 });
  }

  try {
    const now = Date.now();
    const keyHash = await clientKeyHash(request);
    const db = getDb();
    const [recentForClient, recentGlobally] = await Promise.all([
      db
        .select({ total: count() })
        .from(guestBoardMessages)
        .where(and(
          eq(guestBoardMessages.clientKeyHash, keyHash),
          gt(guestBoardMessages.createdAt, now - RATE_WINDOW_MS),
        )),
      db
        .select({ total: count() })
        .from(guestBoardMessages)
        .where(gt(guestBoardMessages.createdAt, now - GLOBAL_RATE_WINDOW_MS)),
    ]);

    if (Number(recentForClient[0]?.total ?? 0) >= MAX_PER_CLIENT) {
      return noStoreJson({ error: "留言过于频繁，请稍后再试。" }, { status: 429 });
    }
    if (Number(recentGlobally[0]?.total ?? 0) >= MAX_GLOBAL_PER_MINUTE) {
      return noStoreJson({ error: "留言板目前较繁忙，请稍后再试。" }, { status: 429 });
    }

    const [message] = await db
      .insert(guestBoardMessages)
      .values({
        nickname: moderated.nickname,
        content: moderated.content,
        clientKeyHash: keyHash,
        createdAt: now,
      })
      .returning();

    if (!message) {
      return noStoreJson({ error: "留言暂时未能提交。" }, { status: 503 });
    }

    return noStoreJson({ message: publicMessage(message) }, { status: 201 });
  } catch (error) {
    console.error("Unable to save Worttag public board message", error);
    return noStoreJson({ error: "留言板暂时无法连接。" }, { status: 503 });
  }
}
