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
  title: text("title").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("folders_user_id_idx").on(table.userId)]);

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  uid: text("uid").notNull().unique(),
  hash: text("hash").notNull(),
  salt: text("salt").notNull(),
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
  isApiEditable: integer("is_api_editable", { mode: "boolean" }).notNull().default(true),
  updatedByActorType: text("updated_by_actor_type"),
  updatedByActorId: text("updated_by_actor_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("notes_user_id_idx").on(table.userId), index("notes_folder_id_idx").on(table.folderId)]);

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

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  folders: many(folders),
  notes: many(notes),
  noteEvents: many(noteEvents),
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
}));

export const noteEventRelations = relations(noteEvents, ({ one }) => ({
  note: one(notes, { fields: [noteEvents.noteId], references: [notes.id] }),
  user: one(user, { fields: [noteEvents.userId], references: [user.id] }),
}));

export type Folder = typeof folders.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type NoteEvent = typeof noteEvents.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type ApiKeyFolderPermission = typeof apiKeyFolderPermissions.$inferSelect;
