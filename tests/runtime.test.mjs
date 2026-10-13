import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveModel, restoreState, updateTodos, TaskRunner } from '../lib/runtime.mjs';

test('model aliases inherit parent, explicit IDs select exact providers, and effort keeps max', () => {
  const models = [{ provider: 'anthropic', id: 'claude-opus-5-5' }, { provider: 'xai', id: 'grok-4.7' }];
  assert.equal(resolveModel('auto', models, models[0], 'high').model, models[0]);
  assert.equal(resolveModel('inherit-parent', models, models[0], 'high').thinking, 'high');
  assert.equal(resolveModel('anthropic/claude-opus-5-5:max', models).thinking, 'max');
  assert.match(resolveModel('grok-4.7-xhigh-fast', models).translation, /fast service tier is unavailable/);
  assert.throws(() => resolveModel('invented', models), /Unavailable/);
  assert.throws(() => resolveModel('same', [{ provider: 'a', id: 'same' }, { provider: 'b', id: 'same' }]), /ambiguous/);
});

test('mode and todos restore only from the supplied branch; merging preserves other entries', () => {
  const todos = [{ id: 'a', content: 'First', status: 'pending' }];
  assert.deepEqual(restoreState([{ type: 'custom', customType: 'pstack-mode', data: { enabled: true } },
    { type: 'message', message: { role: 'toolResult', toolName: 'TodoWrite', details: { todos } } }]), { mode: true, todos });
  assert.deepEqual(restoreState([]), { mode: false, todos: [] });
  assert.deepEqual(updateTodos(todos, [{ id: 'b', content: 'Second', status: 'completed' }], true).map(t => t.id), ['a', 'b']);
});

test('task lifecycle: parallel processes, persisted output, resume, failure, cancellation, restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pstack-runtime-'));
  const child = join(directory, 'child.mjs');
  writeFileSync(child, `import {writeFileSync} from 'node:fs';
const a=process.argv.slice(2); const s=a[a.indexOf('--session')+1];
writeFileSync(s, '{}\\n');
if (a.at(-1).includes('never')) setInterval(()=>{},1000);
else setTimeout(()=>{console.log(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'child result'}],stopReason:process.env.PSTACK_FAIL?'error':'stop',errorMessage:'fixture failure'}}));},120);`);
  const runner = new TaskRunner(directory, { command: process.execPath, prefix: [child] });
  const options = { prompt: 'a', cwd: directory, readonly: true, agent: 'generalPurpose', model: 'test/one', thinking: 'high', packageRoot: directory };
  const a = runner.start(options); const b = runner.start(options);
  assert.equal(runner.list().filter(t => t.status === 'running').length, 2);
  await Promise.all([runner.wait(a.id), runner.wait(b.id)]);
  assert.equal(a.status, 'completed'); assert.equal(a.output, 'child result');
  assert.ok(existsSync(a.sessionFile)); assert.match(readFileSync(a.eventsFile, 'utf8'), /child result/);
  const resumed = runner.start({ ...options, resume: a.id, prompt: 'resume' });
  await runner.wait(resumed.id); assert.equal(resumed.id, a.id); assert.equal(resumed.status, 'completed');
  assert.throws(() => runner.start({ ...options, resume: a.id, readonly: false }), /Resume must keep/);
  process.env.PSTACK_FAIL = '1'; const fail = runner.start(options); delete process.env.PSTACK_FAIL;
  await runner.wait(fail.id); assert.equal(fail.status, 'failed'); assert.match(fail.error, /fixture failure/);
  const never = runner.start(options); runner.stop(never.id); await runner.wait(never.id); assert.equal(never.status, 'cancelled');
  await runner.close();
  const restored = new TaskRunner(directory, { command: process.execPath, prefix: [child] });
  assert.equal(restored.get(a.id).output, 'child result');
  assert.throws(() => restored.get('missing'), /Unknown task/);
});
