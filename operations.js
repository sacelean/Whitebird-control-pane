import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { revision, update } from './config.js';

export function operationError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function createOperations({ execute, restartEnabled, systemdRestartEnabled = false }) {
  let busy = false;
  async function exclusive(work) {
    if (busy) throw operationError(409, 'Hay otro guardado o reinicio en curso.');
    busy = true;
    try { return await work(); } finally { busy = false; }
  }
  async function save(project, expectedRevision, changes) {
    return exclusive(async () => {
      const current = await readFile(project.path, 'utf8');
      if (expectedRevision !== revision(current)) throw operationError(409, 'La configuración ha cambiado. Recarga antes de guardar.');
      const next = update(current, changes, project.modules);
      const temp = `${project.path}.${randomBytes(8).toString('hex')}.tmp`;
      try { await writeFile(temp, next, { mode: 0o600, flag: 'wx' }); await rename(temp, project.path); }
      finally { await unlink(temp).catch(() => {}); }
      return { revision: revision(next) };
    });
  }
  async function restart(project, expectedRevision, { systemd = false } = {}) {
    if (project.manualRestart && !systemd) throw operationError(403, 'Este componente usa systemd. Reinicia su servicio manualmente después de guardar.');
    if (project.manualRestart ? !systemdRestartEnabled : !restartEnabled) throw operationError(403, 'Reinicio deshabilitado para este componente en el servidor del panel.');
    return exclusive(async () => {
      const current = await readFile(project.path, 'utf8');
      if (expectedRevision !== revision(current)) throw operationError(409, 'La configuración ha cambiado. Recarga antes de reiniciar.');
      const options = { cwd: project.base, timeout: 120000, maxBuffer: 1024 * 1024,
        env: Object.fromEntries(Object.entries(process.env).filter(([key]) =>
          ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'XDG_RUNTIME_DIR'].includes(key))) };
      try {
        if (project.manualRestart) {
          const unit = { agent: 'whitebird-ai-agent', 'agent-discord': 'whitebird-ai-discord' }[project.id];
          if (!unit) throw Error('Unknown service');
          await execute('systemctl', ['restart', unit], options);
        } else {
          await execute('docker', ['compose', 'up', '-d', '--no-deps', '--force-recreate', project.id === 'roulette' ? 'whitebird-wow-wheel' : 'bot'], options);
        }
      } catch {
        throw operationError(502, 'No se pudo confirmar el reinicio. La configuración sigue guardada. Comprueba el estado y los logs antes de reintentar.');
      }
      return { message: 'Reinicio completado. Comprueba la conexión a Discord y el funcionamiento del bot.' };
    });
  }
  return { save, restart, isBusy: () => busy };
}
