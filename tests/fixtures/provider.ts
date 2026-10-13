import { appendFileSync } from 'node:fs';
import { createAssistantMessageEventStream, getCurrentSystemPrompt, getCurrentTools } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function (pi: ExtensionAPI) {
  pi.registerProvider('pstack-test', {
    api: 'pstack-fixture', baseUrl: 'http://127.0.0.1:1', apiKey: 'fixture-only',
    models: [{ id: 'fixture', name: 'Local deterministic fixture', reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 10000 }],
    streamSimple(model, context) {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const messages = context.messages;
        const texts = messages.flatMap((m: any) => m.role === 'user' && Array.isArray(m.content) ? m.content.filter((p: any) => p.type === 'text').map((p: any) => p.text) : []).join('\n');
        const child = texts.includes('PSTACK_CHILD_');
        const results = messages.filter((m: any) => m.role === 'toolResult');
        const call = (name: string, args: unknown) => ({ type: 'toolCall', id: `fixture-${name}-${results.length}-${Math.random()}`, name, arguments: args });
        let content: any[];
        if (child) {
          content = [{ type: 'text', text: JSON.stringify({ child: texts.includes('PSTACK_CHILD_A') ? 'A' : 'B', tools: getCurrentTools(messages).map(t => t.name), resumed: texts.includes('PSTACK_RESUME') }) }];
        } else if (texts.includes('PSTACK_PROBE')) {
          content = [{ type: 'text', text: JSON.stringify({ probe: 'ok', tools: getCurrentTools(messages).map(t => t.name), system: getCurrentSystemPrompt(messages) }) }];
        } else if (texts.includes('PSTACK_INTEGRATION')) {
          const tasks = results.filter((m: any) => m.toolName === 'Task');
          const waiting = results.filter((m: any) => m.toolName === 'pstack_tasks');
          if (!tasks.length) {
            content = [call('TodoWrite', { todos: [{ id: 'one', content: 'Exercise real Pi tools', status: 'in_progress' }] }),
              call('pstack_mode', { enabled: true }),
              call('Task', { prompt: 'PSTACK_CHILD_A', readonly: true, model: 'pstack-test/fixture', run_in_background: true }),
              call('Task', { prompt: 'PSTACK_CHILD_B', subagent_type: 'comment-sicko', model: 'pstack-test/fixture', run_in_background: true })];
          } else if (waiting.length < 2 || waiting.some((m: any) => m.details?.status === 'running') && waiting.length < 8) {
            content = tasks.map((t: any) => call('pstack_tasks', { action: 'wait', task_id: t.details.id, timeout_ms: 30000 }));
          } else if (!tasks.some((m: any) => m.details?.description === 'resume-test')) {
            content = [call('Task', { prompt: 'PSTACK_RESUME', resume: tasks[0].details.id, description: 'resume-test', run_in_background: false })];
          } else {
            content = [{ type: 'text', text: JSON.stringify({ integration: 'ok', taskResults: tasks.map((m: any) => m.details), waits: waiting.map((m: any) => m.details) }) }];
          }
        } else {
          content = [{ type: 'text', text: JSON.stringify({ probe: 'ok', tools: getCurrentTools(messages).map(t => t.name), system: getCurrentSystemPrompt(messages) }) }];
        }
        const output: any = { role: 'assistant', content, api: model.api, provider: model.provider, model: model.id,
          stopReason: content.some(p => p.type === 'toolCall') ? 'toolUse' : 'stop', timestamp: Date.now(),
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
        if (process.env.PSTACK_TEST_TRACE) appendFileSync(process.env.PSTACK_TEST_TRACE, JSON.stringify({ pid: process.pid, child, content, tools: getCurrentTools(messages).map(t => t.name) }) + '\n');
        stream.push({ type: 'start', partial: output });
        stream.push({ type: 'done', reason: output.stopReason, message: output });
        stream.end();
      });
      return stream;
    },
  });
}
