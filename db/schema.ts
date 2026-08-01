import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userLearningSnapshots = sqliteTable("user_learning_snapshots", {
  ownerKey: text("owner_key").primaryKey(),
  stateJson: text("state_json").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  revision: integer("revision").notNull().default(1),
  resetAt: integer("reset_at").notNull().default(0),
  clientUpdatedAt: integer("client_updated_at").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const guestBoardMessages = sqliteTable(
  "guest_board_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nickname: text("nickname").notNull(),
    content: text("content").notNull(),
    clientKeyHash: text("client_key_hash").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_guest_board_messages_client_created_at").on(table.clientKeyHash, table.createdAt),
    index("idx_guest_board_messages_created_at").on(table.createdAt),
  ],
);
