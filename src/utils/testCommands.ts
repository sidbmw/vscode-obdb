import * as vscode from 'vscode';
import * as path from 'path';
import * as YAML from 'yaml';
import * as fs from 'fs';
import * as cp from 'child_process';

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
    errorMessage?: string;
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

            try {
                // Run the Python tests with the test file
                const result = await runPythonTests(uri, false);

                if (!result.success) {
                    vscode.window.showErrorMessage(
                        `Failed to run tests for command ${testData[0].commandId}: ${result.errorMessage}`
                    );
                }

                // Notify test execution event with the result
                testExecutionEvent.fire({
                    uri: uri,
                    success: result.success,
                    isDebug: false,
                    errorMessage: result.errorMessage
                });
            } catch (error: unknown) {
                console.error("Error running tests:", error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Error running tests: ${errorMessage}`);

                // Notify test execution event with failure
                testExecutionEvent.fire({
                    uri: uri,
                    success: false,
                    isDebug: false,
                    errorMessage: errorMessage
                });
            }
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

            try {
                // Start a debug session for the Python tests
                const result = await debugPythonTests(uri);

                // Notify test execution event with the result
                testExecutionEvent.fire({
                    uri: uri,
                    success: result.success,
                    isDebug: true,
                    errorMessage: result.errorMessage
                });
            } catch (error: unknown) {
                console.error("Error debugging tests:", error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Error debugging tests: ${errorMessage}`);

                // Notify test execution event with failure
                testExecutionEvent.fire({
                    uri: uri,
                    success: false,
                    isDebug: true,
                    errorMessage: errorMessage
                });
            }
        }
    );

    return [runAllTestsCommand, debugAllTestsCommand];
}

/**
 * Find the available Python executable (python3 or python)
 * @returns The path to the Python executable
 */
async function findPythonExecutable(): Promise<string> {
    // Try to check if 'python3' is available
    try {
        await new Promise<void>((resolve, reject) => {
            const process = cp.spawn('python3', ['--version']);
            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject();
                }
            });
            process.on('error', reject);
        });
        return 'python3';
    } catch (error) {
        // Try 'python' as fallback
        try {
            await new Promise<void>((resolve, reject) => {
                const process = cp.spawn('python', ['--version']);
                process.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject();
                    }
                });
                process.on('error', reject);
            });
            return 'python';
        } catch (error) {
            throw new Error('No Python executable found. Please make sure either "python" or "python3" is installed and in your PATH.');
        }
    }
}

/**
 * Run Python tests for the given test file
 * @param uri URI of the test file to run
 * @param debug Whether to run in debug mode
 * @returns Promise that resolves to an object with success status and error details
 */
async function runPythonTests(uri: vscode.Uri, debug: boolean = false): Promise<{success: boolean, errorMessage?: string}> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error("No workspace folders found");
    }

    const testFilePath = uri.fsPath;
    const workspacePath = workspaceFolders[0].uri.fsPath;

    // Find the path to the schemas/python directory
    // This should be in tests/schemas/python in the actual repo (not example)
    const schemaPythonPath = await findSchemaPythonPath(workspacePath);

    if (!schemaPythonPath) {
        throw new Error("Could not find the schema's Python directory");
    }

    // Find the Python executable
    const pythonExecutable = await findPythonExecutable();

    // Path to the run_tests.py script
    const runTestsScriptPath = path.join(schemaPythonPath, 'run_tests.py');

    // Check if the run_tests.py script exists
    try {
        await fs.promises.access(runTestsScriptPath, fs.constants.F_OK);
    } catch (error) {
        throw new Error(`Could not find the run_tests.py script at ${runTestsScriptPath}`);
    }

    return new Promise<{success: boolean, errorMessage?: string}>((resolve, reject) => {
        // Use the run_tests.py script to run the test file
        const pythonArgs = [
            runTestsScriptPath,
            testFilePath
        ];

        // Set up environment variables for the test
        const env = { ...process.env };

        // Run the test script
        const pythonProcess = cp.spawn(pythonExecutable, pythonArgs, {
            cwd: path.dirname(schemaPythonPath),
            env: env
        });

        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
            const str = data.toString();
            output += str;
            console.log(`[Python Test] ${str}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            const str = data.toString();
            errorOutput += str;
            console.error(`[Python Test Error] ${str}`);
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                // Tests passed
                resolve({ success: true });
            } else {
                // Tests failed
                console.error(`Python tests failed with code ${code}`);
                console.error(`Error output: ${errorOutput}`);

                // Format a detailed error message
                let errorMessage = `Test execution failed with exit code ${code}`;
                if (errorOutput) {
                    // Clean up error output for display
                    const formattedError = errorOutput.trim()
                        .replace(/\n+/g, '\n')  // Replace multiple newlines with a single one
                        .replace(/\s+$/, '');   // Remove trailing whitespace

                    errorMessage = `${errorMessage}\n\n${formattedError}`;
                }

                resolve({ success: false, errorMessage });
            }
        });

        pythonProcess.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Start a debug session for Python tests
 * @param uri URI of the test file to debug
 * @returns Promise that resolves to an object with success status and error details
 */
async function debugPythonTests(uri: vscode.Uri): Promise<{success: boolean, errorMessage?: string}> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error("No workspace folders found");
    }

    const testFilePath = uri.fsPath;
    const workspacePath = workspaceFolders[0].uri.fsPath;

    // Find the path to the schemas/python directory
    const schemaPythonPath = await findSchemaPythonPath(workspacePath);

    if (!schemaPythonPath) {
        throw new Error("Could not find the schema's Python directory");
    }

    // Find the Python executable
    const pythonExecutable = await findPythonExecutable();

    // Path to the run_tests.py script
    const runTestsScriptPath = path.join(schemaPythonPath, 'run_tests.py');

    // Check if the run_tests.py script exists
    try {
        await fs.promises.access(runTestsScriptPath, fs.constants.F_OK);
    } catch (error) {
        throw new Error(`Could not find the run_tests.py script at ${runTestsScriptPath}`);
    }

    // Create a debug configuration for the Python tests
    const debugConfig = {
        name: 'Python: Debug Tests',
        type: 'python',
        request: 'launch',
        program: runTestsScriptPath,
        args: [testFilePath],
        console: 'integratedTerminal',
        justMyCode: false,  // This allows stepping into library code
        cwd: path.dirname(schemaPythonPath),
        env: {},
        pythonPath: pythonExecutable  // Use the detected Python executable
    };

    try {
        // Start the debug session
        await vscode.debug.startDebugging(undefined, debugConfig);

        // Show a message once the debug session has started
        vscode.window.showInformationMessage(
            `Debug session started for test file: ${path.basename(testFilePath)}`
        );

        // We don't have a way to know if debugging succeeded or failed,
        // so we'll just return success and let user see the results in the debugger
        return { success: true };
    } catch (error: unknown) {
        console.error("Error starting debug session:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            errorMessage: `Failed to start debug session: ${errorMessage}`
        };
    }
}

/**
 * Find the path to the schemas/python directory in the workspace
 * @param workspacePath Path to the workspace root
 * @returns Path to the schemas/python directory or null if not found
 */
async function findSchemaPythonPath(workspacePath: string): Promise<string | null> {
    // In a real workspace, we expect tests/schemas/python
    const expectedPath = path.join(workspacePath, 'tests', 'schemas', 'python');

    try {
        const stats = await fs.promises.stat(expectedPath);
        if (stats.isDirectory()) {
            return expectedPath;
        }
    } catch (err) {
        // Directory doesn't exist, continue with search
    }

    // Fallback: search for the directory
    try {
        const results = await vscode.workspace.findFiles('**/tests/schemas/python/__init__.py', 'node_modules/**');
        if (results.length > 0) {
            return path.dirname(results[0].fsPath);
        }

        // Also try example paths (though we generally shouldn't need this in production)
        const exampleResults = await vscode.workspace.findFiles('**/example-vehicle-repo/tests/schemas/python/__init__.py');
        if (exampleResults.length > 0) {
            return path.dirname(exampleResults[0].fsPath);
        }
    } catch (err) {
        console.error("Error searching for schemas python directory:", err);
    }

    return null;
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
