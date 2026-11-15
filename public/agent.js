const form = document.getElementById('agent-form');
const question = document.getElementById('agent-question');
const submit = document.getElementById('agent-submit');
const status = document.getElementById('agent-status');
const messages = document.getElementById('agent-messages');
const dialog = document.getElementById('agent-dialog');
const launcher = document.getElementById('agent-open');
const retry = document.getElementById('agent-retry');
let csrf, busy = false, enabled = false;
// A new page gets a separate ephemeral conversation; no transcript is persisted.
const conversationId=globalThis.crypto?.randomUUID?.();
launcher.addEventListener('click', () => {
  dialog.showModal();
  if (enabled && !busy) question.focus();
});
document.getElementById('agent-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => launcher.focus());
function addMessage(author, text) {
  const message = document.createElement('div');
  message.className = `agent-message ${author === 'Tú' ? 'agent-user' : 'agent-assistant'}`;
  const label = document.createElement('strong');
  label.textContent = author;
  const content = document.createElement('p');
  // Model and tool output is untrusted text, never HTML.
  content.textContent = text;
  message.append(label, content);
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
  return message;
}
function proposalControls(message, proposal) {
  const controls = document.createElement('div');
  const actions = proposal.state === 'prepared' ? [['save', 'Guardar cambios'], ['cancel', 'Cancelar']]
    : proposal.state === 'saved' ? [['apply', 'Aplicar y reiniciar'], ['cancel', 'Cerrar propuesta']]
    : ['applying', 'apply_failed'].includes(proposal.state) ? [['status', 'Comprobar estado']] : [];
  for (const [action, label] of actions) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'secondary'; button.textContent = label;
    button.disabled = action === 'apply' && !proposal.canApply;
    button.addEventListener('click', async () => {
      if (busy) return;
      busy = true; submit.disabled = true;
      controls.querySelectorAll('button').forEach(button => { button.disabled = true; });
      let latest = proposal;
      try {
        const run = async action => {
          const response = await fetch('/api/agent', { method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Panel-CSRF': csrf },
            body: JSON.stringify({ action, id: proposal.id }) });
          const data = await response.json();
          if (!response.ok) throw Error(data.error || 'No se pudo completar la acción.');
          latest = data.proposal;
        };
        await run(action);
        status.textContent = latest.message;
        for (let attempt = 0; latest.state === 'applying' && attempt < 130; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await run('status');
          status.textContent = latest.message;
        }
        const result = addMessage('Asistente', latest.message);
        proposalControls(result, latest);
      } catch (error) {
        const result = addMessage('Asistente', error.message);
        proposalControls(result, latest);
      } finally { busy = false; submit.disabled = !enabled; }
    });
    controls.append(button);
  }
  if (proposal.state === 'saved' && !proposal.canApply) {
    const note = document.createElement('p');
    note.textContent = 'El reinicio de este componente requiere habilitación y permisos en el servidor del panel.';
    controls.append(note);
  }
  message.append(controls);
}

async function init() {
  enabled = false; submit.disabled = true; question.disabled = true; retry.hidden = true;
  status.textContent = 'Comprobando configuración del agente…';
  try {
    const response = await fetch('/api/agent');
    if (!response.ok) throw Error();
    const data = await response.json(); csrf = data.csrf; enabled = data.enabled === true;
    status.textContent = enabled ? (data.wowaudit ? 'Puedes consultar la configuración, preparar cambios, investigar errores y preguntar por los bots o WoWAudit.' : 'Diagnóstico local disponible. Para consultar WoWAudit, configura la conexión del agente.') : 'El chat está disponible, pero falta conectar el servicio de IA. Configura PANEL_AGENT_URL y PANEL_AGENT_TOKEN en el servidor del panel y reinícialo.';
  } catch { status.textContent = 'No se pudo comprobar la conexión del agente. Vuelve a comprobarla.'; }
  submit.disabled = !enabled; question.disabled = !enabled; retry.hidden = enabled;
}
retry.addEventListener('click', init);
form.addEventListener('submit', async event => {
  event.preventDefault();
  const prompt = question.value.trim();
  if (busy || !enabled || !prompt) return;
  busy = true; submit.disabled = true; question.disabled = true;
  addMessage('Tú', prompt);
  status.textContent = 'Comprobando la consulta…';
  try {
    const response = await fetch('/api/agent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Panel-CSRF': csrf },
      body: JSON.stringify({ question: prompt, ...(conversationId?{conversationId}:{}), project: document.getElementById('project').value })
    });
    const data = await response.json();
    if (!response.ok) {
      const error = data.error || 'No se pudo completar la consulta.';
      addMessage('Asistente', error); status.textContent = error;
      if (response.status === 403) { enabled = false; retry.hidden = false; }
      return;
    }
    const message = addMessage('Asistente', data.answer);
    if (data.proposal) proposalControls(message, data.proposal);
    question.value = '';
    status.textContent = data.tool ? `Herramienta consultada: ${data.tool}` : 'Consulta completada.';
  } catch {
    const error = 'No se pudo conectar con el agente. Vuelve a intentarlo.';
    addMessage('Asistente', error); status.textContent = error;
  } finally {
    busy = false; submit.disabled = !enabled; question.disabled = !enabled;
    if (dialog.open && enabled) question.focus();
  }
});
init();

