import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';
import * as unitGroups from '../unitGroups';

/**
 * Rule that validates that signals with suggested metrics use appropriate units
 */
export class SuggestedMetricValidationRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'suggested-metric-validation',
      name: 'Suggested Metric Validation',
      description: 'Validate that signals with suggested metrics use appropriate units',
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
    if (!signal.suggestedMetric) {
      return null;
    }

    // Get nodes
    const suggestedMetricNode = jsonc.findNodeAtLocation(node, ['suggestedMetric']);
    const fmtNode = jsonc.findNodeAtLocation(node, ['fmt']);
    if (!suggestedMetricNode || !fmtNode) return null;

    const unitNode = jsonc.findNodeAtLocation(fmtNode, ['unit']);
    if (!unitNode) return null;

    const unit = jsonc.getNodeValue(unitNode);
    let expectedUnitGroup: string[] | undefined;

    // Match suggested metrics to their expected units
    switch (signal.suggestedMetric) {
      case 'odometer':
      case 'electricRange':
      case 'fuelRange':
        expectedUnitGroup = unitGroups.DISTANCE_UNITS;
        break;
      case 'frontLeftTirePressure':
      case 'frontRightTirePressure':
      case 'rearLeftTirePressure':
      case 'rearRightTirePressure':
        expectedUnitGroup = unitGroups.PRESSURE_UNITS;
        break;
      case 'speed':
        expectedUnitGroup = unitGroups.SPEED_UNITS;
        break;
      case 'starterBatteryVoltage':
        expectedUnitGroup = unitGroups.VOLTAGE_UNITS;
        break;
      case 'fuelTankLevel':
      case 'stateOfCharge':
      case 'stateOfHealth':
        expectedUnitGroup = ['percent', 'liters', 'gallons'];
        break;
      case 'isCharging':
      case 'pluggedIn':
        expectedUnitGroup = unitGroups.BINARY_STATE_UNITS;
        break;
    }

    // Check against expected unit group
    if (expectedUnitGroup && !expectedUnitGroup.includes(unit)) {
      return {
        ruleId: this.getConfig().id,
        message: `Signals with suggestedMetric "${signal.suggestedMetric}" should use one of these units: ${expectedUnitGroup.join(', ')}. Found: "${unit}"`,
        node: unitNode
      };
    }

    return null;
  }
}