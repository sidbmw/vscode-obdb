import { createCanvas } from 'canvas';
import { Command, Signal } from '../types';

/**
 * Helper function for drawing rounded rectangles on canvas
 */
function roundRect(ctx: any, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

/**
 * Helper function to format bit range display
 */
function formatBitRange(signal: Signal): string {
  const startBit = signal.bitOffset;
  const endBit = signal.bitOffset + signal.bitLength - 1;

  if (startBit === endBit) {
    return `${startBit}`;
  } else {
    return `${startBit}-${endBit}`;
  }
}

/**
 * Generates a bitmap visualization of a command's signal mappings
 * @param command The command object to visualize
 * @returns Data URL of the generated visualization image
 */
export function generateBitMappingVisualization(command: Command): string {
  try {
    // Extract signals from command parameters or signals
    const signals = command.signals ? command.signals.map((signal: any) => {
      // Extract bitOffset and bitLength from fmt if available
      const bitOffset = signal.fmt?.bix ?? 0;
      const bitLength = signal.fmt?.len ?? 8;

      return {
        id: signal.id || 'unknown',
        name: signal.name || signal.id || 'Unknown',
        suggestedMetric: signal.suggestedMetric,
        bitOffset,
        bitLength
      };
    }) : command.parameters?.map((param: any) => ({
      id: param.id || 'unknown',
      name: param.name || param.id || 'Unknown',
      suggestedMetric: param.suggestedMetric,
      bitOffset: param.bitOffset || 0,
      bitLength: param.bitLength || 8
    })) || [];

    // Calculate the maximum bit range used by any signal
    const maxBitRange = signals.reduce((max: number, signal: any) => {
      return Math.max(max, signal.bitOffset + signal.bitLength);
    }, 0);

    // Calculate how many bytes we need to display (minimum 1 byte)
    const bytesNeeded = Math.max(1, Math.ceil(maxBitRange / 8));

    // Map of bits to signals
    const bitToSignalMap: { [key: number]: any } = {};
    signals.forEach((signal: any) => {
      const bitOffset = signal.bitOffset;
      const bitLength = signal.bitLength;

      for (let i = 0; i < bitLength; i++) {
        bitToSignalMap[bitOffset + i] = signal;
      }
    });

    // Generate color map for signals
    const signalColors: { [key: string]: string } = {};
    const tempIds = signals.map((s: any) => s.id as string);
    const uniqueSignalIds = Array.from(new Set(tempIds)) as string[];
    uniqueSignalIds.forEach((id, index) => {
      // Use a predefined color palette
      const hue = (index * 137.5) % 360; // Use golden ratio approximation for good distribution
      signalColors[id] = `hsl(${Math.floor(hue)}, 70%, 60%)`;
    });

    // Create a canvas
    const width = 400;
    const height = 200 + (bytesNeeded * 30);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Draw title
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('Bit Mapping Visualization', 10, 20);

    // Add command info if available
    ctx.font = '12px Arial';
    if (command.cmd) {
      const cmdDisplay = typeof command.cmd === 'object' ?
        Object.entries(command.cmd).map(([k, v]) => `${k}: ${v}`).join(', ') :
        command.cmd.toString();
      ctx.fillText('Command: ' + cmdDisplay, 10, 40);
    }

    if (command.hdr) {
      ctx.fillText('Header: ' + command.hdr, 10, 60);
    }

    // Draw bit grid
    const gridStartY = 80;
    const cellSize = 28;
    const headerSize = 20;

    ctx.imageSmoothingEnabled = true;

    // Draw header (bit indices)
    ctx.font = 'bold 11px Arial';
    for (let i = 0; i < 8; i++) {
      ctx.fillText(i.toString(), headerSize + 10 + (i * cellSize) + cellSize/2 - 4, gridStartY - 5);
    }

    // Draw bit grid
    for (let byteIndex = 0; byteIndex < bytesNeeded; byteIndex++) {
      // Draw byte index
      ctx.font = 'bold 11px Arial';
      ctx.fillText(byteIndex.toString(), 10, gridStartY + 16 + (byteIndex * cellSize));

      for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
        const absoluteBitIndex = (byteIndex * 8) + bitIndex;
        const signal = bitToSignalMap[absoluteBitIndex];

        // Draw cell background
        if (signal) {
          ctx.fillStyle = signalColors[signal.id];
        } else {
          ctx.fillStyle = '#f0f0f0';
        }

        const x = headerSize + 10 + (bitIndex * cellSize);
        const y = gridStartY + (byteIndex * cellSize);

        // Draw rounded rectangle
        ctx.beginPath();
        const radius = 3;
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + cellSize - radius, y);
        ctx.quadraticCurveTo(x + cellSize, y, x + cellSize, y + radius);
        ctx.lineTo(x + cellSize, y + cellSize - radius);
        ctx.quadraticCurveTo(x + cellSize, y + cellSize, x + cellSize - radius, y + cellSize);
        ctx.lineTo(x + radius, y + cellSize);
        ctx.quadraticCurveTo(x, y + cellSize, x, y + cellSize - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();

        // Add border
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Add bit index
        ctx.fillStyle = '#000000';
        ctx.font = '10px Arial';
        ctx.fillText(absoluteBitIndex.toString(), x + cellSize/2 - 4, y + cellSize/2 + 4);
      }
    }

    // Draw signal legend
    const legendStartY = gridStartY + (bytesNeeded * cellSize) + 20;
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('Signal Legend', 10, legendStartY);

    // Get unique signals
    const uniqueSignals = Array.from(
      new Map(Object.values(bitToSignalMap)
        .map((signal: any) => [signal.id, signal])
      ).values()
    );

    if (uniqueSignals.length > 0) {
      uniqueSignals.forEach((signal: any, index) => {
        const y = legendStartY + 20 + (index * 20);

        // Draw color box
        ctx.fillStyle = signalColors[signal.id];
        ctx.fillRect(10, y - 10, 15, 15);
        ctx.strokeStyle = '#999999';
        ctx.strokeRect(10, y - 10, 15, 15);

        // Draw signal name and bit range
        ctx.fillStyle = '#000000';
        ctx.font = '12px Arial';
        ctx.fillText(
          `${signal.name} (Bits: ${formatBitRange(signal)})`,
          35,
          y
        );

        // Add suggested metric if available
        if (signal.suggestedMetric) {
          const textWidth = ctx.measureText(
            `${signal.name} (Bits: ${formatBitRange(signal)})`
          ).width;

          const metricX = textWidth + 45;

          // Draw rounded rectangle for metric tag
          ctx.fillStyle = '#e6f0ff';
          const tagText = signal.suggestedMetric;
          const tagWidth = ctx.measureText(tagText).width + 10;

          ctx.beginPath();
          roundRect(ctx, metricX, y - 12, tagWidth, 16, 3);
          ctx.fill();

          // Draw metric text
          ctx.fillStyle = '#0066cc';
          ctx.font = '10px Arial';
          ctx.fillText(tagText, metricX + 5, y);
        }
      });
    } else {
      ctx.fillStyle = '#666666';
      ctx.font = 'italic 12px Arial';
      ctx.fillText('No mapped signals found', 10, legendStartY + 20);
    }

    // Convert canvas to PNG data URL
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl;
  } catch (error) {
    console.error('Error generating bit mapping visualization:', error);
    return '';
  }
}