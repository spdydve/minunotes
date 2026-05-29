CREATE TABLE `agent_api_key_folder_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`can_read` integer DEFAULT false NOT NULL,
	`can_create` integer DEFAULT false NOT NULL,
	`can_edit` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`api_key_id`) REFERENCES `agent_api_keys`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_api_key_folder_permissions_api_key_id_idx` ON `agent_api_key_folder_permissions` (`api_key_id`);--> statement-breakpoint
CREATE INDEX `agent_api_key_folder_permissions_folder_id_idx` ON `agent_api_key_folder_permissions` (`folder_id`);