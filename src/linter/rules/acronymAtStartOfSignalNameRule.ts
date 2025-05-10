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

  validate(target: Signal | SignalGroup, node: jsonc.Node, context: DocumentContext): LintResult | null {
    // This rule only applies to Signals, not SignalGroups
    if (!('name' in target) || !target.name) {
      return null;
    }

    const signalName = target.name;
    const nameNode = jsonc.findNodeAtLocation(node, ['name']);

    if (!nameNode) {
      return null; // Should not happen if target.name exists
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
