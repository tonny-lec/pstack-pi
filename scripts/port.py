#!/usr/bin/env python3
"""Apply only the recorded host adaptations to an immutable upstream snapshot."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / 'provenance/upstream.tar.gz'


def adapt(path, data):
    if not path.endswith(('.md', '.sh')):
        return data
    s = data.decode()
    if path.endswith('/SKILL.md'):
        name = path.split('/')[-2]
        s = re.sub(r'^name: .+$', f'name: {name}', s, count=1, flags=re.M)
    s = s.replace('~/.cursor/rules/pstack-models.mdc', '~/.pi/agent/pstack-models.md')
    s = s.replace('pstack-models.mdc', 'pstack-models.md')
    s = s.replace('~/.cursor/skills/', '~/.pi/agent/skills/').replace('.cursor/skills/', '.pi/skills/')
    s = s.replace('~/.cursor/plugins/', 'the installed pstack Pi package')
    s = s.replace('~/.cursor/projects/*/', '~/.pi/agent/sessions/*/')
    s = s.replace('`agent-transcripts/` directory', 'transcript directory')
    s = s.replace('`agent-transcripts/`', 'the transcript directory')
    s = s.replace("Cursor's built-in `create-skill`", 'the bundled Pi-compatible `create-skill`')
    s = s.replace("Cursor's built-in for authoring SKILL.md files", 'the bundled Pi-compatible workflow for authoring SKILL.md files')
    s = s.replace('from the Cursor environment', 'from the Pi environment')
    s = s.replace('Otherwise inspect the `mcps/` directory Cursor exposes for enabled MCP servers.', 'Otherwise use Pi MCP configuration and the enabled tool list. Do not assume an unavailable integration exists.')
    s = s.replace('open files, recent edits, cursor location, what was just discussed', 'recently read files, recent edits, what was just discussed')
    s = s.replace('not Cursor\'s built-in babysit skill, whose description matches the same words', 'not another plugin\'s babysit skill whose description matches the same words')
    s = s.replace("Cursor's `/loop` command (a built-in, not a pstack skill)", 'the `/loop` command supplied by the pstack Pi extension (active-process scheduling)')
    s = s.replace("Cursor's `/loop` command", 'the pstack Pi extension\'s `/loop` command')
    s = s.replace('One Cursor cloud agent per PR', 'One local Pi agent in its own worktree per PR')
    s = s.replace('each a Cursor cloud agent', 'each a local Pi agent in its own worktree')
    s = s.replace('a Cursor restart', 'a Pi restart').replace('restart Cursor', 'restart Pi')
    s = s.replace('`/loop` works in local and cloud roots.', '`/loop` works while the local Pi root process remains active.')
    s = re.sub(r'from trunk with `git show origin/main:pstack/(skills/[^`]+)`', r'from the installed pstack package at `\1`', s)
    s = s.replace("This playbook replaces Cursor's built-in babysit skill", 'This playbook is the pstack babysit workflow')
    s = s.replace('`/loop` and `/create-skill` are Cursor built-ins.', '`/loop` is supplied by the pstack Pi extension. `/create-skill` is the bundled Pi-compatible authoring adapter.')
    s = s.replace('Fan out N parallel cloud workers.', 'Fan out N parallel local Pi workers, each with an isolated session and a separate worktree when writing.')
    s = s.replace('the cloud concurrency limit', 'the number of concurrently running Pi workers')
    s = s.replace('`environment: "cloud"`', '`environment: "local"`')
    s = s.replace('Use `environment: "local"` only when the worker needs access to something on the user\'s computer.', 'Pass `cwd` for the prepared worktree when isolation is required. Pi does not provision Cursor cloud VMs.')
    s = s.replace('When a worker must start from a non-default pushed branch, pass `cloud_base_branch`.', 'When a worker must start from a non-default branch, prepare a git worktree at that ref and pass its path as `cwd`.')
    s = s.replace('Each live lane runs on its own cloud VM at the PR head.', 'Each live lane runs in its own local worktree at the PR head. Use an operator-provided container or VM when the lane requires machine isolation.')
    s = s.replace('cloud-agent URL', 'Pi session file')
    s = s.replace("the cloud agent's status in the Cursor dashboard", 'the Pi task status from `pstack_tasks`')
    if path == 'skills/poteto-mode/playbooks/orchestrate.md':
        s = s.replace('Always `environment: "local"` unless the task needs this machine:', 'Always `environment: "local"`, with a separate worktree for each writer. Local-only dependencies include:')
        s = s.replace('Cloud agents cannot read the local store, so their briefs inline what they need or point at repo paths.', 'Workers have isolated contexts; their briefs inline what they need or point at repo paths.')
        s = s.replace('Verbatim paste is for cloud spawns and every resume.', 'Verbatim paste is for every spawn without a shared standing-orders path and every resume.')
        s = s.replace('with the cloud default and the local exception list', 'with the local worktree and machine-isolation requirements')
        s = s.replace('Restacks run in cloud. A local restack at this scale takes the laptop down.', 'Run restacks in a dedicated worktree and use an operator-provided machine when local capacity is insufficient.')
        s = s.replace('After a Pi restart: local agents are dead, cloud work is not.', 'After a Pi restart: local agents are stopped or interrupted; pushed branches, PRs, and task transcripts remain.')
        s = s.replace('reattach cloud work by PR and branch rather than agent id', 'recover work by PR, branch, and persisted Pi session rather than assuming a process survived')
    if path == 'skills/recall/SKILL.md':
        start = s.index('Transcripts live at ')
        end = s.index('\n', start)
        s = s[:start] + 'Transcripts live in the active workspace transcript directory named by the extension. The default is `~/.pi/agent/sessions/--<workspace-path-with-separators-replaced-by-hyphens>--/<timestamp>_<uuid>.jsonl`. A file starts with a session header; chat entries have `type: "message"` and `message.role` / `message.content`. Subagent sessions are under `pstack-tasks/<parent-session-id>/`. Respect the configured session directory instead of guessing it.' + s[end:]
    if path == 'skills/poteto-help/SKILL.md':
        s = '\n'.join(line for line in s.split('\n') if '../make-bot-ui/SKILL.md' not in line)
        s = s.replace('Install with `/add-plugin pstack` in chat, or from Customize in the sidebar.', 'Install this package with `pi install /path/to/pstack-pi` in a terminal.')
        s = s.replace('The rule applies to new chats.', 'The extension loads the rule each turn.')
        start = s.index('pstack is built for Cursor.')
        end = s.index('\n', start)
        s = s[:start] + 'This is the Pi coding agent port of pstack. The package extension supplies Task agents, role configuration, sticky poteto-mode, questions, todos, transcript locations, and an active-process `/loop`. Cursor cloud VMs, Cursor Custom Mode UI, routines, and webhook sender-key UI are not included.' + s[end:]
        start = s.index('Whether `/poteto-mode` stays on')
        end = s.index('Mid-chat,', start)
        s = s[:start] + '`/poteto-mode` and `/skill:poteto-mode` enter sticky mode in this session branch. Use `/pstack-off` to exit it. Pi does not use Cursor\'s Option+Enter Custom Mode UI.\n\n' + s[end:]
        s = s.replace('Give each agent its own worktree, or run them as cloud agents, which each get their own machine.', 'Give each agent its own worktree; use operator-provided containers or VMs when machine isolation is required.')
        s = s.replace('as cloud agents', 'as isolated local Pi agents')
        s = s.replace('ship in the `cursor-team-kit` plugin.', 'are bundled from `cursor-team-kit`.')
        s = s.replace("can start Cursor's own skill for the same job instead", "can select another plugin's skill for the same job instead")
        s = s.replace("Cursor's Plan Mode works alongside it.", 'Pi has no built-in Plan Mode; the planning playbook remains available.')
        s = s.replace('It was started with Enter. Start it as a Custom Mode, or start each task with `/poteto-mode`.', 'Enter `/poteto-mode` again; the extension records mode state in the current session branch.')
        s = s.replace("The rule from `/setup-pstack` applies to new chats. Start one.", 'Check the `configPath` returned by `pstack_models`; the extension reloads it on the next turn.')
        s = s.replace("The links here point into the installed plugin, which the user may not be able to open, so give the user the file's public copy: `https://github.com/cursor/plugins/blob/main/pstack/` followed by its path.", 'The links here point into the installed Pi package. Give the user its resolved local file path. For provenance, the unadapted public original is at the commit recorded in `provenance/source.json`; identify it as the Cursor version when linking it.')
    if path.startswith('docs/guide/'):
        s = s.replace('Custom Mode', 'sticky Pi mode')
        s = s.replace('or cloud agent', 'or isolated Pi agent').replace('as cloud agents', 'in separate local Pi worktrees')
        s = s.replace("`/loop` is Cursor's built-in wake mechanism, not a pstack skill.", '`/loop` is the pstack Pi extension\'s active-process wake mechanism. It stops when Pi exits or the computer sleeps.')
        s = s.replace('`/deslop` ships in the `cursor-team-kit` plugin, not in pstack.', '`/deslop` is bundled from `cursor-team-kit`.')
        if path == 'docs/guide/01-setup.md':
            s = s.replace('In a Cursor chat, run:', 'In a terminal, run:').replace('/add-plugin pstack', 'pi install /path/to/pstack-pi').replace('Cursor confirms the plugin is installed.', '`pi list` confirms the package is installed. Run `/login` in Pi if no provider is configured.')
            s = s.replace('After setup, start a new chat. The model rule applies to new sessions.', 'The extension reloads the model configuration each turn.')
            start = s.index('From here you can type normal follow-ups.')
            end = s.index('\n', start)
            s = s[:start] + 'From here you can type normal follow-ups. The extension keeps poteto-mode active in this session branch until `/pstack-off`. Pi does not have Cursor\'s Option+Enter mode selector.' + s[end:]
        if path == 'docs/guide/02-poteto-mode.md':
            start = s.index('If you run several agents against one repository')
            end = s.index('\n', start)
            s = s[:start] + 'If you run several agents against one repository on one computer, they can fight over the working tree, ports, and build output. Give each writer a separate git worktree and pass its path as Task `cwd`. Pi does not provision cloud machines; use operator-provided containers or VMs for stronger isolation.' + s[end:]
        if path == 'docs/guide/07-overnight.md':
            start = s.index('A [Cursor Project]')
            end = s.index('\n', start)
            s = s[:start] + 'A persistent Pi session gives the coordinator its saved conversation. The coordinator directs isolated local Pi subagents. Keep Pi and the computer active while they run; local execution does not continue while the laptop sleeps. Start the coordinator with `/poteto-mode`, and its delegates follow the same playbooks.' + s[end:]
            s = s.replace('Give each body of work its own Project', 'Give each body of work its own project directory and Pi session')
            s = s.replace('Drag related chats into the Project, finished ones included. They become context for every agent in it.', 'Pass the relevant saved session paths and decision trails to each agent. Pi does not automatically share the context of other chats.')
            start = s.index('pstack ships this as a dormant [automation pack]')
            end = s.index('\n', start)
            s = s[:start] + 'The Cursor automation pack for Slack reports is excluded from this Pi port. External scheduling and event delivery require a separately configured integration.' + s[end:]
        if path == 'docs/guide/09-make-it-yours.md':
            s = '\n'.join(line for line in s.split('\n') if 'make-bot-ui/SKILL.md' not in line)
            s = s.replace('## Build a bot UI with `/make-bot-ui`\n\n', '')
    if path == 'skills/reflect/SKILL.md':
        start = s.index('```bash\nls -t ')
        end = s.index('\n## 2.', start)
        s = s[:start] + 'Use the active transcript file named by the extension. If a candidate search is needed, list JSONL files only in that workspace directory and its `pstack-tasks/` descendants, ordered by real modification time. Pi\'s first line is a session header, not a user message. Find the first `type: "message"` entry whose `message.role` is `user` and compare its content with the opening prompt. If none matches, pass a tight digest of the session instead.\n' + s[end:]
    if path == 'skills/setup-pstack/SKILL.md':
        s = s.replace('Write `~/.pi/agent/pstack-models.md`, an always-applied rule', 'Write the `configPath` returned by `pstack_models` (normally `~/.pi/agent/pstack-models.md`), an always-applied role configuration')
        s = s.replace('Enumerate the model slugs you can pass to a `Task` subagent in this session. That is the dependable source. If Cursor also exposes a models API or CLI that lists the user\'s entitled models, prefer it for completeness.', 'Call `pstack_models` to enumerate available Pi provider/model IDs and their supported reasoning levels. That is the dependable source. A real role value is `provider/model:effort`.')
        start = s.index('**(b) Apply it.**')
        end = s.index('\n\n**(c)', start)
        s = s[:start] + '**(b) Apply it.** Build the working table from the skill defaults, and on a re-run keep any role changed by family, list, or alias. `unlimited`, `large`, `medium`, and `small` target `max`, `xhigh`, `high`, and `medium`. Use `provider/model:effort` with the highest supported reasoning level at or below the target. The ladder is `max` > `xhigh` > `high` > `medium` > `low` > `minimal` > `off`. `inherit-parent` and `auto` remain unchanged. For non-reasoning models use `off`. If the base model is unavailable, mark the role as needing a choice. Cursor\'s `fast` service tier has no Pi equivalent; do not invent one.' + s[end:]
        s = s.replace('Every real slug written must be in the detected set.', 'Every real provider/model ID must be in the detected set and its effort must be supported.')
        s = s.replace('with `alwaysApply: true`, a `# budget` line', 'as Markdown with a `# budget` line')
        s = s.replace('---\ndescription: pstack per-role model choices (overrides skill defaults)\nalwaysApply: true\n---\n', '')
        s = s.replace('grok-4.7-xhigh-fast', 'xai/grok-4.7:xhigh').replace('claude-opus-5-5-xhigh', 'anthropic/claude-opus-5-5:xhigh')
        s = s.replace('If `~/.pi/agent/pstack-models.md` already exists', 'If the detected `configPath` already exists')
        s = s.replace('Write `~/.pi/agent/pstack-models.md` as Markdown', 'Write the detected `configPath` as Markdown')
        s = s.replace('applies to new sessions', 'is loaded by the extension on each turn')
    if path == 'skills/poteto-mode/scripts/worktree-audit.sh':
        start = s.index('# Transcripts dir:')
        end = s.index('\nnow=', start)
        s = s[:start] + '# Pi session directories use --absolute-path-with-hyphens--.\nslug=$(printf \'%s\' "$main_wt" | sed \'s#^/##; s#[/:]#-#g\')\ntranscripts="${PI_CODING_AGENT_SESSION_DIR:-${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/sessions/--$slug--}"' + s[end:]
    if path == 'skills/poteto-mode/playbooks/worktree-cleanup.md':
        s = s.replace('.cursor/worktrees/myrepo/x', '.worktrees/myrepo/x')
        s = s.replace(', `~/Library/Application Support/Cursor` (`state.vscdb.backup`, and `snapshots/roots/<root>` where a `<root>` named for a folder you opened as a workspace balloons)', '')
    return s.encode()


def expected():
    files = {}
    excluded = []
    with tarfile.open(ARCHIVE) as archive:
        for member in archive.getmembers():
            if not member.isfile(): continue
            path = member.name
            if path.startswith(('skills/make-bot-ui/', 'automations/', '.cursor-plugin/', 'assets/')) or path in ('README.md', '.gitignore', 'plugin.json'):
                excluded.append(path)
                continue
            if path.startswith(('skills/', 'agents/', 'docs/')) or path == 'LICENSE':
                original = archive.extractfile(member).read()
                files[path] = (original, adapt(path, original))
            else:
                raise ValueError(f'Unclassified upstream file: {path}')
    with tarfile.open(ROOT / 'provenance/team-kit.tar.gz') as archive:
        for member in archive.getmembers():
            if member.isfile():
                data = archive.extractfile(member).read()
                files[member.name] = (data, data)
    return files, excluded


def main():
    files, excluded = expected()
    manifest = {'upstream': json.loads((ROOT / 'provenance/source.json').read_text()), 'excluded': excluded, 'files': {}}
    for path, (original, ported) in files.items():
        target = ROOT / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(ported)
        manifest['files'][path] = {'upstream_sha256': hashlib.sha256(original).hexdigest(), 'ported_sha256': hashlib.sha256(ported).hexdigest(), 'adapted': original != ported}
    with tarfile.open(ARCHIVE) as archive:
        for member in archive.getmembers():
            if member.name in files: (ROOT / member.name).chmod(member.mode)
    (ROOT / 'provenance/manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Ported {len(files)} files; adapted {sum(x[0] != x[1] for x in files.values())}; excluded {len(excluded)} Cursor distribution files.')


if __name__ == '__main__': main()
