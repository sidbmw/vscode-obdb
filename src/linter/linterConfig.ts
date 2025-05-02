import { RuleRegistry } from './ruleRegistry';
import { LintSeverity, LinterRuleConfig } from './rules/rule';

/**
 * Gets the enabled linter rules
 */
export function getEnabledRules(): LinterRuleConfig[] {
  const registry = RuleRegistry.getInstance();
  return registry.getEnabledRules().map(rule => rule.getConfig());
}

/**
 * Gets a rule configuration by ID
 */
export function getRuleById(ruleId: string): LinterRuleConfig | undefined {
  const registry = RuleRegistry.getInstance();
  const rule = registry.getRuleById(ruleId);
  return rule?.getConfig();
}

/**
 * Gets all rule configurations
 */
export function getAllRules(): LinterRuleConfig[] {
  const registry = RuleRegistry.getInstance();
  return registry.getAllRuleConfigs();
}

// Re-export LintSeverity for backward compatibility
export { LintSeverity };