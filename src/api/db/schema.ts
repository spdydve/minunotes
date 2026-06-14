import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  accessMode: text("access_mode", { enum: ["all", "selected"] }).notNull().default("all"),
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

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  folderId: text("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled note"),
  content: text("content").notNull().default(""),
  type: text("type", { enum: ["note", "template"] }).notNull().default("note"),
  isApiEditable: integer("is_api_editable", { mode: "boolean" }).notNull().default(true),
  updatedByActorType: text("updated_by_actor_type"),
  updatedByActorId: text("updated_by_actor_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("notes_user_id_idx").on(table.userId), index("notes_folder_id_idx").on(table.folderId), index("notes_type_idx").on(table.type)]);

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
  attachments: many(attachments),
  templateFolderAssignments: many(templateFolderAssignments),
  apiKeys: many(apiKeys),
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

export const noteRelations = relations(notes, ({ many, one }) => ({
  user: one(user, { fields: [notes.userId], references: [user.id] }),
  folder: one(folders, { fields: [notes.folderId], references: [folders.id] }),
  events: many(noteEvents),
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

export const attachmentRelations = relations(attachments, ({ one }) => ({
  user: one(user, { fields: [attachments.userId], references: [user.id] }),
  note: one(notes, { fields: [attachments.noteId], references: [notes.id] }),
  folder: one(folders, { fields: [attachments.folderId], references: [folders.id] }),
}));

export type Folder = typeof folders.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type TemplateFolderAssignment = typeof templateFolderAssignments.$inferSelect;
export type NoteEvent = typeof noteEvents.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type ApiKeyFolderPermission = typeof apiKeyFolderPermissions.$inferSelect;
