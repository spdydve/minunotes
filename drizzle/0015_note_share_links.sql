CREATE TABLE `note_share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`note_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`permission` text DEFAULT 'read' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_share_links_token_hash_idx` ON `note_share_links` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `note_share_links_note_id_idx` ON `note_share_links` (`note_id`);
--> statement-breakpoint
CREATE INDEX `note_share_links_user_id_idx` ON `note_share_links` (`user_id`);
