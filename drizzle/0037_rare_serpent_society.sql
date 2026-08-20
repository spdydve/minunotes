ALTER TABLE `folders` ADD `created_by_user_id` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
UPDATE `folders` SET `created_by_user_id` = `user_id` WHERE `created_by_user_id` IS NULL;--> statement-breakpoint
CREATE INDEX `folders_created_by_user_id_idx` ON `folders` (`created_by_user_id`);--> statement-breakpoint
ALTER TABLE `notes` ADD `created_by_user_id` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
UPDATE `notes` SET `created_by_user_id` = `user_id` WHERE `created_by_user_id` IS NULL;--> statement-breakpoint
CREATE INDEX `notes_created_by_user_id_idx` ON `notes` (`created_by_user_id`);