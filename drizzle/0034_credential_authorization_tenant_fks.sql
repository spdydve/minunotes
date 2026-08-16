PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`authorization_id` text NOT NULL,
	`name` text NOT NULL,
	`uid` text NOT NULL,
	`hash` text NOT NULL,
	`salt` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`authorization_id`,`user_id`) REFERENCES `integration_authorizations`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_api_keys`("id", "user_id", "authorization_id", "name", "uid", "hash", "salt", "created_at", "updated_at") SELECT "id", "user_id", "authorization_id", "name", "uid", "hash", "salt", "created_at", "updated_at" FROM `api_keys`;--> statement-breakpoint
DROP TABLE `api_keys`;--> statement-breakpoint
ALTER TABLE `__new_api_keys` RENAME TO `api_keys`;--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_authorization_id_unique` ON `api_keys` (`authorization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_uid_unique` ON `api_keys` (`uid`);--> statement-breakpoint
CREATE INDEX `api_keys_user_id_idx` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_oauth_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`integration_authorization_id` text NOT NULL,
	`client_id` text NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`integration_authorization_id`,`user_id`) REFERENCES `integration_authorizations`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_oauth_authorizations`("id", "user_id", "integration_authorization_id", "client_id", "scope", "created_at", "updated_at") SELECT "id", "user_id", "integration_authorization_id", "client_id", "scope", "created_at", "updated_at" FROM `oauth_authorizations`;--> statement-breakpoint
DROP TABLE `oauth_authorizations`;--> statement-breakpoint
ALTER TABLE `__new_oauth_authorizations` RENAME TO `oauth_authorizations`;--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_authorizations_integration_authorization_id_unique` ON `oauth_authorizations` (`integration_authorization_id`);--> statement-breakpoint
CREATE INDEX `oauth_authorizations_user_id_idx` ON `oauth_authorizations` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_authorizations_client_id_idx` ON `oauth_authorizations` (`client_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;