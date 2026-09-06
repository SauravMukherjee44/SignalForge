import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// A persistent SQLite connection with the D1 methods used by our API routes.
// Railway runs one replica with /data mounted as a persistent volume.
export function openDatabase(filename) {
  mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const execute = (query, values, mode) => {
    const statement = sqlite.prepare(query);
    if (mode === 'all') return { results: statement.all(...values), success: true, meta: {} };
    const result = statement.run(...values);
    return { results: [], success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  };
  const prepare = (query, values = []) => ({
    bind(...params) { return prepare(query, params); },
    async first(column) {
      const row = sqlite.prepare(query).get(...values);
      return row ? (column ? row[column] : row) : null;
    },
    async all() { return execute(query, values, 'all'); },
    async run() { return execute(query, values, 'run'); },
    execute() { return execute(query, values, 'run'); },
  });
  return {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    close() { sqlite.close(); },
    migrate(directory) {
      sqlite.exec('CREATE TABLE IF NOT EXISTS _signalforge_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
      for (const file of readdirSync(directory).filter(file => file.endsWith('.sql')).sort()) {
        if (sqlite.prepare('SELECT name FROM _signalforge_migrations WHERE name=?').get(file)) continue;
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          sqlite.exec(readFileSync(resolve(directory, file), 'utf8'));
          sqlite.prepare('INSERT INTO _signalforge_migrations VALUES (?,?)').run(file, new Date().toISOString());
          sqlite.exec('COMMIT');
        } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      }
    },
  };
}
