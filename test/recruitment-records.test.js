import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recruitmentRecords } from '../recruitment-records.js';

test('registro SQLite: aislamiento, progreso y paginación sin Discord', () => {
  const base = mkdtempSync(join(tmpdir(), 'recruitment-records-'));
  const env = { DISCORD_GUILD_ID: 'guild', DATABASE_PATH: 'records.sqlite' };
  try {
    assert.equal(recruitmentRecords(env, base).available, false);
    const db = new Database(join(base, 'records.sqlite'));
    assert.match(recruitmentRecords(env, base).message, /reinicia/);
    db.exec(`CREATE TABLE recruitment_decisions (guild_id TEXT, decided_at TEXT DEFAULT CURRENT_TIMESTAMP,
      decision TEXT, character TEXT, realm TEXT, applicant TEXT, officer TEXT, reason TEXT,
      status TEXT, linked INTEGER, channel_created INTEGER, raider_channel_id TEXT)`);
    const insert = db.prepare("INSERT INTO recruitment_decisions (guild_id, decision, status, linked, channel_created, raider_channel_id) VALUES (?, ?, ?, ?, ?, ?)");
    for (let i = 0; i < 101; i++) insert.run('guild', 'rechazada', 'completed', 0, 0, null);
    insert.run('other', 'aceptada', 'completed', 1, 1, 'private');
    insert.run('guild', 'aceptada', 'pending', 0, 1, 'raider');
    db.close();
    const first = recruitmentRecords(env, base);
    assert.equal(first.records.length, 100);
    assert.equal(first.records[0].status, 'pending');
    assert.equal(first.records[0].linked, false);
    assert.equal(first.records[0].channelCreated, true);
    assert.ok(!JSON.stringify(first).includes('private'));
    const last = recruitmentRecords(env, base, first.next);
    assert.equal(last.records.length, 2);
    assert.equal(last.next, null);
    assert.throws(() => recruitmentRecords(env, base, 'invalid'));
  } finally { rmSync(base, { recursive: true, force: true }); }
});
