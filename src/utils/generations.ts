import * as vscode from 'vscode';
import {
    Generation,
    GenerationsConfig,
    getGenerations as getGenerationsCore,
    getGenerationForModelYear as getGenerationForModelYearCore,
    groupModelYearsByGeneration as groupModelYearsByGenerationCore,
    formatYearsAsRanges as formatYearsAsRangesCore
} from './generationsCore';

// Re-export types and pure functions
export { Generation, GenerationsConfig, formatYearsAsRanges } from './generationsCore';

/**
 * Get all the generations from the generations.yaml file
 * @param workspacePath The workspace folder path. If not provided, uses VSCode workspace folders
 * @returns Array of generations or null if file doesn't exist or is invalid
 */
export async function getGenerations(workspacePath?: string): Promise<Generation[] | null> {
    let targetPath: string | null = null;
    if (workspacePath) {
        targetPath = workspacePath;
    } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        targetPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    if (!targetPath) {
        return null;
    }

    return getGenerationsCore(targetPath);
}

/**
 * Gets the generation for a specific model year
 * @param modelYear The model year to find the generation for
 * @param workspacePath Optional workspace path
 * @returns The generation that includes this model year, or null if none found
 */
export async function getGenerationForModelYear(modelYear: string, workspacePath?: string): Promise<Generation | null> {
    let targetPath: string | null = null;
    if (workspacePath) {
        targetPath = workspacePath;
    } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        targetPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    if (!targetPath) {
        return null;
    }

    return getGenerationForModelYearCore(modelYear, targetPath);
}

/**
 * Group model years by generation
 * @param modelYears Array of model years to group
 * @param workspacePath Optional workspace path
 * @returns Object mapping generation names to arrays of model years
 */
export async function groupModelYearsByGeneration(modelYears: string[], workspacePath?: string): Promise<Record<string, string[]>> {
    let targetPath: string | null = null;
    if (workspacePath) {
        targetPath = workspacePath;
    } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        targetPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    if (!targetPath) {
        return { 'All Years': modelYears };
    }

    return groupModelYearsByGenerationCore(modelYears, targetPath);
}
