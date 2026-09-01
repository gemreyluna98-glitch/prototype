// =============================================================================
// Cohin Inventory System — Core Inventory Logic
// Breakdown formatting, rendering, filtering, sorting, withdrawal logic.
// =============================================================================

import { state } from './state.js';
import { saveInventoryData, saveDataToAPI } from './api.js';
import { showToast } from './ui.js';

// --- Format & Parse Helpers ---

export function formatStockingQty(qty) {
  if (!qty) return '';
  let s = String(qty).trim();
  s = s.replace(/\s*(\+|\||l|L)\s*/g, '|');
  return s
    .split('|')
    .filter(part => part.trim() !== '')
    .map(part => {
      let p = part.trim();
      p = p.replace(/\s*(\*|x|X)\s*/g, '\u00d7');
      return p;
    })
    .join(' | ');
}

export function getBreakdownParts(breakdownString) {
  return breakdownString ? breakdownString.split(' | ') : [];
}

export function calculateSingleStockingQtyTotal(breakdownString) {
  return getBreakdownParts(formatStockingQty(breakdownString)).reduce((total, part) => {
    let value = 0;
    part = part.trim().replace(/,/g, '');
    if (part.includes('\u00d7')) {
      value = part.split('\u00d7').reduce((prod, num) => prod * parseFloat(num.trim()), 1);
    } else {
      value = parseFloat(part);
    }
    return total + (isNaN(value) ? 0 : value);
  }, 0);
}

// --- Remark Color Coding ---

const REMARK_COLOR_MAP = [
  { keywords: ['hold'], colorClass: 'color-orange' },
  { keywords: ['approve', 'approved'], colorClass: 'color-pink' },
  { keywords: ['first out', 'old'], colorClass: 'color-green' },
  { keywords: [], colorClass: 'color-grey', isDefault: true },
];

export function getColorClassForRemark(remark) {
  const lowerRemark = remark.toLowerCase().trim();
  if (!lowerRemark) return REMARK_COLOR_MAP.find(m => m.isDefault)?.colorClass || 'color-default';
  for (const mapping of REMARK_COLOR_MAP) {
    if (!mapping.isDefault && mapping.keywords.some(kw => lowerRemark.startsWith(kw))) return mapping.colorClass;
  }
  return REMARK_COLOR_MAP.find(m => m.isDefault)?.colorClass || 'color-default';
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Breakdown Display Rendering ---

export function isShortenBreakdownOn() {
  const cb = document.getElementById('shortenBreakdownCheckbox');
  return cb ? cb.checked : false;
}

export function isSimplifyBreakdownOn() {
  const cb = document.getElementById('simplifyBreakdownCheckbox');
  return cb ? cb.checked : false;
}

export function simplifyBreakdownForDisplay(formattedBreakdownString, remarksArray, locationsArray) {
  const parts = getBreakdownParts(formattedBreakdownString);
  remarksArray = remarksArray || [];
  locationsArray = locationsArray || [];
  const groups = [];
  const keyIndexMap = new Map();
  parts.forEach((part, idx) => {
    const trimmed = part.trim();
    const m = trimmed.match(/^([\d.,]+)\s*\u00d7\s*([\d.,]+)$/);
    if (m) {
      const multiplier = m[1],
        multiplicand = m[2];
      if (keyIndexMap.has(multiplicand)) {
        const g = groups[keyIndexMap.get(multiplicand)];
        g.multipliers.push(multiplier);
        g.indices.push(idx);
      } else {
        keyIndexMap.set(multiplicand, groups.length);
        groups.push({ type: 'mult', multiplicand, multipliers: [multiplier], indices: [idx] });
      }
    } else {
      groups.push({ type: 'plain', raw: trimmed, indices: [idx] });
    }
  });
  const newParts = [],
    newRemarks = [],
    newLocations = [];
  groups.forEach(g => {
    if (g.type === 'plain') {
      newParts.push(g.raw);
    } else if (g.multipliers.length > 1) {
      newParts.push(`(${g.multipliers.join(' + ')}) \u00d7 ${g.multiplicand}`);
    } else {
      newParts.push(`${g.multipliers[0]}\u00d7${g.multiplicand}`);
    }
    const firstIdx = g.indices[0];
    newRemarks.push(remarksArray[firstIdx] || '');
    newLocations.push(locationsArray[firstIdx] || '');
  });
  return { formatted: newParts.join(' | '), remarks: newRemarks, locations: newLocations };
}

export function formatStockingQtyAndRemarksForDisplay(breakdownString, remarksArray, locationsArray, shorten) {
  const parts = getBreakdownParts(breakdownString);
  if (!parts.length || (parts.length === 1 && !parts[0])) return '';
  locationsArray = locationsArray || [];
  return parts
    .map((part, index) => {
      const remark = remarksArray[index] || '';
      const colorClass = getColorClassForRemark(remark);
      const loc = (locationsArray[index] || '').trim();
      const locTag = loc
        ? `<span class="location-tag" title="Building/Rack">${escapeHtml(loc)}</span>`
        : '';
      const trimmedPart = part.trim();
      let displayText = trimmedPart;
      let titleAttr = '';
      if (shorten) {
        const multMatch = trimmedPart.match(/^([\d.,]+)\s*\u00d7/);
        if (multMatch) {
          displayText = `(${multMatch[1]})`;
          titleAttr = ` title="${escapeHtml(trimmedPart)}"`;
        }
      }
      return `<span class="${colorClass}"${titleAttr}>${escapeHtml(displayText)}</span>${locTag}`;
    })
    .join(' | ');
}

export function renderBreakdownCellHtml(rawStockingQty, remarksArray, locationsArray) {
  const formattedBreakdown = formatStockingQty(rawStockingQty);
  let displayBreakdown = formattedBreakdown,
    displayRemarks = remarksArray || [],
    displayLocations = locationsArray || [];
  if (isSimplifyBreakdownOn()) {
    const simplified = simplifyBreakdownForDisplay(formattedBreakdown, displayRemarks, displayLocations);
    displayBreakdown = simplified.formatted;
    displayRemarks = simplified.remarks;
    displayLocations = simplified.locations;
  }
  return formatStockingQtyAndRemarksForDisplay(displayBreakdown, displayRemarks, displayLocations, isShortenBreakdownOn());
}

export function refreshAllBreakdownDisplays() {
  state.originalRowsOrder.forEach(row => {
    const remarks = JSON.parse(row.dataset.remarks || '[]');
    const locations = JSON.parse(row.dataset.locations || '[]');
    row.cells[1].innerHTML = renderBreakdownCellHtml(row.dataset.stockingQty, remarks, locations);
  });
}

// --- Render Row ---

export function renderRow(item, shouldSave = true) {
  const inventoryTableBody = document.getElementById('inventoryTableBody');
  const row = inventoryTableBody.insertRow();
  state.originalRowsOrder.push(row);
  state.rowsByCode.set(item.code, row);
  row.dataset.code = item.code;
  row.dataset.stockingQty = item.stockingQty;
  row.dataset.remarks = JSON.stringify(item.remarks);
  row.dataset.locations = JSON.stringify(item.locations || []);

  const formattedBreakdown = formatStockingQty(item.stockingQty);
  const total = calculateSingleStockingQtyTotal(formattedBreakdown);

  const codeCell = row.insertCell(0);
  codeCell.textContent = item.code;
  codeCell.dataset.label = 'MATERIAL CODE:';

  const breakdownCell = row.insertCell(1);
  breakdownCell.innerHTML = renderBreakdownCellHtml(item.stockingQty, item.remarks, item.locations || []);
  breakdownCell.classList.add('editable-breakdown');
  breakdownCell.dataset.label = 'Stocking Qty:';

  const totalCell = row.insertCell(2);
  totalCell.textContent = total.toLocaleString();
  totalCell.classList.add('total-per-row', 'column-hidden');
  totalCell.dataset.label = 'Total per Row:';

  const remarksCell = row.insertCell(3);
  remarksCell.textContent = item.remarks.filter(r => r).join(' | ');
  remarksCell.classList.add('column-hidden');
  remarksCell.dataset.label = 'Remarks:';

  if (shouldSave) {
    saveInventoryData();
  }
}

// --- Capacity Helpers ---

export function inferCapacity(stockingQty) {
  const parts = getBreakdownParts(formatStockingQty(stockingQty));
  for (const part of parts) {
    if (part.includes('\u00d7')) {
      const subParts = part.split('\u00d7');
      const cap = parseFloat(subParts[subParts.length - 1].trim());
      if (!isNaN(cap)) return cap;
    }
  }
  return null;
}

export function generateBreakdownWithCapacity(totalQty, capacity) {
  if (!capacity || capacity <= 0) return String(totalQty);
  const full = Math.floor(totalQty / capacity);
  const rem = totalQty % capacity;
  const parts = [];
  if (full > 0) parts.push(`${full}\u00d7${capacity}`);
  if (rem > 0) parts.push(String(rem));
  return parts.join(' | ');
}

export function mergeDeliveriesBreakdown(existingQty, newQty, capacity) {
  if (!capacity) return existingQty + '+' + newQty;
  const allPartsStr = existingQty + '+' + newQty;
  const normalized = allPartsStr.replace(/\s*\|\s*/g, '+').replace(/\u00d7/g, 'x');
  const parts = normalized.split('+').filter(p => p.trim() !== '');
  let fullCount = 0;
  const loose = [];
  for (let p of parts) {
    p = p.trim();
    const m = p.match(/^(\d+)[xX*](\d+)$/);
    if (m) {
      const num = parseInt(m[1], 10);
      const cap = parseInt(m[2], 10);
      if (cap === capacity) fullCount += num;
      else loose.push(p);
    } else if (parseInt(p, 10) === capacity && !isNaN(p)) {
      fullCount += 1;
    } else {
      loose.push(p);
    }
  }
  const res = [];
  if (fullCount > 1) res.push(`${fullCount}x${capacity}`);
  else if (fullCount === 1) res.push(`${capacity}`);
  return res.concat(loose).join('+');
}

// --- Withdrawal Logic ---

export function getWithdrawableStock(row) {
  const stockingQty = row.dataset.stockingQty;
  const remarks = JSON.parse(row.dataset.remarks || '[]');
  const parts = getBreakdownParts(formatStockingQty(stockingQty));
  let total = 0;
  parts.forEach((part, index) => {
    const remark = (remarks[index] || '').toLowerCase();
    if (!remark.startsWith('hold')) {
      total += calculateSingleStockingQtyTotal(part);
    }
  });
  return total;
}

export function performWithdrawal(materialCode, withdrawAmount) {
  const targetRow = state.rowsByCode.get(materialCode);
  if (!targetRow) return { success: false, message: `Item code ${materialCode} not found.` };

  const totalWithdrawable = getWithdrawableStock(targetRow);
  if (withdrawAmount > totalWithdrawable) {
    return { success: false, message: `Insufficient stock for ${materialCode}.` };
  }

  const oldRemarks = JSON.parse(targetRow.dataset.remarks || '[]');
  const oldLocations = JSON.parse(targetRow.dataset.locations || '[]');
  const oldParts = getBreakdownParts(formatStockingQty(targetRow.dataset.stockingQty));

  const partsWithDetails = oldParts.map((part, index) => ({
    value: part,
    qty: calculateSingleStockingQtyTotal(part),
    remark: oldRemarks[index] || '',
    location: oldLocations[index] || '',
    lowerRemark: (oldRemarks[index] || '').toLowerCase(),
    originalIndex: index,
  }));

  const getPriority = remark => {
    const lower = remark.toLowerCase();
    if (lower.startsWith('old') || lower.startsWith('first out')) return 1;
    if (lower.startsWith('approved')) return 2;
    return 3;
  };

  const withdrawableParts = partsWithDetails.filter(p => !p.lowerRemark.startsWith('hold'));
  const strictSort = (parts, amount) => {
    const highestPrio = parts.length > 0 ? getPriority(parts[0].lowerRemark) : 3;
    const firstBundle = parts.find(p => getPriority(p.lowerRemark) === highestPrio && /[*xX\u00d7]/.test(p.value));
    let bundleSize = 0;
    if (firstBundle) {
      const bParts = firstBundle.value.split(/[*xX\u00d7]/);
      bundleSize = parseFloat(bParts[bParts.length - 1].trim());
    }
    const isBundleMatch = bundleSize > 0 && amount % bundleSize === 0;
    return [...parts].sort((a, b) => {
      const prioA = getPriority(a.lowerRemark),
        prioB = getPriority(b.lowerRemark);
      if (prioA !== prioB) return prioA - prioB;
      const isMultA = /[*xX\u00d7]/.test(a.value),
        isMultB = /[*xX\u00d7]/.test(b.value);
      if (isMultA !== isMultB) {
        if (isBundleMatch) return isMultA ? -1 : 1;
        return isMultA ? 1 : -1;
      }
      if (a.qty !== b.qty) return a.qty - b.qty;
      return a.originalIndex - b.originalIndex;
    });
  };

  const deductionOrder = strictSort(withdrawableParts, withdrawAmount);
  let remaining = withdrawAmount;

  for (const part of deductionOrder) {
    if (remaining <= 0) break;
    if (part.qty <= 0) continue;

    if (remaining >= part.qty) {
      remaining -= part.qty;
      part.value = '';
      part.qty = 0;
    } else {
      const toDeduct = remaining;
      remaining = 0;
      if (/[*xX\u00d7]/.test(part.value)) {
        const subParts = part.value.split(/[*xX\u00d7]/);
        const multiplicand = parseFloat(subParts[subParts.length - 1].trim());
        const newTotal = part.qty - toDeduct;
        const newM = Math.floor(newTotal / multiplicand);
        const rem = newTotal % multiplicand;
        let newVal = '';
        if (newM > 0) newVal = `${newM}\u00d7${multiplicand}`;
        if (rem > 0) newVal = (newVal ? newVal + ' | ' : '') + String(rem);
        part.value = newVal;
        part.qty = newTotal;
      } else {
        part.qty -= toDeduct;
        part.value = String(part.qty);
      }
    }
  }

  const remainingWithdrawable = partsWithDetails.filter(p => p.value !== '' && !p.lowerRemark.startsWith('hold'));
  const hasOldItems = remainingWithdrawable.some(p => getPriority(p.lowerRemark) === 1);
  if (!hasOldItems) {
    const approvedItems = remainingWithdrawable.filter(p => getPriority(p.lowerRemark) === 2);
    if (approvedItems.length > 0) {
      approvedItems.sort((a, b) => a.originalIndex - b.originalIndex);
      const oldestApproved = approvedItems[0];
      oldestApproved.remark = oldestApproved.remark.replace(/approved/i, 'OLD').replace(/approve/i, 'OLD');
      if (!oldestApproved.remark.toUpperCase().includes('OLD')) {
        oldestApproved.remark = 'OLD ' + oldestApproved.remark;
      }
    }
  }

  const finalParts = partsWithDetails
    .flatMap(p => {
      if (p.value === '') return [];
      if (p.value.includes(' | ')) {
        return p.value.split(' | ').map(subVal => ({ ...p, value: subVal }));
      }
      return [p];
    })
    .sort((a, b) => a.originalIndex - b.originalIndex);

  const simplified = finalParts.map(p => {
    let val = p.value.trim();
    if (val.startsWith('1\u00d7')) return val.split('\u00d7')[1].trim();
    return val;
  });

  targetRow.dataset.stockingQty = simplified.join(' | ');
  const newRemarks = finalParts.map(p => p.remark);
  const newLocations = finalParts.map(p => p.location || '');
  targetRow.dataset.remarks = JSON.stringify(newRemarks);
  targetRow.dataset.locations = JSON.stringify(newLocations);

  const finalBreakdown = formatStockingQty(targetRow.dataset.stockingQty);
  const finalTotal = calculateSingleStockingQtyTotal(finalBreakdown);
  targetRow.cells[1].innerHTML = renderBreakdownCellHtml(
    targetRow.dataset.stockingQty,
    newRemarks,
    newLocations
  );
  targetRow.cells[2].textContent = finalTotal.toLocaleString();
  targetRow.cells[3].textContent = newRemarks
    .filter(r => r)
    .join(' | ');

  return { success: true, message: `Successfully withdrew ${withdrawAmount} from ${materialCode}.` };
}

// --- Filter & Sort ---

export async function applyFiltersAndSort() {
  const itemType = document.getElementById('itemTypeFilter').value;
  const remarkType = document.getElementById('remarksFilter').value;
  const dataType = document.getElementById('dataPresenceFilter').value;
  const sortType = document.getElementById('materialCodeSort').value;
  const searchTerm = document.getElementById('searchBar').value.toLowerCase();
  const enableMovementFilter = document.getElementById('enableMovementFilter');
  const moveDateFrom = document.getElementById('moveDateFrom');
  const moveTimeFrom = document.getElementById('moveTimeFrom');
  const moveDateTo = document.getElementById('moveDateTo');
  const moveTimeTo = document.getElementById('moveTimeTo');
  const movementMode = document.getElementById('movementMode');

  const isMovementActive = enableMovementFilter.checked;
  const hasInvalidMovementRange =
    isMovementActive && moveDateFrom.value && moveDateTo.value && moveDateFrom.value > moveDateTo.value;
  if (hasInvalidMovementRange) {
    showToast('Movement filter: "From" date is after "To" date — showing all items instead.', 'error');
  }
  const movedItemsSet =
    isMovementActive && !hasInvalidMovementRange
      ? getMovedItems(moveDateFrom.value, moveTimeFrom.value, moveDateTo.value, moveTimeTo.value)
      : new Set();
  const showOnlyMoved = isMovementActive && !hasInvalidMovementRange && movementMode.value === 'FILTER_ONLY';

  let rowsToShow = [...state.originalRowsOrder];
  rowsToShow = rowsToShow.filter(row => {
    const code = row.dataset.code;
    const remarks = JSON.parse(row.dataset.remarks || '[]').map(r => r.toLowerCase().trim());
    const qtyText = row.cells[1].textContent.trim();

    if (
      searchTerm &&
      !Array.from(row.cells)
        .map(cell => cell.textContent)
        .join(' ')
        .toLowerCase()
        .includes(searchTerm)
    )
      return false;
    const passesItem =
      itemType === 'ALL' ||
      (itemType === 'LBL' && code.startsWith('LBL')) ||
      (itemType === 'CTN' && code.startsWith('CTN')) ||
      (itemType === 'PLASTIC' && (code.startsWith('BAG') || code.includes('BUNDLE'))) ||
      (itemType === 'OTHERS' && !/^(LBL|CTN|BAG)|BUNDLE/.test(code));
    const passesData =
      dataType === 'ALL' ||
      (dataType === 'WITH_DATA' && qtyText) ||
      (dataType === 'WITHOUT_DATA' && !qtyText);
    let passesRemark = false;
    const hasHold = remarks.some(r => r.startsWith('hold'));
    const hasApproved = remarks.some(r => r.startsWith('approve') || r.startsWith('approved'));
    const hasOld = remarks.some(r => r.startsWith('first out') || r.startsWith('old'));
    const hasAnyRemark = remarks.some(r => r !== '');
    switch (remarkType) {
      case 'ALL':
        passesRemark = true;
        break;
      case 'HOLD':
        passesRemark = hasHold;
        break;
      case 'APPROVED':
        passesRemark = hasApproved;
        break;
      case 'FIRSTOUT_OLD':
        passesRemark = hasOld;
        break;
      case 'NO_REMARK':
        passesRemark = !hasAnyRemark;
        break;
      case 'OTHER_REMARKS':
        passesRemark = hasAnyRemark && !hasHold && !hasApproved && !hasOld;
        break;
    }

    if (showOnlyMoved && !movedItemsSet.has(code)) return false;
    return passesItem && passesRemark && passesData;
  });

  if (sortType !== 'NONE') {
    rowsToShow.sort((a, b) => {
      const codeA = a.dataset.code;
      const codeB = b.dataset.code;
      return sortType === 'ASC' ? codeA.localeCompare(codeB) : codeB.localeCompare(codeA);
    });
  }

  const { highlightMatch, renderHistoryLog } = await import('./history.js');

  const inventoryTableBody = document.getElementById('inventoryTableBody');
  inventoryTableBody.innerHTML = '';
  if (rowsToShow.length === 0) {
    const emptyRow = inventoryTableBody.insertRow();
    const emptyCell = emptyRow.insertCell(0);
    emptyCell.colSpan = 99;
    const hasAnyItems = state.originalRowsOrder.length > 0;
    emptyCell.innerHTML = hasAnyItems
      ? '<div class="table-empty-state"><i class="fas fa-filter-circle-xmark"></i><span>No items match your current filters.</span></div>'
      : '<div class="table-empty-state"><i class="fas fa-box-open"></i><span>No items yet. Add or import inventory to get started.</span></div>';
  } else {
    for (const row of rowsToShow) {
      const code = row.dataset.code;
      const codeCell = row.cells[0];
      const isMoved = isMovementActive && movedItemsSet.has(code);
      const highlightedCode = highlightMatch(code, searchTerm);
      if (isMoved) {
        codeCell.innerHTML = `<span style="color: red; font-weight: bold;">\u2605</span> ${highlightedCode}`;
      } else {
        codeCell.innerHTML = highlightedCode;
      }
      inventoryTableBody.appendChild(row);
    }
  }

  renderHistoryLog(searchTerm);

  updateStatSummaryCards(rowsToShow.length);
}

function updateStatSummaryCards(shownCount) {
  const totalEl = document.getElementById('statTotalSkus');
  const shownEl = document.getElementById('statShownSkus');
  const holdEl = document.getElementById('statHoldSkus');
  if (!totalEl || !shownEl || !holdEl) return;

  const holdCount = state.originalRowsOrder.filter(row => {
    const remarks = JSON.parse(row.dataset.remarks || '[]').map(r => r.toLowerCase().trim());
    return remarks.some(r => r.startsWith('hold'));
  }).length;

  totalEl.textContent = state.originalRowsOrder.length.toLocaleString();
  shownEl.textContent = shownCount.toLocaleString();
  holdEl.textContent = holdCount.toLocaleString();
}

export function getMovedItems(dateFrom, timeFrom, dateTo, timeTo) {
  const movedItems = new Set();
  const start = dateFrom ? new Date(`${dateFrom}T${timeFrom || '00:00'}`) : new Date(0);
  const end = dateTo ? new Date(`${dateTo}T${timeTo || '23:59'}`) : new Date();

  state.transactionHistory.forEach(log => {
    const logDate = new Date(log.timestamp);
    if (logDate >= start && logDate <= end) {
      if (log.action === 'BULK WITHDRAW') {
        const parts = (log.details || '').split(', ');
        parts.forEach(p => {
          const codeMatch = p.match(/^(.*?) \(/);
          if (codeMatch) movedItems.add(codeMatch[1].trim());
        });
      } else if (log.action === 'BULK CLEAR QTY') {
        const codes = (log.details || '').split(', ').map(c => c.replace(/\.\.\.$/, '').trim()).filter(Boolean);
        codes.forEach(code => movedItems.add(code));
      } else if (log.code && log.code !== '-') {
        movedItems.add(log.code.trim());
      }
    }
  });
  return movedItems;
}

// --- Excel Formula Conversion ---

export function convertToExcelFormula(stockingQty) {
  if (!stockingQty || !stockingQty.trim()) return 0;
  let formula = String(stockingQty).trim();
  formula = formula.replace(/\u00d7|x|\*/gi, '*');
  formula = formula.replace(/\|/g, '+');
  formula = formula.replace(/\s*[lL]\s*/g, '+');
  formula = formula.replace(/,/g, '');
  formula = formula.replace(/\s+/g, ' ');
  if (!formula) return 0;
  return `=${formula}`;
}

// --- Building/Rack Visibility ---

export function applyBuildingRackVisibility() {
  const showBuildingRackCheckbox = document.getElementById('showBuildingRackCheckbox');
  const show = showBuildingRackCheckbox ? showBuildingRackCheckbox.checked : true;
  document.querySelectorAll('.building-rack-group').forEach(el => {
    el.style.display = show ? '' : 'none';
  });
}
