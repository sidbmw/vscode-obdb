import { Signal } from '../types';
import { escapeHtml, formatBitRange } from './utils';
import { createBitToSignalMap, generateSignalColors, getUniqueSignals } from './signalExtractor';

/**
 * Determines if text should be white or black based on background color brightness
 * Uses the YIQ formula for perceived brightness
 */
function getContrastTextColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');

  // Convert hex to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Calculate perceived brightness using YIQ formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  // Return black for bright backgrounds, white for dark backgrounds
  return brightness >= 128 ? 'black' : 'white';
}

/**
 * Converts a number to alphabetic representation (A, B, C, ..., Z, AA, AB, ...)
 */
function toAlphabetic(num: number): string {
  let result = '';
  while (num >= 0) {
    const remainder = num % 26;
    result = String.fromCharCode(65 + remainder) + result;
    num = Math.floor(num / 26) - 1;
    if (num < 0) break;
  }
  return result;
}

/**
 * Calculate the minimum and maximum value ranges for a signal based on the formula
 * @param signal The signal to calculate ranges for
 * @returns An object containing min and max values or undefined if formula parameters are not available
 */
function calculateFormulaRange(signal: any): { min: number, max: number } | undefined {
  // Extract formula parameters (mul, div, add) from the signal's fmt property
  if (!signal.fmt) {
    return undefined;
  }

  const mul = signal.fmt.mul || 1;
  const div = signal.fmt.div || 1;
  const add = signal.fmt.add || 0;
  const len = signal.fmt.len;

  // If no length specified, we can't calculate the range
  if (typeof len !== 'number') {
    return undefined;
  }

  // Calculate the max possible raw value based on bit length
  const maxRawValue = Math.pow(2, len) - 1;

  // Calculate the range using the formula: x = v * mul / div + add
  const minPossibleValue = (0 * mul / div) + add;
  const maxPossibleValue = (maxRawValue * mul / div) + add;

  // Return the range, rounded to 6 decimal places for display
  return {
    min: Number(minPossibleValue.toFixed(6)),
    max: Number(maxPossibleValue.toFixed(6))
  };
}

/**
 * Generate HTML for bitmap visualization table
 */
export function generateBitmapHtml(command: any, signals: Signal[]): string {
  try {
    if (signals.length === 0) {
      return '<div class="no-signals">No bit mappings found in this command</div>';
    }

    // Calculate the maximum bit range used by any signal
    const maxBitRange = signals.reduce((max, signal) => {
      return Math.max(max, signal.bitOffset + signal.bitLength);
    }, 0);

    // Calculate how many bytes we need to display (minimum 1 byte)
    const bytesNeeded = Math.max(1, Math.ceil(maxBitRange / 8));

    // Map of bits to signals
    const bitToSignalMap = createBitToSignalMap(signals);

    // Generate color map for signals
    const signalColors = generateSignalColors(signals);

    // Get unique signals for the legend
    const uniqueSignals = getUniqueSignals(signals);

    // Build HTML with explicit layout structure
    let html = '<div class="bitmap-container">';

    // Add toggle switch for byte index format in its own row at the top
    html += `<div class="index-format-row">
      <div class="toggle-label">Byte index format:</div>
      <div class="toggle-switch">
        <input type="radio" id="numeric-format" name="index-format" value="numeric" checked>
        <label for="numeric-format">Numeric</label>
        <input type="radio" id="alphabetic-format" name="index-format" value="alphabetic">
        <label for="alphabetic-format">Alphabetic</label>
      </div>
    </div>`;

    // Create a flexible container for the bit grid and legend
    html += '<div class="bitmap-content-container">';

    // Add bit grid table
    html += '<div class="bit-grid">';
    html += '<table>';

    // Table header with bit indices
    html += '<thead><tr><th></th>';
    for (let i = 0; i < 8; i++) {
      html += `<th>${i}</th>`;
    }
    html += '</tr></thead>';

    // Table body with byte rows
    html += '<tbody>';
    for (let byteIndex = 0; byteIndex < bytesNeeded; byteIndex++) {
      // Add data attribute to store both formats for the index
      const alphabeticIndex = toAlphabetic(byteIndex);
      html += `<tr><th class="byte-index" data-numeric="${byteIndex}" data-alphabetic="${alphabeticIndex}">${byteIndex}</th>`;

      for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
        const absoluteBitIndex = (byteIndex * 8) + bitIndex;
        const signal = bitToSignalMap[absoluteBitIndex];

        // Use proper alphabetic representation for absoluteBitIndex
        const alphabeticBitIndex = toAlphabetic(absoluteBitIndex);

        if (signal) {
          // Bit is mapped to a signal
          const color = signalColors[signal.id];
          const textColor = getContrastTextColor(color);
          html += `<td class="bit-cell signal-bit" data-signal-id="${signal.id}" data-numeric="${absoluteBitIndex}" data-alphabetic="${alphabeticBitIndex}" style="background-color: ${color}; color: ${textColor};">${absoluteBitIndex}</td>`;
        } else {
          // Unused bit
          html += `<td class="bit-cell" data-numeric="${absoluteBitIndex}" data-alphabetic="${alphabeticBitIndex}">${absoluteBitIndex}</td>`;
        }
      }

      html += '</tr>';
    }
    html += '</tbody></table>';
    html += '</div>';

    // Add signal legend
    html += '<div class="signal-legend">';
    html += '<div class="legend-content">'; // Add a content wrapper for the sticky positioning
    html += '<h3>Signal Legend</h3>';

    if (uniqueSignals.length > 0) {
      html += '<div class="legend-items">';
      uniqueSignals.forEach(signal => {
        const color = signalColors[signal.id];
        const textColor = getContrastTextColor(color);

        html += `<div class="legend-item" data-signal-id="${signal.id}">`;
        html += `<div class="color-box" style="background-color: ${color}; color: ${textColor};">
        ${signal.id.slice(0, 2)}
        </div>`;
        html += `<div class="signal-info">`;
        html += `<div class="signal-name">${escapeHtml(signal.name)}</div>`;
        html += `<div class="signal-bits">Bits: ${formatBitRange(signal.bitOffset, signal.bitOffset + signal.bitLength - 1)}</div>`;

        // Add formula visualization if fmt properties are available
        const originalSignal = command.signals?.find((s: any) => s.id === signal.id);
        if (originalSignal && originalSignal.fmt) {
          const formulaRange = calculateFormulaRange(originalSignal);
          if (formulaRange) {
            const mul = originalSignal.fmt.mul || 1;
            const div = originalSignal.fmt.div || 1;
            const add = originalSignal.fmt.add || 0;

            // Build formula parts only if they differ from default values
            let formulaParts = ['v'];

            // Add multiplication only if mul is not 1
            if (mul !== 1) {
              formulaParts[0] = `${formulaParts[0]} × ${mul}`;
            }

            // Add division only if div is not 1
            if (div !== 1) {
              formulaParts[0] = `${formulaParts[0]} / ${div}`;
            }

            // Add addition only if add is not 0
            if (add !== 0) {
              formulaParts.push(`${add > 0 ? '+' : '-'} ${Math.abs(add)}`);
            }

            // Combine all parts into the final formula display
            const formulaDisplay = `<code>x = ${formulaParts.join(' ')}</code>`;

            // Only show formula if it's not just "x = v"
            const showFormula = mul !== 1 || div !== 1 || add !== 0;

            if (showFormula) {
              html += `<div class="signal-formula">Formula: ${formulaDisplay}</div>`;
            }

            html += `<div class="formula-range">Range: ${formulaRange.min} to ${formulaRange.max}</div>`;
          }
        }

        if (signal.suggestedMetric) {
          html += `<div class="metric-tag">${escapeHtml(signal.suggestedMetric)}</div>`;
        }

        html += '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<div class="no-signals">No mapped signals found</div>';
    }

    html += '</div>'; // Close legend-content wrapper
    html += '</div>';

    // Close the flexible container
    html += '</div></div>';

    // Add CSS for layout with improved structure and sticky legend
    html += `
    <style>
      .bitmap-container {
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      .index-format-row {
        display: flex;
        align-items: center;
        margin-bottom: 15px;
        width: 100%;
      }

      .toggle-label {
        margin-right: 10px;
        font-weight: bold;
      }

      .bitmap-content-container {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 20px;
        width: 100%;
      }

      .bit-grid {
        flex: 1 1 auto;
        min-width: 300px;
      }

      .signal-legend {
        flex: 0 1 300px;
        min-width: 250px;
      }

      /* Add sticky positioning for the legend content */
      .legend-content {
        position: sticky;
        top: 0;
        max-height: 100vh;
        overflow-y: auto;
        padding-right: 5px;
      }

      @media (max-width: 768px) {
        .bitmap-content-container {
          flex-direction: column;
        }

        .signal-legend {
          width: 100%;
        }

        /* Disable sticky positioning in vertical layout */
        .legend-content {
          position: static;
          max-height: none;
          overflow-y: visible;
          padding-right: 0;
        }
      }
    </style>`;

    return html;
  } catch (error) {
    console.error('Error generating bitmap HTML:', error);
    return '<div class="error">Error generating OBDb workbench</div>';
  }
}