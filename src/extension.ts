import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// This function gets all model years that support a specific signal ID
async function getModelYearsForSignalId(signalId: string): Promise<string[]> {
  // Find all model year directories
  const testCasesPath = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, 'tests', 'test_cases');
  const modelYears: string[] = [];

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

      // First check if we have command files that might reference this signal
      const commandsDir = path.join(yearPath, 'commands');
      let foundInYear = false;

      try {
        // Check if commands directory exists
        const commandsDirStat = await fs.promises.stat(commandsDir);

        if (commandsDirStat.isDirectory()) {
          // Read all command files
          const commandFiles = await fs.promises.readdir(commandsDir);

          for (const commandFile of commandFiles) {
            // Check each command file for the signal ID
            const commandFilePath = path.join(commandsDir, commandFile);
            const content = await fs.promises.readFile(commandFilePath, 'utf-8');

            if (content.includes(signalId)) {
              modelYears.push(year);
              foundInYear = true;
              break;
            }
          }
        }
      } catch (err) {
        // It's ok if there's no commands directory
      }

      // If not found in commands, check command_support.yaml
      if (!foundInYear) {
        const supportFilePath = path.join(yearPath, 'command_support.yaml');
        try {
          const content = await fs.promises.readFile(supportFilePath, 'utf-8');

          // Check if the signal ID is in the supported list
          if (content.includes(signalId)) {
            modelYears.push(year);
          }
        } catch (err) {
          // It's ok if the support file doesn't exist
        }
      }
    }
  } catch (err) {
    console.error(`Error finding model years for ${signalId}:`, err);
  }

  return modelYears;
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Signal ID hover extension activated');

  // Register a hover provider for JSON files
  const hoverProvider = vscode.languages.registerHoverProvider('json', {
    async provideHover(document, position, token) {
      console.log('Hover requested for document:', document.fileName);
      // Check if we're in a JSON file that's in the signalsets directory
      if (!document.fileName.includes('signalsets')) {
        return undefined;
      }

      // Get the word at the position (should be a signal ID)
      const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_]+/);
      if (!wordRange) {
        return undefined;
      }

      const word = document.getText(wordRange);

      // Check if this is in the "id" field of a signal
      const lineText = document.lineAt(position.line).text;

      // More precise check for ID value - look for pattern like "id": "SIGNAL_ID"
      const idRegex = /"id"\s*:\s*"([A-Za-z0-9_]+)"/;
      const match = idRegex.exec(lineText);

      if (!match || match[1] !== word) {
        return undefined;
      }

      // Get supported model years for this signal ID
      const modelYears = await getModelYearsForSignalId(word);

      if (modelYears.length > 0) {
        // Sort years numerically
        modelYears.sort((a, b) => parseInt(a) - parseInt(b));

        // Create the hovercard content
        const markdownContent = new vscode.MarkdownString();
        markdownContent.appendMarkdown(`**${word}** is supported in model years:\n\n`);
        markdownContent.appendMarkdown(`${modelYears.join(', ')}`);

        return new vscode.Hover(markdownContent);
      }

      return undefined;
    }
  });

  console.log('Registered hover provider for JSON files');

  context.subscriptions.push(hoverProvider);
}

export function deactivate() {}