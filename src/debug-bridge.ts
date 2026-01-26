/**
 * Debug Bridge - Wraps VS Code's debug API for MCP tools
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  SessionInfo,
  LaunchOptions,
  AttachOptions,
  BreakpointInfo,
  ThreadInfo,
  StackFrameInfo,
  ScopeInfo,
  VariableInfo,
  EvalResult,
  Logger,
  DAPThreadsResponse,
  DAPStackTraceResponse,
  DAPScopesResponse,
  DAPVariablesResponse,
  DAPEvaluateResponse,
  StopInfo,
  ExceptionInfo,
  StartSessionResult,
} from './types';

/**
 * Default maximum size for variable values in bytes.
 * Values exceeding this limit will be truncated to prevent
 * overwhelming the LLM context window.
 */
const DEFAULT_MAX_VALUE_SIZE = 2 * 1024; // 5KB

/**
 * Truncates a string value if it exceeds the maximum size.
 * @param value The value to potentially truncate
 * @param maxSize Maximum allowed size in characters
 * @returns The original or truncated value with metadata
 */
function truncateValue(value: string, maxSize: number = DEFAULT_MAX_VALUE_SIZE): string {
  if (value.length <= maxSize) {
    return value;
  }
  
  const truncated = value.substring(0, maxSize);
  const originalSize = value.length;
  const truncatedMsg = `\n... [TRUNCATED: Value is ${originalSize.toLocaleString()} chars, showing first ${maxSize.toLocaleString()}. Use debug_evaluate with specific queries like '.head()', '.describe()', or slice notation to explore large data.]`;
  
  return truncated + truncatedMsg;
}

/**
 * Default logger that uses VS Code output channel
 */
class DefaultLogger implements Logger {
  private outputChannel: vscode.OutputChannel;
  private level: 'debug' | 'info' | 'warn' | 'error' = 'info';

  private readonly levelPriority = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Debug MCP');
  }

  setLevel(level: 'debug' | 'info' | 'warn' | 'error') {
    this.level = level;
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.level];
  }

  private formatMessage(level: string, message: string, args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      this.outputChannel.appendLine(this.formatMessage('debug', message, args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      this.outputChannel.appendLine(this.formatMessage('info', message, args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      this.outputChannel.appendLine(this.formatMessage('warn', message, args));
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      this.outputChannel.appendLine(this.formatMessage('error', message, args));
    }
  }

  show() {
    this.outputChannel.show();
  }

  dispose() {
    this.outputChannel.dispose();
  }
}

/**
 * Maps internal breakpoint IDs to VS Code breakpoint objects
 */
interface BreakpointMapping {
  id: string;
  vscodeBreakpoint: vscode.SourceBreakpoint;
  file: string;
  line: number;
}

/**
 * Raw stop event data from DAP
 */
interface RawStopEvent {
  reason: string;
  threadId?: number;
  description?: string;
  text?: string;
}

/**
 * Callback type for stop event listeners
 */
type StopEventListener = (sessionId: string, event: RawStopEvent) => void;

/**
 * Callback type for termination event listeners
 */
type TerminationListener = (sessionId: string, reason?: string) => void;

/**
 * Debug Bridge class - wraps VS Code's debug API
 */
export class DebugBridge {
  private logger: DefaultLogger;
  private breakpointMappings: Map<string, BreakpointMapping> = new Map();
  private breakpointCounter = 0;
  private sessionStoppedThreads: Map<string, Map<number, string>> = new Map();
  private disposables: vscode.Disposable[] = [];

  // Store full stop event details per session (most recent)
  private sessionStopEvents: Map<string, RawStopEvent> = new Map();

  // Event listeners for stop events
  private stopEventListeners: StopEventListener[] = [];

  // Event listeners for termination events
  private terminationListeners: TerminationListener[] = [];

  constructor() {
    this.logger = new DefaultLogger();
    this.setupEventListeners();
  }

  /**
   * Set up VS Code debug event listeners
   */
  private setupEventListeners() {
    // Track stopped threads for each session
    this.disposables.push(
      vscode.debug.onDidReceiveDebugSessionCustomEvent((event) => {
        if (event.event === 'stopped') {
          const sessionId = event.session.id;
          if (!this.sessionStoppedThreads.has(sessionId)) {
            this.sessionStoppedThreads.set(sessionId, new Map());
          }
          const threadId = event.body?.threadId as number;
          const reason = event.body?.reason as string;
          const description = event.body?.description as string | undefined;
          const text = event.body?.text as string | undefined;

          if (threadId !== undefined) {
            this.sessionStoppedThreads.get(sessionId)!.set(threadId, reason);
          }

          // Store full stop event details
          const rawEvent: RawStopEvent = {
            reason,
            threadId,
            description,
            text,
          };
          this.sessionStopEvents.set(sessionId, rawEvent);

          // Fire stop event listeners
          for (const listener of this.stopEventListeners) {
            try {
              listener(sessionId, rawEvent);
            } catch (error) {
              this.logger.error('Error in stop event listener', error);
            }
          }

          this.logger.debug(`Thread ${threadId} stopped: ${reason}`, { sessionId, description, text });
        } else if (event.event === 'continued') {
          const sessionId = event.session.id;
          const threadId = event.body?.threadId as number;
          if (threadId !== undefined && this.sessionStoppedThreads.has(sessionId)) {
            this.sessionStoppedThreads.get(sessionId)!.delete(threadId);
          }
        }
      })
    );

    // Clean up session tracking on termination
    this.disposables.push(
      vscode.debug.onDidTerminateDebugSession((session) => {
        this.sessionStoppedThreads.delete(session.id);
        this.sessionStopEvents.delete(session.id);

        // Fire termination listeners
        for (const listener of this.terminationListeners) {
          try {
            listener(session.id);
          } catch (error) {
            this.logger.error('Error in termination listener', error);
          }
        }

        this.logger.info(`Debug session terminated: ${session.name}`, { sessionId: session.id });
      })
    );

    // Log session start
    this.disposables.push(
      vscode.debug.onDidStartDebugSession((session) => {
        this.logger.info(`Debug session started: ${session.name}`, { sessionId: session.id });
      })
    );

    // Track breakpoint changes
    this.disposables.push(
      vscode.debug.onDidChangeBreakpoints((event) => {
        this.logger.debug('Breakpoints changed', {
          added: event.added.length,
          removed: event.removed.length,
          changed: event.changed.length,
        });
      })
    );
  }

  /**
   * Set the log level
   */
  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error') {
    this.logger.setLevel(level);
  }

  /**
   * Show the output channel
   */
  showOutput() {
    this.logger.show();
  }

  // ==================== Initial Stop Event Handling ====================

  /**
   * Wait for the initial stop event after starting a session.
   * Uses polling approach for reliability across VS Code versions.
   */
  private async waitForInitialStop(
    session: vscode.DebugSession,
    timeoutMs: number = 10000
  ): Promise<{ stopEvent?: RawStopEvent; terminated?: boolean; terminationReason?: string }> {
    const sessionId = session.id;
    const startTime = Date.now();
    const pollInterval = 100;

    // Set up termination listener
    let terminated = false;
    let terminationReason: string | undefined;
    const terminationListener: TerminationListener = (terminatedSessionId, reason) => {
      if (terminatedSessionId === sessionId) {
        terminated = true;
        terminationReason = reason;
      }
    };
    this.terminationListeners.push(terminationListener);

    const cleanup = () => {
      const idx = this.terminationListeners.indexOf(terminationListener);
      if (idx >= 0) this.terminationListeners.splice(idx, 1);
    };

    try {
      while (Date.now() - startTime < timeoutMs) {
        // Check if session terminated
        if (terminated) {
          return { terminated: true, terminationReason: terminationReason || 'Session terminated unexpectedly' };
        }

        // Check if we have a cached stop event
        const existingEvent = this.sessionStopEvents.get(sessionId);
        if (existingEvent) {
          return { stopEvent: existingEvent };
        }

        // Check if any thread is stopped by checking sessionStoppedThreads
        const stoppedThreads = this.sessionStoppedThreads.get(sessionId);
        if (stoppedThreads && stoppedThreads.size > 0) {
          // Get the first stopped thread's info
          const [threadId, reason] = stoppedThreads.entries().next().value as [number, string];

          // Build a RawStopEvent from the available info
          const stopEvent: RawStopEvent = {
            reason,
            threadId,
          };
          return { stopEvent };
        }

        // Also try to poll threads directly via DAP to catch cases where our listener missed the event
        try {
          const threadsResponse = await session.customRequest('threads') as DAPThreadsResponse;
          if (threadsResponse.threads.length > 0) {
            // Try to get stack trace for first thread - if successful, it's stopped
            const threadId = threadsResponse.threads[0].id;
            try {
              const stackResponse = await session.customRequest('stackTrace', {
                threadId,
                startFrame: 0,
                levels: 1,
              }) as DAPStackTraceResponse;

              if (stackResponse.stackFrames.length > 0) {
                // Thread has a stack trace, so it's stopped
                // Check if we have a reason in our map
                const reason = stoppedThreads?.get(threadId) || 'entry';
                const stopEvent: RawStopEvent = {
                  reason,
                  threadId,
                };
                return { stopEvent };
              }
            } catch {
              // Thread not stopped or other error, continue polling
            }
          }
        } catch {
          // Session might be terminating or not ready yet
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      // Timeout - return empty
      this.logger.warn(`Timeout waiting for initial stop event for session ${sessionId}`);
      return {};
    } finally {
      cleanup();
    }
  }

  /**
   * Build a StopInfo object from a raw stop event, fetching exception details if needed.
   */
  private async buildStopInfo(
    session: vscode.DebugSession,
    rawEvent: RawStopEvent
  ): Promise<StopInfo> {
    const stopInfo: StopInfo = {
      reason: this.mapStopReason(rawEvent.reason),
      threadId: rawEvent.threadId,
    };

    // Get location from stack trace
    if (rawEvent.threadId !== undefined) {
      try {
        const stackTrace = await session.customRequest('stackTrace', {
          threadId: rawEvent.threadId,
          startFrame: 0,
          levels: 1,
        }) as DAPStackTraceResponse;

        if (stackTrace.stackFrames.length > 0) {
          const topFrame = stackTrace.stackFrames[0];
          stopInfo.location = {
            file: topFrame.source?.path,
            line: topFrame.line,
            column: topFrame.column,
          };
        }
      } catch (error) {
        this.logger.debug('Failed to get stack trace for stop info', error);
      }
    }

    // Always try to get exception info - the reason detection might be unreliable
    // The exceptionInfo request will fail gracefully if there's no exception
    if (rawEvent.threadId !== undefined) {
      try {
        const exceptionInfo = await session.customRequest('exceptionInfo', {
          threadId: rawEvent.threadId,
        });

        // If we got exception info, there IS an exception
        if (exceptionInfo && (exceptionInfo.exceptionId || exceptionInfo.description)) {
          // Update reason to exception since we confirmed there is one
          stopInfo.reason = 'exception';
          stopInfo.exception = {
            type: exceptionInfo.exceptionId ||
                  exceptionInfo.details?.typeName ||
                  rawEvent.description ||
                  'Unknown',
            message: exceptionInfo.description ||
                     exceptionInfo.details?.message ||
                     rawEvent.text ||
                     '',
            stackTrace: exceptionInfo.details?.stackTrace,
          };
        }
      } catch (error) {
        // No exception or request not supported - this is expected for non-exception stops
        this.logger.debug('No exception info available (expected for non-exception stops)', error);

        // If raw event indicated exception, try to use its description/text
        if (rawEvent.reason === 'exception' && (rawEvent.description || rawEvent.text)) {
          stopInfo.exception = {
            type: rawEvent.description || 'Exception',
            message: rawEvent.text || '',
          };
        }
      }
    }

    return stopInfo;
  }

  /**
   * Map DAP stop reason to our StopInfo reason type
   */
  private mapStopReason(reason: string): StopInfo['reason'] {
    switch (reason) {
      case 'entry':
        return 'entry';
      case 'breakpoint':
        return 'breakpoint';
      case 'exception':
        return 'exception';
      case 'step':
        return 'step';
      case 'pause':
        return 'pause';
      default:
        return 'unknown';
    }
  }

  // ==================== Session Management ====================

  /**
   * Start a new debug session for a Python script
   */
  async startSession(options: LaunchOptions): Promise<StartSessionResult> {
    this.logger.info('Starting debug session', { script: options.program });

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    const config: vscode.DebugConfiguration = {
      type: 'debugpy',
      request: 'launch',
      name: options.name || `Debug: ${path.basename(options.program)}`,
      program: options.program,
      args: options.args || [],
      cwd: options.cwd || (workspaceFolder?.uri.fsPath) || path.dirname(options.program),
      env: options.env || {},
      stopOnEntry: options.stopOnEntry ?? true,
      justMyCode: options.justMyCode ?? true,
      console: 'integratedTerminal',
    };

    if (options.pythonPath) {
      config.python = options.pythonPath;
    }

    const started = await vscode.debug.startDebugging(workspaceFolder, config);

    if (!started) {
      throw new Error('Failed to start debug session');
    }

    // Wait for session to be available
    await this.waitForSession();

    const session = vscode.debug.activeDebugSession;
    if (!session) {
      throw new Error('Debug session started but not found');
    }

    const sessionInfo = this.getSessionInfo(session);

    // Wait for initial stop event (stopOnEntry, exception, breakpoint, or termination)
    const initialStopResult = await this.waitForInitialStop(session);

    const result: StartSessionResult = {
      ...sessionInfo,
    };

    if (initialStopResult.terminated) {
      result.terminated = true;
      result.terminationReason = initialStopResult.terminationReason;
    } else if (initialStopResult.stopEvent) {
      result.initialStop = await this.buildStopInfo(session, initialStopResult.stopEvent);
    }

    return result;
  }

  /**
   * Attach to a running debugpy process
   */
  async attach(options: AttachOptions): Promise<SessionInfo> {
    this.logger.info('Attaching to debug session', { host: options.host, port: options.port });

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    const config: vscode.DebugConfiguration = {
      type: 'debugpy',
      request: 'attach',
      name: options.name || `Attach: ${options.host || 'localhost'}:${options.port}`,
      connect: {
        host: options.host || 'localhost',
        port: options.port,
      },
      pathMappings: options.pathMappings || [],
    };

    const started = await vscode.debug.startDebugging(workspaceFolder, config);

    if (!started) {
      throw new Error('Failed to attach to debug session');
    }

    await this.waitForSession();

    const session = vscode.debug.activeDebugSession;
    if (!session) {
      throw new Error('Attached but session not found');
    }

    return this.getSessionInfo(session);
  }

  /**
   * Stop a debug session
   */
  async stopSession(sessionId: string): Promise<void> {
    this.logger.info('Stopping debug session', { sessionId });

    const session = this.findSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await vscode.debug.stopDebugging(session);
  }

  /**
   * List all active debug sessions
   */
  listSessions(): SessionInfo[] {
    // VS Code doesn't have a direct API for listing all sessions,
    // but we can get the active session and any child sessions
    const sessions: SessionInfo[] = [];

    // Get active session
    const activeSession = vscode.debug.activeDebugSession;
    if (activeSession) {
      sessions.push(this.getSessionInfo(activeSession));
    }

    this.logger.debug('Listing sessions', { count: sessions.length });
    return sessions;
  }

  // ==================== Breakpoints ====================

  /**
   * Set a breakpoint
   */
  async setBreakpoint(
    file: string,
    line: number,
    condition?: string,
    hitCondition?: string,
    logMessage?: string
  ): Promise<BreakpointInfo> {
    this.logger.info('Setting breakpoint', { file, line, condition });

    const uri = vscode.Uri.file(file);
    const location = new vscode.Location(uri, new vscode.Position(line - 1, 0));

    const breakpoint = new vscode.SourceBreakpoint(
      location,
      true,
      condition,
      hitCondition,
      logMessage
    );

    vscode.debug.addBreakpoints([breakpoint]);

    // Generate internal ID and store mapping
    const id = `bp_${++this.breakpointCounter}`;
    this.breakpointMappings.set(id, {
      id,
      vscodeBreakpoint: breakpoint,
      file,
      line,
    });

    return {
      id,
      verified: true, // VS Code will verify asynchronously
      file,
      line,
      condition,
      hitCondition,
      logMessage,
      enabled: true,
    };
  }

  /**
   * Set a breakpoint by matching exact line text.
   * This is more reliable for LLMs that don't have accurate line numbers.
   */
  async setBreakpointByText(
    file: string,
    lineText: string,
    occurrence?: number,
    condition?: string,
    hitCondition?: string,
    logMessage?: string
  ): Promise<BreakpointInfo> {
    this.logger.info('Setting breakpoint by text', { file, lineText, occurrence, condition });

    // Read the file content
    let fileContent: string;
    try {
      fileContent = fs.readFileSync(file, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file: ${file}`);
    }

    const lines = fileContent.split('\n');
    const normalizedSearchText = lineText.trim();
    
    // Find all matching lines
    const matchingLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === normalizedSearchText) {
        matchingLines.push(i + 1); // 1-indexed line numbers
      }
    }

    if (matchingLines.length === 0) {
      throw new Error(
        `No matching line found for text: "${lineText}". ` +
        `Make sure the text matches exactly (whitespace is trimmed).`
      );
    }

    if (matchingLines.length > 1) {
      // If occurrence is specified, use it
      if (occurrence !== undefined) {
        if (occurrence < 1 || occurrence > matchingLines.length) {
          throw new Error(
            `Invalid occurrence: ${occurrence}. ` +
            `Found ${matchingLines.length} occurrences, so occurrence must be between 1 and ${matchingLines.length}.`
          );
        }
        const line = matchingLines[occurrence - 1];
        return this.setBreakpoint(file, line, condition, hitCondition, logMessage);
      }

      // Build context for each match
      const matchContexts = matchingLines.map((lineNum, idx) => {
        const lineIndex = lineNum - 1; // 0-indexed
        const above = lineIndex > 0 ? lines[lineIndex - 1].trim() : '(start of file)';
        const current = lines[lineIndex].trim();
        const below = lineIndex < lines.length - 1 ? lines[lineIndex + 1].trim() : '(end of file)';
        return `  Occurrence ${idx + 1} at line ${lineNum}:\n    ${above}\n  > ${current}\n    ${below}`;
      }).join('\n\n');

      throw new Error(
        `Multiple matches found for text: "${lineText}". ` +
        `Found ${matchingLines.length} occurrences. ` +
        `Use the 'occurrence' parameter (1-${matchingLines.length}) to select one:\n\n${matchContexts}`
      );
    }

    const line = matchingLines[0];
    
    // Use the existing setBreakpoint method
    return this.setBreakpoint(file, line, condition, hitCondition, logMessage);
  }

  /**
   * Remove a breakpoint
   */
  async removeBreakpoint(breakpointId: string): Promise<void> {
    this.logger.info('Removing breakpoint', { breakpointId });

    const mapping = this.breakpointMappings.get(breakpointId);
    if (!mapping) {
      throw new Error(`Breakpoint not found: ${breakpointId}`);
    }

    vscode.debug.removeBreakpoints([mapping.vscodeBreakpoint]);
    this.breakpointMappings.delete(breakpointId);
  }

  /**
   * List all breakpoints
   */
  listBreakpoints(): BreakpointInfo[] {
    const breakpoints: BreakpointInfo[] = [];

    for (const bp of vscode.debug.breakpoints) {
      if (bp instanceof vscode.SourceBreakpoint) {
        // Find our mapping for this breakpoint
        let id: string | undefined;
        for (const [mappingId, mapping] of this.breakpointMappings) {
          if (mapping.vscodeBreakpoint === bp) {
            id = mappingId;
            break;
          }
        }

        // If no mapping exists, create one
        if (!id) {
          id = `bp_${++this.breakpointCounter}`;
          this.breakpointMappings.set(id, {
            id,
            vscodeBreakpoint: bp,
            file: bp.location.uri.fsPath,
            line: bp.location.range.start.line + 1,
          });
        }

        breakpoints.push({
          id,
          verified: true,
          file: bp.location.uri.fsPath,
          line: bp.location.range.start.line + 1,
          column: bp.location.range.start.character + 1,
          condition: bp.condition,
          hitCondition: bp.hitCondition,
          logMessage: bp.logMessage,
          enabled: bp.enabled,
        });
      }
    }

    this.logger.debug('Listing breakpoints', { count: breakpoints.length });
    return breakpoints;
  }

  // ==================== Execution Control ====================

  /**
   * Continue execution
   */
  async continue(sessionId: string, threadId?: number): Promise<void> {
    this.logger.info('Continuing execution', { sessionId, threadId });

    const session = this.findSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const tid = threadId ?? await this.getDefaultThreadId(session);
    await session.customRequest('continue', { threadId: tid });
  }

  /**
   * Pause execution
   */
  async pause(sessionId: string, threadId?: number): Promise<void> {
    this.logger.info('Pausing execution', { sessionId, threadId });

    const session = this.findSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const tid = threadId ?? await this.getDefaultThreadId(session);
    await session.customRequest('pause', { threadId: tid });
  }

  /**
   * Step into
   */
  async stepInto(sessionId: string, threadId?: number): Promise<void> {
    this.logger.info('Step into', { sessionId, threadId });

    const session = this.findSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const tid = threadId ?? await this.getStoppedThreadId(session);
    await session.customRequest('stepIn', { threadId: tid });
  }

  /**
   * Step over
   */
  async stepOver(sessionId: string, threadId?: number): Promise<void> {
    this.logger.info('Step over', { sessionId, threadId });

    const session = this.findSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const tid = threadId ?? await this.getStoppedThreadId(session);
    await session.customRequest('next', { threadId: tid });
  }

  /**
   * Step out
   */
  async stepOut(sessionId: string, threadId?: number): Promise<void> {
    this.logger.info('Step out', { sessionId, threadId });

    const session = this.findSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const tid = threadId ?? await this.getStoppedThreadId(session);
    await session.customRequest('stepOut', { threadId: tid });
  }

  // ==================== Inspection ====================

  /**
   * Get all threads
   */
  async getThreads(sessionId: string): Promise<ThreadInfo[]> {
    this.logger.debug('Getting threads', { sessionId });

    const session = this.findSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const response = await session.customRequest('threads') as DAPThreadsResponse;
    const stoppedThreads = this.sessionStoppedThreads.get(sessionId) || new Map();

    return response.threads.map((thread) => ({
      id: thread.id,
      name: thread.name,
      stopped: stoppedThreads.has(thread.id),
      reason: stoppedThreads.get(thread.id),
    }));
  }

  /**
   * Get stack trace
   */
  async getStackTrace(
    sessionId: string,
    threadId?: number,
    startFrame?: number,
    levels?: number
  ): Promise<StackFrameInfo[]> {
    this.logger.debug('Getting stack trace', { sessionId, threadId });

    const session = this.findSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const tid = threadId ?? await this.getStoppedThreadId(session);

    const response = await session.customRequest('stackTrace', {
      threadId: tid,
      startFrame: startFrame || 0,
      levels: levels || 20,
    }) as DAPStackTraceResponse;

    return response.stackFrames.map((frame) => ({
      id: frame.id,
      name: frame.name,
      source: frame.source,
      line: frame.line,
      column: frame.column,
      endLine: frame.endLine,
      endColumn: frame.endColumn,
      moduleId: frame.moduleId,
      presentationHint: frame.presentationHint,
    }));
  }

  /**
   * Get variable scopes for a stack frame
   */
  async getScopes(sessionId: string, frameId: number): Promise<ScopeInfo[]> {
    this.logger.debug('Getting scopes', { sessionId, frameId });

    const session = this.findSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const response = await session.customRequest('scopes', {
      frameId,
    }) as DAPScopesResponse;

    return response.scopes.map((scope) => ({
      name: scope.name,
      variablesReference: scope.variablesReference,
      namedVariables: scope.namedVariables,
      indexedVariables: scope.indexedVariables,
      expensive: scope.expensive,
      source: scope.source,
      line: scope.line,
      column: scope.column,
      endLine: scope.endLine,
      endColumn: scope.endColumn,
    }));
  }

  /**
   * Get variables in a scope
   */
  async getVariables(
    sessionId: string,
    variablesReference: number,
    filter?: 'indexed' | 'named',
    start?: number,
    count?: number
  ): Promise<VariableInfo[]> {
    this.logger.debug('Getting variables', { sessionId, variablesReference });

    const session = this.findSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const args: Record<string, unknown> = { variablesReference };
    if (filter) args.filter = filter;
    if (start !== undefined) args.start = start;
    if (count !== undefined) args.count = count;

    const response = await session.customRequest('variables', args) as DAPVariablesResponse;

    return response.variables.map((variable) => ({
      name: variable.name,
      value: truncateValue(variable.value),
      type: variable.type,
      variablesReference: variable.variablesReference,
      namedVariables: variable.namedVariables,
      indexedVariables: variable.indexedVariables,
      evaluateName: variable.evaluateName,
      memoryReference: variable.memoryReference,
      presentationHint: variable.presentationHint,
    }));
  }

  /**
   * Evaluate an expression
   */
  async evaluate(
    sessionId: string,
    expression: string,
    frameId?: number,
    context?: 'watch' | 'repl' | 'hover' | 'clipboard'
  ): Promise<EvalResult> {
    this.logger.debug('Evaluating expression', { sessionId, expression, frameId });

    const session = this.findSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const args: Record<string, unknown> = {
      expression,
      context: context || 'repl',
    };
    if (frameId !== undefined) {
      args.frameId = frameId;
    }

    const response = await session.customRequest('evaluate', args) as DAPEvaluateResponse;

    return {
      result: truncateValue(response.result),
      type: response.type,
      variablesReference: response.variablesReference,
      namedVariables: response.namedVariables,
      indexedVariables: response.indexedVariables,
      memoryReference: response.memoryReference,
    };
  }

  /**
   * Set a variable value
   */
  async setVariable(
    sessionId: string,
    variablesReference: number,
    name: string,
    value: string
  ): Promise<VariableInfo> {
    this.logger.debug('Setting variable', { sessionId, name, value });

    const session = this.findSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const response = await session.customRequest('setVariable', {
      variablesReference,
      name,
      value,
    });

    return {
      name,
      value: response.value,
      type: response.type,
      variablesReference: response.variablesReference || 0,
      namedVariables: response.namedVariables,
      indexedVariables: response.indexedVariables,
    };
  }

  // ==================== Helper Methods ====================

  /**
   * Find a session by ID
   */
  private findSession(sessionId: string): vscode.DebugSession | undefined {
    const activeSession = vscode.debug.activeDebugSession;
    if (activeSession?.id === sessionId) {
      return activeSession;
    }
    return undefined;
  }

  /**
   * Wait for a debug session to start
   */
  private async waitForSession(timeoutMs: number = 5000): Promise<void> {
    const startTime = Date.now();
    while (!vscode.debug.activeDebugSession) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Timeout waiting for debug session to start');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Get the default thread ID (first thread)
   */
  private async getDefaultThreadId(session: vscode.DebugSession): Promise<number> {
    const response = await session.customRequest('threads') as DAPThreadsResponse;
    if (response.threads.length === 0) {
      throw new Error('No threads available');
    }
    return response.threads[0].id;
  }

  /**
   * Get a stopped thread ID for stepping operations
   */
  private async getStoppedThreadId(session: vscode.DebugSession): Promise<number> {
    const stoppedThreads = this.sessionStoppedThreads.get(session.id);
    if (stoppedThreads && stoppedThreads.size > 0) {
      return stoppedThreads.keys().next().value as number;
    }
    // Fall back to first thread
    return this.getDefaultThreadId(session);
  }

  /**
   * Get session info
   */
  private getSessionInfo(session: vscode.DebugSession): SessionInfo {
    return {
      id: session.id,
      name: session.name,
      type: session.type,
      workspaceFolder: session.workspaceFolder?.uri.fsPath,
      configuration: {
        program: session.configuration.program,
        args: session.configuration.args,
        cwd: session.configuration.cwd,
        env: session.configuration.env,
      },
    };
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.logger.dispose();
  }
}
