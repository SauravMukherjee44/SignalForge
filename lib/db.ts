import { env } from 'cloudflare:workers';

export function getDb(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('The SignalForge D1 binding is unavailable.');
  return db;
}

export function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}
