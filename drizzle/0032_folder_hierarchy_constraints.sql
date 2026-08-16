PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`parent_folder_id` text,
	`title` text NOT NULL,
	`is_private` integer DEFAULT false NOT NULL,
	`is_agent_read_only` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`trash_batch_id` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_folder_id`,`user_id`) REFERENCES `folders`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "folders_not_self_parent_check" CHECK("__new_folders"."parent_folder_id" is null or "__new_folders"."parent_folder_id" <> "__new_folders"."id")
);
--> statement-breakpoint
INSERT INTO `__new_folders`("id", "user_id", "parent_folder_id", "title", "is_private", "is_agent_read_only", "deleted_at", "trash_batch_id", "created_at", "updated_at") SELECT "id", "user_id", "parent_folder_id", "title", "is_private", "is_agent_read_only", "deleted_at", "trash_batch_id", "created_at", "updated_at" FROM `folders`;--> statement-breakpoint
DROP TABLE `folders`;--> statement-breakpoint
ALTER TABLE `__new_folders` RENAME TO `folders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `folders_user_id_idx` ON `folders` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `folders_id_user_id_idx` ON `folders` (`id`,`user_id`);--> statement-breakpoint
CREATE INDEX `folders_parent_folder_id_idx` ON `folders` (`parent_folder_id`);--> statement-breakpoint
CREATE INDEX `folders_user_deleted_at_idx` ON `folders` (`user_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `folders_trash_batch_id_idx` ON `folders` (`trash_batch_id`);