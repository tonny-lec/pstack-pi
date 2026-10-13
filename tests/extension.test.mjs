import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pstack from '../extensions/pstack.ts';

function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'pstack-extension-'));
  process.env.PI_CODING_AGENT_DIR = directory;
  const tools = new Map(); const events = new Map(); const commands = new Map(); const entries = []; const sent = [];
  const api = { registerTool: t => tools.set(t.name, t), on: (name, handler) => events.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command), appendEntry: (name, data) => entries.push({ name, data }),
    sendUserMessage: text => sent.push(text), sendMessage: text => sent.push(text) };
  pstack(api);
  const ctx = { hasUI: false, mode: 'print', cwd: directory, isIdle: () => true,
    ui: { notify() {} }, sessionManager: { getSessionId: () => 'test', getSessionDir: () => directory, getSessionFile: () => join(directory, 'test.jsonl'), getBranch: () => [] } };
  return { directory, tools, events, commands, entries, sent, ctx };
}

test('questions preserve user selections, multiple selections, custom input and cancellation; print never invents approval', async () => {
  const h = harness(); const ask = h.tools.get('AskQuestion');
  const question = { id: 'q', prompt: 'Choose', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };
  await assert.rejects(ask.execute('id', { questions: [question] }, undefined, undefined, h.ctx), /no answer or approval is implied/);
  const selections = ['A', 'B', 'Done selecting'];
  h.ctx.hasUI = true;
  h.ctx.ui.select = async () => selections.shift();
  assert.deepEqual((await ask.execute('id', { questions: [{ ...question, allow_multiple: true }] }, undefined, undefined, h.ctx)).details.answers.q, ['a', 'b']);
  h.ctx.ui.select = async () => 'Enter another answer'; h.ctx.ui.input = async () => 'custom preference';
  assert.equal((await ask.execute('id', { questions: [question] }, undefined, undefined, h.ctx)).details.answers.q, 'custom preference');
  h.ctx.ui.select = async () => undefined;
  assert.deepEqual((await ask.execute('id', { questions: [question] }, undefined, undefined, h.ctx)).details, { cancelled: true });
});

test('slash aliases, persistent mode, configuration injection, todos, cloud rejection and local loop', async () => {
  const h = harness();
  assert.ok(h.commands.has('poteto-mode')); assert.ok(h.commands.has('setup-pstack')); assert.ok(!h.commands.has('make-bot-ui'));
  await h.events.get('session_start')({}, h.ctx);
  await h.commands.get('poteto-mode').handler('inspect this', h.ctx);
  assert.equal(h.sent[0], '/skill:poteto-mode inspect this');
  writeFileSync(join(h.directory, 'pstack-models.md'), 'how explorer: inherit-parent\n');
  const active = await h.events.get('before_agent_start')({ systemPrompt: 'base', prompt: 'continue' }, h.ctx);
  assert.match(active.systemPrompt, /# Poteto mode/); assert.match(active.systemPrompt, /how explorer: inherit-parent/);
  await h.commands.get('pstack-off').handler('', h.ctx);
  const inactive = await h.events.get('before_agent_start')({ systemPrompt: 'base', prompt: 'continue' }, h.ctx);
  assert.doesNotMatch(inactive.systemPrompt, /# Poteto mode/);
  assert.deepEqual((await h.tools.get('TodoWrite').execute('id', { todos: [{ id: '1', content: 'step', status: 'pending' }] })).details.todos,
    [{ id: '1', content: 'step', status: 'pending' }]);
  await assert.rejects(h.tools.get('Task').execute('id', { prompt: 'x', environment: 'cloud' }, undefined, undefined, h.ctx), /cloud execution is unavailable/);
  await h.tools.get('pstack_loop').execute('id', { interval_ms: 1000, prompt: 'tick' }, undefined, undefined, h.ctx);
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.ok(h.sent.includes('tick'));
  await h.events.get('session_shutdown')({}, h.ctx);
});
