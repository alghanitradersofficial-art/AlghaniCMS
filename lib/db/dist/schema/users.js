import { pgTable, serial, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
export const usersTable = pgTable("users", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    role: text("role").notNull().default("sales"),
    password: text("password").notNull(),
    phone: text("phone"),
    cnic: text("cnic"),
    address: text("address"),
    photoUrl: text("photo_url"),
    documents: jsonb("documents").$type().notNull().default([]),
    permissions: jsonb("permissions").$type().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
//# sourceMappingURL=users.js.map