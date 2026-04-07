/**
 * Shared type definitions for Copilot Debug extension
 */

/**
 * Information about why the debugger stopped
 */
export interface StopInfo {
  reason: 'entry' | 'breakpoint' | 'exception' | 'step' | 'pause' | 'terminated' | 'unknown';
  threadId?: number;
  exception?: ExceptionInfo;
  location?: {
    file?: string;
    line?: number;
    column?: number;
  };
}

/**
 * Exception details when stopped on exception
 */
export interface ExceptionInfo {
  type: string;        // e.g., "ModuleNotFoundError"
  message: string;     // e.g., "No module named 'nonexistent'"
  stackTrace?: string;
}

/**
 * Extended session info returned from startSession
 */
export interface StartSessionResult extends SessionInfo {
  initialStop?: StopInfo;
  terminated?: boolean;
  terminationReason?: string;
}

/**
 * Debug session information
 */
export interface SessionInfo {
  id: string;
  name: string;
  type: string;
  workspaceFolder?: string;
  configuration: {
    program?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
  };
}

/**
 * Launch configuration options for starting a debug session
 */
export interface LaunchOptions {
  name?: string;
  program: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  stopOnEntry?: boolean;
  justMyCode?: boolean;
  pythonPath?: string;
}

/**
 * Attach configuration options
 */
export interface AttachOptions {
  name?: string;
  host?: string;
  port: number;
  pathMappings?: Array<{
    localRoot: string;
    remoteRoot: string;
  }>;
}

/**
 * Breakpoint information
 */
export interface BreakpointInfo {
  id: string;
  verified: boolean;
  file: string;
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
  enabled: boolean;
}

/**
 * Thread information
 */
export interface ThreadInfo {
  id: number;
  name: string;
  stopped: boolean;
  reason?: string;
}

/**
 * Stack frame information
 */
export interface StackFrameInfo {
  id: number;
  name: string;
  source?: {
    name?: string;
    path?: string;
  };
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  moduleId?: string | number;
  presentationHint?: 'normal' | 'label' | 'subtle';
}

/**
 * Variable scope information
 */
export interface ScopeInfo {
  name: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  expensive: boolean;
  source?: {
    name?: string;
    path?: string;
  };
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

/**
 * Variable information
 */
export interface VariableInfo {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  evaluateName?: string;
  memoryReference?: string;
  presentationHint?: {
    kind?: string;
    attributes?: string[];
    visibility?: string;
  };
}

/**
 * Evaluation result
 */
export interface EvalResult {
  result: string;
  type?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  memoryReference?: string;
}

/**
 * Result of setting a breakpoint
 */
export interface SetBreakpointResult {
  breakpoint: BreakpointInfo;
}

/**
 * Result of a debug operation
 */
export interface DebugOperationResult {
  success: boolean;
  message?: string;
}

/**
 * DAP (Debug Adapter Protocol) thread response
 */
export interface DAPThreadsResponse {
  threads: Array<{
    id: number;
    name: string;
  }>;
}

/**
 * DAP stack trace response
 */
export interface DAPStackTraceResponse {
  stackFrames: Array<{
    id: number;
    name: string;
    source?: {
      name?: string;
      path?: string;
    };
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    moduleId?: string | number;
    presentationHint?: 'normal' | 'label' | 'subtle';
  }>;
  totalFrames?: number;
}

/**
 * DAP scopes response
 */
export interface DAPScopesResponse {
  scopes: Array<{
    name: string;
    variablesReference: number;
    namedVariables?: number;
    indexedVariables?: number;
    expensive: boolean;
    source?: {
      name?: string;
      path?: string;
    };
    line?: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
  }>;
}

/**
 * DAP variables response
 */
export interface DAPVariablesResponse {
  variables: Array<{
    name: string;
    value: string;
    type?: string;
    variablesReference: number;
    namedVariables?: number;
    indexedVariables?: number;
    evaluateName?: string;
    memoryReference?: string;
    presentationHint?: {
      kind?: string;
      attributes?: string[];
      visibility?: string;
    };
  }>;
}

/**
 * DAP evaluate response
 */
export interface DAPEvaluateResponse {
  result: string;
  type?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  memoryReference?: string;
}

/**
 * Tool input schemas for MCP tools
 */
export namespace ToolInputs {
  export interface StartSession {
    script: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    stopOnEntry?: boolean;
    justMyCode?: boolean;
    pythonPath?: string;
    name?: string;
  }

  export interface StopSession {
    sessionId: string;
  }

  export interface Attach {
    host?: string;
    port: number;
    name?: string;
  }

  export interface SetBreakpoint {
    sessionId?: string;
    file: string;
    line: number;
    condition?: string;
    hitCondition?: string;
    logMessage?: string;
  }

  export interface RemoveBreakpoint {
    breakpointId: string;
  }

  export interface SessionOperation {
    sessionId: string;
    threadId?: number;
  }

  export interface GetStackTrace {
    sessionId: string;
    threadId?: number;
    startFrame?: number;
    levels?: number;
  }

  export interface GetScopes {
    sessionId: string;
    frameId: number;
  }

  export interface GetVariables {
    sessionId: string;
    variablesReference: number;
    filter?: 'indexed' | 'named';
    start?: number;
    count?: number;
  }

  export interface Evaluate {
    sessionId: string;
    expression: string;
    frameId?: number;
    context?: 'watch' | 'repl' | 'hover' | 'clipboard';
  }

  export interface SetVariable {
    sessionId: string;
    variablesReference: number;
    name: string;
    value: string;
  }
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Extension configuration
 */
export interface ExtensionConfig {
  autoStart: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  serverPort: number;
  enableLogging: boolean;
}
