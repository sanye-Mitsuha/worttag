import assert from "node:assert/strict";
import test from "node:test";
import {
  cloudPayloadByteLength,
  type CloudMemoryRecord,
  type CloudPayloadV1,
  MAX_CLOUD_SNAPSHOT_BYTES,
  packCloudPayload,
  unpackCloudPayload,
// @ts-expect-error Node's native TypeScript loader requires the explicit extension.
} from "../app/cloud-payload.ts";

function memoryRecord(index: number): CloudMemoryRecord {
  const record: CloudMemoryRecord = {
    status: (["unknown", "fuzzy", "known"] as const)[index % 3],
    stage: index % 9,
    dueAt: 1_760_000_000_000 + index * 60_000,
    intervalDays: index % 181,
    knownStreak: index % 20,
    lapseCount: index % 8,
    lastReviewedAt: index % 7 === 0 ? null : 1_759_000_000_000 + index,
    sameDayLapses: index % 4,
    lapseDayKey: index % 7 === 0 ? null : "2026-07-22",
    updatedAt: 1_760_000_000_000 + index,
    reviewCount: index % 4,
  };
  if (index === 0) {
    record.fsrs = {
      dueAt: 1_760_100_000_000,
      stability: 4.5,
      difficulty: 6.2,
      elapsedDays: 3,
      scheduledDays: 5,
      learningSteps: 0,
      reps: 4,
      lapses: 1,
      state: 2,
      lastReviewAt: 1_759_900_000_000,
    };
  }
  return record;
}

function payloadWithRecords(count: number): CloudPayloadV1<
  {
    records: Record<string, CloudMemoryRecord>;
    todayKey: string;
    todayWordIds: string[];
    todayReviewEventIds: string[];
    todayQueueCompletionIds: string[];
    updatedAt: number;
    resetAt: number;
  },
  {
    wordsPerQueue: number;
    queuesPerDay: number;
    level: string;
    order: string;
    dueFirst: boolean;
  }
> {
  const records: Record<string, CloudMemoryRecord> = {};
  const ids = Array.from({ length: count }, (_, index) => `wort-${index.toString(36)}`);
  ids.forEach((id, index) => {
    records[id] = memoryRecord(index);
  });
  return {
    schemaVersion: 1,
    learning: {
      records,
      todayKey: "2026-07-22",
      todayWordIds: ids,
      todayReviewEventIds: ids.map((id, index) => `${id}:${index}:review`),
      todayQueueCompletionIds: ["2026-07-22:A1:1"],
      updatedAt: 1_760_000_006_000,
      resetAt: 0,
    },
    settings: {
      wordsPerQueue: 20,
      queuesPerDay: 5,
      level: "C1",
      order: "sequential",
      dueFirst: true,
    },
    settingsUpdatedAt: 1_760_000_006_000,
  };
}

test("schema v2 packs and restores every memory field", () => {
  const original = payloadWithRecords(12);
  const packed = packCloudPayload(original);
  const unpacked = unpackCloudPayload(packed);

  assert.equal(packed.schemaVersion, 2);
  assert.ok(Array.isArray(packed.learning.records));
  assert.equal(packed.learning.records[0].length, 12);
  assert.deepEqual(unpacked, original);
});

test("schema v1 remains readable", () => {
  const original = payloadWithRecords(3);
  assert.deepEqual(unpackCloudPayload(original), original);
});

test("malformed schema v2 record tuples are rejected", () => {
  const packed = packCloudPayload(payloadWithRecords(1));
  const malformed = {
    ...packed,
    learning: { ...packed.learning, records: [["wort-0", 9]] },
  };
  assert.equal(unpackCloudPayload(malformed), null);
});

test("a representative 6000-record v2 snapshot stays below the D1 safety cap", () => {
  const original = payloadWithRecords(6_000);
  const packed = packCloudPayload(original);
  const packedBytes = cloudPayloadByteLength(packed);
  const objectRecordBytes = cloudPayloadByteLength(original);

  assert.ok(packedBytes !== null);
  assert.ok(objectRecordBytes !== null);
  assert.ok(packedBytes < MAX_CLOUD_SNAPSHOT_BYTES);
  assert.ok(packedBytes < objectRecordBytes);
});

test("the byte counter detects payloads beyond the 1.8 MB API limit", () => {
  const oversized = {
    ...packCloudPayload(payloadWithRecords(0)),
    padding: "x".repeat(MAX_CLOUD_SNAPSHOT_BYTES),
  };
  assert.ok((cloudPayloadByteLength(oversized) ?? 0) > MAX_CLOUD_SNAPSHOT_BYTES);
});
