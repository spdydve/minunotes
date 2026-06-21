CREATE TABLE `oauth_clients` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `redirect_uris` text NOT NULL,
  `client_type` text DEFAULT 'public' NOT NULL,
  `client_secret_hash` text,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `oauth_authorizations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `client_id` text NOT NULL,
  `scope` text NOT NULL DEFAULT '',
  `access_mode` text DEFAULT 'specific' NOT NULL,
  `can_read` integer DEFAULT true NOT NULL,
  `can_create` integer DEFAULT false NOT NULL,
  `can_edit` integer DEFAULT false NOT NULL,
  `can_create_folders` integer DEFAULT false NOT NULL,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `revoked_at` integer,
  `last_used_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_authorization_folder_permissions` (
  `id` text PRIMARY KEY NOT NULL,
  `authorization_id` text NOT NULL,
  `folder_id` text NOT NULL,
  `can_read` integer DEFAULT false NOT NULL,
  `can_create` integer DEFAULT false NOT NULL,
  `can_edit` integer DEFAULT false NOT NULL,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`authorization_id`) REFERENCES `oauth_authorizations`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_authorization_codes` (
  `id` text PRIMARY KEY NOT NULL,
  `code_hash` text NOT NULL,
  `client_id` text NOT NULL,
  `user_id` text NOT NULL,
  `redirect_uri` text NOT NULL,
  `scope` text NOT NULL DEFAULT '',
  `code_challenge` text NOT NULL,
  `code_challenge_method` text NOT NULL,
  `authorization_id` text NOT NULL,
  `expires_at` integer NOT NULL,
  `used_at` integer,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`authorization_id`) REFERENCES `oauth_authorizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `authorization_id` text NOT NULL,
  `access_token_hash` text NOT NULL,
  `refresh_token_hash` text NOT NULL,
  `scope` text NOT NULL DEFAULT '',
  `access_token_expires_at` integer NOT NULL,
  `refresh_token_expires_at` integer NOT NULL,
  `revoked_at` integer,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`authorization_id`) REFERENCES `oauth_authorizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_authorizations_user_id_idx` ON `oauth_authorizations` (`user_id`);
--> statement-breakpoint
CREATE INDEX `oauth_authorizations_client_id_idx` ON `oauth_authorizations` (`client_id`);
--> statement-breakpoint
CREATE INDEX `oauth_authorization_folder_permissions_authorization_id_idx` ON `oauth_authorization_folder_permissions` (`authorization_id`);
--> statement-breakpoint
CREATE INDEX `oauth_authorization_folder_permissions_folder_id_idx` ON `oauth_authorization_folder_permissions` (`folder_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_authorization_codes_code_hash_idx` ON `oauth_authorization_codes` (`code_hash`);
--> statement-breakpoint
CREATE INDEX `oauth_authorization_codes_authorization_id_idx` ON `oauth_authorization_codes` (`authorization_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_tokens_access_token_hash_idx` ON `oauth_tokens` (`access_token_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_tokens_refresh_token_hash_idx` ON `oauth_tokens` (`refresh_token_hash`);
--> statement-breakpoint
CREATE INDEX `oauth_tokens_authorization_id_idx` ON `oauth_tokens` (`authorization_id`);
