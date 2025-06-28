import * as jsonc from 'jsonc-parser';
import { ILinterRule, LinterRuleConfig, LintResult, LintSeverity, Signal, SignalGroup } from './rule';

// Common automotive acronyms that should not start a signal name
const COMMON_ACRONYMS = [
  'ABS', // Anti-lock Braking System
  'ACC', // Adaptive Cruise Control
  'ACM', // Audio Control Module
  'ACU', // Airbag Control Unit
  'ADAS', // Advanced Driver Assistance Systems
  'AFR', // Air-Fuel Ratio
  'ATF', // Automatic Transmission Fluid
  'BCM', // Body Control Module
  'BMS', // Battery Management System
  'CAN', // Controller Area Network
  'CCM', // Climate Control Module
  'CDI', // Capacitor Discharge Ignition
  'CVT', // Continuously Variable Transmission
  'DPF', // Diesel Particulate Filter
  'DSC', // Dynamic Stability Control
  'ECM', // Engine Control Module
  'ECU', // Electronic Control Unit
  'EGR', // Exhaust Gas Recirculation
  'EPS', // Electric Power Steering
  'ESC', // Electronic Stability Control
  'ESP', // Electronic Stability Program
  'ETC', // Electronic Throttle Control
  'GPS', // Global Positioning System
  'HVAC', // Heating, Ventilation, and Air Conditioning
  'ICE', // Internal Combustion Engine
  'ICM', // Ignition Control Module
  'IMA', // Integrated Motor Assist
  'IMMO', // Immobilizer
  'IPC', // Instrument Panel Cluster
  'LCA', // Lane Change Assist
  'LKA', // Lane Keep Assist
  'MAF', // Mass Air Flow
  'MAP', // Manifold Absolute Pressure
  'OBD', // On-Board Diagnostics
  'OCS', // Occupant Classification System
  'PCM', // Powertrain Control Module
  'PDC', // Park Distance Control
  'RCM', // Restraint Control Module
  'SAS', // Steering Angle Sensor
  'SRS', // Supplemental Restraint System
  'TCM', // Transmission Control Module
  'TCS', // Traction Control System
  'TPS', // Throttle Position Sensor
  'TPMS', // Tire Pressure Monitoring System
  'VIN', // Vehicle Identification Number
  'VSC', // Vehicle Stability Control
  'VVT', // Variable Valve Timing
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
