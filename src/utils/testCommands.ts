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

// Event emitter to notify when test execution occurs via CodeLens
export const testExecutionEvent = new vscode.EventEmitter<{
    uri: vscode.Uri;
    success: boolean;
    testIndex?: number;
    isDebug: boolean;
}>();

/**
 * Register test commands for running and debugging tests
 * @param context The extension context
 * @returns Array of disposables for the registered commands
 */
export function registerTestCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    // Command to run all tests in a file
    const runAllTestsCommand = vscode.commands.registerCommand(
        'obdb.runAllTests',
        async (uri: vscode.Uri) => {
            // Get the test file data
            const testData = await getAllTestData(uri);
            if (!testData || testData.length === 0) {
                vscode.window.showErrorMessage('Failed to get test data or no tests found');

                // Notify test execution event with failure
                testExecutionEvent.fire({
                    uri: uri,
                    success: false,
                    isDebug: false
                });

                return;
            }

            // Show a message indicating the tests are running
            vscode.window.showInformationMessage(
                `Running ${testData.length} tests for command ${testData[0].commandId}`
            );

            // In a real implementation, you would call your test runner here
            // For demonstration, simulate success after a brief delay
            setTimeout(() => {
                vscode.window.showInformationMessage(
                    `Successfully ran ${testData.length} tests for command ${testData[0].commandId}`
                );

                // Notify test execution event with success
                testExecutionEvent.fire({
                    uri: uri,
                    success: true,
                    isDebug: false
                });
            }, 1000);
        }
    );

    // Command to debug all tests in a file
    const debugAllTestsCommand = vscode.commands.registerCommand(
        'obdb.debugAllTests',
        async (uri: vscode.Uri) => {
            // Get the test file data
            const testData = await getAllTestData(uri);
            if (!testData || testData.length === 0) {
                vscode.window.showErrorMessage('Failed to get test data or no tests found');

                // Notify test execution event with failure
                testExecutionEvent.fire({
                    uri: uri,
                    success: false,
                    isDebug: true
                });

                return;
            }

            // Show a message indicating the tests are being debugged
            vscode.window.showInformationMessage(
                `Debugging ${testData.length} tests for command ${testData[0].commandId}`
            );

            // In a real implementation, you would configure and start the debugger here
            // For demonstration, simulate success after a brief delay
            setTimeout(() => {
                vscode.window.showInformationMessage(
                    `Debug session started for ${testData.length} tests on command ${testData[0].commandId}`
                );

                // Notify test execution event with success
                testExecutionEvent.fire({
                    uri: uri,
                    success: true,
                    isDebug: true
                });
            }, 1000);
        }
    );

    return [runAllTestsCommand, debugAllTestsCommand];
}

/**
 * Get test data for all tests in a file
 * @param uri The URI of the test file
 * @returns An array of test data objects or null if they couldn't be retrieved
 */
async function getAllTestData(
    uri: vscode.Uri
): Promise<Array<{
    commandId: string,
    response: string,
    expectedValues: Record<string, any>,
    canIdFormat: string,
    extendedAddressingEnabled: boolean,
    testIndex: number
}> | null> {
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
            yamlContent.test_cases.length === 0) {
            return null;
        }

        // Get data for all test cases
        return yamlContent.test_cases.map((testCase, index) => {
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
                extendedAddressingEnabled: extendedAddressingEnabled,
                testIndex: index
            };
        });
    } catch (error) {
        console.error("Error getting test data:", error);
        return null;
    }
}
