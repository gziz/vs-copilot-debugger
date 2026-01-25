/**
 * MCP Server for Claude Code CLI
 *
 * This module provides an MCP server that can be spawned as a child process
 * by the VS Code extension. It communicates with Claude Code CLI via STDIO
 * and routes tool calls to the Debug Bridge.
 */

import * as vscode from 'vscode';
import { DebugBridge } from './debug-bridge';
import {
  SessionInfo,
  BreakpointInfo,
  ThreadInfo,
  StackFrameInfo,
  ScopeInfo,
  VariableInfo,
  EvalResult,
} from './types';

/**
 * MCP Tool definition
 */
interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP Server message types
 */
interface McpRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

interface McpResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface McpNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

type McpMessage = McpRequest | McpResponse | McpNotification;

/**
 * Tool handler type
 */
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * MCP Server class that communicates via JSON-RPC over STDIO
 */
export class DebugMcpServer {
  private tools: Map<string, { definition: McpTool; handler: ToolHandler }> = new Map();
  private inputBuffer = '';
  private outputChannel: vscode.OutputChannel;
  private isRunning = false;

  constructor(private bridge: DebugBridge) {
    this.outputChannel = vscode.window.createOutputChannel('Debug MCP Server');
    this.registerTools();
  }

  /**
   * Register all debug tools
   */
  private registerTools(): void {
    // Session management
    this.registerTool({
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
    }, async (args): Promise<SessionInfo> => {
      return this.bridge.startSession({
        program: args.script as string,
        args: args.args as string[] | undefined,
        cwd: args.cwd as string | undefined,
        stopOnEntry: args.stopOnEntry as boolean | undefined,
        justMyCode: args.justMyCode as boolean | undefined,
        pythonPath: args.pythonPath as string | undefined,
        name: args.name as string | undefined,
      });
    });

    this.registerTool({
      name: 'debug_stop_session',
      description: 'Stop an active debug session',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'ID of the session to stop' },
        },
        required: ['sessionId'],
      },
    }, async (args): Promise<{ success: boolean }> => {
      await this.bridge.stopSession(args.sessionId as string);
      return { success: true };
    });

    this.registerTool({
      name: 'debug_list_sessions',
      description: 'List all active debug sessions',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    }, async (): Promise<{ sessions: SessionInfo[] }> => {
      return { sessions: this.bridge.listSessions() };
    });

    this.registerTool({
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
    }, async (args): Promise<SessionInfo> => {
      return this.bridge.attach({
        host: args.host as string | undefined,
        port: args.port as number,
        name: args.name as string | undefined,
      });
    });

    // Breakpoints
    this.registerTool({
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
    }, async (args): Promise<BreakpointInfo> => {
      return this.bridge.setBreakpoint(
        args.file as string,
        args.line as number,
        args.condition as string | undefined,
        args.hitCondition as string | undefined,
        args.logMessage as string | undefined
      );
    });

    this.registerTool({
      name: 'debug_remove_breakpoint',
      description: 'Remove a breakpoint',
      inputSchema: {
        type: 'object',
        properties: {
          breakpointId: { type: 'string', description: 'ID of the breakpoint to remove' },
        },
        required: ['breakpointId'],
      },
    }, async (args): Promise<{ success: boolean }> => {
      await this.bridge.removeBreakpoint(args.breakpointId as string);
      return { success: true };
    });

    this.registerTool({
      name: 'debug_list_breakpoints',
      description: 'List all breakpoints',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    }, async (): Promise<{ breakpoints: BreakpointInfo[] }> => {
      return { breakpoints: this.bridge.listBreakpoints() };
    });

    // Execution control
    this.registerTool({
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
    }, async (args): Promise<{ success: boolean }> => {
      await this.bridge.continue(args.sessionId as string, args.threadId as number | undefined);
      return { success: true };
    });

    this.registerTool({
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
    }, async (args): Promise<{ success: boolean }> => {
      await this.bridge.pause(args.sessionId as string, args.threadId as number | undefined);
      return { success: true };
    });

    this.registerTool({
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
    }, async (args): Promise<{ success: boolean }> => {
      await this.bridge.stepInto(args.sessionId as string, args.threadId as number | undefined);
      return { success: true };
    });

    this.registerTool({
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
    }, async (args): Promise<{ success: boolean }> => {
      await this.bridge.stepOver(args.sessionId as string, args.threadId as number | undefined);
      return { success: true };
    });

    this.registerTool({
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
    }, async (args): Promise<{ success: boolean }> => {
      await this.bridge.stepOut(args.sessionId as string, args.threadId as number | undefined);
      return { success: true };
    });

    // Inspection
    this.registerTool({
      name: 'debug_get_threads',
      description: 'Get all threads in the debug session',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Debug session ID' },
        },
        required: ['sessionId'],
      },
    }, async (args): Promise<{ threads: ThreadInfo[] }> => {
      return { threads: await this.bridge.getThreads(args.sessionId as string) };
    });

    this.registerTool({
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
    }, async (args): Promise<{ stackFrames: StackFrameInfo[] }> => {
      return {
        stackFrames: await this.bridge.getStackTrace(
          args.sessionId as string,
          args.threadId as number | undefined,
          args.startFrame as number | undefined,
          args.levels as number | undefined
        ),
      };
    });

    this.registerTool({
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
    }, async (args): Promise<{ scopes: ScopeInfo[] }> => {
      return {
        scopes: await this.bridge.getScopes(args.sessionId as string, args.frameId as number),
      };
    });

    this.registerTool({
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
    }, async (args): Promise<{ variables: VariableInfo[] }> => {
      return {
        variables: await this.bridge.getVariables(
          args.sessionId as string,
          args.variablesReference as number,
          args.filter as 'indexed' | 'named' | undefined,
          args.start as number | undefined,
          args.count as number | undefined
        ),
      };
    });

    this.registerTool({
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
    }, async (args): Promise<EvalResult> => {
      return this.bridge.evaluate(
        args.sessionId as string,
        args.expression as string,
        args.frameId as number | undefined,
        args.context as 'watch' | 'repl' | 'hover' | 'clipboard' | undefined
      );
    });

    this.registerTool({
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
    }, async (args): Promise<VariableInfo> => {
      return this.bridge.setVariable(
        args.sessionId as string,
        args.variablesReference as number,
        args.name as string,
        args.value as string
      );
    });
  }

  /**
   * Register a tool
   */
  private registerTool(definition: McpTool, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  /**
   * Start the server - listen on STDIO
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.outputChannel.appendLine('MCP Server starting...');

    // Listen for input on stdin
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (data: string) => {
      this.handleInput(data);
    });

    process.stdin.on('end', () => {
      this.outputChannel.appendLine('stdin closed');
      this.stop();
    });

    this.outputChannel.appendLine('MCP Server started');
  }

  /**
   * Stop the server
   */
  stop(): void {
    this.isRunning = false;
    this.outputChannel.appendLine('MCP Server stopped');
  }

  /**
   * Handle incoming data
   */
  private handleInput(data: string): void {
    this.inputBuffer += data;

    // Process complete messages (newline-delimited JSON)
    const lines = this.inputBuffer.split('\n');
    this.inputBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        this.processMessage(trimmed);
      }
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(message: string): Promise<void> {
    try {
      const parsed = JSON.parse(message) as McpMessage;
      this.outputChannel.appendLine(`Received: ${message}`);

      if ('method' in parsed) {
        if ('id' in parsed) {
          // Request
          await this.handleRequest(parsed as McpRequest);
        } else {
          // Notification
          this.handleNotification(parsed as McpNotification);
        }
      }
    } catch (error) {
      this.outputChannel.appendLine(`Error parsing message: ${error}`);
    }
  }

  /**
   * Handle a request
   */
  private async handleRequest(request: McpRequest): Promise<void> {
    let response: McpResponse;

    try {
      switch (request.method) {
        case 'initialize':
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
              },
              serverInfo: {
                name: 'copilot-debug',
                version: '0.1.0',
              },
            },
          };
          break;

        case 'tools/list':
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: Array.from(this.tools.values()).map((t) => t.definition),
            },
          };
          break;

        case 'tools/call': {
          const params = request.params as { name: string; arguments?: Record<string, unknown> };
          const tool = this.tools.get(params.name);

          if (!tool) {
            response = {
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32601,
                message: `Unknown tool: ${params.name}`,
              },
            };
          } else {
            try {
              const result = await tool.handler(params.arguments || {});
              response = {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(result, null, 2),
                    },
                  ],
                },
              };
            } catch (error) {
              response = {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        error: error instanceof Error ? error.message : String(error),
                      }),
                    },
                  ],
                  isError: true,
                },
              };
            }
          }
          break;
        }

        default:
          response = {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`,
            },
          };
      }
    } catch (error) {
      response = {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }

    this.sendMessage(response);
  }

  /**
   * Handle a notification
   */
  private handleNotification(notification: McpNotification): void {
    this.outputChannel.appendLine(`Notification: ${notification.method}`);
    // Handle notifications as needed
    if (notification.method === 'notifications/initialized') {
      this.outputChannel.appendLine('Client initialized');
    }
  }

  /**
   * Send a message
   */
  private sendMessage(message: McpResponse): void {
    const json = JSON.stringify(message);
    this.outputChannel.appendLine(`Sending: ${json}`);
    process.stdout.write(json + '\n');
  }

  /**
   * Get the tools list for display
   */
  getToolsList(): McpTool[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * Show the output channel
   */
  showOutput(): void {
    this.outputChannel.show();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stop();
    this.outputChannel.dispose();
  }
}

/**
 * MCP Server Manager - manages the lifecycle of the MCP server
 * This is used by the extension to start/stop the server via commands
 */
export class McpServerManager {
  private server: DebugMcpServer | null = null;
  private statusBarItem: vscode.StatusBarItem;

  constructor(private bridge: DebugBridge) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'debugMcp.showStatus';
    this.updateStatusBar();
  }

  /**
   * Start the MCP server
   */
  start(): void {
    if (this.server) {
      vscode.window.showInformationMessage('MCP Server is already running');
      return;
    }

    this.server = new DebugMcpServer(this.bridge);
    this.server.start();
    this.updateStatusBar();

    vscode.window.showInformationMessage('Debug MCP Server started');
  }

  /**
   * Stop the MCP server
   */
  stop(): void {
    if (!this.server) {
      vscode.window.showInformationMessage('MCP Server is not running');
      return;
    }

    this.server.stop();
    this.server.dispose();
    this.server = null;
    this.updateStatusBar();

    vscode.window.showInformationMessage('Debug MCP Server stopped');
  }

  /**
   * Show server status
   */
  showStatus(): void {
    const status = this.server ? 'Running' : 'Stopped';
    const tools = this.server ? this.server.getToolsList() : [];

    let message = `Debug MCP Server: ${status}`;
    if (tools.length > 0) {
      message += `\n\nAvailable tools (${tools.length}):\n`;
      message += tools.map((t) => `  - ${t.name}`).join('\n');
    }

    vscode.window.showInformationMessage(message, { modal: true });
  }

  /**
   * Update the status bar
   */
  private updateStatusBar(): void {
    if (this.server) {
      this.statusBarItem.text = '$(debug) MCP: Running';
      this.statusBarItem.tooltip = 'Debug MCP Server is running';
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.statusBarItem.text = '$(debug) MCP: Stopped';
      this.statusBarItem.tooltip = 'Debug MCP Server is stopped';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
    }
    this.statusBarItem.show();
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.server) {
      this.server.dispose();
    }
    this.statusBarItem.dispose();
  }
}
