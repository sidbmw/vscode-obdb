import * as vscode from 'vscode';
import { createVisualizationProvider } from '../obdbWorkbench';

/**
 * Initialize the OBDb visualization provider
 * Shows bitmap visualizations when editing commands
 */
export function initializeVisualizationProvider(): vscode.Disposable {
  return createVisualizationProvider();
}