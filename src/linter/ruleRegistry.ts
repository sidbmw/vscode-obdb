import * as vscode from 'vscode';
import { ILinterRule, LinterRuleConfig } from './rules/rule';

// Import all rule classes directly
import { OdometerIdNamingRule } from './rules/odometerIdNamingRule';
import { SignalNamingConventionRule } from './rules/signalNamingConventionRule';
import { SuggestedMetricValidationRule } from './rules/suggestedMetricValidationRule';
import { FormulaRangeValidationRule } from './rules/formulaRangeValidationRule';

/**
 * Registry that manages all linter rules
 */
export class RuleRegistry {
  private static instance: RuleRegistry;
  private rules: ILinterRule[] = [];

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.loadAllRules();
  }

  /**
   * Gets the singleton instance of the rule registry
   */
  public static getInstance(): RuleRegistry {
    if (!RuleRegistry.instance) {
      RuleRegistry.instance = new RuleRegistry();
    }
    return RuleRegistry.instance;
  }

  /**
   * Loads all available rules
   */
  private loadAllRules(): void {
    // Create instances of all rule classes
    // When adding a new rule, just add it to this list
    const ruleClasses = [
      OdometerIdNamingRule,
      SignalNamingConventionRule,
      SuggestedMetricValidationRule,
      FormulaRangeValidationRule
    ];

    // Instantiate each rule class
    for (const RuleClass of ruleClasses) {
      this.rules.push(new RuleClass());
    }
  }

  /**
   * Gets all registered rules
   */
  public getAllRules(): ILinterRule[] {
    return this.rules;
  }

  /**
   * Gets all enabled rules
   */
  public getEnabledRules(): ILinterRule[] {
    return this.rules.filter(rule => rule.getConfig().enabled);
  }

  /**
   * Gets rule configurations for all rules
   */
  public getAllRuleConfigs(): LinterRuleConfig[] {
    return this.rules.map(rule => rule.getConfig());
  }

  /**
   * Gets a rule by ID
   */
  public getRuleById(ruleId: string): ILinterRule | undefined {
    return this.rules.find(rule => rule.getConfig().id === ruleId);
  }
}