CREATE TABLE `authorization_collaboration_scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`authorization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`collaboration_grant_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`authorization_id`,`user_id`) REFERENCES `integration_authorizations`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collaboration_grant_id`,`user_id`) REFERENCES `collaboration_grants`(`id`,`grantee_user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authorization_collaboration_scopes_authorization_grant_idx` ON `authorization_collaboration_scopes` (`authorization_id`,`collaboration_grant_id`);--> statement-breakpoint
CREATE INDEX `authorization_collaboration_scopes_authorization_idx` ON `authorization_collaboration_scopes` (`authorization_id`);--> statement-breakpoint
CREATE INDEX `authorization_collaboration_scopes_grant_idx` ON `authorization_collaboration_scopes` (`collaboration_grant_id`);--> statement-breakpoint
CREATE INDEX `authorization_collaboration_scopes_user_idx` ON `authorization_collaboration_scopes` (`user_id`);--> statement-breakpoint
CREATE TABLE `collaboration_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`grantee_user_id` text NOT NULL,
	`note_id` text,
	`folder_id` text,
	`role` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grantee_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`,`owner_user_id`) REFERENCES `notes`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`,`owner_user_id`) REFERENCES `folders`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "collaboration_grants_one_resource_check" CHECK(("collaboration_grants"."note_id" is not null and "collaboration_grants"."folder_id" is null) or ("collaboration_grants"."note_id" is null and "collaboration_grants"."folder_id" is not null)),
	CONSTRAINT "collaboration_grants_role_check" CHECK("collaboration_grants"."role" in ('viewer', 'commenter', 'editor')),
	CONSTRAINT "collaboration_grants_not_self_check" CHECK("collaboration_grants"."owner_user_id" <> "collaboration_grants"."grantee_user_id"),
	CONSTRAINT "collaboration_grants_creator_owner_check" CHECK("collaboration_grants"."created_by_user_id" = "collaboration_grants"."owner_user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collaboration_grants_note_grantee_idx` ON `collaboration_grants` (`note_id`,`grantee_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `collaboration_grants_folder_grantee_idx` ON `collaboration_grants` (`folder_id`,`grantee_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `collaboration_grants_id_grantee_idx` ON `collaboration_grants` (`id`,`grantee_user_id`);--> statement-breakpoint
CREATE INDEX `collaboration_grants_owner_idx` ON `collaboration_grants` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `collaboration_grants_grantee_idx` ON `collaboration_grants` (`grantee_user_id`);--> statement-breakpoint
CREATE INDEX `collaboration_grants_note_idx` ON `collaboration_grants` (`note_id`);--> statement-breakpoint
CREATE INDEX `collaboration_grants_folder_idx` ON `collaboration_grants` (`folder_id`);--> statement-breakpoint
CREATE TABLE `collaboration_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`invited_email_key` text NOT NULL,
	`note_id` text,
	`folder_id` text,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_by_user_id` text,
	`revoked_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`note_id`,`owner_user_id`) REFERENCES `notes`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`,`owner_user_id`) REFERENCES `folders`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "collaboration_invitations_one_resource_check" CHECK(("collaboration_invitations"."note_id" is not null and "collaboration_invitations"."folder_id" is null) or ("collaboration_invitations"."note_id" is null and "collaboration_invitations"."folder_id" is not null)),
	CONSTRAINT "collaboration_invitations_role_check" CHECK("collaboration_invitations"."role" in ('viewer', 'commenter', 'editor')),
	CONSTRAINT "collaboration_invitations_inviter_owner_check" CHECK("collaboration_invitations"."invited_by_user_id" = "collaboration_invitations"."owner_user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collaboration_invitations_token_hash_unique` ON `collaboration_invitations` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `collaboration_invitations_note_email_idx` ON `collaboration_invitations` (`note_id`,`invited_email_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `collaboration_invitations_folder_email_idx` ON `collaboration_invitations` (`folder_id`,`invited_email_key`);--> statement-breakpoint
CREATE INDEX `collaboration_invitations_owner_idx` ON `collaboration_invitations` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `collaboration_invitations_email_idx` ON `collaboration_invitations` (`invited_email_key`);--> statement-breakpoint
CREATE INDEX `collaboration_invitations_note_idx` ON `collaboration_invitations` (`note_id`);--> statement-breakpoint
CREATE INDEX `collaboration_invitations_folder_idx` ON `collaboration_invitations` (`folder_id`);--> statement-breakpoint
CREATE INDEX `collaboration_invitations_expires_at_idx` ON `collaboration_invitations` (`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_integration_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`access_mode` text DEFAULT 'all' NOT NULL,
	`can_read` integer DEFAULT true NOT NULL,
	`can_create` integer DEFAULT false NOT NULL,
	`can_edit` integer DEFAULT false NOT NULL,
	`can_comment` integer DEFAULT false NOT NULL,
	`can_create_folders` integer DEFAULT false NOT NULL,
	`shared_access_mode` text DEFAULT 'none' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "integration_authorizations_access_mode_check" CHECK("__new_integration_authorizations"."access_mode" in ('all', 'top_level', 'specific')),
	CONSTRAINT "integration_authorizations_can_read_check" CHECK("__new_integration_authorizations"."can_read" in (0, 1)),
	CONSTRAINT "integration_authorizations_can_create_check" CHECK("__new_integration_authorizations"."can_create" in (0, 1)),
	CONSTRAINT "integration_authorizations_can_edit_check" CHECK("__new_integration_authorizations"."can_edit" in (0, 1)),
	CONSTRAINT "integration_authorizations_can_comment_check" CHECK("__new_integration_authorizations"."can_comment" in (0, 1)),
	CONSTRAINT "integration_authorizations_can_create_folders_check" CHECK("__new_integration_authorizations"."can_create_folders" in (0, 1)),
	CONSTRAINT "integration_authorizations_shared_access_mode_check" CHECK("__new_integration_authorizations"."shared_access_mode" in ('none', 'specific', 'all')),
	CONSTRAINT "integration_authorizations_comment_requires_read_check" CHECK("__new_integration_authorizations"."can_comment" = 0 or "__new_integration_authorizations"."can_read" = 1)
);
--> statement-breakpoint
INSERT INTO `__new_integration_authorizations`("id", "user_id", "access_mode", "can_read", "can_create", "can_edit", "can_comment", "can_create_folders", "shared_access_mode", "created_at", "updated_at", "last_used_at", "revoked_at") SELECT "id", "user_id", "access_mode", "can_read", "can_create", "can_edit", "can_comment", "can_create_folders", 'none', "created_at", "updated_at", "last_used_at", "revoked_at" FROM `integration_authorizations`;--> statement-breakpoint
DROP TABLE `integration_authorizations`;--> statement-breakpoint
ALTER TABLE `__new_integration_authorizations` RENAME TO `integration_authorizations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `integration_authorizations_user_id_idx` ON `integration_authorizations` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `integration_authorizations_id_user_id_idx` ON `integration_authorizations` (`id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notes_id_user_id_idx` ON `notes` (`id`,`user_id`);