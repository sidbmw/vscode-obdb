import * as vscode from 'vscode';
import { isPositionInCommand } from '../utils/commandParser';
import { generateBitMappingVisualization } from '../visualization/bitMapping';
import { getCachedImage, cacheImage } from '../utils/cache';

// Track webview panel and state
let visualizationPanel: vscode.WebviewPanel | undefined;
let lastInteractionType: 'mouse' | 'cursor' = 'cursor';
let lastMousePosition: vscode.Position | undefined;
let currentCommand: any | undefined;

/**
 * Initialize the bitmap visualization provider
 * Shows bitmap visualizations when editing commands
 */
export function createVisualizationProvider(): vscode.Disposable {
  // Set up event handlers
  const disposables: vscode.Disposable[] = [];

  // Listen for text document changes
  disposables.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      updateVisualization(event.document);
    })
  );

  // Listen for cursor movement
  disposables.push(
    vscode.window.onDidChangeTextEditorSelection(event => {
      if (event.textEditor.document.languageId === 'json') {
        lastInteractionType = 'cursor';
        updateVisualizationFromCursor(event.textEditor);
      }
    })
  );

  // Track mouse movement using editor visible range changes as a proxy
  disposables.push(
    vscode.window.onDidChangeTextEditorVisibleRanges(event => {
      if (event.textEditor.document.languageId === 'json') {
        // This is a proxy for mouse movement - we'll need to use the last known position
        if (lastMousePosition) {
          lastInteractionType = 'mouse';
          updateVisualizationFromPosition(event.textEditor, lastMousePosition);
        }
      }
    })
  );

  // Add mouse position tracking through hover provider
  disposables.push(
    vscode.languages.registerHoverProvider('json', {
      provideHover: (document, position) => {
        // Store the mouse position whenever a hover is triggered
        lastMousePosition = position;
        lastInteractionType = 'mouse';

        // Trigger visualization update
        const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
        if (editor) {
          updateVisualizationFromPosition(editor, position);
        }

        // Return undefined to allow other hover providers to work
        return undefined;
      }
    })
  );

  // Listen for editor activation
  disposables.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && editor.document.languageId === 'json') {
        // Use cursor position when switching editors
        lastInteractionType = 'cursor';
        updateVisualizationFromCursor(editor);
      } else if (editor) {
        // Hide panel when switching to non-JSON files
        if (visualizationPanel) {
          // Don't dispose the panel, just hide it by moving it to a background column
          visualizationPanel.reveal(vscode.ViewColumn.Beside, false); // Don't focus it
        }
      }
    })
  );

  // Create our webview panel if needed
  disposables.push(
    vscode.commands.registerCommand('obdb.showBitmapVisualization', () => {
      createOrShowVisualizationPanel();

      // If we have a current command, update the visualization
      if (currentCommand) {
        updateVisualizationPanel(currentCommand);
      }
    })
  );

  // Clean up function that disposes all event handlers
  return {
    dispose: () => {
      disposables.forEach(d => d.dispose());
      if (visualizationPanel) {
        visualizationPanel.dispose();
        visualizationPanel = undefined;
      }
    }
  };
}

/**
 * Create or show the visualization panel
 */
function createOrShowVisualizationPanel() {
  // If we already have a panel, show it
  if (visualizationPanel) {
    visualizationPanel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  // Otherwise, create a new panel
  visualizationPanel = vscode.window.createWebviewPanel(
    'bitmapVisualization',
    'Bitmap Visualization',
    {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true
    },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Handle panel disposal
  visualizationPanel.onDidDispose(
    () => {
      visualizationPanel = undefined;
    },
    null,
    []
  );
}

/**
 * Update visualization based on changed document
 */
async function updateVisualization(document: vscode.TextDocument): Promise<void> {
  if (document.languageId !== 'json') return;

  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== document) return;

  // Use the last interaction type to determine which position to use
  if (lastInteractionType === 'mouse' && lastMousePosition) {
    updateVisualizationFromPosition(editor, lastMousePosition);
  } else {
    updateVisualizationFromCursor(editor);
  }
}

/**
 * Update visualization based on cursor position
 */
async function updateVisualizationFromCursor(editor: vscode.TextEditor): Promise<void> {
  if (!editor || editor.document.languageId !== 'json') return;

  // Get current cursor position
  const position = editor.selection.active;
  updateVisualizationFromPosition(editor, position);
}

/**
 * Update visualization based on a given position
 */
async function updateVisualizationFromPosition(editor: vscode.TextEditor, position: vscode.Position): Promise<void> {
  if (!editor || editor.document.languageId !== 'json') return;

  // Check if we're in a command
  const commandCheck = isPositionInCommand(editor.document, position);
  if (!commandCheck.isCommand || !commandCheck.commandObject) {
    currentCommand = undefined;
    return;
  }

  // We're in a command definition, store the command
  const command = commandCheck.commandObject;
  currentCommand = command;

  // If panel exists, update it - use isVisible() check instead of visible property
  if (visualizationPanel) {
    // Only update if the panel is visible to avoid unnecessary processing
    updateVisualizationPanel(command);
  }
}

/**
 * Update the visualization panel with command data
 */
async function updateVisualizationPanel(command: any) {
  if (!visualizationPanel) {
    createOrShowVisualizationPanel();
  }

  // Check for cached image first
  let imageData = getCachedImage(command);

  if (!imageData) {
    try {
      // Generate image
      imageData = generateBitMappingVisualization(command);

      // Cache the image for future use if valid
      if (imageData) {
        cacheImage(command, imageData);
      }
    } catch (error) {
      console.error('Error generating bit mapping visualization:', error);
      return;
    }
  }

  if (!imageData) return;

  // Get command details for display
  const commandName = command.name || 'Command';
  const commandId = command.id || '';
  const commandHeader = command.hdr || '';
  const commandDisplay = typeof command.cmd === 'object'
    ? Object.entries(command.cmd).map(([k, v]) => `${k}: ${v}`).join(', ')
    : command.cmd?.toString() || '';

  // Update the webview content
  visualizationPanel!.webview.html = getWebviewContent(
    imageData,
    commandName,
    commandId,
    commandHeader,
    commandDisplay,
    command.description || ''
  );
}

/**
 * Generate webview HTML content
 */
function getWebviewContent(
  imageData: string,
  commandName: string,
  commandId: string,
  commandHeader: string,
  commandDisplay: string,
  description: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bitmap Visualization</title>
  <style>
    body {
      padding: 10px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      background-color: var(--vscode-editor-background);
    }
    .header {
      margin-bottom: 15px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    h2 {
      margin-top: 0;
      margin-bottom: 5px;
      font-size: 1.2em;
      font-weight: 600;
      color: var(--vscode-editor-foreground);
    }
    .details {
      margin-bottom: 15px;
      font-size: 0.9em;
    }
    .detail-label {
      font-weight: bold;
    }
    .description {
      margin-bottom: 15px;
      font-style: italic;
    }
    .image-container {
      display: flex;
      justify-content: center;
      margin-bottom: 15px;
    }
    .image-container img {
      max-width: 100%;
      height: auto;
    }
    .no-selection {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 80vh;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>${escapeHtml(commandName)}</h2>
  </div>
  <div class="details">
    ${commandId ? `<div><span class="detail-label">ID:</span> ${escapeHtml(commandId)}</div>` : ''}
    ${commandHeader ? `<div><span class="detail-label">Header:</span> ${escapeHtml(commandHeader)}</div>` : ''}
    ${commandDisplay ? `<div><span class="detail-label">Command:</span> ${escapeHtml(commandDisplay)}</div>` : ''}
  </div>
  ${description ? `<div class="description">${escapeHtml(description)}</div>` : ''}
  <div class="image-container">
    <img src="${imageData}" alt="Bit Mapping Visualization">
  </div>
</body>
</html>`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}