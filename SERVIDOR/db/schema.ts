import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const catalogMeta = sqliteTable("catalog_meta", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
});
export const catalogCategories = sqliteTable("catalog_categories", {
    path: text("path").primaryKey(),
    name: text("name").notNull().unique(),
    sortOrder: integer("sort_order").notNull().default(0),
});
export const catalogProducts = sqliteTable("catalog_products", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    path: text("path").notNull().unique(),
    createKey: text("create_key").notNull().unique(),
    data: text("data").notNull(),
    published: integer("published").notNull().default(1),
    version: integer("version").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    lastOperation: text("last_operation").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
});
export const inventoryEvents = sqliteTable("inventory_events", {
    operationId: text("operation_id").primaryKey(),
    productId: integer("product_id")
        .notNull()
        .references(() => catalogProducts.id),
    kind: text("kind").notNull(),
    actor: text("actor").notNull(),
    details: text("details").notNull(),
    createdAt: text("created_at").notNull(),
});
