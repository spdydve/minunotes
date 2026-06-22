ALTER TABLE `oauth_clients` ADD `user_id` text REFERENCES `user`(`id`) ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX `oauth_clients_user_id_idx` ON `oauth_clients` (`user_id`);
