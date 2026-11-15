import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDiagnostics } from '../diagnostics.js';
import { agentModules, agentDiscordModules, recruitmentModules, modules } from '../config.js';
import { createAgentApi, isDiagnosticQuestion } from '../agent-api.js';

const secret = 'sensitive-value-that-must-never-escape';
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'whitebird-diagnostics-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const projects = [
    { id: 'agent', name: 'Agente', modules: agentModules },
    { id: 'agent-discord', name: 'Discord IA', modules: agentDiscordModules },
    { id: 'wow', name: 'WoW Sync', modules },
    { id: 'recruitment', name: 'Recruitment', modules: recruitmentModules }
  ].map(p => ({ ...p, base: dir, path: join(dir, `${p.id}.env`) }));
  for (const project of projects) await writeFile(project.path, `AGENT_API_TOKEN=${secret}\nDISCORD_TOKEN=${secret}\nDISCORD_GUILD_ID=123456789012345678\n`);
  return { dir, projects };
}

test('detects configuration errors and token/port mismatches without exposing values or modifying files', async t => {
  const { projects } = await fixture(t);
  await writeFile(projects[0].path, `AGENT_API_TOKEN=${secret}\nAGENT_PORT=3090\nWOWAUDIT_TEAM_ID=invalid-private-team\n`);
  const before = await readFile(projects[0].path, 'utf8');
  const calls = [];
  const diagnose = createDiagnostics({ projects, panelEnv: { PANEL_AGENT_TOKEN: 'different-private-secret', PANEL_AGENT_URL: 'http://127.0.0.1:9999' },
    execute: async (cmd, args) => { calls.push([cmd, args]); return { stdout: args[0] === 'is-active' ? 'active' : `Unauthorized ${secret} person@example.org` }; },
    fetchFn: async () => ({ status: 401 }) });
  const { answer } = await diagnose('diagnostica agente');
  assert.match(answer, /WOWAUDIT_TEAM_ID no supera/);
  assert.match(answer, /tokens guardados difieren/);
  assert.match(answer, /URL falta o difiere/);
  assert.match(answer, /Autenticación rechazada/);
  for (const value of [secret, 'invalid-private-team', 'different-private-secret', 'person@example.org']) assert.ok(!answer.includes(value));
  assert.equal(await readFile(projects[0].path, 'utf8'), before);
  assert.deepEqual(calls.map(c => c[0]), ['systemctl', 'journalctl']);
});

test('diagnoses stopped Compose, shared database mismatch and unavailable logs independently', async t => {
  const { projects } = await fixture(t);
  await writeFile(projects[3].path, `DISCORD_GUILD_ID=223456789012345678\nAPPLY_CATEGORY_ID=bad-id\nWOW_ROLE_SYNC_DATA_DIR=wrong-dir\n`);
  const diagnose = createDiagnostics({ projects, execute: async (_cmd, args) => {
    if (args.includes('logs')) throw Error(secret);
    return { stdout: '{"State":"exited"}\n' };
  } });
  const { answer } = await diagnose('¿Por qué Recruitment no arranca?');
  assert.match(answer, /APPLY_CATEGORY_ID no supera/);
  assert.match(answer, /servidor Discord difiere/);
  assert.match(answer, /carpeta compartida/);
  assert.match(answer, /Compose no confirma/);
  assert.match(answer, /Logs no disponibles/);
  assert.ok(!answer.includes(secret));
});

test('handles missing files, unknown projects, timeouts and bounds command execution', async t => {
  const { projects } = await fixture(t);
  await rm(projects[3].path);
  const diagnose = createDiagnostics({ projects, execute: async (_cmd, _args, opts) => {
    assert.equal(opts.timeout, 5000); assert.equal(opts.maxBuffer, 128 * 1024); throw Error(secret);
  } });
  assert.match((await diagnose('diagnostica recruitment')).answer, /Configuración inaccesible/);
  assert.match((await diagnose('diagnostica', '../../evil')).answer, /componente conocido/);
  assert.match((await diagnose('diagnostica wow')).answer, /Estado de ejecución no confirmado/);
});

test('serializes diagnostics and refuses redirects or remote health targets', async t => {
  const { projects } = await fixture(t);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const diagnose = createDiagnostics({ projects, panelEnv: { PANEL_AGENT_URL: 'http://remote.example', PANEL_AGENT_TOKEN: secret },
    execute: async () => { await held; return { stdout: 'active' }; },
    fetchFn: () => { assert.fail('remote fetch'); } });
  const first = diagnose('diagnostica agente');
  assert.match((await diagnose('diagnostica agente')).answer, /en curso/);
  release();
  assert.match((await first).answer, /No se pudo verificar/);
});

test('chat routes diagnostics locally with CSRF and works when the AI connection is misconfigured', async () => {
  let calls = 0;
  const api = createAgentApi({ url: 'http://remote.example', token: '', diagnose: async (question, project) => {
    calls++; assert.equal(question, 'diagnostica'); assert.equal(project, 'recruitment'); return { tool: 'panel_diagnostics', answer: 'Comprobado' };
  }, fetchFn: () => assert.fail('must not contact AI') });
  const request = async csrf => {
    let result;
    const req = Object.assign((async function* () { yield Buffer.from(JSON.stringify({ question: 'diagnostica', project: 'recruitment' })); })(), { method: 'POST', headers: { 'content-type': 'application/json', 'x-panel-csrf': csrf } });
    await api(req, {}, { csrf: 'expected', send: (_res, status, data) => { result = { status, data }; } });
    return result;
  };
  assert.equal((await request('wrong')).status, 403);
  assert.equal(calls, 0);
  assert.deepEqual(await request('expected'), { status: 200, data: { tool: 'panel_diagnostics', answer: 'Comprobado' } });
  assert.equal(calls, 1);
  for (const text of ['¿Por qué no arranca?', 'revisa misconfigurations', 'mira los logs', 'revisa permisos']) assert.equal(isDiagnosticQuestion(text), true);
  assert.equal(isDiagnosticQuestion('¿Qué eventos tenemos próximamente?'), false);
});
