import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const ornaments = sqliteTable(
  "ornaments",
  {
    id: text("id").primaryKey(),
    initials: text("initials").notNull(),
    slot: integer("slot").notNull(),
    objectKey: text("object_key").notNull().unique(),
    originalName: text("original_name").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: text("created_at").notNull(),
    archivedAt: text("archived_at"),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("ornaments_slot_idx").on(table.slot),
    index("ornaments_created_at_idx").on(table.createdAt),
    uniqueIndex("ornaments_active_slot_idx")
      .on(table.slot)
      .where(sql`${table.archivedAt} IS NULL AND ${table.deletedAt} IS NULL`),
  ],
);

export const ornamentAllocator = sqliteTable("ornament_allocator", {
  id: integer("id").primaryKey(),
  nextSlot: integer("next_slot").notNull().default(1),
});
