UPDATE `oauth_authorizations`
SET `scope` = trim(
  CASE WHEN `can_read` = 1 THEN 'notes.read ' ELSE '' END ||
  CASE WHEN `can_create` = 1 THEN 'notes.create ' ELSE '' END ||
  CASE WHEN `can_edit` = 1 THEN 'notes.edit ' ELSE '' END ||
  CASE WHEN `can_comment` = 1 AND `can_read` = 1 THEN 'comments.write ' ELSE '' END ||
  CASE WHEN `can_create_folders` = 1 THEN 'folders.create' ELSE '' END
);
--> statement-breakpoint
UPDATE `oauth_authorization_codes`
SET `scope` = COALESCE(
  (SELECT `scope`
   FROM `oauth_authorizations`
   WHERE `oauth_authorizations`.`id` = `oauth_authorization_codes`.`authorization_id`),
  ''
);
--> statement-breakpoint
UPDATE `oauth_tokens`
SET `scope` = COALESCE(
  (SELECT `scope`
   FROM `oauth_authorizations`
   WHERE `oauth_authorizations`.`id` = `oauth_tokens`.`authorization_id`),
  ''
);
