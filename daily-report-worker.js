import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

// Run the bot's own sync algorithm in an isolated process with read-only adapters.
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options = {}) => {
  const target = new URL(url);
  const method = (options.method || 'GET').toUpperCase();
  const allowed = (method === 'GET' && (target.hostname === 'discord.com' || /^[a-z]{2}\.api\.blizzard\.com$/.test(target.hostname))) ||
    (method === 'POST' && target.href === 'https://oauth.battle.net/token');
  if (!allowed) throw Error('La vista previa solo permite consultas.');
  return originalFetch(url, { ...options, signal: AbortSignal.timeout(15000) });
};
const cache = entries => {
  const map = new Map(entries);
  map.find = predicate => [...map.values()].find(predicate);
  return map;
};
async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { base, links } = JSON.parse(input);
  const api = async path => {
    const response = await fetch(`https://discord.com/api/v10${path}`, { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` } });
    if (!response.ok) throw Error(`Discord HTTP ${response.status}`);
    return response.json();
  };
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!/^\d{17,20}$/.test(guildId || '') || !process.env.DISCORD_TOKEN) throw Error('Configuración de Discord incompleta');
  const [roleData, channelData, bot] = await Promise.all([api(`/guilds/${guildId}/roles`), api(`/guilds/${guildId}/channels`), api('/users/@me')]);
  const roles = cache(roleData.map(role => [role.id, role]));
  const channels = cache(channelData.map(channel => [channel.id, { ...channel, async setName(name) { this.name = name; } }]));
  const members = new Map();
  const guild = {
    id: guildId, roles: { cache: roles },
    channels: { cache: channels, async fetch(id) { return id ? channels.get(id) : channels; } },
    members: {
      async fetchMe() { return this.fetch(bot.id); },
      async fetch(value) {
        const id = typeof value === 'string' ? value : value.user;
        if (members.has(id)) return members.get(id);
        const data = await api(`/guilds/${guildId}/members/${id}`);
        const owned = cache(data.roles.map(roleId => [roleId, roles.get(roleId)]));
        const member = { id, guild, roles: {
          cache: owned,
          highest: [...owned.values()].filter(Boolean).sort((a, b) => b.position - a.position)[0] || { position: 0 },
          async add(roleId) { owned.set(roleId, roles.get(roleId)); },
          async remove(roleId) { owned.delete(roleId); }
        } };
        members.set(id, member); return member;
      }
    }
  };
  const { synchronizeWowRoles } = await import(pathToFileURL(join(base, 'src/wow-sync.js')).href);
  const report = links.length ? await synchronizeWowRoles(guild, links) : { synced: 0 };
  process.stdout.write(JSON.stringify({ available: true, report, timestamp: new Date().toISOString() }));
}
main().catch(() => {
  process.stdout.write(JSON.stringify({ available: false, message: 'No se pudo generar la vista previa. Comprueba las credenciales de Blizzard y Discord, los permisos, la jerarquía de roles y la instalación de WoW Role Sync.' }));
});
