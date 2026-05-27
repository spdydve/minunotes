CREATE TABLE `note_events` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`before_hash` text,
	`after_hash` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_events_note_id_idx` ON `note_events` (`note_id`);--> statement-breakpoint
CREATE INDEX `note_events_user_id_idx` ON `note_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `note_events_created_at_idx` ON `note_events` (`created_at`);