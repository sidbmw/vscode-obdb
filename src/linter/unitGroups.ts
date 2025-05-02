/**
 * Groups of related units for easier linting
 */

/**
 * Temperature units
 */
export const TEMPERATURE_UNITS = [
  'celsius',
  'fahrenheit',
  'kelvin'
];

/**
 * Pressure units
 */
export const PRESSURE_UNITS = [
  'bars',
  'psi',
  'kilopascal'
];

/**
 * Distance units
 */
export const DISTANCE_UNITS = [
  'centimeters',
  'feet',
  'inches',
  'kilometers',
  'meters',
  'miles',
  'yards'
];

/**
 * Speed units
 */
export const SPEED_UNITS = [
  'kilometersPerHour',
  'metersPerSecond',
  'milesPerHour'
];

/**
 * Time units
 */
export const TIME_UNITS = [
  'seconds',
  'minutes',
  'hours'
];

/**
 * Electrical current units
 */
export const CURRENT_UNITS = [
  'amps',
  'kiloamps',
  'milliamps'
];

/**
 * Electrical voltage units
 */
export const VOLTAGE_UNITS = [
  'volts',
  'kilovolts',
  'millivolts'
];

/**
 * Electrical resistance units
 */
export const RESISTANCE_UNITS = [
  'ohms',
  'kiloohms',
  'megaohms',
  'milliohms',
  'microohms'
];

/**
 * Electrical power units
 */
export const POWER_UNITS = [
  'watts',
  'kilowatts',
  'milliwatts'
];

/**
 * Energy units
 */
export const ENERGY_UNITS = [
  'joules',
  'kilojoules',
  'kilowattHours',
  'wattHours'
];

/**
 * Battery charge units
 */
export const BATTERY_UNITS = [
  'ampereHours',
  'kiloampereHours',
  'milliampereHours',
  'coulombs'
];

/**
 * Frequency units
 */
export const FREQUENCY_UNITS = [
  'hertz',
  'kilohertz',
  'megahertz',
  'gigahertz',
  'terahertz',
  'millihertz',
  'microhertz',
  'nanohertz',
  'framesPerSecond',
  'rpm'
];

/**
 * Volume units
 */
export const VOLUME_UNITS = [
  'gallons',
  'liters'
];

/**
 * Torque units
 */
export const TORQUE_UNITS = [
  'newtonMeters',
  'poundFoot',
  'inchPound'
];

/**
 * Flow rate units
 */
export const FLOW_RATE_UNITS = [
  'gramsPerSecond',
  'kilogramsPerHour',
  'milligramsPerStroke'
];

/**
 * Angle units
 */
export const ANGLE_UNITS = [
  'degrees',
  'radians'
];

/**
 * Binary state units
 */
export const BINARY_STATE_UNITS = [
  'offon',
  'noyes',
  'yesno'
];

/**
 * Miscellaneous units
 */
export const MISC_UNITS = [
  'ascii',
  'gravity',
  'hex',
  'normal',
  'percent',
  'scalar',
  'unknown'
];

/**
 * Check if a unit belongs to a specific unit group
 * @param unit Unit to check
 * @param unitGroup Array of units in the group
 * @returns True if the unit belongs to the group
 */
export function isUnitInGroup(unit: string, unitGroup: string[]): boolean {
  return unitGroup.includes(unit);
}

/**
 * Check if a unit is a temperature unit
 * @param unit Unit to check
 * @returns True if the unit is a temperature unit
 */
export function isTemperatureUnit(unit: string): boolean {
  return isUnitInGroup(unit, TEMPERATURE_UNITS);
}

/**
 * Check if a unit is a pressure unit
 * @param unit Unit to check
 * @returns True if the unit is a pressure unit
 */
export function isPressureUnit(unit: string): boolean {
  return isUnitInGroup(unit, PRESSURE_UNITS);
}

/**
 * Check if a unit is a distance unit
 * @param unit Unit to check
 * @returns True if the unit is a distance unit
 */
export function isDistanceUnit(unit: string): boolean {
  return isUnitInGroup(unit, DISTANCE_UNITS);
}

/**
 * Check if a unit is a speed unit
 * @param unit Unit to check
 * @returns True if the unit is a speed unit
 */
export function isSpeedUnit(unit: string): boolean {
  return isUnitInGroup(unit, SPEED_UNITS);
}

/**
 * Check if a unit is a time unit
 * @param unit Unit to check
 * @returns True if the unit is a time unit
 */
export function isTimeUnit(unit: string): boolean {
  return isUnitInGroup(unit, TIME_UNITS);
}

/**
 * Check if a unit is an electrical current unit
 * @param unit Unit to check
 * @returns True if the unit is an electrical current unit
 */
export function isCurrentUnit(unit: string): boolean {
  return isUnitInGroup(unit, CURRENT_UNITS);
}

/**
 * Check if a unit is an electrical voltage unit
 * @param unit Unit to check
 * @returns True if the unit is an electrical voltage unit
 */
export function isVoltageUnit(unit: string): boolean {
  return isUnitInGroup(unit, VOLTAGE_UNITS);
}

/**
 * Check if a unit is an electrical resistance unit
 * @param unit Unit to check
 * @returns True if the unit is an electrical resistance unit
 */
export function isResistanceUnit(unit: string): boolean {
  return isUnitInGroup(unit, RESISTANCE_UNITS);
}

/**
 * Check if a unit is an electrical power unit
 * @param unit Unit to check
 * @returns True if the unit is an electrical power unit
 */
export function isPowerUnit(unit: string): boolean {
  return isUnitInGroup(unit, POWER_UNITS);
}

/**
 * Check if a unit is an energy unit
 * @param unit Unit to check
 * @returns True if the unit is an energy unit
 */
export function isEnergyUnit(unit: string): boolean {
  return isUnitInGroup(unit, ENERGY_UNITS);
}

/**
 * Check if a unit is a battery charge unit
 * @param unit Unit to check
 * @returns True if the unit is a battery charge unit
 */
export function isBatteryUnit(unit: string): boolean {
  return isUnitInGroup(unit, BATTERY_UNITS);
}

/**
 * Check if a unit is a frequency unit
 * @param unit Unit to check
 * @returns True if the unit is a frequency unit
 */
export function isFrequencyUnit(unit: string): boolean {
  return isUnitInGroup(unit, FREQUENCY_UNITS);
}

/**
 * Check if a unit is a volume unit
 * @param unit Unit to check
 * @returns True if the unit is a volume unit
 */
export function isVolumeUnit(unit: string): boolean {
  return isUnitInGroup(unit, VOLUME_UNITS);
}

/**
 * Check if a unit is a torque unit
 * @param unit Unit to check
 * @returns True if the unit is a torque unit
 */
export function isTorqueUnit(unit: string): boolean {
  return isUnitInGroup(unit, TORQUE_UNITS);
}

/**
 * Check if a unit is a flow rate unit
 * @param unit Unit to check
 * @returns True if the unit is a flow rate unit
 */
export function isFlowRateUnit(unit: string): boolean {
  return isUnitInGroup(unit, FLOW_RATE_UNITS);
}

/**
 * Check if a unit is an angle unit
 * @param unit Unit to check
 * @returns True if the unit is an angle unit
 */
export function isAngleUnit(unit: string): boolean {
  return isUnitInGroup(unit, ANGLE_UNITS);
}

/**
 * Check if a unit is a binary state unit
 * @param unit Unit to check
 * @returns True if the unit is a binary state unit
 */
export function isBinaryStateUnit(unit: string): boolean {
  return isUnitInGroup(unit, BINARY_STATE_UNITS);
}

/**
 * Get all unit groups as a map of group name to unit array
 * @returns Map of unit groups
 */
export function getAllUnitGroups(): Map<string, string[]> {
  const unitGroups = new Map<string, string[]>();

  unitGroups.set('temperature', TEMPERATURE_UNITS);
  unitGroups.set('pressure', PRESSURE_UNITS);
  unitGroups.set('distance', DISTANCE_UNITS);
  unitGroups.set('speed', SPEED_UNITS);
  unitGroups.set('time', TIME_UNITS);
  unitGroups.set('current', CURRENT_UNITS);
  unitGroups.set('voltage', VOLTAGE_UNITS);
  unitGroups.set('resistance', RESISTANCE_UNITS);
  unitGroups.set('power', POWER_UNITS);
  unitGroups.set('energy', ENERGY_UNITS);
  unitGroups.set('battery', BATTERY_UNITS);
  unitGroups.set('frequency', FREQUENCY_UNITS);
  unitGroups.set('volume', VOLUME_UNITS);
  unitGroups.set('torque', TORQUE_UNITS);
  unitGroups.set('flowRate', FLOW_RATE_UNITS);
  unitGroups.set('angle', ANGLE_UNITS);
  unitGroups.set('binaryState', BINARY_STATE_UNITS);
  unitGroups.set('misc', MISC_UNITS);

  return unitGroups;
}

/**
 * Get the group name for a unit
 * @param unit Unit to get the group for
 * @returns Group name or undefined if not found
 */
export function getUnitGroupName(unit: string): string | undefined {
  const unitGroups = getAllUnitGroups();

  for (const [groupName, units] of unitGroups.entries()) {
    if (units.includes(unit)) {
      return groupName;
    }
  }

  return undefined;
}
