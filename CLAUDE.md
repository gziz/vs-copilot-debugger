# Copilot Debug - VS Code Extension

VS Code extension that exposes Python debug state to **GitHub Copilot Chat** via VS Code's Language Model Tools API (`vscode.lm.registerTool`).

## Scope: Github Copilot only (why no standalone MCP server)

This extension deliberately does **not** ship a standalone MCP server, even though the tools it exposes would look natural as MCP tools. A short explanation of why is warranted because the decision isn't obvious:

**MCP servers are trivial to write.** The protocol is small, the SDKs are good, and when the tool implementation talks to something self-contained (a database, an HTTP API, a CLI binary) the whole server is a few hundred lines.

**But our tools wrap `vscode.debug.*`, and that's not a self-contained API.** `vscode.debug` only exists inside the VS Code extension host process. It controls the debug session of a specific VS Code window and drives visible UI (breakpoint gutters, the debug console, editor step highlights, hover values). An MCP server spawned by an external agent (e.g. Claude Code CLI) runs in its own process — it has no way to reach into VS Code and call `vscode.debug.continue()` or `vscode.debug.addBreakpoints()`. To make that work you'd need a second process (the MCP server binary) bridged to the extension host over IPC — socket discovery, workspace-to-window arbitration, lifecycle management, and event streaming all have to be designed and maintained.

**The alternative** — an MCP server that drives `debugpy` directly via DAP without involving VS Code — is simple, but it gives up the point of the project. The value this extension provides is specifically that **the AI drives *your* VS Code debugger**: you see breakpoints appear in the gutter, watch the debugger step through your code, and share state with your own human debugging session. A standalone debugpy driver would be a different (and already well-trodden) project.

Given that GitHub Copilot Chat runs in-process and can call `vscode.lm.registerTool()` directly — no IPC required — the Copilot-only path gives the full "AI drives my VS Code debugger" experience with a fraction of the infrastructure. If external-agent support becomes a real requirement later, the right move is a dedicated standalone server + IPC bridge, not a half-working in-extension STDIO server.

## Prerequisites

- VS Code 1.95.0+
- Python extension for VS Code (`ms-python.python`)
- debugpy (`pip install debugpy`)

## Build & test

```bash
npm install
npm run compile      # tsc -p ./
npm run watch        # tsc -watch
npm run lint         # eslint
npm run test         # compile + mocha dist/*.test.js
npm run package      # vsce package
```

To debug the extension: press F5 in VS Code to launch the Extension Development Host.

## Source layout

```
src/
  extension.ts          — Entry point: activate/deactivate, config, command registration
  debug-bridge.ts       — Core class wrapping VS Code debug API (DAP)
  types.ts              — Shared TypeScript interfaces
  tools.ts              — Tool definitions (name, schema, handler) shared across integrations
  copilot-tools.ts      — Registers tools with vscode.lm.registerTool for Copilot Chat
  multiline-eval.ts     — Wraps multi-line Python expressions for debugger eval
  multiline-eval.test.ts — Tests for multiline-eval
```

Output is compiled to `dist/`.

## Architecture

```
GitHub Copilot Chat  ──(vscode.lm API)──▶  Extension  ──▶  DebugBridge  ──▶  vscode.debug  ──▶  debugpy
```

- **`DebugBridge`** (`debug-bridge.ts`) is the central class. Wraps `vscode.debug.*`, manages breakpoint ID mapping (`bp_1`, `bp_2`, …), tracks stopped threads per session, fires stop/termination events.
- **`tools.ts`** defines each tool once: name, JSON schema, and an async handler that calls `DebugBridge`. `copilot-tools.ts` wraps each `ToolDef` in a `vscode.LanguageModelTool` and registers it.
- **`DefaultLogger`** (private in `debug-bridge.ts`) logs to a VS Code Output Channel, optionally mirrored to a file via `setFileOutput()`.

## Available tools

| Tool | Description |
|------|-------------|
| `debug_start_session` | Start debugging a Python script |
| `debug_stop_session` | Stop a debug session |
| `debug_list_sessions` | List active debug sessions |
| `debug_attach` | Attach to a running debugpy process |
| `debug_set_breakpoint_by_text` | Set breakpoint by matching exact line text |
| `debug_remove_breakpoint` | Remove a breakpoint |
| `debug_list_breakpoints` | List all breakpoints |
| `debug_continue` / `debug_pause` | Continue / pause execution |
| `debug_step_over` / `debug_step_into` / `debug_step_out` | Stepping |
| `debug_get_threads` | Get all threads |
| `debug_get_stack_trace` | Get call stack for a thread |
| `debug_get_scopes` | Get variable scopes for a stack frame |
| `debug_get_variables` | Get variables in a scope |
| `debug_evaluate` | Evaluate expression (pass `frameId` to resolve locals) |
| `debug_set_variable` | Set a variable's value |

## Configuration (VS Code settings)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `copilotDebug.logLevel` | string | `"info"` | Log level: `debug`, `info`, `warn`, `error` |
| `copilotDebug.enableLogging` | boolean | `false` | Mirror logs to `${workspaceFolder}/.vscode/copilot-debug.log` |

## VS Code commands

- `Copilot Debug: Show Output` — open the Output Channel

## Conventions

- TypeScript, compiled to `dist/`
- DAP types defined inline in `types.ts` (not imported from an external package)
- Large variable values truncated at 2KB to avoid overwhelming LLM context
- Multi-line Python expressions are wrapped to capture the last expression's result (Python debugger uses `exec()` which doesn't return values)
- Breakpoint text matching trims whitespace; multiple matches require the `occurrence` parameter
