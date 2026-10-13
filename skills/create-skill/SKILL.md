---
name: create-skill
description: Author or edit a Pi-compatible SKILL.md with supporting files, validate discovery and references, and test task routing when structural behavior changes. Host adapter for pstack workflows that use Cursor's built-in create-skill.
disable-model-invocation: true
---

# Create a Pi skill

1. Read the existing skill and the user's requested behavior. For a new skill, identify its trigger, intended result, supporting scripts, and scope. Preserve existing placement and conventions.
2. Use a directory containing `SKILL.md`. Project skills live in `.pi/skills/<name>/`; personal skills live in the active Pi agent directory's `skills/<name>/`. Use the configured agent directory rather than assuming the default.
3. Start with YAML `name` and `description`. Names are lowercase kebab-case, at most 64 characters. Write the description as one scalar, quoting punctuation or using an indented block scalar. Preserve `disable-model-invocation: true` for explicit-only skills. Put supporting files next to the skill and resolve relative links from its directory.
4. Write direct instructions that change a decision or an action. Reference existing skills rather than repeating them. Use pstack's unslop and technical-writing skills when the caller requires them.
5. Validate frontmatter, referenced paths, discovery in Pi, and explicit `/skill:<name>` invocation. For structural changes, run representative positive and negative task cases, observe actual tool use and outputs, revise failures, and repeat. Use pstack's Eval playbook for blinded comparisons when required. For subjective personal conventions, present the draft and iterate with the user, as automate-me specifies.
6. Description optimization uses positive and negative trigger cases; change only the description and rerun the cases until routing is reliable. Do not claim model routing was tested from a static file check.

Pi does not implement Cursor's native skill-authoring UI. This adapter supplies the file authoring and validation workflow used by the portable pstack skills.
