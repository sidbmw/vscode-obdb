import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import { RuleRegistry } from './ruleRegistry';
import { LintResult, Signal, SignalGroup, DocumentContext, Command, ILinterRule, getSeverity } from './rules/rule';

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
   * Lint an individual signal or signal group against all enabled rules that support signal-level linting.
   * @param target The signal or signal group to validate
   * @param node The JSONC node for the target
   * @param context Document-wide context including all IDs
   */
  public lintSignal(target: Signal | SignalGroup, node: jsonc.Node, context: DocumentContext): LintResult[] {
    const results: LintResult[] = [];
    const enabledRules = this.ruleRegistry.getEnabledRules();

    for (const rule of enabledRules) {
      if (rule.validateSignal) {
        // Pass the context to each rule
        const ruleResult = rule.validateSignal(target, node, context);
        if (ruleResult) {
          if (Array.isArray(ruleResult)) {
            results.push(...ruleResult);
          } else {
            results.push(ruleResult);
          }
        }
      }
    }
    return results;
  }

  /**
   * Lint a command and its signals against all enabled rules that support command-level linting.
   * @param command The parsed command object
   * @param commandNode The JSONC node for the command
   * @param signalsInCommand An array of signals belonging to this command, with their respective nodes
   * @param context Document-wide context
   */
  public lintCommand(command: Command, commandNode: jsonc.Node, signalsInCommand: { signal: Signal, node: jsonc.Node }[], context: DocumentContext): LintResult[] {
    const results: LintResult[] = [];
    const enabledRules = this.ruleRegistry.getEnabledRules();

    for (const rule of enabledRules) {
      if (rule.validateCommand) {
        const ruleResult = rule.validateCommand(command, commandNode, signalsInCommand, context);
        if (ruleResult) {
          if (Array.isArray(ruleResult)) {
            results.push(...ruleResult);
          } else {
            results.push(ruleResult);
          }
        }
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