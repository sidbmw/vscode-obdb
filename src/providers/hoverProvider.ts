import * as vscode from 'vscode';
import { isPositionInCommand } from '../utils/commandParser';
import { getModelYearsForSignalId } from '../utils/modelYears';
import { generateBitMappingVisualization } from '../visualization/bitMapping';
import { getCachedImage, cacheImage } from '../utils/cache';

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

      // Get the word at the position (should be a signal ID)
      const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_]+/);
      if (!wordRange) {
        return undefined;
      }

      const word = document.getText(wordRange);

      // Create the hovercard content
      const markdownContent = new vscode.MarkdownString();

      // Check for signal ID hover - this now happens first before command check
      const lineText = document.lineAt(position.line).text;
      const idRegex = /"id"\s*:\s*"([A-Za-z0-9_]+)"/;
      const match = idRegex.exec(lineText);

      // If we found a signal ID match, get its supported model years
      let isSignalId = false;
      if (match && match[1] === word) {
        isSignalId = true;

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
      }

      // If we have content to show (either signal ID model years or command details), return the hover
      if (markdownContent.value.length > 0) {
        return new vscode.Hover(markdownContent);
      }

      return undefined;
    }
  });
}