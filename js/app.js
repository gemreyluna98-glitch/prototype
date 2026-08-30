// =============================================================================
// Cohin Inventory System — Application Entry Point
// Wires up DOM events, defines non-module helpers, initializes on DOMContentLoaded.
// =============================================================================

// ---------------------------------------------------------------------------
// Module Imports
// ---------------------------------------------------------------------------
import { state } from './modules/state.js';
import { saveDataToAPI, loadDataFromAPI, saveInventoryData, saveHistoryData } from './modules/api.js';
import { resetInactivityTimer, lockSystem, showPasswordModal, handleUnlock, updateLockUI, checkAccess, initAuth } from './modules/auth.js';
import {
  formatStockingQty,
  getBreakdownParts,
  calculateSingleStockingQtyTotal,
  getColorClassForRemark,
  escapeHtml,
  isShortenBreakdownOn,
  isSimplifyBreakdownOn,
  simplifyBreakdownForDisplay,
  formatStockingQtyAndRemarksForDisplay,
  renderBreakdownCellHtml,
  refreshAllBreakdownDisplays,
  renderRow,
  inferCapacity,
  generateBreakdownWithCapacity,
  mergeDeliveriesBreakdown,
  getWithdrawableStock,
  performWithdrawal,
  applyFiltersAndSort,
  getMovedItems,
  convertToExcelFormula,
  applyBuildingRackVisibility,
} from './modules/inventory.js';
import {
  renderHistoryLog,
  loadMoreHistoryRows,
  prependHistoryLog,
  logTransaction,
  getItemLogsForCode,
  renderItemDetailedReport,
} from './modules/history.js';
import { openEditBreakdownModal, updateEditBreakdownPreview, generateRemarksInputs } from './modules/modals.js';
import {
  loadXLSX,
  exportReportFile,
  printInventory,
  exportBackupFile,
  importBackupFile,
  compareVariance,
} from './modules/export.js';
import {
  showToast,
  customAlert,
  customConfirm,
  setButtonLoading,
  showSaveIndicator,
  updateDarkModeIcon,
  toggleDarkMode,
  updateDateTimeAndShift,
  generateBackupFilename,
  generateReportFilename,
} from './modules/ui.js';

// ---------------------------------------------------------------------------
// DOM Element References (only those needed by app.js event wiring)
// ---------------------------------------------------------------------------
const $ = id => document.getElementById(id);

const darkModeToggle = $('darkModeToggle');
const inventoryTableBody = $('inventoryTableBody');
const clearInventoryButton = $('clearInventoryButton');
const itemTypeFilter = $('itemTypeFilter');
const remarksFilter = $('remarksFilter');
const dataPresenceFilter = $('dataPresenceFilter');
const materialCodeSort = $('materialCodeSort');
const searchBar = $('searchBar');
const openImportModalButton = $('openImportModalButton');
const historyTableBody = $('historyTableBody');
const historyLoadMoreButton = $('historyLoadMoreButton');
const clearHistoryButton = $('clearHistoryButton');
const fileOpsButton = $('fileOpsButton');
const importDataModal = $('importDataModal');
const excelSheetSelect = $('excelSheetSelect');
const stockingQtyDateSelectModal = $('stockingQtyDateSelectModal');
const confirmImportButton = $('confirmImportButton');
const cancelImportButton = $('cancelImportButton');
const importErrorMessageDiv = $('importErrorMessageDiv');
const editBreakdownModal = $('editBreakdownModal');
const editBreakdownInput = $('editBreakdownInput');
const editBreakdownItemCode = $('editBreakdownItemCode');
const editBreakdownPreview = $('editBreakdownPreview');
const stockingQtyFieldGroup = $('stockingQtyFieldGroup');
const dynamicRemarksContainer = $('dynamicRemarksContainer');
const showBuildingRackCheckbox = $('showBuildingRackCheckbox');
const includeBldgRackPrintCheckbox = $('includeBldgRackPrintCheckbox');
const shortenBreakdownCheckbox = $('shortenBreakdownCheckbox');
const simplifyBreakdownCheckbox = $('simplifyBreakdownCheckbox');
const saveBreakdownButton = $('saveBreakdownButton');
const cancelBreakdownButton = $('cancelBreakdownButton');
const viewDetailedReportButton = $('viewDetailedReportButton');
const itemDetailedReportModal = $('itemDetailedReportModal');
const itemReportCode = $('itemReportCode');
const exportItemReportButton = $('exportItemReportButton');
const closeItemReportButton = $('closeItemReportButton');
const fileOpsModal = $('fileOpsModal');
const backupButton = $('backupButton');
const restoreButton = $('restoreButton');
const exportExcelButton = $('exportExcelButton');
const cancelFileOps = $('cancelFileOps');
const currentDateInput = $('currentDate');
const currentTimeInput = $('currentTime');
const currentShiftSelect = $('currentShift');
const userNameInput = $('userName');
const clearChoiceModal = $('clearChoiceModal');
const triggerClearAllButton = $('triggerClearAllButton');
const triggerBulkClearButton = $('triggerBulkClearButton');
const cancelClearChoice = $('cancelClearChoice');
const bulkClearQtyModal = $('bulkClearQtyModal');
const bulkClearFilterSection = $('bulkClearFilterSection');
const bulkClearList = $('bulkClearList');
const bulkSelectAllButton = $('bulkSelectAll');
const bulkDeselectAllButton = $('bulkDeselectAll');
const confirmBulkClearButton = $('confirmBulkClearButton');
const cancelBulkClear = $('cancelBulkClear');
const dataPresenceFilter_bulk = $('dataPresenceFilter_bulk');
const openBulkWithdrawModalButton = $('openBulkWithdrawModalButton');
const bulkWithdrawModal = $('bulkWithdrawModal');
const bulkWithdrawItemSearch = $('bulkWithdrawItemSearch');
const bulkWithdrawQtyInput = $('bulkWithdrawQtyInput');
const addToListWithdrawBtn = $('addToListWithdrawBtn');
const pendingWithdrawalListContainer = $('pendingWithdrawalListContainer');
const bulkWithdrawErrorMessage = $('bulkWithdrawErrorMessage');
const confirmBulkWithdrawButton = $('confirmBulkWithdrawButton');
const cancelBulkWithdraw = $('cancelBulkWithdraw');
const openBulkDeliveriesModalButton = $('openBulkDeliveriesModalButton');
const bulkDeliveriesModal = $('bulkDeliveriesModal');
const toggleMoreFiltersBtn = $('toggleMoreFiltersBtn');
const secondaryFilters = $('secondaryFilters');
const enableMovementFilter = $('enableMovementFilter');
const movementFilterOptions = $('movementFilterOptions');
const moveDateFrom = $('moveDateFrom');
const moveTimeFrom = $('moveTimeFrom');
const moveDateTo = $('moveDateTo');
const moveTimeTo = $('moveTimeTo');
const movementMode = $('movementMode');
const addToListBulkBtn = $('addToListBulkBtn');
const bulkDeliveryList = $('bulkDeliveryList');
const confirmBulkDeliveryButton = $('confirmBulkDeliveryButton');
const cancelBulkDelivery = $('cancelBulkDelivery');
const bulkDelItemSearch = $('bulkDelItemSearch');
const bulkDelQtyInput = $('bulkDelQtyInput');
const bulkDelSharedRemarks = $('bulkDelSharedRemarks');
const bulkDelSharedDate = $('bulkDelSharedDate');
const bulkDelPalletCapacity = $('bulkDelPalletCapacity');
const printInventoryButton = $('printInventoryButton');
const historyDateFrom = $('historyDateFrom');
const historyDateTo = $('historyDateTo');
const resetHistoryFilter = $('resetHistoryFilter');
const transactionHistoryToggle = $('transactionHistoryToggle');
const transactionHistoryContent = $('transactionHistoryContent');
const transactionHistoryIcon = $('transactionHistoryIcon');
const openVarianceModalButton = $('openVarianceModalButton');
const varianceModal = $('varianceModal');
const varianceFileInput = $('varianceFileInput');
const compareVarianceButton = $('compareVarianceButton');
const varianceTableBody = $('varianceTableBody');
const varianceErrorMessage = $('varianceErrorMessage');
const closeVarianceModalButton = $('closeVarianceModalButton');

const MATERIAL_CODE_HEADER = 'MATERIAL CODE';
const STOCKING_QTY_ROW_EXCEL_INDEX = 6;
const DATA_START_ROW_EXCEL_INDEX = 7;

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Helpers NOT in any module
// ---------------------------------------------------------------------------

// --- Searchable Combobox (replaces native datalist) ---
function attachSearchableCombobox(input, { getOptions, onSelect, maxResults = 50, emptyText = 'No matches' }) {
  const wrapper = input.parentElement;
  if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';

  const panel = document.createElement('div');
  panel.className = 'combobox-panel';
  panel.style.display = 'none';
  wrapper.appendChild(panel);

  let currentOptions = [];
  let highlightedIndex = -1;

  function updateHighlight() {
    Array.from(panel.children).forEach((el, i) => el.classList.toggle('is-highlighted', i === highlightedIndex));
    const activeEl = panel.children[highlightedIndex];
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function renderPanel(filterText) {
    const all = getOptions();
    const q = filterText.trim().toLowerCase();
    currentOptions = q
      ? all
          .map(opt => ({ opt, matchIdx: opt.value.toLowerCase().indexOf(q) }))
          .filter(x => x.matchIdx !== -1)
          .sort((a, b) => a.matchIdx - b.matchIdx)
          .map(x => x.opt)
          .slice(0, maxResults)
      : all.slice(0, maxResults);
    highlightedIndex = currentOptions.length ? 0 : -1;
    panel.innerHTML =
      currentOptions.length === 0
        ? `<div class="combobox-empty">${escapeHtml(emptyText)}</div>`
        : currentOptions
            .map(
              (opt, i) =>
                `<div class="combobox-option${i === 0 ? ' is-highlighted' : ''}" data-idx="${i}"><span class="combobox-option-value">${escapeHtml(opt.value)}</span>${opt.label ? `<span class="combobox-option-label">${opt.label}</span>` : ''}</div>`
            )
            .join('');
    panel.style.display = 'block';
  }

  function closePanel() {
    panel.style.display = 'none';
    currentOptions = [];
    highlightedIndex = -1;
  }

  function selectIndex(i) {
    const opt = currentOptions[i];
    if (!opt) return;
    input.value = opt.value;
    closePanel();
    onSelect(opt.value);
  }

  input.addEventListener('input', () => renderPanel(input.value));
  input.addEventListener('focus', () => renderPanel(input.value));

  input.addEventListener('keydown', e => {
    if (panel.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentOptions.length) {
        highlightedIndex = (highlightedIndex + 1) % currentOptions.length;
        updateHighlight();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentOptions.length) {
        highlightedIndex = (highlightedIndex - 1 + currentOptions.length) % currentOptions.length;
        updateHighlight();
      }
    } else if (e.key === 'Escape') {
      closePanel();
    }
  });

  panel.addEventListener('mousedown', e => {
    const optionEl = e.target.closest('.combobox-option');
    if (!optionEl) return;
    e.preventDefault();
    selectIndex(parseInt(optionEl.dataset.idx, 10));
  });

  document.addEventListener('click', e => {
    if (!wrapper.contains(e.target)) closePanel();
  });

  return {
    selectHighlighted: () => {
      if (panel.style.display !== 'none' && highlightedIndex > -1) {
        selectIndex(highlightedIndex);
        return true;
      }
      return false;
    },
    isOpen: () => panel.style.display !== 'none',
    close: closePanel,
  };
}

// --- Custom Glass-Styled Dropdowns ---
function wrapNativeSelect(selectEl) {
  if (selectEl.dataset.customWrapped) return;
  selectEl.dataset.customWrapped = 'true';
  selectEl.classList.add('custom-select-native');

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select-wrapper';
  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(selectEl);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';
  trigger.innerHTML = '<span class="custom-select-trigger-label"></span><i class="fas fa-chevron-down custom-select-trigger-icon"></i>';
  wrapper.appendChild(trigger);

  const panel = document.createElement('div');
  panel.className = 'custom-select-panel';
  panel.setAttribute('role', 'listbox');
  wrapper.appendChild(panel);

  const labelEl = trigger.querySelector('.custom-select-trigger-label');

  function renderLabel() {
    const opt = selectEl.options[selectEl.selectedIndex];
    labelEl.textContent = opt ? opt.textContent : '';
  }

  function renderOptions() {
    panel.innerHTML = '';
    Array.from(selectEl.options).forEach((opt, idx) => {
      const item = document.createElement('div');
      item.className = 'custom-select-option' + (idx === selectEl.selectedIndex ? ' is-selected' : '');
      item.textContent = opt.textContent;
      item.setAttribute('role', 'option');
      item.addEventListener('click', () => {
        selectEl.selectedIndex = idx;
        selectEl.dispatchEvent(new Event('input', { bubbles: true }));
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        renderLabel();
        closePanel();
      });
      panel.appendChild(item);
    });
  }

  function openPanel() {
    document.querySelectorAll('.custom-select-panel.is-open').forEach(p => {
      if (p !== panel) p.classList.remove('is-open');
    });
    document.querySelectorAll('.custom-select-trigger.is-open').forEach(t => {
      if (t !== trigger) t.classList.remove('is-open');
    });
    renderOptions();
    panel.classList.add('is-open');
    trigger.classList.add('is-open');
  }

  function closePanel() {
    panel.classList.remove('is-open');
    trigger.classList.remove('is-open');
  }

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    if (panel.classList.contains('is-open')) closePanel();
    else openPanel();
  });

  selectEl.__syncCustomSelect = function () {
    renderLabel();
    if (panel.classList.contains('is-open')) renderOptions();
  };

  const observer = new MutationObserver(() => {
    renderLabel();
    if (panel.classList.contains('is-open')) renderOptions();
  });
  observer.observe(selectEl, { childList: true });

  renderLabel();
}

function initCustomSelects() {
  document.querySelectorAll('select').forEach(wrapNativeSelect);
  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-panel.is-open').forEach(p => p.classList.remove('is-open'));
    document.querySelectorAll('.custom-select-trigger.is-open').forEach(t => t.classList.remove('is-open'));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.custom-select-panel.is-open').forEach(p => p.classList.remove('is-open'));
      document.querySelectorAll('.custom-select-trigger.is-open').forEach(t => t.classList.remove('is-open'));
    }
  });
}

// --- Bulk Delivery List Rendering ---
function renderBulkList() {
  if (!state.pendingBulkDeliveries.length) {
    bulkDeliveryList.innerHTML = '<p class="bulk-list-empty-text">No items added.</p>';
    return;
  }
  bulkDeliveryList.innerHTML = state.pendingBulkDeliveries
    .map(
      (i, idx) => `
    <div class="bulk-pending-card">
        <div class="bulk-pending-card-header">
            <input type="text" value="${escapeHtml(i.code)}" oninput="updatePendingItem(${idx}, 'code', this.value)" placeholder="Material Code">
            <button class="bulk-pending-card-remove" onclick="removeBulkDeliveryItem(${idx})"><i class="fas fa-times"></i></button>
        </div>
        <div class="bulk-pending-card-row">
            <div class="bulk-pending-card-field">
                <label>Qty:</label>
                <input type="text" value="${escapeHtml(i.qty)}" oninput="updatePendingItem(${idx}, 'qty', this.value)">
            </div>
            <div class="bulk-pending-card-field" style="flex: 2;">
                <label>Remarks:</label>
                <input type="text" value="${escapeHtml(i.remarks)}" oninput="updatePendingItem(${idx}, 'remarks', this.value)">
            </div>
        </div>
    </div>
`
    )
    .join('');
}

// --- Bulk Withdrawal List Rendering ---
function renderWithdrawList() {
  if (!state.pendingBulkWithdrawals.length) {
    pendingWithdrawalListContainer.innerHTML = '<p class="bulk-list-empty-text">No items added.</p>';
    return;
  }
  pendingWithdrawalListContainer.innerHTML = state.pendingBulkWithdrawals
    .map((item, idx) => {
      const totalWithdrawQty = calculateSingleStockingQtyTotal(formatStockingQty(item.qty));
      return `
    <div class="bulk-pending-card">
        <div class="bulk-pending-card-header">
            <span class="bulk-pending-card-code">${escapeHtml(item.code)}</span>
            <button class="bulk-pending-card-remove" onclick="removeWithdrawalItem(${idx})"><i class="fas fa-times"></i></button>
        </div>
        <div class="bulk-pending-card-row">
            <div class="bulk-pending-card-field">
                <label class="withdraw-qty-label">Qty Breakdown:</label>
                <input type="text" value="${escapeHtml(item.qty)}" onchange="updateWithdrawalItemQty(${idx}, this.value)">
            </div>
            <div class="bulk-pending-card-total withdraw-total-label">
                Total: ${totalWithdrawQty.toLocaleString()}
            </div>
        </div>
    </div>
`;
    })
    .join('');
}

// --- Bulk Clear Population ---
function populateBulkClearList(itemsToDisplay = state.originalRowsOrder) {
  bulkClearList.innerHTML = '';
  if (itemsToDisplay.length === 0) {
    bulkClearList.innerHTML = '<p style="text-align:center; color:grey;">No items match the filter.</p>';
    return;
  }
  itemsToDisplay.forEach((row, index) => {
    const itemCode = row.dataset.code;
    const totalQty = row.cells[2].textContent;
    const itemDiv = document.createElement('div');
    itemDiv.className = 'bulk-clear-item';
    const infoDiv = document.createElement('div');
    infoDiv.className = 'item-info';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `bulk-clear-check-${index}`;
    checkbox.value = itemCode;
    const label = document.createElement('label');
    label.htmlFor = `bulk-clear-check-${index}`;
    label.textContent = itemCode;
    const qtySpan = document.createElement('span');
    qtySpan.className = 'item-qty';
    qtySpan.textContent = `Total: ${totalQty}`;
    infoDiv.append(checkbox, label);
    itemDiv.append(infoDiv, qtySpan);
    bulkClearList.appendChild(itemDiv);
  });
}

// --- Bulk Clear Filter ---
function applyBulkClearFilters() {
  const itemType = document.getElementById('itemTypeFilter_bulk').value;
  const remarkType = document.getElementById('remarksFilter_bulk').value;
  const dataType = dataPresenceFilter_bulk.value;
  const filteredRows = state.originalRowsOrder.filter(row => {
    const code = row.dataset.code.toUpperCase();
    const remarks = JSON.parse(row.dataset.remarks || '[]').map(r => r.toLowerCase().trim());
    const qtyText = row.cells[1].textContent.trim();
    const passesItem =
      itemType === 'ALL' ||
      (itemType === 'LBL' && code.startsWith('LBL')) ||
      (itemType === 'CTN' && code.startsWith('CTN')) ||
      (itemType === 'PLASTIC' && (code.startsWith('BAG') || code.includes('BUNDLE'))) ||
      (itemType === 'OTHERS' && !/^(LBL|CTN|BAG)|BUNDLE/.test(code));
    const passesData =
      dataType === 'ALL' || (dataType === 'WITH_DATA' && qtyText) || (dataType === 'WITHOUT_DATA' && !qtyText);
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
    return passesItem && passesRemark && passesData;
  });
  populateBulkClearList(filteredRows);
}

// --- File Select (Excel Import) ---
function handleFileSelect(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      state.loadedWorkbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      excelSheetSelect.innerHTML = '';
      state.loadedWorkbook.SheetNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        excelSheetSelect.appendChild(opt);
      });
      handleSheetChange();
      importDataModal.style.display = 'block';
      importErrorMessageDiv.textContent = '';
    } catch (err) {
      importErrorMessageDiv.textContent = 'Error reading file.';
    }
  };
  reader.readAsArrayBuffer(file);
}

// --- Sheet Change ---
function handleSheetChange() {
  const sheetName = excelSheetSelect.value;
  const worksheet = state.loadedWorkbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  stockingQtyDateSelectModal.innerHTML = '<option value="">Do not import</option>';
  if (data.length >= STOCKING_QTY_ROW_EXCEL_INDEX) {
    const headerRow = data[5] || [];
    let counter = 1;
    headerRow.forEach((h, i) => {
      if (typeof h === 'string' && h.trim().toLowerCase().includes('stocking qty')) {
        stockingQtyDateSelectModal.innerHTML += `<option value="${i}">Stocking Qty ${counter++}</option>`;
      }
    });
  }
}

// --- Clickable Preview Parts (for edit breakdown modal) ---
function buildClickablePreviewParts(rawValue, remarks, locations) {
  const formattedBreakdown = formatStockingQty(rawValue);
  const parts = getBreakdownParts(formattedBreakdown);
  if (!parts.length || (parts.length === 1 && !parts[0])) return [];
  remarks = remarks || [];
  locations = locations || [];

  let groups;
  if (isSimplifyBreakdownOn()) {
    groups = [];
    const keyIndexMap = new Map();
    parts.forEach((part, idx) => {
      const trimmed = part.trim();
      const m = trimmed.match(/^([\d.,]+)\s*×\s*([\d.,]+)$/);
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
  } else {
    groups = parts.map((part, idx) => ({ type: 'plain', raw: part.trim(), indices: [idx] }));
  }

  const shorten = isShortenBreakdownOn();
  return groups.map(g => {
    let displayText;
    if (g.type === 'plain') {
      displayText = g.raw;
      if (shorten) {
        const multMatch = displayText.match(/^([\d.,]+)\s*×/);
        if (multMatch) displayText = `(${multMatch[1]})`;
      }
    } else if (g.multipliers.length > 1) {
      displayText = shorten ? `(${g.multipliers.join('+')})` : `(${g.multipliers.join(' + ')}) × ${g.multiplicand}`;
    } else {
      displayText = shorten ? `(${g.multipliers[0]})` : `${g.multipliers[0]}×${g.multiplicand}`;
    }
    const firstIdx = g.indices[0];
    const remark = remarks[firstIdx] || '';
    const colorClass = getColorClassForRemark(remark);
    const loc = (locations[firstIdx] || '').trim();
    return { text: displayText, colorClass, loc, indices: g.indices };
  });
}

// --- LCS-based Breakdown Alignment ---
function diffBreakdownParts(oldParts, newParts) {
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

function diffBreakdownPartsWithFallback(oldParts, newParts, excludedIndices) {
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

// --- Bulk Delivery Helpers ---
function autofillBulkDeliveryCapacity(code) {
  if (!code) return;
  const row = state.rowsByCode.get(code);

  if (state.palletCapacities[code]) {
    bulkDelPalletCapacity.value = state.palletCapacities[code];
  } else {
    const inferred = row ? inferCapacity(row.dataset.stockingQty) : null;
    if (inferred) {
      bulkDelPalletCapacity.value = inferred;
    } else if (row && row.dataset.remarks) {
      bulkDelPalletCapacity.value = '';
      try {
        const remarksArr = JSON.parse(row.dataset.remarks);
        if (remarksArr.length > 0) {
          const firstRemark = remarksArr[0];
          const match = firstRemark.match(/(\d+)\s*PCS\/PLT/i);
          if (match && match[1]) {
            bulkDelPalletCapacity.value = match[1];
            state.palletCapacities[code] = match[1];
            saveDataToAPI(['palletCapacities'], {}, null, { changedCode: code });
          }
        }
      } catch (err) {
        console.error('Error parsing remarks for pallet capacity auto-fill', err);
      }
    } else {
      bulkDelPalletCapacity.value = '';
    }
  }
}

function handleBulkDelFocusShift() {
  setTimeout(() => {
    const capacity = bulkDelPalletCapacity.value;
    if (capacity && capacity.trim() !== '') {
      bulkDelQtyInput.focus();
    } else {
      bulkDelPalletCapacity.focus();
    }
  }, 10);
}

// ---------------------------------------------------------------------------
// Window globals (referenced by inline HTML onclick/oninput handlers)
// ---------------------------------------------------------------------------
window.updatePendingItem = function (idx, key, value) {
  state.pendingBulkDeliveries[idx][key] = value;
};

window.removeBulkDeliveryItem = function (idx) {
  state.pendingBulkDeliveries.splice(idx, 1);
  renderBulkList();
};

window.removeWithdrawalItem = function (idx) {
  state.pendingBulkWithdrawals.splice(idx, 1);
  renderWithdrawList();
};

window.updateWithdrawalItemQty = function (idx, newQtyStr) {
  const item = state.pendingBulkWithdrawals[idx];
  if (!item) return;
  const code = item.code;
  const row = state.rowsByCode.get(code);
  if (!row) return;

  const maxWithdrawable = getWithdrawableStock(row);
  const newTotal = calculateSingleStockingQtyTotal(formatStockingQty(newQtyStr));

  if (newTotal > maxWithdrawable) {
    showToast(`Cannot withdraw ${newTotal.toLocaleString()}. Only ${maxWithdrawable.toLocaleString()} is available for ${code}.`, 'error');
    renderWithdrawList();
    return;
  }

  if (newTotal <= 0) {
    showToast('Please enter a valid quantity greater than 0.', 'error');
    renderWithdrawList();
    return;
  }

  state.pendingBulkWithdrawals[idx].qty = newQtyStr;
  renderWithdrawList();
};

// ---------------------------------------------------------------------------
// Event Listeners — Auth (delegated to initAuth module, but we also call it)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Event Listeners — Dark Mode
// ---------------------------------------------------------------------------
darkModeToggle.addEventListener('click', toggleDarkMode);
if (localStorage.getItem('darkMode') === 'true') {
  document.body.classList.add('dark-mode');
  updateDarkModeIcon(true);
}

// ---------------------------------------------------------------------------
// Event Listeners — Filters
// ---------------------------------------------------------------------------
[itemTypeFilter, remarksFilter, dataPresenceFilter, materialCodeSort, moveDateFrom, moveTimeFrom, moveDateTo, moveTimeTo, movementMode].forEach(el =>
  el.addEventListener('input', () => applyFiltersAndSort().catch(console.error))
);

let searchBarDebounceTimer = null;
searchBar.addEventListener('input', () => {
  clearTimeout(searchBarDebounceTimer);
  searchBarDebounceTimer = setTimeout(() => applyFiltersAndSort().catch(console.error), 250);
});

// Legacy ↔ Modern movement checkbox sync
const legacyMovement = document.getElementById('enableMovementFilterLegacy');
const modernMovement = document.getElementById('enableMovementFilter');
if (legacyMovement && modernMovement) {
  legacyMovement.addEventListener('change', () => {
    modernMovement.checked = legacyMovement.checked;
    modernMovement.dispatchEvent(new Event('change'));
  });
  modernMovement.addEventListener('change', () => {
    legacyMovement.checked = modernMovement.checked;
  });
}

toggleMoreFiltersBtn.addEventListener('click', () => {
  if (secondaryFilters.style.display === 'none') {
    secondaryFilters.style.display = 'flex';
    toggleMoreFiltersBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Less';
  } else {
    secondaryFilters.style.display = 'none';
    toggleMoreFiltersBtn.innerHTML = '<i class="fas fa-sliders-h"></i> More';
  }
});

enableMovementFilter.addEventListener('change', () => {
  if (enableMovementFilter.checked) {
    movementFilterOptions.style.display = 'flex';
    if (!moveDateFrom.value) {
      const now = new Date();
      moveDateFrom.value = now.toISOString().split('T')[0];
    }
    if (!moveDateTo.value) {
      const now = new Date();
      moveDateTo.value = now.toISOString().split('T')[0];
    }
  } else {
    movementFilterOptions.style.display = 'none';
  }
  applyFiltersAndSort().catch(console.error);
});

// ---------------------------------------------------------------------------
// Event Listeners — Transaction History Toggle
// ---------------------------------------------------------------------------
transactionHistoryToggle.addEventListener('click', () => {
  if (transactionHistoryContent.style.display === 'none') {
    transactionHistoryContent.style.display = 'block';
    transactionHistoryIcon.classList.remove('fa-chevron-down');
    transactionHistoryIcon.classList.add('fa-chevron-up');
  } else {
    transactionHistoryContent.style.display = 'none';
    transactionHistoryIcon.classList.remove('fa-chevron-up');
    transactionHistoryIcon.classList.add('fa-chevron-down');
  }
});

// ---------------------------------------------------------------------------
// Event Listeners — History Date Filters
// ---------------------------------------------------------------------------
[historyDateFrom, historyDateTo].forEach(el => el.addEventListener('change', () => renderHistoryLog(searchBar.value.toLowerCase())));
resetHistoryFilter.addEventListener('click', () => {
  historyDateFrom.value = '';
  historyDateTo.value = '';
  renderHistoryLog(searchBar.value.toLowerCase());
});
historyLoadMoreButton.addEventListener('click', loadMoreHistoryRows);

// ---------------------------------------------------------------------------
// Event Listeners — File Operations Modal
// ---------------------------------------------------------------------------
fileOpsButton.addEventListener('click', () => {
  checkAccess(() => {
    fileOpsModal.style.display = 'block';
  });
});
cancelFileOps.addEventListener('click', () => {
  fileOpsModal.style.display = 'none';
});

openImportModalButton.addEventListener('click', () => {
  checkAccess(async () => {
    await loadXLSX();
    fileOpsModal.style.display = 'none';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls';
    fileInput.onchange = e => handleFileSelect(e.target.files[0]);
    fileInput.click();
  });
});

clearInventoryButton.addEventListener('click', () => {
  checkAccess(() => {
    fileOpsModal.style.display = 'none';
    clearChoiceModal.style.display = 'block';
  });
});

clearHistoryButton.addEventListener('click', () => {
  checkAccess(async () => {
    setButtonLoading(clearHistoryButton, true);
    try {
      if (await customConfirm('Are you sure?')) {
        state.transactionHistory = [];
        state.historyFilteredCache = [];
        state.historyRenderedCount = 0;
        historyTableBody.innerHTML = '';
        saveHistoryData();
        logTransaction('CLEAR HISTORY', '-', 'Transaction history cleared.');
      }
    } finally {
      setButtonLoading(clearHistoryButton, false);
    }
  });
});

backupButton.addEventListener('click', async () => {
  await loadXLSX();
  exportBackupFile();
  fileOpsModal.style.display = 'none';
});
restoreButton.addEventListener('click', async () => {
  await loadXLSX();
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.xlsx, .xls';
  fileInput.onchange = e => importBackupFile(e.target.files[0]);
  fileInput.click();
  fileOpsModal.style.display = 'none';
});
exportExcelButton.addEventListener('click', async () => {
  await loadXLSX();
  exportReportFile();
  fileOpsModal.style.display = 'none';
});
printInventoryButton.addEventListener('click', () => {
  printInventory();
  fileOpsModal.style.display = 'none';
});

// ---------------------------------------------------------------------------
// Event Listeners — Clear Choice / Bulk Clear
// ---------------------------------------------------------------------------
cancelClearChoice.addEventListener('click', () => {
  clearChoiceModal.style.display = 'none';
});

triggerClearAllButton.addEventListener('click', async () => {
  setButtonLoading(triggerClearAllButton, true);
  try {
    if (await customConfirm('This will delete all items in the inventory. Are you sure?')) {
      inventoryTableBody.innerHTML = '';
      state.originalRowsOrder = [];
      state.rowsByCode = new Map();
      await applyFiltersAndSort();
      saveInventoryData();
      logTransaction('CLEAR ALL', '-', 'All inventory data cleared.');
    }
    clearChoiceModal.style.display = 'none';
  } finally {
    setButtonLoading(triggerClearAllButton, false);
  }
});

triggerBulkClearButton.addEventListener('click', () => {
  bulkClearFilterSection.querySelectorAll('select').forEach(sel => {
    sel.value = 'ALL';
    if (sel.__syncCustomSelect) sel.__syncCustomSelect();
  });
  populateBulkClearList();
  clearChoiceModal.style.display = 'none';
  bulkClearQtyModal.style.display = 'block';
});

bulkClearFilterSection.querySelectorAll('select').forEach(el => el.addEventListener('input', applyBulkClearFilters));

bulkSelectAllButton.addEventListener('click', () => {
  bulkClearList.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = true));
});
bulkDeselectAllButton.addEventListener('click', () => {
  bulkClearList.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = false));
});
cancelBulkClear.addEventListener('click', () => {
  bulkClearQtyModal.style.display = 'none';
});

confirmBulkClearButton.addEventListener('click', async () => {
  const selectedCheckboxes = Array.from(bulkClearList.querySelectorAll('input[type="checkbox"]:checked'));
  if (selectedCheckboxes.length === 0) {
    showToast('Please select at least one item to clear.', 'error');
    return;
  }
  setButtonLoading(confirmBulkClearButton, true);
  try {
    const codesToClear = selectedCheckboxes.map(cb => cb.value);
    if (await customConfirm(`Are you sure you want to clear the quantity for ${codesToClear.length} selected item(s)?`)) {
      codesToClear.forEach(code => {
        const targetRow = state.rowsByCode.get(code);
        if (targetRow) {
          targetRow.dataset.stockingQty = '';
          targetRow.dataset.remarks = '[]';
          targetRow.dataset.locations = '[]';
          targetRow.cells[1].innerHTML = '';
          targetRow.cells[2].textContent = '0';
          targetRow.cells[3].textContent = '';
        }
      });
      saveInventoryData(codesToClear);
      logTransaction('BULK CLEAR QTY', `${codesToClear.length} items`, codesToClear.slice(0, 5).join(', ') + (codesToClear.length > 5 ? '...' : ''));
      await applyFiltersAndSort();
      applyBuildingRackVisibility();
      showToast(`Successfully cleared quantities for ${codesToClear.length} item(s).`, 'success');
      bulkClearQtyModal.style.display = 'none';
    }
  } finally {
    setButtonLoading(confirmBulkClearButton, false);
  }
});

// ---------------------------------------------------------------------------
// Event Listeners — Import Modal
// ---------------------------------------------------------------------------
confirmImportButton.addEventListener('click', async () => {
  if (!(await customConfirm('Importing new data will overwrite the current inventory. Do you want to continue?'))) return;
  setButtonLoading(confirmImportButton, true);
  try {
    const sheetName = excelSheetSelect.value;
    const worksheet = state.loadedWorkbook.Sheets[sheetName];
    const qtyColIndex = stockingQtyDateSelectModal.value;
    const dataForHeaders = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    const codeHeaderRow = dataForHeaders[4] || [];
    const codeColIndex = codeHeaderRow.findIndex(h => typeof h === 'string' && h.trim().toUpperCase() === 'MATERIAL CODE');
    if (codeColIndex === -1) {
      importErrorMessageDiv.textContent = '"MATERIAL CODE" column not found on Row 5.';
      return;
    }
    inventoryTableBody.innerHTML = '';
    state.originalRowsOrder = [];
    state.rowsByCode = new Map();
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    let importedCount = 0;
    for (let R = DATA_START_ROW_EXCEL_INDEX - 1; R <= range.e.r; ++R) {
      const codeCell = worksheet[XLSX.utils.encode_cell({ c: codeColIndex, r: R })];
      if (codeCell && codeCell.v) {
        importedCount++;
        const code = codeCell.w || codeCell.v.toString();
        let stockingQty = '';
        if (qtyColIndex) {
          const qtyCell = worksheet[XLSX.utils.encode_cell({ c: parseInt(qtyColIndex), r: R })];
          if (qtyCell) stockingQty = qtyCell.f || qtyCell.w || String(qtyCell.v) || '';
        }
        renderRow(
          {
            code: code.trim(),
            stockingQty: stockingQty.toString(),
            remarks: Array(getBreakdownParts(formatStockingQty(stockingQty)).length).fill(''),
          },
          false
        );
      }
    }
    await applyFiltersAndSort();
    const importLog = logTransaction('IMPORT', '-', `Imported ${importedCount} items from sheet: ${sheetName}.`, null, true);
    prependHistoryLog(importLog);
    saveDataToAPI(['inventoryData', 'transactionHistory'], {}, [importLog]);
    importDataModal.style.display = 'none';
  } finally {
    setButtonLoading(confirmImportButton, false);
  }
});

cancelImportButton.addEventListener('click', () => {
  importDataModal.style.display = 'none';
});

// ---------------------------------------------------------------------------
// Event Listeners — Inventory Table Click (Editable Breakdown)
// ---------------------------------------------------------------------------
inventoryTableBody.addEventListener('click', event => {
  const targetCell = event.target.closest('.editable-breakdown');
  if (targetCell) {
    const code = targetCell.closest('tr')?.dataset.code;
    checkAccess(() => {
      const row = state.rowsByCode.get(code);
      if (!row) return;
      openEditBreakdownModal(row);
    });
  }
});

// ---------------------------------------------------------------------------
// Event Listeners — Edit Breakdown Modal
// ---------------------------------------------------------------------------
let editBreakdownDebounceTimer = null;
editBreakdownInput.addEventListener('input', function () {
  clearTimeout(editBreakdownDebounceTimer);
  const val = this.value;
  editBreakdownDebounceTimer = setTimeout(() => {
    const newParts = getBreakdownParts(formatStockingQty(val));
    const currentRemarks = Array.from(dynamicRemarksContainer.querySelectorAll('.remark-part-input')).map(input => input.value);
    const currentLocations = Array.from(dynamicRemarksContainer.querySelectorAll('.location-part-input')).map(input => input.value);
    const mapping = diffBreakdownPartsWithFallback(state.lastEditBreakdownParts, newParts, state.markedForDeletionIndices);
    const alignedRemarks = mapping.map(oldIdx => (oldIdx === -1 ? '' : currentRemarks[oldIdx] || ''));
    const alignedLocations = mapping.map(oldIdx => (oldIdx === -1 ? '' : currentLocations[oldIdx] || ''));
    state.lastEditBreakdownParts = newParts;
    state.markedForDeletionIndices = new Set();
    generateRemarksInputs(newParts.length, alignedRemarks, alignedLocations);
    updateEditBreakdownPreview();
  }, 200);
});

dynamicRemarksContainer.addEventListener('input', function (event) {
  if (event.target.classList.contains('remark-part-input') || event.target.classList.contains('location-part-input')) {
    updateEditBreakdownPreview();
  }
});

editBreakdownPreview.addEventListener('click', function (event) {
  const target = event.target.closest('.preview-part');
  if (!target) return;
  const index = parseInt(target.dataset.index, 10);
  if (isNaN(index)) return;

  document.querySelectorAll('.field-flash-highlight').forEach(el => el.classList.remove('field-flash-highlight'));

  const remarkInputs = dynamicRemarksContainer.querySelectorAll('.remark-part-input');
  const locationInputs = dynamicRemarksContainer.querySelectorAll('.location-part-input');

  const remarkGroup = remarkInputs[index] ? remarkInputs[index].closest('.item-input') : null;
  const locationGroup = locationInputs[index] ? locationInputs[index].closest('.item-input') : null;
  if (remarkGroup) remarkGroup.classList.add('field-flash-highlight');
  if (locationGroup) locationGroup.classList.add('field-flash-highlight');

  if (stockingQtyFieldGroup) stockingQtyFieldGroup.classList.add('stocking-qty-floating');

  if (remarkGroup) {
    remarkGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  setTimeout(() => {
    document.querySelectorAll('.field-flash-highlight').forEach(el => el.classList.remove('field-flash-highlight'));
  }, 2200);
});

saveBreakdownButton.addEventListener('click', () => {
  if (!state.currentEditingRow) return;
  const oldStockingQty = state.currentEditingRow.dataset.stockingQty;
  const oldRemarks = JSON.parse(state.currentEditingRow.dataset.remarks || '[]');
  const oldLocations = JSON.parse(state.currentEditingRow.dataset.locations || '[]');
  const newStockingQty = editBreakdownInput.value;
  const newRemarks = Array.from(dynamicRemarksContainer.querySelectorAll('.remark-part-input')).map(input => input.value.trim());
  const newLocations = Array.from(dynamicRemarksContainer.querySelectorAll('.location-part-input')).map(input => input.value.trim());
  state.currentEditingRow.dataset.stockingQty = newStockingQty;
  state.currentEditingRow.dataset.remarks = JSON.stringify(newRemarks);
  state.currentEditingRow.dataset.locations = JSON.stringify(newLocations);
  const formattedBreakdown = formatStockingQty(newStockingQty);
  const total = calculateSingleStockingQtyTotal(formattedBreakdown);
  state.currentEditingRow.cells[1].innerHTML = renderBreakdownCellHtml(newStockingQty, newRemarks, newLocations);
  state.currentEditingRow.cells[2].textContent = total.toLocaleString();
  state.currentEditingRow.cells[3].textContent = newRemarks.filter(r => r).join(' | ');
  saveInventoryData([state.currentEditingRow.dataset.code]);
  logTransaction('EDIT ITEM', state.currentEditingRow.dataset.code, `Qty: "${oldStockingQty}" -> "${newStockingQty}"`, {
    oldQty: oldStockingQty,
    oldRemarks,
    oldLocations,
    newQty: newStockingQty,
    newRemarks,
    newLocations,
  });
  showToast('Item updated.', 'success');
  editBreakdownModal.style.display = 'none';
});

editBreakdownModal.addEventListener('keydown', function (event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveBreakdownButton.click();
  }
});

cancelBreakdownButton.addEventListener('click', () => {
  editBreakdownModal.style.display = 'none';
});

// ---------------------------------------------------------------------------
// Event Listeners — Detailed Item Report
// ---------------------------------------------------------------------------
viewDetailedReportButton.addEventListener('click', () => {
  if (!state.currentEditingRow) return;
  renderItemDetailedReport(state.currentEditingRow.dataset.code);
  itemDetailedReportModal.style.display = 'block';
});
closeItemReportButton.addEventListener('click', () => {
  itemDetailedReportModal.style.display = 'none';
});
exportItemReportButton.addEventListener('click', async () => {
  await loadXLSX();
  const code = itemReportCode.textContent;
  const logs = getItemLogsForCode(code);
  const dataForExport = [['DATE & TIME', 'TRANSACTION', 'QTY CHANGE', 'DETAILS']];
  logs.forEach(l => {
    const formattedDate = new Date(l.timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    const detailsText = l.deltaLabel && l.deltaLabel !== l.details ? `${l.deltaLabel}  (${l.details})` : l.details;
    dataForExport.push([formattedDate, l.action, typeof l.delta === 'number' ? l.delta : '', detailsText]);
  });
  if (dataForExport.length <= 1) {
    showToast('No transaction history to export for this item.', 'error');
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet(dataForExport);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Item Report');
  XLSX.writeFile(wb, `item_report_${code}_${Date.now()}.xlsx`);
  logTransaction('EXPORT ITEM REPORT', code, 'Detailed item transaction report exported.');
});

// ---------------------------------------------------------------------------
// Event Listeners — Bulk Delivery
// ---------------------------------------------------------------------------
let bulkDeliveryComboboxOptions = [];
openBulkDeliveriesModalButton.addEventListener('click', () => {
  checkAccess(() => {
    const sortedRows = [...state.originalRowsOrder].sort((a, b) => {
      const stockA = calculateSingleStockingQtyTotal(formatStockingQty(a.dataset.stockingQty));
      const stockB = calculateSingleStockingQtyTotal(formatStockingQty(b.dataset.stockingQty));
      if (stockA > 0 && stockB <= 0) return -1;
      if (stockA <= 0 && stockB > 0) return 1;
      return (a.dataset.code || '').localeCompare(b.dataset.code || '');
    });
    bulkDeliveryComboboxOptions = sortedRows.map(row => {
      const code = row.dataset.code;
      const totalStock = calculateSingleStockingQtyTotal(formatStockingQty(row.dataset.stockingQty));
      const hasStock = totalStock > 0;
      return { value: code, label: hasStock ? `\u{1F7E2} (${totalStock.toLocaleString()})` : '\u{1F534} (Empty)' };
    });

    state.pendingBulkDeliveries = [];
    bulkDelItemSearch.value = '';
    bulkDelPalletCapacity.value = '';
    bulkDelQtyInput.value = '';
    bulkDelSharedRemarks.value = '';
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    bulkDelSharedDate.value = `${year}-${month}-${day}`;
    renderBulkList();

    bulkDeliveriesModal.style.display = 'block';
    setTimeout(() => bulkDelSharedRemarks.focus(), 100);
  });
});

const bulkDeliveryInputs = [bulkDelSharedRemarks, bulkDelSharedDate, bulkDelItemSearch, bulkDelPalletCapacity, bulkDelQtyInput];

bulkDeliveryInputs.forEach((input, index) => {
  input.addEventListener('keydown', e => {
    if ((input === bulkDelItemSearch || input === bulkDelSharedRemarks) && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextInput = bulkDeliveryInputs[index + 1];
      if (nextInput) nextInput.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevInput = bulkDeliveryInputs[index - 1];
      if (prevInput) prevInput.focus();
    }
  });
});

bulkDelSharedRemarks.addEventListener('input', e => {
  if (e.inputType === 'insertReplacementText') {
    setTimeout(() => bulkDelSharedDate.focus(), 10);
  }
});

bulkDelSharedRemarks.addEventListener('change', () => {
  const typedValue = bulkDelSharedRemarks.value.trim().toLowerCase();
  const options = Array.from(document.getElementById('sharedRemarksDatalist').options);
  const exactMatch = options.some(opt => opt.value.toLowerCase() === typedValue);
  if (exactMatch) {
    setTimeout(() => bulkDelSharedDate.focus(), 10);
  }
});

bulkDelSharedRemarks.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === 'Tab') {
    if (e.key === 'Tab') e.preventDefault();
    setTimeout(() => {
      if (document.activeElement === bulkDelSharedDate) return;
      const typedValue = bulkDelSharedRemarks.value.trim().toLowerCase();
      if (typedValue) {
        let exactMatch = false;
        let firstMatch = null;
        const options = Array.from(document.getElementById('sharedRemarksDatalist').options);
        for (const option of options) {
          const optionValue = option.value.toLowerCase();
          if (optionValue === typedValue) {
            exactMatch = true;
            break;
          }
          if (!firstMatch && optionValue.includes(typedValue)) {
            firstMatch = option.value;
          }
        }
        if (exactMatch) {
          bulkDelSharedDate.focus();
          return;
        }
        if (!exactMatch && firstMatch) {
          bulkDelSharedRemarks.value = firstMatch;
          bulkDelSharedDate.focus();
        }
      } else {
        bulkDelSharedDate.focus();
      }
    }, 150);
  }
});

const bulkDeliveryCombobox = attachSearchableCombobox(bulkDelItemSearch, {
  getOptions: () => bulkDeliveryComboboxOptions,
  onSelect: code => {
    autofillBulkDeliveryCapacity(code);
    handleBulkDelFocusShift();
  },
});

bulkDelItemSearch.addEventListener('input', () => {
  autofillBulkDeliveryCapacity(bulkDelItemSearch.value.trim());
});

bulkDelItemSearch.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === 'Tab') {
    if (e.key === 'Tab') e.preventDefault();
    if (bulkDeliveryCombobox.selectHighlighted()) return;
    setTimeout(() => {
      if (document.activeElement === bulkDelQtyInput || document.activeElement === bulkDelPalletCapacity) return;
      const capacity = bulkDelPalletCapacity.value;
      if (capacity && capacity.trim() !== '') {
        bulkDelQtyInput.focus();
      } else {
        bulkDelPalletCapacity.focus();
      }
    }, 10);
  }
});

bulkDelQtyInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addToListBulkBtn.click();
  }
});

addToListBulkBtn.addEventListener('click', () => {
  const code = bulkDelItemSearch.value.trim();
  let qty = bulkDelQtyInput.value.trim();
  const capacity = parseFloat(bulkDelPalletCapacity.value);

  if (!code || !qty) {
    showToast('Material Code and Quantity are required.', 'error');
    return;
  }

  if (!isNaN(capacity) && capacity > 0) {
    state.palletCapacities[code] = capacity;
    saveDataToAPI(['palletCapacities'], {}, null, { changedCode: code });

    const totalQty = calculateSingleStockingQtyTotal(formatStockingQty(qty));
    qty = generateBreakdownWithCapacity(totalQty, capacity);
    qty = qty.replace(/\s*\|\s*/g, '+').replace(/×/g, 'x');
  }

  const rem = bulkDelSharedRemarks.value.trim();
  const date = bulkDelSharedDate.value;
  let formattedDate = '';
  if (date) {
    const [y, m, d] = date.split('-');
    formattedDate = `${m}-${d}-${y}`;
  }
  const initialRemark = formattedDate ? (rem ? `${rem} ${formattedDate}` : formattedDate) : rem;

  const existingIndex = state.pendingBulkDeliveries.findIndex(item => item.code === code);
  if (existingIndex > -1) {
    if (!isNaN(capacity) && capacity > 0) {
      state.pendingBulkDeliveries[existingIndex].qty = mergeDeliveriesBreakdown(state.pendingBulkDeliveries[existingIndex].qty, qty, capacity);
    } else {
      state.pendingBulkDeliveries[existingIndex].qty += '+' + qty;
    }
    if (initialRemark && !state.pendingBulkDeliveries[existingIndex].remarks.includes(initialRemark)) {
      state.pendingBulkDeliveries[existingIndex].remarks += ' | ' + initialRemark;
    }
  } else {
    state.pendingBulkDeliveries.push({ code, qty, remarks: initialRemark });
  }

  renderBulkList();
  bulkDelItemSearch.value = '';
  bulkDelQtyInput.value = '';
  bulkDelItemSearch.focus();
});

confirmBulkDeliveryButton.addEventListener('click', async () => {
  if (state.pendingBulkDeliveries.length === 0) {
    showToast('No items to deliver.', 'error');
    return;
  }

  let successCount = 0;
  const changedCodes = [];
  const newLogs = [];
  state.pendingBulkDeliveries.forEach(d => {
    let row = state.rowsByCode.get(d.code);
    if (!row) {
      renderRow({ code: d.code, stockingQty: '', remarks: [] }, false);
      row = state.rowsByCode.get(d.code);
    }

    const oldQty = row.dataset.stockingQty || '';
    const formattedNew = formatStockingQty(d.qty);
    const combined = oldQty ? `${oldQty} | ${formattedNew}` : formattedNew;
    row.dataset.stockingQty = combined;

    const oldRemarks = JSON.parse(row.dataset.remarks || '[]');
    const count = getBreakdownParts(formattedNew).length;
    const specificRemarks = Array(count).fill(d.remarks);
    const finalRemarks = [...oldRemarks, ...specificRemarks];
    row.dataset.remarks = JSON.stringify(finalRemarks);

    const finalFormatted = formatStockingQty(combined);
    const total = calculateSingleStockingQtyTotal(finalFormatted);

    row.cells[1].innerHTML = renderBreakdownCellHtml(row.dataset.stockingQty, finalRemarks, JSON.parse(row.dataset.locations || '[]'));
    row.cells[2].textContent = total.toLocaleString();
    row.cells[3].textContent = finalRemarks.filter(r => r).join(' | ');

    const added = calculateSingleStockingQtyTotal(formattedNew);
    const newLog = logTransaction(
      'DELIVERY (BULK)',
      d.code,
      `+${added.toLocaleString()} pcs`,
      { oldQty, oldRemarks, newQty: combined, newRemarks: finalRemarks, addedQty: formattedNew, addedRemarks: specificRemarks },
      true
    );
    newLogs.push(newLog);
    changedCodes.push(d.code);
    successCount++;
  });

  try {
    renderHistoryLog(searchBar.value.toLowerCase());
    await saveDataToAPI(['inventoryData', 'transactionHistory'], { changedCodes }, newLogs);
    await applyFiltersAndSort();
    bulkDeliveriesModal.style.display = 'none';
    showToast(`Successfully saved ${successCount} deliveries.`, 'success');
  } catch (err) {
    console.error('Bulk delivery save failed:', err);
    showToast('Failed to save delivery data. Please try again.', 'error');
  }
});

cancelBulkDelivery.addEventListener('click', () => {
  bulkDeliveriesModal.style.display = 'none';
});

// ---------------------------------------------------------------------------
// Event Listeners — Bulk Withdrawal
// ---------------------------------------------------------------------------
let bulkWithdrawComboboxOptions = [];
openBulkWithdrawModalButton.addEventListener('click', () => {
  checkAccess(() => {
    const sortedRows = [...state.originalRowsOrder].sort((a, b) => {
      const stockA = getWithdrawableStock(a);
      const stockB = getWithdrawableStock(b);
      if (stockA > 0 && stockB <= 0) return -1;
      if (stockA <= 0 && stockB > 0) return 1;
      return (a.dataset.code || '').localeCompare(b.dataset.code || '');
    });

    bulkWithdrawComboboxOptions = sortedRows
      .map(row => ({ code: row.dataset.code, stock: getWithdrawableStock(row) }))
      .filter(x => x.stock > 0)
      .map(x => ({ value: x.code, label: `\u{1F7E2} Avail: ${x.stock.toLocaleString()}` }));

    state.pendingBulkWithdrawals = [];
    bulkWithdrawItemSearch.value = '';
    bulkWithdrawQtyInput.value = '';
    bulkWithdrawErrorMessage.innerHTML = '';
    renderWithdrawList();
    bulkWithdrawModal.style.display = 'block';
    setTimeout(() => bulkWithdrawItemSearch.focus(), 100);
  });
});

const bulkWithdrawInputs = [bulkWithdrawItemSearch, bulkWithdrawQtyInput];

bulkWithdrawInputs.forEach((input, index) => {
  input.addEventListener('keydown', e => {
    if (input === bulkWithdrawItemSearch && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextInput = bulkWithdrawInputs[index + 1];
      if (nextInput) nextInput.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevInput = bulkWithdrawInputs[index - 1];
      if (prevInput) prevInput.focus();
    }
  });
});

const bulkWithdrawCombobox = attachSearchableCombobox(bulkWithdrawItemSearch, {
  getOptions: () => bulkWithdrawComboboxOptions,
  onSelect: () => {
    bulkWithdrawQtyInput.focus();
  },
});

bulkWithdrawItemSearch.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === 'Tab') {
    if (e.key === 'Tab') e.preventDefault();
    if (bulkWithdrawCombobox.selectHighlighted()) return;
    setTimeout(() => {
      if (document.activeElement === bulkWithdrawQtyInput) return;
    }, 150);
  }
});

bulkWithdrawQtyInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addToListWithdrawBtn.click();
  }
});

addToListWithdrawBtn.addEventListener('click', () => {
  const code = bulkWithdrawItemSearch.value.trim();
  const newQtyString = bulkWithdrawQtyInput.value.trim();

  if (!code || !newQtyString) {
    bulkWithdrawErrorMessage.textContent = 'Material Code and Quantity are required.';
    return;
  }

  const row = state.rowsByCode.get(code);
  if (!row) {
    bulkWithdrawErrorMessage.textContent = `Item code ${code} not found.`;
    return;
  }

  const maxWithdrawable = getWithdrawableStock(row);
  const newQtyTotal = calculateSingleStockingQtyTotal(formatStockingQty(newQtyString));

  if (newQtyTotal <= 0) {
    bulkWithdrawErrorMessage.textContent = 'Please enter a valid quantity greater than 0.';
    return;
  }

  const existingIndex = state.pendingBulkWithdrawals.findIndex(item => item.code === code);

  let combinedQtyString = newQtyString;
  let combinedTotal = newQtyTotal;

  if (existingIndex > -1) {
    const existingItem = state.pendingBulkWithdrawals[existingIndex];
    combinedQtyString = existingItem.qty + '+' + newQtyString;
    combinedTotal = calculateSingleStockingQtyTotal(formatStockingQty(combinedQtyString));
  }

  if (combinedTotal > maxWithdrawable) {
    bulkWithdrawErrorMessage.innerHTML = `Cannot withdraw <strong>${combinedTotal.toLocaleString()}</strong>.<br>Only <strong>${maxWithdrawable.toLocaleString()}</strong> is available for ${escapeHtml(code)}.`;
    return;
  }

  bulkWithdrawErrorMessage.innerHTML = '';

  if (existingIndex > -1) {
    state.pendingBulkWithdrawals[existingIndex].qty = combinedQtyString;
  } else {
    state.pendingBulkWithdrawals.push({ code: code, qty: newQtyString });
  }

  renderWithdrawList();

  bulkWithdrawItemSearch.value = '';
  bulkWithdrawQtyInput.value = '';
  bulkWithdrawItemSearch.focus();
});

cancelBulkWithdraw.addEventListener('click', () => {
  bulkWithdrawModal.style.display = 'none';
});

confirmBulkWithdrawButton.addEventListener('click', async () => {
  if (confirmBulkWithdrawButton.disabled) return;
  if (state.pendingBulkWithdrawals.length === 0) {
    bulkWithdrawErrorMessage.textContent = 'Please enter a quantity for at least one item.';
    return;
  }

  setButtonLoading(confirmBulkWithdrawButton, true);
  try {
    if (!(await customConfirm(`You are about to withdraw from ${state.pendingBulkWithdrawals.length} item(s). Continue?`))) return;

    let successfulWithdrawals = 0;
    let transactionDetails = [];
    const changedCodes = [];

    state.pendingBulkWithdrawals.forEach(item => {
      const totalWithdrawQty = calculateSingleStockingQtyTotal(formatStockingQty(item.qty));
      const result = performWithdrawal(item.code, totalWithdrawQty);
      if (result.success) {
        successfulWithdrawals++;
        transactionDetails.push(`${item.code} (-${totalWithdrawQty.toLocaleString()})`);
        changedCodes.push(item.code);
      } else {
        console.error(result.message);
      }
    });

    if (successfulWithdrawals > 0) {
      await applyFiltersAndSort();
      const newLog = logTransaction('BULK WITHDRAW', `${successfulWithdrawals} items`, transactionDetails.join(', '), null, true);
      prependHistoryLog(newLog);
      saveDataToAPI(['inventoryData', 'transactionHistory'], { changedCodes }, [newLog]);
      showToast(`Successfully withdrew from ${successfulWithdrawals} item(s).`, 'success');
      bulkWithdrawModal.style.display = 'none';
    } else {
      showToast('No withdrawals could be processed. Stock may have changed.', 'error');
    }
  } finally {
    setButtonLoading(confirmBulkWithdrawButton, false);
  }
});

// ---------------------------------------------------------------------------
// Event Listeners — Variance Tracker
// ---------------------------------------------------------------------------
openVarianceModalButton.addEventListener('click', () => {
  checkAccess(() => {
    varianceModal.style.display = 'block';
    varianceFileInput.value = '';
    varianceTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #999;">Upload a file to see results.</td></tr>';
    varianceErrorMessage.textContent = '';
  });
});

closeVarianceModalButton.addEventListener('click', () => {
  varianceModal.style.display = 'none';
});

compareVarianceButton.addEventListener('click', async () => {
  const file = varianceFileInput.files[0];
  if (!file) {
    varianceErrorMessage.textContent = 'Please select an Excel file.';
    return;
  }
  varianceErrorMessage.textContent = 'Processing...';
  await loadXLSX();

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const invSheet = workbook.Sheets['Inventory_Backup'] || workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(invSheet);

      if (!jsonData.length || !jsonData[0].hasOwnProperty('MATERIAL_CODE') || !jsonData[0].hasOwnProperty('STOCKING_QTY')) {
        varianceErrorMessage.textContent = 'Invalid Backup file format. Ensure you are uploading a system backup.';
        return;
      }

      const excelInventory = {};
      jsonData.forEach(item => {
        if (item.MATERIAL_CODE) {
          const code = String(item.MATERIAL_CODE).trim();
          const stockingQtyString = String(item.STOCKING_QTY || '');
          const stockVal = calculateSingleStockingQtyTotal(formatStockingQty(stockingQtyString));
          if (!isNaN(stockVal)) {
            excelInventory[code] = stockVal;
          }
        }
      });

      const results = compareVariance(file, excelInventory);

      varianceTableBody.innerHTML = '';
      if (results.length === 0) {
        varianceTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No data found or no variance.</td></tr>';
      } else {
        results.forEach(res => {
          const tr = document.createElement('tr');
          let varianceColor = 'black';
          let varianceText = res.variance.toLocaleString();
          if (res.variance > 0) {
            varianceColor = 'green';
            varianceText = `+${varianceText}`;
          } else if (res.variance < 0) {
            varianceColor = 'red';
          }
          tr.innerHTML = `
            <td>${escapeHtml(res.code)}</td>
            <td>${res.sysQty.toLocaleString()}</td>
            <td>${res.excelQty.toLocaleString()}</td>
            <td style="color: ${varianceColor}; font-weight: bold;">${varianceText}</td>
          `;
          varianceTableBody.appendChild(tr);
        });
      }
      varianceErrorMessage.textContent = '';
    } catch (err) {
      console.error(err);
      varianceErrorMessage.textContent = 'Error processing file. Please ensure it is a valid Excel file.';
    }
  };
  reader.readAsArrayBuffer(file);
});

// ---------------------------------------------------------------------------
// Event Listeners — Misc Checkboxes & Preferences
// ---------------------------------------------------------------------------
if (showBuildingRackCheckbox) {
  const savedShowBuildingRack = localStorage.getItem('showBuildingRack');
  showBuildingRackCheckbox.checked = savedShowBuildingRack === null ? true : savedShowBuildingRack === 'true';
  showBuildingRackCheckbox.addEventListener('change', () => {
    localStorage.setItem('showBuildingRack', showBuildingRackCheckbox.checked);
    applyBuildingRackVisibility();
  });
}

if (includeBldgRackPrintCheckbox) {
  const savedIncludeBldgRackPrint = localStorage.getItem('includeBldgRackPrint');
  includeBldgRackPrintCheckbox.checked = savedIncludeBldgRackPrint === 'true';
  includeBldgRackPrintCheckbox.addEventListener('change', () => {
    localStorage.setItem('includeBldgRackPrint', includeBldgRackPrintCheckbox.checked);
  });
}

if (shortenBreakdownCheckbox) {
  const savedShortenBreakdown = localStorage.getItem('shortenBreakdown');
  shortenBreakdownCheckbox.checked = savedShortenBreakdown === 'true';
  shortenBreakdownCheckbox.addEventListener('change', () => {
    localStorage.setItem('shortenBreakdown', shortenBreakdownCheckbox.checked);
    refreshAllBreakdownDisplays();
  });
}

if (simplifyBreakdownCheckbox) {
  const savedSimplifyBreakdown = localStorage.getItem('simplifyBreakdown');
  simplifyBreakdownCheckbox.checked = savedSimplifyBreakdown === 'true';
  simplifyBreakdownCheckbox.addEventListener('change', () => {
    localStorage.setItem('simplifyBreakdown', simplifyBreakdownCheckbox.checked);
    refreshAllBreakdownDisplays();
  });
}

userNameInput.addEventListener('input', () => {
  localStorage.setItem('userName', userNameInput.value);
});

// ---------------------------------------------------------------------------
// DOMContentLoaded — Initialize the application
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initCustomSelects();
  updateDateTimeAndShift();
  loadDataFromAPI();

  const savedUserName = localStorage.getItem('userName');
  if (savedUserName) userNameInput.value = savedUserName;
});
