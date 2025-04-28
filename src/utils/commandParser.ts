import * as vscode from 'vscode';
import { Command, CommandPositionResult, Signal } from '../types';

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