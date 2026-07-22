import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userLearningSnapshots = sqliteTable("user_learning_snapshots", {
  ownerKey: text("owner_key").primaryKey(),
  stateJson: text("state_json").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  revision: integer("revision").notNull().default(1),
  resetAt: integer("reset_at").notNull().default(0),
  clientUpdatedAt: integer("client_updated_at").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
