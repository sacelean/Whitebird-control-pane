import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAudit } from '../audit.js';

test('registros: filtra por servidor, busca y pagina sin truncar el historial', () => {
  const base = mkdtempSync(join(tmpdir(), 'panel-audit-'));
  const path = join(base, 'audit.sqlite');
  const db = new Database(path);
  try {
    db.exec('CREATE TABLE wow_sync_history (id INTEGER PRIMARY KEY, guild_id TEXT, created_at TEXT, character_name TEXT, user_id TEXT, action TEXT, role_name TEXT, category TEXT)');
    const insert = db.prepare('INSERT INTO wow_sync_history VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (let i = 1; i <= 61; i++) insert.run(i, 'guild', '2026-11-01 04:00:00', `Raider${i}`, '123', 'added', 'Raider', 'rango');
    insert.run(100, 'other', '2026-11-01 04:00:00', 'Privado', '999', 'added', 'Oficial', 'rango');
    const env = { DATABASE_PATH: path, DISCORD_GUILD_ID: 'guild' };
    const first = readAudit(env, base, new URLSearchParams());
    assert.equal(first.total, 61); assert.equal(first.rows.length, 50);
    assert.equal(first.rows[0].record_id, 61);
    const second = readAudit(env, base, new URLSearchParams('page=2'));
    assert.equal(second.rows.length, 11);
    assert.equal(readAudit(env, base, new URLSearchParams('search=Raider61')).total, 1);
    assert.equal(readAudit(env, base, new URLSearchParams('search=Privado')).total, 0);
    assert.equal(readAudit(env, base, new URLSearchParams("search=' OR 1=1")).total, 0);
    assert.equal(readAudit(env, base, new URLSearchParams('type=bis')).total, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM wow_sync_history').get().n, 62);
  } finally { db.close(); rmSync(base, { recursive: true, force: true }); }
});
