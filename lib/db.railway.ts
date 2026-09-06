import { openDatabase } from '../runtime/sqlite.mjs';

let database: D1Database | undefined;
export function getDb(): D1Database {
  if (!database) {
    const path = process.env.SIGNALFORGE_DATABASE_PATH;
    if (!path) throw new Error('SIGNALFORGE_DATABASE_PATH must point to the persistent volume.');
    database = openDatabase(path);
  }
  return database;
}
export function nowSeconds() { return Math.floor(Date.now() / 1000); }
