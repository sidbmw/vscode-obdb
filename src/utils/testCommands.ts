import * as vscode from 'vscode';
import * as path from 'path';
import * as YAML from 'yaml';

/**
 * Test case data interface
 */
interface TestCase {
    response: string;
    expected_values: Record<string, any>;
    can_id_format?: string;
    extended_addressing_enabled?: boolean;
}

/**
 * Test file structure interface
 */
interface TestFile {
    command_id: string;
    can_id_format: string;
    extended_addressing_enabled: boolean;
    test_cases: TestCase[];
}

/**
 * Register test commands for running and debugging tests
 * @param context The extension context
 * @returns Array of disposables for the registered commands
 */
export function registerTestCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    // Command to run a test
    const runTestCommand = vscode.commands.registerCommand(
        'obdb.runTest',
        async (uri: vscode.Uri, testIndex: number) => {
            // Get the test file data
            const testData = await getTestData(uri, testIndex);
            if (!testData) {
                vscode.window.showErrorMessage('Failed to get test data');
                return;
            }

            // Show a message indicating the test is running (placeholder)
            // vscode.window.showInformationMessage(
            //     `Running test ${testIndex + 1} for command ${testData.commandId}:\n` +
            //     `Response: ${testData.response.substring(0, 30)}${testData.response.length > 30 ? '...' : ''}\n` +
            //     `Expected values: ${JSON.stringify(testData.expectedValues).substring(0, 50)}...`
            // );

            // In a real implementation, you would call your test runner here
        }
    );

    // Command to debug a test
    const debugTestCommand = vscode.commands.registerCommand(
        'obdb.debugTest',
        async (uri: vscode.Uri, testIndex: number) => {
            // Get the test file data
            const testData = await getTestData(uri, testIndex);
            if (!testData) {
                vscode.window.showErrorMessage('Failed to get test data');
                return;
            }

            // Show a message indicating the test is being debugged (placeholder)
            vscode.window.showInformationMessage(
                `Debugging test ${testIndex + 1} for command ${testData.commandId}:\n` +
                `Response: ${testData.response.substring(0, 30)}${testData.response.length > 30 ? '...' : ''}\n` +
                `Expected values: ${JSON.stringify(testData.expectedValues).substring(0, 50)}...`
            );

            // In a real implementation, you would configure and start the debugger here
        }
    );

    return [runTestCommand, debugTestCommand];
}

/**
 * Get test data from a test file
 * @param uri The URI of the test file
 * @param testIndex The index of the test case in the file
 * @returns The test data or null if it couldn't be retrieved
 */
async function getTestData(
    uri: vscode.Uri,
    testIndex: number
): Promise<{
    commandId: string,
    response: string,
    expectedValues: Record<string, any>,
    canIdFormat: string,
    extendedAddressingEnabled: boolean
} | null> {
    try {
        // Read the test file
        const document = await vscode.workspace.openTextDocument(uri);
        const content = document.getText();

        // Parse YAML content using the YAML parser
        const yamlDoc = YAML.parseDocument(content);
        const yamlContent = yamlDoc.toJSON() as TestFile;

        // Check if this has the expected structure
        if (!yamlContent || !yamlContent.test_cases ||
            !Array.isArray(yamlContent.test_cases) ||
            testIndex >= yamlContent.test_cases.length) {
            return null;
        }

        // Get the test case
        const testCase = yamlContent.test_cases[testIndex];

        // Use test case specific values if available, otherwise fall back to file defaults
        const canIdFormat = testCase.can_id_format || yamlContent.can_id_format;
        const extendedAddressingEnabled =
            testCase.extended_addressing_enabled !== undefined ?
            testCase.extended_addressing_enabled :
            yamlContent.extended_addressing_enabled;

        return {
            commandId: yamlContent.command_id,
            response: testCase.response,
            expectedValues: testCase.expected_values,
            canIdFormat: canIdFormat,
            extendedAddressingEnabled: extendedAddressingEnabled
        };
    } catch (error) {
        console.error("Error getting test data:", error);
        return null;
    }
}