import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

/**
 * Rule that checks that signals with suggestedMetric "odometer" have "ODO" in the ID but not "ODOMETER"
 */
export class OdometerIdNamingRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'odo-id-naming',
      name: 'Odometer ID Naming',
      description: 'Signals with suggestedMetric "odometer" should have "ODO" in the ID but not "ODOMETER"',
      severity: LintSeverity.Warning,
      enabled: true,
    };
  }

  /**
   * Validates a signal against this rule
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  public validate(signal: Signal, node: jsonc.Node): LintResult | null {
    if (signal.suggestedMetric === 'odometer') {
      // Get the id property node
      const idNode = jsonc.findNodeAtLocation(node, ['id']);
      if (!idNode) return null;

      // Verify the ID follows the convention
      if (!signal.id.includes('ODO')) {
        return {
          ruleId: this.getConfig().id,
          message: `Signals with suggestedMetric "odometer" should have "ODO" in the ID. Found: "${signal.id}"`,
          node: idNode
        };
      }

      // Verify the ID follows the convention
      if (signal.id.includes('ODOMETER')) {
        // Only create a suggestion if "ODOMETER" is present
        let suggestion = undefined;

        const suggestedId = signal.id.replace(/ODOMETER/g, 'ODO');
        suggestion = {
        title: `Fix odometer ID: "${suggestedId}"`,
        edits: [{
            newText: `"${suggestedId}"`,
            offset: idNode.offset,
            length: idNode.length
        }]
        };

        return {
          ruleId: this.getConfig().id,
          message: `Signals with suggestedMetric "odometer" should use "ODO" instead of "ODOMETER". Found: "${signal.id}"`,
          node: idNode,
          suggestion
        };
      }
    }
    return null;
  }
}