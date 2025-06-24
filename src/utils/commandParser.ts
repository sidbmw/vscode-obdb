import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Command, CommandPositionResult, Signal, Filter } from '../types';

/**
 * Checks if a position in a document is inside a command definition
 * @param document The text document to check
 * @param position The position within the document
 * @returns An object indicating if the position is in a command and command details
 */
export function isPositionInCommand(document: vscode.TextDocument, position: vscode.Position): CommandPositionResult {
  try {
    // Parse the JSON document
    const content = document.getText();
    let jsonDoc;

    try {
      jsonDoc = JSON.parse(content);
    } catch (err) {
      console.error("Error parsing JSON:", err);
      return { isCommand: false };
    }

    // First, check if this document has a commands array
    if (jsonDoc.commands && Array.isArray(jsonDoc.commands)) {
      // We need to determine which command the cursor is in based on position in the file
      // This requires finding the actual text ranges of each command in the file

      // Find all command object start positions (open curly braces)
      const commandStartRegex = /\{\s*"hdr"/g;
      const commandBoundaries: { start: number, end: number, command: Command }[] = [];

      let match;
      let index = 0;

      // Find all potential command start positions
      while ((match = commandStartRegex.exec(content)) !== null) {
        const startPos = match.index;

        // This is the start of a command object
        // Now find its end by tracking braces
        let braceCount = 1;
        let endPos = startPos + 1;

        while (braceCount > 0 && endPos < content.length) {
          if (content[endPos] === '{') braceCount++;
          if (content[endPos] === '}') braceCount--;
          endPos++;
        }

        // If we found a matching command object, store its boundaries
        if (braceCount === 0 && index < jsonDoc.commands.length) {
          commandBoundaries.push({
            start: startPos,
            end: endPos,
            command: jsonDoc.commands[index]
          });
          index++;
        }
      }

      // Now check if our position is within any of these command ranges
      const offset = document.offsetAt(position);

      for (const boundary of commandBoundaries) {
        if (offset >= boundary.start && offset <= boundary.end) {
          // Found the command we're hovering over
          const command = boundary.command;

          // Normalize the command structure for visualization
          const normalizedCommand: Command = { ...command };

          // If command has signals but not parameters, convert signals to parameters
          if (normalizedCommand.signals && !normalizedCommand.parameters) {
            normalizedCommand.parameters = normalizeSignals(normalizedCommand.signals);
          }

          return {
            isCommand: true,
            commandObject: normalizedCommand,
            range: new vscode.Range(
              document.positionAt(boundary.start),
              document.positionAt(boundary.end)
            )
          };
        }
      }
    }

    // Single command case - check if the document itself is a command
    if ((jsonDoc.parameters && Array.isArray(jsonDoc.parameters)) ||
        (jsonDoc.signals && Array.isArray(jsonDoc.signals))) {

      // Normalize command structure to have parameters
      const commandObj: Command = { ...jsonDoc };

      // If the command has signals but not parameters, convert signals to parameters
      if (commandObj.signals && !commandObj.parameters) {
        commandObj.parameters = normalizeSignals(commandObj.signals);
      }

      // This appears to be a command object
      return { isCommand: true, commandObject: commandObj };
    }
  } catch (err) {
    console.error("Error checking if position is in command:", err);
  }

  return { isCommand: false };
}

/**
 * Normalizes signal objects from the command to a standard format
 * @param signals Array of signal objects to normalize
 * @returns Array of normalized signal objects
 */
function normalizeSignals(signals: any[]): Signal[] {
  return signals.map((signal: any) => {
    // Extract bitOffset and bitLength from fmt if available
    const bitOffset = signal.fmt?.bix ?? 0;
    const bitLength = signal.fmt?.len ?? 8;

    return {
      id: signal.id || 'unknown',
      name: signal.name || signal.id || 'Unknown',
      suggestedMetric: signal.suggestedMetric,
      bitOffset,
      bitLength
    };
  });
}

/**
 * Fetches sample responses for a command from test case files
 * @param commandId The command ID to search for (e.g. '7E0.22295A')
 * @returns Array of objects containing model year and sample response data
 */
export async function getSampleCommandResponses(commandId: string): Promise<Array<{modelYear: string, response: string, expectedValues?: Record<string, any>}>> {
  if (!commandId) return [];

  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return [];

    const rootPath = workspaceFolders[0].uri.fsPath;
    const testCasesPath = path.join(rootPath, 'tests', 'test_cases');

    // Check if the test_cases directory exists
    if (!fs.existsSync(testCasesPath)) return [];

    const samples: Array<{modelYear: string, response: string, expectedValues?: Record<string, any>}> = [];
    const modelYearDirs = fs.readdirSync(testCasesPath)
      .filter(dir => /^\d{4}$/.test(dir))  // Only include directories that are 4 digit years
      .sort();  // Sort by year

    // Find command files for this commandId across model years
    for (const yearDir of modelYearDirs) {
      const yearPath = path.join(testCasesPath, yearDir);
      const commandsDir = path.join(yearPath, 'commands');

      if (fs.existsSync(commandsDir)) {
        // Look for a command file with the matching ID
        const [canHeader, cmd] = commandId.split('.');
        const commandFile = path.join(commandsDir, `${commandId}.yaml`);

        if (fs.existsSync(commandFile)) {
          try {
            const content = fs.readFileSync(commandFile, 'utf8');
            const data = yaml.load(content) as any;

            if (data && Array.isArray(data.test_cases) && data.test_cases.length > 0) {
              // Only take the first response from each model year
              const firstCase = data.test_cases[0];
              samples.push({
                modelYear: yearDir,
                response: firstCase.response,
                expectedValues: firstCase.expected_values
              });
            }
          } catch (err) {
            console.error(`Error reading command file ${commandFile}:`, err);
          }
        }
      }
    }

    return samples;
  } catch (error) {
    console.error('Error fetching sample command responses:', error);
    return [];
  }
}

/**
 * Car protocol strategy enum
 */
export enum CarProtocolStrategy {
  iso15765_4_11bit = 'iso15765_4_11bit',
  iso15765_4_29bit = 'iso15765_4_29bit',
  iso9141_2 = 'iso9141_2'
}

/**
 * Parameter interface for command parameters
 */
export interface Parameter {
  asMessage: string;
}

/**
 * The property divider used in command IDs
 */
export const ID_PROPERTY_DIVIDER = '|';

/**
 * Creates a command ID from a command definition.
 * @param headerAsString The header as a string
 * @param receiveAddressAsString Optional receive address as string
 * @param parameter The parameter object with asMessage property
 * @param filter Optional filter object
 * @param timeout Optional timeout value
 * @param extendedAddress Optional extended address
 * @param testerAddress Optional tester address
 * @param forceFlowControlResponse Whether to force flow control response
 * @param carProtocolStrategy Optional car protocol strategy
 * @param canPriority Optional CAN priority
 * @returns The generated command ID
 */
export function createCommandID(
  headerAsString: string,
  receiveAddressAsString?: string,
  parameter?: Parameter,
  filter?: Filter,
  timeout?: number,
  extendedAddress?: number,
  testerAddress?: number,
  forceFlowControlResponse: boolean = false,
  carProtocolStrategy?: CarProtocolStrategy,
  canPriority?: number
): string {
  let id = headerAsString + '.';

  if (receiveAddressAsString) {
    id += receiveAddressAsString + '.';
  }

  if (parameter) {
    id += parameter.asMessage;
  }

  // Add additional properties in a compact format
  const propertiesString = formatPropertiesForID(
    filter,
    timeout,
    extendedAddress,
    testerAddress,
    forceFlowControlResponse,
    carProtocolStrategy,
    canPriority
  );

  if (propertiesString.length > 0) {
    id += ID_PROPERTY_DIVIDER + propertiesString;
  }

  return id;
}

/**
 * Formats additional properties for the command ID
 * @param filter Optional filter object
 * @param timeout Optional timeout value
 * @param extendedAddress Optional extended address
 * @param testerAddress Optional tester address
 * @param forceFlowControlResponse Whether to force flow control response
 * @param carProtocolStrategy Optional car protocol strategy
 * @param canPriority Optional CAN priority
 * @returns Formatted properties string
 */
function formatPropertiesForID(
  filter?: Filter,
  timeout?: number,
  extendedAddress?: number,
  testerAddress?: number,
  forceFlowControlResponse: boolean = false,
  carProtocolStrategy?: CarProtocolStrategy,
  canPriority?: number
): string {
  const parts: string[] = [];

  if (timeout !== undefined) {
    parts.push(`t=${timeout.toString(16).toUpperCase().padStart(2, '0')}`);
  }

  if (extendedAddress !== undefined) {
    parts.push(`e=${extendedAddress.toString(16).toUpperCase().padStart(2, '0')}`);
  }

  if (testerAddress !== undefined) {
    parts.push(`ta=${testerAddress.toString(16).toUpperCase().padStart(2, '0')}`);
  }

  if (forceFlowControlResponse) {
    parts.push('fc=1');
  }

  if (carProtocolStrategy === CarProtocolStrategy.iso9141_2) {
    parts.push('p=9141-2');
  }

  if (canPriority !== undefined) {
    parts.push(`c=${canPriority.toString(16).toUpperCase().padStart(2, '0')}`);
  }

  if (filter) {
    parts.push('f=' + filterToIDString(filter));
  }

  return parts.join(',');
}

/**
 * Formats header value as string based on protocol strategy and value
 * @param header The header value
 * @param carProtocolStrategy Optional car protocol strategy
 * @returns Formatted header string
 */
function formatHeaderAsString(header: number, carProtocolStrategy?: CarProtocolStrategy): string {
  if (carProtocolStrategy === CarProtocolStrategy.iso15765_4_11bit) {
    return header.toString(16).toUpperCase().padStart(3, '0');
  } else if (carProtocolStrategy === CarProtocolStrategy.iso15765_4_29bit) {
    return header.toString(16).toUpperCase().padStart(4, '0');
  } else if (carProtocolStrategy === CarProtocolStrategy.iso9141_2) {
    return header.toString(16).toUpperCase().padStart(4, '0');
  } else if (header <= 0xFFF) {
    return header.toString(16).toUpperCase().padStart(3, '0');
  } else {
    return header.toString(16).toUpperCase().padStart(4, '0');
  }
}

/**
 * Formats receive address as string based on protocol strategy and mask
 * @param receiveAddress The receive address value
 * @param receiveMask The receive mask value
 * @param carProtocolStrategy Optional car protocol strategy
 * @returns Formatted receive address string or undefined
 */
function formatReceiveAddressAsString(
  receiveAddress?: number,
  receiveMask?: number,
  carProtocolStrategy?: CarProtocolStrategy
): string | undefined {
  if (receiveAddress === undefined) {
    return undefined;
  }

  if (carProtocolStrategy === CarProtocolStrategy.iso15765_4_11bit) {
    return receiveAddress.toString(16).toUpperCase().padStart(3, '0');
  } else if (carProtocolStrategy === CarProtocolStrategy.iso15765_4_29bit) {
    if ((receiveMask || 0) <= 0xFF) {
      return receiveAddress.toString(16).toUpperCase().padStart(2, '0');
    } else if ((receiveMask || 0) <= 0xFFFF) {
      return receiveAddress.toString(16).toUpperCase().padStart(4, '0');
    } else {
      return receiveAddress.toString(16).toUpperCase().padStart(6, '0');
    }
  } else if (carProtocolStrategy === CarProtocolStrategy.iso9141_2) {
    return receiveAddress.toString(16).toUpperCase().padStart(2, '0');
  } else if ((receiveMask || 0) <= 0xFF) {
    return receiveAddress.toString(16).toUpperCase().padStart(2, '0');
  } else if ((receiveMask || 0) <= 0xFFF) {
    return receiveAddress.toString(16).toUpperCase().padStart(3, '0');
  } else {
    return receiveAddress.toString(16).toUpperCase().padStart(4, '0');
  }
}

/**
 * Generates a command ID from a command definition object using the correct coding keys
 * @param command The command object
 * @returns Generated command ID string
 */
export function generateCommandIdFromDefinition(command: any): string {
  // Extract header - convert to number if it's a string
  const headerValue = typeof command.hdr === 'string'
    ? parseInt(command.hdr, 16)
    : (command.hdr || 0x7E0);

  // Extract receive address
  const receiveAddress = command.rax;
  const receiveMask = command.receive?.mask || command.receiveAddressMask;

  // Extract car protocol strategy
  const carProtocolStrategy = command.proto as CarProtocolStrategy;

  // Format header and receive address
  const headerAsString = formatHeaderAsString(headerValue, carProtocolStrategy);
  const receiveAddressAsString = formatReceiveAddressAsString(
    receiveAddress,
    receiveMask,
    carProtocolStrategy
  );

  // Create parameter object from "cmd" key
  let parameter: Parameter | undefined;
  if (command.cmd !== undefined) {
    let cmdMessage: string;
    if (typeof command.cmd === 'object') {
      if (Object.keys(command.cmd).length === 1) {
        const key = Object.keys(command.cmd)[0];
        const value = command.cmd[key];
        cmdMessage = `${key}${value}`;
      } else {
        cmdMessage = JSON.stringify(command.cmd).replace(/[:\s"{}]/g, '');
      }
    } else {
      cmdMessage = String(command.cmd).replace(/[:\s]/g, '');
    }
    parameter = { asMessage: cmdMessage };
  }

  // Extract other properties using correct coding keys
  const filter = command.filter as Filter;
  const timeout = command.tmo;
  const extendedAddress = command.eax;
  const testerAddress = command.tst;
  const forceFlowControlResponse = command.fcm1 || false;
  const canPriority = command.pri;

  return createCommandID(
    headerAsString,
    receiveAddressAsString,
    parameter,
    filter,
    timeout,
    extendedAddress,
    testerAddress,
    forceFlowControlResponse,
    carProtocolStrategy,
    canPriority
  );
}

/**
 * Generates a command ID in the format used by command_support.yaml files
 * Takes into account the RAX property when present
 * Format with rax: hdr.rax.cmd (e.g., "7B3.7BB.220100")
 * Format without rax: hdr.cmd (e.g., "7B3.220100")
 *
 * @param header The header value of the command (e.g., "7E0")
 * @param cmd The command value (can be object or string)
 * @param rax Optional RAX value for the command
 * @returns Formatted command ID
 */
export function generateCommandId(header: string, cmd: any, rax?: string): string {
  // Convert cmd to a string representation
  let cmdPart: string;
  if (typeof cmd === 'object') {
    if (Object.keys(cmd).length === 1) {
      const key = Object.keys(cmd)[0];
      const value = cmd[key];
      cmdPart = `${key}${value}`;
    } else {
      cmdPart = JSON.stringify(cmd).replace(/:\s+/g, '');
    }
  } else {
    cmdPart = String(cmd).replace(/:\s+/g, '');
  }

  // Create a full command ID format
  if (rax) {
    // Format with rax: hdr.rax.cmd
    return `${header}.${rax}.${cmdPart}`;
  } else {
    // Original format: hdr.cmd
    return `${header}.${cmdPart}`;
  }
}

/**
 * Converts a filter object to an ID string representation
 * @param filter The filter object with from, to, and years properties
 * @returns The ID string representation of the filter
 */
export function filterToIDString(filter: Filter): string {
  const stringParts: string[] = [];

  if (filter.from !== undefined && filter.to !== undefined && filter.from < filter.to) {
    stringParts.push(String(filter.from) + "-" + String(filter.to));
  } else {
    if (filter.from !== undefined) {
      stringParts.push(String(filter.from) + "-");
    }
    if (filter.to !== undefined) {
      stringParts.push("-" + String(filter.to));
    }
  }

  if (filter.years && filter.years.length > 0) {
    const sortedYears = [...filter.years].sort((a, b) => a - b);
    stringParts.push(...sortedYears.map(year => String(year)));
  }

  return stringParts.join(';');
}