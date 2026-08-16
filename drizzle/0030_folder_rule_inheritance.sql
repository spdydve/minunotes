ALTER TABLE `api_key_folder_permissions` ADD `applies_to` text DEFAULT 'exact' NOT NULL;
--> statement-breakpoint
UPDATE `api_key_folder_permissions`
SET `applies_to` = 'subtree'
WHERE `api_key_id` IN (SELECT `id` FROM `api_keys` WHERE `access_mode` = 'top_level');
--> statement-breakpoint
ALTER TABLE `oauth_authorization_folder_permissions` ADD `applies_to` text DEFAULT 'exact' NOT NULL;
--> statement-breakpoint
UPDATE `oauth_authorization_folder_permissions`
SET `applies_to` = 'subtree'
WHERE `authorization_id` IN (
  SELECT `id` FROM `oauth_authorizations` WHERE `access_mode` = 'top_level'
);
