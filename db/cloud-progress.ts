import { env } from "cloudflare:workers";

export type StoredSnapshot = {
  payload: unknown;
  revision: number;
  resetAt: number;
  clientUpdatedAt: number;
  serverUpdatedAt: string;
};

type SnapshotRow = {
  state_json: string;
  revision: number;
  reset_at: number;
  client_updated_at: number;
  updated_at: string;
};

export async function ownerKeyForEmail(email: string) {
  const bytes = new TextEncoder().encode(
    `worttag-owner-v1\0${email.trim().toLowerCase()}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function storedSnapshotFromRow(row: SnapshotRow): StoredSnapshot {
  return {
    payload: JSON.parse(row.state_json),
    revision: row.revision,
    resetAt: row.reset_at,
    clientUpdatedAt: row.client_updated_at,
    serverUpdatedAt: row.updated_at,
  };
}

export async function readSnapshot(ownerKey: string): Promise<StoredSnapshot | null> {
  const row = await env.DB.prepare(
    `SELECT state_json, revision, reset_at, client_updated_at, updated_at
     FROM user_learning_snapshots
     WHERE owner_key = ?`,
  ).bind(ownerKey).first<SnapshotRow>();

  if (!row) return null;
  return storedSnapshotFromRow(row);
}

export async function writeSnapshot(options: {
  ownerKey: string;
  payload: unknown;
  expectedRevision: number;
  resetAt: number;
  clientUpdatedAt: number;
}): Promise<{ saved: true; snapshot: StoredSnapshot } | { saved: false; snapshot: StoredSnapshot }> {
  const stateJson = JSON.stringify(options.payload);

  if (options.expectedRevision === 0) {
    const inserted = await env.DB.prepare(
      `INSERT OR IGNORE INTO user_learning_snapshots
       (owner_key, state_json, schema_version, revision, reset_at, client_updated_at, updated_at)
       VALUES (?, ?, 1, 1, ?, ?, CURRENT_TIMESTAMP)
       RETURNING state_json, revision, reset_at, client_updated_at, updated_at`,
    ).bind(
      options.ownerKey,
      stateJson,
      options.resetAt,
      options.clientUpdatedAt,
    ).first<SnapshotRow>();

    if (inserted) return { saved: true, snapshot: storedSnapshotFromRow(inserted) };
  } else {
    const updated = await env.DB.prepare(
      `UPDATE user_learning_snapshots
       SET state_json = ?,
           schema_version = 1,
           revision = revision + 1,
           reset_at = ?,
           client_updated_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE owner_key = ?
         AND revision = ?
         AND reset_at <= ?
       RETURNING state_json, revision, reset_at, client_updated_at, updated_at`,
    ).bind(
      stateJson,
      options.resetAt,
      options.clientUpdatedAt,
      options.ownerKey,
      options.expectedRevision,
      options.resetAt,
    ).first<SnapshotRow>();

    if (updated) return { saved: true, snapshot: storedSnapshotFromRow(updated) };
  }

  const current = await readSnapshot(options.ownerKey);
  if (!current) throw new Error("Cloud progress changed while it was being saved.");
  return { saved: false, snapshot: current };
}
