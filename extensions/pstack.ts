import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';
import { defineTool, getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { resolveModel, restoreState, TaskRunner, updateTodos } from '../lib/runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function invocation() {
  const entry = process.argv[1];
  if (entry && /(?:^|\/)cli\.js$/.test(entry) && existsSync(entry)) return { command: process.execPath, prefix: [entry] };
  try {
    const cli = resolve(dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'))), 'bundle/cli.js');
    return { command: process.execPath, prefix: [cli] };
  } catch { return { command: 'pi' }; }
}
const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], details: value });
const enumOf = <T extends string>(values: T[]) => Type.Union(values.map(v => Type.Literal(v)));
const todoSchema = Type.Object({ id: Type.String(), content: Type.String(),
  status: enumOf(['pending', 'in_progress', 'completed', 'cancelled']) });

export default function pstack(pi: ExtensionAPI) {
  let state = restoreState([]);
  let runner: TaskRunner | undefined;
  let owner: string | undefined;
  let loop: ReturnType<typeof setInterval> | undefined;
  let loopSpec: { interval: number; prompt: string } | undefined;
  const configPath = join(getAgentDir(), 'pstack-models.md');

  const setMode = (enabled: boolean) => {
    state.mode = enabled;
    pi.appendEntry('pstack-mode', { enabled });
  };
  const tasks = (ctx: ExtensionContext) => {
    if (!runner || owner !== ctx.sessionManager.getSessionId()) throw new Error('Task runner is not initialized for this session.');
    return runner;
  };
  const configureLoop = (ctx: ExtensionContext, spec?: typeof loopSpec) => {
    if (loop) clearInterval(loop);
    loopSpec = spec;
    loop = spec ? setInterval(() => {
      if (ctx.isIdle()) pi.sendUserMessage(spec.prompt, { deliverAs: 'followUp' });
    }, spec.interval) : undefined;
    loop?.unref();
  };
  const restore = async (ctx: ExtensionContext) => {
    if (owner !== ctx.sessionManager.getSessionId()) {
      await runner?.close();
      owner = ctx.sessionManager.getSessionId();
      runner = new TaskRunner(join(ctx.sessionManager.getSessionDir(), 'pstack-tasks', owner), invocation(), (task: { id: string; status: string }) => {
        pi.sendMessage({ customType: 'pstack-task-complete', content: `Task ${task.id} ${task.status}. Collect its output with pstack_tasks.`, display: true },
          { triggerTurn: true, deliverAs: 'followUp' });
      });
    }
    const branch = ctx.sessionManager.getBranch();
    state = restoreState(branch);
    let spec: typeof loopSpec;
    for (const entry of branch) {
      if (entry.type === 'custom' && entry.customType === 'pstack-loop') spec = entry.data as typeof loopSpec;
    }
    configureLoop(ctx, spec);
  };
  pi.on('session_start', async (_event, ctx) => restore(ctx));
  pi.on('session_tree', async (_event, ctx) => restore(ctx));
  pi.on('session_before_switch', async () => { if (loop) clearInterval(loop); await runner?.close(); });
  pi.on('session_shutdown', async () => { if (loop) clearInterval(loop); await runner?.close(); });
  pi.on('agent_before_settle', async (_event, ctx) => {
    if (ctx.mode === 'tui' || ctx.mode === 'rpc' || !runner?.pending.size) return;
    const task = runner.list().find(t => t.status === 'running');
    if (!task) return;
    await runner.wait(task.id, 30000, ctx.signal);
    return { continue: true, entries: [{ type: 'custom_message' as const, customType: 'pstack-pending',
      content: 'Collect pending/completed Task results with pstack_tasks before finishing this print/JSON run.', display: true }] };
  });

  pi.on('before_agent_start', async (event, ctx) => {
    if (event.prompt?.startsWith('<skill name="poteto-mode"')) setMode(true);
    const config = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
    const guidance = [
      `pstack package: ${root}. Model role configuration: ${configPath}.`,
      `Active transcript: ${ctx.sessionManager.getSessionFile() ?? '(not persisted yet)'}. Workspace transcript directory: ${ctx.sessionManager.getSessionDir()}. Only read this workspace unless the user asks otherwise. Pi JSONL starts with a session header; chat entries have type=message and message.role/content.`,
      'Task is the pstack compatibility tool for isolated local Pi agents. Start background tasks together, then use pstack_tasks to wait/read/status/stop. Supply cwd for a prepared worktree when workers write. Cloud VMs and Cursor webhooks are not provided. Never describe local processes as cloud workers.',
      'Tool names in upstream instructions map Read/Shell/Grep/Glob to Pi read/bash/grep/find. Use TodoWrite for the playbook todo list and AskQuestion for human choices. pstack_mode switches the sticky mode. /loop and pstack_loop schedule prompts only while this Pi process is running.',
      'Cursor-only mode metadata is implemented by this extension for poteto-mode. For custom personal modes, explicitly use the skill again or add the desired instructions to Pi AGENTS.md.',
      `create-skill refers to ${join(root, 'skills/create-skill/SKILL.md')}. deslop, control-cli, and control-ui are bundled dependencies from cursor-team-kit. Available MCPs are the tools actually exposed by Pi.`,
      config ? `pstack per-role choices override defaults:\n${config}` : 'No pstack model overrides saved. Use /setup-pstack to configure available models. Legacy Cursor model-effort slugs are translated only when the base model is available. Unavailable models fail with the detected list.',
      'For model-family checks in upstream instructions, inspect the model ID after the provider/ prefix and before the :effort suffix.',
      state.mode ? readFileSync(join(root, 'skills/poteto-mode/SKILL.md'), 'utf8') : '',
    ].filter(Boolean).join('\n\n');
    return { systemPrompt: `${event.systemPrompt}\n\n${guidance}` };
  });

  for (const name of readdirSync(join(root, 'skills'))) {
    if (!existsSync(join(root, 'skills', name, 'SKILL.md'))) continue;
    pi.registerCommand(name, { description: `pstack: ${name}`, handler: async (args) => {
      if (name === 'poteto-mode') setMode(true);
      pi.sendUserMessage(`/skill:${name}${args ? ` ${args}` : ''}`);
    } });
  }
  pi.registerCommand('pstack-off', { description: 'Exit sticky poteto-mode', handler: async () => setMode(false) });
  pi.registerCommand('loop', { description: 'Repeat a prompt: /loop 1h <prompt>; /loop stop', handler: async (args, ctx) => {
    if (args.trim() === 'stop') {
      configureLoop(ctx); pi.appendEntry('pstack-loop', undefined); ctx.ui.notify('Loop stopped', 'info'); return;
    }
    const match = args.match(/^(\d+(?:\.\d+)?)(s|m|h)\s+([\s\S]+)$/);
    if (!match) { ctx.ui.notify('Use /loop 1h <prompt> or /loop stop', 'error'); return; }
    const interval = Number(match[1]) * ({ s: 1000, m: 60000, h: 3600000 }[match[2]] ?? 0);
    if (interval < 1000 || interval > 2147483647) { ctx.ui.notify('Interval must be 1 second to 24 days.', 'error'); return; }
    const spec = { interval, prompt: match[3] };
    configureLoop(ctx, spec); pi.appendEntry('pstack-loop', spec);
    ctx.ui.notify('Loop armed for this running Pi session.', 'info');
  } });

  pi.registerTool(defineTool({ name: 'Task', label: 'Task', description: 'Run a fresh isolated local Pi subagent. Returns its task ID immediately by default. Use pstack_tasks to collect results. Resume is explicit and only for work needing prior agent state.',
    parameters: Type.Object({ prompt: Type.String(), description: Type.Optional(Type.String()),
      subagent_type: Type.Optional(enumOf(['generalPurpose', 'poteto-agent', 'comment-sicko'])),
      model: Type.Optional(Type.String()), reasoning_effort: Type.Optional(enumOf(['off','minimal','low','medium','high','xhigh','max'])),
      readonly: Type.Optional(Type.Boolean()), run_in_background: Type.Optional(Type.Boolean()),
      cwd: Type.Optional(Type.String()), environment: Type.Optional(enumOf(['local','cloud'])),
      cloud_base_branch: Type.Optional(Type.String()), resume: Type.Optional(Type.String()) }),
    async execute(_id, params, signal, _update, ctx) {
      if (params.environment === 'cloud' || params.cloud_base_branch) throw new Error('Cursor cloud execution is unavailable. Prepare a local git worktree at the required ref and pass cwd with environment=local.');
      const manager = tasks(ctx);
      const previous = params.resume ? manager.get(params.resume) : undefined;
      const model = resolveModel(params.model ?? (previous ? `${previous.model}:${previous.thinking}` : undefined),
        ctx.modelRegistry.getAvailable(), ctx.model, params.reasoning_effort ?? ctx.thinkingLevel ?? 'medium');
      const agent = params.subagent_type ?? previous?.agent ?? 'generalPurpose';
      const task = manager.start({ prompt: params.prompt, description: params.description,
        agent, agentFile: agent === 'generalPurpose' ? undefined : join(root, 'agents', `${agent}.md`),
        model: `${model.model.provider}/${model.model.id}`, thinking: model.thinking,
        cwd: resolve(ctx.cwd, params.cwd ?? previous?.cwd ?? '.'), readonly: params.readonly ?? previous?.readonly ?? false,
        trusted: ctx.isProjectTrusted(), packageRoot: root, resume: params.resume });
      if (params.run_in_background === false) {
        while (task.status === 'running') await manager.wait(task.id, 30000, signal);
      }
      return result({ ...task, translation: model.translation });
    } }));

  pi.registerTool(defineTool({ name: 'pstack_tasks', label: 'pstack tasks', description: 'Read task status/output, wait without restarting, or cancel a running task. Wait is bounded at 60 seconds. Read sessionFile/eventsFile for complete evidence.',
    parameters: Type.Object({ action: enumOf(['list','status','wait','stop']), task_id: Type.Optional(Type.String()), timeout_ms: Type.Optional(Type.Number()) }),
    async execute(_id, params, signal, _update, ctx) {
      const manager = tasks(ctx);
      if (params.action === 'list') return result(manager.list().map(t => ({ ...t, output: t.output.slice(-50000) })));
      if (!params.task_id) throw new Error('task_id is required.');
      const task = params.action === 'wait' ? await manager.wait(params.task_id, params.timeout_ms ?? 30000, signal)
        : params.action === 'stop' ? manager.stop(params.task_id) : manager.get(params.task_id);
      return result({ ...task, output: task.output.slice(-50000) });
    } }));

  pi.registerTool(defineTool({ name: 'TodoWrite', label: 'Todos', description: 'Persist the playbook todo list in this session branch. merge=true updates entries by id.',
    parameters: Type.Object({ todos: Type.Array(todoSchema), merge: Type.Optional(Type.Boolean()) }),
    async execute(_id, params) { state.todos = updateTodos(state.todos, params.todos, params.merge); return result({ todos: state.todos }); } }));

  pi.registerTool(defineTool({ name: 'AskQuestion', label: 'Ask question', description: 'Ask the human for choices. Supports multiple selection and free text. Cancelled answers never count as approval. In print mode, ask in chat and wait for a user turn instead.',
    parameters: Type.Object({ title: Type.Optional(Type.String()), questions: Type.Array(Type.Object({ id: Type.String(), prompt: Type.String(), allow_multiple: Type.Optional(Type.Boolean()),
      options: Type.Optional(Type.Array(Type.Object({ id: Type.String(), label: Type.String() }))) })) }),
    async execute(_id, params, _signal, _update, ctx) {
      if (!ctx.hasUI) throw new Error('Interactive questions need Pi TUI or RPC UI. Ask the questions in the chat reply and wait for the human; no answer or approval is implied.');
      const answers: Record<string, unknown> = {};
      for (const question of params.questions) {
        if (!question.options?.length) {
          const answer = await ctx.ui.input(question.prompt);
          if (answer === undefined) return result({ cancelled: true });
          answers[question.id] = answer; continue;
        }
        const selected: string[] = [];
        while (true) {
          const options = question.options.filter(o => !selected.includes(o.id));
          const labels = options.map(o => o.label);
          const custom = 'Enter another answer';
          const done = 'Done selecting';
          const answer = await ctx.ui.select(question.prompt, [...labels, custom, ...(question.allow_multiple ? [done] : [])]);
          if (answer === undefined) return result({ cancelled: true });
          if (answer === done) break;
          if (answer === custom) {
            const free = await ctx.ui.input(question.prompt);
            if (free === undefined) return result({ cancelled: true });
            selected.push(free);
          } else selected.push(options[labels.indexOf(answer)].id);
          if (!question.allow_multiple) break;
        }
        answers[question.id] = question.allow_multiple ? selected : selected[0];
      }
      return result({ answers });
    } }));

  pi.registerTool(defineTool({ name: 'pstack_models', label: 'pstack models', description: 'List available Pi model IDs and reasoning levels for /setup-pstack. Does not expose credentials.',
    parameters: Type.Object({}), async execute(_id, _params, _signal, _update, ctx) {
      return result({ configPath, models: ctx.modelRegistry.getAvailable().map(m => ({ id: `${m.provider}/${m.id}`, reasoning: m.reasoning,
        thinkingLevelMap: m.thinkingLevelMap })), parent: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined });
    } }));
  pi.registerTool(defineTool({ name: 'pstack_mode', label: 'pstack mode', description: 'Enter or exit sticky poteto-mode for this session branch.',
    parameters: Type.Object({ enabled: Type.Boolean() }), async execute(_id, params) { setMode(params.enabled); return result(params); } }));
  pi.registerTool(defineTool({ name: 'pstack_loop', label: 'pstack loop', description: 'Arm or stop a periodic follow-up prompt in this running Pi process. Missing interval_ms stops it.',
    parameters: Type.Object({ interval_ms: Type.Optional(Type.Number({ minimum: 1000, maximum: 2147483647 })), prompt: Type.Optional(Type.String()) }),
    async execute(_id, params, _signal, _update, ctx) {
      if (params.interval_ms && !params.prompt) throw new Error('prompt is required when arming a loop.');
      const spec = params.interval_ms ? { interval: params.interval_ms, prompt: params.prompt! } : undefined;
      configureLoop(ctx, spec); pi.appendEntry('pstack-loop', spec); return result({ active: Boolean(spec), ...spec });
    } }));
}
