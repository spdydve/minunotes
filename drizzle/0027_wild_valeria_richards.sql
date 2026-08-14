CREATE TABLE `email_protection_client_reputation` (
	`client_key` text PRIMARY KEY NOT NULL,
	`violation_count` integer NOT NULL,
	`violation_window_started_at` integer NOT NULL,
	`banned_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_protection_client_reputation_banned_until_idx` ON `email_protection_client_reputation` (`banned_until`);--> statement-breakpoint
CREATE INDEX `email_protection_client_reputation_window_idx` ON `email_protection_client_reputation` (`violation_window_started_at`);--> statement-breakpoint
CREATE TABLE `email_protection_rate_limits` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`request_count` integer NOT NULL,
	`window_started_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_protection_rate_limits_expires_at_idx` ON `email_protection_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `email_protection_verdicts` (
	`email_key` text PRIMARY KEY NOT NULL,
	`verdict` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_protection_verdicts_expires_at_idx` ON `email_protection_verdicts` (`expires_at`);