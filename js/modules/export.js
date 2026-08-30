// =============================================================================
// Cohin Inventory System — Export / Import / Backup / Print / Variance
// =============================================================================

import { state } from './state.js';
import {
  formatStockingQty,
  calculateSingleStockingQtyTotal,
  getBreakdownParts,
  formatStockingQtyAndRemarksForDisplay,
  simplifyBreakdownForDisplay,
  isShortenBreakdownOn,
  isSimplifyBreakdownOn,
  convertToExcelFormula,
  inferCapacity,
  renderBreakdownCellHtml,
  escapeHtml,
} from './inventory.js';
import { saveInventoryData, saveHistoryData, saveDataToAPI } from './api.js';
import { logTransaction, renderHistoryLog, prependHistoryLog } from './history.js';
import { showToast, customConfirm, generateBackupFilename, generateReportFilename } from './ui.js';

// --- Lazy XLSX Loader ---
let xlsxLoadPromise = null;
export function loadXLSX() {
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  if (xlsxLoadPromise) return xlsxLoadPromise;
  xlsxLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/xlsx/dist/xlsx.full.min.js';
    script.onload = () => resolve();
    script.onerror = () => {
      xlsxLoadPromise = null;
      reject(new Error('Failed to load XLSX library.'));
    };
    document.head.appendChild(script);
  });
  return xlsxLoadPromise;
}

// --- Export Report ---

export function exportReportFile() {
  const dataForExport = [['MATERIAL CODE', 'Stocking Qty', 'Total per Row', 'Remarks', 'Building/Rack']];
  state.originalRowsOrder.forEach(row => {
    const code = row.dataset.code;
    const stockingQty = row.dataset.stockingQty;
    const formula = convertToExcelFormula(stockingQty);
    const remarks = JSON.parse(row.dataset.remarks || '[]').join(' | ');
    const locations = JSON.parse(row.dataset.locations || '[]')
      .filter(l => l)
      .join(' | ');
    dataForExport.push([code, stockingQty, formula, remarks, locations]);
  });
  if (dataForExport.length <= 1) {
    showToast('No data to export!', 'error');
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet(dataForExport);
  for (let i = 1; i < dataForExport.length; i++) {
    const cellAddress = 'C' + (i + 1);
    const cell = ws[cellAddress];
    if (cell && typeof cell.v === 'string' && cell.v.startsWith('=')) {
      cell.t = 'f';
      cell.f = cell.v.substring(1);
      delete cell.v;
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory Data');
  XLSX.writeFile(wb, generateReportFilename());
  logTransaction('EXPORT REPORT', '-', 'Human-readable report exported.');
}

// --- Print Inventory ---

export function printInventory() {
  const dateValue = document.getElementById('currentDate').value;
  const [year, month, day] = dateValue.split('-');
  const formattedDate = `${month} / ${day} / ${year}`;
  const shiftValue = document.getElementById('currentShift').value;
  const shiftAbbr = shiftValue === 'Day Shift' ? 'D/S' : 'N/S';
  const timeValue = document.getElementById('currentTime').value;
  let [hours_val, minutes] = timeValue.split(':');
  let hours = parseInt(hours_val);
  const displayHours = hours % 12 || 12;
  const ampm_str = hours >= 12 ? 'PM' : 'AM';
  const formattedTime = `${displayHours}:${minutes}${ampm_str}`;

  const includeColors = document.getElementById('includePrintColors').checked;
  const includeBldgRackCheckbox = document.getElementById('includeBldgRackPrintCheckbox');
  const includeBldgRackInPrint = includeBldgRackCheckbox ? includeBldgRackCheckbox.checked : false;
  const enableMovementFilter = document.getElementById('enableMovementFilter');
  const isMainMovementActive = enableMovementFilter.checked;
  const moveDateFrom = document.getElementById('moveDateFrom');
  const moveTimeFrom = document.getElementById('moveTimeFrom');
  const moveDateTo = document.getElementById('moveDateTo');
  const moveTimeTo = document.getElementById('moveTimeTo');

  let showMarking = document.getElementById('enableMovementMarking').checked;
  let dateFrom = document.getElementById('printDateFrom').value;
  let timeFrom = document.getElementById('printTimeFrom').value || '00:00';
  let dateTo = document.getElementById('printDateTo').value;
  let timeTo = document.getElementById('printTimeTo').value || '23:59';

  if (isMainMovementActive) {
    showMarking = true;
    dateFrom = moveDateFrom.value;
    timeFrom = moveTimeFrom.value || '00:00';
    dateTo = moveDateTo.value;
    timeTo = moveTimeTo.value || '23:59';
  }

  let movedItems = new Set();
  if (showMarking && (dateFrom || dateTo)) {
    let start = dateFrom ? new Date(`${dateFrom}T${timeFrom}`) : new Date(0);
    let end = dateTo ? new Date(`${dateTo}T${timeTo}`) : new Date();
    if (isNaN(start.getTime())) start = new Date(0);
    if (isNaN(end.getTime())) end = new Date();
    state.transactionHistory.forEach(log => {
      const logDate = new Date(log.timestamp);
      if (logDate >= start && logDate <= end) {
        if (log.action === 'BULK WITHDRAW') {
          const parts = log.details.split(', ');
          parts.forEach(p => {
            const codeMatch = p.match(/^(.*?) \(/);
            if (codeMatch) movedItems.add(codeMatch[1].trim());
          });
        } else if (log.code && log.code !== '-') {
          movedItems.add(log.code.trim());
        }
      }
    });
  }

  const inventoryTableBody = document.getElementById('inventoryTableBody');
  const rows = Array.from(inventoryTableBody.querySelectorAll('tr'));
  let tableRowsHtml = '';
  let printCount = 0;
  rows.forEach(row => {
    const code = row.dataset.code;
    const stockingQty = row.dataset.stockingQty;
    const remarks = JSON.parse(row.dataset.remarks || '[]');
    const isMoved = showMarking && movedItems.has(code);
    if (isMainMovementActive && !isMoved) return;
    printCount++;

    let printFormatted = formatStockingQty(stockingQty);
    let printRemarks = remarks;
    let printLocations = includeBldgRackInPrint ? JSON.parse(row.dataset.locations || '[]') : [];
    if (isSimplifyBreakdownOn()) {
      const simplifiedPrint = simplifyBreakdownForDisplay(printFormatted, remarks, printLocations);
      printFormatted = simplifiedPrint.formatted;
      printRemarks = simplifiedPrint.remarks;
      printLocations = simplifiedPrint.locations;
    }
    let breakdownHtml;
    if (includeColors) {
      breakdownHtml = formatStockingQtyAndRemarksForDisplay(printFormatted, printRemarks, printLocations, isShortenBreakdownOn());
    } else {
      const shorten = isShortenBreakdownOn();
      breakdownHtml = getBreakdownParts(printFormatted)
        .map((part, index) => {
          const trimmedPart = part.trim();
          let displayText = trimmedPart;
          if (shorten) {
            const multMatch = trimmedPart.match(/^([\d.,]+)\s*\u00d7/);
            if (multMatch) displayText = `(${multMatch[1]})`;
          }
          const loc = (printLocations[index] || '').trim();
          const locTag = loc ? `<span class="location-tag" title="Building/Rack">${escapeHtml(loc)}</span>` : '';
          return `${escapeHtml(displayText)}${locTag}`;
        })
        .join(' | ');
    }

    tableRowsHtml += `
        <tr>
            <td style="text-align: center; width: 30px;">${printCount}</td>
            ${showMarking ? `<td style="text-align: center; width: 30px; font-weight: bold; color: red;">${isMoved ? '\u2605' : ''}</td>` : ''}
            <td>${escapeHtml(code)}</td>
            <td>${breakdownHtml}</td>
        </tr>
    `;
    if (isMainMovementActive) {
      tableRowsHtml += `<tr style="height: 30px;"><td></td>${showMarking ? '<td></td>' : ''}<td></td><td></td></tr>`;
    }
  });

  const printWindow = window.open('', '_blank');
  const totalCols = showMarking ? 4 : 3;
  const userNameVal = document.getElementById('userName').value;
  printWindow.document.write(`
      <html>
      <head>
          <title>Print Inventory</title>
          <style>
              body { font-family: Arial, sans-serif; margin: 10px 20px; color: #000; }
              .header-row td { border: none !important; padding: 0 !important; background-color: transparent !important; }
              .header { text-align: center; font-weight: bold; font-size: 1.1em; margin-bottom: 2px; }
              .info-line { display: flex; justify-content: space-between; font-weight: bold; border-top: 2px solid black; border-bottom: 2px solid black; padding: 2px 0; margin-bottom: 5px; font-size: 0.95em; }
              .section-title { color: red; text-decoration: underline; font-weight: bold; margin-top: 5px; margin-bottom: 5px; font-size: 1.05em; }
              table { width: 100%; border-collapse: collapse; margin-top: 0px; }
              th, td { border: 1px solid black; padding: 2px 5px; text-align: left; font-size: 0.9em; }
              th { background-color: #d3d3d3; font-weight: bold; }
              tbody tr:nth-child(even) td { background-color: #e5e5e5 !important; }
              .footer { margin-top: 15px; font-weight: bold; font-size: 0.95em; }
              .color-green { color: green; font-weight: bold; }
              .color-orange { color: #B8960C; font-weight: bold; }
              .color-pink { color: #ff69b4; font-weight: bold; }
              .color-grey { color: grey; font-weight: normal; }
              .location-tag { color: #555; font-family: 'Courier New', monospace; font-size: 0.65em; font-weight: 600; letter-spacing: 0.01em; white-space: nowrap; vertical-align: super; margin-left: 1px; }
              @media print { @page { margin: 0.5cm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } thead { display: table-header-group; } }
          </style>
      </head>
      <body>
          <table>
              <thead>
                  <tr class="header-row">
                      <td colspan="${totalCols}">
                          <div class="header">PACKAGING MATERIALS DAILY COUNT SHEET - COHIN (BLDG. 1&2)</div>
                          <div class="info-line">
                              <span>Date / Shift : ${formattedDate} ${shiftAbbr}</span>
                              <span>TIME COUNTED: ${formattedTime}</span>
                          </div>
                          <div class="section-title">LABELS & PLASTIC</div>
                      </td>
                  </tr>
                  <tr>
                      <th style="text-align: center; width: 30px;">NO.</th>
                      ${showMarking ? '<th style="text-align: center; width: 30px;">M</th>' : ''}
                      <th>ITEM CODE</th>
                      <th>ACTUAL COUNT BREAKDOWN</th>
                  </tr>
              </thead>
              <tbody>
                  ${tableRowsHtml}
              </tbody>
          </table>
          ${userNameVal.trim() ? `<div class="footer">COUNTED BY: ${escapeHtml(userNameVal)}</div>` : ''}
          <script>
              window.onload = function() {
                  window.print();
                  window.onafterprint = function() { window.close(); };
              };
          <\/script>
      </body>
      </html>
  `);
  printWindow.document.close();
  logTransaction('PRINT', '-', 'Inventory count sheet printed.');
}

// --- Backup ---

export function exportBackupFile() {
  if (state.originalRowsOrder.length === 0) {
    showToast('No inventory data to backup.', 'error');
    return;
  }
  const wb = XLSX.utils.book_new();
  const inventoryData = [['MATERIAL_CODE', 'STOCKING_QTY', 'TOTAL_WITH_FORMULA', 'REMARKS_JSON', 'LOCATIONS_JSON']];
  state.originalRowsOrder.forEach(row => {
    const stockingQty = row.dataset.stockingQty;
    const formula = convertToExcelFormula(stockingQty);
    inventoryData.push([
      row.dataset.code,
      stockingQty,
      formula,
      row.dataset.remarks,
      row.dataset.locations || '[]',
    ]);
  });
  const wsInventory = XLSX.utils.aoa_to_sheet(inventoryData);
  for (let i = 1; i < inventoryData.length; i++) {
    const cellAddress = 'C' + (i + 1);
    const cell = wsInventory[cellAddress];
    if (cell && typeof cell.v === 'string' && cell.v.startsWith('=')) {
      cell.t = 'f';
      cell.f = cell.v.substring(1);
      delete cell.v;
    }
  }
  XLSX.utils.book_append_sheet(wb, wsInventory, 'Inventory_Backup');

  const historyData = [['Timestamp', 'Action', 'Code', 'Details']];
  state.transactionHistory.forEach(log => {
    historyData.push([log.timestamp, log.action, log.code, log.details]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(historyData), 'Transaction_History');

  const capData = [['Material Code', 'Pallet Capacity']];
  Object.keys(state.palletCapacities).forEach(code => {
    capData.push([code, state.palletCapacities[code]]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(capData), 'Pallet_Capacities');

  XLSX.writeFile(wb, generateBackupFilename());
  logTransaction('BACKUP', '-', 'Full inventory state backed up.');
}

export function importBackupFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const invSheet = workbook.Sheets['Inventory_Backup'] || workbook.Sheets[workbook.SheetNames[0]];
      const invData = XLSX.utils.sheet_to_json(invSheet);
      if (
        !invData.length ||
        !invData[0].hasOwnProperty('MATERIAL_CODE') ||
        !invData[0].hasOwnProperty('STOCKING_QTY') ||
        !invData[0].hasOwnProperty('REMARKS_JSON')
      ) {
        showToast('Invalid Backup file format.', 'error');
        return;
      }
      if (!(await customConfirm('This will overwrite the current inventory and history. Continue?'))) return;

      const { renderRow } = await import('./inventory.js');
      const inventoryTableBody = document.getElementById('inventoryTableBody');
      inventoryTableBody.innerHTML = '';
      state.originalRowsOrder = [];
      state.rowsByCode = new Map();
      invData.forEach(item => {
        let remarksArray = [];
        try {
          remarksArray = JSON.parse(item.REMARKS_JSON);
        } catch (err) {
          console.error(`Could not parse remarks for ${item.MATERIAL_CODE}:`, item.REMARKS_JSON);
        }
        let locationsArray = [];
        if (item.LOCATIONS_JSON) {
          try {
            locationsArray = JSON.parse(item.LOCATIONS_JSON);
          } catch (err) {
            console.error(`Could not parse locations for ${item.MATERIAL_CODE}:`, item.LOCATIONS_JSON);
          }
        }
        renderRow(
          {
            code: item.MATERIAL_CODE,
            stockingQty: String(item.STOCKING_QTY || ''),
            remarks: Array.isArray(remarksArray) ? remarksArray : [],
            locations: Array.isArray(locationsArray) ? locationsArray : [],
          },
          false
        );
      });
      const { applyFiltersAndSort } = await import('./inventory.js');
      await applyFiltersAndSort();
      saveInventoryData();

      const histSheet = workbook.Sheets['Transaction_History'];
      if (histSheet) {
        const histData = XLSX.utils.sheet_to_json(histSheet);
        state.transactionHistory = histData.map(h => ({
          timestamp: h.Timestamp,
          action: h.Action,
          code: h.Code,
          details: h.Details,
        }));
        renderHistoryLog();
        saveHistoryData();
      }

      const capSheet = workbook.Sheets['Pallet_Capacities'];
      if (capSheet) {
        const capData = XLSX.utils.sheet_to_json(capSheet);
        state.palletCapacities = {};
        capData.forEach(c => {
          state.palletCapacities[c['Material Code']] = c['Pallet Capacity'];
        });
        saveDataToAPI(['palletCapacities']);
      }

      logTransaction('RESTORE', '-', `Full inventory state restored from ${file.name}.`);
    } catch (err) {
      showToast('Error reading the backup file.', 'error');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

// --- Variance Compare ---

export function compareVariance(file, excelInventory) {
  const varianceResults = [];
  const systemInventoryMap = {};
  state.originalRowsOrder.forEach(row => {
    const code = row.dataset.code;
    const qty = calculateSingleStockingQtyTotal(formatStockingQty(row.dataset.stockingQty));
    systemInventoryMap[code] = qty;
  });

  const allKeys = new Set([...Object.keys(systemInventoryMap), ...Object.keys(excelInventory)]);
  allKeys.forEach(key => {
    const sysQty = systemInventoryMap[key] || 0;
    const excelQty = excelInventory[key] || 0;
    const variance = sysQty - excelQty;
    if (sysQty !== 0 || excelQty !== 0) {
      varianceResults.push({ code: key, sysQty, excelQty, variance });
    }
  });
  varianceResults.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  return varianceResults;
}
