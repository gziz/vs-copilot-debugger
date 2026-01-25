/**
 * Debug MCP Extension Entry Point
 *
 * This extension exposes Python debug state to AI coding agents via MCP tools.
 * It supports two integration paths:
 * 1. VS Code Copilot: Uses vscode.lm.registerTool() API
 * 2. Claude Code CLI: Extension spawns STDIO MCP server process
 */

import * as vscode from 'vscode';
import { DebugBridge } from './debug-bridge';
import { registerCopilotTools } from './copilot-tools';
import { McpServerManager } from './mcp-server';
import { ExtensionConfig } from './types';

let debugBridge: DebugBridge | undefined;
let mcpServerManager: McpServerManager | undefined;

/**
 * Get extension configuration
 */
function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('debugMcp');
  return {
    autoStart: config.get('autoStart', false),
    logLevel: config.get('logLevel', 'info') as ExtensionConfig['logLevel'],
    serverPort: config.get('serverPort', 0),
  };
}

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Debug MCP extension activating...');

  // Create the debug bridge
  debugBridge = new DebugBridge();
  context.subscriptions.push({
    dispose: () => debugBridge?.dispose(),
  });

  // Apply configuration
  const config = getConfig();
  debugBridge.setLogLevel(config.logLevel);

  // Register Copilot tools (always available)
  try {
    registerCopilotTools(context, debugBridge);
    console.log('Copilot tools registered');
  } catch (error) {
    console.error('Failed to register Copilot tools:', error);
    // Continue - Copilot integration might not be available
  }

  // Create MCP server manager
  mcpServerManager = new McpServerManager(debugBridge);
  context.subscriptions.push({
    dispose: () => mcpServerManager?.dispose(),
  });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('debugMcp.startServer', () => {
      mcpServerManager?.start();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debugMcp.stopServer', () => {
      mcpServerManager?.stop();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debugMcp.showStatus', () => {
      mcpServerManager?.showStatus();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debugMcp.showOutput', () => {
      debugBridge?.showOutput();
    })
  );

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('debugMcp')) {
        const newConfig = getConfig();
        debugBridge?.setLogLevel(newConfig.logLevel);
      }
    })
  );

  // Auto-start MCP server if configured
  if (config.autoStart) {
    mcpServerManager.start();
  }

  // Show welcome message on first activation
  const hasShownWelcome = context.globalState.get('debugMcp.hasShownWelcome', false);
  if (!hasShownWelcome) {
    const message =
      'Debug MCP extension activated. Use "Debug MCP: Start MCP Server" command to enable Claude Code CLI integration.';
    vscode.window.showInformationMessage(message, 'Learn More').then((selection) => {
      if (selection === 'Learn More') {
        vscode.env.openExternal(
          vscode.Uri.parse('https://github.com/anthropics/claude-code')
        );
      }
    });
    context.globalState.update('debugMcp.hasShownWelcome', true);
  }

  console.log('Debug MCP extension activated');
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  console.log('Debug MCP extension deactivating...');

  if (mcpServerManager) {
    mcpServerManager.dispose();
    mcpServerManager = undefined;
  }

  if (debugBridge) {
    debugBridge.dispose();
    debugBridge = undefined;
  }

  console.log('Debug MCP extension deactivated');
}

/**
 * Get the debug bridge instance (for testing)
 */
export function getDebugBridge(): DebugBridge | undefined {
  return debugBridge;
}

/**
 * Get the MCP server manager instance (for testing)
 */
export function getMcpServerManager(): McpServerManager | undefined {
  return mcpServerManager;
}
