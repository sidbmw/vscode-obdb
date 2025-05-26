import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

/**
 * Rule that checks that map signal keys are numerical values (not hexadecimal)
 */
export class MapKeyNumericalRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'map-key-numerical',
      name: 'Map Key Numerical',
      description: 'Map signal keys should be numerical values, not hexadecimal',
      severity: LintSeverity.Error,
      enabled: true,
    };
  }

  /**
   * Validates a signal against this rule
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  public validate(signal: Signal, node: jsonc.Node): LintResult | null {
    // Only apply this rule to signals with map format
    if (!signal.fmt || !signal.fmt.map) {
      return null;
    }

    // Find the map node
    const fmtNode = jsonc.findNodeAtLocation(node, ['fmt']);
    if (!fmtNode) return null;

    const mapNode = jsonc.findNodeAtLocation(fmtNode, ['map']);
    if (!mapNode) return null;

    // Check each key in the map
    const mapKeys = Object.keys(signal.fmt.map);
    const nonNumericalKeys: string[] = [];

    for (const key of mapKeys) {
      // Check if the key is not a numerical value (e.g., 'A', 'B', etc.)
      // Numerical values should be digits only (0-9)
      if (!/^\d+$/.test(key)) {
        nonNumericalKeys.push(key);
      }
    }

    if (nonNumericalKeys.length > 0) {
      // Get the first non-numerical key to provide a suggestion
      const firstKey = nonNumericalKeys[0];
      const keyNode = this.findKeyNode(mapNode, firstKey);

      if (keyNode) {
        // Generate suggested numerical value for hexadecimal key
        const suggestedValue = this.hexToDecimal(firstKey);

        return {
          ruleId: this.getConfig().id,
          message: `Map signal keys should be numerical values, not hexadecimal. Found: "${nonNumericalKeys.join('", "')}"`,
          node: keyNode,
          suggestion: {
            title: `Convert "${firstKey}" to numerical value "${suggestedValue}"`,
            edits: [{
              newText: `"${suggestedValue}"`,
              offset: keyNode.offset,
              length: keyNode.length
            }]
          }
        };
      } else {
        // If we can't find the node for a specific suggestion, still report the issue
        return {
          ruleId: this.getConfig().id,
          message: `Map signal keys should be numerical values, not hexadecimal. Found: "${nonNumericalKeys.join('", "')}"`,
          node: mapNode,
        };
      }
    }

    return null;
  }

  /**
   * Find the node for a specific key in the map
   * @param mapNode The JSONC node for the map
   * @param keyToFind The key to find
   */
  private findKeyNode(mapNode: jsonc.Node, keyToFind: string): jsonc.Node | null {
    // Map node should be an object
    if (mapNode.type !== 'object' || !mapNode.children) {
      return null;
    }

    // Each child should be a property
    for (const property of mapNode.children) {
      if (property.type === 'property' && property.children && property.children.length >= 1) {
        const keyNode = property.children[0];
        // The key value will include quotes, so we need to extract the actual string
        if (keyNode.value === `"${keyToFind}"`) {
          return keyNode;
        }
      }
    }

    return null;
  }

  /**
   * Convert a hexadecimal string to a decimal value
   * @param hex The hexadecimal string to convert
   */
  private hexToDecimal(hex: string): string {
    try {
      return parseInt(hex, 16).toString();
    } catch (e) {
      // If parsing fails, return the original string
      return hex;
    }
  }
}
