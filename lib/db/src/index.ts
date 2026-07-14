import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

export const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null as unknown as pg.Pool;
export const db = databaseUrl ? drizzle(pool, { schema }) : null as any;

export * from "./schema/index.js";
