import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import { RuleRegistry } from './ruleRegistry';
import { Signal, LintResult, getSeverity } from './rules/rule';

/**
 * Main signal linter class
 */
export class SignalLinter {
  private ruleRegistry: RuleRegistry;
  private lastResults: LintResult[] = [];

  constructor() {
    this.ruleRegistry = RuleRegistry.getInstance();
  }

  /**
   * Lint a signal against all enabled rules
   */
  public lintSignal(signal: Signal, node: jsonc.Node): LintResult[] {
    const results: LintResult[] = [];
    const enabledRules = this.ruleRegistry.getEnabledRules();

    for (const rule of enabledRules) {
      const ruleResult = rule.validate(signal, node);
      if (ruleResult) {
        results.push(ruleResult);
      }
    }

    return results;
  }

  /**
   * Get the last lint results
   */
  public getLastResults(): LintResult[] {
    return this.lastResults;
  }

  /**
   * Set the last lint results
   */
  public setLastResults(results: LintResult[]): void {
    this.lastResults = results;
  }

  /**
   * Convert lint results to VS Code diagnostics
   */
  public toDiagnostics(document: vscode.TextDocument, results: LintResult[]): vscode.Diagnostic[] {
    this.lastResults = results; // Store the results for the code action provider

    return results.map(result => {
      const rule = this.ruleRegistry.getRuleById(result.ruleId);
      if (!rule) {
        throw new Error(`Rule not found: ${result.ruleId}`);
      }

      const startPos = document.positionAt(result.node.offset);
      const endPos = document.positionAt(result.node.offset + result.node.length);

      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(startPos, endPos),
        result.message,
        getSeverity(rule.getConfig().severity)
      );

      diagnostic.code = result.ruleId;
      diagnostic.source = 'obdb-signal-linter';

      return diagnostic;
    });
  }
}