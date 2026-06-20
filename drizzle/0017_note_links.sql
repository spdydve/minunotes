CREATE TABLE `note_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_note_id` text NOT NULL,
	`target_note_id` text,
	`target_title` text NOT NULL,
	`label` text,
	`link_type` text DEFAULT 'wikilink' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `note_links_user_id_idx` ON `note_links` (`user_id`);
--> statement-breakpoint
CREATE INDEX `note_links_source_note_id_idx` ON `note_links` (`source_note_id`);
--> statement-breakpoint
CREATE INDEX `note_links_target_note_id_idx` ON `note_links` (`target_note_id`);
--> statement-breakpoint
CREATE INDEX `note_links_user_target_title_idx` ON `note_links` (`user_id`,`target_title`);
