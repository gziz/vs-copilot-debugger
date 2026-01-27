/**
 * Utilities for handling multi-line Python expression evaluation.
 *
 * Python's debugger uses exec() for multi-statement code (returns None)
 * vs eval() for single expressions (returns value). These utilities
 * transform multi-line code to capture the last expression's result.
 */

/**
 * Wrap multi-line Python code to capture the last expression's result.
 *
 * Transforms multi-line code to:
 * 1. Execute all statements
 * 2. Capture the last expression's value in __eval_result__
 * 3. Return __eval_result__
 *
 * Only transforms if:
 * - Code has multiple lines
 * - Last non-empty, non-comment line is at base indentation (not inside a block)
 * - Last line looks like an expression (not an assignment or statement)
 */
export function wrapMultilineExpression(expression: string): string {
  const trimmed = expression.trim();

  // Single line - no transformation needed
  if (!trimmed.includes('\n')) {
    return expression;
  }

  const lines = trimmed.split('\n');

  // Find first non-empty, non-comment line to determine base indentation
  let baseIndent = 0;
  for (const line of lines) {
    const content = line.trimStart();
    if (content && !content.startsWith('#')) {
      baseIndent = line.length - content.length;
      break;
    }
  }

  // Find last non-empty, non-comment line
  let lastExprLineIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const content = lines[i].trim();
    if (content && !content.startsWith('#')) {
      lastExprLineIndex = i;
      break;
    }
  }

  if (lastExprLineIndex === -1) {
    return expression; // All empty or comments
  }

  const lastLine = lines[lastExprLineIndex];
  const lastLineTrimmed = lastLine.trim();
  const lastLineIndent = lastLine.length - lastLine.trimStart().length;

  // Only transform if last line is at base indentation level
  // (not inside a block like if/for/while/def/etc.)
  if (lastLineIndent > baseIndent) {
    return expression;
  }

  // Check if last line looks like an expression
  if (!looksLikeExpression(lastLineTrimmed)) {
    return expression;
  }

  // Build wrapped code:
  // - All lines before the last expression
  // - Last expression assigned to __eval_result__
  const beforeLastLines = lines.slice(0, lastExprLineIndex);
  const indentStr = ' '.repeat(lastLineIndent);

  const wrappedCode = [
    ...beforeLastLines,
    `${indentStr}__eval_result__ = (${lastLineTrimmed})`
  ].join('\n');

  // Escape for Python triple-quoted string
  const escaped = wrappedCode
    .replace(/\\/g, '\\\\')
    .replace(/'''/g, "\\'\\'\\'");

  return `exec('''${escaped}''')\n__eval_result__`;
}

/**
 * Check if a line of Python code looks like an expression (vs a statement).
 *
 * This is a heuristic that works well for typical debugging scenarios.
 */
export function looksLikeExpression(line: string): boolean {
  // Statement keywords that indicate this is definitely not an expression
  const statementKeywords = new Set([
    'if', 'else', 'elif', 'for', 'while', 'def', 'class', 'import', 'from',
    'try', 'except', 'finally', 'with', 'raise', 'return', 'yield', 'assert',
    'pass', 'break', 'continue', 'del', 'global', 'nonlocal', 'async',
    'match', 'case',  // Python 3.10+
  ]);

  // Check if starts with a statement keyword
  const match = line.match(/^(\w+)/);
  if (match && statementKeywords.has(match[1])) {
    return false;
  }

  // Remove string literals to avoid false positives from = inside strings
  let codeWithoutStrings = line;
  codeWithoutStrings = codeWithoutStrings.replace(/"""[\s\S]*?"""/g, '""');
  codeWithoutStrings = codeWithoutStrings.replace(/'''[\s\S]*?'''/g, "''");
  codeWithoutStrings = codeWithoutStrings.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  codeWithoutStrings = codeWithoutStrings.replace(/'(?:[^'\\]|\\.)*'/g, "''");

  // Check for assignment operators (but not comparison operators)
  // Assignment: =, +=, -=, *=, /=, //=, %=, **=, &=, |=, ^=, >>=, <<=
  // Comparison (OK): ==, !=, <=, >=

  // Simple assignment: = not preceded by =, !, <, >, : and not followed by =
  if (/(?<![=!<>:])=(?!=)/.test(codeWithoutStrings)) {
    return false;
  }

  // Augmented assignment: +=, -=, *=, /=, %=, &=, |=, ^=
  if (/[+\-*/%&|^]=/.test(codeWithoutStrings)) {
    return false;
  }

  // Special augmented assignment: //=, **=, >>=, <<=
  if (/(?:\/\/|\*\*|>>|<<)=/.test(codeWithoutStrings)) {
    return false;
  }

  return true;
}
