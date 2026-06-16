ALTER TABLE `folders` ADD `is_agent_read_only` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `api_keys` ADD `can_read` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `api_keys` ADD `can_create` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `api_keys` ADD `can_edit` integer DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE `api_keys` SET `access_mode` = 'specific' WHERE `access_mode` = 'selected';
