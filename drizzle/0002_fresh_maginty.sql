CREATE TABLE `agent_api_keys` (
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
CREATE UNIQUE INDEX `agent_api_keys_uid_unique` ON `agent_api_keys` (`uid`);--> statement-breakpoint
CREATE INDEX `agent_api_keys_user_id_idx` ON `agent_api_keys` (`user_id`);