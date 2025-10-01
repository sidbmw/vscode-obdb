import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { generateCommandIdFromDefinition, ID_PROPERTY_DIVIDER } from './commandParser';
import { Generation, getGenerations } from './generations';

/**
 * Loads YAML content with ECU keys forced to strings
 */
function loadCommandSupportYaml(content: string): any {
  // Simple regex-based approach to quote ECU keys that look like hex/numeric
  const processedContent = content.replace(
    /^(\s+)([0-9A-Fa-f]{2,3}):\s*$/gm,
    '$1"$2":'
  );

  try {
    return yaml.load(processedContent);
  } catch (error) {
    // Fallback to original content if preprocessing causes issues
    console.warn('Preprocessed YAML failed, falling back to original:', error);
    return yaml.load(content);
  }
}

/**
 * Strips the receive filter (middle part) from a command ID if present
 * @param commandId The command ID in format "header.response.command" or "header.command"
 * @returns Simplified command ID in format "header.command"
 */
export function stripReceiveFilter(commandId: string): string {
  const parts = commandId.split('.');
  // If we have 3 parts (header.response.command), take first and last
  if (parts.length === 3) {
    return `${parts[0]}.${parts[2]}`;
  }
  // Otherwise return original
  return commandId;
}

/**
 * Normalizes a command ID by removing any signal information after `:`
 * @param commandId The command ID to normalize (e.g. 'DA0E.222612:TLX_GEAR_V2')
 * @returns Normalized command ID without signal information or additional properties
 */
export function normalizeCommandId(commandId: string): string {
  // Remove everything after ':' (signal info)
  return commandId.split(/[:]/)[0];
}

/**
 * Generates a normalized command ID from a command definition object
 * @param command The command object
 * @returns Generated and normalized command ID
 */
export function generateNormalizedCommandId(command: any): string {
  const fullId = generateCommandIdFromDefinition(command);
  return normalizeCommandId(fullId);
}

/**
 * Gets all model years that explicitly list a command as unsupported
 * @param commandId The command ID to check (e.g. '7E0.2211BA')
 * @param workspaceRoot The workspace folder root path
 * @returns Array of model years where the command is explicitly unsupported
 */
export async function getUnsupportedModelYearsForCommand(commandId: string, workspaceRoot: string): Promise<string[]> {
  const testCasesPath = path.join(workspaceRoot, 'tests', 'test_cases');
  const unsupportedYears: string[] = [];

  try {
    const years = await fs.promises.readdir(testCasesPath);
    for (const year of years) {
      const yearPath = path.join(testCasesPath, year);
      try {
        const yearStat = await fs.promises.stat(yearPath);
        if (!yearStat.isDirectory()) {
          continue;
        }

        const supportFilePath = path.join(yearPath, 'command_support.yaml');
        try {
          const content = await fs.promises.readFile(supportFilePath, 'utf-8');
          const yamlContent = loadCommandSupportYaml(content);

          if (yamlContent && yamlContent.unsupported_commands_by_ecu) {
            const unsupportedCommands = Object.values(yamlContent.unsupported_commands_by_ecu as Record<string, string[]>)
              .flat() as string[];

            // Normalize the input command ID
            const normalizedCommandId = normalizeCommandId(commandId);
            const normalizedStripFilter = normalizeCommandId(stripReceiveFilter(commandId));

            // Check if any unsupported command matches when normalized
            const isUnsupported = unsupportedCommands.some(cmd => {
              const normalizedCmd = normalizeCommandId(cmd);
              return normalizedCmd === normalizedCommandId || normalizedCmd === normalizedStripFilter;
            });

            if (isUnsupported) {
              unsupportedYears.push(year);
            }
          }
        } catch (err) {
          console.error(`Error reading or parsing command support file for year ${year}:`, err);
          // It's ok if the support file doesn't exist or fails to parse
        }
      } catch (statErr) {
        console.error(`Error stating path for year ${year}:`, statErr);
        // Error stating the year path, skip
      }
    }
  } catch (err) {
    console.error(`Error finding unsupported model years for ${commandId}:`, err);
  }

  return unsupportedYears;
}

/**
 * Gets all model years that support a specific command
 * @param commandId The command ID to check (e.g. '7E0.2211BA')
 * @param workspaceRoot The workspace folder root path
 * @returns Array of model years that support the command
 */
export async function getSupportedModelYearsForCommand(commandId: string, workspaceRoot: string): Promise<string[]> {
  const cmdPart = commandId.split('.').pop() || '';
  const testCasesPath = path.join(workspaceRoot, 'tests', 'test_cases');
  const supportedYears: string[] = [];

  try {
    const years = await fs.promises.readdir(testCasesPath);
    for (const year of years) {
      const yearPath = path.join(testCasesPath, year);
      try {
        const yearStat = await fs.promises.stat(yearPath);
        if (!yearStat.isDirectory()) {
          continue;
        }

        let foundInYear = false;
        const commandsDir = path.join(yearPath, 'commands');
        try {
          const commandsDirStat = await fs.promises.stat(commandsDir);
          if (commandsDirStat.isDirectory()) {
            const commandFiles = await fs.promises.readdir(commandsDir);
            for (const file of commandFiles) {
              if (file.includes(cmdPart) || file.includes(commandId)) {
                supportedYears.push(year);
                foundInYear = true;
                break;
              }
            }
          }
        } catch (err) {
          // It's ok if there's no commands directory
        }

        if (!foundInYear) {
          const supportFilePath = path.join(yearPath, 'command_support.yaml');
          try {
            const content = await fs.promises.readFile(supportFilePath, 'utf-8');
            const yamlContent = loadCommandSupportYaml(content);

            if (yamlContent && yamlContent.supported_commands_by_ecu) {
              for (const ecuCommands of Object.values(yamlContent.supported_commands_by_ecu as Record<string, string[]>)) {
                for (const cmd of ecuCommands as string[]) {
                  // Use the normalizeCommandId helper to get just the command part
                  const normalizedCmd = normalizeCommandId(cmd);
                  const ecu = Object.keys(yamlContent.supported_commands_by_ecu).find(key => yamlContent.supported_commands_by_ecu[key] === ecuCommands);

                  if (normalizedCmd === cmdPart || (ecu && `${ecu}.${normalizedCmd}` === commandId) || normalizedCmd.includes(cmdPart)) {
                    supportedYears.push(year);
                    foundInYear = true;
                    break;
                  }
                }
                if (foundInYear) break;
              }
            }
          } catch (err) {
            // It's ok if the support file doesn't exist or fails to parse
          }
        }
      } catch (statErr) {
        // Error stating the year path, skip
      }
    }
  } catch (err) {
    console.error(`Error finding supported model years for ${commandId}:`, err);
  }

  return supportedYears;
}

/**
 * Interface for debug filter suggestion
 */
export interface DebugFilter {
  to?: number;
  from?: number;
  years?: number[];
}

/**
 * Generates a debug filter suggestion based on vehicle generation and command support
 * @param supportedYears Array of years the command is known to be supported
 * @param vehicleGeneration The vehicle's generation information
 * @returns Debug filter object or null if no filter is needed
 */
export async function generateDebugFilterSuggestion(
  supportedYears: string[],
  vehicleGeneration: Generation | null
): Promise<DebugFilter | null> {
  if (!vehicleGeneration || supportedYears.length === 0) {
    return null;
  }

  const supportedYearNumbers = supportedYears.map(year => parseInt(year, 10)).filter(year => !isNaN(year));
  if (supportedYearNumbers.length === 0) {
    return null;
  }

  const genStart = vehicleGeneration.start_year;
  const genEnd = vehicleGeneration.end_year || new Date().getFullYear() + 5; // Use current year + 5 if no end year

  // Generate the full range of generation years
  const generationYears: number[] = [];
  for (let year = genStart; year <= genEnd; year++) {
    generationYears.push(year);
  }

  // Find unsupported years within the generation range
  const unsupportedYears = generationYears.filter(year => !supportedYearNumbers.includes(year));

  if (unsupportedYears.length === 0) {
    return null; // No filter needed if all years are supported
  }

  const filter: DebugFilter = {};

  // Check for consecutive ranges at the beginning (to)
  let toYear: number | undefined;
  for (let i = 0; i < unsupportedYears.length; i++) {
    if (unsupportedYears[i] === genStart + i) {
      toYear = unsupportedYears[i];
    } else {
      break;
    }
  }

  // Check for consecutive ranges at the end (from)
  let fromYear: number | undefined;
  for (let i = unsupportedYears.length - 1; i >= 0; i--) {
    const expectedYear = genEnd - (unsupportedYears.length - 1 - i);
    if (unsupportedYears[i] === expectedYear) {
      fromYear = unsupportedYears[i];
    } else {
      break;
    }
  }

  // Individual years that don't fit into ranges
  const individualYears = unsupportedYears.filter(year => {
    const isInToRange = toYear !== undefined && year <= toYear;
    const isInFromRange = fromYear !== undefined && year >= fromYear;
    return !isInToRange && !isInFromRange;
  });

  if (toYear !== undefined) {
    filter.to = toYear;
  }

  if (fromYear !== undefined) {
    filter.from = fromYear;
  }

  if (individualYears.length > 0) {
    filter.years = individualYears;
  }

  // Return null if the filter would be empty
  if (Object.keys(filter).length === 0) {
    return null;
  }

  return filter;
}
