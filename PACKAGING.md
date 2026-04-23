# Packaging the Extension for Local Installation

## Quick Command (One-liner)

```bash
cd /home/azureuser/localfiles/repos/claudebugger/copilot-debugger && npm install @vscode/vsce --save-dev && ./node_modules/.bin/vsce package --allow-missing-repository
```

## Step-by-Step

### 1. Install vsce (VS Code Extension Manager)

```bash
npm install @vscode/vsce --save-dev
```

### 2. Compile and Package

```bash
./node_modules/.bin/vsce package --allow-missing-repository
```

This will:
- Run the `vscode:prepublish` script (which compiles TypeScript)
- Create a `.vsix` file (e.g., `copilot-debugger-0.1.0.vsix`)

### 3. Install the Extension

**Option A - VS Code Command Palette:**
1. Press `Ctrl+Shift+P`
2. Type "Install from VSIX"
3. Select the `.vsix` file

**Option B - Terminal:**
```bash
code --install-extension copilot-debugger-0.1.0.vsix
```

## Notes

- The `--allow-missing-repository` flag skips the repository validation
- If you see a LICENSE warning, type `y` to continue
- The version number in the filename comes from `package.json`
