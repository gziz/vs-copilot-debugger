/**
 * VS Code Copilot Integration - Language Model Tools
 *
 * Registers debug tools with VS Code's Language Model API (vscode.lm.registerTool)
 * for use with GitHub Copilot and other LM-powered features.
 *
 * Note: The Language Model Tools API is still evolving in VS Code. This implementation
 * provides a fallback approach that works with current and future VS Code versions.
 */

import * as vscode from 'vscode';
import { DebugBridge } from './debug-bridge';

/**
 * Tool result formatting helper
 */
function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Error result formatting helper
 */
function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return JSON.stringify({ error: message });
}

/**
 * JSON Schema type for tool input definitions
 */
interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface JsonSchemaProperty {
  type: string;
  description?: string;
  items?: { type: string };
  enum?: string[];
}

/**
 * Tool definition interface
 */
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

/**
 * Create all debug tool definitions
 */
function createToolDefinitions(bridge: DebugBridge): ToolDefinition[] {
  return [
    // Session management
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
      handler: async (args) => {
        try {
          const result = await bridge.startSession({
            program: args.script as string,
            args: args.args as string[] | undefined,
            cwd: args.cwd as string | undefined,
            stopOnEntry: args.stopOnEntry as boolean | undefined,
            justMyCode: args.justMyCode as boolean | undefined,
            pythonPath: args.pythonPath as string | undefined,
            name: args.name as string | undefined,
          });
          return formatResult(result);
        } catch (error) {
          return formatError(error);
        }
      },
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
        try {
          await bridge.stopSession(args.sessionId as string);
          return formatResult({ success: true });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: 'debug_list_sessions',
      description: 'List all active debug sessions',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        try {
          const sessions = bridge.listSessions();
          return formatResult({ sessions });
        } catch (error) {
          return formatError(error);
        }
      },
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
      handler: async (args) => {
        try {
          const result = await bridge.attach({
            host: args.host as string | undefined,
            port: args.port as number,
            name: args.name as string | undefined,
          });
          return formatResult(result);
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // Breakpoints
    {
      name: 'debug_set_breakpoint',
      description: 'Set a breakpoint in a source file',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Path to the source file' },
          line: { type: 'number', description: 'Line number' },
          condition: { type: 'string', description: 'Condition expression' },
          hitCondition: { type: 'string', description: 'Hit count condition' },
          logMessage: { type: 'string', description: 'Log message (logpoint)' },
        },
        required: ['file', 'line'],
      },
      handler: async (args) => {
        try {
          const result = await bridge.setBreakpoint(
            args.file as string,
            args.line as number,
            args.condition as string | undefined,
            args.hitCondition as string | undefined,
            args.logMessage as string | undefined
          );
          return formatResult(result);
        } catch (error) {
          return formatError(error);
        }
      },
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
        try {
          await bridge.removeBreakpoint(args.breakpointId as string);
          return formatResult({ success: true });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: 'debug_list_breakpoints',
      description: 'List all breakpoints',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        try {
          const breakpoints = bridge.listBreakpoints();
          return formatResult({ breakpoints });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // Execution control
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
        try {
          await bridge.continue(args.sessionId as string, args.threadId as number | undefined);
          return formatResult({ success: true });
        } catch (error) {
          return formatError(error);
        }
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
        try {
          await bridge.pause(args.sessionId as string, args.threadId as number | undefined);
          return formatResult({ success: true });
        } catch (error) {
          return formatError(error);
        }
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
        try {
          await bridge.stepInto(args.sessionId as string, args.threadId as number | undefined);
          return formatResult({ success: true });
        } catch (error) {
          return formatError(error);
        }
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
        try {
          await bridge.stepOver(args.sessionId as string, args.threadId as number | undefined);
          return formatResult({ success: true });
        } catch (error) {
          return formatError(error);
        }
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
        try {
          await bridge.stepOut(args.sessionId as string, args.threadId as number | undefined);
          return formatResult({ success: true });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // Inspection
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
      handler: async (args) => {
        try {
          const threads = await bridge.getThreads(args.sessionId as string);
          return formatResult({ threads });
        } catch (error) {
          return formatError(error);
        }
      },
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
      handler: async (args) => {
        try {
          const stackFrames = await bridge.getStackTrace(
            args.sessionId as string,
            args.threadId as number | undefined,
            args.startFrame as number | undefined,
            args.levels as number | undefined
          );
          return formatResult({ stackFrames });
        } catch (error) {
          return formatError(error);
        }
      },
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
      handler: async (args) => {
        try {
          const scopes = await bridge.getScopes(
            args.sessionId as string,
            args.frameId as number
          );
          return formatResult({ scopes });
        } catch (error) {
          return formatError(error);
        }
      },
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
      handler: async (args) => {
        try {
          const variables = await bridge.getVariables(
            args.sessionId as string,
            args.variablesReference as number,
            args.filter as 'indexed' | 'named' | undefined,
            args.start as number | undefined,
            args.count as number | undefined
          );
          return formatResult({ variables });
        } catch (error) {
          return formatError(error);
        }
      },
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
          context: {
            type: 'string',
            enum: ['watch', 'repl', 'hover', 'clipboard'],
            description: 'Evaluation context',
          },
        },
        required: ['sessionId', 'expression'],
      },
      handler: async (args) => {
        try {
          const result = await bridge.evaluate(
            args.sessionId as string,
            args.expression as string,
            args.frameId as number | undefined,
            args.context as 'watch' | 'repl' | 'hover' | 'clipboard' | undefined
          );
          return formatResult(result);
        } catch (error) {
          return formatError(error);
        }
      },
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
      handler: async (args) => {
        try {
          const result = await bridge.setVariable(
            args.sessionId as string,
            args.variablesReference as number,
            args.name as string,
            args.value as string
          );
          return formatResult(result);
        } catch (error) {
          return formatError(error);
        }
      },
    },
  ];
}

/**
 * Wrapper class that implements the VS Code Language Model Tool interface
 * This provides compatibility with the evolving VS Code API
 */
class LanguageModelToolWrapper {
  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly inputSchema: JsonSchema,
    private readonly handler: (args: Record<string, unknown>) => Promise<string>
  ) {}

  /**
   * Invoke the tool - this matches the VS Code LanguageModelTool interface
   */
  async invoke(
    options: { input: Record<string, unknown> },
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const result = await this.handler(options.input);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(result),
    ]);
  }
}

/**
 * Register all Copilot tools
 */
export function registerCopilotTools(
  context: vscode.ExtensionContext,
  bridge: DebugBridge
): void {
  // Check if the Language Model API is available
  if (!vscode.lm || typeof vscode.lm.registerTool !== 'function') {
    console.log('VS Code Language Model Tools API not available - Copilot integration disabled');
    return;
  }

  const toolDefinitions = createToolDefinitions(bridge);

  for (const def of toolDefinitions) {
    try {
      const wrapper = new LanguageModelToolWrapper(
        def.name,
        def.description,
        def.inputSchema,
        def.handler
      );

      // Use type assertion to work around TypeScript strictness with evolving API
      const tool = wrapper as unknown as vscode.LanguageModelTool<Record<string, unknown>>;
      context.subscriptions.push(
        vscode.lm.registerTool(def.name, tool)
      );
    } catch (error) {
      console.error(`Failed to register tool ${def.name}:`, error);
    }
  }

  console.log(`Registered ${toolDefinitions.length} debug tools with VS Code Language Model API`);
}

/**
 * Get tool definitions for use by other modules (e.g., MCP server)
 */
export function getToolDefinitions(bridge: DebugBridge): ToolDefinition[] {
  return createToolDefinitions(bridge);
}
