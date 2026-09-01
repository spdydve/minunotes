CREATE TABLE `note_search_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`note_id` text NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_search_documents_note_id_idx` ON `note_search_documents` (`note_id`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `note_search_fts` USING fts5(
	`title`,
	`body`,
	content='',
	contentless_delete=1,
	tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
INSERT INTO `note_search_documents` (`note_id`)
SELECT `id` FROM `notes` ORDER BY `id`;
--> statement-breakpoint
INSERT INTO `note_search_fts` (`rowid`, `title`, `body`)
SELECT
	search_document.`id`,
	note.`title`,
	CASE
		WHEN note.`document_type` = 'markdown' THEN note.`content`
		WHEN json_valid(note.`content`) THEN trim(
			coalesce((
				SELECT group_concat(trim(
					coalesce(cast(json_extract(node.value, '$.text') AS text), '') || ' ' ||
					coalesce(cast(json_extract(node.value, '$.label') AS text), '')
				), ' ')
				FROM json_each(note.`content`, '$.nodes') AS node
			), '') || ' ' ||
			coalesce((
				SELECT group_concat(trim(coalesce(cast(json_extract(edge.value, '$.label') AS text), '')), ' ')
				FROM json_each(note.`content`, '$.edges') AS edge
			), '')
		)
		ELSE ''
	END
FROM `notes` AS note
INNER JOIN `note_search_documents` AS search_document ON search_document.`note_id` = note.`id`;
--> statement-breakpoint
CREATE TRIGGER `notes_search_after_insert`
AFTER INSERT ON `notes`
BEGIN
	INSERT INTO `note_search_documents` (`note_id`) VALUES (NEW.`id`);
	INSERT INTO `note_search_fts` (`rowid`, `title`, `body`)
	SELECT
		search_document.`id`,
		NEW.`title`,
		CASE
			WHEN NEW.`document_type` = 'markdown' THEN NEW.`content`
			WHEN json_valid(NEW.`content`) THEN trim(
				coalesce((
					SELECT group_concat(trim(
						coalesce(cast(json_extract(node.value, '$.text') AS text), '') || ' ' ||
						coalesce(cast(json_extract(node.value, '$.label') AS text), '')
					), ' ')
					FROM json_each(NEW.`content`, '$.nodes') AS node
				), '') || ' ' ||
				coalesce((
					SELECT group_concat(trim(coalesce(cast(json_extract(edge.value, '$.label') AS text), '')), ' ')
					FROM json_each(NEW.`content`, '$.edges') AS edge
				), '')
			)
			ELSE ''
		END
	FROM `note_search_documents` AS search_document
	WHERE search_document.`note_id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `notes_search_after_update`
AFTER UPDATE OF `title`, `content`, `document_type` ON `notes`
BEGIN
	DELETE FROM `note_search_fts`
	WHERE `rowid` = (SELECT `id` FROM `note_search_documents` WHERE `note_id` = NEW.`id`);
	INSERT INTO `note_search_fts` (`rowid`, `title`, `body`)
	SELECT
		search_document.`id`,
		NEW.`title`,
		CASE
			WHEN NEW.`document_type` = 'markdown' THEN NEW.`content`
			WHEN json_valid(NEW.`content`) THEN trim(
				coalesce((
					SELECT group_concat(trim(
						coalesce(cast(json_extract(node.value, '$.text') AS text), '') || ' ' ||
						coalesce(cast(json_extract(node.value, '$.label') AS text), '')
					), ' ')
					FROM json_each(NEW.`content`, '$.nodes') AS node
				), '') || ' ' ||
				coalesce((
					SELECT group_concat(trim(coalesce(cast(json_extract(edge.value, '$.label') AS text), '')), ' ')
					FROM json_each(NEW.`content`, '$.edges') AS edge
				), '')
			)
			ELSE ''
		END
	FROM `note_search_documents` AS search_document
	WHERE search_document.`note_id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `notes_search_before_delete`
BEFORE DELETE ON `notes`
BEGIN
	DELETE FROM `note_search_fts`
	WHERE `rowid` = (SELECT `id` FROM `note_search_documents` WHERE `note_id` = OLD.`id`);
	DELETE FROM `note_search_documents` WHERE `note_id` = OLD.`id`;
END;