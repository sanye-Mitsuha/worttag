CREATE TABLE `guest_board_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nickname` text NOT NULL,
	`content` text NOT NULL,
	`client_key_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_guest_board_messages_client_created_at` ON `guest_board_messages` (`client_key_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_guest_board_messages_created_at` ON `guest_board_messages` (`created_at`);