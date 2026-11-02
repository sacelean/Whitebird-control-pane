import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';
import { update, modules, recruitmentModules, rouletteModules } from '../config.js';

const docker = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' });
test('dotenv y Compose leen los mismos valores guardados para los tres bots', { skip: docker.error?.code === 'ENOENT' ? 'Docker Compose no está instalado' : false }, () => {
  assert.equal(docker.status, 0, 'Docker Compose debe estar disponible');
  const dir = mkdtempSync(join(tmpdir(), 'whitebird-compose-env-'));
  try {
    const compose = join(dir, 'compose.yaml'), envFile = join(dir, '.env');
    writeFileSync(compose, 'services:\n  bot:\n    image: busybox\n    env_file:\n      - .env\n');
    const cases = [
      [modules, { WOW_ROSTER_ROLE_ID: '1566419007815417947', WOW_SYNC_HOUR: '6', WOW_RANK_ROLE_IDS: '{"0":"123456789012345678"}', WOWAUDIT_LOOT_CATEGORIES: 'BIS,Mejora de stats,set 4p', DISCORD_TOKEN: 'abc#xyz$hello', BLIZZARD_CLIENT_SECRET: String.raw`token\npart` }],
      [recruitmentModules, { APPLY_RECEIVED_MESSAGE: '**Hola {user}**\n`código` y "comillas"\nVARIABLE=texto # literal $HOME', APPLY_ACCEPTED_MESSAGE: "¡Hola! Tu solicitud está aceptada, it's done.", APPLY_REJECTED_MESSAGE: '', WOW_ROLE_SYNC_DATA_DIR: '/srv/wow/data', OFFICER_ROLE_IDS: '123456789012345678, 234567890123456789' }],
      [rouletteModules, { DISCORD_GUILD_ID: '123456789012345678', DISCORD_CLIENT_ID: '234567890123456789', DISCORD_TOKEN: 'token.normal-123' }]
    ];
    const rejection = 'Gracias por el apply.\n\nLo hemos revisado con calma, pero en este momento no podemos incorporarte en el roster.\n\nUn saludo y suerte. 💪';
    cases.push([recruitmentModules, { APPLY_REJECTED_MESSAGE: rejection }]);
    for (const [selectedModules, values] of cases) {
      const original = 'DISCORD_TOKEN=`old-token`\n' + (values.APPLY_REJECTED_MESSAGE ? `APPLY_REJECTED_MESSAGE=\x60${values.APPLY_REJECTED_MESSAGE}\x60\n` : '');
      const saved = update(original, values, selectedModules);
      writeFileSync(envFile, saved);
      // config resolves env_file without starting containers or accessing the daemon.
      const result = spawnSync('docker', ['compose', '--env-file', envFile, '-f', compose, 'config', '--format', 'json'], { encoding: 'utf8' });
      assert.equal(result.status, 0, 'Compose debe poder leer el archivo generado');
      // Compose renders literal dollars as $$ so its output can be read as Compose again.
      const rendered = JSON.parse(result.stdout).services.bot.environment;
      const environment = Object.fromEntries(Object.entries(rendered).map(([key, value]) => [key, value?.replaceAll('$$', '$')]));
      const dotenvValues = parse(saved);
      for (const key of Object.keys(dotenvValues)) {
        assert.ok(environment[key] === dotenvValues[key], `Compose y dotenv discrepan en ${key}`);
      }
      for (const key of Object.keys(values)) assert.ok(environment[key] === values[key], `Valor alterado en ${key}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
