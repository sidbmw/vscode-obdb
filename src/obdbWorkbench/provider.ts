import * as vscode from 'vscode';
import { isPositionInCommand, getSampleCommandResponses, generateCommandId } from '../utils/commandParser';
import { extractSignals } from './signalExtractor';
import { generateBitmapHtml } from './htmlGenerator';
import { getWebviewContent } from './webviewContent';

// Track webview panel and state
let visualizationPanel: vscode.WebviewPanel | undefined;
let currentCommand: any | undefined;
// Track which document created the visualization
let sourceDocument: vscode.TextDocument | undefined;

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
      sourceDocument = undefined;
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
export async function updateVisualizationPanel(command: any) {
  if (!visualizationPanel) {
    createOrShowVisualizationPanel();
  }

  // Extract signals from the command
  const signals = extractSignals(command);

  // Generate HTML for the bitmap visualization
  const bitmapHtml = generateBitmapHtml(command, signals);

  // Get command details for display
  const commandName = command.name || 'Command';
  const commandId = command.id || '';
  const commandHeader = command.hdr || '';
  const commandCmdValue = command.cmd || '';
  const commandRax = command.rax || '';
  const commandDisplay = typeof command.cmd === 'object'
    ? Object.entries(command.cmd).map(([k, v]) => `${k}: ${v}`).join(', ')
    : command.cmd?.toString() || '';

  // Use shared generateCommandId function to create the full command ID
  let fullCommandId = commandId;
  if (!fullCommandId && commandHeader) {
    fullCommandId = generateCommandId(commandHeader, commandCmdValue, commandRax);
  }

  // Fetch sample responses if we have a command ID
  const sampleResponses = fullCommandId ? await getSampleCommandResponses(fullCommandId) : [];

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