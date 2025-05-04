import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Creates a definition provider for YAML files that enables Cmd+Click navigation
 * from command IDs to their signalset definitions
 */
export function createDefinitionProvider(): vscode.Disposable {
  return vscode.languages.registerDefinitionProvider(
    { language: 'yaml' },
    new CommandDefinitionProvider()
  );
}

/**
 * Definition provider that enables navigation from command IDs to signal definitions
 */
class CommandDefinitionProvider implements vscode.DefinitionProvider {
  /**
   * Provide the definition for a command ID in YAML files
   */
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | undefined> {
    // Check if we're in a command_id line
    const line = document.lineAt(position.line).text;

    // Match "command_id: hdr[.rax].cmd" pattern
    const commandIdMatch = line.match(/command_id:\s*([0-9A-F.]+)/i);
    if (!commandIdMatch) {
      return undefined;
    }

    // Extract the command ID
    const commandId = commandIdMatch[1];

    // Check if the cursor is on the command ID part
    const commandIdStart = line.indexOf(commandId);
    const commandIdEnd = commandIdStart + commandId.length;

    if (position.character < commandIdStart || position.character > commandIdEnd) {
      return undefined;
    }

    // Extract model year from file path
    const modelYear = this.getModelYearFromPath(document.uri.fsPath);
    if (!modelYear) {
      return undefined;
    }

    try {
      // Find the signalset definition file for this command and model year
      const signalsetUri = await this.findSignalsetForCommand(commandId, modelYear);
      if (signalsetUri) {
        // Return the definition location
        return new vscode.Location(signalsetUri, new vscode.Position(0, 0));
      }
    } catch (error) {
      console.error(`Error finding definition for command ${commandId}:`, error);
    }

    return undefined;
  }

  /**
   * Extract the model year from the file path
   * Path format: .../signalsets/test_cases/YYYY/commands/...
   */
  private getModelYearFromPath(filePath: string): string | undefined {
    // Match model year in file path (usually 4 digits representing a year)
    const yearMatch = filePath.match(/\/(\d{4})\/commands\//);
    if (yearMatch && yearMatch[1]) {
      return yearMatch[1];
    }
    return undefined;
  }

  /**
   * Find the signalset file that contains the definition for this command
   */
  private async findSignalsetForCommand(
    commandId: string,
    modelYear: string
  ): Promise<vscode.Uri | undefined> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return undefined;
      }

      const rootPath = workspaceFolders[0].uri.fsPath;

      // Check the model year specific signalset file in v3 directory first
      const potentialSignalsetPaths = [
        // Check year-specific signalset in v3
        path.join(rootPath, 'signalsets', 'v3', `${modelYear}.json`),
        // Check year range signalsets (e.g., 2015-2018.json)
        ...await this.findYearRangeSignalsets(rootPath, parseInt(modelYear)),
        // Fallback to default signalset
        path.join(rootPath, 'signalsets', 'v3', 'default.json'),
      ];

      // Check each potential signalset file
      for (const signalsetPath of potentialSignalsetPaths) {
        if (fs.existsSync(signalsetPath)) {
          // Check if the command exists in this signalset
          const hasCommand = await this.checkSignalsetForCommand(signalsetPath, commandId);
          if (hasCommand) {
            return vscode.Uri.file(signalsetPath);
          }
        }
      }
    } catch (error) {
      console.error('Error finding signalset for command:', error);
    }

    return undefined;
  }

  /**
   * Finds signalset files that contain year ranges including the target year
   */
  private async findYearRangeSignalsets(rootPath: string, targetYear: number): Promise<string[]> {
    const v3Path = path.join(rootPath, 'signalsets', 'v3');

    try {
      // Get all files in the v3 directory
      const files = await fs.promises.readdir(v3Path);
      const yearRangeSignalsets: string[] = [];

      // Look for files with year range pattern (e.g., 2015-2018.json)
      for (const file of files) {
        const match = file.match(/^(\d{4})-(\d{4})\.json$/);
        if (match) {
          const startYear = parseInt(match[1]);
          const endYear = parseInt(match[2]);

          // Check if our target year is within this range
          if (targetYear >= startYear && targetYear <= endYear) {
            yearRangeSignalsets.push(path.join(v3Path, file));
          }
        }
      }

      return yearRangeSignalsets;
    } catch (error) {
      console.error('Error finding year range signalsets:', error);
      return [];
    }
  }

  /**
   * Check if a signalset file contains a specific command
   */
  private async checkSignalsetForCommand(signalsetPath: string, commandId: string): Promise<boolean> {
    try {
      const content = await fs.promises.readFile(signalsetPath, 'utf-8');
      const signalset = JSON.parse(content);

      // Check if commands exist in the signalset
      if (!signalset.commands || !Array.isArray(signalset.commands)) {
        return false;
      }

      // Deconstruct the command ID into components
      // Format can be "7E0.2210E0" or "7E0.7E8.2210E0"
      const parts = commandId.split('.');

      // Initialize components
      let hdr: string | undefined;
      let rax: string | undefined;
      let cmdValue: string | undefined;

      if (parts.length === 2) {
        // Format: "7E0.2210E0"
        hdr = parts[0];
        cmdValue = parts[1];
      } else if (parts.length === 3) {
        // Format: "7E0.7E8.2210E0"
        hdr = parts[0];
        rax = parts[1];
        cmdValue = parts[2];
      } else {
        // Unsupported format
        return false;
      }

      // Split the command value into service ID (first 2 chars) and parameter ID (remaining chars)
      // Example: "2210E0" -> service: "22", parameter: "10E0"
      if (!cmdValue || cmdValue.length < 4) {
        return false; // Command must have at least 4 characters (2 for service + at least 2 for parameter)
      }

      const serviceId = cmdValue.substring(0, 2);
      const parameterId = cmdValue.substring(2);

      // Create command object for comparison
      const cmdObj: Record<string, string> = {
        [serviceId]: parameterId
      };

      // Check commands for a match
      for (const command of signalset.commands) {
        // Check exact match with id property first
        if (command.id === commandId) {
          return true;
        }

        // Check against deconstructed parts
        let headerMatch = false;
        let raxMatch = true;  // Default to true when rax is not specified in command ID
        let cmdMatch = false;

        // Check header match
        if (command.hdr) {
          // Simple string comparison
          if (typeof command.hdr === 'string' && command.hdr === hdr) {
            headerMatch = true;
          }
          // Handle object with text property
          else if (typeof command.hdr === 'object' && command.hdr.text === hdr) {
            headerMatch = true;
          }
        }

        // Check rax match if provided in command ID
        if (rax && command.rax) {
          raxMatch = false;  // Reset to false since we need to check
          // Simple string comparison
          if (typeof command.rax === 'string' && command.rax === rax) {
            raxMatch = true;
          }
          // Handle object with text property
          else if (typeof command.rax === 'object' && command.rax.text === rax) {
            raxMatch = true;
          }
        }

        // Check cmd match
        if (command.cmd) {
          // Simple string comparison for the entire cmd value
          if (typeof command.cmd === 'string' && command.cmd === cmdValue) {
            cmdMatch = true;
          }
          // Handle object with text property
          else if (typeof command.cmd === 'object' && command.cmd.text === cmdValue) {
            cmdMatch = true;
          }
          // Handle {serviceId: parameterId} format (e.g. {"22": "10E0"})
          else if (typeof command.cmd === 'object' && serviceId in command.cmd) {
            const parameterValue = command.cmd[serviceId];

            // Direct match
            if (parameterValue === parameterId) {
              cmdMatch = true;
            }
            // Handle nested object with text property
            else if (typeof parameterValue === 'object' && parameterValue.text === parameterId) {
              cmdMatch = true;
            }
          }
        }

        // If all parts match, we found the right command
        if (headerMatch && raxMatch && cmdMatch) {
          return true;
        }
      }
    } catch (error) {
      console.error(`Error checking signalset ${signalsetPath} for command ${commandId}:`, error);
    }

    return false;
  }
}