/**
 * VSCode-independent utilities for working with generations data
 * Can be used by both the VSCode extension and CLI tools
 */

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

export class GenerationSet {
  private generations: Generation[];

  constructor(generations: Generation[]) {
    this.generations = generations;
  }

  contains(year: number): boolean {
    return this.generations.some(gen => {
      const start = gen.start_year;
      const end = gen.end_year ?? Infinity; // treat null as "ongoing"
      return year >= start && year <= end;
    });
  }

  get firstYear(): number {
    return Math.min(...this.generations.map(g => g.start_year));
  }

  get lastYear(): number | undefined {
    const lastGen = this.generations[this.generations.length - 1];
    return lastGen.end_year ?? undefined;
  }
}

// Cache the generations to avoid reading the file multiple times
let cachedGenerations: Map<string, { data: Generation[] | null, timestamp: number }> = new Map();
const CACHE_EXPIRY_MS = 30000; // 30 seconds

/**
 * Get all the generations from the generations.yaml file
 * @param workspacePath The workspace folder path
 * @returns Array of generations or null if file doesn't exist or is invalid
 */
export async function getGenerations(workspacePath: string): Promise<Generation[] | null> {
    const now = Date.now();

    // Check cache
    const cached = cachedGenerations.get(workspacePath);
    if (cached && (now - cached.timestamp) < CACHE_EXPIRY_MS) {
        return cached.data;
    }

    try {
        const generationsFilePath = path.join(workspacePath, 'generations.yaml');

        // Check if the file exists
        if (!fs.existsSync(generationsFilePath)) {
            cachedGenerations.set(workspacePath, { data: null, timestamp: now });
            return null;
        }

        // Read and parse the generations file
        const fileContent = fs.readFileSync(generationsFilePath, 'utf8');
        const generationsConfig = YAML.parse(fileContent) as GenerationsConfig;

        if (generationsConfig && Array.isArray(generationsConfig.generations)) {
            const generations = generationsConfig.generations;
            cachedGenerations.set(workspacePath, { data: generations, timestamp: now });
            return generations;
        } else {
            cachedGenerations.set(workspacePath, { data: null, timestamp: now });
            return null;
        }
    } catch (error) {
        console.error("Error loading generations file:", error);
        cachedGenerations.set(workspacePath, { data: null, timestamp: now });
        return null;
    }
}

/**
 * Gets the generation for a specific model year
 * @param modelYear The model year to find the generation for
 * @param workspacePath The workspace path
 * @returns The generation that includes this model year, or null if none found
 */
export async function getGenerationForModelYear(modelYear: string, workspacePath: string): Promise<Generation | null> {
    const generations = await getGenerations(workspacePath);

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
 * @param workspacePath The workspace path
 * @returns Object mapping generation names to arrays of model years
 */
export async function groupModelYearsByGeneration(modelYears: string[], workspacePath: string): Promise<Record<string, string[]>> {
    const generations = await getGenerations(workspacePath);

    if (!generations || !Array.isArray(generations)) {
        // If no generations are defined, return a single group for all years
        return { 'All Years': modelYears };
    }

    const result: Record<string, string[]> = {};
    const ungroupedYears: string[] = [];

    // Try to assign each year to a generation
    for (const year of modelYears) {
        const generation = await getGenerationForModelYear(year, workspacePath);

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
