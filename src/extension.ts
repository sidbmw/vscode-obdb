import * as vscode from 'vscode';
import { createHoverProvider } from './providers/hoverProvider';
import { initializeVisualizationProvider } from './providers/visualizationProvider';
import { createDiagnosticsProvider } from './providers/diagnosticsProvider';
import { createTestProvider } from './providers/testProvider';
import { registerTestCommands, testExecutionEvent } from './utils/testCommands';
import { registerTestExplorer } from './providers/testExplorerProvider';
import { createDefinitionProvider } from './providers/definitionProvider';

// Create a diagnostic collection for test failures
let testDiagnosticCollection: vscode.DiagnosticCollection;

/**
 * Extension activation
 * @param context The VS Code extension context
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('OBDB extension activated');

  // Create diagnostic collection for test results
  testDiagnosticCollection = vscode.languages.createDiagnosticCollection('obdb-test-failures');

  // Register the hover provider for JSON files
  const hoverProvider = createHoverProvider();
  console.log('Registered hover provider for JSON files');

  // Register the visualization provider for bitmap visualizations
  const visualizationProvider = initializeVisualizationProvider();
  console.log('Registered visualization provider for bitmap visualizations');

  // Register the diagnostics provider for command validation
  const diagnosticsProvider = createDiagnosticsProvider();
  console.log('Registered diagnostics provider for command validation');

  // Register the test provider for YAML test files
  const testProvider = createTestProvider();
  console.log('Registered test provider for YAML test files');

  // Register the definition provider for command ID navigation in YAML files
  const definitionProvider = createDefinitionProvider();
  console.log('Registered definition provider for command ID navigation');

  // Register test commands for running and debugging tests
  const testCommands = registerTestCommands(context);
  console.log('Registered commands for running and debugging tests');

  // Register test explorer integration
  const testExplorer = registerTestExplorer(context);
  console.log('Registered test explorer integration');

  // Subscribe to test execution events to update diagnostics
  const testExecutionSubscription = testExecutionEvent.event(event => {
    handleTestExecutionResult(event);
  });

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
    testProvider,
    ...definitionProvider,
    ...testCommands,
    testExplorer,
    testExecutionSubscription,
    autoShowDisposable,
    testDiagnosticCollection
  );
}

/**
 * Handle test execution results to update diagnostics
 * @param event The test execution event
 */
async function handleTestExecutionResult(event: {
  uri: vscode.Uri;
  success: boolean;
  testIndex?: number;
  isDebug: boolean;
  errorMessage?: string;
  errorLocation?: { file: string; line: number };
}) {
  try {
    // Clear existing diagnostics for this URI
    testDiagnosticCollection.delete(event.uri);

    // If test succeeded, we're done - no diagnostics needed
    if (event.success) {
      return;
    }

    // If there's no error message, skip
    if (!event.errorMessage) {
      return;
    }

    // If there's a specific error location, show the error there
    if (event.errorLocation) {
      const errorFilePath = event.errorLocation.file;
      const errorLine = event.errorLocation.line;

      try {
        // Create a URI for the error location file
        const errorFileUri = vscode.Uri.file(errorFilePath);

        // Try to open the document to get position information
        const errorDocument = await vscode.workspace.openTextDocument(errorFileUri);

        // Create a range for the specific line
        const lineStart = new vscode.Position(errorLine, 0);
        const lineEnd = new vscode.Position(errorLine, 1000); // Use a large column number to get to end of line
        const range = new vscode.Range(lineStart, lineEnd);

        // Create a diagnostic at the exact line of the error
        const diagnostic = new vscode.Diagnostic(
          range,
          event.errorMessage,
          vscode.DiagnosticSeverity.Error
        );

        // Set the diagnostic on the error file
        testDiagnosticCollection.set(errorFileUri, [diagnostic]);

        // Open the document at the error location
        vscode.window.showTextDocument(errorFileUri, {
          selection: range,
          preserveFocus: false
        });
      } catch (err) {
        console.error("Error creating diagnostic at specific location:", err);
        // Fall back to showing the error at the original test file
        showErrorInOriginalFile(event);
      }
    } else {
      // No specific location, show in the original file
      showErrorInOriginalFile(event);
    }
  } catch (err) {
    console.error("Error handling test results:", err);
  }
}

/**
 * Show an error in the original test file when we can't show it at the specific location
 */
function showErrorInOriginalFile(event: {
  uri: vscode.Uri;
  success: boolean;
  testIndex?: number;
  isDebug: boolean;
  errorMessage?: string;
}) {
  if (!event.errorMessage) return;

  // Create a diagnostic at the top of the file
  const range = new vscode.Range(0, 0, 0, 0);
  const diagnostic = new vscode.Diagnostic(
    range,
    event.errorMessage,
    vscode.DiagnosticSeverity.Error
  );

  // Set the diagnostic on the original file
  testDiagnosticCollection.set(event.uri, [diagnostic]);
}

/**
 * Extension deactivation
 */
export function deactivate() {
  // Clear the diagnostic collection
  if (testDiagnosticCollection) {
    testDiagnosticCollection.clear();
    testDiagnosticCollection.dispose();
  }
}