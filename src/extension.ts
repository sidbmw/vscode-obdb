import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Utility function to generate HTML for bit mapping visualization
function generateBitMappingVisualization(command: any): string {
  // Extract signals from command parameters or signals
  const signals = command.signals ? command.signals.map((signal: any) => {
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
  }) : command.parameters?.map((param: any) => ({
    id: param.id || 'unknown',
    name: param.name || param.id || 'Unknown',
    suggestedMetric: param.suggestedMetric,
    bitOffset: param.bitOffset || 0,
    bitLength: param.bitLength || 8
  })) || [];

  // Calculate the maximum bit range used by any signal
  const maxBitRange = signals.reduce((max: number, signal: any) => {
    return Math.max(max, signal.bitOffset + signal.bitLength);
  }, 0);

  // Calculate how many bytes we need to display (minimum 1 byte)
  const bytesNeeded = Math.max(1, Math.ceil(maxBitRange / 8));

  // Map of bits to signals
  const bitToSignalMap: { [key: number]: any } = {};
  signals.forEach((signal: any) => {
    const bitOffset = signal.bitOffset;
    const bitLength = signal.bitLength;

    for (let i = 0; i < bitLength; i++) {
      bitToSignalMap[bitOffset + i] = signal;
    }
  });

  // Function to generate a color for a signal
  const colorForSignal = (signal: any): string => {
    // Simple hash function
    let hash = 0;
    const str = signal.id.toString();
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    hash = Math.abs(hash);

    // Use golden ratio to distribute hues more evenly
    const goldenRatio = 0.618033988749895;
    const hue = (hash * goldenRatio) % 1;

    // Light background for VSCode hover card
    const saturation = 70 + ((hash % 30) - 15);
    const lightness = 70 + ((hash % 20) - 10);

    return `hsl(${Math.floor(hue * 360)}, ${saturation}%, ${lightness}%)`;
  };

  // Helper function to format bit range
  const formatBitRange = (signal: any): string => {
    const startBit = signal.bitOffset;
    const endBit = signal.bitOffset + signal.bitLength - 1;

    if (startBit === endBit) {
      return `${startBit}`;
    } else {
      return `${startBit}-${endBit}`;
    }
  };

  // Generate HTML for the visualization
  let html = '<div style="font-family: var(--vscode-font-family); margin-top: 8px;">';

  // Add title
  html += '<div style="font-weight: bold; margin-bottom: 4px;">Bit Mapping Visualization</div>';

  // Add command info if available
  if (command.cmd) {
    // Format the command based on its structure
    let cmdDisplay = '';
    if (typeof command.cmd === 'object') {
      // For objects like {"22": "18A0"}
      for (const [key, value] of Object.entries(command.cmd)) {
        cmdDisplay += `${key}: ${value}`;
      }
    } else {
      cmdDisplay = command.cmd.toString();
    }

    html += `<div style="font-size: 12px; margin-bottom: 8px;">Command: ${cmdDisplay}</div>`;
  }

  // Add header info if available
  if (command.hdr) {
    html += `<div style="font-size: 12px; margin-bottom: 8px;">Header: ${command.hdr}</div>`;
  }

  // Container for the grid and legend
  html += '<div style="display: flex; flex-direction: column; gap: 8px;">';

  // Bit grid visualization
  html += '<div>';

  // Header row for bit indices
  html += '<div style="display: flex; margin-bottom: 4px;">';
  html += '<div style="width: 20px; margin-right: 8px;"></div>';
  for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
    html += `<div style="width: 24px; text-align: center; font-weight: bold; font-size: 12px;">${bitIndex}</div>`;
  }
  html += '</div>';

  // Byte rows
  for (let byteIndex = 0; byteIndex < bytesNeeded; byteIndex++) {
    html += '<div style="display: flex; margin-bottom: 2px;">';
    html += `<div style="width: 20px; margin-right: 8px; text-align: right; font-weight: bold; font-size: 12px;">${byteIndex}</div>`;

    // Bits in each byte
    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
      const absoluteBitIndex = (byteIndex * 8) + bitIndex;
      const signal = bitToSignalMap[absoluteBitIndex];

      const backgroundColor = signal ? colorForSignal(signal) : '#f0f0f0';

      html += `<div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
               font-size: 10px; background-color: ${backgroundColor};
               border: 1px solid #ccc; position: relative;">${absoluteBitIndex}</div>`;
    }

    html += '</div>';
  }

  html += '</div>';

  // Signal legend
  html += '<div style="margin-top: 8px; border-top: 1px solid #ddd; padding-top: 8px;">';
  html += '<div style="font-weight: bold; margin-bottom: 4px;">Signal Legend</div>';

  // Get unique signals from bitToSignalMap
  const uniqueSignals = Array.from(new Set(Object.values(bitToSignalMap)));
  uniqueSignals.sort((a: any, b: any) => a.bitOffset - b.bitOffset);

  for (const signal of uniqueSignals) {
    const color = colorForSignal(signal);
    html += `<div style="display: flex; align-items: center; margin-bottom: 4px;">`;
    html += `<div style="width: 16px; height: 16px; background-color: ${color}; border: 1px solid #999; margin-right: 8px;"></div>`;
    html += `<div style="font-size: 12px;">${signal.name} (Bits: ${formatBitRange(signal)})</div>`;

    if (signal.suggestedMetric) {
      html += `<div style="margin-left: 8px; font-size: 10px; background-color: #e6f0ff; color: #0066cc; padding: 0 4px; border-radius: 2px;">${signal.suggestedMetric}</div>`;
    }

    html += '</div>';
  }

  if (uniqueSignals.length === 0) {
    html += '<div style="font-style: italic; font-size: 12px; color: #666;">No mapped signals found</div>';
  }

  html += '</div>';
  html += '</div>';
  html += '</div>';

  return html;
}

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

// Function to check if a position is inside a command definition in JSON
function isPositionInCommand(document: vscode.TextDocument, position: vscode.Position): { isCommand: boolean, commandObject?: any, range?: vscode.Range } {
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
      const commandBoundaries: { start: number, end: number, command: any }[] = [];

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
          const normalizedCommand = { ...command };

          // If command has signals but not parameters, convert signals to parameters
          if (normalizedCommand.signals && !normalizedCommand.parameters) {
            normalizedCommand.parameters = normalizedCommand.signals.map((signal: any) => {
              // Extract bitOffset and bitLength from fmt if available
              const bitOffset = signal.fmt?.bix ?? 0;
              const bitLength = signal.fmt?.len ?? 8;

              return {
                id: signal.id,
                name: signal.name,
                suggestedMetric: signal.suggestedMetric,
                bitOffset,
                bitLength
              };
            });
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
      const commandObj = { ...jsonDoc };

      // If the command has signals but not parameters, convert signals to parameters
      if (commandObj.signals && !commandObj.parameters) {
        commandObj.parameters = commandObj.signals.map((signal: any) => {
          // Extract bitOffset and bitLength from fmt if available
          const bitOffset = signal.fmt?.bix ?? 0;
          const bitLength = signal.fmt?.len ?? 8;

          return {
            id: signal.id,
            name: signal.name,
            suggestedMetric: signal.suggestedMetric,
            bitOffset,
            bitLength
          };
        });
      }

      // This appears to be a command object
      return { isCommand: true, commandObject: commandObj };
    }
  } catch (err) {
    console.error("Error checking if position is in command:", err);
  }

  return { isCommand: false };
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Signal ID hover extension activated');

  // Register a hover provider for JSON files
  const hoverProvider = vscode.languages.registerHoverProvider('json', {
    async provideHover(document, position, token) {
      console.log('Hover requested for document:', document.fileName);
      // Check if we're in a JSON file that's in the signalsets directory
      if (!document.fileName.includes('signalsets') && !document.fileName.includes('commands')) {
        return undefined;
      }

      // Get the word at the position (should be a signal ID)
      const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_]+/);
      if (!wordRange) {
        return undefined;
      }

      const word = document.getText(wordRange);

      // First, check if we're hovering within a command definition
      const commandCheck = isPositionInCommand(document, position);
      if (commandCheck.isCommand && commandCheck.commandObject) {
        // We're in a command definition, so generate a bit mapping visualization
        const visualization = generateBitMappingVisualization(commandCheck.commandObject);

        // Create the hovercard content
        const markdownContent = new vscode.MarkdownString();

        // Add command name and ID if available
        const commandName = commandCheck.commandObject.name || 'Command';
        const commandId = commandCheck.commandObject.id || '';

        markdownContent.appendMarkdown(`## ${commandName}\n\n`);

        if (commandId) {
          markdownContent.appendMarkdown(`**ID:** ${commandId}\n\n`);
        }

        // Add description if available
        if (commandCheck.commandObject.description) {
          markdownContent.appendMarkdown(`${commandCheck.commandObject.description}\n\n`);
        }

        // Add bit mapping visualization
        markdownContent.appendMarkdown(visualization);
        markdownContent.isTrusted = true;
        markdownContent.supportHtml = true;

        return new vscode.Hover(markdownContent);
      }

      // Otherwise, check if this is in the "id" field of a signal
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