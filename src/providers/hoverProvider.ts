import * as vscode from 'vscode';
import { isPositionInCommand } from '../utils/commandParser';
import { getModelYearsForSignalId } from '../utils/modelYears';
import { generateBitMappingVisualization } from '../visualization/bitMapping';
import { getCachedImage, cacheImage } from '../utils/cache';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

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
            // Sort years numerically
            modelYears.sort((a, b) => parseInt(a) - parseInt(b));

            // Add supported model years at the top
            markdownContent.appendMarkdown(`**Supported in model years:** ${modelYears.join(', ')}\n\n`);
          } else {
            // Add the signal ID title even if no model years are found
            markdownContent.appendMarkdown(`## ${word}\n\n`);
            markdownContent.appendMarkdown(`No model year support information available.\n\n`);
          }

          // Return the hover for signal ID
          return new vscode.Hover(markdownContent);
        }
      }

      // CASE 2: Check for command definition hover
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
            // Get unsupported model years for this command
            const unsupportedYears = await getUnsupportedModelYearsForCommand(commandId);

            if (unsupportedYears.length > 0) {
              // Sort years numerically
              unsupportedYears.sort((a, b) => parseInt(a) - parseInt(b));

              // First display command ID
              markdownContent.appendMarkdown(`**Command ID:** \`${commandId}\`\n\n`);

              // Add unsupported model years information
              markdownContent.appendMarkdown(`**Unsupported in model years:** ${unsupportedYears.join(', ')}\n\n`);

              // Return the hover for command definition
              return new vscode.Hover(markdownContent);
            }
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

          if (unsupportedCommands.includes(commandId)) {
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