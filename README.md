# OBDb tooling

A Visual Studio Code extension for OBDb signal editing tooling.

## Features

- **Hover Information**: Hover over signal IDs in JSON files to see which model years support the specific signal

## Requirements

- VS Code version 1.99.0 or higher
- A project structure that includes model year test cases in `tests/test_cases/[year]` directories

## Installation

### From VSIX File

1. Download the latest `.vsix` file from the [releases page](https://github.com/OBDb/vscode-obdb/releases)
2. In VS Code, go to Extensions view (Ctrl+Shift+X)
3. Click "..." at the top of the Extensions view
4. Select "Install from VSIX..." and choose the downloaded file

### In devcontainers

Add to your devcontainer.json:
```json
"customizations": {
  "vscode": {
    "extensions": [
      "https://github.com/OBDb/vscode-obdb/releases/download/v[VERSION]/signalid-hover-info-[VERSION].vsix"
    ]
  }
}
```
Replace `[VERSION]` with the actual version number.

## How It Works

The extension:
1. Detects when you hover over an ID in a JSON file within the signalsets directory
2. Scans the project structure for matching signal IDs in test cases across different model years
3. Displays a hover card showing all model years that support the specific signal ID

## Development

### Setup

```bash
# Install dependencies
npm install

# Compile the extension
npm run compile

# Watch mode during development
npm run watch
```

### CLI Tool

The project includes a command-line tool for working with signalsets outside of VS Code.

#### Building the CLI

```bash
# Compile the CLI
npm run compile:cli
```

Or use the VSCode task:
1. Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Tasks: Run Task"
3. Select "compile-cli"

#### Running the CLI

After building, you can run the CLI in several ways:

**Using node directly:**
```bash
node dist/cli.js optimize <workspace-path>
```

**Using npm link (for development):**
```bash
# Link the CLI globally
npm link

# Now you can use it anywhere
obdb optimize <workspace-path>
```

**Example:**
```bash
# Parse and display the root node of the signalset
obdb optimize /path/to/your/workspace
```

The CLI will look for a signalset at `<workspace-path>/signalsets/v3/default.json` and print the parsed root node to the console.

### Build & Package

```bash
# Prepare for publishing
npm run vscode:prepublish

# Package as VSIX
npm install -g @vscode/vsce
vsce package
```

### Release Process

This extension uses GitHub Actions for automated builds and releases:
1. Create and push a tag with format `v*.*.*` (e.g., `v0.1.0`)
2. The CI will automatically build, package, and create a GitHub release

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
