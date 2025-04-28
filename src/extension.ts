import * as vscode from 'vscode';
import { createHoverProvider } from './providers/hoverProvider';
import { createVisualizationProvider } from './providers/visualizationProvider';
import { createDiagnosticsProvider } from './providers/diagnosticsProvider';

/**
 * Extension activation
 * @param context The VS Code extension context
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('OBDB extension activated');

  // Register the hover provider for JSON files
  const hoverProvider = createHoverProvider();
  console.log('Registered hover provider for JSON files');

  // Register the visualization provider for bitmap visualizations
  const visualizationProvider = createVisualizationProvider();
  console.log('Registered visualization provider for bitmap visualizations');

  // Register the diagnostics provider for command validation
  const diagnosticsProvider = createDiagnosticsProvider();
  console.log('Registered diagnostics provider for command validation');

  // Automatically show bitmap visualization when editing a JSON file
  const autoShowDisposable = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor && editor.document.languageId === 'json') {
      // Delay slightly to ensure document is fully loaded
      setTimeout(() => {
        vscode.commands.executeCommand('obdb.showBitmapVisualization');
      }, 300);
    }
  });

  // Initial auto-show if starting with a JSON file open
  if (vscode.window.activeTextEditor &&
      vscode.window.activeTextEditor.document.languageId === 'json') {
    setTimeout(() => {
      vscode.commands.executeCommand('obdb.showBitmapVisualization');
    }, 500);
  }

  // Add providers and other disposables to subscriptions
  context.subscriptions.push(
    hoverProvider,
    visualizationProvider,
    diagnosticsProvider,
    autoShowDisposable
  );
}

/**
 * Extension deactivation
 */
export function deactivate() {
  // Clean up resources if needed
}