import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { usersTable } from './schema/users';
import { tokensTable } from './schema/tokens';
import { userKeysTable } from './schema/user-keys';
import { entriesTable } from './schema/entries';

const schema = { usersTable, tokensTable, userKeysTable, entriesTable };

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    // Managed Postgres (the hosted deploy) terminates TLS; local dev does not.
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });
export type Schema = typeof schema;
