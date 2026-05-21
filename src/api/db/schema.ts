import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  folderId: text("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled note"),
  content: text("content").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const folderRelations = relations(folders, ({ many }) => ({
  notes: many(notes),
}));

export const noteRelations = relations(notes, ({ one }) => ({
  folder: one(folders, { fields: [notes.folderId], references: [folders.id] }),
}));

export type Folder = typeof folders.$inferSelect;
export type Note = typeof notes.$inferSelect;
