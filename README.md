# Copilot Debug

A VS Code extension that exposes Python debug state to AI coding agents (GitHub Copilot and Claude Code CLI) via debug tools.

## Overview

This extension allows AI coding agents to programmatically control and inspect VS Code debug sessions. It supports two integration paths:

1. **VS Code Copilot**: Tools are registered via `vscode.lm.registerTool()` API and available directly in Copilot Chat
2. **Claude Code CLI**: Extension provides an MCP server that communicates via STDIO

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  GitHub Copilot │     │   Claude Code   │
│   (in VS Code)  │     │     (CLI)       │
└────────┬────────┘     └────────┬────────┘
         │                       │
   vscode.lm API            STDIO MCP
         │                       │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │   VS Code Extension   │
         │   (copilot-debug)     │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │  vscode.debug API     │
         │  (Debug Bridge)       │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │  VS Code Debugger     │
         │  (Python/debugpy)     │
         └───────────────────────┘
```

## Features

- Start and stop Python debug sessions
- Attach to running debugpy processes
- Set, remove, and list breakpoints (including conditional breakpoints)
- Control execution: continue, pause, step into, step over, step out
- Inspect program state: threads, stack traces, scopes, variables
- Evaluate expressions in debug context
- Set variable values during debugging

## Installation

### Prerequisites

- VS Code 1.85.0 or later
- Python extension for VS Code (ms-python.python)
- debugpy (`pip install debugpy`)

### Build from Source

```bash
cd debug-mcp-vscode
npm install
npm run compile
```

### Install Extension

Press F5 in VS Code to launch the Extension Development Host, or package the extension:

```bash
npm run package
code --install-extension copilot-debug-0.1.0.vsix
```

## Usage

### With GitHub Copilot

Once the extension is installed, the debug tools are automatically available in Copilot Chat. You can ask Copilot to:

- "Debug my Python script at /path/to/script.py"
- "Set a breakpoint at line 42 in main.py"
- "Show me the current stack trace"
- "What's the value of the variable `result`?"

### With Claude Code CLI

1. Start the MCP server:
   - Run command: `Debug MCP: Start MCP Server`
   - Or enable auto-start in settings: `debugMcp.autoStart: true`

2. Configure Claude Code to use the MCP server (add to your Claude Code config):

```json
{
  "mcpServers": {
    "debug-mcp": {
      "command": "code",
      "args": ["--command", "debugMcp.startServer"]
    }
  }
}
```

3. Use debug tools from Claude Code CLI:

```
> Use the debug_start_session tool to debug my script.py file
> Set a breakpoint at line 10
> Step through the code and show me the variables
```

## Available Tools

| Tool | Description |
|------|-------------|
| `debug_start_session` | Start debugging a Python script |
| `debug_stop_session` | Stop a debug session |
| `debug_list_sessions` | List active debug sessions |
| `debug_attach` | Attach to running debugpy process |
| `debug_set_breakpoint` | Set a breakpoint |
| `debug_remove_breakpoint` | Remove a breakpoint |
| `debug_list_breakpoints` | List all breakpoints |
| `debug_continue` | Continue execution |
| `debug_pause` | Pause execution |
| `debug_step_into` | Step into function |
| `debug_step_over` | Step over line |
| `debug_step_out` | Step out of function |
| `debug_get_threads` | Get all threads |
| `debug_get_stack_trace` | Get call stack |
| `debug_get_scopes` | Get variable scopes |
| `debug_get_variables` | Get variables in scope |
| `debug_evaluate` | Evaluate expression |
| `debug_set_variable` | Set variable value |

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `debugMcp.autoStart` | boolean | `false` | Auto-start MCP server on VS Code launch |
| `debugMcp.logLevel` | string | `info` | Log level: debug, info, warn, error |
| `debugMcp.serverPort` | number | `0` | MCP server port (0 = auto-assign) |

## Commands

| Command | Description |
|---------|-------------|
| `Debug MCP: Start MCP Server` | Start the MCP server for Claude Code |
| `Debug MCP: Stop MCP Server` | Stop the MCP server |
| `Debug MCP: Show Status` | Show server status and available tools |

## Tool Schemas

### debug_start_session

```json
{
  "script": "/path/to/script.py",
  "args": ["arg1", "arg2"],
  "cwd": "/working/directory",
  "stopOnEntry": true,
  "justMyCode": true,
  "pythonPath": "/path/to/python"
}
```

### debug_set_breakpoint

```json
{
  "file": "/path/to/file.py",
  "line": 42,
  "condition": "x > 10",
  "hitCondition": "5",
  "logMessage": "Value: {x}"
}
```

### debug_get_stack_trace

```json
{
  "sessionId": "session-id",
  "threadId": 1,
  "startFrame": 0,
  "levels": 20
}
```

### debug_get_variables

```json
{
  "sessionId": "session-id",
  "variablesReference": 1001,
  "filter": "named",
  "start": 0,
  "count": 100
}
```

### debug_evaluate

```json
{
  "sessionId": "session-id",
  "expression": "len(items)",
  "frameId": 1,
  "context": "repl"
}
```

## Development

### Project Structure

```
debug-mcp-vscode/
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript config
├── src/
│   ├── extension.ts          # Entry point
│   ├── debug-bridge.ts       # VS Code debug API wrapper
│   ├── copilot-tools.ts      # Copilot integration
│   ├── mcp-server.ts         # MCP server for Claude Code
│   └── types.ts              # Type definitions
└── README.md
```

### Building

```bash
npm install
npm run compile
```

### Testing

```bash
# Launch Extension Development Host
# Press F5 in VS Code

# Run unit tests
npm test
```

### Debugging the Extension

1. Open the extension project in VS Code
2. Press F5 to launch Extension Development Host
3. In the new window, open a Python project
4. Test the debug tools via Copilot or the MCP server

## Troubleshooting

### Debug session doesn't start

- Ensure the Python extension is installed
- Verify debugpy is installed: `pip install debugpy`
- Check the Output panel (View > Output > Debug MCP)

### MCP server not responding

- Ensure the server is running: check status bar
- Restart with: `Debug MCP: Stop MCP Server` then `Debug MCP: Start MCP Server`
- Check Output panel for errors

### Tools not appearing in Copilot

- Verify VS Code version is 1.85.0 or later
- Check if `vscode.lm.registerTool` is available (may require insider build)

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
