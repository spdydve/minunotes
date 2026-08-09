CREATE TABLE `note_comment_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`body` text NOT NULL,
	`is_root` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `note_comment_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_comment_messages_thread_created_at_idx` ON `note_comment_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `note_comment_messages_user_note_idx` ON `note_comment_messages` (`user_id`,`note_id`);--> statement-breakpoint
CREATE TABLE `note_comment_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`anchor_type` text NOT NULL,
	`anchor_from` integer NOT NULL,
	`anchor_to` integer NOT NULL,
	`quote` text NOT NULL,
	`prefix` text,
	`suffix` text,
	`document_hash` text NOT NULL,
	`detached` integer DEFAULT false NOT NULL,
	`created_by_actor_type` text NOT NULL,
	`created_by_actor_id` text,
	`resolved_by_actor_type` text,
	`resolved_by_actor_id` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_comment_threads_user_note_updated_at_idx` ON `note_comment_threads` (`user_id`,`note_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `note_comment_threads_note_status_idx` ON `note_comment_threads` (`note_id`,`status`);