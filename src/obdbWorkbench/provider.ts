import * as vscode from 'vscode';
import { isPositionInCommand, getSampleCommandResponses, generateCommandIdFromDefinition } from '../utils/commandParser';
import { extractSignals } from './signalExtractor';
import { generateBitmapHtml } from './htmlGenerator';
import { getWebviewContent } from './webviewContent';

// Track webview panel and state
let visualizationPanel: vscode.WebviewPanel | undefined;
let currentCommand: any | undefined;
// Track which document created the visualization
let sourceDocument: vscode.TextDocument | undefined;

// Cancellation and debouncing for heavy processing
let currentCancellationTokenSource: vscode.CancellationTokenSource | undefined;
let debounceTimer: NodeJS.Timeout | undefined;

/**
 * Initialize the OBDb workbench provider
 * Shows bitmap visualizations when editing commands
 */
export function createVisualizationProvider(): vscode.Disposable {
  // Set up event handlers
  const disposables: vscode.Disposable[] = [];

  // Listen for text document changes
  disposables.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      // If this is our source document, update the visualization
      if (sourceDocument && event.document.uri.toString() === sourceDocument.uri.toString()) {
        updateVisualization(event.document);
      }
    })
  );

  // Listen for cursor movement
  disposables.push(
    vscode.window.onDidChangeTextEditorSelection(event => {
      if (event.textEditor.document.languageId === 'json') {
        // Update or set the source document when making a selection in a JSON file
        sourceDocument = event.textEditor.document;
        updateVisualizationFromCursor(event.textEditor);
      }
    })
  );

  // Listen for document closing
  disposables.push(
    vscode.workspace.onDidCloseTextDocument(document => {
      // Check if the closed document was being visualized
      if (visualizationPanel &&
          sourceDocument &&
          document.uri.toString() === sourceDocument.uri.toString()) {
        // Close the visualization panel when the source document is closed
        visualizationPanel.dispose();
        visualizationPanel = undefined;
        currentCommand = undefined;
        sourceDocument = undefined;
      }
    })
  );

  // Listen for editor activation
  disposables.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && editor.document.languageId === 'json') {
        if (!sourceDocument || editor.document.uri.toString() === sourceDocument.uri.toString()) {
          // This is either our source document or we're setting a new source
          sourceDocument = editor.document;
          // Use cursor position when switching editors
          updateVisualizationFromCursor(editor);
        } else {
          // This is a different JSON file than our source document
          // Hide the panel
          if (visualizationPanel) {
            visualizationPanel.dispose();
            visualizationPanel = undefined;
            currentCommand = undefined;
          }
          // Set this as the new source document
          sourceDocument = editor.document;
        }
      } else if (editor && sourceDocument) {
        // Hide panel when switching to non-JSON files
        if (visualizationPanel) {
          visualizationPanel.dispose();
          visualizationPanel = undefined;
          currentCommand = undefined;
        }
      }
    })
  );

  // Create our webview panel if needed
  disposables.push(
    vscode.commands.registerCommand('obdb.showBitmapVisualization', () => {
      if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'json') {
        // Set the source document when explicitly opening visualization
        sourceDocument = vscode.window.activeTextEditor.document;
      }

      createOrShowVisualizationPanel();

      // If we have a current command, update the visualization
      if (currentCommand) {
        // Cancel any existing operations before starting a new one
        cancelCurrentOperations();
        currentCancellationTokenSource = new vscode.CancellationTokenSource();
        updateVisualizationPanel(currentCommand, currentCancellationTokenSource.token).catch(error => {
          if (!(error instanceof vscode.CancellationError)) {
            console.error('Error updating visualization panel:', error);
          }
        });
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
      // Cancel any running operations and clear timers
      if (currentCancellationTokenSource) {
        currentCancellationTokenSource.cancel();
        currentCancellationTokenSource.dispose();
        currentCancellationTokenSource = undefined;
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      sourceDocument = undefined;
    }
  };
}

/**
 * Cancel any currently running visualization update operations
 */
function cancelCurrentOperations() {
  if (currentCancellationTokenSource) {
    currentCancellationTokenSource.cancel();
    currentCancellationTokenSource.dispose();
    currentCancellationTokenSource = undefined;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
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
    'OBDb workbench',
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

  // Always update from cursor position, ignoring any potential mouse position
  updateVisualizationFromCursor(editor);
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
 * Update visualization based on a given position with debouncing and cancellation
 */
async function updateVisualizationFromPosition(editor: vscode.TextEditor, position: vscode.Position): Promise<void> {
  if (!editor || editor.document.languageId !== 'json') return;

  // Cancel any existing operations
  cancelCurrentOperations();

  // Debounce the update to avoid excessive processing during rapid changes
  debounceTimer = setTimeout(async () => {
    try {
      // Check if we're in a command
      const commandCheck = isPositionInCommand(editor.document, position);
      if (!commandCheck.isCommand || !commandCheck.commandObject) {
        currentCommand = undefined;
        return;
      }

      // We're in a command definition, store the command
      const command = commandCheck.commandObject;
      currentCommand = command;

      // If panel exists, update it with cancellation token
      if (visualizationPanel) {
        // Create new cancellation token for this operation
        currentCancellationTokenSource = new vscode.CancellationTokenSource();
        await updateVisualizationPanel(command, currentCancellationTokenSource.token);
      }
    } catch (error) {
      // If operation was cancelled, ignore the error
      if (error instanceof vscode.CancellationError) {
        return;
      }
      console.error('Error updating visualization:', error);
    }
  }, 150); // 150ms debounce delay
}

/**
 * Update the visualization panel with command data
 */
export async function updateVisualizationPanel(command: any, cancellationToken?: vscode.CancellationToken) {
  if (!visualizationPanel) {
    createOrShowVisualizationPanel();
  }

  // Check if operation was cancelled before starting
  if (cancellationToken?.isCancellationRequested) {
    throw new vscode.CancellationError();
  }

  // Extract signals from the command
  const signals = extractSignals(command);

  // Check cancellation after each potentially expensive operation
  if (cancellationToken?.isCancellationRequested) {
    throw new vscode.CancellationError();
  }

  // Generate HTML for the bitmap visualization
  const bitmapHtml = generateBitmapHtml(command, signals);

  if (cancellationToken?.isCancellationRequested) {
    throw new vscode.CancellationError();
  }

  // Get command details for display
  const commandName = command.name || 'Command';
  const commandId = command.id || '';
  const commandHeader = command.hdr || '';
  const commandDisplay = typeof command.cmd === 'object'
    ? Object.entries(command.cmd).map(([k, v]) => `${k}: ${v}`).join(', ')
    : command.cmd?.toString() || '';

  // Use the new generateCommandIdFromDefinition function to create the full command ID
  let fullCommandId = commandId;
  if (!fullCommandId) {
    fullCommandId = generateCommandIdFromDefinition(command);
  }

  if (cancellationToken?.isCancellationRequested) {
    throw new vscode.CancellationError();
  }

  // Fetch sample responses if we have a command ID - this is the most expensive operation
  const sampleResponses = fullCommandId ? await getSampleCommandResponses(fullCommandId, cancellationToken) : [];

  // Final cancellation check before updating UI
  if (cancellationToken?.isCancellationRequested) {
    throw new vscode.CancellationError();
  }

  // Update the webview content
  visualizationPanel!.webview.html = getWebviewContent(
    bitmapHtml,
    commandName,
    commandId,
    commandHeader,
    commandDisplay,
    command.description || '',
    sampleResponses
  );
}