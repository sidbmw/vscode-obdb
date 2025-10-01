#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';

interface CliOptions {
  command: string;
  workspacePath?: string;
  commit?: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const command = args[0];
  let workspacePath: string | undefined;
  let commit = false;

  // Parse remaining arguments
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--commit') {
      commit = true;
    } else if (!workspacePath) {
      workspacePath = args[i];
    }
  }

  return { command, workspacePath, commit };
}

function printUsage(): void {
  console.log('Usage: obdb <command> <workspace-path> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  optimize <workspace-path>  Parse and optimize signalset');
  console.log('');
  console.log('Options:');
  console.log('  --commit                   Apply the optimizations to the file');
}

/**
 * Creates a simple command ID from header, command, and optional receive address
 * @param hdr The header value (e.g. "7E0")
 * @param cmd The command value - can be string or object with single key-value pair
 * @param rax Optional receive address (e.g. "7E8")
 * @returns The command ID string (e.g. "7E0.221100" or "7E0.7E8.221100")
 */
function createSimpleCommandId(hdr: string, cmd: string | Record<string, string>, rax?: string): string {
  let cmdValueString = '';

  if (typeof cmd === 'object') {
    // Format: {"22": "1100"} -> "221100"
    const cmdKey = Object.keys(cmd)[0];
    const cmdValue = cmd[cmdKey];
    cmdValueString = `${cmdKey}${cmdValue}`;
  } else if (typeof cmd === 'string') {
    // Already a string like "221100"
    cmdValueString = cmd;
  }

  let commandId = `${hdr}.${cmdValueString}`;

  // Include RAX in the format if present
  if (rax) {
    commandId = `${hdr}.${rax}.${cmdValueString}`;
  }

  return commandId;
}

/**
 * Gets supported model years for a command ID by checking test_cases directory
 */
async function getSupportedModelYears(workspacePath: string, commandId: string): Promise<string[]> {
  const testCasesPath = path.join(workspacePath, 'tests', 'test_cases');
  const supportedYears: string[] = [];

  if (!fs.existsSync(testCasesPath)) {
    return supportedYears;
  }

  try {
    const years = await fs.promises.readdir(testCasesPath);

    for (const year of years) {
      // Only process directories that look like years (4 digits)
      if (!/^\d{4}$/.test(year)) {
        continue;
      }

      const commandsDir = path.join(testCasesPath, year, 'commands');
      if (!fs.existsSync(commandsDir)) {
        continue;
      }

      // Check if a file exists for this command ID
      const commandFile = path.join(commandsDir, `${commandId}.yaml`);
      if (fs.existsSync(commandFile)) {
        supportedYears.push(year);
      }
    }
  } catch (error) {
    console.error(`Error scanning for supported years:`, error);
  }

  return supportedYears.sort();
}

/**
 * Optimize debug filter by removing years that are actually supported
 * (Standalone version without VSCode dependencies)
 */
function optimizeDebugFilter(existingFilter: any, supportedYears: string[]): any | null | undefined {
  if (!existingFilter) {
    return null;
  }

  const supportedYearNumbers = supportedYears.map(y => parseInt(y, 10));
  let needsOptimization = false;
  const optimized: any = {};

  // Check 'to' property - if a supported year is <= to, we can reduce 'to'
  if (existingFilter.to !== undefined) {
    const supportedYearsAtOrBelowTo = supportedYearNumbers.filter(year => year <= existingFilter.to);
    if (supportedYearsAtOrBelowTo.length > 0) {
      const maxSupportedAtOrBelowTo = Math.max(...supportedYearsAtOrBelowTo);
      const newTo = maxSupportedAtOrBelowTo - 1;
      if (newTo >= 0) {
        optimized.to = newTo;
        needsOptimization = true;
      } else {
        needsOptimization = true;
      }
    } else {
      optimized.to = existingFilter.to;
    }
  }

  // Check 'from' property - if a supported year is >= from, we can increase 'from'
  if (existingFilter.from !== undefined) {
    const supportedYearsAtOrAboveFrom = supportedYearNumbers.filter(year => year >= existingFilter.from);
    if (supportedYearsAtOrAboveFrom.length > 0) {
      const minSupportedAtOrAboveFrom = Math.min(...supportedYearsAtOrAboveFrom);
      const newFrom = minSupportedAtOrAboveFrom + 1;
      if (newFrom <= 3000) {
        optimized.from = newFrom;
        needsOptimization = true;
      } else {
        needsOptimization = true;
      }
    } else {
      optimized.from = existingFilter.from;
    }
  }

  // Check 'years' array - remove any years that are supported
  if (existingFilter.years && Array.isArray(existingFilter.years)) {
    const filteredYears = existingFilter.years.filter((year: number) => !supportedYearNumbers.includes(year));
    if (filteredYears.length < existingFilter.years.length) {
      needsOptimization = true;
      if (filteredYears.length > 0) {
        optimized.years = filteredYears;
      }
    } else {
      optimized.years = existingFilter.years;
    }
  }

  if (!needsOptimization) {
    return null;
  }

  if (Object.keys(optimized).length === 0) {
    return undefined;
  }

  return optimized;
}

interface OptimizationEdit {
  commandId: string;
  path: (string | number)[];
  currentFilter: any;
  optimizedFilter: any | undefined;
}

async function optimizeCommand(workspacePath: string, commit: boolean = false): Promise<void> {
  const signalsetPath = path.join(workspacePath, 'signalsets', 'v3', 'default.json');

  if (!fs.existsSync(signalsetPath)) {
    console.error(`Error: Signalset file not found at ${signalsetPath}`);
    process.exit(1);
  }

  try {
    let content = await fs.promises.readFile(signalsetPath, 'utf-8');
    const rootNode = jsonc.parseTree(content);

    if (!rootNode) {
      console.error('Error: Failed to parse signalset JSON');
      process.exit(1);
    }

    console.log('Root Node:');
    console.log(`Type: ${rootNode.type}`);
    console.log(`Offset: ${rootNode.offset}`);
    console.log(`Length: ${rootNode.length}`);
    console.log(`Children count: ${rootNode.children?.length || 0}`);

    // Find the commands array
    const commandsNode = jsonc.findNodeAtLocation(rootNode, ['commands']);
    if (!commandsNode || !commandsNode.children) {
      console.error('Error: No commands array found in signalset');
      process.exit(1);
    }

    console.log(`\nTotal commands: ${commandsNode.children.length}`);
    console.log('\nCommand IDs with Supported Model Years:');
    console.log('----------------------------------------');

    const editsToApply: OptimizationEdit[] = [];

    // Iterate through each command and generate its ID
    for (let index = 0; index < commandsNode.children.length; index++) {
      const commandNode = commandsNode.children[index];

      // Extract command properties
      const hdrNode = jsonc.findNodeAtLocation(commandNode, ['hdr']);
      const cmdNode = jsonc.findNodeAtLocation(commandNode, ['cmd']);
      const raxNode = jsonc.findNodeAtLocation(commandNode, ['rax']);
      const dbgfilterNode = jsonc.findNodeAtLocation(commandNode, ['dbgfilter']);

      if (!hdrNode || !cmdNode) {
        console.log(`  ${index + 1}. [Missing hdr or cmd]`);
        continue;
      }

      const hdr = jsonc.getNodeValue(hdrNode);
      const cmd = jsonc.getNodeValue(cmdNode);
      const rax = raxNode ? jsonc.getNodeValue(raxNode) : undefined;
      const existingDbgFilter = dbgfilterNode ? jsonc.getNodeValue(dbgfilterNode) : null;

      const commandId = createSimpleCommandId(hdr, cmd, rax);
      const supportedYears = await getSupportedModelYears(workspacePath, commandId);

      const yearsDisplay = supportedYears.length > 0
        ? supportedYears.join(', ')
        : 'No test cases found';

      console.log(`  ${index + 1}. ${commandId}`);
      console.log(`     Years: ${yearsDisplay}`);

      // Check if there's a debug filter to optimize
      if (existingDbgFilter && supportedYears.length > 0) {
        const optimizedFilter = optimizeDebugFilter(existingDbgFilter, supportedYears);

        if (optimizedFilter === undefined) {
          console.log(`     ⚠️  Current dbgfilter: ${JSON.stringify(existingDbgFilter)}`);
          console.log(`     ✅ Recommendation: Remove dbgfilter (all years are supported)`);
          editsToApply.push({
            commandId,
            path: ['commands', index, 'dbgfilter'],
            currentFilter: existingDbgFilter,
            optimizedFilter: undefined
          });
        } else if (optimizedFilter !== null) {
          console.log(`     ⚠️  Current dbgfilter: ${JSON.stringify(existingDbgFilter)}`);
          console.log(`     ✅ Optimized dbgfilter: ${JSON.stringify(optimizedFilter)}`);
          editsToApply.push({
            commandId,
            path: ['commands', index, 'dbgfilter'],
            currentFilter: existingDbgFilter,
            optimizedFilter
          });
        } else if (existingDbgFilter) {
          console.log(`     ✅ Debug filter is already optimal: ${JSON.stringify(existingDbgFilter)}`);
        }
      } else if (existingDbgFilter) {
        console.log(`     Current dbgfilter: ${JSON.stringify(existingDbgFilter)}`);
      }

      console.log('');
    }

    // Apply edits if --commit flag is provided
    if (commit && editsToApply.length > 0) {
      console.log('\n🔧 Applying optimizations...\n');

      // Process edits by using regex to find and replace dbgfilter values
      for (const edit of editsToApply) {
        const commandIndex = edit.path[1] as number;
        const commandNode = commandsNode.children![commandIndex];
        const dbgfilterNode = jsonc.findNodeAtLocation(commandNode, ['dbgfilter']);

        if (!dbgfilterNode) continue;

        // Find the dbgfilter property in the content using the node offset
        const nodeStart = dbgfilterNode.parent!.offset;
        const nodeEnd = dbgfilterNode.parent!.offset + dbgfilterNode.parent!.length;

        // Extract the property text
        const propertyText = content.substring(nodeStart, nodeEnd);

        // Match the dbgfilter pattern: "dbgfilter": <any json object>
        const dbgfilterMatch = propertyText.match(/"dbgfilter"\s*:\s*(\{[^}]*\})/);

        if (!dbgfilterMatch) continue;

        const oldValue = dbgfilterMatch[1];

        if (edit.optimizedFilter === undefined) {
          // Remove the entire dbgfilter property (including comma and whitespace)
          const regex = new RegExp(`\\s*,?\\s*"dbgfilter"\\s*:\\s*${oldValue.replace(/[{}]/g, '\\$&')}\\s*,?\\s*`, 'g');
          const before = content;
          content = content.replace(regex, ' ');
          if (before === content) {
            // Try alternative pattern
            const altRegex = new RegExp(`\\s*"dbgfilter"\\s*:\\s*${oldValue.replace(/[{}]/g, '\\$&')}\\s*,`, 'g');
            content = content.replace(altRegex, '');
          }
          console.log(`  ✅ Removed dbgfilter for ${edit.commandId}`);
        } else {
          // Replace with optimized filter on one line with proper spacing
          // Format: { "to": 2018, "from": 2022 }
          const filterJson = JSON.stringify(edit.optimizedFilter)
            .replace(/^{/, '{ ')      // Add space after opening brace
            .replace(/}$/, ' }')      // Add space before closing brace
            .replace(/":/g, '": ')    // Add space after colon
            .replace(/,"/g, ', "');   // Add space after comma
          const regex = new RegExp(`"dbgfilter"\\s*:\\s*${oldValue.replace(/[{}]/g, '\\$&')}`, 'g');
          content = content.replace(regex, `"dbgfilter": ${filterJson}`);
          console.log(`  ✅ Optimized dbgfilter for ${edit.commandId}`);
        }
      }

      // Write the updated content back to the file
      await fs.promises.writeFile(signalsetPath, content, 'utf-8');
      console.log(`\n✅ Successfully updated ${signalsetPath}`);
      console.log(`📝 Applied ${editsToApply.length} optimization(s)`);
    } else if (editsToApply.length > 0) {
      console.log(`\n💡 Found ${editsToApply.length} optimization(s). Use --commit to apply them.`);
    } else {
      console.log('\n✅ All debug filters are already optimal!');
    }
  } catch (error) {
    console.error('Error reading signalset:', error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const options = parseArgs();

  switch (options.command) {
    case 'optimize':
      if (!options.workspacePath) {
        console.error('Error: workspace-path is required for optimize command');
        printUsage();
        process.exit(1);
      }
      await optimizeCommand(options.workspacePath, options.commit || false);
      break;
    default:
      console.error(`Error: Unknown command '${options.command}'`);
      printUsage();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
