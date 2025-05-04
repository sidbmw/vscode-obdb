import * as vscode from 'vscode';
import * as path from 'path';
import * as YAML from 'yaml';

/**
 * A CodeLens provider for test cases in YAML files
 * Detects test cases in the format specified and adds run/debug buttons
 */
export class TestCodeLensProvider implements vscode.CodeLensProvider {

    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor() {
        // Watch for changes to YAML files to refresh code lenses
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.languageId === 'yaml') {
                this._onDidChangeCodeLenses.fire();
            }
        });
    }

    /**
     * Provide code lenses for the given document
     * @param document The document to provide code lenses for
     * @param token A cancellation token
     * @returns An array of code lenses or a thenable that resolves to such
     */
    public async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {

        // Check if this is a test file based on the path
        const filePath = document.uri.fsPath;
        if (!this.isTestFile(filePath)) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();

        try {
            // Parse YAML content with source positions enabled
            const yamlDoc = YAML.parseDocument(text, { keepSourceTokens: true });
            const yamlContent = yamlDoc.toJSON();

            // Check if this has the expected structure for a test file
            if (!yamlContent || !yamlContent.test_cases || !Array.isArray(yamlContent.test_cases)) {
                return [];
            }

            // Find the 'test_cases:' property in the document
            const testCasesPattern = /test_cases:/g;
            const match = testCasesPattern.exec(text);

            if (match) {
                // Found the test_cases property
                const matchStart = match.index;
                const startPos = document.positionAt(matchStart);
                const endPos = document.positionAt(matchStart + match[0].length);
                const range = new vscode.Range(startPos, endPos);

                // Create code lenses for run all and debug all actions
                const runAllLens = new vscode.CodeLens(range, {
                    title: "$(play) Run All Tests",
                    command: "obdb.runAllTests",
                    arguments: [document.uri]
                });

                const debugAllLens = new vscode.CodeLens(range, {
                    title: "$(debug) Debug All Tests",
                    command: "obdb.debugAllTests",
                    arguments: [document.uri]
                });

                codeLenses.push(runAllLens, debugAllLens);
            }

            return codeLenses;
        } catch (error) {
            console.error("Error providing code lenses:", error);
            return [];
        }
    }

    /**
     * Check if a file is a test file based on its path
     * @param filePath The path to check
     * @returns True if this is a test file
     */
    private isTestFile(filePath: string): boolean {
        const normalizedPath = filePath.replace(/\\/g, '/');
        // Match paths like tests/test_cases/{model_year}/commands/{test_case}.yaml
        return /tests\/test_cases\/\d+\/commands\/[^\/]+\.ya?ml$/i.test(normalizedPath);
    }
}

/**
 * Create and register the test provider
 * @returns The disposable for the registered test provider
 */
export function createTestProvider(): vscode.Disposable {
    const testCodeLensProvider = new TestCodeLensProvider();

    // Register for YAML files
    const disposable = vscode.languages.registerCodeLensProvider(
        { language: 'yaml', scheme: 'file' },
        testCodeLensProvider
    );

    return disposable;
}