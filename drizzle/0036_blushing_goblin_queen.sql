CREATE TEMP TABLE `__tenant_integrity_preflight` (
	`relation_name` text NOT NULL,
	`violation_count` integer NOT NULL,
	CONSTRAINT `tenant_integrity_preflight_zero` CHECK (`violation_count` = 0)
);--> statement-breakpoint
INSERT INTO `__tenant_integrity_preflight` (`relation_name`, `violation_count`)
SELECT 'notes.folder_owner', count(*) FROM `notes` child LEFT JOIN `folders` parent ON parent.`id` = child.`folder_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'template_folder_assignments.template_owner', count(*) FROM `template_folder_assignments` child LEFT JOIN `notes` parent ON parent.`id` = child.`template_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'template_folder_assignments.folder_owner', count(*) FROM `template_folder_assignments` child LEFT JOIN `folders` parent ON parent.`id` = child.`folder_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'note_events.note_owner', count(*) FROM `note_events` child LEFT JOIN `notes` parent ON parent.`id` = child.`note_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'note_versions.note_owner', count(*) FROM `note_versions` child LEFT JOIN `notes` parent ON parent.`id` = child.`note_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'note_versions.folder_owner', count(*) FROM `note_versions` child LEFT JOIN `folders` parent ON parent.`id` = child.`folder_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'note_comment_threads.note_owner', count(*) FROM `note_comment_threads` child LEFT JOIN `notes` parent ON parent.`id` = child.`note_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'note_comment_messages.thread_owner', count(*) FROM `note_comment_messages` child LEFT JOIN `note_comment_threads` parent ON parent.`id` = child.`thread_id` AND parent.`note_id` = child.`note_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'note_comment_reactions.message_owner', count(*) FROM `note_comment_message_reactions` child LEFT JOIN `note_comment_messages` parent ON parent.`id` = child.`message_id` AND parent.`thread_id` = child.`thread_id` AND parent.`note_id` = child.`note_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'note_share_links.note_owner', count(*) FROM `note_share_links` child LEFT JOIN `notes` parent ON parent.`id` = child.`note_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'folder_share_links.folder_owner', count(*) FROM `folder_share_links` child LEFT JOIN `folders` parent ON parent.`id` = child.`folder_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'note_tags.note_owner', count(*) FROM `note_tags` child LEFT JOIN `notes` parent ON parent.`id` = child.`note_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'note_tags.tag_owner', count(*) FROM `note_tags` child LEFT JOIN `tags` parent ON parent.`id` = child.`tag_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'note_links.source_owner', count(*) FROM `note_links` child LEFT JOIN `notes` parent ON parent.`id` = child.`source_note_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'note_links.target_owner', count(*) FROM `note_links` child LEFT JOIN `notes` parent ON parent.`id` = child.`target_note_id` AND parent.`user_id` = child.`user_id` WHERE child.`target_note_id` IS NOT NULL AND parent.`id` IS NULL
UNION ALL SELECT 'attachments.note_owner', count(*) FROM `attachments` child LEFT JOIN `notes` parent ON parent.`id` = child.`note_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL
UNION ALL SELECT 'attachments.folder_owner', count(*) FROM `attachments` child LEFT JOIN `folders` parent ON parent.`id` = child.`folder_id` AND parent.`user_id` = child.`user_id` WHERE parent.`id` IS NULL;--> statement-breakpoint
DROP TABLE `__tenant_integrity_preflight`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_note_comment_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`body` text NOT NULL,
	`is_root` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `note_comment_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`,`user_id`) REFERENCES `notes`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`,`note_id`,`user_id`) REFERENCES `note_comment_threads`(`id`,`note_id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_note_comment_messages`("id", "thread_id", "note_id", "user_id", "actor_type", "actor_id", "body", "is_root", "created_at", "updated_at") SELECT "id", "thread_id", "note_id", "user_id", "actor_type", "actor_id", "body", "is_root", "created_at", "updated_at" FROM `note_comment_messages`;--> statement-breakpoint
DROP TABLE `note_comment_messages`;--> statement-breakpoint
ALTER TABLE `__new_note_comment_messages` RENAME TO `note_comment_messages`;--> statement-breakpoint
CREATE INDEX `note_comment_messages_thread_created_at_idx` ON `note_comment_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `note_comment_messages_user_note_idx` ON `note_comment_messages` (`user_id`,`note_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `note_comment_messages_id_thread_note_user_idx` ON `note_comment_messages` (`id`,`thread_id`,`note_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `__new_note_comment_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`anchor_type` text NOT NULL,
	`anchor_from` integer NOT NULL,
	`anchor_to` integer NOT NULL,
	`quote` text NOT NULL,
	`prefix` text,
	`suffix` text,
	`document_hash` text NOT NULL,
	`detached` integer DEFAULT false NOT NULL,
	`created_by_actor_type` text NOT NULL,
	`created_by_actor_id` text,
	`resolved_by_actor_type` text,
	`resolved_by_actor_id` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`,`user_id`) REFERENCES `notes`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_note_comment_threads`("id", "note_id", "user_id", "status", "anchor_type", "anchor_from", "anchor_to", "quote", "prefix", "suffix", "document_hash", "detached", "created_by_actor_type", "created_by_actor_id", "resolved_by_actor_type", "resolved_by_actor_id", "resolved_at", "created_at", "updated_at") SELECT "id", "note_id", "user_id", "status", "anchor_type", "anchor_from", "anchor_to", "quote", "prefix", "suffix", "document_hash", "detached", "created_by_actor_type", "created_by_actor_id", "resolved_by_actor_type", "resolved_by_actor_id", "resolved_at", "created_at", "updated_at" FROM `note_comment_threads`;--> statement-breakpoint
DROP TABLE `note_comment_threads`;--> statement-breakpoint
ALTER TABLE `__new_note_comment_threads` RENAME TO `note_comment_threads`;--> statement-breakpoint
CREATE INDEX `note_comment_threads_user_note_updated_at_idx` ON `note_comment_threads` (`user_id`,`note_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `note_comment_threads_note_status_idx` ON `note_comment_threads` (`note_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `note_comment_threads_id_note_user_idx` ON `note_comment_threads` (`id`,`note_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_id_user_id_idx` ON `tags` (`id`,`user_id`);--> statement-breakpoint
CREATE TABLE `__new_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`note_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`provider` text DEFAULT 'filesystem' NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`content_hash` text NOT NULL,
	`storage_key` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`referenced_at` integer,
	`unreferenced_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`,`user_id`) REFERENCES `notes`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`,`user_id`) REFERENCES `folders`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_attachments`("id", "user_id", "note_id", "folder_id", "provider", "filename", "mime_type", "size", "content_hash", "storage_key", "status", "referenced_at", "unreferenced_at", "deleted_at", "created_at", "updated_at") SELECT "id", "user_id", "note_id", "folder_id", "provider", "filename", "mime_type", "size", "content_hash", "storage_key", "status", "referenced_at", "unreferenced_at", "deleted_at", "created_at", "updated_at" FROM `attachments`;--> statement-breakpoint
DROP TABLE `attachments`;--> statement-breakpoint
ALTER TABLE `__new_attachments` RENAME TO `attachments`;--> statement-breakpoint
CREATE INDEX `attachments_user_id_idx` ON `attachments` (`user_id`);--> statement-breakpoint
CREATE INDEX `attachments_note_id_idx` ON `attachments` (`note_id`);--> statement-breakpoint
CREATE INDEX `attachments_folder_id_idx` ON `attachments` (`folder_id`);--> statement-breakpoint
CREATE TABLE `__new_folder_share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`token` text,
	`permission` text DEFAULT 'read' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`,`user_id`) REFERENCES `folders`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_folder_share_links`("id", "user_id", "folder_id", "token_hash", "token", "permission", "created_at", "updated_at", "expires_at", "revoked_at") SELECT "id", "user_id", "folder_id", "token_hash", "token", "permission", "created_at", "updated_at", "expires_at", "revoked_at" FROM `folder_share_links`;--> statement-breakpoint
DROP TABLE `folder_share_links`;--> statement-breakpoint
ALTER TABLE `__new_folder_share_links` RENAME TO `folder_share_links`;--> statement-breakpoint
CREATE UNIQUE INDEX `folder_share_links_token_hash_idx` ON `folder_share_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `folder_share_links_folder_id_idx` ON `folder_share_links` (`folder_id`);--> statement-breakpoint
CREATE INDEX `folder_share_links_user_id_idx` ON `folder_share_links` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_note_comment_message_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`emoji` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `note_comment_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `note_comment_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`,`user_id`) REFERENCES `notes`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`,`note_id`,`user_id`) REFERENCES `note_comment_threads`(`id`,`note_id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`,`thread_id`,`note_id`,`user_id`) REFERENCES `note_comment_messages`(`id`,`thread_id`,`note_id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_note_comment_message_reactions`("id", "message_id", "thread_id", "note_id", "user_id", "actor_type", "actor_id", "emoji", "created_at") SELECT "id", "message_id", "thread_id", "note_id", "user_id", "actor_type", "actor_id", "emoji", "created_at" FROM `note_comment_message_reactions`;--> statement-breakpoint
DROP TABLE `note_comment_message_reactions`;--> statement-breakpoint
ALTER TABLE `__new_note_comment_message_reactions` RENAME TO `note_comment_message_reactions`;--> statement-breakpoint
CREATE UNIQUE INDEX `note_comment_reactions_message_actor_emoji_idx` ON `note_comment_message_reactions` (`message_id`,`actor_type`,`actor_id`,`emoji`);--> statement-breakpoint
CREATE INDEX `note_comment_reactions_thread_idx` ON `note_comment_message_reactions` (`thread_id`);--> statement-breakpoint
CREATE INDEX `note_comment_reactions_user_note_idx` ON `note_comment_message_reactions` (`user_id`,`note_id`);--> statement-breakpoint
CREATE TABLE `__new_note_events` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`before_hash` text,
	`after_hash` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`,`user_id`) REFERENCES `notes`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_note_events`("id", "note_id", "user_id", "actor_type", "actor_id", "event_type", "summary", "before_hash", "after_hash", "created_at") SELECT "id", "note_id", "user_id", "actor_type", "actor_id", "event_type", "summary", "before_hash", "after_hash", "created_at" FROM `note_events`;--> statement-breakpoint
DROP TABLE `note_events`;--> statement-breakpoint
ALTER TABLE `__new_note_events` RENAME TO `note_events`;--> statement-breakpoint
CREATE INDEX `note_events_note_id_idx` ON `note_events` (`note_id`);--> statement-breakpoint
CREATE INDEX `note_events_user_id_idx` ON `note_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `note_events_created_at_idx` ON `note_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_note_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_note_id` text NOT NULL,
	`target_note_id` text,
	`target_title` text NOT NULL,
	`label` text,
	`link_type` text DEFAULT 'wikilink' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_note_id`,`user_id`) REFERENCES `notes`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_note_id`,`user_id`) REFERENCES `notes`(`id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_note_links`("id", "user_id", "source_note_id", "target_note_id", "target_title", "label", "link_type", "created_at", "updated_at") SELECT "id", "user_id", "source_note_id", "target_note_id", "target_title", "label", "link_type", "created_at", "updated_at" FROM `note_links`;--> statement-breakpoint
DROP TABLE `note_links`;--> statement-breakpoint
ALTER TABLE `__new_note_links` RENAME TO `note_links`;--> statement-breakpoint
CREATE INDEX `note_links_user_id_idx` ON `note_links` (`user_id`);--> statement-breakpoint
CREATE INDEX `note_links_source_note_id_idx` ON `note_links` (`source_note_id`);--> statement-breakpoint
CREATE INDEX `note_links_target_note_id_idx` ON `note_links` (`target_note_id`);--> statement-breakpoint
CREATE INDEX `note_links_user_target_title_idx` ON `note_links` (`user_id`,`target_title`);--> statement-breakpoint
CREATE TABLE `__new_note_share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`note_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`token` text,
	`permission` text DEFAULT 'read' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`,`user_id`) REFERENCES `notes`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_note_share_links`("id", "user_id", "note_id", "token_hash", "token", "permission", "created_at", "updated_at", "expires_at", "revoked_at") SELECT "id", "user_id", "note_id", "token_hash", "token", "permission", "created_at", "updated_at", "expires_at", "revoked_at" FROM `note_share_links`;--> statement-breakpoint
DROP TABLE `note_share_links`;--> statement-breakpoint
ALTER TABLE `__new_note_share_links` RENAME TO `note_share_links`;--> statement-breakpoint
CREATE UNIQUE INDEX `note_share_links_token_hash_idx` ON `note_share_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `note_share_links_note_id_idx` ON `note_share_links` (`note_id`);--> statement-breakpoint
CREATE INDEX `note_share_links_user_id_idx` ON `note_share_links` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_note_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`note_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`,`user_id`) REFERENCES `notes`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`,`user_id`) REFERENCES `tags`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_note_tags`("id", "user_id", "note_id", "tag_id", "created_at") SELECT "id", "user_id", "note_id", "tag_id", "created_at" FROM `note_tags`;--> statement-breakpoint
DROP TABLE `note_tags`;--> statement-breakpoint
ALTER TABLE `__new_note_tags` RENAME TO `note_tags`;--> statement-breakpoint
CREATE INDEX `note_tags_user_id_idx` ON `note_tags` (`user_id`);--> statement-breakpoint
CREATE INDEX `note_tags_note_id_idx` ON `note_tags` (`note_id`);--> statement-breakpoint
CREATE INDEX `note_tags_tag_id_idx` ON `note_tags` (`tag_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `note_tags_note_tag_idx` ON `note_tags` (`note_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `__new_note_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`note_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`document_type` text DEFAULT 'markdown' NOT NULL,
	`folder_id` text NOT NULL,
	`created_at_value` integer NOT NULL,
	`is_api_editable` integer DEFAULT true NOT NULL,
	`state_hash` text NOT NULL,
	`reason` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`,`user_id`) REFERENCES `notes`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`,`user_id`) REFERENCES `folders`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_note_versions`("id", "user_id", "note_id", "title", "content", "document_type", "folder_id", "created_at_value", "is_api_editable", "state_hash", "reason", "actor_type", "actor_id", "created_at") SELECT "id", "user_id", "note_id", "title", "content", "document_type", "folder_id", "created_at_value", "is_api_editable", "state_hash", "reason", "actor_type", "actor_id", "created_at" FROM `note_versions`;--> statement-breakpoint
DROP TABLE `note_versions`;--> statement-breakpoint
ALTER TABLE `__new_note_versions` RENAME TO `note_versions`;--> statement-breakpoint
CREATE INDEX `note_versions_user_note_created_at_idx` ON `note_versions` (`user_id`,`note_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `note_versions_note_created_at_idx` ON `note_versions` (`note_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `note_versions_note_state_hash_idx` ON `note_versions` (`note_id`,`state_hash`);--> statement-breakpoint
CREATE TABLE `__new_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT 'Untitled note' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`document_type` text DEFAULT 'markdown' NOT NULL,
	`type` text DEFAULT 'note' NOT NULL,
	`is_api_editable` integer DEFAULT true NOT NULL,
	`updated_by_actor_type` text,
	`updated_by_actor_id` text,
	`deleted_at` integer,
	`trash_batch_id` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`,`user_id`) REFERENCES `folders`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_notes`("id", "folder_id", "user_id", "title", "content", "document_type", "type", "is_api_editable", "updated_by_actor_type", "updated_by_actor_id", "deleted_at", "trash_batch_id", "created_at", "updated_at") SELECT "id", "folder_id", "user_id", "title", "content", "document_type", "type", "is_api_editable", "updated_by_actor_type", "updated_by_actor_id", "deleted_at", "trash_batch_id", "created_at", "updated_at" FROM `notes`;--> statement-breakpoint
DROP TABLE `notes`;--> statement-breakpoint
ALTER TABLE `__new_notes` RENAME TO `notes`;--> statement-breakpoint
CREATE INDEX `notes_user_id_idx` ON `notes` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notes_id_user_id_idx` ON `notes` (`id`,`user_id`);--> statement-breakpoint
CREATE INDEX `notes_folder_id_idx` ON `notes` (`folder_id`);--> statement-breakpoint
CREATE INDEX `notes_type_idx` ON `notes` (`type`);--> statement-breakpoint
CREATE INDEX `notes_document_type_idx` ON `notes` (`document_type`);--> statement-breakpoint
CREATE INDEX `notes_user_deleted_at_idx` ON `notes` (`user_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `notes_trash_batch_id_idx` ON `notes` (`trash_batch_id`);--> statement-breakpoint
CREATE TABLE `__new_template_folder_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`,`user_id`) REFERENCES `notes`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`,`user_id`) REFERENCES `folders`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_template_folder_assignments`("id", "template_id", "folder_id", "user_id", "created_at") SELECT "id", "template_id", "folder_id", "user_id", "created_at" FROM `template_folder_assignments`;--> statement-breakpoint
DROP TABLE `template_folder_assignments`;--> statement-breakpoint
ALTER TABLE `__new_template_folder_assignments` RENAME TO `template_folder_assignments`;--> statement-breakpoint
CREATE INDEX `template_folder_assignments_template_id_idx` ON `template_folder_assignments` (`template_id`);--> statement-breakpoint
CREATE INDEX `template_folder_assignments_folder_id_idx` ON `template_folder_assignments` (`folder_id`);--> statement-breakpoint
CREATE INDEX `template_folder_assignments_user_id_idx` ON `template_folder_assignments` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;