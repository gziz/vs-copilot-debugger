/**
 * VS Code Copilot Integration - Language Model Tools
 *
 * Registers debug tools with VS Code's Language Model API (vscode.lm.registerTool)
 * for use with GitHub Copilot. Reuses tool definitions from mcp-server.ts.
 */

import * as vscode from 'vscode';
import { DebugBridge } from './debug-bridge';
import { buildTools, ToolDef } from './tools';

class LmToolWrapper implements vscode.LanguageModelTool<Record<string, unknown>> {
  constructor(
    private readonly def: ToolDef,
  ) {}

  async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, unknown>>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Running ${this.def.name}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<Record<string, unknown>>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    let text: string;
    try {
      const result = await this.def.handler(options.input);
      text = JSON.stringify(result, null, 2);
    } catch (error) {
      text = JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(text),
    ]);
  }
}

export function registerCopilotTools(
  context: vscode.ExtensionContext,
  bridge: DebugBridge,
): void {
  if (!vscode.lm || typeof vscode.lm.registerTool !== 'function') {
    console.log('VS Code Language Model Tools API not available');
    return;
  }

  const tools = buildTools(bridge);
  for (const def of tools) {
    try {
      context.subscriptions.push(
        vscode.lm.registerTool(def.name, new LmToolWrapper(def)),
      );
    } catch (error) {
      console.error(`Failed to register tool ${def.name}:`, error);
    }
  }

  console.log(`Registered ${tools.length} debug tools with VS Code Language Model API`);
}
