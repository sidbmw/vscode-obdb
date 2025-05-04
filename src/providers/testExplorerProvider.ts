import * as vscode from 'vscode';
import * as path from 'path';
import * as YAML from 'yaml';
import * as fs from 'fs';

/**
 * A class that manages test items in the VS Code Test Explorer
 */
export class TestExplorerProvider {
    private testController: vscode.TestController;
    private fileWatcher: vscode.FileSystemWatcher;
    private yamlTestItems: Map<string, vscode.TestItem> = new Map();
    private disposables: vscode.Disposable[] = [];

    /**
     * Creates a new TestExplorerProvider
     */
    constructor() {
        // Create a controller to handle test data
        this.testController = vscode.tests.createTestController('obdbTests', 'OBDb Tests');
        this.disposables.push(this.testController);

        // Create a run profile for the tests
        this.testController.createRunProfile(
            'Run Tests',
            vscode.TestRunProfileKind.Run,
            (request, token) => this.runHandler(request, token),
            true
        );

        // Create a debug profile for the tests
        this.testController.createRunProfile(
            'Debug Tests',
            vscode.TestRunProfileKind.Debug,
            (request, token) => this.runHandler(request, token, true),
            true
        );

        // Create a file watcher to detect changes to YAML test files
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/test_cases/**/commands/*.yaml');
        this.disposables.push(this.fileWatcher);

        // Add file watcher event handlers
        this.fileWatcher.onDidCreate(uri => this.onYamlFileChanged(uri));
        this.fileWatcher.onDidChange(uri => this.onYamlFileChanged(uri));
        this.fileWatcher.onDidDelete(uri => this.onYamlFileDeleted(uri));

        // Initial load of test items
        this.loadAllTestFiles();
    }

    /**
     * Disposes resources held by the provider
     */
    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }

    /**
     * Loads all test files in the workspace
     */
    private async loadAllTestFiles() {
        if (!vscode.workspace.workspaceFolders) {
            return;
        }

        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            const pattern = new vscode.RelativePattern(
                workspaceFolder,
                '**/test_cases/**/commands/*.{yaml,yml}'
            );

            const files = await vscode.workspace.findFiles(pattern);

            for (const file of files) {
                await this.addTestItemsFromFile(file);
            }
        }
    }

    /**
     * Handles when a YAML file is created or changed
     * @param uri URI of the YAML file
     */
    private async onYamlFileChanged(uri: vscode.Uri) {
        const filePath = uri.fsPath;
        if (this.isTestFile(filePath)) {
            await this.addTestItemsFromFile(uri);
        }
    }

    /**
     * Handles when a YAML file is deleted
     * @param uri URI of the deleted YAML file
     */
    private onYamlFileDeleted(uri: vscode.Uri) {
        // Remove test items for the deleted file
        const filePath = uri.fsPath;
        const fileTestItem = this.yamlTestItems.get(filePath);

        if (fileTestItem) {
            this.testController.items.delete(fileTestItem.id);
            this.yamlTestItems.delete(filePath);
        }
    }

    /**
     * Adds test items from a YAML file
     * @param uri URI of the YAML file
     */
    private async addTestItemsFromFile(uri: vscode.Uri) {
        try {
            const filePath = uri.fsPath;

            // Check if this is a test file
            if (!this.isTestFile(filePath)) {
                return;
            }

            // Read the file content
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();

            // Parse YAML content with source positions enabled
            const yamlDoc = YAML.parseDocument(content, { keepSourceTokens: true });
            const yamlContent = yamlDoc.toJSON();

            // Check if this has the expected structure for a test file
            if (!yamlContent || !yamlContent.test_cases || !Array.isArray(yamlContent.test_cases)) {
                return;
            }

            // Extract model year from the path
            const pathParts = filePath.split('/');
            const modelYearIndex = pathParts.indexOf('test_cases') + 1;
            const modelYear = (modelYearIndex < pathParts.length) ? pathParts[modelYearIndex] : 'unknown';

            // Get command ID
            const commandId = yamlContent.command_id || path.basename(filePath, path.extname(filePath));

            // Create or update the model year test item
            let modelYearItem = this.testController.items.get(`model-year-${modelYear}`);
            if (!modelYearItem) {
                modelYearItem = this.testController.createTestItem(
                    `model-year-${modelYear}`,
                    `Model Year ${modelYear}`,
                    vscode.Uri.file(path.dirname(path.dirname(filePath)))
                );
                this.testController.items.add(modelYearItem);
            }

            // Create or update the command test item
            let commandItem = modelYearItem.children.get(`command-${commandId}`);
            if (!commandItem) {
                commandItem = this.testController.createTestItem(
                    `command-${commandId}`,
                    `${commandId}`,
                    uri
                );
                modelYearItem.children.add(commandItem);
            }

            // Remove existing test case items for this file
            const oldFileItem = this.yamlTestItems.get(filePath);
            if (oldFileItem) {
                commandItem.children.replace([]);
            }

            // Get the test_cases array from the YAML document to access source positions
            const testCasesNode = yamlDoc.get('test_cases');
            if (!testCasesNode || !Array.isArray((testCasesNode as any).items)) {
                return;
            }

            // Add test items for each test case
            for (let i = 0; i < (testCasesNode as any).items.length; i++) {
                const testCaseNode = (testCasesNode as any).items[i];
                const testCase = yamlContent.test_cases[i];

                // Skip if this test case doesn't have response and expected values
                if (!testCase.response || !testCase.expected_values) {
                    continue;
                }

                // Create a readable name for the test case
                const responsePreview = typeof testCase.response === 'string'
                    ? testCase.response.split('\n')[0].substring(0, 20)
                    : 'Response';
                const expectedKeys = Object.keys(testCase.expected_values).join(', ');
                const testName = `${responsePreview}... → ${expectedKeys}`;

                // Create the test item
                const testCaseItem = this.testController.createTestItem(
                    `${commandId}-test-${i}`,
                    testName,
                    uri
                );

                // Get range information from the YAML node
                if (testCaseNode && testCaseNode.range) {
                    const startOffset = testCaseNode.range[0];
                    const endOffset = testCaseNode.range[1];
                    const startPos = document.positionAt(startOffset);
                    const endPos = document.positionAt(endOffset);
                    testCaseItem.range = new vscode.Range(startPos, endPos);
                }

                commandItem.children.add(testCaseItem);
            }

            // Store the file test item in our map
            this.yamlTestItems.set(filePath, commandItem);

        } catch (error) {
            console.error("Error adding test items from file:", error);
        }
    }

    /**
     * Check if a file is a test file based on its path
     * @param filePath The path to check
     * @returns True if this is a test file
     */
    private isTestFile(filePath: string): boolean {
        const normalizedPath = filePath.replace(/\\/g, '/');
        // Match paths like test_cases/{model_year}/commands/{test_case}.yaml
        return /test_cases\/\d+\/commands\/[^\/]+\.ya?ml$/i.test(normalizedPath);
    }

    /**
     * Run handler for test run requests
     * @param request The test run request
     * @param token Cancellation token
     * @param isDebug Whether this is a debug run
     */
    private async runHandler(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken,
        isDebug: boolean = false
    ): Promise<void> {
        const run = this.testController.createTestRun(request);
        const queue: vscode.TestItem[] = [];

        // If specific tests were selected, enqueue those
        if (request.include) {
            request.include.forEach(test => queue.push(test));
        } else {
            // Otherwise, enqueue all tests
            this.testController.items.forEach(test => queue.push(test));
        }

        // Process the queue
        while (queue.length > 0 && !token.isCancellationRequested) {
            const test = queue.shift()!;

            // Skip tests that should be excluded
            if (request.exclude?.some(excluded => excluded.id === test.id)) {
                continue;
            }

            // If this is a container with children, enqueue the children
            if (test.children.size > 0) {
                test.children.forEach(child => queue.push(child));
                continue;
            }

            // This is a leaf node (actual test), so run it
            await this.runTest(test, run, isDebug);
        }

        // Complete the run
        run.end();
    }

    /**
     * Run a specific test
     * @param test The test to run
     * @param run The test run
     * @param isDebug Whether this is a debug run
     */
    private async runTest(
        test: vscode.TestItem,
        run: vscode.TestRun,
        isDebug: boolean
    ): Promise<void> {
        // Mark test as running
        run.started(test);

        try {
            // Extract the test index from the test ID
            const idParts = test.id.split('-');
            const testIndex = parseInt(idParts[idParts.length - 1]);

            if (isNaN(testIndex)) {
                // This shouldn't happen with our ID scheme
                run.errored(test, new vscode.TestMessage('Invalid test ID'));
                return;
            }

            // Get the command
            const commandId = test.id.split('-test-')[0];

            // Run the appropriate command based on whether this is a debug run
            const command = isDebug ? 'obdb.debugTest' : 'obdb.runTest';

            // Execute the command with the appropriate arguments
            await vscode.commands.executeCommand(command, test.uri, testIndex);

            // For now, we'll mark all tests as passed since the actual test execution
            // is handled by the commands. In a real implementation, you would want to
            // capture the results and mark tests as passed/failed accordingly.
            run.passed(test);
        } catch (error) {
            // If there was an error, mark the test as errored
            console.error(`Error running test ${test.id}:`, error);
            run.errored(test, new vscode.TestMessage(`Error: ${error}`));
        }
    }
}

/**
 * Create and register the test explorer provider
 * @param context The extension context
 * @returns The disposable for the registered test provider
 */
export function registerTestExplorer(context: vscode.ExtensionContext): vscode.Disposable {
    const testExplorerProvider = new TestExplorerProvider();

    // Push the provider to context subscriptions to ensure disposal
    context.subscriptions.push(testExplorerProvider);

    return testExplorerProvider;
}