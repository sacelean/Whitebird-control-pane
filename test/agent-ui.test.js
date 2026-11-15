import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('chat controls require save before apply, poll the job and render untrusted text safely', async () => {
  class Element {
    constructor(tag = 'div') { this.tag = tag; this.children = []; this.listeners = {}; this.value = ''; this.disabled = false; }
    append(...children) { this.children.push(...children); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    querySelectorAll(tag) { return this.children.flatMap(child => [...(child.tag === tag ? [child] : []), ...child.querySelectorAll(tag)]); }
    set innerHTML(_value) { assert.fail('Untrusted content must use textContent'); }
  }
  const ids = ['agent-form', 'agent-question', 'agent-submit', 'agent-status', 'agent-messages', 'agent-dialog', 'agent-open', 'agent-close', 'agent-retry', 'project'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  elements.project.value = 'wow';
  const id = 'a'.repeat(32), calls = [];
  const fetch = async (_url, options) => {
    if (!options) return { ok: true, json: async () => ({ enabled: true, wowaudit: true, csrf: 'csrf' }) };
    const body = JSON.parse(options.body); calls.push(body);
    if (!body.action) return { ok: true, json: async () => ({ answer: '<script>untrusted</script>', proposal: { id, state: 'prepared', canApply: true } }) };
    const state = { save: 'saved', apply: 'applying', status: 'applied' }[body.action];
    return { ok: true, json: async () => ({ proposal: { id, state, message: state, canApply: true } }) };
  };
  const context = vm.createContext({ document: { getElementById: id => elements[id], createElement: tag => new Element(tag) }, fetch, setTimeout: callback => callback() });
  vm.runInContext(await readFile(new URL('../public/agent.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements['agent-submit'].disabled, false);
  elements['agent-question'].value = 'Cambia el horario a las 5';
  await elements['agent-form'].listeners.submit({ preventDefault() {} });
  const messages = elements['agent-messages'];
  assert.equal(messages.children[1].children[1].textContent, '<script>untrusted</script>');
  const save = messages.querySelectorAll('button').find(button => button.textContent === 'Guardar cambios');
  assert.ok(save);
  assert.ok(!messages.querySelectorAll('button').some(button => button.textContent === 'Aplicar y reiniciar'));
  await save.listeners.click();
  const apply = messages.querySelectorAll('button').find(button => button.textContent === 'Aplicar y reiniciar');
  assert.ok(apply);
  await apply.listeners.click();
  assert.deepEqual(calls.slice(1).map(call => call.action), ['save', 'apply', 'status']);
  assert.equal(elements['agent-status'].textContent, 'applied');
  assert.equal(elements['agent-submit'].disabled, false);
});
