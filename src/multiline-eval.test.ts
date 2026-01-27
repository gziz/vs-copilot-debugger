import * as assert from 'assert';
import { wrapMultilineExpression, looksLikeExpression } from './multiline-eval';

describe('looksLikeExpression', () => {
  describe('should return true for expressions', () => {
    const expressions = [
      'x',
      'x + y',
      'len(df)',
      'df.head()',
      'x == 5',
      'x != 5',
      'x <= 5',
      'x >= 5',
      '(1, 2, 3)',
      '[x for x in range(10)]',
      'lambda x: x + 1',
      'foo(bar, baz)',
      'obj.method().chain()',
      '"hello" + "world"',
      'f"value: {x}"',
      'x if condition else y',
      'not x',
      'x and y',
      'x or y',
      'x in [1, 2, 3]',
      'isinstance(x, int)',
      '{"key": "value"}',
      '(x := 5)',  // Walrus operator - is an expression
    ];

    for (const expr of expressions) {
      it(`"${expr}"`, () => {
        assert.strictEqual(looksLikeExpression(expr), true);
      });
    }
  });

  describe('should return false for statements', () => {
    const statements = [
      'x = 5',
      'x += 1',
      'x -= 1',
      'x *= 2',
      'x /= 2',
      'x //= 2',
      'x %= 2',
      'x **= 2',
      'x &= 1',
      'x |= 1',
      'x ^= 1',
      'x >>= 1',
      'x <<= 1',
      'if x:',
      'else:',
      'elif x:',
      'for i in range(10):',
      'while True:',
      'def foo():',
      'class Foo:',
      'import os',
      'from os import path',
      'try:',
      'except Exception:',
      'finally:',
      'with open("f") as f:',
      'raise ValueError()',
      'return x',
      'yield x',
      'assert x == 5',
      'pass',
      'break',
      'continue',
      'del x',
      'global x',
      'nonlocal x',
      'async def foo():',
      'match x:',
      'case 1:',
    ];

    for (const stmt of statements) {
      it(`"${stmt}"`, () => {
        assert.strictEqual(looksLikeExpression(stmt), false);
      });
    }
  });

  describe('should handle strings containing =', () => {
    it('string with = inside double quotes', () => {
      assert.strictEqual(looksLikeExpression('print("x = 5")'), true);
    });

    it('string with = inside single quotes', () => {
      assert.strictEqual(looksLikeExpression("print('x = 5')"), true);
    });

    it('f-string with = inside', () => {
      assert.strictEqual(looksLikeExpression('f"result={x}"'), true);
    });

    it('assignment with string containing =', () => {
      assert.strictEqual(looksLikeExpression('x = "a = b"'), false);
    });
  });
});

describe('wrapMultilineExpression', () => {
  describe('should not transform single-line expressions', () => {
    it('simple variable', () => {
      const input = 'x';
      assert.strictEqual(wrapMultilineExpression(input), input);
    });

    it('function call', () => {
      const input = 'len(df)';
      assert.strictEqual(wrapMultilineExpression(input), input);
    });

    it('assignment', () => {
      const input = 'x = 5';
      assert.strictEqual(wrapMultilineExpression(input), input);
    });
  });

  describe('should transform multi-line with expression at end', () => {
    it('assignment followed by expression', () => {
      const input = `x = 5
x`;
      const result = wrapMultilineExpression(input);
      assert.ok(result.includes('exec('));
      assert.ok(result.includes('__eval_result__'));
      assert.ok(result.includes('x = 5'));
      assert.ok(result.includes('__eval_result__ = (x)'));
    });

    it('multiple assignments followed by expression', () => {
      const input = `depth0 = df[df['Depth'] == 0]
depth1 = df[df['Depth'] == 1]
len(depth0), len(depth1)`;
      const result = wrapMultilineExpression(input);
      assert.ok(result.includes('exec('));
      assert.ok(result.includes('__eval_result__ = (len(depth0), len(depth1))'));
    });

    it('for loop followed by expression', () => {
      const input = `total = 0
for i in range(10):
    total += i
total`;
      const result = wrapMultilineExpression(input);
      assert.ok(result.includes('exec('));
      assert.ok(result.includes('__eval_result__ = (total)'));
    });
  });

  describe('should not transform when last line is a statement', () => {
    it('ends with assignment', () => {
      const input = `x = 5
y = 10`;
      assert.strictEqual(wrapMultilineExpression(input), input);
    });

    it('ends with for loop', () => {
      const input = `total = 0
for i in range(10):
    total += i`;
      assert.strictEqual(wrapMultilineExpression(input), input);
    });
  });

  describe('should not transform when last expression is indented', () => {
    it('expression inside if block', () => {
      const input = `if True:
    x`;
      assert.strictEqual(wrapMultilineExpression(input), input);
    });

    it('expression inside for loop', () => {
      const input = `for i in range(10):
    i`;
      assert.strictEqual(wrapMultilineExpression(input), input);
    });
  });

  describe('should handle comments and empty lines', () => {
    it('trailing comment after expression', () => {
      const input = `x = 5
x  # result`;
      const result = wrapMultilineExpression(input);
      assert.ok(result.includes('exec('));
      assert.ok(result.includes('__eval_result__ = (x  # result)'));
    });

    it('trailing empty lines', () => {
      const input = `x = 5
x

`;
      const result = wrapMultilineExpression(input);
      assert.ok(result.includes('exec('));
      assert.ok(result.includes('__eval_result__ = (x)'));
    });

    it('comment-only last lines', () => {
      const input = `x = 5
x
# this is a comment`;
      const result = wrapMultilineExpression(input);
      assert.ok(result.includes('exec('));
      assert.ok(result.includes('__eval_result__ = (x)'));
    });
  });

  describe('should properly escape special characters', () => {
    it('backslashes in code', () => {
      const input = `path = "C:\\\\Users"
path`;
      const result = wrapMultilineExpression(input);
      assert.ok(result.includes('exec('));
      // Backslashes should be escaped
      assert.ok(result.includes('\\\\'));
    });

    it('single-quote triple quotes in code', () => {
      const input = `x = '''test'''
x`;
      const result = wrapMultilineExpression(input);
      assert.ok(result.includes('exec('));
      // Single-quote triple quotes should be escaped when wrapper uses '''
      assert.ok(result.includes("\\'\\'\\'"));
    });

    it('double-quote triple quotes in code (no escaping needed)', () => {
      const input = `x = """test"""
x`;
      const result = wrapMultilineExpression(input);
      assert.ok(result.includes('exec('));
      // Double-quote triple quotes don't need escaping inside '''
      assert.ok(result.includes('"""test"""'));
    });
  });

  describe('real-world scenarios from report', () => {
    it('Pattern 1: Multi-line code with assignments', () => {
      const input = `depth0 = final_links_df[final_links_df['Depth'] == 0][['ParentIncidentId', 'ChildIncidentId']]
depth1 = final_links_df[final_links_df['Depth'] == 1][['ParentIncidentId', 'ChildIncidentId']]
len(depth0), len(depth1)`;
      const result = wrapMultilineExpression(input);
      assert.ok(result.includes('exec('));
      assert.ok(result.includes('__eval_result__ = (len(depth0), len(depth1))'));
      assert.ok(result.endsWith('__eval_result__'));
    });

    it('Pattern 4: Multi-line for loop with final expression', () => {
      const input = `valid = 0
invalid = []
for idx, row in depth1.iterrows():
    a, c = row['ParentIncidentId'], row['ChildIncidentId']
    has_intermediate = any((a, b) in edges and (b, c) in edges for b in nodes if b != a and b != c)
    if has_intermediate:
        valid += 1
    else:
        invalid.append((a, c))
(valid, len(invalid))`;
      const result = wrapMultilineExpression(input);
      assert.ok(result.includes('exec('));
      assert.ok(result.includes('__eval_result__ = ((valid, len(invalid)))'));
      assert.ok(result.endsWith('__eval_result__'));
    });
  });
});
