ALTER TABLE `notes` ADD `type` text DEFAULT 'note' NOT NULL;--> statement-breakpoint
CREATE INDEX `notes_type_idx` ON `notes` (`type`);