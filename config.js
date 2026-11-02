import { parse } from 'dotenv';
import { createHash } from 'node:crypto';

const field = (key, label, type = 'text', fallback = '') => ({ key, label, type, fallback });
export const modules = [
  { id: 'discord', name: 'Conexión con Discord', description: 'Servidor, permisos de oficiales y canales de comunicación.', fields: [field('DISCORD_TOKEN', 'Token del bot', 'secret'), field('DISCORD_CLIENT_ID', 'Application ID', 'id'), field('DISCORD_GUILD_ID', 'ID del servidor', 'id'), field('OFFICER_ROLE_IDS', 'Roles de oficiales (IDs separados por comas)', 'ids'), field('OFFICER_REPORT_CHANNEL_ID', 'Canal de informes', 'id'), field('RELEASE_NOTES_CHANNEL_ID', 'Canal de novedades', 'id')] },
  { id: 'daily-report', name: 'Informe y registros', description: 'Vista previa de sincronización, actividad guardada y estado actual de WoW Role Sync.', fields: [] },
  { id: 'roles', name: 'Sincronización de roles', description: 'Vinculación con Blizzard, rangos, profesiones y horario diario.', fields: [field('BLIZZARD_CLIENT_ID', 'Client ID de Battle.net'), field('BLIZZARD_CLIENT_SECRET', 'Client Secret de Battle.net', 'secret'), field('WOW_REGION', 'Región', 'region', 'eu'), field('WOW_LOCALE', 'Idioma de Blizzard', 'text', 'en_US'), field('WOW_GUILD_REALM_SLUG', 'Reino (slug)'), field('WOW_GUILD_SLUG', 'Hermandad (slug)'), field('WOW_DEFAULT_RANK_ROLE_ID', 'Rol por defecto / Viajante', 'id', '1463652921898963147'), field('WOW_RANK_ROLE_IDS', 'Mapa rango → ID de rol (JSON)', 'ranks', '{}'), field('WOW_PROFESSION_ROLE_IDS', 'Mapa profesión inglesa → ID de rol (JSON)', 'json', '{}'), field('WOW_SYNC_HOUR', 'Hora de sincronización (0–23)', 'hour', '4'), field('WOW_SYNC_TIMEZONE', 'Zona horaria IANA', 'timezone', 'Europe/Madrid')] },
  { id: 'roster', name: 'Rol conjunto roster', description: 'Opcional. Un ID vacío desactiva esta función; el rango 4 incluye del 0 al 4.', fields: [field('WOW_ROSTER_ROLE_ID', 'ID del rol roster', 'id'), field('WOW_ROSTER_MIN_RANK', 'Rango mínimo de Blizzard', 'integer', '4')] },
  { id: 'audit', name: 'WoWAudit y equipo', description: 'Informe de raiders, loot y avisos de encantamientos y gemas. Comparten la API key.', fields: [field('WOWAUDIT_API_KEY', 'API key de WoWAudit', 'secret'), field('WOWAUDIT_TEAM_ID', 'ID del equipo', 'positive', '66082'), field('WOWAUDIT_LOOT_WINDOW_DAYS', 'Ventana de loot en días (vacío: temporada)', 'days'), field('WOWAUDIT_LOOT_RANKS', 'Rangos incluidos', 'text', 'Oficiales,Fijo,Rotativo,Trial'), field('WOWAUDIT_LOOT_CATEGORIES', 'Categorías de loot', 'text', 'BIS,Mejora de stats,set 4p,Catalizar')] },
  { id: 'cauldrons', name: 'Calderos', description: 'Consulta el reparto guardado. Cambia las asignaciones desde Discord con /calderos-asignar, que actualiza el mensaje automáticamente. Avisos a las 22:00 de la zona de sincronización.', fields: [] },
  { id: 'bis', name: 'Listas BIS y ascensos', description: 'Propuestas con /bis-proponer. Las felicitaciones usan los roles Recluta y Raider. Estas funciones no tienen interruptor de configuración independiente en el bot actual.', fields: [] }
];
export const recruitmentModules = [
  { id: 'discord', name: 'Discord de recruitment', description: 'Credenciales propias de este bot y autorización de oficiales.', fields: modules[0].fields.filter(f => ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID','OFFICER_ROLE_IDS'].includes(f.key)) },
  { id: 'recruitment', name: 'Solicitudes y canales', description: 'Categorías de applies y raiders, y canal de transcripciones.', fields: [field('APPLY_CATEGORY_ID', 'Categoría de solicitudes', 'id'), field('RAIDER_CATEGORY_ID', 'Categoría de raiders', 'id'), field('ENTRY_CHANNEL_ID', 'Canal de transcripciones', 'id')] },
  { id: 'messages', name: 'Mensajes de recruitment', description: 'Vacío usa el texto predeterminado del bot. Variables: {user}, {character}, {realm}, {server} y {channel}; su disponibilidad depende del mensaje.', fields: [field('APPLY_RECEIVED_MESSAGE', 'Solicitud recibida', 'message'), field('APPLY_ACCEPTED_MESSAGE', 'Solicitud aceptada', 'message'), field('APPLY_REJECTED_MESSAGE', 'Solicitud rechazada', 'message')] },
  { id: 'questions', name: 'Preguntas del apply', description: 'Vacío conserva la pregunta predeterminada del bot.', fields: [field('APPLY_QUESTION_CHARACTER', 'Personaje'), field('APPLY_QUESTION_REALM', 'Reino'), field('APPLY_QUESTION_CLASS', 'Clase y especialización'), field('APPLY_QUESTION_EXPERIENCE', 'Experiencia'), field('APPLY_QUESTION_AVAILABILITY', 'Disponibilidad y motivación')] },
  { id: 'integration', name: 'Integración con WoW Sync', description: 'DATA_DIR es la carpeta del host usada por Compose. DATABASE_PATH es la ruta del proceso; Compose la inyecta como /app/wow-role-sync-data/whitebird-wow-roles.sqlite y prevalece sobre el .env.', fields: [field('WOW_ROLE_SYNC_DATA_DIR', 'Carpeta data de sync en el host'), field('WOW_ROLE_SYNC_DATABASE_PATH', 'Ruta SQLite compartida (ejecución directa)'), field('WOW_ROLE_SYNC_BOT_ID', 'ID de usuario del bot de sync', 'id')] }
];
export const rouletteModules = [
  { id: 'discord', name: 'Discord de ruleta', description: 'Credenciales propias del bot. El ID de servidor es opcional para registrar comandos globales; el panel lo necesita para filtrar el estado SQLite.', fields: recruitmentModules[0].fields },
  { id: 'wheel', name: 'Ruleta de alters', description: '13 clases fijas, una por persona y ronda. Publica con /ruleta-alter; ajusta roles con /alter-spec. El bot no expone parámetros para cambiar clases ni probabilidades.', fields: [] },
  { id: 'characters', name: 'Personajes y ranking', description: 'Vincula con /registrar-alter y actualiza con /ranking-alters actualizar:true. Raider.IO es público y no necesita API key; el periodo de caché está fijado a 30 minutos.', fields: [] }
];
export const fields = modules.flatMap(m => m.fields);
export const revision = text => createHash('sha256').update(text).digest('hex');
export function view(text, selectedModules = modules) {
  const fields = selectedModules.flatMap(m => m.fields);
  const env = parse(text);
  return { modules: selectedModules, revision: revision(text), values: Object.fromEntries(fields.filter(f => f.type !== 'secret').map(f => [f.key, env[f.key] ?? f.fallback])), secrets: Object.fromEntries(fields.filter(f => f.type === 'secret').map(f => [f.key, Boolean(env[f.key])])) };
}
// Use syntax shared by dotenv and Compose env_file. Backticks are not quotes in Compose.
function envLine(key, value) {
  let encoded;
  if (/^[A-Za-z0-9_./,:@%+=-]*$/.test(value)) encoded = value;
  else if (!value.includes("'") && !value.endsWith("\\")) encoded = `'${value}'`;
  else if (!/["$\\]/.test(value)) encoded = `"${value}"`;
  else throw Error(`${key}: el valor no puede representarse sin alterarlo en dotenv y Docker Compose.`);
  const line = `${key}=${encoded}`;
  if (parse(line)[key] !== value) throw Error(`${key}: el valor no puede representarse sin alterarlo en dotenv y Docker Compose.`);
  return line;
}
export function update(text, changes, selectedModules = modules) {
  const fields = selectedModules.flatMap(m => m.fields);
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw Error('Cambios no válidos.');
  const env = parse(text);
  for (const [key, value] of Object.entries(changes)) {
    const f = fields.find(f => f.key === key);
    if (!f || typeof value !== 'string' || value.length > 8000 || (f.type === 'message' ? /[\r\0]/ : /[\r\n\0]/).test(value)) throw Error(`Valor no válido: ${key}`);
    if (value) {
      if (f.type === 'id' && !/^\d{17,20}$/.test(value)) throw Error(`${f.label}: usa un ID de Discord válido.`);
      if (f.type === 'ids' && !value.split(',').every(v => /^\d{17,20}$/.test(v.trim()))) throw Error('Roles de oficiales: IDs no válidos.');
      if (['hour', 'integer', 'positive', 'days'].includes(f.type) && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < (['positive', 'days'].includes(f.type) ? 1 : 0) || (f.type === 'hour' && Number(value) > 23) || (f.type === 'days' && Number(value) > 3660))) throw Error(`${f.label}: número fuera de rango.`);
      if (f.type === 'region' && !['eu', 'us', 'kr', 'tw'].includes(value)) throw Error('Región no válida.');
      if (f.type === 'timezone') { try { new Intl.DateTimeFormat('es', { timeZone: value }); } catch { throw Error('Zona horaria no válida.'); } }
      if (['json', 'ranks'].includes(f.type)) {
        let map; try { map = JSON.parse(value); } catch { throw Error(`${f.label}: JSON no válido.`); }
        if (!map || typeof map !== 'object' || Array.isArray(map) || !Object.entries(map).every(([k,v]) => k.trim() && (f.type !== 'ranks' || /^\d+$/.test(k)) && typeof v === 'string' && /^\d{17,20}$/.test(v))) throw Error(`${f.label}: usa un objeto con IDs de Discord como texto.`);
      }
    }
    env[key] = value;
  }
  if (Object.keys(changes).some(k => ['WOW_RANK_ROLE_IDS','WOW_PROFESSION_ROLE_IDS','WOW_DEFAULT_RANK_ROLE_ID','WOW_ROSTER_ROLE_ID'].includes(k))) {
    let ids;
    try { ids = [...Object.values(JSON.parse(env.WOW_RANK_ROLE_IDS || '{}')), ...Object.values(JSON.parse(env.WOW_PROFESSION_ROLE_IDS || '{}')), env.WOW_DEFAULT_RANK_ROLE_ID || '1463652921898963147', env.WOW_ROSTER_ROLE_ID].filter(Boolean); } catch { throw Error('Corrige los mapas JSON de roles antes de guardar.'); }
    if (new Set(ids).size !== ids.length) throw Error('Los roles de rango, profesión, Viajante y roster deben ser distintos.');
  }
  // Repair legacy backtick quoting on managed fields, including unchanged secrets.
  // Values come from dotenv; credentials and unrelated variables remain intact.
  const writes = { ...changes };
  for (const f of fields) {
    if (Object.hasOwn(writes, f.key)) continue;
    const legacy = new RegExp(`^(?:export[ \t]+)?${f.key}[ \t]*=[ \t]*\x60`, 'm');
    if (legacy.test(text) && Object.hasOwn(env, f.key)) writes[f.key] = env[f.key];
  }
  let result = text;
  for (const [key, value] of Object.entries(writes)) {
    const line = envLine(key, value);
    const pattern = new RegExp(`^(?:export[ \t]+)?${key}[ \t]*=[ \t]*(?:"[^"]*"|'[^']*'|\x60[^\x60]*\x60|[^\r\n]*)[^\r\n]*$`, 'gm');
    if (pattern.test(result)) result = result.replace(pattern, () => line);
    else result += `${result.endsWith('\n') ? '' : '\n'}${line}\n`;
  }
  return result;
}
