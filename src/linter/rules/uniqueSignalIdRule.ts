import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig, DocumentContext, SignalGroup } from './rule';

/**
 * Rule that validates that signal and signal group IDs are unique across the entire file.
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
   * Validates the entire document at once to check for duplicate signal IDs.
   * @param rootNode The root JSONC node for the entire document
   * @param context Document-wide context
   * @returns Lint results or null if no issues are found
   */
  public validateDocument(rootNode: jsonc.Node, context: DocumentContext): LintResult[] | null {
    if (!rootNode) {
      return null;
    }

    const results: LintResult[] = [];
    const idMap = new Map<string, jsonc.Node>();

    // Process commands array first
    const commandsNode = jsonc.findNodeAtLocation(rootNode, ['commands']);
    if (commandsNode && commandsNode.type === 'array' && commandsNode.children) {
      for (const commandNode of commandsNode.children) {
        const signalsNode = jsonc.findNodeAtLocation(commandNode, ['signals']);
        if (signalsNode && signalsNode.type === 'array' && signalsNode.children) {
          for (const signalNode of signalsNode.children) {
            this.checkForDuplicateId(signalNode, idMap, results);
          }
        }
      }
    }

    // Process signal groups array
    const signalGroupsNode = jsonc.findNodeAtLocation(rootNode, ['signalGroups']);
    if (signalGroupsNode && signalGroupsNode.type === 'array' && signalGroupsNode.children) {
      for (const signalGroupNode of signalGroupsNode.children) {
        this.checkForDuplicateId(signalGroupNode, idMap, results);
      }
    }

    return results.length > 0 ? results : null;
  }

  /**
   * Checks if a node has a duplicate ID and adds a result to the results array if it does.
   * @param node The node to check
   * @param idMap Map of previously seen IDs to their nodes
   * @param results Array to add results to
   */
  private checkForDuplicateId(node: jsonc.Node, idMap: Map<string, jsonc.Node>, results: LintResult[]): void {
    try {
      const idNode = jsonc.findNodeAtLocation(node, ['id']);
      if (!idNode) {
        return;
      }

      const id = jsonc.getNodeValue(idNode);
      if (typeof id !== 'string' || id.trim() === '') {
        return;
      }

      // If we've seen this ID before, it's a duplicate
      if (idMap.has(id)) {
        results.push({
          ruleId: this.getConfig().id,
          message: `ID "${id}" is not unique. Another signal or signal group in this file uses the same ID.`,
          node: idNode,
        });
      } else {
        // Otherwise, record that we've seen this ID
        idMap.set(id, node);
      }
    } catch (err) {
      console.error('Error checking for duplicate ID:', err);
    }
  }

  /**
   * The original per-signal validation is now a no-op since we validate signals in bulk
   */
  public validateSignal(): LintResult | null {
    return null;
  }
}