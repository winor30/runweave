# runweave

Session orchestrator for Claude Code and Codex — run AI agent workflows from YAML definitions.

## Features

- Declare workflows in YAML: prompt, trigger, agent backend, workspace hooks
- Two trigger types: cron schedule and manual (`runweave run`)
- Two agent backends: Claude Code (`@anthropic-ai/claude-agent-sdk`) and Codex (`@openai/codex-sdk`)
- Four permission modes: `autonomous`, `full-auto`, `supervised`, `readonly`
- Workspace isolation per session with lifecycle hooks
- Session state persistence (flat files, no database)
- Hot reload — YAML changes are picked up without restarting the daemon
- Desktop and webhook notifications

## Prerequisites

- Node.js 20+
- pnpm
- [Claude Code CLI](https://github.com/anthropics/claude-code) — required when using the `claude-code` backend
- [Codex CLI](https://github.com/openai/codex) — required when using the `codex` backend

## Installation

```bash
# From source
git clone https://github.com/your-org/runweave.git
cd runweave
pnpm install
pnpm build

# Link globally
pnpm link --global
```

Once published to npm:

```bash
npm install -g runweave
# or run without installing
npx runweave --help
```

## Quick Start

```bash
# 1. Initialize a project
runweave init

# 2. Edit the generated workflow
#    workflows/example.yaml is created automatically

# 3. Run it immediately
runweave run workflows/example.yaml
```

`runweave init` creates `workflows/example.yaml` and a `.gitignore` that excludes workspace directories.

## Workflow YAML Reference

### Minimal configuration

```yaml
name: fix-issues
prompt: |
  Fix the assigned GitHub issues.
```

`trigger` defaults to manual, `agent.backend` to `claude-code`, `agent.mode` to `autonomous`.

### Full configuration

```yaml
name: fix-assigned-issues
description: "Auto-fix assigned GitHub issues every morning"

trigger:
  cron: "0 9 * * *"

agent:
  backend: claude-code
  mode: autonomous
  model: opus
  provider_options:
    setting_sources:
      - project
      - local

context:
  github_token: $GITHUB_TOKEN
  assignee: your-github-username
  repo: your-org/your-repo

workspace:
  root: .runweave-workspaces
  hooks:
    after_create: "git clone https://github.com/{{ repo }}.git ."
    before_run: "git fetch origin && git checkout main"

concurrency:
  max: 1
  on_conflict: skip

notify:
  channels:
    - type: webhook
      url: $SLACK_WEBHOOK_URL
  on:
    completed: true
    failed: true

prompt: |
  Check open issues assigned to {{ assignee }} in {{ repo }}.
  Fix the highest-priority ones and open a PR for each fix.
```

### Default values

| Field                     | Default                | Notes                                |
| ------------------------- | ---------------------- | ------------------------------------ |
| `trigger`                 | `{ type: manual }`     | Omit to run only via `runweave run`  |
| `agent.backend`           | `claude-code`          | `claude-code` or `codex`             |
| `agent.mode`              | `autonomous`           | See Agent Modes below                |
| `agent.model`             | SDK default            |                                      |
| `agent.provider_options`  | `{}`                   | Passed through to the SDK            |
| `context`                 | `{}`                   | Template variables for `{{ var }}`   |
| `workspace.root`          | `.runweave-workspaces` |                                      |
| `workspace.hooks`         | `{}`                   | `after_create`, `before_run`         |
| `concurrency.max`         | `1`                    | Max concurrent runs of this workflow |
| `concurrency.on_conflict` | `skip`                 | `skip` or `queue`                    |

### Trigger syntax

```yaml
# Shorthand cron
trigger:
  cron: "0 9 * * *"

# Explicit cron
trigger:
  type: cron
  schedule: "0 9 * * *"

# Manual (default when trigger is omitted)
trigger:
  type: manual
```

Polling patterns are expressed as cron + prompt:

```yaml
name: watch-project-board
trigger:
  cron: "*/30 * * * *"
prompt: |
  Check the GitHub Projects board for Ready issues and start working on them.
```

### Template variables

Prompts and hook commands support Liquid templates (`{{ var }}`). Keys in `context` become template variables. Environment variables are referenced with `$VAR_NAME` and expanded at load time.

## CLI Commands

```
runweave start [--workflows <dir>] [--no-watch]
```

Start the daemon. Registers all cron-triggered workflows in `<dir>` (default: `workflows/`). Watches the directory for YAML changes and hot-reloads them. Press Ctrl-C to stop.

---

```
runweave run <workflow.yaml> [--context key=value ...]
```

Execute a single workflow immediately without starting the daemon. Multiple `--context` flags are merged on top of the workflow's declared context.

```bash
runweave run workflows/fix-issues.yaml --context assignee=octocat
```

---

```
runweave status [--workflow <name>]
```

List all sessions and their current status. Filter by workflow name with `--workflow`.

```
SESSION   WORKFLOW     STATUS     BACKEND      STARTED
a1b2c3d4  fix-issues   running    claude-code  2026-03-24 09:00:00
e5f6a7b8  watch-board  completed  codex        2026-03-24 08:30:00
```

---

```
runweave logs <session-id> [--follow]
```

Print events for a session. `--follow` (`-f`) streams new events as they are appended.

---

```
runweave attach <session-id> [--message <text>]
```

Attach to a session and send messages. Without `--message`, enters interactive stdin mode — each line is sent as a separate prompt. Press Ctrl-D to detach (the session continues).

```bash
# One-shot message
runweave attach a1b2c3d4 --message "yes, proceed with the test command"

# Interactive
runweave attach a1b2c3d4
```

---

```
runweave stop <session-id>
```

Stop a running session.

---

```
runweave validate [path]
```

Validate a single workflow file or all `.yaml`/`.yml` files in a directory (default: `workflows/`). Exits non-zero if any file fails.

```bash
runweave validate workflows/fix-issues.yaml
runweave validate workflows/
```

---

```
runweave init [dir]
```

Initialize a runweave project. Creates `workflows/example.yaml` and `.gitignore` in `dir` (default: current directory). Existing files are not overwritten.

## Agent Modes

| Mode         | Description                                                          | Use case                            |
| ------------ | -------------------------------------------------------------------- | ----------------------------------- |
| `autonomous` | Agent runs without approval prompts (default)                        | Daemon / cron jobs                  |
| `full-auto`  | Same as `autonomous` but with unrestricted network/filesystem access | Tasks requiring full system access  |
| `supervised` | Pauses on tool calls outside the allowlist; resume with `attach`     | Tasks where human oversight matters |
| `readonly`   | Restricted to read-only tools                                        | Audits, reports, investigations     |

When a `supervised` session is waiting for input, `runweave status` shows `needs_input`. Use `runweave attach` to review and respond.

## Notification

### Global configuration

Create `$HOME/.runweave/config.yaml`:

```yaml
notify:
  channels:
    - type: desktop
    - type: webhook
      url: $SLACK_WEBHOOK_URL
  on:
    completed: true
    failed: true
    needs_input: true
```

Desktop notifications use `osascript` on macOS and `notify-send` on Linux. Webhook sends an HTTP POST with a Slack/Discord-compatible JSON payload.

### Per-workflow override

```yaml
# workflows/critical-fix.yaml
notify:
  channels:
    - type: webhook
      url: $PAGERDUTY_WEBHOOK
  on:
    failed: true
```

Per-workflow `notify` replaces the global configuration for that workflow.

## License

MIT
