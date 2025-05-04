import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as jsonc from 'jsonc-parser';

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
      // Find the signalset definition file and position for this command and model year
      const definition = await this.findSignalsetDefinitionForCommand(commandId, modelYear);
      if (definition) {
        // Return the definition location
        return new vscode.Location(definition.uri, definition.range);
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
   * Find the signalset file and position that contains the definition for this command
   */
  private async findSignalsetDefinitionForCommand(
    commandId: string,
    modelYear: string
  ): Promise<{ uri: vscode.Uri, range: vscode.Range } | undefined> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return undefined;
      }

      const rootPath = workspaceFolders[0].uri.fsPath;

      // Check the model year specific signalset file in v3 directory first
      const potentialSignalsetPaths = [
        // Check year range signalsets (e.g., 2015-2018.json)
        ...await this.findYearRangeSignalsets(rootPath, parseInt(modelYear)),
        // Fallback to default signalset
        path.join(rootPath, 'signalsets', 'v3', 'default.json'),
      ];

      // Check each potential signalset file
      for (const signalsetPath of potentialSignalsetPaths) {
        if (fs.existsSync(signalsetPath)) {
          // Check if the command exists in this signalset and get its position
          const position = await this.findCommandPositionInFile(signalsetPath, commandId);
          if (position) {
            return {
              uri: vscode.Uri.file(signalsetPath),
              range: position
            };
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
   * Find the exact position of a command in a signalset file
   */
  private async findCommandPositionInFile(
    signalsetPath: string,
    commandId: string
  ): Promise<vscode.Range | undefined> {
    try {
      const content = await fs.promises.readFile(signalsetPath, 'utf-8');

      // Parse the command ID components
      const parts = commandId.split('.');
      let hdr: string | undefined;
      let rax: string | undefined;
      let cmdValue: string | undefined;

      if (parts.length === 2) {
        hdr = parts[0];
        cmdValue = parts[1];
      } else if (parts.length === 3) {
        hdr = parts[0];
        rax = parts[1];
        cmdValue = parts[2];
      } else {
        return undefined;
      }

      // Split cmdValue into service ID and parameter ID
      if (!cmdValue || cmdValue.length < 4) {
        return undefined;
      }

      const serviceId = cmdValue.substring(0, 2);
      const parameterId = cmdValue.substring(2);

      // Parse the JSON to get the AST
      const rootNode = jsonc.parseTree(content);
      if (!rootNode) {
        return undefined;
      }

      // Find the commands array node
      const commandsNode = jsonc.findNodeAtLocation(rootNode, ['commands']);
      if (!commandsNode || !commandsNode.children) {
        return undefined;
      }

      // Iterate through the commands array to find the matching command
      for (const commandNode of commandsNode.children) {
        // Check individual components
        let headerMatches = false;
        let raxMatches = rax ? false : true; // If rax is not in commandId, default to true
        let cmdMatches = false;

        // Check header match
        const hdrNode = jsonc.findNodeAtLocation(commandNode, ['hdr']);
        if (hdrNode) {
          if (typeof hdrNode.value === 'string' && hdrNode.value === hdr) {
            headerMatches = true;
          } else if (typeof hdrNode.value === 'object' && hdrNode.value.text === hdr) {
            headerMatches = true;
          }
        }

        // Check rax match if applicable
        if (rax) {
          const raxNode = jsonc.findNodeAtLocation(commandNode, ['rax']);
          if (raxNode) {
            if (typeof raxNode.value === 'string' && raxNode.value === rax) {
              raxMatches = true;
            } else if (typeof raxNode.value === 'object' && raxNode.value.text === rax) {
              raxMatches = true;
            }
          } else {
            raxMatches = true;
          }
        }

        // Check cmd match
        const cmdNode = jsonc.findNodeAtLocation(commandNode, ['cmd']);
        if (cmdNode) {
          const cmd = jsonc.getNodeValue(cmdNode);
          if (typeof cmd === 'object') {
            if (Object.keys(cmd).length === 1) {
              const key = Object.keys(cmd)[0];
              const value = cmd[key];
              cmdMatches = `${key}${value}` == cmdValue;
            }
          }
        }

        // If all components match, we've found our command
        if (headerMatches && raxMatches && cmdMatches) {
          // Return the range of the entire command object
          return new vscode.Range(
            this.getPositionFromOffset(content, commandNode.offset),
            this.getPositionFromOffset(content, commandNode.offset + commandNode.length)
          );
        }
      }
    } catch (error) {
      console.error(`Error finding command position in ${signalsetPath}:`, error);
    }

    return undefined;
  }

  /**
   * Convert a character offset to a Position object
   */
  private getPositionFromOffset(text: string, offset: number): vscode.Position {
    // Count newlines and character position
    let line = 0;
    let character = 0;
    let currentOffset = 0;

    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineLength = lines[i].length;

      // If the offset is within this line
      if (currentOffset + lineLength >= offset) {
        line = i;
        character = offset - currentOffset;
        break;
      }

      // Move to the next line (add 1 for the newline character)
      currentOffset += lineLength + 1;
    }

    return new vscode.Position(line, character);
  }
}