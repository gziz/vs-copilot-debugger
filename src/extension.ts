/**
 * Copilot Debugger Extension Entry Point
 *
 * Exposes Python debug state to GitHub Copilot Chat via VS Code's
 * Language Model Tools API (vscode.lm.registerTool).
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DebugBridge } from './debug-bridge';
import { registerCopilotTools } from './copilot-tools';
import { ExtensionConfig } from './types';

let debugBridge: DebugBridge | undefined;

function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('copilotDebugger');
  return {
    logLevel: config.get('logLevel', 'info') as ExtensionConfig['logLevel'],
    enableLogging: config.get('enableLogging', false),
  };
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Copilot Debugger extension activating...');

  debugBridge = new DebugBridge();
  context.subscriptions.push({
    dispose: () => debugBridge?.dispose(),
  });

  const config = getConfig();
  debugBridge.setLogLevel(config.logLevel);

  if (config.enableLogging) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      const logPath = path.join(workspaceFolder, '.vscode', 'copilot-debugger.log');
      debugBridge.setFileOutput(logPath);
    }
  }

  try {
    registerCopilotTools(context, debugBridge);
  } catch (error) {
    console.error('Failed to register Copilot tools:', error);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('copilotDebugger.showOutput', () => {
      debugBridge?.showOutput();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('copilotDebugger')) {
        const newConfig = getConfig();
        debugBridge?.setLogLevel(newConfig.logLevel);
      }
    })
  );

  console.log('Copilot Debugger extension activated');
}

export function deactivate(): void {
  console.log('Copilot Debugger extension deactivating...');

  if (debugBridge) {
    debugBridge.dispose();
    debugBridge = undefined;
  }

  console.log('Copilot Debugger extension deactivated');
}

export function getDebugBridge(): DebugBridge | undefined {
  return debugBridge;
}
