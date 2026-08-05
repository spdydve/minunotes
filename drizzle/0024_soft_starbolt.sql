ALTER TABLE `folders` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `folders` ADD `trash_batch_id` text;--> statement-breakpoint
CREATE INDEX `folders_user_deleted_at_idx` ON `folders` (`user_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `folders_trash_batch_id_idx` ON `folders` (`trash_batch_id`);--> statement-breakpoint
ALTER TABLE `notes` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `notes` ADD `trash_batch_id` text;--> statement-breakpoint
CREATE INDEX `notes_user_deleted_at_idx` ON `notes` (`user_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `notes_trash_batch_id_idx` ON `notes` (`trash_batch_id`);
