/**
 * Converts a numeric index into an Excel-like column name (A-Z, AA-ZZ, etc.)
 * @param n The numeric index (0 = A, 25 = Z, 26 = AA, etc.)
 * @returns The Excel-like column reference
 */
export function numberToExcelColumn(bix: number): string {
  let result = '';

  let n = bix / 8; // Convert to byte index

  // Convert to 0-based index
  n = Math.max(0, n);

  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }

  return result;
}

/**
 * Converts a BIX value to its corresponding byte index
 * @param bix The BIX value (bit index)
 * @returns The byte index (bix / 8, integer division)
 */
export function bixToByte(bix: number): number {
  return Math.floor(bix / 8);
}