CREATE TABLE `note_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `note_id` text NOT NULL,
  `title` text NOT NULL,
  `content` text NOT NULL,
  `folder_id` text NOT NULL,
  `created_at_value` integer NOT NULL,
  `is_api_editable` integer DEFAULT true NOT NULL,
  `state_hash` text NOT NULL,
  `reason` text NOT NULL,
  `actor_type` text NOT NULL,
  `actor_id` text,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_versions_user_note_created_at_idx` ON `note_versions` (`user_id`,`note_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `note_versions_note_created_at_idx` ON `note_versions` (`note_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `note_versions_note_state_hash_idx` ON `note_versions` (`note_id`,`state_hash`);
