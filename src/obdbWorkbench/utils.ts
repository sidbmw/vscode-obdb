/**
 * Utility functions for the OBDb workbench
 */

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format bit range for display (e.g. 0-7 or just 0 if single bit)
 */
export function formatBitRange(startBit: number, endBit: number): string {
  if (startBit === endBit) {
    return `${startBit}`;
  } else {
    return `${startBit}-${endBit}`;
  }
}