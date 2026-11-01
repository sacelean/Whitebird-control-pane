import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyReport, formatDailyReport } from '../daily-report.js';

test('vista previa: formatea cambios, omisiones y errores como el informe diario', () => {
  const result = formatDailyReport({ synced: 2, ranksChecked: 2, professionsChecked: 1,
    outsideRoster: 1, outsideRosterDefaultApplied: 1, channelsRenamed: 1,
    roleChanges: [{ characterName: 'Raider', action: 'added', roleName: 'Oficial', category: 'rango' }],
    channelChanges: ['trial-raider → oficial-raider'], skipped: ['Profesiones no disponibles'], failed: ['Error de rango'], channelFailures: ['Canal no encontrado'] });
  assert.match(result, /2 vinculaciones procesadas/);
  assert.match(result, /Cambios de rol: 1/);
  assert.match(result, /Raider: añadido Oficial/);
  assert.match(result, /trial-raider → oficial-raider/);
  assert.match(result, /Omitido: Profesiones/);
  assert.match(result, /Error: Error de rango/);
  assert.match(result, /Canal: Canal no encontrado/);
  assert.ok(result.length <= 1950);
});
test('vista previa: no inventa resultados sin acceso a SQLite', async () => {
  const result = await dailyReport({}, '/not-present', { available: false });
  assert.equal(result.available, false);
  assert.match(result.message, /SQLite/);
});
test('vista previa: aísla configuración del bot y no filtra secretos en errores', async () => {
  const result = await dailyReport({ DISCORD_TOKEN: 'private-secret' }, '/not-present', { available: true, links: [] });
  assert.equal(result.available, false);
  assert.ok(!JSON.stringify(result).includes('private-secret'));
});
