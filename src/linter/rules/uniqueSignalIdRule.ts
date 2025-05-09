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
   * Validates a signal or signal group ID against this rule using pre-parsed document context.
   *
   * @param target The signal or signal group object (must have an 'id' property)
   * @param node The JSONC node for the entire signal or signal group object
   * @param context The document-wide context containing all pre-parsed IDs
   */
  public validate(target: Signal | SignalGroup, node: jsonc.Node, context: DocumentContext): LintResult | null {
    const idValue = target.id;

    // Find the JSONC node for the 'id' property within the current object node for accurate diagnostic placement.
    const idPropertyNode = jsonc.findNodeAtLocation(node, ['id']);
    if (!idPropertyNode) {
      // Should not happen if target.id is valid and node is the correct object node.
      return null;
    }

    const firstOccurrenceNode = context.allIds.get(idValue);

    // If an entry for this ID exists in allIds, AND the node in allIds is *different*
    // from the current object node, then the current node is a subsequent, duplicate occurrence.
    if (firstOccurrenceNode && firstOccurrenceNode !== node) {
      return {
        ruleId: this.getConfig().id,
        message: `ID \"${idValue}\" is not unique. Another signal or signal group in this file uses the same ID.`,
        node: idPropertyNode, // Report error on the 'id' property of the duplicate.
      };
    }

    return null;
  }
}