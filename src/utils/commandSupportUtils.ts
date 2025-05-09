import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

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
 * Gets all model years that explicitly list a command as unsupported
 * @param commandId The command ID to check (e.g. '7E0.2211BA')
 * @returns Array of model years where the command is explicitly unsupported
 */
export async function getUnsupportedModelYearsForCommand(commandId: string): Promise<string[]> {
  if (!vscode.workspace.workspaceFolders) {
    return [];
  }
  const testCasesPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'tests', 'test_cases');
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
          const yamlContent = yaml.load(content) as any;

          if (yamlContent && yamlContent.unsupported_commands_by_ecu) {
            const unsupportedCommands = Object.values(yamlContent.unsupported_commands_by_ecu as Record<string, string[]>)
              .flat() as string[];

            if (unsupportedCommands.includes(commandId) || unsupportedCommands.includes(stripReceiveFilter(commandId))) {
              unsupportedYears.push(year);
            }
          }
        } catch (err) {
          // It's ok if the support file doesn't exist or fails to parse
        }
      } catch (statErr) {
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
 * @returns Array of model years that support the command
 */
export async function getSupportedModelYearsForCommand(commandId: string): Promise<string[]> {
  if (!vscode.workspace.workspaceFolders) {
    return [];
  }
  const cmdPart = commandId.split('.').pop() || '';
  const testCasesPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'tests', 'test_cases');
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
            const yamlContent = yaml.load(content) as any;

            if (yamlContent && yamlContent.supported_commands_by_ecu) {
              for (const ecuCommands of Object.values(yamlContent.supported_commands_by_ecu as Record<string, string[]>)) {
                for (const cmd of ecuCommands as string[]) {
                  const cmdParts = cmd.split(':');
                  if (cmdParts.length > 0) {
                    const mainCmdPart = cmdParts[0];
                    const ecu = Object.keys(yamlContent.supported_commands_by_ecu).find(key => yamlContent.supported_commands_by_ecu[key] === ecuCommands);
                    if (mainCmdPart === cmdPart || (ecu && `${ecu}.${mainCmdPart}` === commandId) || cmd.includes(cmdPart)) {
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
