import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

/**
 * Rule that validates that signal IDs are unique across all commands in a file
 */
export class UniqueSignalIdRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'unique-signal-id',
      name: 'Unique Signal ID',
      description: 'Validates that signal IDs are unique across all commands in a file',
      severity: LintSeverity.Error,
      enabled: true,
    };
  }

  /**
   * Validates a signal against this rule
   * This implementation examines the entire document structure on each validation call
   *
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  public validate(signal: Signal, node: jsonc.Node): LintResult | null {
    // Get the ID node to target in diagnostic
    const idNode = jsonc.findNodeAtLocation(node, ['id']);
    if (!idNode) return null;

    const signalId = signal.id;

    // Find the root JSON node by traversing up the tree
    let rootNode = this.findRootNode(node);
    if (!rootNode) return null;

    // Find all signals with this ID in the document
    const occurrences = this.findSignalIdOccurrences(rootNode, signalId);

    // If we found multiple occurrences and this isn't the first one
    if (occurrences.length > 1 && occurrences[0] !== node) {
      // Report a duplicate ID error
      return {
        ruleId: this.getConfig().id,
        message: `Signal ID "${signalId}" is not unique across all commands in this file. First occurrence is in another command.`,
        node: idNode
      };
    }

    return null;
  }

  /**
   * Finds the root node by traversing up the tree
   * @param node The node to start from
   */
  private findRootNode(node: jsonc.Node): jsonc.Node | null {
    let current: jsonc.Node | undefined = node;

    // Traverse up the tree until we reach the root node (no parent)
    while (current?.parent) {
      current = current.parent;
    }

    return current || null;
  }

  /**
   * Finds all occurrences of a signal ID in the document
   * @param rootNode The root JSON node
   * @param targetSignalId The signal ID to find
   * @returns Array of signal nodes with the matching ID
   */
  private findSignalIdOccurrences(rootNode: jsonc.Node, targetSignalId: string): jsonc.Node[] {
    const occurrences: jsonc.Node[] = [];

    // Find the commands array node
    const commandsArrayNode = jsonc.findNodeAtLocation(rootNode, ['commands']);
    if (!commandsArrayNode || !commandsArrayNode.children) {
      return occurrences;
    }

    // Iterate through all commands
    for (const commandNode of commandsArrayNode.children) {
      // Find the signals array in this command
      const signalsNode = jsonc.findNodeAtLocation(commandNode, ['signals']);
      if (!signalsNode || !signalsNode.children) continue;

      // Check each signal in this command
      for (const signalNode of signalsNode.children) {
        try {
          // Get the signal ID
          const idNode = jsonc.findNodeAtLocation(signalNode, ['id']);
          if (!idNode) continue;

          const signalId = jsonc.getNodeValue(idNode);

          // If this signal ID matches our target
          if (signalId === targetSignalId) {
            occurrences.push(signalNode);
          }
        } catch (err) {
          console.error('Error checking signal ID occurrences:', err);
        }
      }
    }

    return occurrences;
  }
}