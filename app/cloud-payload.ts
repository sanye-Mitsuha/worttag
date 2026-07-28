export type CloudRecallStatus = "unknown" | "fuzzy" | "known";

export type CloudMemoryRecord = {
  status: CloudRecallStatus;
  stage: number;
  dueAt: number;
  intervalDays: number;
  knownStreak: number;
  lapseCount: number;
  lastReviewedAt: number | null;
  sameDayLapses: number;
  lapseDayKey: string | null;
  updatedAt: number;
};

export type PackedMemoryRecord = readonly [
  id: string,
  status: 0 | 1 | 2,
  stage: number,
  dueAt: number,
  intervalDays: number,
  knownStreak: number,
  lapseCount: number,
  lastReviewedAt: number,
  sameDayLapses: number,
  lapseDayKey: string,
  updatedAt: number,
];

export const MAX_CLOUD_SNAPSHOT_BYTES = 1_800_000;

const STATUS_TO_CODE: Record<CloudRecallStatus, 0 | 1 | 2> = {
  unknown: 0,
  fuzzy: 1,
  known: 2,
};

const CODE_TO_STATUS: Record<0 | 1 | 2, CloudRecallStatus> = {
  0: "unknown",
  1: "fuzzy",
  2: "known",
};

type LearningWithRecords = {
  records: Record<string, CloudMemoryRecord>;
};

export type CloudPayloadV1<
  TLearning extends LearningWithRecords = LearningWithRecords,
  TSettings extends object = object,
> = {
  schemaVersion: 1;
  learning: TLearning;
  settings: TSettings;
  settingsUpdatedAt: number;
};

export type CloudPayloadV2<
  TLearning extends LearningWithRecords = LearningWithRecords,
  TSettings extends object = object,
> = {
  schemaVersion: 2;
  learning: Omit<TLearning, "records"> & { records: PackedMemoryRecord[] };
  settings: TSettings;
  settingsUpdatedAt: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPackedMemoryRecord(value: unknown): value is PackedMemoryRecord {
  if (!Array.isArray(value) || value.length !== 11) return false;
  return (
    typeof value[0] === "string" &&
    value[0].length > 0 &&
    (value[1] === 0 || value[1] === 1 || value[1] === 2) &&
    value.slice(2, 9).every(isFiniteNumber) &&
    typeof value[9] === "string" &&
    isFiniteNumber(value[10])
  );
}

export function packMemoryRecords(
  records: Record<string, CloudMemoryRecord>,
): PackedMemoryRecord[] {
  return Object.entries(records).map(([id, record]) => [
    id,
    STATUS_TO_CODE[record.status],
    record.stage,
    record.dueAt,
    record.intervalDays,
    record.knownStreak,
    record.lapseCount,
    record.lastReviewedAt ?? 0,
    record.sameDayLapses,
    record.lapseDayKey ?? "",
    record.updatedAt,
  ]);
}

export function unpackMemoryRecords(
  packedRecords: readonly PackedMemoryRecord[],
): Record<string, CloudMemoryRecord> {
  const records: Record<string, CloudMemoryRecord> = {};
  packedRecords.forEach((packed) => {
    const [
      id,
      status,
      stage,
      dueAt,
      intervalDays,
      knownStreak,
      lapseCount,
      lastReviewedAt,
      sameDayLapses,
      lapseDayKey,
      updatedAt,
    ] = packed;
    records[id] = {
      status: CODE_TO_STATUS[status],
      stage,
      dueAt,
      intervalDays,
      knownStreak,
      lapseCount,
      lastReviewedAt: lastReviewedAt === 0 ? null : lastReviewedAt,
      sameDayLapses,
      lapseDayKey: lapseDayKey || null,
      updatedAt,
    };
  });
  return records;
}

export function packCloudPayload<
  TLearning extends LearningWithRecords,
  TSettings extends object,
>(payload: CloudPayloadV1<TLearning, TSettings>): CloudPayloadV2<TLearning, TSettings> {
  return {
    schemaVersion: 2,
    learning: {
      ...payload.learning,
      records: packMemoryRecords(payload.learning.records),
    },
    settings: payload.settings,
    settingsUpdatedAt: payload.settingsUpdatedAt,
  };
}

/**
 * Converts either supported wire format to the object-record format used by the
 * app's merge logic. Version 1 record values deliberately remain permissive so
 * older saved snapshots can still be repaired by the existing state sanitizer.
 */
export function unpackCloudPayload(value: unknown): CloudPayloadV1 | null {
  if (!isObject(value) || !isObject(value.learning) || !isObject(value.settings)) {
    return null;
  }

  if (value.schemaVersion === 1) {
    if (!isObject(value.learning.records)) return null;
    return value as CloudPayloadV1;
  }

  if (value.schemaVersion !== 2 || !Array.isArray(value.learning.records)) {
    return null;
  }
  if (!value.learning.records.every(isPackedMemoryRecord)) return null;

  return {
    schemaVersion: 1,
    learning: {
      ...value.learning,
      records: unpackMemoryRecords(value.learning.records),
    },
    settings: value.settings,
    settingsUpdatedAt: Number(value.settingsUpdatedAt),
  };
}

export function cloudPayloadSchemaVersion(value: unknown): 1 | 2 | null {
  if (!isObject(value)) return null;
  return value.schemaVersion === 1 || value.schemaVersion === 2
    ? value.schemaVersion
    : null;
}

export function cloudPayloadByteLength(value: unknown): number | null {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") return null;
    return new TextEncoder().encode(serialized).byteLength;
  } catch {
    return null;
  }
}
