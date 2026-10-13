import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function resolveModel(value, available, parent, thinking = 'medium') {
  if (!value || value === 'auto' || value === 'inherit-parent') {
    if (!parent) throw new Error('No parent model is selected.');
    return { model: parent, thinking };
  }
  const exact = available.filter(m => `${m.provider}/${m.id}` === value || m.id === value);
  if (exact.length === 1) return { model: exact[0], thinking };
  const suffix = value.match(/:(off|minimal|low|medium|high|xhigh|max)$/);
  if (suffix) {
    const base = resolveModel(value.slice(0, -suffix[0].length), available, parent, thinking);
    return { ...base, thinking: suffix[1] };
  }
  const legacy = value.match(/^(.*)-(max|xhigh|high|medium|low)(-fast)?$/);
  if (legacy) {
    const base = resolveModel(legacy[1], available, parent, thinking);
    return { ...base, thinking: legacy[2], translation: `${value} -> ${base.model.provider}/${base.model.id}:${legacy[2]}${legacy[3] ? ' (Cursor fast service tier is unavailable in Pi)' : ''}` };
  }
  throw new Error(`Unavailable or ambiguous model: ${value}. Use an exact provider/model ID. Available: ${available.map(m => `${m.provider}/${m.id}`).join(', ')}`);
}

export function restoreState(branch) {
  let mode = false;
  let todos = [];
  for (const entry of branch) {
    if (entry.type === 'custom' && entry.customType === 'pstack-mode') mode = entry.data.enabled;
    if (entry.type === 'message' && entry.message.role === 'toolResult' && entry.message.toolName === 'TodoWrite') {
      todos = entry.message.details?.todos ?? todos;
    }
  }
  return { mode, todos };
}

export function updateTodos(current, incoming, merge = false) {
  if (!merge) return incoming;
  const result = new Map(current.map(t => [t.id, t]));
  for (const todo of incoming) result.set(todo.id, { ...result.get(todo.id), ...todo });
  return [...result.values()];
}

export class TaskRunner {
  constructor(directory, invocation, onComplete = (_task) => {}) {
    this.directory = directory;
    this.invocation = invocation;
    this.onComplete = onComplete;
    this.tasks = new Map();
    this.processes = new Map();
    this.pending = new Map();
    this.closing = false;
    mkdirSync(directory, { recursive: true });
    const file = join(directory, 'tasks.json');
    if (existsSync(file)) {
      for (const task of JSON.parse(readFileSync(file, 'utf8'))) {
        if (task.status === 'running') task.status = 'interrupted';
        this.tasks.set(task.id, task);
      }
      this.save();
    }
  }

  save() { writeFileSync(join(this.directory, 'tasks.json'), JSON.stringify([...this.tasks.values()], null, 2)); }
  list() { return [...this.tasks.values()]; }
  get(id) {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    return task;
  }

  start(options) {
    const previous = options.resume ? this.get(options.resume) : undefined;
    if (previous?.status === 'running') throw new Error('Task is still running. Read its status or stop it before resuming.');
    if (previous && (options.cwd !== previous.cwd || options.readonly !== previous.readonly || options.agent !== previous.agent)) {
      throw new Error('Resume must keep the original cwd, readonly setting, and agent type.');
    }
    const id = previous?.id ?? randomUUID();
    const sessionFile = previous?.sessionFile ?? join(this.directory, `${id}.jsonl`);
    const promptFile = join(this.directory, `${id}-prompt.txt`);
    const eventsFile = join(this.directory, `${id}-events.jsonl`);
    writeFileSync(promptFile, options.prompt, { mode: 0o600 });
    const args = ['--mode', 'json', '--session', sessionFile, '--extension', options.packageRoot,
      '--model', options.model, '--thinking', options.thinking, options.trusted ? '--approve' : '--no-approve'];
    if (options.readonly) args.push('--tools', 'read,grep,find,ls');
    if (options.agentFile) args.push('--append-system-prompt', options.agentFile);
    args.push(`@${promptFile}`);
    const task = { id, sessionFile, eventsFile, cwd: options.cwd, readonly: options.readonly, agent: options.agent,
      model: options.model, thinking: options.thinking, description: options.description,
      status: 'running', output: '', error: '', startedAt: new Date().toISOString() };
    this.tasks.set(id, task);
    const { command, prefix = [] } = this.invocation;
    const child = spawn(command, [...prefix, ...args], { cwd: options.cwd, env: process.env,
      detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    this.processes.set(id, child);
    task.pid = child.pid;
    this.save();
    let buffer = '';
    let failed = false;
    const parse = line => {
      try {
        const event = JSON.parse(line);
        if (event.type === 'message_end' && event.message?.role === 'assistant') {
          const message = event.message;
          task.output = message.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
          if (message.stopReason === 'error' || message.stopReason === 'aborted') {
            failed = true;
            task.error = message.errorMessage ?? message.stopReason;
          }
        }
      } catch { /* Non-JSON startup diagnostics remain in eventsFile. */ }
    };
    child.stdout.on('data', chunk => {
      appendFileSync(eventsFile, chunk);
      buffer += chunk.toString();
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) { parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
    });
    child.stderr.on('data', chunk => { task.error = (task.error + chunk.toString()).slice(-25000); });
    const done = new Promise(resolve => {
      const finish = (code, error) => {
        if (!this.processes.has(id)) return;
        if (buffer) parse(buffer);
        this.processes.delete(id);
        this.pending.delete(id);
        if (task.status === 'running') task.status = code === 0 && !failed && task.output ? 'completed' : 'failed';
        if (error) task.error += String(error);
        task.exitCode = code;
        task.finishedAt = new Date().toISOString();
        this.save();
        resolve(task);
        if (!this.closing) this.onComplete(task);
      };
      child.on('error', error => finish(null, error));
      child.on('close', code => finish(code));
    });
    this.pending.set(id, done);
    return task;
  }

  async wait(id, timeout = 30000, signal) {
    const task = this.get(id);
    const promise = this.pending.get(id);
    if (!promise) return task;
    let timer;
    let abort;
    try {
      await Promise.race([promise, new Promise((resolve, reject) => {
        timer = setTimeout(resolve, Math.min(Math.max(timeout, 0), 60000));
        abort = () => reject(new Error('Wait cancelled; background task remains active.'));
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
      })]);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    return task;
  }

  stop(id) {
    const task = this.get(id);
    const child = this.processes.get(id);
    if (child) {
      task.status = 'cancelled';
      const kill = signal => {
        try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch {}
      };
      kill('SIGTERM');
      const timer = setTimeout(() => { if (this.processes.has(id)) kill('SIGKILL'); }, 1000);
      timer.unref();
      this.save();
    }
    return task;
  }

  async close() {
    this.closing = true;
    const pending = [...this.pending.values()];
    for (const id of this.processes.keys()) this.stop(id);
    await Promise.all(pending);
  }
}
