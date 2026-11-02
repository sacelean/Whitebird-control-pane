import Database from 'better-sqlite3';
import { resolve } from 'node:path';

export function recruitmentRecords(env, base, before) {
  if (!env.DISCORD_GUILD_ID) return { available: false, message: 'Configura el servidor de recruitment.' };
  if (before && !/^[1-9]\d{0,14}$/.test(before)) throw Error('Cursor de registros inválido.');
  let db;
  try {
    db = new Database(resolve(base, env.DATABASE_PATH || './data/whitebird-recruitment.sqlite'), { readonly: true, fileMustExist: true });
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='recruitment_decisions'").get()) {
      return { available: false, message: 'Actualiza y reinicia el bot de recruitment para activar el registro de decisiones.' };
    }
    const rows = db.prepare(`SELECT rowid AS id, * FROM recruitment_decisions
      WHERE guild_id=? ${before ? 'AND rowid < ?' : ''} ORDER BY rowid DESC LIMIT 101`)
      .all(...[env.DISCORD_GUILD_ID, ...(before ? [Number(before)] : [])]);
    const records = rows.slice(0, 100).map(row => ({
      id: row.id, date: `${row.decided_at.replace(' ', 'T')}Z`, decision: row.decision,
      character: row.character, realm: row.realm, applicant: row.applicant, officer: row.officer,
      reason: row.reason, status: row.status, linked: Boolean(row.linked),
      channelCreated: Boolean(row.channel_created), channelId: row.raider_channel_id
    }));
    return { available: true, records, next: rows.length > 100 ? String(records.at(-1).id) : null,
      message: 'Registro guardado por recruitment. La vinculación y creación del canal indican pasos realizados por el bot. Las decisiones anteriores a este registro no se incluyen.' };
  } catch { return { available: false, message: 'No se pudo leer el registro SQLite de recruitment. Revisa la ruta y los permisos.' }; }
  finally { db?.close(); }
}
