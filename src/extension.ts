import * as vscode from 'vscode';
import { createHoverProvider } from './providers/hoverProvider';

/**
 * Extension activation
 * @param context The VS Code extension context
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('OBDB extension activated');

  // Register the hover provider for JSON files
  const hoverProvider = createHoverProvider();
  console.log('Registered hover provider for JSON files');

  // Add provider to subscriptions
  context.subscriptions.push(hoverProvider);
}

/**
 * Extension deactivation
 */
export function deactivate() {
  // Clean up resources if needed
}