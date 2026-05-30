CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`note_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`provider` text DEFAULT 'filesystem' NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`content_hash` text NOT NULL,
	`storage_key` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_user_id_idx` ON `attachments` (`user_id`);--> statement-breakpoint
CREATE INDEX `attachments_note_id_idx` ON `attachments` (`note_id`);--> statement-breakpoint
CREATE INDEX `attachments_folder_id_idx` ON `attachments` (`folder_id`);