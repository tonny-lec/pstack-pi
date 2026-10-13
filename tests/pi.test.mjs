import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(import.meta.dirname, '..');
const cli = resolve(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent')), '../bundle/cli.js');

function runPi(prompt, directory, agentDir, session) {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(process.execPath, [cli, '--mode', 'json', '--offline', '--extension', root,
      '--model', 'pstack-test/fixture', '--session', session, '--no-approve', prompt], {
      cwd: directory, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: '1', PI_TELEMETRY: '0', PSTACK_TEST_TRACE: join(directory, 'trace.jsonl') } });
    let output = ''; let error = '';
    proc.stdout.on('data', d => output += d); proc.stderr.on('data', d => error += d);
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error(`Pi test timed out: ${error}\n${output.slice(-2000)}`)); }, 60000);
    proc.on('error', reject);
    proc.on('close', code => { clearTimeout(timer); resolvePromise({ code, output, error }); });
  });
}

test('real Pi CLI discovers package and executes background agents, readonly, resume, mode, todos', { timeout: 65000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pstack-pi-cli-'));
  const agentDir = join(directory, 'agent'); mkdirSync(agentDir);
  writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ extensions: [join(root, 'tests/fixtures/provider.ts')], packages: [root] }));
  const session = join(directory, 'parent.jsonl');
  const run = await runPi('PSTACK_INTEGRATION', directory, agentDir, session);
  assert.equal(run.code, 0, run.error + run.output.slice(-2000));
  assert.doesNotMatch(run.error, /Failed to load|Error loading|invalid skill/i);
  const entries = readFileSync(session, 'utf8').trim().split('\n').map(JSON.parse);
  const results = entries.filter(e => e.type === 'message' && e.message.role === 'toolResult').map(e => e.message);
  assert.ok(results.some(r => r.toolName === 'TodoWrite' && r.details.todos[0].status === 'in_progress'));
  assert.ok(entries.some(e => e.type === 'custom' && e.customType === 'pstack-mode' && e.data.enabled));
  const tasks = results.filter(r => r.toolName === 'Task');
  assert.equal(tasks.length, 3);
  assert.equal(tasks[2].details.status, 'completed');
  const resumedOutput = JSON.parse(tasks[2].details.output);
  assert.equal(resumedOutput.resumed, true);
  assert.deepEqual(resumedOutput.tools.sort(), ['find','grep','ls','read']);
  const waits = results.filter(r => r.toolName === 'pstack_tasks' && r.details.status === 'completed');
  assert.ok(waits.length >= 2);
  const writable = waits.map(w => JSON.parse(w.details.output)).find(w => w.child === 'B');
  assert.ok(writable.tools.includes('bash'));
  assert.ok(writable.tools.includes('Task'));
  const stateProbe = await runPi('PSTACK_PROBE', directory, agentDir, session);
  assert.equal(stateProbe.code, 0, stateProbe.error);
  const messages = stateProbe.output.trim().split('\n').map(line => { try { return JSON.parse(line); } catch { return {}; } });
  const last = messages.filter(e => e.type === 'message_end' && e.message?.role === 'assistant').at(-1);
  const probe = JSON.parse(last.message.content[0].text);
  assert.match(probe.system, /# Poteto mode/);
});
