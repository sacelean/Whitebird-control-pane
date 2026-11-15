import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createManagement } from '../management.js';
import { createOperations } from '../operations.js';
import { modules, agentModules } from '../config.js';
import { inspectDiscord, effectivePermissions } from '../discord-permissions.js';

const token = 'test-management-token-'.repeat(3);
async function fixture(t, options = {}) {
  const base = await mkdtemp(join(tmpdir(), 'whitebird-management-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const path = join(base, '.env');
  await writeFile(path, 'DISCORD_TOKEN=private-bot-token\nWOW_SYNC_HOUR=4\nKEEP_ME=unchanged\n');
  const projects = [{ id: 'wow', name: 'WoW', path, base, modules }];
  const calls = [];
  const execute = options.execute || (async (...args) => { calls.push(args); return { stdout: 'active', stderr: '' }; });
  const operations = createOperations({ execute, restartEnabled: true, systemdRestartEnabled: true });
  const management = createManagement({ projects, operations, execute, token, diagnose: async () => ({ answer: 'Diagnostic evidence' }), restartEnabled: true, systemdRestartEnabled: true, applyDelay: 0, ...options });
  return { ...management, path, calls, operations, projects };
}

test('reads real stored values and defaults with secret presence and no raw secret values', async t => {
  const management = await fixture(t);
  const result = await management.call('read_config', { project: 'wow' }, 'owner');
  assert.equal(result.fields.find(field => field.key === 'WOW_SYNC_HOUR').value, '4');
  assert.equal(result.fields.find(field => field.key === 'WOW_SYNC_HOUR').source, 'guardado');
  assert.equal(result.fields.find(field => field.key === 'WOW_SYNC_TIMEZONE').source, 'predeterminado del panel');
  assert.equal(result.fields.find(field => field.key === 'DISCORD_TOKEN').configured, true);
  assert.ok(!JSON.stringify(result).includes('private-bot-token'));
  await assert.rejects(management.call('read_config', { project: '../../file' }), /desconocido/);
});

test('validated proposal saves atomically, keeps unrelated fields, binds owner and applies idempotently', async t => {
  const management = await fixture(t);
  const { proposal } = await management.call('prepare_config', { project: 'wow', changes: { WOW_SYNC_HOUR: '5' } }, 'owner');
  assert.deepEqual(proposal.diff, [{ key: 'WOW_SYNC_HOUR', before: '4', after: '5' }]);
  assert.match(await readFile(management.path, 'utf8'), /WOW_SYNC_HOUR=4/);
  await assert.rejects(management.act('save', proposal.id, 'other'), /otro solicitante/);
  await assert.rejects(management.act('apply', proposal.id, 'owner'), /Guarda primero/);
  assert.equal((await management.act('save', proposal.id, 'owner')).proposal.state, 'saved');
  await management.act('save', proposal.id, 'owner');
  const contents = await readFile(management.path, 'utf8');
  assert.match(contents, /WOW_SYNC_HOUR=5/); assert.match(contents, /KEEP_ME=unchanged/); assert.match(contents, /private-bot-token/);
  assert.equal((await stat(management.path)).mode & 0o777, 0o600);
  assert.equal((await management.act('apply', proposal.id, 'owner')).proposal.state, 'applying');
  await management.act('apply', proposal.id, 'owner');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await management.act('status', proposal.id, 'owner')).proposal.state, 'applied');
  await management.act('apply', proposal.id, 'owner');
  assert.equal(management.calls.length, 1);
  assert.equal(management.calls[0][0], 'docker');
  assert.deepEqual(management.calls[0][1], ['compose', 'up', '-d', '--no-deps', '--force-recreate', 'bot']);
});

test('stale proposals, invalid fields, secret writes, expiry and partial apply failures are explicit', async t => {
  let time = 0;
  const management = await fixture(t, { now: () => time, execute: async () => { throw Error('private-bot-token'); } });
  for (const changes of [{ WOW_SYNC_HOUR: '25' }, { DISCORD_TOKEN: 'new-secret' }, { BAD_KEY: 'x' }]) {
    await assert.rejects(management.call('prepare_config', { project: 'wow', changes }, 'owner'));
  }
  const stale = await management.call('prepare_config', { project: 'wow', changes: { WOW_SYNC_HOUR: '5' } }, 'owner');
  await writeFile(management.path, 'WOW_SYNC_HOUR=6\n');
  await assert.rejects(management.act('save', stale.proposal.id, 'owner'), /ha cambiado/);
  const next = await management.call('prepare_config', { project: 'wow', changes: { WOW_SYNC_HOUR: '7' } }, 'owner');
  await management.act('save', next.proposal.id, 'owner');
  await management.act('apply', next.proposal.id, 'owner');
  await new Promise(resolve => setTimeout(resolve, 20));
  const failed = await management.act('status', next.proposal.id, 'owner');
  assert.equal(failed.proposal.state, 'apply_failed');
  assert.ok(!JSON.stringify(failed).includes('private-bot-token'));
  assert.match(await readFile(management.path, 'utf8'), /WOW_SYNC_HOUR=7/);
  await assert.rejects(management.act('apply', next.proposal.id, 'owner'), /nueva propuesta/);
  time = 16 * 60 * 1000;
  await assert.rejects(management.act('save', next.proposal.id, 'owner'), /caducada/);
});

test('logs redact known and recognizable credentials and never allow arbitrary commands', async t => {
  const calls = [];
  const management = await fixture(t, { execute: async (...args) => {
    calls.push(args); return { stdout: 'ECONNREFUSED private-bot-token Authorization: Bearer other-secret\npassword=hunter2\n', stderr: '' };
  } });
  const result = await management.call('read_logs', { project: 'wow' });
  assert.match(result.text, /ECONNREFUSED/);
  for (const secret of ['private-bot-token', 'other-secret', 'hunter2']) assert.ok(!result.text.includes(secret));
  assert.deepEqual(calls[0][1], ['compose', 'logs', '--tail', '60', '--no-color', 'bot']);
  assert.equal(calls[0][2].timeout, 5000);
  await assert.rejects(management.call('exec', { project: 'wow', command: 'rm' }));
  await assert.rejects(management.call('read_logs', { project: 'wow', command: 'rm' }));
});

test('systemd proposals restart only registered IA units and share exclusion with manual saves', async t => {
  let finish;
  const management = await fixture(t, { execute: () => new Promise(resolve => { finish = resolve; }) });
  const project = management.projects[0];
  project.id = 'agent'; project.manualRestart = true; project.modules = agentModules;
  const { proposal } = await management.call('prepare_restart', { project: 'agent' }, 'owner');
  await management.act('apply', proposal.id, 'owner');
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  await assert.rejects(management.operations.save(project, 'anything', {}), /otro guardado/);
  finish();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await management.act('status', proposal.id, 'owner')).proposal.state, 'applied');
});

test('channel overwrites combine everyone, roles, member and implicit dependencies with bigint', () => {
  const guild = '100000000000000001', user = '100000000000000002', role = '100000000000000003';
  const bits = (1n << 10n) | (1n << 11n) | (1n << 14n) | (1n << 15n) | (1n << 28n);
  const roles = [{ id: guild, permissions: bits.toString() }, { id: role, permissions: '0' }];
  const member = { user: { id: user }, roles: [role] };
  const channel = { permission_overwrites: [
    { id: guild, type: 0, deny: (1n << 11n).toString(), allow: '0' },
    { id: role, type: 0, deny: '0', allow: (1n << 11n).toString() },
    { id: user, type: 1, deny: (1n << 14n).toString(), allow: '0' }
  ] };
  const result = effectivePermissions(roles, member, guild, channel);
  assert.equal(result.SendMessages, true); assert.equal(result.EmbedLinks, false); assert.equal(result.ManageRoles, true);
  channel.permission_overwrites.push({ id: user, type: 1, deny: (1n << 10n).toString(), allow: '0' });
  channel.permission_overwrites = [channel.permission_overwrites.at(-1)];
  assert.equal(effectivePermissions(roles, member, guild, channel).SendMessages, false);
  roles[1].permissions = (1n << 3n).toString();
  assert.equal(effectivePermissions(roles, member, guild, channel).SendMessages, true);
});

test('live Discord inspection checks real roles and channels with hierarchy and sanitizes API failures', async () => {
  const guild = '100000000000000001', user = '100000000000000002', held = '100000000000000003', target = '100000000000000004', channel = '100000000000000005';
  const env = { DISCORD_TOKEN: 'private-bot-token', DISCORD_GUILD_ID: guild, WOW_ROSTER_ROLE_ID: target, OFFICER_REPORT_CHANNEL_ID: channel };
  const paths = [];
  const fetchFn = async (url, options) => {
    paths.push(url);
    assert.equal(options.headers.Authorization, 'Bot private-bot-token'); assert.equal(options.redirect, 'error');
    const data = url.endsWith('/users/@me') ? { id: user }
      : url.endsWith(`/members/${user}`) ? { user: { id: user }, roles: [held] }
      : url.endsWith('/roles') ? [{ id: guild, position: 0, permissions: '0' }, { id: held, position: 10, permissions: ((1n << 28n) | (1n << 10n) | (1n << 11n)).toString() }, { id: target, position: 5, permissions: '0', managed: false }]
      : [{ id: channel, type: 0, permission_overwrites: [] }];
    return { ok: true, json: async () => data };
  };
  const result = await inspectDiscord({ id: 'wow' }, env, { fetchFn });
  assert.equal(result.available, true);
  assert.equal(result.roles.find(role => role.id === target).manageable, true);
  assert.equal(result.channels[0].permissions.SendMessages, true);
  assert.equal(paths.length, 4);
  const failed = await inspectDiscord({ id: 'wow' }, env, { fetchFn: async () => { throw Error('private-bot-token'); } });
  assert.equal(failed.available, false);
  assert.ok(!JSON.stringify(failed).includes('private-bot-token'));
});

test('a save in progress cannot be cancelled or confirmed twice', async t => {
  let finish;
  const operations = { save: () => new Promise(resolve => { finish = () => resolve({ revision: 'saved-revision' }); }), isBusy: () => false };
  const management = await fixture(t, { operations });
  const { proposal } = await management.call('prepare_config', { project: 'wow', changes: { WOW_SYNC_HOUR: '8' } }, 'owner');
  const saving = management.act('save', proposal.id, 'owner');
  await assert.rejects(management.act('cancel', proposal.id, 'owner'), /en curso/);
  await assert.rejects(management.act('save', proposal.id, 'owner'), /no se puede guardar/);
  finish();
  assert.equal((await saving).proposal.state, 'saved');
});
