import 'dotenv/config';
import { drizzle } from 'drizzle-orm/connect';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

export let db: NodePgDatabase<Record<string, never>> & { $client: Pool; };

async function main() {
    // You can specify any property from the node-postgres connection options
    db = await drizzle("node-postgres", {
        connection: {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            ssl: false
        }
    });
}

main();