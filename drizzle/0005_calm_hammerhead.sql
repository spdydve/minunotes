PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`uid` text NOT NULL,
	`hash` text NOT NULL,
	`salt` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_api_keys`("id", "user_id", "name", "uid", "hash", "salt", "created_at", "updated_at", "last_used_at", "revoked_at") SELECT "id", "user_id", "name", "uid", "hash", "salt", "created_at", "updated_at", "last_used_at", "revoked_at" FROM `api_keys`;--> statement-breakpoint
DROP TABLE `api_keys`;--> statement-breakpoint
ALTER TABLE `__new_api_keys` RENAME TO `api_keys`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_uid_unique` ON `api_keys` (`uid`);--> statement-breakpoint
CREATE INDEX `api_keys_user_id_idx` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_api_key_folder_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`can_read` integer DEFAULT false NOT NULL,
	`can_create` integer DEFAULT false NOT NULL,
	`can_edit` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_api_key_folder_permissions`("id", "api_key_id", "folder_id", "can_read", "can_create", "can_edit", "created_at", "updated_at") SELECT "id", "api_key_id", "folder_id", "can_read", "can_create", "can_edit", "created_at", "updated_at" FROM `api_key_folder_permissions`;--> statement-breakpoint
DROP TABLE `api_key_folder_permissions`;--> statement-breakpoint
ALTER TABLE `__new_api_key_folder_permissions` RENAME TO `api_key_folder_permissions`;--> statement-breakpoint
CREATE INDEX `api_key_folder_permissions_api_key_id_idx` ON `api_key_folder_permissions` (`api_key_id`);--> statement-breakpoint
CREATE INDEX `api_key_folder_permissions_folder_id_idx` ON `api_key_folder_permissions` (`folder_id`);--> statement-breakpoint
ALTER TABLE `notes` ADD `updated_by_actor_type` text;--> statement-breakpoint
ALTER TABLE `notes` ADD `updated_by_actor_id` text;