import { getChatGPTUser } from "../../chatgpt-auth";
import {
  ownerKeyForEmail,
  readSnapshot,
  writeSnapshot,
} from "../../../db/cloud-progress";

export const dynamic = "force-dynamic";

const MAX_SNAPSHOT_BYTES = 500_000;
const MAX_FUTURE_CLOCK_SKEW = 86_400_000;

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return Response.json(body, { ...init, headers });
}

function publicSnapshot(snapshot: Awaited<ReturnType<typeof readSnapshot>>) {
  if (!snapshot) return null;
  return {
    payload: snapshot.payload,
    revision: snapshot.revision,
    resetAt: snapshot.resetAt,
    clientUpdatedAt: snapshot.clientUpdatedAt,
    serverUpdatedAt: snapshot.serverUpdatedAt,
  };
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return noStoreJson(
      { authenticated: false, signInPath: "/signin-with-chatgpt?return_to=%2F" },
      { status: 401 },
    );
  }

  try {
    const ownerKey = await ownerKeyForEmail(user.email);
    const snapshot = await readSnapshot(ownerKey);
    return noStoreJson({
      authenticated: true,
      ownerId: ownerKey,
      displayName: user.displayName,
      snapshot: publicSnapshot(snapshot),
    });
  } catch (error) {
    console.error("Unable to read Worttag cloud progress", error);
    return noStoreJson({ error: "Unable to read cloud progress." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return noStoreJson(
      { authenticated: false, signInPath: "/signin-with-chatgpt?return_to=%2F" },
      { status: 401 },
    );
  }

  let body: {
    payload?: unknown;
    expectedRevision?: unknown;
    expectedOwnerId?: unknown;
    resetAt?: unknown;
    clientUpdatedAt?: unknown;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return noStoreJson({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const expectedRevision = Number(body.expectedRevision);
    const resetAt = Number(body.resetAt);
    const clientUpdatedAt = Number(body.clientUpdatedAt);
    const serialized = body.payload && typeof body.payload === "object"
      ? JSON.stringify(body.payload)
      : "";
    const payload = body.payload as {
      schemaVersion?: unknown;
      learning?: {
        resetAt?: unknown;
        updatedAt?: unknown;
        records?: unknown;
        todayWordIds?: unknown;
        todayReviewEventIds?: unknown;
        todayQueueCompletionIds?: unknown;
      };
      settings?: {
        wordsPerQueue?: unknown;
        queuesPerDay?: unknown;
        level?: unknown;
        order?: unknown;
        dueFirst?: unknown;
      };
      settingsUpdatedAt?: unknown;
    } | undefined;
    const payloadLearningUpdatedAt = Number(payload?.learning?.updatedAt);
    const payloadSettingsUpdatedAt = Number(payload?.settingsUpdatedAt);
    const maxAcceptedTimestamp = Date.now() + MAX_FUTURE_CLOCK_SKEW;
    const snapshotBytes = new TextEncoder().encode(serialized).byteLength;

    if (
      !payload ||
      payload.schemaVersion !== 1 ||
      !payload.learning ||
      !payload.settings ||
      !payload.learning.records ||
      typeof payload.learning.records !== "object" ||
      Array.isArray(payload.learning.records) ||
      !Array.isArray(payload.learning.todayWordIds) ||
      !Array.isArray(payload.learning.todayReviewEventIds) ||
      !Array.isArray(payload.learning.todayQueueCompletionIds) ||
      ![5, 10, 15, 20].includes(Number(payload.settings.wordsPerQueue)) ||
      ![1, 2, 3, 4, 5].includes(Number(payload.settings.queuesPerDay)) ||
      !["A1", "A2", "B1", "B2", "C1"].includes(String(payload.settings.level)) ||
      !["sequential", "random"].includes(String(payload.settings.order)) ||
      typeof payload.settings.dueFirst !== "boolean" ||
      typeof body.expectedOwnerId !== "string" ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0 ||
      !Number.isSafeInteger(resetAt) ||
      resetAt < 0 ||
      resetAt > maxAcceptedTimestamp ||
      Number(payload.learning.resetAt) !== resetAt ||
      !Number.isSafeInteger(clientUpdatedAt) ||
      clientUpdatedAt < 0 ||
      clientUpdatedAt > maxAcceptedTimestamp ||
      !Number.isSafeInteger(payloadLearningUpdatedAt) ||
      !Number.isSafeInteger(payloadSettingsUpdatedAt) ||
      clientUpdatedAt !== Math.max(payloadLearningUpdatedAt, payloadSettingsUpdatedAt) ||
      snapshotBytes > MAX_SNAPSHOT_BYTES
    ) {
      return noStoreJson({ error: "Invalid cloud progress payload." }, { status: 400 });
    }

    const ownerKey = await ownerKeyForEmail(user.email);
    if (body.expectedOwnerId !== ownerKey) {
      return noStoreJson(
        { error: "Authenticated account changed.", ownerChanged: true, ownerId: ownerKey },
        { status: 409 },
      );
    }
    const result = await writeSnapshot({
      ownerKey,
      payload: body.payload,
      expectedRevision,
      resetAt,
      clientUpdatedAt,
    });

    if (!result.saved) {
      return noStoreJson(
        { error: "Cloud progress changed on another device.", snapshot: publicSnapshot(result.snapshot) },
        { status: 409 },
      );
    }

    return noStoreJson({
      authenticated: true,
      ownerId: ownerKey,
      displayName: user.displayName,
      snapshot: publicSnapshot(result.snapshot),
    });
  } catch (error) {
    console.error("Unable to save Worttag cloud progress", error);
    return noStoreJson({ error: "Unable to save cloud progress." }, { status: 500 });
  }
}
