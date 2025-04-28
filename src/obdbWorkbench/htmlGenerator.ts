import { Signal } from '../types';
import { escapeHtml, formatBitRange } from './utils';
import { createBitToSignalMap, generateSignalColors, getUniqueSignals } from './signalExtractor';

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

    // Build HTML for bit grid
    let html = '<div class="bitmap-container">';

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
      html += `<tr><th>${byteIndex}</th>`;

      for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
        const absoluteBitIndex = (byteIndex * 8) + bitIndex;
        const signal = bitToSignalMap[absoluteBitIndex];

        if (signal) {
          // Bit is mapped to a signal
          const color = signalColors[signal.id];
          html += `<td class="bit-cell signal-bit" data-signal-id="${signal.id}" style="background-color: ${color};">${absoluteBitIndex}</td>`;
        } else {
          // Unused bit
          html += `<td class="bit-cell">${absoluteBitIndex}</td>`;
        }
      }

      html += '</tr>';
    }
    html += '</tbody></table>';
    html += '</div>';

    // Add signal legend
    html += '<div class="signal-legend">';
    html += '<h3>Signal Legend</h3>';

    if (uniqueSignals.length > 0) {
      html += '<div class="legend-items">';
      uniqueSignals.forEach(signal => {
        const color = signalColors[signal.id];

        html += `<div class="legend-item" data-signal-id="${signal.id}">`;
        html += `<div class="color-box" style="background-color: ${color};"></div>`;
        html += `<div class="signal-info">`;
        html += `<div class="signal-name">${escapeHtml(signal.name)}</div>`;
        html += `<div class="signal-bits">Bits: ${formatBitRange(signal.bitOffset, signal.bitOffset + signal.bitLength - 1)}</div>`;

        if (signal.suggestedMetric) {
          html += `<div class="metric-tag">${escapeHtml(signal.suggestedMetric)}</div>`;
        }

        html += '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<div class="no-signals">No mapped signals found</div>';
    }

    html += '</div></div>';

    return html;
  } catch (error) {
    console.error('Error generating bitmap HTML:', error);
    return '<div class="error">Error generating OBDb workbench</div>';
  }
}