// =============================================================================
// Cohin Inventory System — Modal Management
// Handles all modal open/close logic and modal-specific UI updates.
// =============================================================================

import { state } from './state.js';
import {
  formatStockingQty,
  getBreakdownParts,
  renderBreakdownCellHtml,
  applyBuildingRackVisibility,
  getColorClassForRemark,
  escapeHtml,
} from './inventory.js';

// --- Edit Breakdown Modal ---

export function openEditBreakdownModal(row) {
  state.currentEditingRow = row;
  document.getElementById('editBreakdownInput').value = formatStockingQty(row.dataset.stockingQty);
  const remarks = JSON.parse(row.dataset.remarks || '[]');
  const locations = JSON.parse(row.dataset.locations || '[]');
  const parts = getBreakdownParts(formatStockingQty(row.dataset.stockingQty));
  state.lastEditBreakdownParts = parts;
  state.markedForDeletionIndices = new Set();
  generateRemarksInputs(parts.length, remarks, locations);
  document.getElementById('editBreakdownItemCode').textContent = row.dataset.code;
  document.getElementById('editBreakdownModal').classList.remove('stocking-qty-floating');
  document.querySelectorAll('.field-flash-highlight').forEach(el => el.classList.remove('field-flash-highlight'));
  updateEditBreakdownPreview();
  document.getElementById('editBreakdownModal').style.display = 'block';
}

const standardRemarksList = [
  'approved',
  'approved temp specs',
  'approved new declaration',
  'old',
  'first out',
  'hold',
  'hold temp specs',
  'hold new declaration',
];

export function generateRemarksInputs(numParts, remarks, locations) {
  const dynamicRemarksContainer = document.getElementById('dynamicRemarksContainer');
  dynamicRemarksContainer.innerHTML = '';
  locations = locations || [];

  for (let i = 0; i < numParts; i++) {
    const inputGroup = document.createElement('div');
    inputGroup.className = 'item-input';
    const label = document.createElement('label');
    label.textContent = `Remarks for Part ${i + 1}:`;

    const wrapper = document.createElement('div');
    wrapper.className = 'autocomplete-wrapper';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = remarks[i] || '';
    input.classList.add('remark-part-input');

    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';

    wrapper.append(input, dropdown);
    inputGroup.append(label, wrapper);
    dynamicRemarksContainer.appendChild(inputGroup);

    const locGroup = document.createElement('div');
    locGroup.className = 'item-input building-rack-group';
    const locLabelRow = document.createElement('div');
    locLabelRow.className = 'location-label-row';
    const locLabel = document.createElement('label');
    locLabel.innerHTML = `<i class="fas fa-warehouse"></i> Building/Rack for Part ${i + 1}:`;
    const markDeleteBtn = document.createElement('button');
    markDeleteBtn.type = 'button';
    markDeleteBtn.className = 'mark-delete-btn';
    markDeleteBtn.title =
      "Mark this part as being deleted — click BEFORE you remove its number from the Stocking Qty text above, so the app doesn't mistake it for an edited value elsewhere in the breakdown.";
    markDeleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
    markDeleteBtn.dataset.partIndex = i;
    if (state.markedForDeletionIndices.has(i)) markDeleteBtn.classList.add('active');
    markDeleteBtn.addEventListener('click', () => {
      if (state.markedForDeletionIndices.has(i)) {
        state.markedForDeletionIndices.delete(i);
        markDeleteBtn.classList.remove('active');
      } else {
        state.markedForDeletionIndices.add(i);
        markDeleteBtn.classList.add('active');
      }
    });
    locLabelRow.append(locLabel, markDeleteBtn);
    const locInput = document.createElement('input');
    locInput.type = 'text';
    locInput.placeholder = 'e.g. Bldg B - Rack 14';
    locInput.value = locations[i] || '';
    locInput.classList.add('location-part-input');
    locGroup.append(locLabelRow, locInput);
    dynamicRemarksContainer.appendChild(locGroup);

    let activeIndex = -1;

    const updateDropdown = () => {
      const val = input.value;
      const trimmedVal = val.trimStart();
      if (!trimmedVal) {
        dropdown.style.display = 'none';
        return;
      }
      const valWords = trimmedVal.toLowerCase().split(/\s+/);
      let maxMatchCount = 0;
      const matchGroups = [];
      standardRemarksList.forEach(stdRem => {
        const stdWords = stdRem.split(/\s+/);
        let matchCount = 0;
        for (let j = 0; j < valWords.length; j++) {
          if (j >= stdWords.length) break;
          if (stdWords[j] === valWords[j]) matchCount++;
          else if (stdWords[j].startsWith(valWords[j])) {
            matchCount++;
            break;
          } else break;
        }
        if (matchCount > 0) {
          maxMatchCount = Math.max(maxMatchCount, matchCount);
          if (!matchGroups[matchCount]) matchGroups[matchCount] = [];
          matchGroups[matchCount].push(stdRem);
        }
      });
      dropdown.innerHTML = '';
      if (maxMatchCount === 0) {
        dropdown.style.display = 'none';
        return;
      }
      const regex = new RegExp(`^(\\s*(?:\\S+\\s+){${maxMatchCount - 1}}\\S+)(.*)$`, 'i');
      const matchResult = val.match(regex);
      let remainder = matchResult ? matchResult[2] : '';
      const matches = matchGroups[maxMatchCount];
      matches.forEach((match, index) => {
        const opt = document.createElement('div');
        opt.className = 'autocomplete-option';
        opt.textContent = match + remainder;
        if (index === 0) opt.classList.add('active');
        opt.addEventListener('mousedown', e => {
          e.preventDefault();
          input.value = opt.textContent;
          dropdown.style.display = 'none';
          updateEditBreakdownPreview();
        });
        dropdown.appendChild(opt);
      });
      activeIndex = 0;
      dropdown.style.display = 'block';
    };

    input.addEventListener('input', updateDropdown);
    input.addEventListener('focus', () => {
      if (input.value.trim() !== '') updateDropdown();
    });
    input.addEventListener('blur', () => {
      setTimeout(() => (dropdown.style.display = 'none'), 100);
    });
    input.addEventListener('keydown', e => {
      const options = dropdown.querySelectorAll('.autocomplete-option');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (options.length > 0) {
          if (activeIndex < options.length - 1) activeIndex++;
          options.forEach((opt, idx) => opt.classList.toggle('active', idx === activeIndex));
          options[activeIndex].scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (options.length > 0) {
          if (activeIndex > 0) activeIndex--;
          options.forEach((opt, idx) => opt.classList.toggle('active', idx === activeIndex));
          options[activeIndex].scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter') {
        if (dropdown.style.display === 'block' && options.length > 0 && activeIndex > -1) {
          e.preventDefault();
          e.stopPropagation();
          input.value = options[activeIndex].textContent;
          dropdown.style.display = 'none';
          updateEditBreakdownPreview();
        }
      } else if (e.key === 'Tab') {
        dropdown.style.display = 'none';
      }
    });
  }
  applyBuildingRackVisibility();
}

export function updateEditBreakdownPreview() {
  const editBreakdownPreview = document.getElementById('editBreakdownPreview');
  if (!editBreakdownPreview) return;
  const rawValue = document.getElementById('editBreakdownInput').value;
  const remarks = Array.from(document.querySelectorAll('.remark-part-input')).map(input => input.value);
  const locations = Array.from(document.querySelectorAll('.location-part-input')).map(input => input.value);
  const formatted = formatStockingQty(rawValue);
  const parts = getBreakdownParts(formatted);
  if (!parts.length || (parts.length === 1 && !parts[0])) {
    editBreakdownPreview.innerHTML = '<span style="color: var(--ink-soft);">No stock recorded</span>';
    return;
  }
  editBreakdownPreview.innerHTML = parts
    .map((part, index) => {
      const remark = remarks[index] || '';
      const colorClass = getColorClassForRemark(remark);
      const loc = (locations[index] || '').trim();
      const locTag = loc ? `<span class="location-tag">${escapeHtml(loc)}</span>` : '';
      return `<span class="${colorClass} preview-part" data-index="${index}" title="Click to focus remarks for this part">${escapeHtml(part.trim())}</span>${locTag}`;
    })
    .join(' <span class="preview-sep">|</span> ');
}
