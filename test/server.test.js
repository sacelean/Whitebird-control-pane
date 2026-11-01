import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPanel } from '../server.js';

test('API: consulta segura, CSRF, conflicto y guardado en archivo aislado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'whitebird-panel-'));
  const envPath = join(dir, '.env');
  await writeFile(envPath, 'DISCORD_TOKEN=private-token\nWOW_SYNC_HOUR=4\nDATABASE_PATH=/not-present/test.sqlite\n');
  const port = 19387;
  const recruitmentEnvPath = join(dir, 'recruitment.env');
  await writeFile(recruitmentEnvPath, 'DISCORD_TOKEN=recruitment-secret\nAPPLY_CATEGORY_ID=123456789012345678\nDATABASE_PATH=/not-present/recruitment.sqlite\n');
  const rouletteEnvPath = join(dir, 'roulette.env');
  await writeFile(rouletteEnvPath, 'DISCORD_TOKEN=roulette-secret\nDISCORD_GUILD_ID=123456789012345678\nDATABASE_PATH=/not-present/roulette.sqlite\n');
  const server = createPanel({ envPath, port, recruitmentEnvPath, rouletteEnvPath });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    const url = `http://127.0.0.1:${port}`;
    const response = await fetch(`${url}/api/config`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.ok(!JSON.stringify(data).includes('private-token'));
    assert.equal(data.state.available, false);
    assert.equal((await fetch(`${url}/`)).status, 200);
    const projects = await (await fetch(`${url}/api/projects`)).json();
    assert.equal(projects.find(p => p.id === 'recruitment').available, true);
    assert.equal(projects.find(p => p.id === 'roulette').available, true);
    const roulette = await (await fetch(`${url}/api/config?project=roulette`)).json();
    assert.equal(roulette.project.id, 'roulette');
    assert.equal(roulette.values.APPLY_CATEGORY_ID, undefined);
    assert.ok(!JSON.stringify(roulette).includes('roulette-secret'));
    const roulettePut = changes => fetch(`${url}/api/config?project=roulette`, { method:'PUT', headers:{'X-Panel-CSRF':data.csrf}, body:JSON.stringify({revision:roulette.revision,changes}) });
    assert.equal((await roulettePut({APPLY_CATEGORY_ID:'234567890123456789'})).status, 400);
    assert.equal((await roulettePut({OFFICER_ROLE_IDS:'234567890123456789'})).status, 200);
    assert.ok((await readFile(rouletteEnvPath,'utf8')).includes('234567890123456789'));
    assert.ok(!(await readFile(envPath,'utf8')).includes('OFFICER_ROLE_IDS'));
    assert.equal((await fetch(`${url}/api/config?project=../other`)).status, 404);
    const recruitment = await (await fetch(`${url}/api/config?project=recruitment`)).json();
    assert.equal(recruitment.values.APPLY_CATEGORY_ID, '123456789012345678');
    assert.equal(recruitment.values.WOW_SYNC_HOUR, undefined);
    assert.ok(!JSON.stringify(recruitment).includes('recruitment-secret'));
    const recruitmentPut = changes => fetch(`${url}/api/config?project=recruitment`, { method:'PUT', headers:{'X-Panel-CSRF':data.csrf}, body:JSON.stringify({revision:recruitment.revision,changes}) });
    assert.equal((await recruitmentPut({WOW_SYNC_HOUR:'8'})).status, 400);
    assert.equal((await recruitmentPut({APPLY_CATEGORY_ID:'234567890123456789'})).status, 200);
    assert.ok((await readFile(recruitmentEnvPath, 'utf8')).includes('234567890123456789'));
    assert.ok(!(await readFile(envPath, 'utf8')).includes('APPLY_CATEGORY_ID'));

    assert.equal((await fetch(`${url}/.env`)).status, 404);
    assert.equal((await fetch(`${url}/api/config`, { headers: { Origin: 'http://evil.example' } })).status, 403);
    assert.equal((await fetch(`${url}/api/config`, { method:'PUT', body:'{}' })).status, 403);
    const put = body => fetch(`${url}/api/config`, { method:'PUT', headers:{'X-Panel-CSRF':data.csrf,'Content-Type':'application/json'}, body:JSON.stringify(body) });
    assert.equal((await put({revision:data.revision, changes:{WOW_SYNC_HOUR:'25'}})).status, 400);
    assert.equal((await put({revision:data.revision, changes:{WOW_SYNC_HOUR:'6'}})).status, 200);
    const text = await readFile(envPath, 'utf8');
    assert.ok(text.includes('DISCORD_TOKEN=private-token'));
    assert.equal((await import('dotenv')).parse(text).WOW_SYNC_HOUR, '6');
    assert.equal((await put({revision:data.revision, changes:{WOW_SYNC_HOUR:'7'}})).status, 409);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, {recursive:true,force:true});
  }
});

test('resuelve SQLite desde el bot aunque el panel esté en otro repositorio', async () => {
  const { default: Database } = await import('better-sqlite3');
  const dir = await mkdtemp(join(tmpdir(), 'whitebird-external-bot-'));
  const envPath = join(dir, '.env');
  await writeFile(envPath, 'DISCORD_GUILD_ID=123456789012345678\nDATABASE_PATH=state.sqlite\n');
  const database = new Database(join(dir, 'state.sqlite'));
  database.exec('CREATE TABLE wow_links (guild_id TEXT, character_name TEXT);');
  database.prepare('INSERT INTO wow_links VALUES (?, ?)').run('123456789012345678', 'Testmain');
  database.close();
  const port = 19388;
  const server = createPanel({ envPath, port });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    const response = await fetch(`http://127.0.0.1:${port}/api/config`);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.state.available, true);
    assert.equal(data.state.links[0].character_name, 'Testmain');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive:true, force:true });
  }
});
