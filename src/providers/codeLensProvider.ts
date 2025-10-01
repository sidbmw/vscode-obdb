import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import { getSupportedModelYearsForCommand, getUnsupportedModelYearsForCommand, generateDebugFilterSuggestion, createSimpleCommandId, optimizeDebugFilter } from '../utils/commandSupportUtils';
import { groupModelYearsByGeneration, formatYearsAsRanges, getGenerationForModelYear } from '../utils/generations';

export class CommandCodeLensProvider implements vscode.CodeLensProvider {
  private onDidChangeCodeLensesEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this.onDidChangeCodeLensesEmitter.event;

  constructor() {
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId === 'json' && (event.document.fileName.includes('signalsets') || event.document.fileName.includes('commands'))) {
        this.onDidChangeCodeLensesEmitter.fire();
      }
    });
  }

  /**
   * Detect the vehicle generation based on file path or supported years
   * This is a heuristic approach - in a real implementation you might want to
   * read vehicle configuration from a specific file or user setting
   */
  private async detectVehicleGeneration(fileName: string, supportedYears: string[]): Promise<any> {
    // For now, we'll try to determine generation from the first supported year
    if (supportedYears.length === 0) {
      return null;
    }

    // Sort years and take the first one as a reference
    const sortedYears = supportedYears.map(y => parseInt(y, 10)).sort((a, b) => a - b);
    const firstYear = sortedYears[0].toString();

    // Use the generation utility to find the generation for this year
    return await getGenerationForModelYear(firstYear);
  }

  /**
   * Calculate suggested rax value by adding 8 to the hex hdr value
   * @param hdr The header value as a hex string (e.g., "7E0")
   * @returns The suggested rax value as a hex string (e.g., "7E8")
   */
  private calculateSuggestedRax(hdr: string): string | null {
    try {
      // Only 11-bit headers (3 characters) are supported.
      if (hdr.length !== 3) {
        return null; // Invalid header length for this calculation
      }
      // Parse hex string to number, add 8, convert back to hex
      const hdrNum = parseInt(hdr, 16);
      if (isNaN(hdrNum)) {
        return null;
      }
      if (hdrNum == 0x7DF) {
        return null;
      }
      const raxNum = hdrNum + 8;
      return raxNum.toString(16).toUpperCase();
    } catch (e) {
      return null;
    }
  }

  async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    if (!document.fileName.includes('signalsets') && !document.fileName.includes('commands')) {
      return [];
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return [];
    }

    const text = document.getText();
    const rootNode = jsonc.parseTree(text);

    if (rootNode && rootNode.type === 'object') {
      const commandsProperty = jsonc.findNodeAtLocation(rootNode, ['commands']);
      if (commandsProperty && commandsProperty.type === 'array' && commandsProperty.children) {
        for (const commandNode of commandsProperty.children) {
          if (commandNode.type === 'object' && commandNode.children) {
            let hdr: string | undefined;
            let cmdProperty: jsonc.Node | undefined;
            let rax: string | undefined;
            let hasDebug = false;
            let existingDbgFilter: any = null;

            for (const prop of commandNode.children) {
              if (prop.type === 'property' && prop.children && prop.children.length === 2) {
                const keyNode = prop.children[0];
                const valueNode = prop.children[1];
                if (keyNode.value === 'hdr') {
                  hdr = valueNode.value as string;
                }
                if (keyNode.value === 'cmd') {
                  cmdProperty = valueNode;
                }
                if (keyNode.value === 'rax') {
                  rax = valueNode.value as string;
                }
                if (keyNode.value === 'dbg' && valueNode.value === true) {
                  hasDebug = true;
                }
                if (keyNode.value === 'dbgfilter') {
                  try {
                    const filterText = document.getText().substring(valueNode.offset, valueNode.offset + valueNode.length);
                    existingDbgFilter = JSON.parse(filterText);
                  } catch (e) {
                    // Ignore parse errors for existing filter
                  }
                }
              }
            }

            if (hdr && cmdProperty) {
              let cmdValue: string | Record<string, string> | undefined;

              if (cmdProperty.type === 'object' && cmdProperty.children && cmdProperty.children[0] && cmdProperty.children[0].children) {
                const firstCmdProp = cmdProperty.children[0];
                const cmdKeyNode = firstCmdProp.children![0];
                const cmdValueNode = firstCmdProp.children![1];
                cmdValue = { [cmdKeyNode.value as string]: cmdValueNode.value as string };
              } else if (cmdProperty.type === 'string') {
                cmdValue = cmdProperty.value as string;
              }

              if (cmdValue) {
                const commandId = createSimpleCommandId(hdr, cmdValue, rax);
                const range = new vscode.Range(
                  document.positionAt(commandNode.offset),
                  document.positionAt(commandNode.offset + commandNode.length)
                );

                const supportedYears = await getSupportedModelYearsForCommand(commandId, workspaceRoot);
                const unsupportedYears = await getUnsupportedModelYearsForCommand(commandId, workspaceRoot);

                // Filter out any years from unsupportedYears that are also in supportedYears
                const finalUnsupportedYears = unsupportedYears.filter(year => !supportedYears.includes(year));

                let title = '';
                if (supportedYears.length === 0 && finalUnsupportedYears.length === 0) {
                  title += 'No information available.';
                } else {
                  if (supportedYears.length > 0) {
                    title += `✅ Supported: ${formatYearsAsRanges(supportedYears)}`;
                  }
                  if (finalUnsupportedYears.length > 0) {
                    if (supportedYears.length > 0) title += ' | ';
                    title += `❌ Unsupported: ${formatYearsAsRanges(finalUnsupportedYears)}`;
                  }
                }                const codeLens = new vscode.CodeLens(range, { title: title, command: '' });
                codeLenses.push(codeLens);

                // Add debug filter suggestion if command has dbg: true
                if (hasDebug && supportedYears.length > 0) {
                  // Try to detect the vehicle generation from the file path or workspace
                  const generation = await this.detectVehicleGeneration(document.fileName, supportedYears);
                  if (generation) {
                    const debugFilter = await generateDebugFilterSuggestion(supportedYears, generation);
                    if (debugFilter) {
                      const debugFilterRange = new vscode.Range(
                        document.positionAt(commandNode.offset),
                        document.positionAt(commandNode.offset + commandNode.length)
                      );

                      const debugFilterTitle = `🔧 Apply debug filter for ${generation.name}`;
                      const debugFilterCodeLens = new vscode.CodeLens(debugFilterRange, {
                        title: debugFilterTitle,
                        command: 'obdb.applyDebugFilter',
                        arguments: [{
                          documentUri: document.uri.toString(),
                          commandRange: debugFilterRange,
                          debugFilter: debugFilter
                        }]
                      });
                      codeLenses.push(debugFilterCodeLens);
                    }
                  }
                }

                // Suggest adding rax filter if missing
                if (!rax && hdr) {
                  const suggestedRax = this.calculateSuggestedRax(hdr);
                  if (suggestedRax) {
                    const raxSuggestionRange = new vscode.Range(
                      document.positionAt(commandNode.offset),
                      document.positionAt(commandNode.offset + commandNode.length)
                    );

                    const raxSuggestionTitle = `💡 Add rax filter: "${suggestedRax}"`;
                    const raxSuggestionCodeLens = new vscode.CodeLens(raxSuggestionRange, {
                      title: raxSuggestionTitle,
                      command: 'obdb.addRaxFilter',
                      arguments: [{
                        documentUri: document.uri.toString(),
                        commandRange: raxSuggestionRange,
                        suggestedRax: suggestedRax
                      }]
                    });
                    codeLenses.push(raxSuggestionCodeLens);
                  }
                }

                // Check existing debug filter for optimization opportunities
                if (existingDbgFilter && supportedYears.length > 0) {
                  const optimizedFilter = optimizeDebugFilter(existingDbgFilter, supportedYears);
                  if (optimizedFilter !== null) {
                    const optimizeRange = new vscode.Range(
                      document.positionAt(commandNode.offset),
                      document.positionAt(commandNode.offset + commandNode.length)
                    );

                    const optimizeTitle = optimizedFilter === undefined
                      ? '🗑️ Remove debug filter (all years supported)'
                      : '⚡ Optimize debug filter (remove supported years)';

                    const optimizeCodeLens = new vscode.CodeLens(optimizeRange, {
                      title: optimizeTitle,
                      command: 'obdb.optimizeDebugFilter',
                      arguments: [{
                        documentUri: document.uri.toString(),
                        commandRange: optimizeRange,
                        optimizedFilter: optimizedFilter
                      }]
                    });
                    codeLenses.push(optimizeCodeLens);
                  }
                }
              }
            }
          }
        }
      }
    }
    return codeLenses;
  }
}

export function createCodeLensProvider(): vscode.Disposable {
  return vscode.languages.registerCodeLensProvider(
    { language: 'json', pattern: '**/{signalsets,commands}/**/*.json' },
    new CommandCodeLensProvider()
  );
}
