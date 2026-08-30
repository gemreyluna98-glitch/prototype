// =============================================================================
// Cohin Inventory System — Transaction History
// History table rendering, pagination, search, detailed item reports.
// =============================================================================

import { state } from './state.js';
import { escapeHtml, formatStockingQty, calculateSingleStockingQtyTotal, formatStockingQtyAndRemarksForDisplay, renderBreakdownCellHtml } from './inventory.js';
import { saveHistoryData } from './api.js';

const HISTORY_PAGE_SIZE = 50;

export function getHistoryRowBadgeClass(action) {
  const a = (action || '').toUpperCase();
  if (a.includes('DELETE') || a.includes('CLEAR')) return 'history-badge-red';
  if (a.includes('DELIVERY') || a.includes('RESTORE') || a.includes('IMPORT')) return 'history-badge-green';
  if (a.includes('EDIT') || a.includes('WITHDRAW')) return 'history-badge-amber';
  return 'history-badge-blue';
}

export function getActionBadgeClass(action) {
  if (action.includes('DELIVERY')) return 'badge-delivery';
  if (action.includes('WITHDRAW')) return 'badge-withdraw';
  if (action === 'EDIT ITEM') return 'badge-edit';
  if (action === 'DELETE ITEM') return 'badge-delete';
  if (action.includes('CLEAR')) return 'badge-clear';
  return 'badge-other';
}

export function buildBreakdownCompareHTML(meta, singleLabel) {
  if (!meta) return null;
  const oldFormatted = formatStockingQty(meta.oldQty || '');
  const newFormatted = formatStockingQty(meta.newQty || '');
  const oldHTML =
    formatStockingQtyAndRemarksForDisplay(oldFormatted, meta.oldRemarks || [], meta.oldLocations || []) ||
    '<span class="color-grey">(none)</span>';
  const newHTML =
    formatStockingQtyAndRemarksForDisplay(newFormatted, meta.newRemarks || [], meta.newLocations || []) ||
    '<span class="color-grey">(none)</span>';
  let addedRow = '';
  if (meta.addedQty) {
    const addedHTML = formatStockingQtyAndRemarksForDisplay(
      formatStockingQty(meta.addedQty),
      meta.addedRemarks || [],
      meta.addedLocations || []
    );
    if (addedHTML)
      addedRow = `<div class="breakdown-row"><span class="breakdown-row-label">${singleLabel || 'Added'}:</span><span class="breakdown-row-value">${addedHTML}</span></div>`;
  }
  return `<div class="breakdown-compare">
      <div class="breakdown-row"><span class="breakdown-row-label">Before:</span><span class="breakdown-row-value">${oldHTML}</span></div>
      ${addedRow}
      <div class="breakdown-row"><span class="breakdown-row-label">After:</span><span class="breakdown-row-value">${newHTML}</span></div>
  </div>`;
}

function buildHistoryDetailHtml(log) {
  const compareHTML =
    log.action === 'EDIT ITEM'
      ? buildBreakdownCompareHTML(log.meta)
      : log.action === 'DELIVERY (BULK)'
        ? buildBreakdownCompareHTML(log.meta, 'Added')
        : null;
  if (compareHTML) return compareHTML;
  return '<div class="history-detail-empty">No additional details for this entry.</div>';
}

function renderHistoryRowPair(log, searchTerm, insertAtTop) {
  const historyTableBody = document.getElementById('historyTableBody');
  const row = insertAtTop ? historyTableBody.insertRow(0) : historyTableBody.insertRow();
  row.classList.add('history-row');
  const formattedDate = new Date(log.timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  row.insertCell(0).textContent = formattedDate;
  row.insertCell(1).innerHTML = `<span class="history-badge ${getHistoryRowBadgeClass(log.action)}">${highlightMatch(log.action, searchTerm)}</span>`;
  row.insertCell(2).innerHTML = highlightMatch(log.code, searchTerm);
  row.insertCell(3).innerHTML = highlightMatch(log.details, searchTerm);

  const detailRow = insertAtTop ? historyTableBody.insertRow(1) : historyTableBody.insertRow();
  detailRow.classList.add('history-detail-row-wrap');
  detailRow.style.display = 'none';
  const detailCell = detailRow.insertCell(0);
  detailCell.colSpan = 99;
  detailCell.innerHTML = buildHistoryDetailHtml(log);

  row.addEventListener('click', () => {
    detailRow.style.display = detailRow.style.display === 'none' ? 'table-row' : 'none';
    row.classList.toggle('is-expanded');
  });
}

function updateHistoryLoadMoreUI() {
  const historyLoadMoreWrap = document.getElementById('historyLoadMoreWrap');
  const historyShownCount = document.getElementById('historyShownCount');
  const remaining = state.historyFilteredCache.length - state.historyRenderedCount;
  if (remaining > 0) {
    historyLoadMoreWrap.style.display = 'flex';
    historyShownCount.textContent = `Showing ${state.historyRenderedCount} of ${state.historyFilteredCache.length} (${remaining} more)`;
  } else {
    historyLoadMoreWrap.style.display = 'none';
    historyShownCount.textContent =
      state.historyFilteredCache.length > 0 ? `Showing all ${state.historyFilteredCache.length}` : '';
  }
}

export function renderHistoryLog(searchTerm = '') {
  const historyTableBody = document.getElementById('historyTableBody');
  const historyDateFrom = document.getElementById('historyDateFrom');
  const historyDateTo = document.getElementById('historyDateTo');
  historyTableBody.innerHTML = '';
  state.historyCurrentSearchTerm = searchTerm;
  const dateFrom = historyDateFrom.value ? new Date(historyDateFrom.value) : null;
  const dateTo = historyDateTo.value ? new Date(historyDateTo.value) : null;
  if (dateTo) dateTo.setHours(23, 59, 59, 999);

  state.historyFilteredCache = state.transactionHistory.filter(log => {
    const logDate = new Date(log.timestamp);
    if (dateFrom && logDate < dateFrom) return false;
    if (dateTo && logDate > dateTo) return false;
    if (!searchTerm) return true;
    return (
      log.code.toLowerCase().includes(searchTerm) ||
      log.details.toLowerCase().includes(searchTerm) ||
      log.action.toLowerCase().includes(searchTerm)
    );
  });
  state.historyRenderedCount = 0;

  if (state.historyFilteredCache.length === 0) {
    const emptyRow = historyTableBody.insertRow();
    const emptyCell = emptyRow.insertCell(0);
    emptyCell.colSpan = 99;
    const hasAnyLogs = state.transactionHistory.length > 0;
    emptyCell.innerHTML = hasAnyLogs
      ? '<div class="table-empty-state"><i class="fas fa-filter-circle-xmark"></i><span>No transactions match your current filters.</span></div>'
      : '<div class="table-empty-state"><i class="fas fa-clock-rotate-left"></i><span>No transaction history yet.</span></div>';
    updateHistoryLoadMoreUI();
    return;
  }

  const firstBatch = state.historyFilteredCache.slice(0, HISTORY_PAGE_SIZE);
  firstBatch.forEach(log => renderHistoryRowPair(log, searchTerm, false));
  state.historyRenderedCount = firstBatch.length;
  updateHistoryLoadMoreUI();
}

export function loadMoreHistoryRows() {
  const nextBatch = state.historyFilteredCache.slice(
    state.historyRenderedCount,
    state.historyRenderedCount + HISTORY_PAGE_SIZE
  );
  nextBatch.forEach(log => renderHistoryRowPair(log, state.historyCurrentSearchTerm, false));
  state.historyRenderedCount += nextBatch.length;
  updateHistoryLoadMoreUI();
}

export function prependHistoryLog(log) {
  const searchBar = document.getElementById('searchBar');
  const historyDateFrom = document.getElementById('historyDateFrom');
  const historyDateTo = document.getElementById('historyDateTo');
  const searchTerm = searchBar.value.toLowerCase();
  const dateFrom = historyDateFrom.value ? new Date(historyDateFrom.value) : null;
  const dateTo = historyDateTo.value ? new Date(historyDateTo.value) : null;
  if (dateTo) dateTo.setHours(23, 59, 59, 999);
  const logDate = new Date(log.timestamp);
  if ((dateFrom && logDate < dateFrom) || (dateTo && logDate > dateTo)) return;
  if (searchTerm) {
    const matches =
      log.code.toLowerCase().includes(searchTerm) ||
      log.details.toLowerCase().includes(searchTerm) ||
      log.action.toLowerCase().includes(searchTerm);
    if (!matches) return;
  }
  const historyTableBody = document.getElementById('historyTableBody');
  if (historyTableBody.querySelector('.table-empty-state')) historyTableBody.innerHTML = '';
  renderHistoryRowPair(log, searchTerm, true);
  state.historyFilteredCache.unshift(log);
  state.historyRenderedCount++;
  updateHistoryLoadMoreUI();
}

export function logTransaction(action, code = '-', details = '', meta = null, skipSync = false) {
  const timestamp = new Date();
  const newLog = { timestamp: timestamp.toISOString(), action, code, details };
  if (meta) newLog.meta = meta;
  state.transactionHistory.unshift(newLog);
  if (skipSync) return newLog;
  prependHistoryLog(newLog);
  saveHistoryData([newLog]);
  return newLog;
}

// --- Detailed Item Report ---

export function getItemLogsForCode(code) {
  const results = [];
  state.transactionHistory.forEach(log => {
    if (log.code === code) {
      let delta = null;
      let deltaLabel = log.details;
      const plusMatch = log.details.match(/\+([\d,]+(?:\.\d+)?)/);
      const minusMatch = log.details.match(/-([\d,]+(?:\.\d+)?)/);
      if (log.action === 'EDIT ITEM') {
        const m = log.details.match(/Qty: "(.*)" -> "(.*)"/);
        if (m) {
          const oldTotal = calculateSingleStockingQtyTotal(formatStockingQty(m[1]));
          const newTotal = calculateSingleStockingQtyTotal(formatStockingQty(m[2]));
          delta = newTotal - oldTotal;
          deltaLabel = `${m[1] || '(empty)'} \u2192 ${m[2] || '(empty)'}`;
        }
      } else if (plusMatch) {
        delta = parseFloat(plusMatch[1].replace(/,/g, ''));
      } else if (minusMatch) {
        delta = -parseFloat(minusMatch[1].replace(/,/g, ''));
      }
      results.push({ timestamp: log.timestamp, action: log.action, delta, deltaLabel, details: log.details, meta: log.meta || null });
    } else if (log.action === 'BULK WITHDRAW' && log.details) {
      const parts = log.details.split(', ');
      parts.forEach(p => {
        const m = p.match(/^(.*?)\s*\((-[\d,]+(?:\.\d+)?)\)$/);
        if (m && m[1].trim() === code) {
          const delta = parseFloat(m[2].replace(/,/g, ''));
          results.push({
            timestamp: log.timestamp,
            action: 'WITHDRAW',
            delta,
            deltaLabel: `${delta.toLocaleString()} pcs`,
            details: `Part of bulk withdrawal (${parts.length} items)`,
            meta: null,
          });
        }
      });
    } else if (log.action === 'BULK CLEAR QTY' && log.details && log.details.split(', ').map(s => s.trim()).includes(code)) {
      results.push({ timestamp: log.timestamp, action: 'BULK CLEAR QTY', delta: null, deltaLabel: 'Cleared', details: 'Quantity cleared as part of a bulk clear action.', meta: null });
    }
  });
  return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

export function renderItemDetailedReport(code) {
  document.getElementById('itemReportCode').textContent = code;
  const logs = getItemLogsForCode(code);
  const row = state.rowsByCode.get(code);
  const itemReportCurrentBreakdown = document.getElementById('itemReportCurrentBreakdown');
  if (row) {
    const remarks = JSON.parse(row.dataset.remarks || '[]');
    const formatted = formatStockingQty(row.dataset.stockingQty);
    itemReportCurrentBreakdown.innerHTML =
      formatStockingQtyAndRemarksForDisplay(formatted, remarks) || '<span class="color-grey">No stock recorded</span>';
  } else {
    itemReportCurrentBreakdown.innerHTML = '<span class="color-grey">Item not currently in inventory</span>';
  }

  let totalIn = 0,
    totalOut = 0,
    editCount = 0;
  logs.forEach(l => {
    if (l.action === 'EDIT ITEM') editCount++;
    else if (typeof l.delta === 'number') {
      if (l.delta > 0) totalIn += l.delta;
      else if (l.delta < 0) totalOut += Math.abs(l.delta);
    }
  });
  document.getElementById('itemReportSummary').innerHTML = `
      <div class="report-stat-card"><div class="stat-label">Transactions</div><div class="stat-value">${logs.length}</div></div>
      <div class="report-stat-card"><div class="stat-label">Total Delivered</div><div class="stat-value" style="color:#10b981;">+${totalIn.toLocaleString()}</div></div>
      <div class="report-stat-card"><div class="stat-label">Total Withdrawn</div><div class="stat-value" style="color:#ef4444;">-${totalOut.toLocaleString()}</div></div>
      <div class="report-stat-card"><div class="stat-label">Net Change</div><div class="stat-value">${(totalIn - totalOut) >= 0 ? '+' : ''}${(totalIn - totalOut).toLocaleString()}</div></div>
      <div class="report-stat-card"><div class="stat-label">Edits Made</div><div class="stat-value">${editCount}</div></div>
  `;

  const itemReportTableBody = document.getElementById('itemReportTableBody');
  const itemReportEmptyState = document.getElementById('itemReportEmptyState');
  itemReportTableBody.innerHTML = '';
  if (logs.length === 0) {
    itemReportEmptyState.style.display = 'block';
  } else {
    itemReportEmptyState.style.display = 'none';
    logs.forEach(l => {
      const tr = itemReportTableBody.insertRow();
      const formattedDate = new Date(l.timestamp).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      tr.insertCell(0).textContent = formattedDate;
      tr.insertCell(1).innerHTML = `<span class="action-badge ${getActionBadgeClass(l.action)}">${escapeHtml(l.action)}</span>`;
      const deltaCell = tr.insertCell(2);
      if (typeof l.delta === 'number') {
        const cls = l.delta > 0 ? 'qty-delta-positive' : l.delta < 0 ? 'qty-delta-negative' : 'qty-delta-neutral';
        deltaCell.innerHTML = `<span class="${cls}">${l.delta > 0 ? '+' : ''}${l.delta.toLocaleString()}</span>`;
      } else {
        deltaCell.innerHTML = '<span class="qty-delta-neutral">\u2014</span>';
      }
      const detailsCell = tr.insertCell(3);
      const compareHTML =
        l.action === 'EDIT ITEM'
          ? buildBreakdownCompareHTML(l.meta)
          : l.action === 'DELIVERY (BULK)'
            ? buildBreakdownCompareHTML(l.meta, 'Added')
            : null;
      if (compareHTML) {
        detailsCell.innerHTML = compareHTML;
      } else {
        const fallbackText = l.deltaLabel && l.deltaLabel !== l.details ? `${l.deltaLabel}  (${l.details})` : l.details;
        detailsCell.innerHTML = `<span class="breakdown-row-value">${escapeHtml(fallbackText).replace(/ \| /g, '<br>')}</span>`;
      }
    });
  }
}

// --- Highlight helper ---

export function highlightMatch(text, term) {
  if (!term) return escapeHtml(text);
  try {
    const escapedTerm = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(escapedTerm, 'gi');
    const result = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push(escapeHtml(text.slice(lastIndex, match.index)));
      }
      result.push(`<span class="highlight">${escapeHtml(match[0])}</span>`);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      result.push(escapeHtml(text.slice(lastIndex)));
    }
    return result.join('');
  } catch (e) {
    return escapeHtml(text);
  }
}
