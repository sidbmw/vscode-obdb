import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

/**
 * Rule that validates that signal min/max values are within the range of possible values
 * given the formula defined by the signal.
 */
export class FormulaRangeValidationRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'formula-range-validation',
      name: 'Formula Range Validation',
      description: 'Validates that signal min/max values are within the range of possible values based on the signal formula',
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
    if (!signal.fmt) {
      return null;
    }

    const fmtNode = jsonc.findNodeAtLocation(node, ['fmt']);
    if (!fmtNode) return null;

    // Get required format properties
    const len = signal.fmt.len;
    const div = signal.fmt.div || 1;
    const mul = signal.fmt.mul || 1;
    const add = signal.fmt.add || 0;
    const isSigned = signal.fmt.sign === true;

    // Check if len is defined
    if (typeof len !== 'number') {
      return null;
    }

    // Calculate the min/max possible raw values based on bit length and signedness
    let minRawValue: number;
    let maxRawValue: number;

    if (isSigned) {
      // For signed values, the range is from -2^(len-1) to 2^(len-1) - 1
      minRawValue = -Math.pow(2, len - 1);
      maxRawValue = Math.pow(2, len - 1) - 1;
    } else {
      // For unsigned values, the range is from 0 to 2^len - 1
      minRawValue = 0;
      maxRawValue = Math.pow(2, len) - 1;
    }

    // Calculate the min/max possible values after applying the formula: x = value * mul / div + add
    const minPossibleValue = (minRawValue * mul / div) + add;
    const maxPossibleValue = (maxRawValue * mul / div) + add;

    // Default min is 0 if not specified, unless it's signed
    const minSpecified = typeof signal.fmt.min === 'number';
    const minValue = minSpecified ? signal.fmt.min : (isSigned ? minPossibleValue : 0);

    // If min is specified, check if it's below the minimum possible value
    if (minSpecified) {
      if (minValue < minPossibleValue) {
        const minNode = jsonc.findNodeAtLocation(fmtNode, ['min']);
        if (minNode) {
          // Suggest fixing the min value
          const roundedSuggestedMin = Number(minPossibleValue.toFixed(6));

          return {
            ruleId: this.getConfig().id,
            message: `Signal min value (${minValue}) is below the minimum possible value (${roundedSuggestedMin}) given the formula parameters${isSigned ? ' with signed encoding' : ''}.`,
            node: minNode,
            suggestion: {
              title: `Change min to ${roundedSuggestedMin}`,
              edits: [{
                offset: minNode.offset,
                length: minNode.length,
                newText: roundedSuggestedMin.toString()
              }]
            }
          };
        }
      }
    }

    // Check if max is specified
    if (typeof signal.fmt.max === 'number') {
      const maxNode = jsonc.findNodeAtLocation(fmtNode, ['max']);
      if (!maxNode) return null;

      // Check if the specified max exceeds the possible range
      if (signal.fmt.max > maxPossibleValue) {
        // Round to 6 decimal places for cleaner suggestions
        const roundedMaxPossible = Number(maxPossibleValue.toFixed(6));

        return {
          ruleId: this.getConfig().id,
          message: `Signal max value (${signal.fmt.max}) exceeds the maximum possible value (${roundedMaxPossible}) given the formula parameters${isSigned ? ' with signed encoding' : ''}.`,
          node: maxNode,
          suggestion: {
            title: `Change max to ${roundedMaxPossible}`,
            edits: [{
              offset: maxNode.offset,
              length: maxNode.length,
              newText: roundedMaxPossible.toString()
            }]
          }
        };
      }
    }

    return null;
  }
}