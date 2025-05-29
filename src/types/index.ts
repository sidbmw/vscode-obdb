import * as vscode from 'vscode';

// Command signal information
export interface Signal {
  id: string;
  name: string;
  suggestedMetric?: string;
  bitOffset: number;
  bitLength: number;
}

// Command structure from JSON files
export interface Command {
  hdr?: string;
  cmd?: any;
  rax?: string;  // Response address extension
  description?: string;
  parameters?: any[];
  signals?: any[];
}

// Result of command position check
export interface CommandPositionResult {
  isCommand: boolean;
  commandObject?: Command;
  range?: vscode.Range;
}

// Cache entry structure
export interface CacheEntry {
  image: string;
  timestamp: number;
}