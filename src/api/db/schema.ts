import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [index("session_user_id_idx").on(table.userId)]);

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("account_user_id_idx").on(table.userId)]);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  parentFolderId: text("parent_folder_id"),
  title: text("title").notNull(),
  isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(false),
  isAgentReadOnly: integer("is_agent_read_only", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("folders_user_id_idx").on(table.userId), index("folders_parent_folder_id_idx").on(table.parentFolderId)]);

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  uid: text("uid").notNull().unique(),
  hash: text("hash").notNull(),
  salt: text("salt").notNull(),
  canCreateFolders: integer("can_create_folders", { mode: "boolean" }).notNull().default(false),
  canRead: integer("can_read", { mode: "boolean" }).notNull().default(true),
  canCreate: integer("can_create", { mode: "boolean" }).notNull().default(true),
  canEdit: integer("can_edit", { mode: "boolean" }).notNull().default(true),
  accessMode: text("access_mode", { enum: ["all", "top_level", "specific"] }).notNull().default("all"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
}, (table) => [index("api_keys_user_id_idx").on(table.userId)]);

export const apiKeyFolderPermissions = sqliteTable("api_key_folder_permissions", {
  id: text("id").primaryKey(),
  apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
  folderId: text("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
  canRead: integer("can_read", { mode: "boolean" }).notNull().default(false),
  canCreate: integer("can_create", { mode: "boolean" }).notNull().default(false),
  canEdit: integer("can_edit", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("api_key_folder_permissions_api_key_id_idx").on(table.apiKeyId), index("api_key_folder_permissions_folder_id_idx").on(table.folderId)]);

export const oauthClients = sqliteTable("oauth_clients", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  redirectUris: text("redirect_uris").notNull(),
  clientType: text("client_type", { enum: ["public", "confidential"] }).notNull().default("public"),
  clientSecretHash: text("client_secret_hash"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
}, (table) => [index("oauth_clients_user_id_idx").on(table.userId)]);

export const oauthAuthorizations = sqliteTable("oauth_authorizations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => oauthClients.id, { onDelete: "cascade" }),
  scope: text("scope").notNull().default(""),
  accessMode: text("access_mode", { enum: ["all", "top_level", "specific"] }).notNull().default("specific"),
  canRead: integer("can_read", { mode: "boolean" }).notNull().default(true),
  canCreate: integer("can_create", { mode: "boolean" }).notNull().default(false),
  canEdit: integer("can_edit", { mode: "boolean" }).notNull().default(false),
  canCreateFolders: integer("can_create_folders", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
}, (table) => [index("oauth_authorizations_user_id_idx").on(table.userId), index("oauth_authorizations_client_id_idx").on(table.clientId)]);

export const oauthAuthorizationFolderPermissions = sqliteTable("oauth_authorization_folder_permissions", {
  id: text("id").primaryKey(),
  authorizationId: text("authorization_id").notNull().references(() => oauthAuthorizations.id, { onDelete: "cascade" }),
  folderId: text("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
  canRead: integer("can_read", { mode: "boolean" }).notNull().default(false),
  canCreate: integer("can_create", { mode: "boolean" }).notNull().default(false),
  canEdit: integer("can_edit", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("oauth_authorization_folder_permissions_authorization_id_idx").on(table.authorizationId), index("oauth_authorization_folder_permissions_folder_id_idx").on(table.folderId)]);

export const oauthAuthorizationCodes = sqliteTable("oauth_authorization_codes", {
  id: text("id").primaryKey(),
  codeHash: text("code_hash").notNull(),
  clientId: text("client_id").notNull().references(() => oauthClients.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  scope: text("scope").notNull().default(""),
  codeChallenge: text("code_challenge").notNull(),
  codeChallengeMethod: text("code_challenge_method").notNull(),
  authorizationId: text("authorization_id").notNull().references(() => oauthAuthorizations.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("oauth_authorization_codes_code_hash_idx").on(table.codeHash), index("oauth_authorization_codes_authorization_id_idx").on(table.authorizationId)]);

export const oauthTokens = sqliteTable("oauth_tokens", {
  id: text("id").primaryKey(),
  authorizationId: text("authorization_id").notNull().references(() => oauthAuthorizations.id, { onDelete: "cascade" }),
  accessTokenHash: text("access_token_hash").notNull(),
  refreshTokenHash: text("refresh_token_hash").notNull(),
  scope: text("scope").notNull().default(""),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }).notNull(),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("oauth_tokens_access_token_hash_idx").on(table.accessTokenHash), uniqueIndex("oauth_tokens_refresh_token_hash_idx").on(table.refreshTokenHash), index("oauth_tokens_authorization_id_idx").on(table.authorizationId)]);

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  folderId: text("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled note"),
  content: text("content").notNull().default(""),
  documentType: text("document_type", { enum: ["markdown", "canvas.default", "canvas.mindmap"] }).notNull().default("markdown"),
  type: text("type", { enum: ["note", "template"] }).notNull().default("note"),
  isApiEditable: integer("is_api_editable", { mode: "boolean" }).notNull().default(true),
  updatedByActorType: text("updated_by_actor_type"),
  updatedByActorId: text("updated_by_actor_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("notes_user_id_idx").on(table.userId), index("notes_folder_id_idx").on(table.folderId), index("notes_type_idx").on(table.type), index("notes_document_type_idx").on(table.documentType)]);

export const templateFolderAssignments = sqliteTable("template_folder_assignments", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  folderId: text("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("template_folder_assignments_template_id_idx").on(table.templateId), index("template_folder_assignments_folder_id_idx").on(table.folderId), index("template_folder_assignments_user_id_idx").on(table.userId)]);

export const noteEvents = sqliteTable("note_events", {
  id: text("id").primaryKey(),
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  eventType: text("event_type").notNull(),
  summary: text("summary").notNull(),
  beforeHash: text("before_hash"),
  afterHash: text("after_hash"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("note_events_note_id_idx").on(table.noteId), index("note_events_user_id_idx").on(table.userId), index("note_events_created_at_idx").on(table.createdAt)]);

export const noteVersions = sqliteTable("note_versions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  documentType: text("document_type", { enum: ["markdown", "canvas.default", "canvas.mindmap"] }).notNull().default("markdown"),
  folderId: text("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
  createdAtValue: integer("created_at_value", { mode: "timestamp" }).notNull(),
  isApiEditable: integer("is_api_editable", { mode: "boolean" }).notNull().default(true),
  stateHash: text("state_hash").notNull(),
  reason: text("reason", { enum: ["create", "autosave_checkpoint", "before_agent_edit", "before_restore", "manual"] }).notNull(),
  actorType: text("actor_type", { enum: ["user", "agent", "system"] }).notNull(),
  actorId: text("actor_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("note_versions_user_note_created_at_idx").on(table.userId, table.noteId, table.createdAt),
  index("note_versions_note_created_at_idx").on(table.noteId, table.createdAt),
  index("note_versions_note_state_hash_idx").on(table.noteId, table.stateHash),
]);

export const noteShareLinks = sqliteTable("note_share_links", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  token: text("token"),
  permission: text("permission", { enum: ["read"] }).notNull().default("read"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
}, (table) => [
  uniqueIndex("note_share_links_token_hash_idx").on(table.tokenHash),
  index("note_share_links_note_id_idx").on(table.noteId),
  index("note_share_links_user_id_idx").on(table.userId),
]);

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("tags_user_id_idx").on(table.userId), uniqueIndex("tags_user_normalized_name_idx").on(table.userId, table.normalizedName)]);

export const noteTags = sqliteTable("note_tags", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  tagId: text("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("note_tags_user_id_idx").on(table.userId),
  index("note_tags_note_id_idx").on(table.noteId),
  index("note_tags_tag_id_idx").on(table.tagId),
  uniqueIndex("note_tags_note_tag_idx").on(table.noteId, table.tagId),
]);

export const noteLinks = sqliteTable("note_links", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sourceNoteId: text("source_note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  targetNoteId: text("target_note_id").references(() => notes.id, { onDelete: "set null" }),
  targetTitle: text("target_title").notNull(),
  label: text("label"),
  linkType: text("link_type", { enum: ["wikilink", "internal-url", "markdown-internal-url"] }).notNull().default("wikilink"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("note_links_user_id_idx").on(table.userId),
  index("note_links_source_note_id_idx").on(table.sourceNoteId),
  index("note_links_target_note_id_idx").on(table.targetNoteId),
  index("note_links_user_target_title_idx").on(table.userId, table.targetTitle),
]);

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  folderId: text("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("filesystem"),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  contentHash: text("content_hash").notNull(),
  storageKey: text("storage_key").notNull(),
  status: text("status").notNull().default("ready"),
  referencedAt: integer("referenced_at", { mode: "timestamp" }),
  unreferencedAt: integer("unreferenced_at", { mode: "timestamp" }),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("attachments_user_id_idx").on(table.userId), index("attachments_note_id_idx").on(table.noteId), index("attachments_folder_id_idx").on(table.folderId)]);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  folders: many(folders),
  notes: many(notes),
  noteEvents: many(noteEvents),
  noteVersions: many(noteVersions),
  noteShareLinks: many(noteShareLinks),
  noteLinks: many(noteLinks),
  tags: many(tags),
  noteTags: many(noteTags),
  attachments: many(attachments),
  templateFolderAssignments: many(templateFolderAssignments),
  apiKeys: many(apiKeys),
  oauthAuthorizations: many(oauthAuthorizations),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const folderRelations = relations(folders, ({ many, one }) => ({
  user: one(user, { fields: [folders.userId], references: [user.id] }),
  notes: many(notes),
  attachments: many(attachments),
  templateAssignments: many(templateFolderAssignments),
}));

export const apiKeyRelations = relations(apiKeys, ({ many, one }) => ({
  user: one(user, { fields: [apiKeys.userId], references: [user.id] }),
  folderPermissions: many(apiKeyFolderPermissions),
}));

export const apiKeyFolderPermissionRelations = relations(apiKeyFolderPermissions, ({ one }) => ({
  apiKey: one(apiKeys, { fields: [apiKeyFolderPermissions.apiKeyId], references: [apiKeys.id] }),
  folder: one(folders, { fields: [apiKeyFolderPermissions.folderId], references: [folders.id] }),
}));

export const oauthClientRelations = relations(oauthClients, ({ many, one }) => ({
  user: one(user, { fields: [oauthClients.userId], references: [user.id] }),
  authorizations: many(oauthAuthorizations),
  codes: many(oauthAuthorizationCodes),
}));

export const oauthAuthorizationRelations = relations(oauthAuthorizations, ({ many, one }) => ({
  user: one(user, { fields: [oauthAuthorizations.userId], references: [user.id] }),
  client: one(oauthClients, { fields: [oauthAuthorizations.clientId], references: [oauthClients.id] }),
  folderPermissions: many(oauthAuthorizationFolderPermissions),
  codes: many(oauthAuthorizationCodes),
  tokens: many(oauthTokens),
}));

export const oauthAuthorizationFolderPermissionRelations = relations(oauthAuthorizationFolderPermissions, ({ one }) => ({
  authorization: one(oauthAuthorizations, { fields: [oauthAuthorizationFolderPermissions.authorizationId], references: [oauthAuthorizations.id] }),
  folder: one(folders, { fields: [oauthAuthorizationFolderPermissions.folderId], references: [folders.id] }),
}));

export const oauthAuthorizationCodeRelations = relations(oauthAuthorizationCodes, ({ one }) => ({
  client: one(oauthClients, { fields: [oauthAuthorizationCodes.clientId], references: [oauthClients.id] }),
  user: one(user, { fields: [oauthAuthorizationCodes.userId], references: [user.id] }),
  authorization: one(oauthAuthorizations, { fields: [oauthAuthorizationCodes.authorizationId], references: [oauthAuthorizations.id] }),
}));

export const oauthTokenRelations = relations(oauthTokens, ({ one }) => ({
  authorization: one(oauthAuthorizations, { fields: [oauthTokens.authorizationId], references: [oauthAuthorizations.id] }),
}));

export const noteRelations = relations(notes, ({ many, one }) => ({
  user: one(user, { fields: [notes.userId], references: [user.id] }),
  folder: one(folders, { fields: [notes.folderId], references: [folders.id] }),
  events: many(noteEvents),
  versions: many(noteVersions),
  shareLinks: many(noteShareLinks),
  tags: many(noteTags),
  outgoingLinks: many(noteLinks, { relationName: "sourceNoteLinks" }),
  incomingLinks: many(noteLinks, { relationName: "targetNoteLinks" }),
  attachments: many(attachments),
  templateAssignments: many(templateFolderAssignments),
}));

export const templateFolderAssignmentRelations = relations(templateFolderAssignments, ({ one }) => ({
  template: one(notes, { fields: [templateFolderAssignments.templateId], references: [notes.id] }),
  folder: one(folders, { fields: [templateFolderAssignments.folderId], references: [folders.id] }),
  user: one(user, { fields: [templateFolderAssignments.userId], references: [user.id] }),
}));

export const noteEventRelations = relations(noteEvents, ({ one }) => ({
  note: one(notes, { fields: [noteEvents.noteId], references: [notes.id] }),
  user: one(user, { fields: [noteEvents.userId], references: [user.id] }),
}));

export const noteVersionRelations = relations(noteVersions, ({ one }) => ({
  note: one(notes, { fields: [noteVersions.noteId], references: [notes.id] }),
  user: one(user, { fields: [noteVersions.userId], references: [user.id] }),
  folder: one(folders, { fields: [noteVersions.folderId], references: [folders.id] }),
}));

export const noteShareLinkRelations = relations(noteShareLinks, ({ one }) => ({
  note: one(notes, { fields: [noteShareLinks.noteId], references: [notes.id] }),
  user: one(user, { fields: [noteShareLinks.userId], references: [user.id] }),
}));

export const tagRelations = relations(tags, ({ many, one }) => ({
  user: one(user, { fields: [tags.userId], references: [user.id] }),
  notes: many(noteTags),
}));

export const noteTagRelations = relations(noteTags, ({ one }) => ({
  user: one(user, { fields: [noteTags.userId], references: [user.id] }),
  note: one(notes, { fields: [noteTags.noteId], references: [notes.id] }),
  tag: one(tags, { fields: [noteTags.tagId], references: [tags.id] }),
}));

export const noteLinkRelations = relations(noteLinks, ({ one }) => ({
  user: one(user, { fields: [noteLinks.userId], references: [user.id] }),
  sourceNote: one(notes, { fields: [noteLinks.sourceNoteId], references: [notes.id], relationName: "sourceNoteLinks" }),
  targetNote: one(notes, { fields: [noteLinks.targetNoteId], references: [notes.id], relationName: "targetNoteLinks" }),
}));

export const attachmentRelations = relations(attachments, ({ one }) => ({
  user: one(user, { fields: [attachments.userId], references: [user.id] }),
  note: one(notes, { fields: [attachments.noteId], references: [notes.id] }),
  folder: one(folders, { fields: [attachments.folderId], references: [folders.id] }),
}));

export type Folder = typeof folders.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type TemplateFolderAssignment = typeof templateFolderAssignments.$inferSelect;
export type NoteEvent = typeof noteEvents.$inferSelect;
export type NoteVersion = typeof noteVersions.$inferSelect;
export type NoteShareLink = typeof noteShareLinks.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type NoteTag = typeof noteTags.$inferSelect;
export type NoteLink = typeof noteLinks.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type ApiKeyFolderPermission = typeof apiKeyFolderPermissions.$inferSelect;
export type OAuthClient = typeof oauthClients.$inferSelect;
export type OAuthAuthorization = typeof oauthAuthorizations.$inferSelect;
export type OAuthAuthorizationFolderPermission = typeof oauthAuthorizationFolderPermissions.$inferSelect;
export type OAuthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
export type OAuthToken = typeof oauthTokens.$inferSelect;
