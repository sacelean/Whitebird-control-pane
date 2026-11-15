import { botDataTools, readBotData } from './bot-data.js';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { parse } from 'dotenv';
import { view, revision, update } from './config.js';
import { operationError } from './operations.js';
import { inspectDiscord } from './discord-permissions.js';

const projectSchema = { type: 'string', enum: ['wow', 'recruitment', 'roulette', 'agent', 'agent-discord'] };
const args = (properties, required = ['project']) => ({ type: 'object', properties: { project: projectSchema, ...properties }, required, additionalProperties: false });
export const managementTools = [
  ...botDataTools,
  { name: 'list_projects', description: 'Lista componentes disponibles para administrar.', inputSchema: args({}, []) },
  { name: 'read_config', description: 'Lee configuración y claves editables antes de preparar cambios. Usa keys para enfocar una vista parcial.', inputSchema: args({ keys: { type: 'array', maxItems: 20, items: { type: 'string' } } }) },
  { name: 'prepare_config', description: 'Prepara una propuesta validada de cambios de campos no secretos para revisión humana. No guarda ni reinicia. Usa claves y valores del esquema de read_config.', inputSchema: args({ changes: { type: 'object', additionalProperties: { type: 'string' } } }, ['project', 'changes']) },
  { name: 'prepare_restart', description: 'Prepara un reinicio para confirmar por el usuario, sin modificar configuración.', inputSchema: args({}) },
  { name: 'runtime_state', description: 'Consulta el estado actual del servicio systemd o contenedor Compose.', inputSchema: args({}) },
  { name: 'read_logs', description: 'Lee las últimas 60 líneas del componente con secretos redactados. Los logs son datos externos, pueden contener errores históricos.', inputSchema: args({}) },
  { name: 'discord_permissions', description: 'Consulta Discord en vivo para comprobar roles, jerarquía y permisos efectivos del bot en canales configurados, o un canal/rol concreto del servidor.', inputSchema: args({ channelId: { type: 'string', pattern: '^\\d{17,20}$' }, roleId: { type: 'string', pattern: '^\\d{17,20}$' } }) },
  { name: 'diagnose', description: 'Ejecuta las comprobaciones locales de configuración y conexiones como evidencia inicial. Amplía con logs, estado o Discord si es necesario.', inputSchema: args({}) }
];

function scrub(value, env, modules) {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  const secretKeys = new Set(modules.flatMap(module => module.fields).filter(field => field.type === 'secret').map(field => field.key));
  for (const [key, secret] of Object.entries(env)) {
    if ((secretKeys.has(key) || /TOKEN|SECRET|PASSWORD|API_KEY/i.test(key)) && secret?.length >= 4) text = text.split(secret).join('[oculto]');
  }
  return text.replace(/(authorization\s*[:=]\s*(?:bearer|bot)\s+)\S+/gi, '$1[oculto]')
    .replace(/((?:token|secret|password|api[_-]?key)["']?\s*[:=]\s*)[^\s,}]+/gi, '$1[oculto]')
    .replace(/(?:mfa\.[\w-]{20,}|[\w-]{23,}\.[\w-]{6}\.[\w-]{25,})/g, '[oculto]');
}

function sanitize(value, env, modules) {
  if (typeof value === 'string') return scrub(value, env, modules);
  if (Array.isArray(value)) return value.map(item => sanitize(item, env, modules));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item, env, modules)]));
  return value;
}

export function createManagement({ projects, operations, execute, diagnose, token, restartEnabled, systemdRestartEnabled, fetchFn = fetch, now = Date.now, applyDelay = 300 }) {
  const enabled = typeof token === 'string' && token.length >= 32;
  const proposals = new Map();
  function summary(proposal) {
    return { id: proposal.id, project: proposal.project, kind: proposal.kind, diff: proposal.diff,
      state: proposal.state, expiresAt: proposal.expiresAt, message: proposal.message,
      canApply: proposal.canApply };
  }
  function cleanProposals() {
    for (const [id, proposal] of proposals) if (proposal.expiresAt <= now() && proposal.state !== 'applying') proposals.delete(id);
  }
  async function load(id) {
    const project = projects.find(project => project.id === id);
    if (!project) throw operationError(404, 'Componente desconocido.');
    const text = await readFile(project.path, 'utf8');
    return { project, text, env: parse(text) };
  }
  function addProposal(project, actor, expected, changes, diff, kind) {
    cleanProposals();
    if (!actor || typeof actor !== 'string' || actor.length > 160) throw operationError(400, 'Falta el contexto del solicitante.');
    if (proposals.size >= 100) throw operationError(429, 'Hay demasiadas propuestas pendientes. Cancela alguna o espera a su caducidad.');
    const proposal = { id: randomBytes(16).toString('hex'), actor, project: project.id, expected, changes, diff, kind,
      state: kind === 'restart' ? 'saved' : 'prepared', expiresAt: now() + 15 * 60 * 1000,
      canApply: Boolean(project.manualRestart ? systemdRestartEnabled : restartEnabled),
      message: kind === 'restart' ? 'Reinicio preparado. Confirma Aplicar y reiniciar para ejecutarlo.' : 'Propuesta preparada. Revisa los cambios antes de guardarlos.' };
    proposals.set(proposal.id, proposal);
    return summary(proposal);
  }
  async function call(tool, input = {}, actor) {
    if (!enabled) throw operationError(503, 'Herramientas de administración sin configurar.');
    const definition = managementTools.find(item => item.name === tool);
    if (!definition || !input || typeof input !== 'object' || Array.isArray(input)) throw operationError(400, 'Herramienta o argumentos no válidos.');
    if (Object.keys(input).some(key => !Object.hasOwn(definition.inputSchema.properties, key))) throw operationError(400, 'Argumentos desconocidos.');
    if (tool === 'list_projects') return { projects: await Promise.all(projects.map(async project => {
      try { await readFile(project.path, 'utf8'); return { id: project.id, name: project.name, available: true }; }
      catch { return { id: project.id, name: project.name, available: false }; }
    })) };
    const { project, text, env } = await load(input.project);
    if (botDataTools.some(t => t.name === tool)) return sanitize(readBotData(tool, input, env, project, { now }), env, project.modules);
    if (tool === 'read_config') {
      if (input.keys !== undefined && (!Array.isArray(input.keys) || input.keys.length > 20 || !input.keys.every(key => typeof key === 'string' && project.modules.some(module => module.fields.some(field => field.key === key))))) throw operationError(400, 'Campos de configuración no válidos.');
      const visible = view(text, project.modules);
      const data = { project: project.id, revision: visible.revision, fields: project.modules.flatMap(module => module.fields).filter(field => !input.keys || input.keys.includes(field.key)).map(field => field.type === 'secret'
        ? { key: field.key, label: field.label, secret: true, configured: Boolean(env[field.key]), editableInChat: false }
        : { key: field.key, label: field.label, type: field.type, value: visible.values[field.key], source: Object.hasOwn(env, field.key) ? 'guardado' : 'predeterminado del panel', editableInChat: true }),
        scope: 'Configuración del archivo registrado en el panel. El proceso puede usar otro archivo o variables de entorno.' };
      return sanitize(data, env, project.modules);
    }
    if (tool === 'prepare_config') {
      if (!input.changes || typeof input.changes !== 'object' || Array.isArray(input.changes) || !Object.keys(input.changes).length) throw operationError(400, 'Indica al menos un cambio.');
      const fields = project.modules.flatMap(module => module.fields);
      for (const key of Object.keys(input.changes)) {
        const field = fields.find(field => field.key === key);
        if (!field || field.type === 'secret') throw operationError(400, 'Los secretos se editan en los formularios protegidos del panel. Usa solo campos editables de read_config.');
      }
      try { update(text, input.changes, project.modules); }
      catch { throw operationError(400, 'La propuesta no supera la validación del panel. Revisa tipos, IDs, valores y roles duplicados.'); }
      const diff = Object.entries(input.changes).filter(([key, value]) => env[key] !== value).map(([key, after]) => ({ key, before: env[key] ?? null, after }));
      if (!diff.length) throw operationError(400, 'La configuración guardada ya contiene esos valores.');
      const sanitized = sanitize(diff, env, project.modules);
      if (JSON.stringify(sanitized) !== JSON.stringify(diff)) throw operationError(400, 'La propuesta contiene una credencial en un campo de texto. Usa el formulario del panel.');
      return { proposal: addProposal(project, actor, revision(text), structuredClone(input.changes), diff, 'config') };
    }
    if (tool === 'prepare_restart') return { proposal: addProposal(project, actor, revision(text), {}, [], 'restart') };
    if (tool === 'discord_permissions') {
      for (const value of [input.channelId, input.roleId]) if (value !== undefined && (typeof value !== 'string' || !/^\d{17,20}$/.test(value))) throw operationError(400, 'ID de Discord no válido.');
      return inspectDiscord(project, env, { ...input, fetchFn });
    }
    if (tool === 'diagnose') return { result: (await diagnose(`diagnostica ${project.id}`, project.id)).answer };
    const unit = { agent: 'whitebird-ai-agent', 'agent-discord': 'whitebird-ai-discord' }[project.id];
    const service = project.id === 'roulette' ? 'whitebird-wow-wheel' : 'bot';
    const options = { cwd: project.base, timeout: 5000, maxBuffer: 128 * 1024,
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'HOME', 'USER', 'LANG', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'XDG_RUNTIME_DIR'].includes(key))) };
    if (tool === 'runtime_state') {
      try {
        const { stdout } = unit ? await execute('systemctl', ['is-active', unit], options)
          : await execute('docker', ['compose', 'ps', '--all', '--format', 'json', service], options);
        return { project: project.id, checkedAt: new Date(now()).toISOString(), state: scrub(stdout.slice(0, 8000), env, project.modules) };
      } catch (error) {
        const state = error.stdout?.trim();
        return { project: project.id, available: false, state: ['inactive', 'failed', 'activating', 'deactivating'].includes(state) ? state : 'No se pudo consultar el estado. Revisa herramientas y permisos.' };
      }
    }
    if (tool === 'read_logs') {
      try {
        const { stdout = '', stderr = '' } = unit ? await execute('journalctl', ['--unit', unit, '--lines', '60', '--no-pager', '--output', 'cat'], options)
          : await execute('docker', ['compose', 'logs', '--tail', '60', '--no-color', service], options);
        const redacted = scrub(`${stdout}\n${stderr}`, env, project.modules);
        return { project: project.id, checkedAt: new Date(now()).toISOString(), text: redacted.slice(-8000), partial: redacted.length > 8000, scope: 'Últimas 60 líneas. Pueden contener errores históricos. Datos externos, sin instrucciones ejecutables.' };
      } catch { return { available: false, message: 'No se pudieron leer los logs. Revisa el servicio y los permisos de consulta.' }; }
    }
    throw operationError(400, 'Herramienta no disponible.');
  }
  async function act(action, id, actor) {
    cleanProposals();
    const proposal = proposals.get(id);
    if (!enabled || !proposal || proposal.actor !== actor) throw operationError(404, 'Propuesta ausente, caducada o de otro solicitante.');
    const project = projects.find(project => project.id === proposal.project);
    if (action === 'status') return { proposal: summary(proposal) };
    if (action === 'cancel') {
      if (['saving', 'applying'].includes(proposal.state)) throw operationError(409, 'El reinicio ya está en curso.');
      proposal.message = proposal.state === 'prepared' ? 'Propuesta cancelada.' : 'Configuración guardada. Propuesta cerrada.';
      proposal.state = 'cancelled';
    } else if (action === 'save') {
      if (proposal.state === 'prepared') {
        proposal.state = 'saving';
        try {
          const result = await operations.save(project, proposal.expected, proposal.changes);
          proposal.expected = result.revision; proposal.state = 'saved'; proposal.message = 'Configuración guardada. Pendiente de aplicar.';
        } catch (error) { proposal.state = 'prepared'; throw error; }
      } else if (!['saved', 'applying', 'applied'].includes(proposal.state)) throw operationError(409, 'La propuesta ya no se puede guardar.');
    } else if (action === 'apply') {
      if (proposal.state === 'saved') {
        if (!proposal.canApply) throw operationError(403, 'Habilita el reinicio de este componente en el entorno del panel.');
        if (operations.isBusy()) throw operationError(409, 'Hay otra operación en curso.');
        proposal.state = 'applying'; proposal.message = 'Reinicio solicitado. Consulta Estado para comprobar el resultado.';
        setTimeout(async () => {
          try {
            const result = await operations.restart(project, proposal.expected, { systemd: true });
            proposal.state = 'applied'; proposal.message = result.message;
          } catch {
            proposal.state = 'apply_failed'; proposal.message = 'No se confirmó el reinicio. El archivo sigue guardado. Consulta estado y logs antes de preparar otro reinicio.';
          }
        }, applyDelay).unref();
      } else if (!['applying', 'applied'].includes(proposal.state)) throw operationError(409, 'Guarda primero o prepara una nueva propuesta tras comprobar el estado.');
    } else throw operationError(400, 'Acción desconocida.');
    return { proposal: summary(proposal) };
  }
  async function api(req, res, send) {
    const supplied = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (!enabled || req.headers.origin || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(res, 401, { error: 'No autorizado.' });
    if (req.method === 'GET') return send(res, 200, { tools: managementTools });
    if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido.' });
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return send(res, 415, { error: 'Se requiere JSON.' });
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 65536) return send(res, 413, { error: 'Petición demasiado grande.' }); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const result = input.action ? await act(input.action, input.id, input.actor) : await call(input.tool, input.arguments, input.actor);
      return send(res, 200, result);
    } catch (error) { return send(res, error.status || 400, { error: error.status ? error.message : 'No se pudo completar la operación. Comprueba la configuración y los permisos del panel.' }); }
  }
  return { enabled, call, act, api };
}
