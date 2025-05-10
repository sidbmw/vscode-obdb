import * as jsonc from 'jsonc-parser';
import { ILinterRule, LinterRuleConfig, LintResult, LintSeverity, Signal, DocumentContext, SignalGroup } from './rule';

// Common automotive acronyms that should not start a signal name
const COMMON_ACRONYMS = [
  'ABS', // Anti-lock Braking System
  'BMS', // Battery Management System
  'ECU', // Electronic Control Unit
  'PCM', // Powertrain Control Module
  'TCM', // Transmission Control Module
  'EPS', // Electric Power Steering
  'HVAC', // Heating, Ventilation, and Air Conditioning
  'TPMS', // Tire Pressure Monitoring System
  // Add more acronyms as needed
];

export class AcronymAtStartOfSignalNameRule implements ILinterRule {
  private config: LinterRuleConfig = {
    id: 'acronym-at-start-of-signal-name',
    name: 'Acronym at Start of Signal Name',
    description: 'Signal names should not start with common automotive acronyms.',
    severity: LintSeverity.Warning,
    enabled: true,
  };

  getConfig(): LinterRuleConfig {
    return this.config;
  }

  /**
   * Validates a signal against this rule
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  public validateSignal(signal: Signal, node: jsonc.Node): LintResult | null {
    // Get the name node to target in diagnostic
    const signalName = signal.name;
    const nameNode = jsonc.findNodeAtLocation(node, ['name']);

    if (!nameNode) {
      return null; // Should not happen if signal.name exists
    }

    for (const acronym of COMMON_ACRONYMS) {
      if (signalName.toUpperCase().startsWith(acronym + ' ') || signalName.toUpperCase().startsWith(acronym + '_') || signalName.toUpperCase() === acronym) {
        return {
          ruleId: this.config.id,
          message: `Signal name '${signalName}' starts with an acronym '${acronym}'. Use the path property to organize signals. Consider removing the acronym or rephrasing the name.`,
          node: nameNode,
        };
      }
    }

    return null;
  }
}
