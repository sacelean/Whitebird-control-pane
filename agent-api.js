export function isDiagnosticQuestion(question) {
  const text = question.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (/diagnost|misconfig|missconfig|no (?:arranca|funciona|conecta|responde)|\blogs?\b|\berror(?:es)?\b|\bfalla\b|\bfallos?\b/.test(text)) return true;
  if (/como|explica|que (?:hace|es|significa|permisos|comandos)|para que|funciona|ayuda/.test(text)) return false;
  return /configura|\bpermisos?\b|\bpuertos?\b|\btokens?\b|estado.*(?:bot|servicio|panel|agente)/.test(text);
}

// Installed in the root of Whitebird-control-pane. Token stays on the server.
export function createAgentApi({ url = process.env.PANEL_AGENT_URL, token = process.env.PANEL_AGENT_TOKEN, fetchFn = fetch, diagnose, managementEnabled = false, act } = {}) {
  let endpoint;
  if (url) {
    try {
      endpoint = new URL(url);
      if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw new Error('PANEL_AGENT_URL must be an HTTP loopback origin (127.0.0.1)');
    } catch (error) {
      if (!diagnose) throw error;
      endpoint = undefined;
    }
  }
  const enabled = Boolean(endpoint && token?.length >= 32);
  return async function agentApi(req, res, { csrf, send }) {
    if (req.method === 'GET') return send(res, 200, { enabled: enabled || Boolean(diagnose), csrf, ...(diagnose ? { diagnostics: true, wowaudit: enabled } : {}) });
    if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido.' });
    if (req.headers['x-panel-csrf'] !== csrf) return send(res, 403, { error: 'Recarga el panel antes de consultar.' });
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return send(res, 415, { error: 'Se requiere JSON.' });
    let input;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) return send(res, 413, { error: 'Consulta demasiado grande.' });
        chunks.push(chunk);
      }
      input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return send(res, 400, { error: 'JSON no válido.' }); }
    if (input?.action && act) {
      try { return send(res, 200, await act(input.action, input.id, `panel:${csrf}`)); }
      catch (error) { return send(res, error.status || 502, { error: error.status ? error.message : 'No se pudo completar la acción.' }); }
    }
    if (!input || typeof input.question !== 'string' || !input.question.trim() || input.question.trim().length > 1000) return send(res, 400, { error: 'Escribe una pregunta de 1 a 1000 caracteres.' });
    if (input.conversationId !== undefined && (typeof input.conversationId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.conversationId))) return send(res,400,{error:'Conversación no válida.'});
    if (diagnose && (!managementEnabled || !enabled) && isDiagnosticQuestion(input.question)) {
      try { return send(res, 200, await diagnose(input.question.trim(), input.project)); }
      catch { return send(res, 502, { error: 'No se pudo completar el diagnóstico. Revisa los permisos del panel.' }); }
    }
    if (!enabled) return send(res, 503, { error: 'Configura PANEL_AGENT_URL y PANEL_AGENT_TOKEN en el servidor para consultar WoWAudit. Puedes pedir un diagnóstico del panel.' });
    try {
      const response = await fetchFn(new URL('/ask', endpoint), {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(300000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: input.question.trim(), ...(managementEnabled || input.conversationId ? { actor: `panel:${csrf}` } : {}), ...(input.conversationId?{conversationId:`panel:${input.conversationId}`}:{}), ...(typeof input.project === 'string' && input.project ? { project: input.project } : {}) })
      });
      if (response.status === 429) return send(res, 429, { error: 'El agente está ocupado. Vuelve a intentarlo cuando termine.' });
      if (!response.ok) throw new Error('Agent unavailable');
      const data = await response.json();
      if (typeof data.answer !== 'string' || !(data.tool === null || typeof data.tool === 'string')) throw new Error('Invalid response');
      return send(res, 200, { answer: data.answer, tool: data.tool, ...(data.proposal ? { proposal: data.proposal } : {}) });
    } catch {
      if (diagnose && isDiagnosticQuestion(input.question)) {
        try {
          const result = await diagnose(input.question.trim(), input.project);
          return send(res, 200, { ...result, answer: `${result.answer}\n\nEl agente no estuvo disponible. Se muestran las comprobaciones locales del panel.` });
        } catch {}
      }
      return send(res, 502, { error: 'No se pudo consultar al agente. Comprueba el servicio, el modelo y la autorización de WoWAudit.' });
    }
  };
}

