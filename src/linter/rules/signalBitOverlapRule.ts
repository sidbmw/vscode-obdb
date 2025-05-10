import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig, Command, DocumentContext } from './rule';

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
   * Validates a command for overlapping signal bit ranges.
   * @param command The command being validated (not directly used, but part of the interface)
   * @param commandNode The JSONC node for the command (not directly used, but part of the interface)
   * @param signalsInCommand An array of signals belonging to this command, with their respective nodes
   * @param context Document-wide context (not directly used for this rule, but part of the interface)
   */
  public validateCommand(command: Command, commandNode: jsonc.Node, signalsInCommand: { signal: Signal, node: jsonc.Node }[], context: DocumentContext): LintResult[] | null {
    const results: LintResult[] = [];
    if (signalsInCommand.length < 2) {
      return null; // Not enough signals to overlap
    }

    const signalBitRanges: { signalId: string, start: number, end: number, node: jsonc.Node }[] = [];

    for (const { signal, node } of signalsInCommand) {
      if (!signal.fmt || typeof signal.fmt.len !== 'number') {
        continue; // Skip signals without proper format or length
      }
      const bix = signal.fmt.bix || 0;
      const len = signal.fmt.len;
      signalBitRanges.push({
        signalId: signal.id,
        start: bix,
        end: bix + len - 1,
        node: jsonc.findNodeAtLocation(node, ['fmt']) || node // Target fmt node or signal node
      });
    }

    // Check for overlaps
    for (let i = 0; i < signalBitRanges.length; i++) {
      for (let j = i + 1; j < signalBitRanges.length; j++) {
        const sigA = signalBitRanges[i];
        const sigB = signalBitRanges[j];

        // Check for overlap: (StartA <= EndB) and (EndA >= StartB)
        if (sigA.start <= sigB.end && sigA.end >= sigB.start) {
          const fmtA = jsonc.findNodeAtLocation(signalsInCommand.find(s => s.signal.id === sigA.signalId)!.node, ['fmt']);
          const fmtB = jsonc.findNodeAtLocation(signalsInCommand.find(s => s.signal.id === sigB.signalId)!.node, ['fmt']);

          results.push({
            ruleId: this.getConfig().id,
            message: `Signal '${sigA.signalId}' (bits ${sigA.start}-${sigA.end}) overlaps with signal '${sigB.signalId}' (bits ${sigB.start}-${sigB.end}) in the same command.`,
            // Report on the 'fmt' node of the first signal in the overlap pair, or the signal node itself
            node: fmtA || signalsInCommand.find(s => s.signal.id === sigA.signalId)!.node,
          });
          // Optionally, add a diagnostic for the second signal as well, or use relatedInformation
          // For simplicity, one diagnostic per pair is often sufficient.
        }
      }
    }

    return results.length > 0 ? results : null;
  }
}