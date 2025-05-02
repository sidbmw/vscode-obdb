import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

/**
 * Rule that validates that signal bit ranges don't overlap within the same command
 */
export class SignalBitOverlapRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'signal-bit-overlap',
      name: 'Signal Bit Overlap Detection',
      description: 'Validates that signal bit ranges do not overlap within the same command',
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
    if (!signal.fmt) {
      return null;
    }

    // We need to check for overlapping signals within the same command
    // However, this rule is called with just one signal at a time
    // We need to get the other signals in the same command from the document context

    // First find the signals array node
    const signalsArrayNode = this.findParentArrayNode(node);
    if (!signalsArrayNode || !signalsArrayNode.children) {
      return null;
    }

    // Now find the command node (parent of signals array)
    const commandNode = signalsArrayNode.parent;
    if (!commandNode) {
      return null;
    }

    // Get the current signal's bit range
    const bix = signal.fmt.bix || 0; // Default bix is 0 if not specified
    const len = signal.fmt.len;

    if (typeof len !== 'number') {
      return null; // Skip signals without a length
    }

    // This signal's bit range is from bix to bix + len - 1
    const currentSignalStart = bix;
    const currentSignalEnd = bix + len - 1;

    // Get the fmt node to use for the diagnostic
    const fmtNode = jsonc.findNodeAtLocation(node, ['fmt']);
    if (!fmtNode) {
      return null;
    }

    // Check each signal in the command for overlaps
    for (const otherSignalNode of signalsArrayNode.children) {
      // Skip the current signal
      if (otherSignalNode === node) {
        continue;
      }

      try {
        const otherSignal: Signal = jsonc.getNodeValue(otherSignalNode);

        // Skip signals without fmt or len
        if (!otherSignal.fmt || typeof otherSignal.fmt.len !== 'number') {
          continue;
        }

        const otherBix = otherSignal.fmt.bix || 0; // Default bix is 0
        const otherLen = otherSignal.fmt.len;

        // Other signal's bit range is from otherBix to otherBix + otherLen - 1
        const otherSignalStart = otherBix;
        const otherSignalEnd = otherBix + otherLen - 1;

        // Check for overlap: two ranges overlap if one starts before the other ends
        const hasOverlap =
          (currentSignalStart <= otherSignalEnd && currentSignalEnd >= otherSignalStart);

        if (hasOverlap) {
          const targetNode = fmtNode;

          return {
            ruleId: this.getConfig().id,
            message: `Signal bit range (${currentSignalStart}-${currentSignalEnd}) overlaps with signal "${otherSignal.name}" bit range (${otherSignalStart}-${otherSignalEnd})`,
            node: targetNode,
            suggestion: {
              title: `Adjust bit index or length to avoid overlap with "${otherSignal.name}"`,
              edits: [] // No automatic fixes for this since it requires understanding the data format
            }
          };
        }
      } catch (err) {
        console.error('Error checking bit range overlap:', err);
      }
    }

    return null;
  }

  /**
   * Finds the parent array node that contains this signal node
   * @param node The current signal node
   */
  private findParentArrayNode(node: jsonc.Node): jsonc.Node | null {
    // This node should be the object node for a signal
    // Its parent should be an array node (signals array)
    if (!node.parent || node.parent.type !== 'array') {
      return null;
    }

    return node.parent;
  }
}