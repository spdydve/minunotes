CREATE TABLE `integration_authorizations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `access_mode` text DEFAULT 'all' NOT NULL,
  `can_read` integer DEFAULT true NOT NULL,
  `can_create` integer DEFAULT false NOT NULL,
  `can_edit` integer DEFAULT false NOT NULL,
  `can_comment` integer DEFAULT false NOT NULL,
  `can_create_folders` integer DEFAULT false NOT NULL,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `last_used_at` integer,
  `revoked_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `integration_authorizations_access_mode_check` CHECK (`access_mode` IN ('all', 'top_level', 'specific')),
  CONSTRAINT `integration_authorizations_can_read_check` CHECK (`can_read` IN (0, 1)),
  CONSTRAINT `integration_authorizations_can_create_check` CHECK (`can_create` IN (0, 1)),
  CONSTRAINT `integration_authorizations_can_edit_check` CHECK (`can_edit` IN (0, 1)),
  CONSTRAINT `integration_authorizations_can_comment_check` CHECK (`can_comment` IN (0, 1)),
  CONSTRAINT `integration_authorizations_can_create_folders_check` CHECK (`can_create_folders` IN (0, 1)),
  CONSTRAINT `integration_authorizations_comment_requires_read_check` CHECK (`can_comment` = 0 OR `can_read` = 1)
);
--> statement-breakpoint
CREATE INDEX `integration_authorizations_user_id_idx` ON `integration_authorizations` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_authorizations_id_user_id_idx` ON `integration_authorizations` (`id`, `user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `folders_id_user_id_idx` ON `folders` (`id`, `user_id`);
--> statement-breakpoint
CREATE TABLE `authorization_folder_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `authorization_id` text NOT NULL,
  `user_id` text NOT NULL,
  `folder_id` text NOT NULL,
  `applies_to` text DEFAULT 'exact' NOT NULL,
  `can_read` integer DEFAULT false NOT NULL,
  `can_create` integer DEFAULT false NOT NULL,
  `can_edit` integer DEFAULT false NOT NULL,
  `can_comment` integer DEFAULT false NOT NULL,
  `can_create_folders` integer DEFAULT false NOT NULL,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`authorization_id`, `user_id`) REFERENCES `integration_authorizations`(`id`, `user_id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`folder_id`, `user_id`) REFERENCES `folders`(`id`, `user_id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `authorization_folder_rules_applies_to_check` CHECK (`applies_to` IN ('exact', 'subtree')),
  CONSTRAINT `authorization_folder_rules_can_read_check` CHECK (`can_read` IN (0, 1)),
  CONSTRAINT `authorization_folder_rules_can_create_check` CHECK (`can_create` IN (0, 1)),
  CONSTRAINT `authorization_folder_rules_can_edit_check` CHECK (`can_edit` IN (0, 1)),
  CONSTRAINT `authorization_folder_rules_can_comment_check` CHECK (`can_comment` IN (0, 1)),
  CONSTRAINT `authorization_folder_rules_can_create_folders_check` CHECK (`can_create_folders` IN (0, 1)),
  CONSTRAINT `authorization_folder_rules_comment_requires_read_check` CHECK (`can_comment` = 0 OR `can_read` = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authorization_folder_rules_authorization_folder_idx` ON `authorization_folder_rules` (`authorization_id`, `folder_id`);
--> statement-breakpoint
CREATE INDEX `authorization_folder_rules_authorization_id_idx` ON `authorization_folder_rules` (`authorization_id`);
--> statement-breakpoint
CREATE INDEX `authorization_folder_rules_folder_id_idx` ON `authorization_folder_rules` (`folder_id`);
--> statement-breakpoint
CREATE INDEX `authorization_folder_rules_user_id_idx` ON `authorization_folder_rules` (`user_id`);
--> statement-breakpoint
ALTER TABLE `api_keys` ADD `authorization_id` text REFERENCES `integration_authorizations`(`id`) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `oauth_authorizations` ADD `integration_authorization_id` text REFERENCES `integration_authorizations`(`id`) ON DELETE cascade;
--> statement-breakpoint
INSERT INTO `integration_authorizations` (
  `id`, `user_id`, `access_mode`, `can_read`, `can_create`, `can_edit`, `can_comment`, `can_create_folders`,
  `created_at`, `updated_at`, `last_used_at`, `revoked_at`
)
SELECT `id`, `user_id`, `access_mode`, `can_read`, `can_create`, `can_edit`, `can_comment`, `can_create_folders`,
       `created_at`, `updated_at`, `last_used_at`, `revoked_at`
FROM `api_keys`;
--> statement-breakpoint
INSERT INTO `integration_authorizations` (
  `id`, `user_id`, `access_mode`, `can_read`, `can_create`, `can_edit`, `can_comment`, `can_create_folders`,
  `created_at`, `updated_at`, `last_used_at`, `revoked_at`
)
SELECT `id`, `user_id`, `access_mode`, `can_read`, `can_create`, `can_edit`, `can_comment`, `can_create_folders`,
       `created_at`, `updated_at`, `last_used_at`, `revoked_at`
FROM `oauth_authorizations`;
--> statement-breakpoint
UPDATE `api_keys` SET `authorization_id` = `id`;
--> statement-breakpoint
UPDATE `oauth_authorizations` SET `integration_authorization_id` = `id`;
--> statement-breakpoint
INSERT INTO `authorization_folder_rules` (
  `id`, `authorization_id`, `user_id`, `folder_id`, `applies_to`, `can_read`, `can_create`, `can_edit`,
  `can_comment`, `can_create_folders`, `created_at`, `updated_at`
)
SELECT 'rule_api_' || permission.`id`, permission.`api_key_id`, credential.`user_id`, permission.`folder_id`,
       permission.`applies_to`, permission.`can_read`, permission.`can_create`, permission.`can_edit`,
       permission.`can_comment`, permission.`can_create`, permission.`created_at`, permission.`updated_at`
FROM `api_key_folder_permissions` permission
JOIN `api_keys` credential ON credential.`id` = permission.`api_key_id`;
--> statement-breakpoint
INSERT INTO `authorization_folder_rules` (
  `id`, `authorization_id`, `user_id`, `folder_id`, `applies_to`, `can_read`, `can_create`, `can_edit`,
  `can_comment`, `can_create_folders`, `created_at`, `updated_at`
)
SELECT 'rule_oauth_' || permission.`id`, permission.`authorization_id`, authorization.`user_id`, permission.`folder_id`,
       permission.`applies_to`, permission.`can_read`, permission.`can_create`, permission.`can_edit`,
       permission.`can_comment`, permission.`can_create`, permission.`created_at`, permission.`updated_at`
FROM `oauth_authorization_folder_permissions` permission
JOIN `oauth_authorizations` authorization ON authorization.`id` = permission.`authorization_id`;
--> statement-breakpoint
CREATE TRIGGER `api_keys_sync_authorization_insert`
AFTER INSERT ON `api_keys`
BEGIN
  INSERT INTO `integration_authorizations` (
    `id`, `user_id`, `access_mode`, `can_read`, `can_create`, `can_edit`, `can_comment`, `can_create_folders`,
    `created_at`, `updated_at`, `last_used_at`, `revoked_at`
  ) VALUES (
    NEW.`id`, NEW.`user_id`, NEW.`access_mode`, NEW.`can_read`, NEW.`can_create`, NEW.`can_edit`, NEW.`can_comment`,
    NEW.`can_create_folders`, NEW.`created_at`, NEW.`updated_at`, NEW.`last_used_at`, NEW.`revoked_at`
  ) ON CONFLICT(`id`) DO UPDATE SET
    `user_id` = excluded.`user_id`, `access_mode` = excluded.`access_mode`, `can_read` = excluded.`can_read`,
    `can_create` = excluded.`can_create`, `can_edit` = excluded.`can_edit`, `can_comment` = excluded.`can_comment`,
    `can_create_folders` = excluded.`can_create_folders`, `updated_at` = excluded.`updated_at`,
    `last_used_at` = excluded.`last_used_at`, `revoked_at` = excluded.`revoked_at`;
  UPDATE `api_keys` SET `authorization_id` = NEW.`id` WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `api_keys_sync_authorization_update`
AFTER UPDATE OF `user_id`, `access_mode`, `can_read`, `can_create`, `can_edit`, `can_comment`, `can_create_folders`,
  `updated_at`, `last_used_at`, `revoked_at` ON `api_keys`
BEGIN
  UPDATE `integration_authorizations` SET
    `user_id` = NEW.`user_id`, `access_mode` = NEW.`access_mode`, `can_read` = NEW.`can_read`,
    `can_create` = NEW.`can_create`, `can_edit` = NEW.`can_edit`, `can_comment` = NEW.`can_comment`,
    `can_create_folders` = NEW.`can_create_folders`, `updated_at` = NEW.`updated_at`,
    `last_used_at` = NEW.`last_used_at`, `revoked_at` = NEW.`revoked_at`
  WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `api_keys_sync_authorization_delete`
AFTER DELETE ON `api_keys`
BEGIN
  DELETE FROM `integration_authorizations` WHERE `id` = OLD.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `api_key_rules_sync_insert`
AFTER INSERT ON `api_key_folder_permissions`
BEGIN
  INSERT INTO `authorization_folder_rules` (
    `id`, `authorization_id`, `user_id`, `folder_id`, `applies_to`, `can_read`, `can_create`, `can_edit`,
    `can_comment`, `can_create_folders`, `created_at`, `updated_at`
  ) SELECT 'rule_api_' || NEW.`id`, NEW.`api_key_id`, credential.`user_id`, NEW.`folder_id`, NEW.`applies_to`,
           NEW.`can_read`, NEW.`can_create`, NEW.`can_edit`, NEW.`can_comment`, NEW.`can_create`, NEW.`created_at`, NEW.`updated_at`
    FROM `api_keys` credential WHERE credential.`id` = NEW.`api_key_id`
  ON CONFLICT(`authorization_id`, `folder_id`) DO UPDATE SET
    `applies_to` = excluded.`applies_to`, `can_read` = excluded.`can_read`, `can_create` = excluded.`can_create`,
    `can_edit` = excluded.`can_edit`, `can_comment` = excluded.`can_comment`,
    `can_create_folders` = excluded.`can_create_folders`, `updated_at` = excluded.`updated_at`;
END;
--> statement-breakpoint
CREATE TRIGGER `api_key_rules_sync_update`
AFTER UPDATE ON `api_key_folder_permissions`
BEGIN
  UPDATE `authorization_folder_rules` SET
    `folder_id` = NEW.`folder_id`, `applies_to` = NEW.`applies_to`, `can_read` = NEW.`can_read`,
    `can_create` = NEW.`can_create`, `can_edit` = NEW.`can_edit`, `can_comment` = NEW.`can_comment`,
    `can_create_folders` = NEW.`can_create`, `updated_at` = NEW.`updated_at`
  WHERE `authorization_id` = NEW.`api_key_id` AND `folder_id` = OLD.`folder_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `api_key_rules_sync_delete`
AFTER DELETE ON `api_key_folder_permissions`
BEGIN
  DELETE FROM `authorization_folder_rules`
  WHERE `authorization_id` = OLD.`api_key_id` AND `folder_id` = OLD.`folder_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `oauth_authorizations_sync_integration_insert`
AFTER INSERT ON `oauth_authorizations`
BEGIN
  INSERT INTO `integration_authorizations` (
    `id`, `user_id`, `access_mode`, `can_read`, `can_create`, `can_edit`, `can_comment`, `can_create_folders`,
    `created_at`, `updated_at`, `last_used_at`, `revoked_at`
  ) VALUES (
    NEW.`id`, NEW.`user_id`, NEW.`access_mode`, NEW.`can_read`, NEW.`can_create`, NEW.`can_edit`, NEW.`can_comment`,
    NEW.`can_create_folders`, NEW.`created_at`, NEW.`updated_at`, NEW.`last_used_at`, NEW.`revoked_at`
  ) ON CONFLICT(`id`) DO UPDATE SET
    `user_id` = excluded.`user_id`, `access_mode` = excluded.`access_mode`, `can_read` = excluded.`can_read`,
    `can_create` = excluded.`can_create`, `can_edit` = excluded.`can_edit`, `can_comment` = excluded.`can_comment`,
    `can_create_folders` = excluded.`can_create_folders`, `updated_at` = excluded.`updated_at`,
    `last_used_at` = excluded.`last_used_at`, `revoked_at` = excluded.`revoked_at`;
  UPDATE `oauth_authorizations` SET `integration_authorization_id` = NEW.`id` WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `oauth_authorizations_sync_integration_update`
AFTER UPDATE OF `user_id`, `access_mode`, `can_read`, `can_create`, `can_edit`, `can_comment`, `can_create_folders`,
  `updated_at`, `last_used_at`, `revoked_at` ON `oauth_authorizations`
BEGIN
  UPDATE `integration_authorizations` SET
    `user_id` = NEW.`user_id`, `access_mode` = NEW.`access_mode`, `can_read` = NEW.`can_read`,
    `can_create` = NEW.`can_create`, `can_edit` = NEW.`can_edit`, `can_comment` = NEW.`can_comment`,
    `can_create_folders` = NEW.`can_create_folders`, `updated_at` = NEW.`updated_at`,
    `last_used_at` = NEW.`last_used_at`, `revoked_at` = NEW.`revoked_at`
  WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `oauth_authorizations_sync_integration_delete`
AFTER DELETE ON `oauth_authorizations`
BEGIN
  DELETE FROM `integration_authorizations` WHERE `id` = OLD.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `oauth_rules_sync_insert`
AFTER INSERT ON `oauth_authorization_folder_permissions`
BEGIN
  INSERT INTO `authorization_folder_rules` (
    `id`, `authorization_id`, `user_id`, `folder_id`, `applies_to`, `can_read`, `can_create`, `can_edit`,
    `can_comment`, `can_create_folders`, `created_at`, `updated_at`
  ) SELECT 'rule_oauth_' || NEW.`id`, NEW.`authorization_id`, authorization.`user_id`, NEW.`folder_id`, NEW.`applies_to`,
           NEW.`can_read`, NEW.`can_create`, NEW.`can_edit`, NEW.`can_comment`, NEW.`can_create`, NEW.`created_at`, NEW.`updated_at`
    FROM `oauth_authorizations` authorization WHERE authorization.`id` = NEW.`authorization_id`
  ON CONFLICT(`authorization_id`, `folder_id`) DO UPDATE SET
    `applies_to` = excluded.`applies_to`, `can_read` = excluded.`can_read`, `can_create` = excluded.`can_create`,
    `can_edit` = excluded.`can_edit`, `can_comment` = excluded.`can_comment`,
    `can_create_folders` = excluded.`can_create_folders`, `updated_at` = excluded.`updated_at`;
END;
--> statement-breakpoint
CREATE TRIGGER `oauth_rules_sync_update`
AFTER UPDATE ON `oauth_authorization_folder_permissions`
BEGIN
  UPDATE `authorization_folder_rules` SET
    `folder_id` = NEW.`folder_id`, `applies_to` = NEW.`applies_to`, `can_read` = NEW.`can_read`,
    `can_create` = NEW.`can_create`, `can_edit` = NEW.`can_edit`, `can_comment` = NEW.`can_comment`,
    `can_create_folders` = NEW.`can_create`, `updated_at` = NEW.`updated_at`
  WHERE `authorization_id` = NEW.`authorization_id` AND `folder_id` = OLD.`folder_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `oauth_rules_sync_delete`
AFTER DELETE ON `oauth_authorization_folder_permissions`
BEGIN
  DELETE FROM `authorization_folder_rules`
  WHERE `authorization_id` = OLD.`authorization_id` AND `folder_id` = OLD.`folder_id`;
END;
