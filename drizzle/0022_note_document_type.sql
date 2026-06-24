ALTER TABLE `notes` ADD `document_type` text NOT NULL DEFAULT 'markdown';
--> statement-breakpoint
CREATE INDEX `notes_document_type_idx` ON `notes` (`document_type`);
--> statement-breakpoint
ALTER TABLE `note_versions` ADD `document_type` text NOT NULL DEFAULT 'markdown';
