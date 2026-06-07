CREATE TABLE `template_folder_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `template_folder_assignments_template_id_idx` ON `template_folder_assignments` (`template_id`);--> statement-breakpoint
CREATE INDEX `template_folder_assignments_folder_id_idx` ON `template_folder_assignments` (`folder_id`);--> statement-breakpoint
CREATE INDEX `template_folder_assignments_user_id_idx` ON `template_folder_assignments` (`user_id`);