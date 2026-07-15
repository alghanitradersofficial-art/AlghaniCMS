import { pgTable, serial, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
export const customersTable = pgTable("customers", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    type: text("type").notNull().default("retail"),
    // --- Khata (ledger) fields ---
    // Positive = customer owes us (receivable). Negative = we owe the customer (advance/credit).
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true });
//# sourceMappingURL=customers.js.map