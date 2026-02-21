# Debug MCP - VS Code Extension

VS Code extension that exposes Python debug state to AI coding agents via MCP tools. Two integration paths:

1. **VS Code Copilot** — tools registered via `vscode.lm.registerTool()`, available in Copilot Chat
2. **Claude Code CLI** — extension spawns STDIO MCP server process

## Prerequisites

- VS Code 1.95.0+
- Python extension for VS Code (ms-python.python)
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

To debug the extension: press F5 in VS Code to launch Extension Development Host.

## Source layout

```
src/
  extension.ts          — Entry point: activate/deactivate, config, command registration
  debug-bridge.ts       — Core class wrapping VS Code debug API (DAP). Contains DefaultLogger and DebugBridge
  types.ts              — All shared TypeScript interfaces (SessionInfo, StopInfo, ExtensionConfig, DAP types, ToolInputs namespace)
  copilot-tools.ts      — Registers debug tools with VS Code's Language Model API for Copilot
  mcp-server.ts         — MCP server (JSON-RPC over STDIO) for Claude Code CLI
  multiline-eval.ts     — Wraps multi-line Python expressions for debugger eval
  multiline-eval.test.ts — Tests for multiline-eval
```

Output is compiled to `dist/`.

## Architecture

```
GitHub Copilot (vscode.lm API)  ←──┐
                                    ├──→  VS Code Extension  ──→  vscode.debug API (DebugBridge)  ──→  debugpy
Claude Code CLI (STDIO MCP)    ←──┘
```

- **DebugBridge** (`src/debug-bridge.ts`) is the central class. Wraps VS Code debug API, manages breakpoints (internal ID mapping `bp_1`, `bp_2`...), tracks stopped threads per session, fires stop/termination event listeners.
- **DefaultLogger** (private class in `debug-bridge.ts`) logs to both VS Code Output Channel and optionally to a file (`setFileOutput()`). Log file defaults to `${workspaceFolder}/.vscode/debug-mcp.log`.
- Extension activates on startup (`onStartupFinished`), sets log level to `debug`, enables file logging automatically.

## Available MCP tools

| Tool | Description |
|------|-------------|
| `debug_start_session` | Start debugging a Python script |
| `debug_stop_session` | Stop a debug session |
| `debug_list_sessions` | List active debug sessions |
| `debug_set_breakpoint_by_text` | Set breakpoint by matching exact line text |
| `debug_remove_breakpoint` | Remove a breakpoint |
| `debug_continue` | Continue execution |
| `debug_step_over` | Step over line |
| `debug_step_into` | Step into function |
| `debug_step_out` | Step out of function |
| `debug_get_threads` | Get all threads |
| `debug_get_stack_trace` | Get call stack |
| `debug_get_scopes` | Get variable scopes |
| `debug_get_variables` | Get variables in scope |
| `debug_evaluate` | Evaluate expression in debug context |

## Configuration (VS Code settings)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `debugMcp.autoStart` | boolean | `false` | Auto-start MCP server on VS Code launch |
| `debugMcp.logLevel` | string | `"info"` | Log level: debug, info, warn, error |
| `debugMcp.serverPort` | number | `0` | MCP server port (0 = auto-assign) |
| `debugMcp.logFile` | string | — | Override default log file path |

## VS Code commands

- `Debug MCP: Start MCP Server` — start MCP server for Claude Code
- `Debug MCP: Stop MCP Server` — stop the MCP server
- `Debug MCP: Show Status` — show server status

## Conventions

- TypeScript, compiled to `dist/`
- DAP types defined inline in `types.ts` (not imported from external package)
- Large variable values truncated at 2KB to avoid overwhelming LLM context
- Multi-line Python expressions are wrapped to capture last expression's result (Python debugger uses `exec()` which doesn't return values)
- Breakpoint text matching trims whitespace; multiple matches require `occurrence` parameter
