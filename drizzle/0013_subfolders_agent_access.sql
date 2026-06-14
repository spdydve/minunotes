ALTER TABLE `folders` ADD `parent_folder_id` text;
ALTER TABLE `folders` ADD `is_private` integer DEFAULT false NOT NULL;
ALTER TABLE `api_keys` ADD `access_mode` text DEFAULT 'all' NOT NULL;
UPDATE `api_keys` SET `access_mode` = 'selected';
CREATE INDEX `folders_parent_folder_id_idx` ON `folders` (`parent_folder_id`);
