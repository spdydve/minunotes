ALTER TABLE `notes` RENAME COLUMN `is_agent_editable` TO `is_api_editable`;--> statement-breakpoint
ALTER TABLE `agent_api_keys` RENAME TO `api_keys`;--> statement-breakpoint
DROP INDEX `agent_api_keys_uid_unique`;--> statement-breakpoint
DROP INDEX `agent_api_keys_user_id_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_uid_unique` ON `api_keys` (`uid`);--> statement-breakpoint
CREATE INDEX `api_keys_user_id_idx` ON `api_keys` (`user_id`);--> statement-breakpoint
ALTER TABLE `agent_api_key_folder_permissions` RENAME TO `api_key_folder_permissions`;--> statement-breakpoint
DROP INDEX `agent_api_key_folder_permissions_api_key_id_idx`;--> statement-breakpoint
DROP INDEX `agent_api_key_folder_permissions_folder_id_idx`;--> statement-breakpoint
CREATE INDEX `api_key_folder_permissions_api_key_id_idx` ON `api_key_folder_permissions` (`api_key_id`);--> statement-breakpoint
CREATE INDEX `api_key_folder_permissions_folder_id_idx` ON `api_key_folder_permissions` (`folder_id`);