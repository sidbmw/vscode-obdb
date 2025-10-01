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

  const supportedYearNumbers = supportedYears.map(y => parseInt(y, 10)).sort((a, b) => a - b);
  let needsOptimization = false;
  const optimized: any = {};

  // Find the range of supported years
  const minSupportedYear = Math.min(...supportedYearNumbers);
  const maxSupportedYear = Math.max(...supportedYearNumbers);

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

  // Find gaps (unsupported years) between min and max supported years
  const gaps: number[] = [];
  for (let year = minSupportedYear + 1; year < maxSupportedYear; year++) {
    if (!supportedYearNumbers.includes(year)) {
      gaps.push(year);
    }
  }

  // Check 'years' array - remove any years that are supported, and merge with gaps
  if (existingFilter.years && Array.isArray(existingFilter.years)) {
    const filteredYears = existingFilter.years.filter((year: number) => !supportedYearNumbers.includes(year));

    // Merge filtered years with gaps and remove duplicates
    const mergedYears = [...new Set([...filteredYears, ...gaps])].sort((a, b) => a - b);

    if (filteredYears.length < existingFilter.years.length || mergedYears.length > filteredYears.length) {
      needsOptimization = true;
      if (mergedYears.length > 0) {
        optimized.years = mergedYears;
      }
    } else {
      optimized.years = existingFilter.years;
    }
  } else if (gaps.length > 0) {
    // Add gaps to the years array if they exist and weren't already there
    optimized.years = gaps;
    needsOptimization = true;
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
  commandIndex: number;
  action: 'update' | 'remove' | 'add';
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
      const dbgNode = jsonc.findNodeAtLocation(commandNode, ['dbg']);

      if (!hdrNode || !cmdNode) {
        console.log(`  ${index + 1}. [Missing hdr or cmd]`);
        continue;
      }

      const hdr = jsonc.getNodeValue(hdrNode);
      const cmd = jsonc.getNodeValue(cmdNode);
      const rax = raxNode ? jsonc.getNodeValue(raxNode) : undefined;
      const existingDbgFilter = dbgfilterNode ? jsonc.getNodeValue(dbgfilterNode) : null;
      const hasDbgTrue = dbgNode && jsonc.getNodeValue(dbgNode) === true;

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
            optimizedFilter: undefined,
            commandIndex: index,
            action: 'remove'
          });
        } else if (optimizedFilter !== null) {
          console.log(`     ⚠️  Current dbgfilter: ${JSON.stringify(existingDbgFilter)}`);
          console.log(`     ✅ Optimized dbgfilter: ${JSON.stringify(optimizedFilter)}`);
          editsToApply.push({
            commandId,
            path: ['commands', index, 'dbgfilter'],
            currentFilter: existingDbgFilter,
            optimizedFilter,
            commandIndex: index,
            action: 'update'
          });
        } else if (existingDbgFilter) {
          console.log(`     ✅ Debug filter is already optimal: ${JSON.stringify(existingDbgFilter)}`);
        }
      } else if (existingDbgFilter) {
        console.log(`     Current dbgfilter: ${JSON.stringify(existingDbgFilter)}`);
      } else if (hasDbgTrue && supportedYears.length > 0) {
        // Command has dbg: true but no dbgfilter - suggest adding one
        const supportedYearNumbers = supportedYears.map(y => parseInt(y)).sort((a, b) => a - b);
        const minYear = Math.min(...supportedYearNumbers);
        const maxYear = Math.max(...supportedYearNumbers);

        // Find gaps between min and max
        const gaps: number[] = [];
        for (let year = minYear + 1; year < maxYear; year++) {
          if (!supportedYearNumbers.includes(year)) {
            gaps.push(year);
          }
        }

        const suggestedFilter: any = {
          to: minYear - 1,
          from: maxYear + 1
        };

        if (gaps.length > 0) {
          suggestedFilter.years = gaps;
        }

        console.log(`     ⚠️  Has "dbg": true but no dbgfilter`);
        console.log(`     ✅ Recommendation: Remove "dbg": true and add dbgfilter: ${JSON.stringify(suggestedFilter)}`);
        editsToApply.push({
          commandId,
          path: ['commands', index, 'dbgfilter'],
          currentFilter: null,
          optimizedFilter: suggestedFilter,
          commandIndex: index,
          action: 'add'
        });
      }

      console.log('');
    }

    // Apply edits if --commit flag is provided
    if (commit && editsToApply.length > 0) {
      console.log('\n🔧 Applying optimizations...\n');

      // Process edits in reverse order to avoid offset issues
      // (modifying later parts of the file won't affect earlier offsets)
      const sortedEdits = [...editsToApply].sort((a, b) => b.commandIndex - a.commandIndex);

      for (const edit of sortedEdits) {
        const commandIndex = edit.commandIndex;
        const commandNode = commandsNode.children![commandIndex];

        if (edit.action === 'add') {
          // Add dbgfilter and remove "dbg": true using simple string manipulation
          // Ensure property order: to, years, from
          const filter = edit.optimizedFilter!;
          const orderedFilter: any = {};
          if (filter.to !== undefined) orderedFilter.to = filter.to;
          if (filter.years !== undefined) orderedFilter.years = filter.years;
          if (filter.from !== undefined) orderedFilter.from = filter.from;

          const filterJson = JSON.stringify(orderedFilter)
            .replace(/^{/, '{ ')
            .replace(/}$/, ' }')
            .replace(/":/g, '": ')
            .replace(/,"/g, ', "')
            .replace(/,(\d)/g, ', $1')  // Add space after comma in arrays
            .replace(/\[(\d)/g, '[$1')  // Remove space after opening bracket
            .replace(/(\d)\]/g, '$1]'); // Remove space before closing bracket

          // Find the command line in the content
          const hdrNode = jsonc.findNodeAtLocation(commandNode, ['hdr']);
          if (!hdrNode) continue;

          const commandStart = commandNode.offset;
          const commandEnd = commandNode.offset + commandNode.length;
          let commandText = content.substring(commandStart, commandEnd);

          // Remove "dbg": true, if present
          commandText = commandText.replace(/"dbg"\s*:\s*true\s*,\s*/g, '');

          // Find the first line of the command (everything before "signals")
          const lines = commandText.split('\n');
          if (lines.length > 0) {
            const firstLine = lines[0];
            // Insert dbgfilter at the end of the first line
            // The line should end with a comma, so add the dbgfilter right before the final comma
            if (firstLine.trim().endsWith(',')) {
              // Replace the trailing comma with dbgfilter + comma
              lines[0] = firstLine.replace(/,\s*$/, `, "dbgfilter": ${filterJson},`);
              commandText = lines.join('\n');
            }
          }

          content = content.substring(0, commandStart) + commandText + content.substring(commandEnd);
          console.log(`  ✅ Added dbgfilter and removed "dbg": true for ${edit.commandId}`);
        } else {
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

          if (edit.action === 'remove') {
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
          } else if (edit.action === 'update') {
            // Replace with optimized filter on one line with proper spacing
            // Ensure property order: to, years, from
            const filter = edit.optimizedFilter;
            const orderedFilter: any = {};
            if (filter.to !== undefined) orderedFilter.to = filter.to;
            if (filter.years !== undefined) orderedFilter.years = filter.years;
            if (filter.from !== undefined) orderedFilter.from = filter.from;

            const filterJson = JSON.stringify(orderedFilter)
              .replace(/^{/, '{ ')
              .replace(/}$/, ' }')
              .replace(/":/g, '": ')
              .replace(/,"/g, ', "')
              .replace(/,(\d)/g, ', $1')  // Add space after comma in arrays
              .replace(/\[(\d)/g, '[$1')  // Remove space after opening bracket
              .replace(/(\d)\]/g, '$1]'); // Remove space before closing bracket
            const regex = new RegExp(`"dbgfilter"\\s*:\\s*${oldValue.replace(/[{}]/g, '\\$&')}`, 'g');
            content = content.replace(regex, `"dbgfilter": ${filterJson}`);
            console.log(`  ✅ Optimized dbgfilter for ${edit.commandId}`);
          }
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
