ALTER TABLE `folders` ADD `purge_after` integer;--> statement-breakpoint
UPDATE `folders` SET `purge_after` = unixepoch() + 2592000 WHERE `deleted_at` IS NOT NULL AND `purge_after` IS NULL;--> statement-breakpoint
CREATE INDEX `folders_purge_after_idx` ON `folders` (`purge_after`);--> statement-breakpoint
ALTER TABLE `notes` ADD `purge_after` integer;--> statement-breakpoint
UPDATE `notes` SET `purge_after` = unixepoch() + 2592000 WHERE `deleted_at` IS NOT NULL AND `purge_after` IS NULL;--> statement-breakpoint
CREATE INDEX `notes_purge_after_idx` ON `notes` (`purge_after`);