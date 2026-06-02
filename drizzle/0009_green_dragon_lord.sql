ALTER TABLE `attachments` ADD `referenced_at` integer;--> statement-breakpoint
ALTER TABLE `attachments` ADD `unreferenced_at` integer;--> statement-breakpoint
ALTER TABLE `attachments` ADD `deleted_at` integer;