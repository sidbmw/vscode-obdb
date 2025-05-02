import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';

/**
 * Interface for a signal object in the JSON
 */
export interface Signal {
  id: string;
  path: string;
  fmt: {
    unit?: string;
    [key: string]: any;
  };
  name: string;
  suggestedMetric?: string;
  description?: string;
}

/**
 * Interface for linter rule validation results
 */
export interface LintResult {
  ruleId: string;
  message: string;
  node: jsonc.Node;
  suggestion?: {
    title: string;
    edits: {
      newText: string;
      offset: number;
      length: number;
    }[];
  };
}

/**
 * Severity levels for linter rules
 */
export enum LintSeverity {
  Error = 'error',
  Warning = 'warning',
  Information = 'information',
  Hint = 'hint'
}

/**
 * Maps severity levels to VS Code diagnostic severity
 */
export function getSeverity(severity: LintSeverity): vscode.DiagnosticSeverity {
  switch (severity) {
    case LintSeverity.Error:
      return vscode.DiagnosticSeverity.Error;
    case LintSeverity.Warning:
      return vscode.DiagnosticSeverity.Warning;
    case LintSeverity.Information:
      return vscode.DiagnosticSeverity.Information;
    case LintSeverity.Hint:
      return vscode.DiagnosticSeverity.Hint;
    default:
      return vscode.DiagnosticSeverity.Warning;
  }
}

/**
 * Interface for linter rule configuration
 */
export interface LinterRuleConfig {
  id: string;
  name: string;
  description: string;
  severity: LintSeverity;
  enabled: boolean;
}

/**
 * Base interface for all linter rules
 */
export interface ILinterRule {
  /**
   * Gets the rule configuration
   */
  getConfig(): LinterRuleConfig;

  /**
   * Validates a signal against this rule
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  validate(signal: Signal, node: jsonc.Node): LintResult | null;
}