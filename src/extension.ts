import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createCanvas } from 'canvas';

// Function to generate a bitmap visualization using canvas
function generateBitMappingVisualization(command: any): string {
  try {
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

    // Generate color map for signals
    const signalColors: { [key: string]: string } = {};
    const tempIds = signals.map((s: any) => s.id as string);
    const uniqueSignalIds = Array.from(new Set(tempIds)) as string[];
    uniqueSignalIds.forEach((id, index) => {
      // Use a predefined color palette
      const hue = (index * 137.5) % 360; // Use golden ratio approximation for good distribution
      signalColors[id] = `hsl(${Math.floor(hue)}, 70%, 60%)`;
    });

    // Create a canvas
    const width = 400;
    const height = 200 + (bytesNeeded * 30);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Draw title
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('Bit Mapping Visualization', 10, 20);

    // Add command info if available
    ctx.font = '12px Arial';
    if (command.cmd) {
      const cmdDisplay = typeof command.cmd === 'object' ?
        Object.entries(command.cmd).map(([k, v]) => `${k}: ${v}`).join(', ') :
        command.cmd.toString();
      ctx.fillText('Command: ' + cmdDisplay, 10, 40);
    }

    if (command.hdr) {
      ctx.fillText('Header: ' + command.hdr, 10, 60);
    }

    // Draw bit grid
    const gridStartY = 80;
    const cellSize = 28;
    const headerSize = 20;

    ctx.imageSmoothingEnabled = true;

    // Draw header (bit indices)
    ctx.font = 'bold 11px Arial';
    for (let i = 0; i < 8; i++) {
      ctx.fillText(i.toString(), headerSize + 10 + (i * cellSize) + cellSize/2 - 4, gridStartY - 5);
    }

    // Draw bit grid
    for (let byteIndex = 0; byteIndex < bytesNeeded; byteIndex++) {
      // Draw byte index
      ctx.font = 'bold 11px Arial';
      ctx.fillText(byteIndex.toString(), 10, gridStartY + 16 + (byteIndex * cellSize));

      for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
        const absoluteBitIndex = (byteIndex * 8) + bitIndex;
        const signal = bitToSignalMap[absoluteBitIndex];

        // Draw cell background
        if (signal) {
          ctx.fillStyle = signalColors[signal.id];
        } else {
          ctx.fillStyle = '#f0f0f0';
        }

        const x = headerSize + 10 + (bitIndex * cellSize);
        const y = gridStartY + (byteIndex * cellSize);

        // Draw rounded rectangle
        ctx.beginPath();
        const radius = 3;
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + cellSize - radius, y);
        ctx.quadraticCurveTo(x + cellSize, y, x + cellSize, y + radius);
        ctx.lineTo(x + cellSize, y + cellSize - radius);
        ctx.quadraticCurveTo(x + cellSize, y + cellSize, x + cellSize - radius, y + cellSize);
        ctx.lineTo(x + radius, y + cellSize);
        ctx.quadraticCurveTo(x, y + cellSize, x, y + cellSize - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();

        // Add border
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Add bit index
        ctx.fillStyle = '#000000';
        ctx.font = '10px Arial';
        ctx.fillText(absoluteBitIndex.toString(), x + cellSize/2 - 4, y + cellSize/2 + 4);
      }
    }

    // Draw signal legend
    const legendStartY = gridStartY + (bytesNeeded * cellSize) + 20;
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('Signal Legend', 10, legendStartY);

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

    // Get unique signals
    const uniqueSignals = Array.from(
      new Map(Object.values(bitToSignalMap)
        .map((signal: any) => [signal.id, signal])
      ).values()
    );

    if (uniqueSignals.length > 0) {
      uniqueSignals.forEach((signal: any, index) => {
        const y = legendStartY + 20 + (index * 20);

        // Draw color box
        ctx.fillStyle = signalColors[signal.id];
        ctx.fillRect(10, y - 10, 15, 15);
        ctx.strokeStyle = '#999999';
        ctx.strokeRect(10, y - 10, 15, 15);

        // Draw signal name and bit range
        ctx.fillStyle = '#000000';
        ctx.font = '12px Arial';
        ctx.fillText(
          `${signal.name} (Bits: ${formatBitRange(signal)})`,
          35,
          y
        );

        // Add suggested metric if available
        if (signal.suggestedMetric) {
          const textWidth = ctx.measureText(
            `${signal.name} (Bits: ${formatBitRange(signal)})`
          ).width;

          const metricX = textWidth + 45;

          // Draw rounded rectangle for metric tag
          ctx.fillStyle = '#e6f0ff';
          const tagText = signal.suggestedMetric;
          const tagWidth = ctx.measureText(tagText).width + 10;

          ctx.beginPath();
          roundRect(ctx, metricX, y - 12, tagWidth, 16, 3);
          ctx.fill();

          // Draw metric text
          ctx.fillStyle = '#0066cc';
          ctx.font = '10px Arial';
          ctx.fillText(tagText, metricX + 5, y);
        }
      });
    } else {
      ctx.fillStyle = '#666666';
      ctx.font = 'italic 12px Arial';
      ctx.fillText('No mapped signals found', 10, legendStartY + 20);
    }

    // Helper function for drawing rounded rectangles
    function roundRect(ctx: any, x: number, y: number, width: number, height: number, radius: number) {
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
    }

    // Convert canvas to PNG data URL
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl;
  } catch (error) {
    console.error('Error generating bit mapping visualization:', error);
    return '';
  }
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

// In-memory store for cached images
const imageCache: { [key: string]: { image: string, timestamp: number } } = {};

// Helper function to cache images
function getCachedImage(command: any): string | null {
  // Create a hash of the command object to use as a cache key
  const commandStr = JSON.stringify(command);
  const hash = crypto.createHash('md5').update(commandStr).digest('hex');

  const cached = imageCache[hash];
  if (cached && (Date.now() - cached.timestamp < 1000 * 60 * 10)) { // 10 minute cache
    return cached.image;
  }

  return null;
}

// Helper function to store image in cache
function cacheImage(command: any, imageData: string): void {
  const commandStr = JSON.stringify(command);
  const hash = crypto.createHash('md5').update(commandStr).digest('hex');

  imageCache[hash] = {
    image: imageData,
    timestamp: Date.now()
  };
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

export function activate(context: vscode.ExtensionContext) {
  console.log('OBDB extension activated');

  // Register a hover provider for JSON files
  const hoverProvider = vscode.languages.registerHoverProvider('json', {
    async provideHover(document, position, token) {
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
        // We're in a command definition, generate bit mapping visualization
        const command = commandCheck.commandObject;

        // Create the hovercard content
        const markdownContent = new vscode.MarkdownString();

        // Add command name and ID if available
        const commandName = command.name || 'Command';
        const commandId = command.id || '';

        if (command.cmd) {
          const cmdDisplay = typeof command.cmd === 'object' ?
            Object.entries(command.cmd).map(([k, v]) => `${k}: ${v}`).join(', ') :
            command.cmd.toString();
          markdownContent.appendMarkdown(`## ${cmdDisplay}\n\n`);
        } else {
          markdownContent.appendMarkdown(`## ${commandName}\n\n`);
        }

        if (commandId) {
          markdownContent.appendMarkdown(`**ID:** ${commandId}\n\n`);
        }

        // Add header if available
        if (command.hdr) {
          markdownContent.appendMarkdown(`**Header:** ${command.hdr}\n\n`);
        }

        // Add description if available
        if (command.description) {
          markdownContent.appendMarkdown(`${command.description}\n\n`);
        }

        // Check for cached image first
        let imageData = getCachedImage(command);

        if (!imageData) {
          try {
            // Generate image
            imageData = generateBitMappingVisualization(command);

            // Cache the image for future use if valid
            if (imageData) {
              cacheImage(command, imageData);
            }
          } catch (error) {
            console.error('Error generating bit mapping visualization:', error);
          }
        }

        // Add the image to the markdown if available
        if (imageData) {
          markdownContent.appendMarkdown(`![Bit Mapping Visualization](${imageData})\n\n`);
          markdownContent.isTrusted = true;
        }

        return new vscode.Hover(markdownContent);
      }

      // Check for signal ID hover (existing code)
      const lineText = document.lineAt(position.line).text;
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