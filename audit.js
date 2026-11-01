import Database from 'better-sqlite3';
import { resolve } from 'node:path';

export function readAudit(env, base, params) {
  const db = new Database(resolve(base, env.DATABASE_PATH || './data/whitebird-wow-roles.sqlite'), { readonly: true, fileMustExist: true });
  try {
    const exists = name => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
    const sources = [
      ['roles', 'wow_sync_history', "created_at AS date, character_name AS character, user_id AS user, action || ' · ' || role_name || ' · ' || category AS detail", ''],
      ['bis', 'wow_bis_lists', "COALESCE(decided_at, created_at) AS date, character_name AS character, user_id AS user, status || ' · ' || activity AS detail", ''],
      ['ascensos', 'wow_raider_promotions', "COALESCE(sent_at, created_at) AS date, character_name AS character, user_id AS user, status AS detail", ''],
      ['versiones', 'published_release_notes', "published_at AS date, '' AS character, '' AS user, release_id AS detail", ''],
      ['ediciones-bis', 'wow_bis_item_edits', "e.edited_at AS date, l.character_name AS character, e.actor_user_id AS user, e.old_item_name || ' → ' || e.new_item_name AS detail", 'JOIN wow_bis_lists l ON l.id=e.list_id']
    ];
    const queries = [], bindings = [];
    for (const [type, table, columns, join] of sources) {
      if (!exists(table) || (join && !exists('wow_bis_lists'))) continue;
      queries.push(`SELECT '${type}' AS type, ${columns}, ${join ? 'e.id' : 'rowid'} AS record_id FROM ${table}${join ? ' e' : ''} ${join} WHERE ${join ? 'l.' : ''}guild_id=?`);
      bindings.push(env.DISCORD_GUILD_ID || '');
    }
    const page = Math.max(1, Math.min(1000000, Number.parseInt(params.get('page'), 10) || 1));
    if (!queries.length) return { rows: [], total: 0, page, pageSize: 50 };
    const filters = [], values = [];
    if (params.get('type')) { filters.push('type=?'); values.push(params.get('type')); }
    const search = (params.get('search') || '').slice(0, 200);
    if (search) { filters.push("instr(lower(character || ' ' || user || ' ' || detail), lower(?)) > 0"); values.push(search); }
    const query = `FROM (${queries.join(' UNION ALL ')}) ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''}`;
    const args = [...bindings, ...values];
    const total = db.prepare(`SELECT COUNT(*) AS total ${query}`).get(...args).total;
    const rows = db.prepare(`SELECT * ${query} ORDER BY date DESC, type, record_id DESC LIMIT 50 OFFSET ?`).all(...args, (page - 1) * 50);
    return { rows, total, page, pageSize: 50 };
  } finally { db.close(); }
}
