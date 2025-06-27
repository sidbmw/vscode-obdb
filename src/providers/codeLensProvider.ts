import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import { getSupportedModelYearsForCommand, getUnsupportedModelYearsForCommand, generateDebugFilterSuggestion } from '../utils/commandSupportUtils';
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

  async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    if (!document.fileName.includes('signalsets') && !document.fileName.includes('commands')) {
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
              }
            }

            if (hdr && cmdProperty) {
              let commandId = '';
              let cmdValueString = '';

              if (cmdProperty.type === 'object' && cmdProperty.children && cmdProperty.children[0] && cmdProperty.children[0].children) {
                const firstCmdProp = cmdProperty.children[0];
                const cmdKeyNode = firstCmdProp.children![0];
                const cmdValueNode = firstCmdProp.children![1];
                cmdValueString = `${cmdKeyNode.value}${cmdValueNode.value}`;
                commandId = `${hdr}.${cmdValueString}`;
              } else if (cmdProperty.type === 'string') {
                cmdValueString = cmdProperty.value as string;
                commandId = `${hdr}.${cmdValueString}`;
              }

              if (rax && commandId) {
                commandId = `${hdr}.${rax}.${commandId.split('.')[1]}`;
              }

              if (commandId) {
                const range = new vscode.Range(
                  document.positionAt(commandNode.offset),
                  document.positionAt(commandNode.offset + commandNode.length)
                );

                const supportedYears = await getSupportedModelYearsForCommand(commandId);
                const unsupportedYears = await getUnsupportedModelYearsForCommand(commandId);

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
                }

                const codeLens = new vscode.CodeLens(range, { title: title, command: '' });
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
