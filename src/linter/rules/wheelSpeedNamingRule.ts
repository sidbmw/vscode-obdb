import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

/**
 * Rule that checks that wheel speed signal names follow a standard format.
 * e.g., "Front left wheel speed"
 */
export class WheelSpeedNamingRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'wheel-speed-naming',
      name: 'Wheel Speed Naming Convention',
      description: 'Wheel speed signal names (containing "speed", a front/rear indicator, and a left/right indicator) should follow the format "[Front/Rear] [left/right] wheel speed" (e.g., "Front left wheel speed").',
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
    if (!signal.name) {
      return null;
    }

    const nameNode = jsonc.findNodeAtLocation(node, ['name']);
    if (!nameNode || !nameNode.value) { // Check nameNode.value as signal.name comes from parsed JSON
      return null;
    }

    const currentName = String(nameNode.value); // Use the actual value from the JSON node
    const lowerName = currentName.toLowerCase();

    const hasSpeed = lowerName.includes('speed');
    if (!hasSpeed) {
      return null;
    }

    let verticalPart: string | null = null;
    if (lowerName.includes('front')) {
      verticalPart = 'Front';
    } else if (lowerName.includes('rear') || lowerName.includes('back')) {
      verticalPart = 'Rear';
    }

    let horizontalPart: string | null = null;
    if (lowerName.includes('left')) {
      horizontalPart = 'left';
    } else if (lowerName.includes('right')) {
      horizontalPart = 'right';
    }

    // Only proceed if all components are found
    if (verticalPart && horizontalPart) {
      const suggestedName = `${verticalPart} ${horizontalPart} wheel speed`;

      // If the name already matches the suggested format, no linting error
      if (currentName === suggestedName) {
        return null;
      }

      // Otherwise, provide a suggestion
      return {
        ruleId: this.getConfig().id,
        message: `Signal name "${currentName}" should follow the format "[Front/Rear] [left/right] wheel speed". Suggested: "${suggestedName}"`,
        node: nameNode,
        suggestion: {
          title: `Rename to: "${suggestedName}"`,
          edits: [{
            newText: `"${suggestedName}"`, // JSON string values are quoted
            offset: nameNode.offset,
            length: nameNode.length
          }]
        }
      };
    }

    return null;
  }
}
