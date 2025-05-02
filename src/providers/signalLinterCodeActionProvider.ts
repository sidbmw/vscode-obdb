import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import { LintResult } from '../linter/rules/rule';

/**
 * Code action provider for OBDB signal linter quick fixes
 */
export class SignalLinterCodeActionProvider implements vscode.CodeActionProvider {
  /**
   * Map of document URIs to their lint results
   */
  private lintResultsMap = new Map<string, LintResult[]>();

  /**
   * Store lint results for a document
   * @param documentUri The document URI
   * @param results The lint results
   */
  public setLintResults(documentUri: string, results: LintResult[]): void {
    this.lintResultsMap.set(documentUri, results);
  }

  /**
   * Clear lint results for a document
   * @param documentUri The document URI
   */
  public clearLintResults(documentUri: string): void {
    this.lintResultsMap.delete(documentUri);
  }

  /**
   * Provide code actions for lint results
   */
  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
    const actions: vscode.CodeAction[] = [];
    const lintResults = this.lintResultsMap.get(document.uri.toString()) || [];

    // Only provide actions for diagnostics with the source 'obdb-signal-linter'
    const relevantDiagnostics = context.diagnostics.filter(
      diagnostic => diagnostic.source === 'obdb-signal-linter'
    );

    if (relevantDiagnostics.length === 0) {
      return [];
    }

    // For each diagnostic, find the lint result and provide a fix if available
    for (const diagnostic of relevantDiagnostics) {
      // Find the lint result that corresponds to this diagnostic
      const lintResult = lintResults.find(
        lr => lr.ruleId === diagnostic.code &&
              document.offsetAt(diagnostic.range.start) === lr.node.offset &&
              document.offsetAt(diagnostic.range.end) === lr.node.offset + lr.node.length
      );

      if (lintResult?.suggestion) {
        // Create a code action with the suggestion
        const action = new vscode.CodeAction(
          lintResult.suggestion.title,
          vscode.CodeActionKind.QuickFix
        );
        action.diagnostics = [diagnostic];

        // Create a workspace edit for the suggestion
        action.edit = new vscode.WorkspaceEdit();
        for (const edit of lintResult.suggestion.edits) {
          const startPos = document.positionAt(edit.offset);
          const endPos = document.positionAt(edit.offset + edit.length);
          action.edit.replace(document.uri, new vscode.Range(startPos, endPos), edit.newText);
        }

        actions.push(action);
      }
    }

    return actions;
  }
}