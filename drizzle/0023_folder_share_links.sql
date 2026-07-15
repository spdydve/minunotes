CREATE TABLE `folder_share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`token` text,
	`permission` text DEFAULT 'read' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folder_share_links_token_hash_idx` ON `folder_share_links` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `folder_share_links_folder_id_idx` ON `folder_share_links` (`folder_id`);
--> statement-breakpoint
CREATE INDEX `folder_share_links_user_id_idx` ON `folder_share_links` (`user_id`);
