// Discord's documented permission and overwrite order.
// https://docs.discord.com/developers/topics/permissions
const flags = { ViewChannel: 1n << 10n, SendMessages: 1n << 11n, EmbedLinks: 1n << 14n,
  AttachFiles: 1n << 15n, ReadMessageHistory: 1n << 16n, ManageChannels: 1n << 4n,
  ManageRoles: 1n << 28n, ViewAuditLog: 1n << 7n };
const admin = 1n << 3n;
const validId = value => typeof value === 'string' && /^\d{17,20}$/.test(value);

export function effectivePermissions(roles, member, guildId, channel) {
  const memberIds = new Set([guildId, ...member.roles]);
  let permissions = roles.filter(role => memberIds.has(role.id)).reduce((bits, role) => bits | BigInt(role.permissions), 0n);
  if (permissions & admin) return Object.fromEntries(Object.keys(flags).map(name => [name, true]));
  if (channel) {
    const overwrites = channel.permission_overwrites || [];
    const everyone = overwrites.find(overwrite => overwrite.id === guildId && Number(overwrite.type) === 0);
    if (everyone) permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
    const matched = overwrites.filter(overwrite => Number(overwrite.type) === 0 && overwrite.id !== guildId && memberIds.has(overwrite.id));
    const deny = matched.reduce((bits, overwrite) => bits | BigInt(overwrite.deny), 0n);
    const allow = matched.reduce((bits, overwrite) => bits | BigInt(overwrite.allow), 0n);
    permissions = (permissions & ~deny) | allow;
    const individual = overwrites.find(overwrite => Number(overwrite.type) === 1 && overwrite.id === member.user.id);
    if (individual) permissions = (permissions & ~BigInt(individual.deny)) | BigInt(individual.allow);
  }
  const result = Object.fromEntries(Object.entries(flags).map(([name, bit]) => [name, Boolean(permissions & bit)]));
  if (channel && !result.ViewChannel) for (const name of Object.keys(result)) result[name] = false;
  if (channel && !result.SendMessages) { result.EmbedLinks = false; result.AttachFiles = false; }
  return result;
}

function higherThan(a, b) {
  return a.position > b.position || (a.position === b.position && BigInt(a.id) < BigInt(b.id));
}

export async function inspectDiscord(project, env, { channelId, roleId, fetchFn = fetch } = {}) {
  const token = env.DISCORD_BOT_TOKEN || env.DISCORD_TOKEN;
  const guildId = env.DISCORD_GUILD_ID;
  if (!token || !validId(guildId)) return { available: false, message: 'Configura token y DISCORD_GUILD_ID para consultar Discord.' };
  async function get(path) {
    const response = await fetchFn(`https://discord.com/api/v10${path}`, {
      headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(8000), redirect: 'error'
    });
    if (!response.ok) throw Error('Discord unavailable');
    const data = await response.json();
    if (JSON.stringify(data).length > 1024 * 1024) throw Error('Discord response too large');
    return data;
  }
  try {
    const me = await get('/users/@me');
    if (!validId(me.id)) throw Error('Invalid bot');
    const [member, roles, channels] = await Promise.all([
      get(`/guilds/${guildId}/members/${me.id}`), get(`/guilds/${guildId}/roles`), get(`/guilds/${guildId}/channels`)
    ]);
    if (!Array.isArray(member.roles) || !Array.isArray(roles) || !Array.isArray(channels)) throw Error('Invalid guild');
    const heldRoles = roles.filter(role => role.id === guildId || member.roles.includes(role.id));
    const highest = heldRoles.reduce((highest, role) => !highest || higherThan(role, highest) ? role : highest, null);
    if (!highest) throw Error('No role');
    const guildPermissions = effectivePermissions(roles, member, guildId);
    const configuredChannels = Object.entries(env).filter(([key]) => /(?:CHANNEL_IDS?|CATEGORY_ID)$/.test(key)).flatMap(([, value]) => value.split(',').map(id => id.trim())).filter(validId);
    const wantedChannels = channelId ? [channelId] : [...new Set(configuredChannels)];
    const channelChecks = wantedChannels.slice(0, 20).map(id => {
      const channel = channels.find(channel => channel.id === id);
      if (!channel) return { id, available: false, message: 'Canal ausente o inaccesible en el servidor configurado.' };
      if (![0, 4, 5, 15, 16].includes(channel.type)) return { id, available: false, message: 'Tipo de canal sin evaluación de envío en esta inspección.' };
      return { id, type: channel.type, available: true, permissions: effectivePermissions(roles, member, guildId, channel) };
    });
    const managedIds = new Set(Object.entries(env).filter(([key]) => /^WOW_(?:DEFAULT_RANK|ROSTER)_ROLE_ID$/.test(key)).map(([, value]) => value));
    const combatRoles = [];
    if (project.id === 'wow' && (env.WOWAUDIT_API_KEY || env.WOW_ROSTER_ROLE_ID)) {
      for (const name of ['Tankes', 'Healers', 'DPS']) {
        const matches = roles.filter(role => String(role.name || '').trim().toLowerCase() === name.toLowerCase());
        combatRoles.push({ name, roleIds: matches.map(role => role.id), unique: matches.length === 1 });
        for (const role of matches) managedIds.add(role.id);
      }
    }
    const configuredRoles = Object.entries(env).filter(([key]) => /ROLE_IDS?$/.test(key)).flatMap(([, value]) => value.split(',').map(id => id.trim())).filter(validId);
    for (const key of ['WOW_RANK_ROLE_IDS', 'WOW_PROFESSION_ROLE_IDS']) {
      try {
        const ids = Object.values(JSON.parse(env[key] || '{}')).filter(validId);
        configuredRoles.push(...ids);
        for (const id of ids) managedIds.add(id);
      } catch {}
    }
    if (project.id === 'wow') {
      const fallbackRole = env.WOW_DEFAULT_RANK_ROLE_ID || '1463652921898963147';
      configuredRoles.push(fallbackRole); managedIds.add(fallbackRole);
    }
    configuredRoles.push(...managedIds);
    const wantedRoles = roleId ? [roleId] : [...new Set(configuredRoles)];
    const roleChecks = wantedRoles.slice(0, 100).map(id => {
      const role = roles.find(role => role.id === id);
      return { id, exists: Boolean(role), requiredForAssignment: managedIds.has(id), manageable: Boolean(role && id !== guildId && !role.managed && higherThan(highest, role) && guildPermissions.ManageRoles) };
    });
    return { available: true, checkedAt: new Date().toISOString(), botId: me.id, guildId,
      highestRole: { id: highest.id, position: highest.position }, guildPermissions,
      channels: channelChecks, roles: roleChecks, combatRoles,
      partial: wantedChannels.length > 20 || wantedRoles.length > 100,
      scope: 'Permisos actuales del bot. Los roles de autorización solo requieren existencia; la jerarquía es requisito para los roles que el bot asigna. Los hilos, permisos particulares de comandos y acceso de usuarios requieren comprobación específica.' };
  } catch { return { available: false, message: 'Discord no permitió completar la inspección. Revisa token, servidor, permisos y conectividad. Puede existir un límite de peticiones.' }; }
}
