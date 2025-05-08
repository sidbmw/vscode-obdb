import * as vscode from 'vscode';
import { isPositionInCommand } from '../utils/commandParser';
import { getModelYearsForSignalId } from '../utils/modelYears';
import { generateBitMappingVisualization } from '../visualization/bitMapping';
import { getCachedImage, cacheImage } from '../utils/cache';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { groupModelYearsByGeneration } from '../utils/generations';
import { numberToExcelColumn, bixToByte } from '../utils/bixConverter';

/**
 * Strips the receive filter (middle part) from a command ID if present
 * @param commandId The command ID in format "header.response.command" or "header.command"
 * @returns Simplified command ID in format "header.command"
 */
function stripReceiveFilter(commandId: string): string {
  const parts = commandId.split('.');
  // If we have 3 parts (header.response.command), take first and last
  if (parts.length === 3) {
    return `${parts[0]}.${parts[2]}`;
  }
  // Otherwise return original
  return commandId;
}

/**
 * Creates a hover provider for JSON files
 * @returns A disposable hover provider registration
 */
export function createHoverProvider(): vscode.Disposable {
  return vscode.languages.registerHoverProvider('json', {
    async provideHover(document, position, token) {
      // Check if we're in a JSON file that's in the signalsets directory
      if (!document.fileName.includes('signalsets') && !document.fileName.includes('commands')) {
        return undefined;
      }

      // Create the hovercard content
      const markdownContent = new vscode.MarkdownString();

      // CASE 1: Check for signal ID hover
      const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_]+/);
      if (wordRange) {
        const word = document.getText(wordRange);
        const lineText = document.lineAt(position.line).text;
        const idRegex = /"id"\s*:\s*"([A-Za-z0-9_]+)"/;
        const match = idRegex.exec(lineText);

        // If we found a signal ID match, get its supported model years
        if (match && match[1] === word) {
          // Get supported model years for this signal ID
          const modelYears = await getModelYearsForSignalId(word);

          if (modelYears.length > 0) {
            // Add the signal ID title
            markdownContent.appendMarkdown(`## ${word}\n\n`);

            // Group model years by generation
            const groupedYears = await groupModelYearsByGeneration(modelYears);

            // Display years grouped by generation
            markdownContent.appendMarkdown(`### Supported Model Years\n\n`);

            for (const [generationName, years] of Object.entries(groupedYears)) {
              // Sort years numerically within each generation
              years.sort((a, b) => parseInt(a) - parseInt(b));

              markdownContent.appendMarkdown(`- **${generationName}:** ${years.join(', ')}\n\n`);
            }
          } else {
            // Add the signal ID title even if no model years are found
            markdownContent.appendMarkdown(`## ${word}\n\n`);
            markdownContent.appendMarkdown(`No model year support information available.\n\n`);
          }

          // Return the hover for signal ID
          return new vscode.Hover(markdownContent);
        }
      }

      // CASE 2: Check for signal group hover
      // We're looking for a pattern like: {"id": "SIGNAL_GROUP_ID", ..., "matchingRegex": "REGEX_PATTERN", ...}
      if (wordRange) {
        const word = document.getText(wordRange);
        const lineText = document.lineAt(position.line).text;

        // Check if this is a line with a signal group definition
        const signalGroupIdRegex = /"id"\s*:\s*"([A-Za-z0-9_]+)"/;
        const matchingRegexPropRegex = /"matchingRegex"\s*:\s*"([^"]+)"/;

        const signalGroupMatch = signalGroupIdRegex.exec(lineText);
        const matchingRegexMatch = matchingRegexPropRegex.exec(lineText);

        // If we have both an ID and a matchingRegex in the same line, it's a signal group
        if (signalGroupMatch && matchingRegexMatch) {
          const signalGroupId = signalGroupMatch[1];
          const matchingRegexPattern = matchingRegexMatch[1];

          // Find all signals in the file that match this regex
          const matchingSignals = await countMatchingSignals(document, matchingRegexPattern);

          // Create the hover content
          markdownContent.appendMarkdown(`## Signal Group: \`${signalGroupId}\`\n\n`);
          markdownContent.appendMarkdown(`Matching Pattern: \`${matchingRegexPattern}\`\n\n`);
          markdownContent.appendMarkdown(`**${matchingSignals.length} matching signals found in this file**\n\n`);

          // If we have matching signals, list the first few
          if (matchingSignals.length > 0) {
            markdownContent.appendMarkdown(`### Matching Signals (showing first ${Math.min(10, matchingSignals.length)})\n\n`);
            matchingSignals.slice(0, 10).forEach(signal => {
              markdownContent.appendMarkdown(`- \`${signal}\`\n`);
            });

            // If there are more than 10 matches, indicate it
            if (matchingSignals.length > 10) {
              markdownContent.appendMarkdown(`\n... and ${matchingSignals.length - 10} more\n`);
            }
          }

          return new vscode.Hover(markdownContent);
        }
      }

      // CASE 3: Check for bix values in signal format definitions
      // Example: {"id": "SIGNAL_ID", "fmt": {"bix": 264, ...}, ...}
      if (wordRange) {
        const word = document.getText(wordRange);
        const lineText = document.lineAt(position.line).text;

        // Check if we're hovering on a bix value
        const bixRegex = /"bix"\s*:\s*(\d+)/;
        const bixMatch = bixRegex.exec(lineText);

        if (bixMatch && word === bixMatch[1]) {
          // Get the bix value
          const bixValue = parseInt(word);

          // Calculate alphabetical equivalent (A-Z, AA-ZZ, etc.)
          const alphaEquivalent = numberToExcelColumn(bixValue);

          // Calculate byte value (bix / 8)
          const byteValue = bixToByte(bixValue);

          // Create hover content
          markdownContent.appendMarkdown(`**Byte**: \`${byteValue}\` / \`${alphaEquivalent}\``);

          return new vscode.Hover(markdownContent);
        }
      }

      // CASE 4: Check for command definition hover
      // First check if we're in a command object by examining the surrounding context
      const positionResult = isPositionInCommand(document, position);
      if (positionResult.isCommand) {
        // Check if we're hovering over the "cmd" property
        const lineText = document.lineAt(position.line).text;

        // Look for cmd patterns like "cmd": {"22": "2610"} or "cmd": "221100"
        const cmdObjectRegex = /"cmd"\s*:\s*(\{[^}]*\}|\d+)/;
        const cmdMatch = cmdObjectRegex.exec(lineText);

        if (cmdMatch) {
          // We're hovering over a cmd definition
          // Generate command ID from the command object
          let commandId = '';

          if (positionResult.commandObject) {
            const hdr = positionResult.commandObject.hdr;
            const cmd = positionResult.commandObject.cmd;
            const rax = positionResult.commandObject.rax;

            // Try to extract a command ID
            if (hdr) {
              if (typeof cmd === 'object') {
                // Format: 7E0.221100 for cmd format {"22": "1100"}
                const cmdKey = Object.keys(cmd)[0];
                const cmdValue = cmd[cmdKey];
                commandId = `${hdr}.${cmdKey}${cmdValue}`;
              } else if (typeof cmd === 'string') {
                // Format: 7E0.221100 for cmd format "221100"
                commandId = `${hdr}.${cmd}`;
              }

              // Include RAX in the format if present
              if (rax && commandId) {
                // Update to format: 7E0.7E8.221100
                commandId = `${hdr}.${rax}.${commandId.split('.')[1]}`;
              }
            }
          }

          if (commandId) {
            // First display command ID
            markdownContent.appendMarkdown(`## Command: \`${commandId}\`\n\n`);

            // Get unsupported model years for this command
            const unsupportedYears = await getUnsupportedModelYearsForCommand(commandId);

            // Get supported model years for this command
            const supportedYears = await getSupportedModelYearsForCommand(commandId);

            // Create a combined table of all years with support status
            const allYears = [...new Set([...supportedYears, ...unsupportedYears])];

            if (allYears.length > 0) {
              // Group all years by generation
              const allYearsByGeneration = await groupModelYearsByGeneration(allYears);

              markdownContent.appendMarkdown('```\n');

              // Display years grouped by generation in descending order
              const sortedGenerations = Object.entries(allYearsByGeneration).sort((a, b) => {
                // Extract generation numbers for sorting
                const genNumA = parseInt(a[1][0]);
                const genNumB = parseInt(b[1][0]);
                return genNumB - genNumA; // Descending order
              });

              // Display years grouped by generation
              for (const [generationName, yearsInGeneration] of sortedGenerations) {
                // Find min and max years in this generation
                const minYear = Math.min(...yearsInGeneration.map(y => parseInt(y)));
                const maxYear = Math.max(...yearsInGeneration.map(y => parseInt(y)));

                // Add generation header
                markdownContent.appendMarkdown(`- ${generationName.padEnd(8)}\n`);

                // Generate every year in the range, including gaps
                for (let yearNum = maxYear; yearNum >= minYear; yearNum--) {
                  const year = yearNum.toString();
                  const isSupported = supportedYears.includes(year);
                  const isUnsupported = unsupportedYears.includes(year);

                  let statusEmoji = "?"; // Unknown status

                  if (isSupported) {
                    statusEmoji = "✅";
                  } else if (isUnsupported) {
                    statusEmoji = "❌";
                  }

                  markdownContent.appendMarkdown(`| ${year.padEnd(4)} | ${statusEmoji} |\n`);
                }
              }
            } else {
              markdownContent.appendMarkdown(`### Model Year Support\n\nNo support information available.\n\n`);
            }

            return new vscode.Hover(markdownContent);
          }
        }
      }

      return undefined;
    }
  });
}

/**
 * Gets all model years that explicitly list a command as unsupported
 * @param commandId The command ID to check (e.g. '7E0.2211BA')
 * @returns Array of model years where the command is explicitly unsupported
 */
async function getUnsupportedModelYearsForCommand(commandId: string): Promise<string[]> {
  // Find all model year directories
  const testCasesPath = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, 'tests', 'test_cases');
  const unsupportedYears: string[] = [];

  try {
    // Read test case directories to find model years
    const years = await fs.promises.readdir(testCasesPath);

    // For each year directory
    for (const year of years) {
      // Skip if not a directory
      const yearPath = path.join(testCasesPath, year);
      const yearStat = await fs.promises.stat(yearPath);
      if (!yearStat.isDirectory()) {
        continue;
      }

      // Check command_support.yaml for unsupported commands
      const supportFilePath = path.join(yearPath, 'command_support.yaml');
      try {
        const content = await fs.promises.readFile(supportFilePath, 'utf-8');
        const yamlContent = yaml.load(content) as any;

        // Check if the command ID is in the unsupported_commands_by_ecu section
        if (yamlContent && yamlContent.unsupported_commands_by_ecu) {
          const unsupportedCommands = Object.values(yamlContent.unsupported_commands_by_ecu as Record<string, string[]>)
            .flat() as string[];

          if (unsupportedCommands.includes(commandId) || unsupportedCommands.includes(stripReceiveFilter(commandId))) {
            unsupportedYears.push(year);
          }
        }
      } catch (err) {
        // It's ok if the support file doesn't exist
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
 * @returns Array of model years that support the command
 */
async function getSupportedModelYearsForCommand(commandId: string): Promise<string[]> {
  // Extract command part (e.g., "2211BA" from "7E0.2211BA")
  const cmdPart = commandId.split('.').pop() || '';

  // Find all model year directories
  const testCasesPath = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, 'tests', 'test_cases');
  const supportedYears: string[] = [];

  try {
    // Read test case directories to find model years
    const years = await fs.promises.readdir(testCasesPath);

    // For each year directory
    for (const year of years) {
      // Skip if not a directory
      const yearPath = path.join(testCasesPath, year);
      const yearStat = await fs.promises.stat(yearPath);
      if (!yearStat.isDirectory()) {
        continue;
      }

      // First check for command files that explicitly implement this command
      const commandsDir = path.join(yearPath, 'commands');
      let foundInYear = false;

      try {
        // Check if commands directory exists
        const commandsDirStat = await fs.promises.stat(commandsDir);

        if (commandsDirStat.isDirectory()) {
          // Look for matching command file
          const commandFiles = await fs.promises.readdir(commandsDir);

          // If we find a file that matches our command ID, this year supports it
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

      // If not found by direct file, check command_support.yaml
      if (!foundInYear) {
        const supportFilePath = path.join(yearPath, 'command_support.yaml');
        try {
          const content = await fs.promises.readFile(supportFilePath, 'utf-8');
          const yamlContent = yaml.load(content) as any;

          // Check supported_commands_by_ecu section (if it exists)
          if (yamlContent && yamlContent.supported_commands_by_ecu) {
            // Look through each ECU's supported commands
            for (const [ecu, commands] of Object.entries(yamlContent.supported_commands_by_ecu as Record<string, string[]>)) {
              // Each command might be in format "0101:ECT,RPM"
              for (const cmd of commands as string[]) {
                const cmdParts = cmd.split(':');
                if (cmdParts.length > 0) {
                  // Just compare the command part (e.g., "0101")
                  if (cmdParts[0] === cmdPart ||
                      `${ecu}.${cmdParts[0]}` === commandId ||
                      cmd.includes(cmdPart)) {
                    supportedYears.push(year);
                    foundInYear = true;
                    break;
                  }
                }
              }
              if (foundInYear) break;
            }
          }
        } catch (err) {
          // It's ok if the support file doesn't exist
        }
      }
    }
  } catch (err) {
    console.error(`Error finding supported model years for ${commandId}:`, err);
  }

  return supportedYears;
}

/**
 * Counts all signals in the document that match a given regex pattern
 * @param document The document to search
 * @param regexPattern The regex pattern to match
 * @returns Array of matching signal IDs
 */
async function countMatchingSignals(document: vscode.TextDocument, regexPattern: string): Promise<string[]> {
  const matchingSignals: string[] = [];
  const regex = new RegExp(regexPattern.replace(/\\\\/g, "\\"));

  // Parse the entire document content to find signal definitions
  const text = document.getText();
  let jsonContent;

  try {
    jsonContent = JSON.parse(text);
  } catch (error) {
    console.error("Failed to parse JSON document:", error);
    return matchingSignals;
  }

  // Check if we have a commands array with signals
  if (jsonContent && jsonContent.commands) {
    // Iterate through each command
    for (const command of jsonContent.commands) {
      // Check if the command has signals
      if (command.signals && Array.isArray(command.signals)) {
        // Check each signal ID against the regex
        for (const signal of command.signals) {
          if (signal.id && regex.test(signal.id)) {
            matchingSignals.push(signal.id);
          }
        }
      }
    }
  }

  return matchingSignals;
}