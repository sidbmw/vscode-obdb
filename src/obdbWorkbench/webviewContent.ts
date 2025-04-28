import { escapeHtml } from './utils';

/**
 * Generate webview HTML content
 */
export function getWebviewContent(
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
  <title>OBDb workbench</title>
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

    /* OBDb workbench styles */
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