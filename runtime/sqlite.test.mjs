import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './sqlite.mjs';

test('Railway database persists records and applies migrations once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-db-test-'));
  const path = join(dir, 'test.sqlite');
  let db = openDatabase(path);
  try {
    db.migrate(new URL('../drizzle/', import.meta.url).pathname);
    await db.prepare('INSERT INTO users (id,email,display_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind('qa','qa@example.test','QA','hash','salt',1,1).run();
    db.close();
    db = openDatabase(path);
    db.migrate(new URL('../drizzle/', import.meta.url).pathname);
    assert.equal((await db.prepare('SELECT display_name FROM users WHERE id=?').bind('qa').first()).display_name, 'QA');
    await assert.rejects(db.batch([
      db.prepare("INSERT INTO organizations VALUES ('org','QA','qa','qa',1)"),
      db.prepare("INSERT INTO organizations VALUES ('org','Duplicate','dup','qa',1)"),
    ]));
    assert.equal(await db.prepare('SELECT * FROM organizations').first(), null);
  } finally { db.close(); rmSync(dir, { recursive: true }); }
});
