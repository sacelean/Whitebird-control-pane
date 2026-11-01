let config, page = 'overview', busy = false, selectedProject = 'wow';
const pending = {};
const $ = id => document.getElementById(id);
const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
function message(text, error = false) { $('notice').textContent = text; $('notice').className = error ? 'error' : ''; }
function dirty() { document.querySelectorAll('#content input, #content textarea, #content label button').forEach(node => { node.disabled = busy; }); $('restart').disabled = busy || !config?.restartEnabled || Object.keys(pending).length > 0; $('restart').title = !config?.restartEnabled ? 'Activa PANEL_RESTART_ENABLED en el servidor' : Object.keys(pending).length ? 'Guarda los cambios antes de reiniciar' : 'Recrea únicamente el bot seleccionado'; $('project').disabled = busy; $('reload').disabled = busy; const count = Object.keys(pending).length; $('changes').textContent = count ? `${count} ajuste${count === 1 ? '' : 's'} sin guardar` : 'Sin cambios pendientes'; $('save').disabled = !count || busy; $('discard').disabled = !count || busy; }
function readiness(id) {
  const v = config.values, s = config.secrets;
  if (config.project.id === 'roulette' && id !== 'discord') return 'Gestión en Discord';
  if (config.project.id === 'recruitment' && id !== 'discord') return 'Configuración guardada';
  if (id === 'discord') return s.DISCORD_TOKEN && v.DISCORD_GUILD_ID ? 'Credenciales guardadas' : 'Por configurar';
  if (id === 'roles') return v.BLIZZARD_CLIENT_ID && s.BLIZZARD_CLIENT_SECRET && v.WOW_GUILD_SLUG && v.WOW_GUILD_REALM_SLUG ? 'Datos guardados' : 'Por configurar';
  if (id === 'roster') return v.WOW_ROSTER_ROLE_ID ? 'ID configurado' : 'Desactivado';
  if (id === 'audit') return s.WOWAUDIT_API_KEY ? 'API key guardada' : 'Sin API key';
  return 'Gestión en Discord';
}
function table(title, headers, rows) {
  const box = el('section', undefined, 'panel'); box.append(el('h2', title));
  if (!rows.length) { box.append(el('p', 'Sin registros para este servidor.')); return box; }
  const wrap = el('div', undefined, 'table-wrap'), t = el('table'), head = el('thead'), tr = el('tr');
  headers.forEach(h => tr.append(el('th', h))); head.append(tr); t.append(head);
  const body = el('tbody'); rows.forEach(row => { const r = el('tr'); row.forEach(value => r.append(el('td', value ?? '—'))); body.append(r); });
  t.append(body); wrap.append(t); box.append(wrap); return box;
}
function renderState(container, scope = 'all') {
  const s = config.state;
  if (!s.available) { container.append(el('p', s.message, 'hint warning')); return; }
  if (config.project.id === 'roulette') {
    if (!config.values.DISCORD_GUILD_ID) { container.append(el('p', 'Indica el ID del servidor en Discord de ruleta para consultar sus registros.', 'hint warning')); return; }
    if (['all','wheel'].includes(scope)) {
      container.append(table('Asignaciones de la ronda', ['Usuario Discord','Clase','Rol','Fecha'], s.assignments.map(r => [r.user_id,r.class_name,r.role,r.assigned_at])));
      container.append(table('Panel de ruleta', ['Canal','Mensaje'], s.panels.map(r => [r.channel_id,r.message_id])));
    }
    if (['all','characters'].includes(scope)) container.append(table('Personajes y estadísticas guardadas', ['Personaje','Reino','Región','iLvl','Mejor M+','Última consulta'], s.characters.map(r => [r.character_name,r.realm,r.region,r.item_level,r.best_key,r.data_updated_at])));
    return;
  }
  if (config.project.id === 'recruitment') {
    if (['all','recruitment'].includes(scope)) container.append(table('Panel de solicitudes publicado', ['Canal','Mensaje','Actualización'], s.panels.map(r => [r.channel_id,r.message_id,r.updated_at])));
    return;
  }
  if (['all','roles','roster'].includes(scope)) container.append(table('Vinculaciones actuales', ['Personaje','Reino','Usuario Discord','Canal Raider'], s.links.map(r => [r.character_name,r.realm_slug,r.user_id,r.raider_channel_id])));
  if (['all','cauldrons'].includes(scope)) {
    container.append(table('Reparto de calderos', ['Día','Tipo','Personaje'], s.assignments.map(r => [r.weekday,r.cauldron_type,r.character_name])));
    container.append(table('Panel de calderos', ['Canal','Mensaje'], s.cauldronPanel.map(r => [r.channel_id,r.message_id])));
  }
  if (['all','audit'].includes(scope)) container.append(table('Destino del informe de raiders', ['Canal Discord'], s.raiderDestination.map(r => [r.channel_id])));
  if (['all','roles'].includes(scope)) container.append(table('Últimos cambios de roles', ['Fecha','Personaje','Acción','Rol'], s.history.map(r => [r.created_at,r.character_name,r.action,r.role_name])));
}
function render() {
  if (!config) return;
  const content = $('content'); content.replaceChildren();
  document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  const module = config.modules.find(m => m.id === page);
  $('breadcrumb').textContent = `${config.project.name} / ${module?.name || 'Vista general'}`;
  $('title').textContent = module?.name || 'Tu servidor, en un solo lugar.';
  $('subtitle').textContent = module?.description || 'Consulta la configuración y organiza las funciones de la hermandad por módulos.';
  content.append(el('p', config.runtime, 'hint'));
  if (!module) {
    const stats = el('div', undefined, 'stats');
    const summary = config.project.id === 'roulette'
      ? [['Servidor Discord', config.values.DISCORD_GUILD_ID || 'Sin configurar'], ['Clases asignadas', config.state.available ? config.state.assignments.length : 'No disponible'], ['Personajes vinculados', config.state.available ? config.state.characters.length : 'No disponible']]
      : config.project.id === 'recruitment'
      ? [['Servidor Discord', config.values.DISCORD_GUILD_ID || 'Sin configurar'], ['Categoría de solicitudes', config.values.APPLY_CATEGORY_ID || 'Sin configurar'], ['Categoría de raiders', config.values.RAIDER_CATEGORY_ID || 'Sin configurar']]
      : [['Servidor Discord', config.values.DISCORD_GUILD_ID || 'Sin configurar'], ['Vínculos guardados', config.state.available ? config.state.links.length : 'No disponible'], ['Sincronización diaria', `${config.values.WOW_SYNC_HOUR || '4'}:00 · ${config.values.WOW_SYNC_TIMEZONE || 'Europe/Madrid'}`]];
    summary.forEach(([label,value]) => { const box = el('div', undefined, 'stat'); box.append(el('small', label), el('strong', value, label === 'Vínculos guardados' ? '' : 'identifier')); stats.append(box); }); content.append(stats);
    const heading = el('div', undefined, 'section-heading'); heading.append(el('h2', 'Módulos de la solución'), el('span', `${config.modules.length} módulos`)); content.append(heading);
    const grid = el('div', undefined, 'grid');
    config.modules.forEach((m,i) => { const card = el('article', undefined, 'card'), top = el('div', undefined, 'card-top'), status = readiness(m.id); top.append(el('span', ['◈','⇄','◎','▤','♧','✧'][i], 'icon'), el('span', status, `badge ${status.includes('guardad') || status === 'ID configurado' ? 'ready' : ''}`)); const button = el('button', m.fields.length ? 'Configurar módulo →' : 'Ver módulo →'); button.onclick = () => navigate(m.id); card.append(top, el('h3',m.name), el('p',m.description), button); grid.append(card); }); content.append(grid); renderState(content);
  } else {
    if (module.fields.length) {
      const form = el('section', undefined, 'panel'), grid = el('div', undefined, 'form-grid');
      module.fields.forEach(f => {
        const label = el('label', f.label), input = el(['json','ranks'].includes(f.type) ? 'textarea' : 'input');
        if (input.tagName === 'INPUT') input.type = f.type === 'secret' ? 'password' : 'text';
        input.id = f.key; input.name = f.key; input.autocomplete = 'off'; input.spellcheck = false;
        input.value = pending[f.key] ?? config.values[f.key] ?? '';
        if (f.type === 'secret') input.placeholder = config.secrets[f.key] ? 'Guardado · escribe para sustituir' : 'Sin configurar';
        input.addEventListener('input', () => { if (input.value === (config.values[f.key] ?? '') && f.type !== 'secret') delete pending[f.key]; else if (f.type === 'secret' && !input.value) delete pending[f.key]; else pending[f.key] = input.value; dirty(); });
        label.append(input, el('small',f.key));
        if (f.type === 'secret') { const clear = el('button', 'Eliminar credencial guardada', 'secondary'); clear.type = 'button'; clear.onclick = e => { e.preventDefault(); pending[f.key] = ''; input.value = ''; input.placeholder = 'Se eliminará al guardar'; dirty(); }; label.append(clear); }
        grid.append(label);
      }); form.append(grid); content.append(form);
      content.append(el('p', `Los secretos vacíos se conservan salvo que pulses «Eliminar credencial guardada». Guarda los cambios y pulsa «Aplicar guardado y reiniciar», o ejecuta desde el proyecto: docker compose up -d --force-recreate ${config.project.id === 'roulette' ? 'whitebird-wow-wheel' : 'bot'}.`, 'hint warning'));
    }
    if (page === 'audit') content.append(el('p', 'Informe: miércoles a las 20:00. Avisos de equipo: cada día a las 22:00. Ambos usan Europe/Madrid, fijado en el bot. Configura el destino con /informe-raiders.', 'hint'));
    if (page === 'bis') content.append(el('p', 'Las propuestas BIS y los ascensos se gestionan desde el bot. Esta primera versión del panel no edita listas ni mensajes de Discord.', 'hint'));
    renderState(content, page);
  }
  dirty();
}
function navigate(next) { page = next; render(); window.scrollTo({ top: 0 }); }
async function load() {
  const response = await fetch(`/api/config?project=${selectedProject}`); const data = await response.json(); if (!response.ok) throw Error(data.error || 'Error al cargar.'); config = data;
  const nav = $('navigation'); nav.replaceChildren(); config.modules.forEach(m => { const b = el('button',m.name); b.dataset.page = m.id; b.onclick = () => navigate(m.id); nav.append(b); }); render();
}
$('reload').onclick = async () => { if (Object.keys(pending).length && !confirm('¿Descartar los cambios y volver a leer el servidor?')) return; try { await load(); Object.keys(pending).forEach(k => delete pending[k]); render(); message('Configuración y SQLite actualizados.'); } catch(e) { message(e.message,true); } };
$('discard').onclick = () => { Object.keys(pending).forEach(k => delete pending[k]); render(); message('Cambios descartados.'); };
$('restart').onclick = async () => {
  if (busy || !config?.restartEnabled || Object.keys(pending).length) return;
  if (!confirm(`¿Recrear ${config.project.name} con su configuración guardada? El bot se desconectará brevemente.`)) return;
  busy = true; dirty(); message(`Recreando ${config.project.name}…`);
  try {
    const response = await fetch(`/api/restart?project=${selectedProject}`, {
      method: 'POST', headers: { 'X-Panel-CSRF': config.csrf, 'X-Panel-Revision': config.revision }
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    message(data.message);
  } catch (e) { message(e.message, true); }
  finally { busy = false; dirty(); }
};
$('save').onclick = async () => {
  busy = true; dirty();
  try { const response = await fetch(`/api/config?project=${selectedProject}`, { method:'PUT', headers:{ 'Content-Type':'application/json', 'X-Panel-CSRF':config.csrf }, body:JSON.stringify({ revision: config.revision, changes: pending }) }); const data = await response.json(); if (!response.ok) throw Error(data.error); Object.keys(pending).forEach(k => delete pending[k]); await load(); message(data.message); }
  catch(e) { message(e.message,true); } finally { busy = false; dirty(); }
};
document.querySelector('[data-page="overview"]').onclick = () => navigate('overview');
window.addEventListener('beforeunload', event => { if (Object.keys(pending).length) { event.preventDefault(); event.returnValue = ''; } });
async function start() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw Error('No se pudo consultar la lista de bots.');
  const projects = await response.json();
  $('project').replaceChildren();
  projects.forEach(p => { const option = el('option', `${p.name}${p.available ? '' : ' · No disponible'}`); option.value = p.id; option.disabled = !p.available; $('project').append(option); });
  const available = projects.find(p => p.id === selectedProject && p.available) || projects.find(p => p.available);
  $('project-help').textContent = projects.filter(p => !p.available).map(p => `${p.name}: ${p.message}`).join(' ');
  if (!available) { $('content').textContent = 'No hay archivos de configuración disponibles. Consulta las rutas en README.md.'; return; }
  selectedProject = available.id; $('project').value = selectedProject;
  await load();
}
$('project').onchange = async () => {
  const next = $('project').value, previous = selectedProject;
  if (Object.keys(pending).length && !confirm('¿Descartar los cambios antes de cambiar de bot?')) { $('project').value = previous; return; }
  selectedProject = next;
  try { Object.keys(pending).forEach(k => delete pending[k]); page = 'overview'; await load(); message(`Configuración de ${config.project.name} cargada.`); }
  catch(e) { selectedProject = previous; $('project').value = previous; render(); message(e.message,true); }
};
start().catch(e => message(`No se pudo cargar el panel: ${e.message}`,true));
