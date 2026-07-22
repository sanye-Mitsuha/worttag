CREATE TABLE `user_learning_snapshots` (
	`owner_key` text PRIMARY KEY NOT NULL,
	`state_json` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`reset_at` integer DEFAULT 0 NOT NULL,
	`client_updated_at` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
