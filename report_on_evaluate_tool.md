# Debug Evaluation Tool Investigation Report

## Overview

During a debugging session, inconsistent behavior was observed when using the `debug_evaluate` tool to run expressions in a VS Code debugpy session. This report documents the findings for further investigation.

## Environment

- **Debug Session Type**: debugpy
- **Session Name**: "Debug Test: Full DG"
- **Workspace**: MachineLearning project (Python 3.11+)
- **VS Code Remote**: AML Compute instance

## Observed Behavior

### Pattern 1: Multi-line Code with Assignments — Returns Empty

**Input:**
```python
depth0 = final_links_df[final_links_df['Depth'] == 0][['ParentIncidentId', 'ChildIncidentId']]
depth1 = final_links_df[final_links_df['Depth'] == 1][['ParentIncidentId', 'ChildIncidentId']]
len(depth0), len(depth1)
```

**Result:**
```json
{
  "result": "",
  "variablesReference": 0
}
```

### Pattern 2: Single Expression — Returns Value

**Input:**
```python
(len(depth0), len(depth1))
```

**Result:**
```json
{
  "result": "(2225, 1625)",
  "type": "tuple",
  "variablesReference": 110
}
```

### Pattern 3: Multi-line with Print — Returns Empty (but executes)

**Input:**
```python
depth0_test = final_links_df[final_links_df['Depth'] == 0]
print(f"depth0: {len(depth0_test)}")
```

**Result:**
```json
{
  "result": "",
  "variablesReference": 0
}
```

**Note**: The print output likely goes to the Debug Console terminal, not captured in the tool response.

### Pattern 4: Multi-line For Loop with Final Expression — Returns Empty

**Input:**
```python
valid = 0
invalid = []
for idx, row in depth1.iterrows():
    a, c = row['ParentIncidentId'], row['ChildIncidentId']
    has_intermediate = any((a, b) in edges and (b, c) in edges for b in nodes if b != a and b != c)
    if has_intermediate:
        valid += 1
    else:
        invalid.append((a, c))
(valid, len(invalid))
```

**Result:** Empty

**Follow-up single expression:**
```python
(valid, len(invalid))
```

**Result:**
```json
{
  "result": "(1625, 0)",
  "type": "tuple",
  "variablesReference": 115
}
```

**Key Insight**: The loop **did execute** and set the variables correctly, but the tool didn't return the final expression's value.

## Hypotheses to Investigate

### 1. Multi-statement vs Single-expression Handling
The tool may be using different evaluation modes:
- Single expressions: `eval()` semantics — returns the value
- Multi-statements: `exec()` semantics — returns `None`

**Test**: Check how the debug adapter protocol (DAP) `evaluate` request handles the `expression` field with newlines.

### 2. Return Value Capture Logic
The tool may only capture the result of the **first statement** in multi-line input.

**Test**: Try `x = 5; x` (semicolon-separated) vs multi-line.

### 3. Timeout or Truncation
Long-running operations may timeout, returning empty before completion.

**Test**: Time simple multi-line vs complex multi-line operations.

### 4. Stdout vs Return Value
`print()` writes to stdout, which goes to Debug Console, not the evaluate response.

**Test**: Check if there's a way to capture stdout in the evaluation result.

## Recommended Investigation Steps

1. **Inspect DAP Protocol**
   - Check the `evaluate` request/response in the Debug Adapter Protocol
   - Look for `context` parameter options (e.g., `"repl"` vs `"watch"` vs `"hover"`)

2. **Test Semicolon-Separated Statements**
   ```python
   x = 5; y = 10; x + y
   ```

3. **Test Explicit Return Wrapper**
   ```python
   (lambda: (exec('x = 5'), x)[1])()
   ```

4. **Check debugpy Source**
   - Review how debugpy handles multi-line evaluate requests
   - Look for differences in REPL mode vs watch expression mode

5. **Compare with Direct Debug Console**
   - Type the same multi-line code directly in VS Code's Debug Console
   - Compare behavior with tool-based evaluation

## Workaround (Confirmed Working)

For reliable results with the current tool:

1. **Execute assignments separately** (they will set variables even if result is empty)
2. **Query results with pure expressions** (no assignments)

```python
# Call 1: Set variables (result will be empty, but variables are set)
debug_evaluate("depth0 = final_links_df[final_links_df['Depth'] == 0]")

# Call 2: Query the result (returns value)
debug_evaluate("len(depth0)")  # Returns: 2225
```

## Session Details for Reproduction

```json
{
  "sessionId": "d3d186fa-382a-417e-a4da-67777069cdc5",
  "frameId": 14,
  "function": "generate_transitive_links",
  "file": "GenerateTransitiveLinks.py",
  "line": 146
}
```

---

*Report generated: January 26, 2026*