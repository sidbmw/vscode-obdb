import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as YAML from 'yaml';

/**
 * Interface for a generation in the generations.yaml file
 */
export interface Generation {
    name: string;
    start_year: number;
    end_year: number | null;
    description: string;
}

/**
 * Interface for the generations.yaml file content
 */
export interface GenerationsConfig {
    generations: Generation[];
}

// Cache the generations to avoid reading the file multiple times
let cachedGenerations: Generation[] | null = null;
let lastGenerationsRead: number = 0;
const CACHE_EXPIRY_MS = 30000; // 30 seconds

/**
 * Get all the generations from the generations.yaml file
 * @returns Array of generations or null if file doesn't exist or is invalid
 */
export async function getGenerations(): Promise<Generation[] | null> {
    const now = Date.now();

    // Return cached value if it's fresh
    if (cachedGenerations !== null && (now - lastGenerationsRead) < CACHE_EXPIRY_MS) {
        return cachedGenerations;
    }

    // Otherwise reload from file
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        cachedGenerations = null;
        return null;
    }

    try {
        const rootFolder = vscode.workspace.workspaceFolders[0];
        const generationsFilePath = path.join(rootFolder.uri.fsPath, 'generations.yaml');

        // Check if the file exists
        if (!fs.existsSync(generationsFilePath)) {
            cachedGenerations = null;
            return null;
        }

        // Read and parse the generations file
        const fileContent = fs.readFileSync(generationsFilePath, 'utf8');
        const generationsConfig = YAML.parse(fileContent) as GenerationsConfig;

        if (generationsConfig && Array.isArray(generationsConfig.generations)) {
            cachedGenerations = generationsConfig.generations;
            lastGenerationsRead = now;
            return cachedGenerations;
        } else {
            cachedGenerations = null;
            return null;
        }
    } catch (error) {
        console.error("Error loading generations file:", error);
        cachedGenerations = null;
        return null;
    }
}

/**
 * Gets the generation for a specific model year
 * @param modelYear The model year to find the generation for
 * @returns The generation that includes this model year, or null if none found
 */
export async function getGenerationForModelYear(modelYear: string): Promise<Generation | null> {
    const generations = await getGenerations();

    if (!generations || !Array.isArray(generations)) {
        return null;
    }

    const year = parseInt(modelYear, 10);
    if (isNaN(year)) {
        return null;
    }

    // Find the generation that includes this model year
    return generations.find(gen =>
        year >= gen.start_year &&
        (gen.end_year === null || year <= gen.end_year)
    ) || null;
}

/**
 * Group model years by generation
 * @param modelYears Array of model years to group
 * @returns Object mapping generation names to arrays of model years
 */
export async function groupModelYearsByGeneration(modelYears: string[]): Promise<Record<string, string[]>> {
    const generations = await getGenerations();

    if (!generations || !Array.isArray(generations)) {
        // If no generations are defined, return a single group for all years
        return { 'All Years': modelYears };
    }

    const result: Record<string, string[]> = {};
    const ungroupedYears: string[] = [];

    // Try to assign each year to a generation
    for (const year of modelYears) {
        const generation = await getGenerationForModelYear(year);

        if (generation) {
            // Create the generation group if it doesn't exist
            if (!result[generation.name]) {
                result[generation.name] = [];
            }

            // Add the year to its generation group
            result[generation.name].push(year);
        } else {
            // If no generation found for this year, add to ungrouped
            ungroupedYears.push(year);
        }
    }

    // Add ungrouped years if there are any
    if (ungroupedYears.length > 0) {
        result['Other Years'] = ungroupedYears;
    }

    return result;
}

/**
 * Group consecutive model years into ranges
 * @param years Array of model years to group
 * @returns String representation with consecutive years grouped into ranges
 */
export function formatYearsAsRanges(years: string[]): string {
    if (!years || years.length === 0) {
        return '';
    }

    // Convert to numbers and sort
    const sortedYears = years.map(year => parseInt(year, 10))
        .filter(year => !isNaN(year))
        .sort((a, b) => a - b);

    if (sortedYears.length === 0) {
        return '';
    }

    const ranges: string[] = [];
    let rangeStart = sortedYears[0];
    let rangeEnd = rangeStart;

    for (let i = 1; i < sortedYears.length; i++) {
        const currentYear = sortedYears[i];

        // If the current year is consecutive to the previous one, extend the range
        if (currentYear === rangeEnd + 1) {
            rangeEnd = currentYear;
        } else {
            // Otherwise, finish the current range and start a new one
            if (rangeStart === rangeEnd) {
                ranges.push(rangeStart.toString());
            } else {
                ranges.push(`${rangeStart}-${rangeEnd}`);
            }
            rangeStart = rangeEnd = currentYear;
        }
    }

    // Add the last range
    if (rangeStart === rangeEnd) {
        ranges.push(rangeStart.toString());
    } else {
        ranges.push(`${rangeStart}-${rangeEnd}`);
    }

    return ranges.join(', ');
}