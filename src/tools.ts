/**
 * Shared tool definitions for debug tools.
 *
 * Used by both the MCP server (STDIO) and Copilot integration (vscode.lm).
 */

import { DebugBridge } from './debug-bridge';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export function buildTools(bridge: DebugBridge): ToolDef[] {
  return [
    {
      name: 'debug_start_session',
      description: 'Start a new Python debug session for the specified script',
      inputSchema: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'Path to the Python script to debug' },
          args: { type: 'array', items: { type: 'string' }, description: 'Command-line arguments' },
          cwd: { type: 'string', description: 'Working directory' },
          stopOnEntry: { type: 'boolean', description: 'Stop on first line (default: true)' },
          justMyCode: { type: 'boolean', description: 'Debug only user code (default: true)' },
          pythonPath: { type: 'string', description: 'Path to Python executable' },
          name: { type: 'string', description: 'Session name' },
        },
        required: ['script'],
      },
      handler: async (args) => bridge.startSession({
        program: args.script as string,
        args: args.args as string[] | undefined,
        cwd: args.cwd as string | undefined,
        stopOnEntry: args.stopOnEntry as boolean | undefined,
        justMyCode: args.justMyCode as boolean | undefined,
        pythonPath: args.pythonPath as string | undefined,
        name: args.name as string | undefined,
      }),
    },
    {
      name: 'debug_stop_session',
      description: 'Stop an active debug session',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'ID of the session to stop' },
        },
        required: ['sessionId'],
      },
      handler: async (args) => {
        await bridge.stopSession(args.sessionId as string);
        return { success: true };
      },
    },
    {
      name: 'debug_list_sessions',
      description: 'List all active debug sessions',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ sessions: bridge.listSessions() }),
    },
    {
      name: 'debug_attach',
      description: 'Attach to a running debugpy process',
      inputSchema: {
        type: 'object',
        properties: {
          host: { type: 'string', description: 'Host to connect to (default: localhost)' },
          port: { type: 'number', description: 'Port to connect to' },
          name: { type: 'string', description: 'Session name' },
        },
        required: ['port'],
      },
      handler: async (args) => bridge.attach({
        host: args.host as string | undefined,
        port: args.port as number,
        name: args.name as string | undefined,
      }),
    },
    {
      name: 'debug_set_breakpoint_by_text',
      description: 'Set a breakpoint by matching exact line text. More reliable than line numbers since it finds the line automatically. The text must match exactly one line in the file (whitespace is trimmed). If multiple lines match, an error is returned with context for each match - use the occurrence parameter to select which one.',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Path to the source file' },
          lineText: { type: 'string', description: 'Exact text content of the line where the breakpoint should be set (leading/trailing whitespace is ignored)' },
          occurrence: { type: 'number', description: 'Which occurrence to use if multiple lines match (1-indexed). Only needed when the same text appears multiple times.' },
          condition: { type: 'string', description: 'Condition expression' },
          hitCondition: { type: 'string', description: 'Hit count condition' },
          logMessage: { type: 'string', description: 'Log message (logpoint)' },
        },
        required: ['file', 'lineText'],
      },
      handler: async (args) => bridge.setBreakpointByText(
        args.file as string,
        args.lineText as string,
        args.occurrence as number | undefined,
        args.condition as string | undefined,
        args.hitCondition as string | undefined,
        args.logMessage as string | undefined,
      ),
    },
    {
      name: 'debug_remove_breakpoint',
      description: 'Remove a breakpoint',
      inputSchema: {
        type: 'object',
        properties: {
          breakpointId: { type: 'string', description: 'ID of the breakpoint to remove' },
        },
        required: ['breakpointId'],
      },
      handler: async (args) => {
        await bridge.removeBreakpoint(args.breakpointId as string);
        return { success: true };
      },
    },
    {
      name: 'debug_list_breakpoints',
      description: 'List all breakpoints',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ breakpoints: bridge.listBreakpoints() }),
    },
    {
      name: 'debug_continue',
      description: 'Continue execution until the next breakpoint or program end',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Debug session ID' },
          threadId: { type: 'number', description: 'Thread ID (optional)' },
        },
        required: ['sessionId'],
      },
      handler: async (args) => {
        await bridge.continue(args.sessionId as string, args.threadId as number | undefined);
        return { success: true };
      },
    },
    {
      name: 'debug_pause',
      description: 'Pause execution of the debugged program',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Debug session ID' },
          threadId: { type: 'number', description: 'Thread ID (optional)' },
        },
        required: ['sessionId'],
      },
      handler: async (args) => {
        await bridge.pause(args.sessionId as string, args.threadId as number | undefined);
        return { success: true };
      },
    },
    {
      name: 'debug_step_into',
      description: 'Step into a function call',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Debug session ID' },
          threadId: { type: 'number', description: 'Thread ID (optional)' },
        },
        required: ['sessionId'],
      },
      handler: async (args) => {
        await bridge.stepInto(args.sessionId as string, args.threadId as number | undefined);
        return { success: true };
      },
    },
    {
      name: 'debug_step_over',
      description: 'Step over the current line',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Debug session ID' },
          threadId: { type: 'number', description: 'Thread ID (optional)' },
        },
        required: ['sessionId'],
      },
      handler: async (args) => {
        await bridge.stepOver(args.sessionId as string, args.threadId as number | undefined);
        return { success: true };
      },
    },
    {
      name: 'debug_step_out',
      description: 'Step out of the current function',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Debug session ID' },
          threadId: { type: 'number', description: 'Thread ID (optional)' },
        },
        required: ['sessionId'],
      },
      handler: async (args) => {
        await bridge.stepOut(args.sessionId as string, args.threadId as number | undefined);
        return { success: true };
      },
    },
    {
      name: 'debug_get_threads',
      description: 'Get all threads in the debug session',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Debug session ID' },
        },
        required: ['sessionId'],
      },
      handler: async (args) => ({ threads: await bridge.getThreads(args.sessionId as string) }),
    },
    {
      name: 'debug_get_stack_trace',
      description: 'Get the call stack for a thread',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Debug session ID' },
          threadId: { type: 'number', description: 'Thread ID (optional)' },
          startFrame: { type: 'number', description: 'Start frame index' },
          levels: { type: 'number', description: 'Number of frames to retrieve' },
        },
        required: ['sessionId'],
      },
      handler: async (args) => ({
        stackFrames: await bridge.getStackTrace(
          args.sessionId as string,
          args.threadId as number | undefined,
          args.startFrame as number | undefined,
          args.levels as number | undefined,
        ),
      }),
    },
    {
      name: 'debug_get_scopes',
      description: 'Get variable scopes for a stack frame',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Debug session ID' },
          frameId: { type: 'number', description: 'Stack frame ID from get_stack_trace' },
        },
        required: ['sessionId', 'frameId'],
      },
      handler: async (args) => ({
        scopes: await bridge.getScopes(args.sessionId as string, args.frameId as number),
      }),
    },
    {
      name: 'debug_get_variables',
      description: 'Get variables in a scope',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Debug session ID' },
          variablesReference: { type: 'number', description: 'Variables reference from scope or variable' },
          filter: { type: 'string', enum: ['indexed', 'named'], description: 'Filter type' },
          start: { type: 'number', description: 'Start index for indexed variables' },
          count: { type: 'number', description: 'Number of variables to retrieve' },
        },
        required: ['sessionId', 'variablesReference'],
      },
      handler: async (args) => ({
        variables: await bridge.getVariables(
          args.sessionId as string,
          args.variablesReference as number,
          args.filter as 'indexed' | 'named' | undefined,
          args.start as number | undefined,
          args.count as number | undefined,
        ),
      }),
    },
    {
      name: 'debug_evaluate',
      description: 'Evaluate an expression in the current debug context',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Debug session ID' },
          expression: { type: 'string', description: 'Expression to evaluate' },
          frameId: { type: 'number', description: 'Stack frame ID (optional)' },
          context: { type: 'string', enum: ['watch', 'repl', 'hover', 'clipboard'], description: 'Evaluation context' },
        },
        required: ['sessionId', 'expression'],
      },
      handler: async (args) => bridge.evaluate(
        args.sessionId as string,
        args.expression as string,
        args.frameId as number | undefined,
        args.context as 'watch' | 'repl' | 'hover' | 'clipboard' | undefined,
      ),
    },
    {
      name: 'debug_set_variable',
      description: 'Set the value of a variable',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Debug session ID' },
          variablesReference: { type: 'number', description: 'Variables reference containing the variable' },
          name: { type: 'string', description: 'Variable name' },
          value: { type: 'string', description: 'New value' },
        },
        required: ['sessionId', 'variablesReference', 'name', 'value'],
      },
      handler: async (args) => bridge.setVariable(
        args.sessionId as string,
        args.variablesReference as number,
        args.name as string,
        args.value as string,
      ),
    },
  ];
}
