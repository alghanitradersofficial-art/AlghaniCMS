import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";
const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
export const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
export const db = databaseUrl ? drizzle(pool, { schema }) : null;
export * from "./schema/index.js";
//# sourceMappingURL=index.js.map