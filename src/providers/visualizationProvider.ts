import * as vscode from 'vscode';
import { isPositionInCommand } from '../utils/commandParser';
import { Signal } from '../types';

// Track webview panel and state
let visualizationPanel: vscode.WebviewPanel | undefined;
// Only using cursor position, removing mouse interaction type
let currentCommand: any | undefined;

/**
 * Initialize the bitmap visualization provider
 * Shows bitmap visualizations when editing commands
 */
export function createVisualizationProvider(): vscode.Disposable {
  // Set up event handlers
  const disposables: vscode.Disposable[] = [];

  // Listen for text document changes
  disposables.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      updateVisualization(event.document);
    })
  );

  // Listen for cursor movement
  disposables.push(
    vscode.window.onDidChangeTextEditorSelection(event => {
      if (event.textEditor.document.languageId === 'json') {
        updateVisualizationFromCursor(event.textEditor);
      }
    })
  );

  // Listen for editor activation
  disposables.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && editor.document.languageId === 'json') {
        // Use cursor position when switching editors
        updateVisualizationFromCursor(editor);
      } else if (editor) {
        // Hide panel when switching to non-JSON files
        if (visualizationPanel) {
          // Don't dispose the panel, just hide it by moving it to a background column
          visualizationPanel.reveal(vscode.ViewColumn.Beside, false); // Don't focus it
        }
      }
    })
  );

  // Create our webview panel if needed
  disposables.push(
    vscode.commands.registerCommand('obdb.showBitmapVisualization', () => {
      createOrShowVisualizationPanel();

      // If we have a current command, update the visualization
      if (currentCommand) {
        updateVisualizationPanel(currentCommand);
      }
    })
  );

  // Clean up function that disposes all event handlers
  return {
    dispose: () => {
      disposables.forEach(d => d.dispose());
      if (visualizationPanel) {
        visualizationPanel.dispose();
        visualizationPanel = undefined;
      }
    }
  };
}

/**
 * Create or show the visualization panel
 */
function createOrShowVisualizationPanel() {
  // If we already have a panel, show it
  if (visualizationPanel) {
    visualizationPanel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  // Otherwise, create a new panel
  visualizationPanel = vscode.window.createWebviewPanel(
    'bitmapVisualization',
    'Bitmap Visualization',
    {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true
    },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Handle panel disposal
  visualizationPanel.onDidDispose(
    () => {
      visualizationPanel = undefined;
    },
    null,
    []
  );
}

/**
 * Update visualization based on changed document
 */
async function updateVisualization(document: vscode.TextDocument): Promise<void> {
  if (document.languageId !== 'json') return;

  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== document) return;

  // Always update from cursor position, ignoring any potential mouse position
  updateVisualizationFromCursor(editor);
}

/**
 * Update visualization based on cursor position
 */
async function updateVisualizationFromCursor(editor: vscode.TextEditor): Promise<void> {
  if (!editor || editor.document.languageId !== 'json') return;

  // Get current cursor position
  const position = editor.selection.active;
  updateVisualizationFromPosition(editor, position);
}

/**
 * Update visualization based on a given position
 */
async function updateVisualizationFromPosition(editor: vscode.TextEditor, position: vscode.Position): Promise<void> {
  if (!editor || editor.document.languageId !== 'json') return;

  // Check if we're in a command
  const commandCheck = isPositionInCommand(editor.document, position);
  if (!commandCheck.isCommand || !commandCheck.commandObject) {
    currentCommand = undefined;
    return;
  }

  // We're in a command definition, store the command
  const command = commandCheck.commandObject;
  currentCommand = command;

  // If panel exists, update it - use isVisible() check instead of visible property
  if (visualizationPanel) {
    // Only update if the panel is visible to avoid unnecessary processing
    updateVisualizationPanel(command);
  }
}

/**
 * Extract signals from a command object
 */
function extractSignals(command: any): Signal[] {
  // Extract signals from command parameters or signals
  return command.signals ? command.signals.map((signal: any) => {
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
}

/**
 * Format bit range for display (e.g. 0-7 or just 0 if single bit)
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
 * Generate HTML for bitmap visualization table
 */
function generateBitmapHtml(command: any): string {
  try {
    // Extract signals
    const signals = extractSignals(command);

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
    const bitToSignalMap: { [key: number]: Signal } = {};
    signals.forEach(signal => {
      const bitOffset = signal.bitOffset;
      const bitLength = signal.bitLength;

      for (let i = 0; i < bitLength; i++) {
        bitToSignalMap[bitOffset + i] = signal;
      }
    });

    // Generate color map for signals
    const signalColors: { [key: string]: string } = {};
    const tempIds = signals.map(s => s.id);
    const uniqueSignalIds = Array.from(new Set(tempIds));
    uniqueSignalIds.forEach((id, index) => {
      // Use a predefined color palette
      const hue = (index * 137.5) % 360; // Use golden ratio approximation for good distribution
      signalColors[id] = `hsl(${Math.floor(hue)}, 70%, 60%)`;
    });

    // Get unique signals for the legend
    const uniqueSignals = Array.from(
      new Map(signals.map(signal => [signal.id, signal])).values()
    );

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
        html += `<div class="signal-bits">Bits: ${formatBitRange(signal)}</div>`;

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
    return '<div class="error">Error generating bitmap visualization</div>';
  }
}

/**
 * Update the visualization panel with command data
 */
async function updateVisualizationPanel(command: any) {
  if (!visualizationPanel) {
    createOrShowVisualizationPanel();
  }

  // Generate HTML bitmap visualization instead of using image
  const bitmapHtml = generateBitmapHtml(command);

  // Get command details for display
  const commandName = command.name || 'Command';
  const commandId = command.id || '';
  const commandHeader = command.hdr || '';
  const commandDisplay = typeof command.cmd === 'object'
    ? Object.entries(command.cmd).map(([k, v]) => `${k}: ${v}`).join(', ')
    : command.cmd?.toString() || '';

  // Update the webview content
  visualizationPanel!.webview.html = getWebviewContent(
    bitmapHtml,
    commandName,
    commandId,
    commandHeader,
    commandDisplay,
    command.description || ''
  );
}

/**
 * Generate webview HTML content
 */
function getWebviewContent(
  bitmapHtml: string,
  commandName: string,
  commandId: string,
  commandHeader: string,
  commandDisplay: string,
  description: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bitmap Visualization</title>
  <style>
    body {
      padding: 16px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      background-color: var(--vscode-editor-background);
      line-height: 1.5;
    }
    .header {
      margin-bottom: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    h2 {
      margin-top: 0;
      margin-bottom: 8px;
      font-size: 1.3em;
      font-weight: 600;
      color: var(--vscode-editor-foreground);
    }
    h3 {
      margin-top: 0;
      margin-bottom: 12px;
      font-size: 1.1em;
      font-weight: 600;
    }
    .details {
      margin-bottom: 16px;
      font-size: 0.9em;
    }
    .detail-label {
      font-weight: bold;
      display: inline-block;
      min-width: 70px;
    }
    .description {
      margin-bottom: 20px;
      font-style: italic;
    }
    .no-signals {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      margin: 8px 0;
    }
    .error {
      color: var(--vscode-errorForeground);
      margin: 16px 0;
    }

    /* Bitmap visualization styles */
    .bitmap-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
      margin-top: 16px;
    }

    /* Bit grid table styles */
    .bit-grid table {
      border-collapse: separate;
      border-spacing: 2px;
      margin: 0 auto;
    }
    .bit-grid th {
      padding: 5px;
      text-align: center;
      font-weight: 600;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }
    .bit-grid td {
      width: 32px;
      height: 32px;
      text-align: center;
      vertical-align: middle;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 0.8em;
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border);
      background-color: var(--vscode-input-background);
    }
    .bit-grid td.signal-bit {
      font-weight: bold;
      cursor: pointer;
    }
    .bit-grid td.signal-bit:hover {
      transform: scale(1.05);
      box-shadow: 0 0 4px var(--vscode-focusBorder);
      transition: all 0.2s ease;
    }

    /* Signal legend styles */
    .signal-legend {
      border-top: 1px solid var(--vscode-panel-border);
      padding-top: 16px;
      margin-top: 8px;
    }
    .legend-items {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      padding: 6px;
      border-radius: 4px;
      cursor: pointer;
    }
    .legend-item:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    .color-box {
      width: 16px;
      height: 16px;
      margin-right: 8px;
      border-radius: 3px;
      border: 1px solid var(--vscode-panel-border);
    }
    .signal-info {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .signal-name {
      font-weight: 500;
    }
    .signal-bits {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }
    .metric-tag {
      background-color: var(--vscode-badge-background, #4070f4);
      color: var(--vscode-badge-foreground, white);
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 0.8em;
      margin-left: auto;
    }

    /* Responsive design */
    @media (min-width: 768px) {
      .bitmap-container {
        flex-direction: row;
        align-items: flex-start;
      }
      .signal-legend {
        border-top: none;
        border-left: 1px solid var(--vscode-panel-border);
        padding-top: 0;
        padding-left: 20px;
        margin-top: 0;
        min-width: 250px;
        max-width: 300px;
      }
    }

    /* Interactive highlighting */
    .highlight {
      box-shadow: 0 0 0 2px var(--vscode-focusBorder);
      transform: scale(1.05);
      z-index: 10;
      transition: all 0.2s ease;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>${escapeHtml(commandName)}</h2>
  </div>
  <div class="details">
    ${commandId ? `<div><span class="detail-label">ID:</span> ${escapeHtml(commandId)}</div>` : ''}
    ${commandHeader ? `<div><span class="detail-label">Header:</span> ${escapeHtml(commandHeader)}</div>` : ''}
    ${commandDisplay ? `<div><span class="detail-label">Command:</span> ${escapeHtml(commandDisplay)}</div>` : ''}
  </div>
  ${description ? `<div class="description">${escapeHtml(description)}</div>` : ''}

  ${bitmapHtml}

  <script>
    // Add interactivity to highlight related bits and signals
    document.addEventListener('DOMContentLoaded', () => {
      // Get all signal bit cells and legend items
      const signalBitCells = document.querySelectorAll('.signal-bit');
      const legendItems = document.querySelectorAll('.legend-item');

      // Add highlight event listeners to bit cells
      signalBitCells.forEach(cell => {
        cell.addEventListener('mouseenter', () => {
          const signalId = cell.getAttribute('data-signal-id');
          highlightSignal(signalId);
        });

        cell.addEventListener('mouseleave', () => {
          clearHighlights();
        });
      });

      // Add highlight event listeners to legend items
      legendItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
          const signalId = item.getAttribute('data-signal-id');
          highlightSignal(signalId);
        });

        item.addEventListener('mouseleave', () => {
          clearHighlights();
        });
      });

      // Function to highlight all elements related to a signal
      function highlightSignal(signalId) {
        // Highlight cells with this signal
        document.querySelectorAll(\`.signal-bit[data-signal-id="\${signalId}"]\`).forEach(el => {
          el.classList.add('highlight');
        });

        // Highlight legend item for this signal
        document.querySelectorAll(\`.legend-item[data-signal-id="\${signalId}"]\`).forEach(el => {
          el.classList.add('highlight');
        });
      }

      // Function to clear all highlights
      function clearHighlights() {
        document.querySelectorAll('.highlight').forEach(el => {
          el.classList.remove('highlight');
        });
      }
    });
  </script>
</body>
</html>`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}