CREATE TABLE `note_comment_message_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`emoji` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `note_comment_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `note_comment_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_comment_reactions_message_actor_emoji_idx` ON `note_comment_message_reactions` (`message_id`,`actor_type`,`actor_id`,`emoji`);--> statement-breakpoint
CREATE INDEX `note_comment_reactions_thread_idx` ON `note_comment_message_reactions` (`thread_id`);--> statement-breakpoint
CREATE INDEX `note_comment_reactions_user_note_idx` ON `note_comment_message_reactions` (`user_id`,`note_id`);