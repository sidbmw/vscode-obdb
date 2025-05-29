import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import { RuleRegistry } from './ruleRegistry';
import { LintResult, Signal, SignalGroup, Command, ILinterRule, getSeverity } from './rules/rule';

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
   */
  public lintSignal(target: Signal | SignalGroup, node: jsonc.Node): LintResult[] {
    const results: LintResult[] = [];
    const enabledRules = this.ruleRegistry.getEnabledRules();

    for (const rule of enabledRules) {
      if (rule.validateSignal) {
        // Pass the context to each rule
        const ruleResult = rule.validateSignal(target, node);
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
   */
  public lintCommand(command: Command, commandNode: jsonc.Node, signalsInCommand: { signal: Signal, node: jsonc.Node }[]): LintResult[] {
    const results: LintResult[] = [];
    const enabledRules = this.ruleRegistry.getEnabledRules();

    for (const rule of enabledRules) {
      if (rule.validateCommand) {
        const ruleResult = rule.validateCommand(command, commandNode, signalsInCommand);
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
   * Lint all commands in a commands array against all enabled rules that support commands-level linting.
   * @param commandsNode The JSONC node for the commands array
   */
  public lintCommands(commandsNode: jsonc.Node): LintResult[] {
    const results: LintResult[] = [];
    const enabledRules = this.ruleRegistry.getEnabledRules();

    for (const rule of enabledRules) {
      if (rule.validateCommands) {
        const ruleResult = rule.validateCommands(commandsNode);
        if (ruleResult) {
          results.push(...ruleResult);
        }
      }
    }
    return results;
  }

  /**
   * Lint the entire document against all enabled rules that support document-level linting.
   * @param rootNode The root JSONC node for the entire document
   */
  public lintDocument(rootNode: jsonc.Node): LintResult[] {
    const results: LintResult[] = [];
    const enabledRules = this.ruleRegistry.getEnabledRules();

    for (const rule of enabledRules) {
      if (rule.validateDocument) {
        const ruleResult = rule.validateDocument(rootNode);
        if (ruleResult) {
          results.push(...ruleResult);
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