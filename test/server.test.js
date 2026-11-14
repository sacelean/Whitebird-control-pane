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

test('reinicio: CSRF, revisión, servicios fijos, exclusión y errores sin filtrar secretos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'whitebird-restart-'));
  const envPath = join(dir, '.env');
  await writeFile(envPath, 'DISCORD_TOKEN=private-token\n');
  const calls = [];
  let finish;
  const server = createPanel({ port: 19389, envPath, recruitmentEnvPath: envPath, rouletteEnvPath: envPath,
    restartEnabled: true, execute: (...args) => { calls.push(args); return new Promise(resolve => { finish = resolve; }); } });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(19389, '127.0.0.1', resolve); });
    const base = 'http://127.0.0.1:19389';
    const config = await (await fetch(`${base}/api/config`)).json();
    const headers = { 'X-Panel-CSRF': config.csrf, 'X-Panel-Revision': config.revision };
    const post = (project, h = headers) => fetch(`${base}/api/restart?project=${project}`, { method: 'POST', headers: h });
    assert.equal((await post('wow', {})).status, 403);
    assert.equal((await post('wow', { ...headers, 'X-Panel-Revision': 'stale' })).status, 409);
    assert.equal((await post('../other')).status, 404);
    assert.equal(calls.length, 0);
    for (const [project, service] of [['wow','bot'], ['recruitment','bot'], ['roulette','whitebird-wow-wheel']]) {
      const running = post(project);
      while (!finish) await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal((await post(project)).status, 409);
      const save = await fetch(`${base}/api/config`, { method: 'PUT', headers, body: '{}' });
      assert.equal(save.status, 409);
      const [command, args, options] = calls.at(-1);
      assert.equal(command, 'docker');
      assert.deepEqual(args, ['compose','up','-d','--no-deps','--force-recreate',service]);
      assert.equal(options.cwd, dir);
      assert.equal(options.timeout, 120000);
      finish(); finish = undefined;
      assert.equal((await running).status, 200);
    }
  } finally {
    finish?.();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test('reinicio deshabilitado y fallo Docker no devuelven salida con secretos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'whitebird-restart-error-'));
  const envPath = join(dir, '.env');
  await writeFile(envPath, 'DISCORD_TOKEN=private-token\n');
  try {
    for (const enabled of [false, true]) {
      let calls = 0;
      const port = enabled ? 19391 : 19390;
      const server = createPanel({ port, envPath, restartEnabled: enabled, execute: async () => { calls++; throw Error('private-token'); } });
      try {
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
        const base = `http://127.0.0.1:${port}`;
        const config = await (await fetch(`${base}/api/config`)).json();
        for (let i = 0; i < 2; i++) {
          const result = await fetch(`${base}/api/restart?project=wow`, { method: 'POST', headers: { 'X-Panel-CSRF': config.csrf, 'X-Panel-Revision': config.revision } });
          assert.equal(result.status, enabled ? 502 : 403);
          assert.ok(!(await result.text()).includes('private-token'));
        }
        assert.equal(calls, enabled ? 2 : 0);
      } finally { await new Promise(resolve => server.close(resolve)); }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('IA: lista ambos archivos, guarda por separado y rechaza reinicio Docker', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'whitebird-agent-panel-'));
  const agentEnvPath = join(dir, 'agent.env'), agentDiscordEnvPath = join(dir, 'discord.env');
  const original = 'AGENT_API_TOKEN=secret-agent-token-with-32-characters\nLLAMA_MODEL=local\nOTHER=keep\n';
  const discord = 'DISCORD_BOT_TOKEN=private-discord\nDISCORD_GUILD_ID=123456789012345678\n';
  await writeFile(agentEnvPath, original); await writeFile(agentDiscordEnvPath, discord);
  let calls = 0;
  const port = 19393, base = `http://127.0.0.1:${port}`;
  const server = createPanel({ port, agentEnvPath, agentDiscordEnvPath, restartEnabled: true, execute: async () => { calls++; } });
  try {
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    const projects = await (await fetch(`${base}/api/projects`)).json();
    assert.equal(projects.find(p => p.id === 'agent').available, true);
    assert.equal(projects.find(p => p.id === 'agent-discord').available, true);
    for (const project of ['agent', 'agent-discord']) {
      const config = await (await fetch(`${base}/api/config?project=${project}`)).json();
      assert.equal(config.restartEnabled, false);
      assert.equal(config.project.manualRestart, true);
      assert.equal(config.project.commands, project === 'agent-discord');
      assert.equal(config.state.available, false);
      assert.ok(!config.state.message.includes('SQLite no disponible'));
      assert.ok(!JSON.stringify(config).includes('secret-agent-token'));
      assert.ok(!JSON.stringify(config).includes('private-discord'));
      const changes = project === 'agent' ? { LLAMA_MODEL: 'new-model' } : { DISCORD_CHANNEL_IDS: '234567890123456789' };
      const headers = { 'X-Panel-CSRF': config.csrf, 'Content-Type': 'application/json' };
      const result = await fetch(`${base}/api/config?project=${project}`, { method: 'PUT', headers, body: JSON.stringify({ revision: config.revision, changes }) });
      assert.equal(result.status, 200);
      assert.match((await result.json()).message, /systemd/);
      const restart = await fetch(`${base}/api/restart?project=${project}`, { method: 'POST', headers });
      assert.equal(restart.status, 403);
      assert.match((await restart.json()).error, /systemd/);
      if (project === 'agent') assert.equal(await readFile(agentDiscordEnvPath, 'utf8'), discord);
    }
    const saved = await readFile(agentEnvPath, 'utf8');
    assert.match(saved, /LLAMA_MODEL=new-model/);
    assert.match(saved, /OTHER=keep/);
    assert.ok(!saved.includes('DISCORD_CHANNEL_IDS'));
    assert.equal(calls, 0);
    await rm(agentDiscordEnvPath);
    const unavailable = await (await fetch(`${base}/api/projects`)).json();
    assert.equal(unavailable.find(p => p.id === 'agent-discord').available, false);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});
