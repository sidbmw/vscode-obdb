import * as fs from 'fs';
import * as path from 'path';

/**
 * Gets all model years that support a specific signal ID
 * @param signalId The signal ID to look up support for
 * @param workspaceRoot The workspace folder root path
 * @returns Array of model years that support the signal
 */
export async function getModelYearsForSignalId(signalId: string, workspaceRoot: string): Promise<string[]> {
  // Find all model year directories
  const testCasesPath = path.join(workspaceRoot, 'tests', 'test_cases');
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