import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import { update, view, recruitmentModules } from '../config.js';
test('no devuelve credenciales y distingue su presencia', () => {
  const data = view('DISCORD_TOKEN=super-secret\nBLIZZARD_CLIENT_SECRET=hidden');
  assert.equal(data.secrets.DISCORD_TOKEN, true);
  assert.equal(data.values.DISCORD_TOKEN, undefined);
  assert.ok(!JSON.stringify(data).includes('super-secret'));
});
test('conserva comentarios, variables ajenas y secretos no modificados', () => {
  const text = '# configuración\nDISCORD_TOKEN=secret\nOTHER=value\nWOW_SYNC_HOUR=4\n';
  const result = update(text, { WOW_SYNC_HOUR: '6' });
  assert.equal(parse(result).DISCORD_TOKEN, 'secret');
  assert.equal(parse(result).WOW_SYNC_HOUR, '6');
  assert.ok(result.includes('# configuración\n'));
  assert.equal(parse(result).OTHER, 'value');
});
test('serializa JSON y símbolos sin alterar su valor', () => {
  const value = '{"Alchemy":"123456789012345678"}';
  assert.equal(parse(update('', { WOW_PROFESSION_ROLE_IDS: value })).WOW_PROFESSION_ROLE_IDS, value);
  assert.equal(parse(update('', { DISCORD_TOKEN: 'abc#xyz$hello' })).DISCORD_TOKEN, 'abc#xyz$hello');
});
test('conserva secuencias de escape literales en secretos', () => {
  const value = String.raw`token\npart`;
  assert.equal(parse(update('', { DISCORD_TOKEN: value })).DISCORD_TOKEN, value);
});
test('rechaza inyección, claves no admitidas y valores inválidos', () => {
  for (const changes of [{ DISCORD_TOKEN: 'a\nEVIL=1' }, { DATABASE_PATH: '/tmp/other' }, { WOW_SYNC_HOUR: '24' }, { WOW_SYNC_TIMEZONE: 'invalid/zone' }, { WOW_RANK_ROLE_IDS: '[]' }, { WOW_ROSTER_ROLE_ID: 'bad' }, { WOWAUDIT_LOOT_WINDOW_DAYS: '3661' }]) assert.throws(() => update('', changes));
});
test('rechaza IDs de roles compartidos y permite borrar un secreto explícitamente', () => {
  assert.throws(() => update('WOW_DEFAULT_RANK_ROLE_ID=123456789012345678', { WOW_ROSTER_ROLE_ID:'123456789012345678' }));
  assert.equal(parse(update('DISCORD_TOKEN=old', { DISCORD_TOKEN:'' })).DISCORD_TOKEN, '');
});

test('mensajes de recruitment: conserva saltos de línea y reemplaza el bloque completo', () => {
  const original = '# Mensajes\nAPPLY_RECEIVED_MESSAGE="Anterior"\nOTHER=conservar\n';
  const message = '**Hola {user}**\nBienvenido a {server}.\nVARIABLE=texto del mensaje';
  const first = update(original, { APPLY_RECEIVED_MESSAGE: message }, recruitmentModules);
  assert.equal(view(first, recruitmentModules).values.APPLY_RECEIVED_MESSAGE, message);
  assert.equal(parse(first).OTHER, 'conservar');
  assert.equal(parse(first).VARIABLE, undefined);
  const second = update(first, { APPLY_RECEIVED_MESSAGE: 'Nuevo\nMensaje' }, recruitmentModules);
  assert.equal(parse(second).APPLY_RECEIVED_MESSAGE, 'Nuevo\nMensaje');
  assert.equal(parse(second).OTHER, 'conservar');
  assert.ok(!second.includes('Bienvenido'));
  const cleared = update(second, { APPLY_RECEIVED_MESSAGE: '' }, recruitmentModules);
  assert.equal(parse(cleared).APPLY_RECEIVED_MESSAGE, '');
  assert.equal(parse(cleared).OTHER, 'conservar');
});

test('guarda IDs y valores simples sin comillas y repara el formato antiguo', () => {
  const original = '# Conservar\nWOW_ROSTER_ROLE_ID=`1566419007815417947`\nDISCORD_TOKEN=`abc#xyz$hello`\nOTHER=`ajeno`\n';
  const saved = update(original, { WOW_SYNC_HOUR: '6' });
  assert.ok(saved.includes('WOW_ROSTER_ROLE_ID=1566419007815417947\n'));
  assert.ok(saved.includes('WOW_SYNC_HOUR=6\n'));
  assert.equal(parse(saved).DISCORD_TOKEN, 'abc#xyz$hello');
  assert.ok(saved.includes("DISCORD_TOKEN='abc#xyz$hello'"));
  assert.ok(saved.includes('# Conservar\n'));
  assert.ok(saved.includes('OTHER=`ajeno`'));
  assert.equal(update(saved, {}), saved);
});

test('rechazo multilínea: repara backticks y conserva el mensaje corregido manualmente', () => {
  const message = 'Antes de nada, gracias por el apply.\n\nLo hemos revisado con calma, pero en este momento no podemos incorporarte en el roster. La decisión no es personal; con la composición actual no vemos que podamos incluirte en la raid.\n\nUn saludo y suerte. 💪';
  const legacy = `# Recruitment\nAPPLY_REJECTED_MESSAGE=\`${message}\`\nENTRY_CHANNEL_ID=123456789012345678\n`;
  const repaired = update(legacy, { APPLY_QUESTION_CHARACTER: 'Personaje principal' }, recruitmentModules);
  assert.ok(repaired.includes(`APPLY_REJECTED_MESSAGE='${message}'`));
  assert.equal(parse(repaired).APPLY_REJECTED_MESSAGE, message);
  assert.equal(parse(repaired).ENTRY_CHANNEL_ID, '123456789012345678');
  assert.equal((repaired.match(/Lo hemos revisado/g) || []).length, 1);
  const changed = message.replace('Antes de nada', 'Hola {user}, antes de nada');
  const saved = update(repaired, { APPLY_REJECTED_MESSAGE: changed }, recruitmentModules);
  assert.equal(parse(saved).APPLY_REJECTED_MESSAGE, changed);
  assert.equal((saved.match(/Lo hemos revisado/g) || []).length, 1);
});
