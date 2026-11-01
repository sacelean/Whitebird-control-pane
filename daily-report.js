import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function formatDailyReport(report) {
  const lines = [
    `Sincronización diaria: ${report.synced || 0} vinculaciones procesadas.`,
    `Cambios de rol: ${report.roleChanges?.length || 0} · Rangos comprobados: ${report.ranksChecked || 0} · Profesiones comprobadas: ${report.professionsChecked || 0}.`,
    `Fuera del roster: ${report.outsideRoster || 0} · Viajante aplicado: ${report.outsideRosterDefaultApplied || 0} · Canales renombrados: ${report.channelsRenamed || 0}.`
  ];
  const details = [
    ...(report.roleChanges || []).slice(0, 6).map(c => `• ${c.characterName}: ${c.action === 'added' ? 'añadido' : 'retirado'} ${c.roleName} (${c.category})`),
    ...(report.channelChanges || []).slice(0, 3).map(c => `• Canal: ${c}`),
    ...(report.skipped || []).slice(0, 4).map(c => `• Omitido: ${c}`),
    ...(report.failed || []).slice(0, 4).map(c => `• Error: ${c}`),
    ...(report.channelFailures || []).slice(0, 3).map(c => `• Canal: ${c}`)
  ];
  return [...lines, '', ...details].join('\n').slice(0, 1950);
}
export async function dailyReport(env, base, state) {
  if (!state.available) return { available: false, message: 'La vista previa necesita leer las vinculaciones guardadas en SQLite. Comprueba la ruta y los permisos.' };
  return new Promise(resolve => {
    const child = execFile(process.execPath, [fileURLToPath(new URL('./daily-report-worker.js', import.meta.url))], {
      env: { PATH: process.env.PATH, ...env }, timeout: 120000, maxBuffer: 1024 * 1024
    }, (error, stdout) => {
      try {
        if (error) throw error;
        const result = JSON.parse(stdout);
        resolve(result.available ? { available: true, content: formatDailyReport(result.report), timestamp: result.timestamp } : result);
      } catch { resolve({ available: false, message: 'No se pudo completar la vista previa en el tiempo disponible.' }); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ base, links: state.links }));
  });
}
