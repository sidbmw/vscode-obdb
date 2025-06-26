import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

// Use require for levenshtein distance calculation
const levenshtein = require('fast-levenshtein');

/**
 * Rule that checks for common typos in signal names using a combination of
 * known typos and similarity matching against automotive vocabulary
 */
export class SignalNameTypoRule implements ILinterRule {

  // Automotive domain-specific words (correct spellings)
  private readonly automotiveWords: string[] = [
    'battery', 'voltage', 'current', 'temperature', 'sensor', 'engine', 'throttle',
    'brake', 'fuel', 'hybrid', 'electric', 'transmission', 'pressure', 'level',
    'position', 'status', 'control', 'system', 'signal', 'speed', 'torque',
    'rpm', 'coolant', 'intake', 'exhaust', 'ignition', 'catalyst', 'oxygen',
    'lambda', 'manifold', 'injector', 'pump', 'valve', 'solenoid', 'actuator',
    'clutch', 'differential', 'steering', 'suspension', 'airbag', 'seatbelt',
    'abs', 'esp', 'traction', 'stability', 'cruise', 'parking', 'reverse',
    'neutral', 'drive', 'gear', 'shift', 'manual', 'automatic', 'cvt',
    'turbo', 'supercharger', 'intercooler', 'radiator', 'thermostat',
    'alternator', 'starter', 'generator', 'inverter', 'converter', 'charger',
    'diagnostic', 'trouble', 'fault', 'error', 'warning', 'indicator',
    'dashboard', 'gauge', 'meter', 'display', 'led', 'bulb', 'lamp',
    'switch', 'button', 'pedal', 'lever', 'knob', 'dial', 'selector',
    'minimum', 'maximum', 'average', 'actual', 'target', 'requested',
    'available', 'enabled', 'disabled', 'active', 'inactive', 'ready'
  ];

  // Known common typos and their corrections
  private readonly commonTypos: Map<string, string> = new Map([
    // Battery typos
    ['batttery', 'battery'],
    ['battrey', 'battery'],
    ['baterry', 'battery'],
    ['batery', 'battery'],

    // Temperature typos
    ['temperatur', 'temperature'],
    ['temprature', 'temperature'],
    ['tempature', 'temperature'],
    ['temerature', 'temperature'],

    // Voltage typos
    ['voltge', 'voltage'],
    ['volatge', 'voltage'],
    ['vltage', 'voltage'],

    // Current typos
    ['curent', 'current'],
    ['currnt', 'current'],
    ['currant', 'current'],

    // Sensor typos
    ['senser', 'sensor'],
    ['sensr', 'sensor'],
    ['sensro', 'sensor'],

    // Engine typos
    ['engin', 'engine'],
    ['engien', 'engine'],
    ['engne', 'engine'],

    // Throttle typos
    ['throttel', 'throttle'],
    ['throtle', 'throttle'],
    ['throtlle', 'throttle'],

    // Brake typos
    ['brak', 'brake'],
    ['breake', 'brake'],
    ['braek', 'brake'],

    // Fuel typos
    ['feul', 'fuel'],
    ['fule', 'fuel'],
    ['fuell', 'fuel'],

    // Hybrid typos
    ['hybrd', 'hybrid'],
    ['hybird', 'hybrid'],
    ['hybridd', 'hybrid'],

    // Electric typos
    ['electrc', 'electric'],
    ['elecric', 'electric'],
    ['eletric', 'electric'],

    // Transmission typos
    ['transmision', 'transmission'],
    ['transmissio', 'transmission'],
    ['tranmission', 'transmission'],

    // Pressure typos
    ['presure', 'pressure'],
    ['pressue', 'pressure'],
    ['pressuure', 'pressure'],

    // Level typos
    ['levl', 'level'],
    ['lvel', 'level'],
    ['levle', 'level'],

    // Position typos
    ['postion', 'position'],
    ['positon', 'position'],
    ['positsion', 'position'],

    // Status typos
    ['staus', 'status'],
    ['satatus', 'status'],
    ['statsu', 'status'],

    // Control typos
    ['contrl', 'control'],
    ['controol', 'control'],
    ['controler', 'controller'],

    // System typos
    ['systm', 'system'],
    ['sytem', 'system'],
    ['systme', 'system'],

    // Signal typos
    ['singal', 'signal'],
    ['signel', 'signal'],
    ['signl', 'signal'],

    // Speed typos
    ['spead', 'speed'],
    ['speeed', 'speed'],
    ['sped', 'speed'],

    // Min/max typos
    ['minimun', 'minimum'],
    ['minumum', 'minimum'],
    ['minimm', 'minimum'],
    ['maximun', 'maximum'],
    ['maxium', 'maximum'],
    ['maximm', 'maximum'],

    // Available typos
    ['availabe', 'available'],
    ['availible', 'available'],
    ['avaialble', 'available']
  ]);

  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'signal-name-typo',
      name: 'Signal Name Typo Detection',
      description: 'Detects common typos in signal names and suggests corrections',
      severity: LintSeverity.Warning,
      enabled: true,
    };
  }  /**
   * Validates a signal against this rule
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  public validateSignal(signal: Signal, node: jsonc.Node): LintResult | null {
    if (!signal.name) {
      return null;
    }

    // Find the name property node
    const nameNode = jsonc.findNodeAtLocation(node, ['name']);
    if (!nameNode) return null;

    // Check for typos in the signal name
    const typoResult = this.findTyposInText(signal.name);

    if (typoResult.length > 0) {
      const firstTypo = typoResult[0];
      const correctedName = this.applyCorrectionToText(signal.name, firstTypo.typo, firstTypo.correction);

      return {
        ruleId: this.getConfig().id,
        message: `Possible typo in signal name: "${firstTypo.typo}" should be "${firstTypo.correction}"`,
        node: nameNode,
        suggestion: {
          title: `Fix typo: "${firstTypo.typo}" → "${firstTypo.correction}"`,
          edits: [{
            newText: `"${correctedName}"`,
            offset: nameNode.offset,
            length: nameNode.length
          }]
        }
      };
    }

    return null;
  }

  /**
   * Finds typos in the given text
   * @param text The text to check for typos
   * @returns Array of found typos with their corrections
   */
  private findTyposInText(text: string): Array<{ typo: string; correction: string }> {
    const foundTypos: Array<{ typo: string; correction: string }> = [];

    // Split text into words and check each one
    const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];

    for (const word of words) {
      const correction = this.findCorrection(word);
      if (correction) {
        foundTypos.push({ typo: word, correction });
      }
    }

    return foundTypos;
  }

  /**
   * Find correction for a potentially misspelled word
   * @param word The word to check
   * @returns The correction if found, null otherwise
   */
  private findCorrection(word: string): string | null {
    const lowerWord = word.toLowerCase();

    // First check known typos
    if (this.commonTypos.has(lowerWord)) {
      return this.commonTypos.get(lowerWord)!;
    }

    // If it's a known correct automotive word, no correction needed
    if (this.automotiveWords.includes(lowerWord)) {
      return null;
    }

    // Use Levenshtein distance to find similar automotive words
    // Only suggest if the word is close enough and not too short
    if (lowerWord.length >= 4) {
      const candidates = this.automotiveWords
        .map(candidate => ({
          word: candidate,
          distance: levenshtein.get(lowerWord, candidate)
        }))
        .filter(candidate => {
          // More lenient for longer words
          const maxDistance = candidate.word.length > 6 ? 2 : 1;
          return candidate.distance <= maxDistance && candidate.distance > 0;
        })
        .sort((a, b) => a.distance - b.distance);

      if (candidates.length > 0) {
        return candidates[0].word;
      }
    }

    return null;
  }

  /**
   * Applies a single correction to text while preserving case
   * @param text The original text
   * @param typo The typo to replace
   * @param correction The correction to apply
   * @returns The corrected text
   */
  private applyCorrectionToText(text: string, typo: string, correction: string): string {
    // Create a regex that matches the typo with word boundaries
    const regex = new RegExp(`\\b${typo}\\b`, 'gi');

    return text.replace(regex, (match) => {
      // Preserve the case of the original match
      return this.preserveCase(match, correction);
    });
  }

  /**
   * Preserves the case pattern of the original word when applying correction
   * @param original The original word (potentially with typo)
   * @param correction The correction to apply
   * @returns The correction with case preserved
   */
  private preserveCase(original: string, correction: string): string {
    // If original is all uppercase, make correction uppercase
    if (original === original.toUpperCase()) {
      return correction.toUpperCase();
    }

    // If original starts with uppercase, capitalize correction
    if (original[0] === original[0].toUpperCase()) {
      return correction.charAt(0).toUpperCase() + correction.slice(1).toLowerCase();
    }

    // Otherwise, return correction in lowercase
    return correction.toLowerCase();
  }
}
