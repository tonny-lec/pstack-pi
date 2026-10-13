---
name: setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Detects your available models and writes an always-applied rule that overrides the skill defaults. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Write the `configPath` returned by `pstack_models` (normally `~/.pi/agent/pstack-models.md`), an always-applied role configuration that sets pstack's model per role.

## Steps

### 1. Detect available models

Call `pstack_models` to enumerate available Pi provider/model IDs and their supported reasoning levels. That is the dependable source. A real role value is `provider/model:effort`. If you cannot detect any, ask the user to paste the slugs they have access to. Never write a real slug you have not confirmed is available. The aliases `inherit-parent` and `auto` are always valid even though they are not detected slugs.

### 2. Load current state

The default role-to-model mapping is the rule shape shown in step 5 below. If the detected `configPath` already exists, read it and treat its `# budget` line and its role values as the current choices. Otherwise start from those defaults. A line whose role is not in step 5, such as `how critics`, is from a retired role. Drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Prefer AskQuestion over free text. Offer these four options with these exact labels, and name the current budget when the rule records one. With no rule, say that `large` matches the skill defaults.

- `unlimited — max reasoning`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Build the working table from the skill defaults, and on a re-run keep any role changed by family, list, or alias. `unlimited`, `large`, `medium`, and `small` target `max`, `xhigh`, `high`, and `medium`. Use `provider/model:effort` with the highest supported reasoning level at or below the target. The ladder is `max` > `xhigh` > `high` > `medium` > `low` > `minimal` > `off`. `inherit-parent` and `auto` remain unchanged. For non-reasoning models use `off`. If the base model is unavailable, mark the role as needing a choice. Cursor's `fast` service tier has no Pi equivalent; do not invent one.

**(c) Show the roles and confirm.** Show every role with its model, marking any real slug not in the detected set as needing a choice. Also list each line step 2 dropped. Ask whether to accept as-is or change specific roles, offering the detected models plus `inherit-parent` and `auto` (both mean: this role runs on the parent chat model, which is how Auto users stay on Auto) as the options. Prefer AskQuestion over free text. For panel roles (arena runners, architect runners, interrogate reviewers) the value is a list, and one subagent runs per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena selects one value from it whose model family differs from the parent's when possible. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Every real provider/model ID must be in the detected set and its effort must be supported. `inherit-parent` and `auto` always pass. If a chosen real slug is not available, stop and ask again.

### 5. Write the rule

Write the detected `configPath` as Markdown with a `# budget` line with the chosen label and its target effort, and one line per role, using the same labels poteto-mode uses. Overwrite the whole file so re-runs stay idempotent. Shape:

```
# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` or `auto` as a value: the role runs on the parent chat model (omit Task `model`). Alias entries in a panel list still count toward its fan-out.
# budget: large (xhigh)
feature, refactoring: xai/grok-4.7:xhigh
bug-fix: xai/grok-4.7:xhigh
perf-issue: xai/grok-4.7:xhigh
hillclimb: xai/grok-4.7:xhigh
judgment and prose: anthropic/claude-opus-5-5:xhigh
hardest tasks: anthropic/claude-opus-5-5:xhigh
how explorer: xai/grok-4.7:xhigh
how explainer: anthropic/claude-opus-5-5:xhigh
why investigators: xai/grok-4.7:xhigh
why synthesizer: anthropic/claude-opus-5-5:xhigh
reflect tooling: xai/grok-4.7:xhigh
reflect judgment, divergent, synthesizer: anthropic/claude-opus-5-5:xhigh
arena runners: anthropic/claude-opus-5-5:xhigh, xai/grok-4.7:xhigh
arena cross-judge pool: anthropic/claude-opus-5-5:xhigh, xai/grok-4.7:xhigh
swarm workers: xai/grok-4.7:xhigh
architect runners: anthropic/claude-opus-5-5:xhigh, xai/grok-4.7:xhigh
interrogate reviewers: anthropic/claude-opus-5-5:xhigh, xai/grok-4.7:xhigh
```

### 6. Confirm

Tell the user the rule was written and that it is loaded by the extension on each turn. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke `/create-verification-skill` (resolves wherever pstack is installed: workspace, user, or plugin). On no, move on without pushing.
