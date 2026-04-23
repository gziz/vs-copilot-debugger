# Copilot Debugger

A VS Code extension that lets **GitHub Copilot Chat** drive your VS Code Python debugger. Copilot can start debug sessions, set breakpoints, step through code, and inspect variables — and you see all of it live in the VS Code UI (gutter markers, debug console, editor step highlights).

https://github.com/user-attachments/assets/52646f5e-8282-48d5-bc15-5b1577bc0a7d
> Note: The video is sped up.

## Why Github Copilot only?

It would be natural to also ship a standalone MCP server so external agents like Claude Code CLI could use these tools — but we deliberately don't, and the reason is worth stating up front.

**MCP servers are easy to write** when the tools wrap something self-contained (a database, an HTTP API, a CLI).

**Our tools wrap `vscode.debug.*`**, which is fundamentally different: it only exists inside the VS Code extension host process. It controls a specific VS Code window's debug session and drives visible UI — breakpoint gutters, the debug console, editor step highlights. An MCP server spawned by an external agent runs in its own process and has no way to reach into VS Code. Making that work requires a second process bridged to the extension host over IPC, with socket discovery, workspace-to-window arbitration, lifecycle management, and event streaming — a real chunk of infrastructure.

The alternative — an MCP server that drives `debugpy` directly via DAP without involving VS Code — is simple, but it gives up the point of this project. The value here is that **Copilot drives *your* VS Code debugger**: you watch it work, share state with your human debugging session, and see everything in the native UI. A standalone debugpy driver would be a different (and already well-trodden) project.

GitHub Copilot Chat runs in the same process as the extension and can call `vscode.lm.registerTool()` directly — no IPC needed — so the Copilot-only path delivers the full experience with a fraction of the infrastructure.

## Architecture

```
GitHub Copilot Chat  ──(vscode.lm API)──▶  Extension  ──▶  DebugBridge  ──▶  vscode.debug  ──▶  debugpy
```

## Features

- Start, stop, and attach to Python debug sessions
- Set / remove / list breakpoints (including conditional & logpoints)
- Control execution: continue, pause, step into/over/out
- Inspect state: threads, stack traces, scopes, variables
- Evaluate arbitrary Python expressions in the debug context
- Set variable values during debugging

## Prerequisites

- VS Code 1.95.0 or later
- [Python extension for VS Code](https://marketplace.visualstudio.com/items?itemName=ms-python.python)
- `debugpy` (`pip install debugpy`)

## Install

### From source

```bash
npm install
npm run compile
npm run package
code --install-extension copilot-debugger-0.1.0.vsix
```

Or press F5 in VS Code to launch an Extension Development Host.

## Usage

Once installed, the debug tools are automatically available in GitHub Copilot Chat. Try:

- "Debug my Python script at `test.py`"
- "Set a breakpoint on the line `result = factorial(x)`"
- "Step into the function and show me the locals"
- "What is `result` at this point? Is it 120?"

## Available Tools

| Tool | Description |
|------|-------------|
| `debug_start_session` | Start debugging a Python script |
| `debug_stop_session` | Stop a debug session |
| `debug_list_sessions` | List active debug sessions |
| `debug_attach` | Attach to a running debugpy process |
| `debug_set_breakpoint_by_text` | Set a breakpoint by matching a line's exact text |
| `debug_remove_breakpoint` | Remove a breakpoint |
| `debug_list_breakpoints` | List all breakpoints |
| `debug_continue` / `debug_pause` | Continue / pause execution |
| `debug_step_into` / `debug_step_over` / `debug_step_out` | Stepping |
| `debug_get_threads` | Get all threads |
| `debug_get_stack_trace` | Get the call stack |
| `debug_get_scopes` | Get variable scopes for a stack frame |
| `debug_get_variables` | Get variables in a scope |
| `debug_evaluate` | Evaluate a Python expression (pass `frameId` to resolve locals) |
| `debug_set_variable` | Set a variable's value |

## Commands

| Command | Description |
|---------|-------------|
| `Copilot Debugger: Show Output` | Open the extension's Output Channel |
