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

// --- Row Dataset Accessors ---
// Shared, defensive accessors for a row's JSON-encoded remarks/locations —
// used everywhere instead of each call site repeating its own
// `JSON.parse(row.dataset.X || '[]')`, so a malformed value (which would
// otherwise throw uncaught wherever it happened to be read) degrades to an
// empty array instead of breaking whatever feature touched that row first.
export function getRowRemarks(row) {
  try {
    return JSON.parse(row.dataset.remarks || '[]');
  } catch {
    return [];
  }
}

export function getRowLocations(row) {
  try {
    return JSON.parse(row.dataset.locations || '[]');
  } catch {
    return [];
  }
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

// --- Remark Status Classification ---
// Single source of truth for "what does this remark's status prefix mean" —
// used for color-coding, withdrawal priority (getPriority), hold-exclusion
// (getWithdrawableStock/getHoldBreakdown), and filtering (applyFiltersAndSort,
// applyBulkClearFilters), so a new status keyword only needs to be added
// here once instead of in each of those places separately.
const REMARK_STATUS_RULES = [
  { status: 'hold', keywords: ['hold'] },
  { status: 'approved', keywords: ['approve'] }, // covers "approve" and "approved"
  { status: 'old', keywords: ['first out', 'old'] },
];

export function classifyRemark(remark) {
  const lower = (remark || '').toLowerCase().trim();
  if (!lower) return 'regular';
  for (const { status, keywords } of REMARK_STATUS_RULES) {
    if (keywords.some(kw => lower.startsWith(kw))) return status;
  }
  return 'regular';
}

const REMARK_STATUS_COLOR_CLASS = {
  hold: 'color-orange',
  approved: 'color-pink',
  old: 'color-green',
  regular: 'color-grey',
};

export function getColorClassForRemark(remark) {
  return REMARK_STATUS_COLOR_CLASS[classifyRemark(remark)] || 'color-default';
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

// Groups breakdown parts that share a multiplicand (e.g. two "5\u00d724000" and
// "3\u00d724000" parts become one group with multipliers [5, 3]) \u2014 used by
// simplifyBreakdownForDisplay below.
export function groupBreakdownParts(parts) {
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
  return groups;
}

export function simplifyBreakdownForDisplay(formattedBreakdownString, remarksArray, locationsArray) {
  const parts = getBreakdownParts(formattedBreakdownString);
  remarksArray = remarksArray || [];
  locationsArray = locationsArray || [];
  const groups = groupBreakdownParts(parts);
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

// `plain`: omit the color-coding span (and its title attribute) but keep
// everything else \u2014 shortening, the location tag \u2014 identical. Used by the
// print flow's "no colors" mode, so it doesn't need its own hand-rolled copy
// of this same part-by-part formatting.
export function formatStockingQtyAndRemarksForDisplay(breakdownString, remarksArray, locationsArray, shorten, plain = false) {
  const parts = getBreakdownParts(breakdownString);
  if (!parts.length || (parts.length === 1 && !parts[0])) return '';
  locationsArray = locationsArray || [];
  return parts
    .map((part, index) => {
      const remark = remarksArray[index] || '';
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
          if (!plain) titleAttr = ` title="${escapeHtml(trimmedPart)}"`;
        }
      }
      if (plain) return `${escapeHtml(displayText)}${locTag}`;
      const colorClass = getColorClassForRemark(remark);
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
    row.cells[1].innerHTML = renderBreakdownCellHtml(row.dataset.stockingQty, getRowRemarks(row), getRowLocations(row));
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
  const remarks = getRowRemarks(row);
  const parts = getBreakdownParts(formatStockingQty(stockingQty));
  let total = 0;
  parts.forEach((part, index) => {
    if (classifyRemark(remarks[index]) !== 'hold') {
      total += calculateSingleStockingQtyTotal(part);
    }
  });
  return total;
}

export function getHoldStock(row) {
  return getHoldBreakdown(row).reduce((sum, h) => sum + h.qty, 0);
}

export function getHoldBreakdown(row) {
  const stockingQty = row.dataset.stockingQty;
  const remarks = getRowRemarks(row);
  const parts = getBreakdownParts(formatStockingQty(stockingQty));
  const breakdown = [];
  parts.forEach((part, index) => {
    const remark = remarks[index] || '';
    if (classifyRemark(remark) === 'hold') {
      breakdown.push({ qty: calculateSingleStockingQtyTotal(part), remark });
    }
  });
  return breakdown;
}

// `allowHold`: when true, HOLD-tagged batches are added to the deduction pool
// as the lowest priority (after OLD/first out, approved, and regular stock) —
// used only after the caller has explicitly confirmed dipping into HOLD stock.
export function performWithdrawal(materialCode, withdrawAmount, allowHold = false) {
  const targetRow = state.rowsByCode.get(materialCode);
  if (!targetRow) return { success: false, message: `Item code ${materialCode} not found.` };

  const totalWithdrawable = getWithdrawableStock(targetRow);
  const holdStock = getHoldStock(targetRow);
  const totalWithHold = totalWithdrawable + holdStock;

  if (withdrawAmount > totalWithdrawable && !allowHold) {
    if (withdrawAmount > totalWithHold) {
      return { success: false, message: `Insufficient stock for ${materialCode}.` };
    }
    return {
      success: false,
      needsHoldConfirmation: true,
      available: totalWithdrawable,
      holdAvailable: holdStock,
      holdBreakdown: getHoldBreakdown(targetRow),
      message: `Insufficient OLD/Approved stock for ${materialCode}. Only ${totalWithdrawable} available (excluding HOLD).`,
    };
  }

  if (withdrawAmount > totalWithHold) {
    return { success: false, message: `Insufficient stock for ${materialCode}.` };
  }

  const oldRemarks = getRowRemarks(targetRow);
  const oldLocations = getRowLocations(targetRow);
  const oldParts = getBreakdownParts(formatStockingQty(targetRow.dataset.stockingQty));

  // Parses a date like MM-DD-YYYY or MM/DD/YYYY out of a remark string.
  // Returns a timestamp, or null if no date is found / it doesn't parse.
  const parseRemarkDate = remark => {
    const m = /(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/.exec(remark || '');
    if (!m) return null;
    let month = parseInt(m[1], 10);
    let day = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    if (isNaN(d.getTime())) return null;
    return d.getTime();
  };

  const partsWithDetails = oldParts.map((part, index) => ({
    value: part,
    qty: calculateSingleStockingQtyTotal(part),
    remark: oldRemarks[index] || '',
    location: oldLocations[index] || '',
    lowerRemark: (oldRemarks[index] || '').toLowerCase(),
    originalIndex: index,
    remarkDate: parseRemarkDate(oldRemarks[index] || ''),
  }));

  const STATUS_PRIORITY = { old: 1, approved: 2, regular: 3, hold: 4 };
  const getPriority = remark => STATUS_PRIORITY[classifyRemark(remark)];

  // Remarks with no parseable date are treated as the NEWEST within their
  // tier (i.e. deducted last), never the oldest.
  const dateKey = p => (p.remarkDate === null ? Infinity : p.remarkDate);

  // HOLD batches only enter the pool when the caller has confirmed dipping
  // into HOLD (allowHold) — and even then they sort last (priority 4), so
  // they're never touched before OLD/approved/regular stock is exhausted.
  const withdrawableParts = partsWithDetails.filter(p => allowHold || classifyRemark(p.lowerRemark) !== 'hold');
  const strictSort = (parts, amount) => {
    // Determine the reference item (for bundle-size matching) from the
    // priority+date order, not the raw unsorted array.
    const priorityDateSorted = [...parts].sort((a, b) => {
      const prioA = getPriority(a.lowerRemark),
        prioB = getPriority(b.lowerRemark);
      if (prioA !== prioB) return prioA - prioB;
      return dateKey(a) - dateKey(b);
    });
    const highestPrio = priorityDateSorted.length > 0 ? getPriority(priorityDateSorted[0].lowerRemark) : 3;
    const firstBundle = priorityDateSorted.find(
      p => getPriority(p.lowerRemark) === highestPrio && /[*xX\u00d7]/.test(p.value)
    );
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
      const dateA = dateKey(a),
        dateB = dateKey(b);
      if (dateA !== dateB) return dateA - dateB;
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
      part.partiallyConsumed = true; // flag: this part was partially used
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

  // Any part that was partially consumed should become "first out" so it is
  // deducted first on the next withdrawal, before untouched approved stock —
  // even if an untouched batch happens to share the same (or an earlier)
  // remark date. Without this, a same-date tie among untouched "approved"
  // batches can promote the wrong (untouched) one to "OLD" below, instead of
  // the batch that was actually just dipped into.
  partsWithDetails.forEach(p => {
    if (p.partiallyConsumed && p.value !== '') {
      // Use getPriority (startsWith-based) rather than a raw regex — a plain
      // substring match on "old" false-positives on remarks like "hold QC".
      // HOLD batches are excluded here: only the confirmed amount was meant
      // to leave HOLD protection, not the rest of the batch — relabeling the
      // remainder "first out" would make it freely withdrawable without the
      // HOLD confirmation prompt next time.
      const remarkStatus = classifyRemark(p.remark);
      if (getPriority(p.lowerRemark) !== 1 && remarkStatus !== 'hold') {
        // A dipped-into approved batch has moved on from that status — drop
        // the "approve(d)" keyword itself (keeping any date/detail after it)
        // so the remark doesn't confusingly read as both "first out" and
        // "approved" at once.
        const remainder = remarkStatus === 'approved'
          ? p.remark.replace(/^(hold|approved?)\s*/i, '').trim()
          : p.remark;
        p.remark = remainder ? `first out ${remainder}` : 'first out';
        p.lowerRemark = p.remark.toLowerCase();
      }
    }
  });

  const remainingWithdrawable = partsWithDetails.filter(p => p.value !== '' && classifyRemark(p.lowerRemark) !== 'hold');
  const hasOldItems = remainingWithdrawable.some(p => getPriority(p.lowerRemark) === 1);
  if (!hasOldItems) {
    const approvedItems = remainingWithdrawable.filter(p => getPriority(p.lowerRemark) === 2);
    if (approvedItems.length > 0) {
      approvedItems.sort((a, b) => {
        const dateA = dateKey(a),
          dateB = dateKey(b);
        if (dateA !== dateB) return dateA - dateB;
        return a.originalIndex - b.originalIndex;
      });
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

// Shared item-type/remark-status/data-presence predicate — used by both the
// main table's filter (applyFiltersAndSort) and the Bulk Clear Qty modal's
// own filter (applyBulkClearFilters in app.js), which used to each carry
// their own copy of this exact logic.
export function matchesInventoryFilters(row, { itemType, remarkType, dataType }) {
  const code = (row.dataset.code || '').toUpperCase();
  const remarks = getRowRemarks(row).map(r => r.toLowerCase().trim());
  const qtyText = row.cells[1].textContent.trim();

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

  const hasHold = remarks.some(r => classifyRemark(r) === 'hold');
  const hasApproved = remarks.some(r => classifyRemark(r) === 'approved');
  const hasOld = remarks.some(r => classifyRemark(r) === 'old');
  const hasAnyRemark = remarks.some(r => r !== '');
  let passesRemark = false;
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

  return passesItem && passesRemark && passesData;
}

// Lazily cached on first use — these filter-toolbar elements are static
// (never removed/recreated) for the lifetime of the page, so re-querying
// all 11 of them via getElementById on every applyFiltersAndSort call (the
// debounced-search hot path) was pure repeated work.
let filterElsCache = null;
function getFilterEls() {
  if (!filterElsCache) {
    filterElsCache = {
      itemTypeFilter: document.getElementById('itemTypeFilter'),
      remarksFilter: document.getElementById('remarksFilter'),
      dataPresenceFilter: document.getElementById('dataPresenceFilter'),
      materialCodeSort: document.getElementById('materialCodeSort'),
      searchBar: document.getElementById('searchBar'),
      enableMovementFilter: document.getElementById('enableMovementFilter'),
      moveDateFrom: document.getElementById('moveDateFrom'),
      moveTimeFrom: document.getElementById('moveTimeFrom'),
      moveDateTo: document.getElementById('moveDateTo'),
      moveTimeTo: document.getElementById('moveTimeTo'),
      movementMode: document.getElementById('movementMode'),
    };
  }
  return filterElsCache;
}

// A manual click (state.movementOverrides) always wins over the automatic
// date-range detection, in either direction — shared by the filter pass
// above, the ★ rendering below, and the print flow (export.js) so all three
// agree on which items currently count as "moved".
export function isItemMarkedMoved(code, movedItemsSet) {
  return state.movementOverrides.has(code) ? state.movementOverrides.get(code) : movedItemsSet.has(code);
}

export async function applyFiltersAndSort() {
  const {
    itemTypeFilter,
    remarksFilter,
    dataPresenceFilter,
    materialCodeSort,
    searchBar,
    enableMovementFilter,
    moveDateFrom,
    moveTimeFrom,
    moveDateTo,
    moveTimeTo,
    movementMode,
  } = getFilterEls();
  const itemType = itemTypeFilter.value;
  const remarkType = remarksFilter.value;
  const dataType = dataPresenceFilter.value;
  const sortType = materialCodeSort.value;
  const searchTerm = searchBar.value.toLowerCase();

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

  // Counted here (once per row, unconditionally — Array.prototype.filter's
  // callback runs for every row regardless of which branch returns false)
  // instead of updateStatSummaryCards doing its own separate full pass over
  // every row afterward just to recompute the same "does this row have a
  // hold batch" check.
  let holdCount = 0;
  let rowsToShow = [...state.originalRowsOrder];
  rowsToShow = rowsToShow.filter(row => {
    const code = row.dataset.code;
    if (getRowRemarks(row).some(r => classifyRemark(r) === 'hold')) holdCount++;

    if (
      searchTerm &&
      !Array.from(row.cells)
        .map(cell => cell.textContent)
        .join(' ')
        .toLowerCase()
        .includes(searchTerm)
    )
      return false;
    if (!matchesInventoryFilters(row, { itemType, remarkType, dataType })) return false;
    if (showOnlyMoved && !isItemMarkedMoved(code, movedItemsSet)) return false;
    return true;
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
      const isMoved = isMovementActive && isItemMarkedMoved(code, movedItemsSet);
      const highlightedCode = highlightMatch(code, searchTerm);
      if (isMovementActive) {
        // Clickable in either state while Mark Movement is active, so an
        // item can be manually checked off (or un-checked) regardless of
        // whether the date range already auto-detected it \u2014 see
        // toggleMovementMark in app.js. A manual click always wins, in
        // either direction (isItemMarkedMoved above).
        codeCell.innerHTML = `<span class="movement-star-toggle${isMoved ? ' is-marked' : ''}" data-code="${escapeHtml(code)}" title="Click to ${isMoved ? 'unmark' : 'mark'} as moved">\u2605</span> ${highlightedCode}`;
      } else if (isMoved) {
        codeCell.innerHTML = `<span style="color: red; font-weight: bold;">\u2605</span> ${highlightedCode}`;
      } else {
        codeCell.innerHTML = highlightedCode;
      }
      inventoryTableBody.appendChild(row);
    }
  }

  renderHistoryLog(searchTerm);

  updateStatSummaryCards(rowsToShow.length, holdCount);
}

function updateStatSummaryCards(shownCount, holdCount) {
  const totalEl = document.getElementById('statTotalSkus');
  const shownEl = document.getElementById('statShownSkus');
  const holdEl = document.getElementById('statHoldSkus');
  if (!totalEl || !shownEl || !holdEl) return;

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
        // Prefer the full list in meta (added so this isn't limited to the
        // truncated "first 5 + ..." display string) — fall back to parsing
        // `details` for older log entries saved before this existed.
        if (log.meta && Array.isArray(log.meta.itemCodes)) {
          log.meta.itemCodes.forEach(code => movedItems.add(code));
        } else {
          const codes = (log.details || '').split(', ').map(c => c.replace(/\.\.\.$/, '').trim()).filter(Boolean);
          codes.forEach(code => movedItems.add(code));
        }
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

// --- LCS-based Breakdown Alignment ---
// Used by the Edit Breakdown modal's identity-mapping check (app.js) to
// figure out which new breakdown part each old part's remarks/location
// correspond to, after the person edits the Stocking Qty text. Moved here
// (was previously local to app.js) so it's a pure, DOM-free function that
// can be unit tested directly — see tests/inventory.test.js.
export function diffBreakdownParts(oldParts, newParts) {
  const n = oldParts.length,
    m = newParts.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = oldParts[i - 1] === newParts[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const mapping = new Array(m).fill(-1);
  let i = n,
    j = m;
  while (i > 0 && j > 0) {
    if (oldParts[i - 1] === newParts[j - 1]) {
      mapping[j - 1] = i - 1;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return mapping;
}

export function diffBreakdownPartsWithFallback(oldParts, newParts, excludedIndices) {
  const mapping = diffBreakdownParts(oldParts, newParts);
  const usedOld = new Set(mapping.filter(x => x !== -1));
  const leftoverOldIdx = [];
  for (let i = 0; i < oldParts.length; i++) {
    if (!usedOld.has(i) && !excludedIndices.has(i)) leftoverOldIdx.push(i);
  }
  let li = 0;
  for (let j = 0; j < mapping.length; j++) {
    if (mapping[j] === -1 && li < leftoverOldIdx.length) {
      mapping[j] = leftoverOldIdx[li];
      li++;
    }
  }
  return mapping;
}

// --- Building/Rack Visibility ---

export function applyBuildingRackVisibility() {
  const showBuildingRackCheckbox = document.getElementById('showBuildingRackCheckbox');
  const show = showBuildingRackCheckbox ? showBuildingRackCheckbox.checked : true;
  document.querySelectorAll('.building-rack-group').forEach(el => {
    el.style.display = show ? '' : 'none';
  });
}
