// =============================================================================
// Cohin Inventory System — API Layer
// Handles all communication with Cloudflare Pages Functions (D1 database).
// =============================================================================

import { state, getStoredToken, clearStoredToken } from './state.js';
import { showSaveIndicator } from './ui.js';

// If the backend rejects a token (expired/invalid), clear it and force the
// lock screen back up so the user re-enters their password rather than
// silently failing on every request from then on.
function handleSessionExpired(reason) {
  clearStoredToken();
  state.isLocked = true;
  import('./auth.js').then(({ updateLockUI }) => updateLockUI());
  return reason === 'session_replaced'
    ? 'You were logged out because someone logged in from another device.'
    : 'Your session expired. Please unlock again.';
}

export async function saveDataToAPI(dataToSave, invOptions = {}, newHistoryEntries = null, palletCapOptions = {}) {
  showSaveIndicator(true);
  try {
    const payload = {};
    const currentToken = getStoredToken();
    if (!currentToken) {
      document.getElementById('errorMessage').textContent = 'Save Error: Unlock the system before saving.';
      return;
    }

    if (dataToSave.includes('inventoryData')) {
      const { changedCodes, deletedCodes } = invOptions;
      if (changedCodes || deletedCodes) {
        if (changedCodes && changedCodes.length) {
          payload.changedItems = changedCodes
            .map(code => state.rowsByCode.get(code))
            .filter(Boolean)
            .map(row => ({
              code: row.dataset.code,
              stockingQty: row.dataset.stockingQty,
              remarks: row.dataset.remarks,
              locations: row.dataset.locations,
            }));
        }
        if (deletedCodes && deletedCodes.length) {
          payload.deletedCodes = deletedCodes;
        }
      } else {
        payload.inventoryData = state.originalRowsOrder.map(row => ({
          code: row.dataset.code,
          stockingQty: row.dataset.stockingQty,
          remarks: row.dataset.remarks,
          locations: row.dataset.locations,
        }));
      }
    }
    if (dataToSave.includes('transactionHistory')) {
      if (newHistoryEntries) {
        payload.newHistoryEntries = newHistoryEntries;
      } else {
        payload.transactionHistory = state.transactionHistory;
      }
    }
    if (dataToSave.includes('palletCapacities')) {
      const { changedCode } = palletCapOptions;
      if (changedCode !== undefined) {
        payload.changedPalletCapacity = { code: changedCode, capacity: state.palletCapacities[changedCode] };
      } else {
        payload.palletCapacities = state.palletCapacities;
      }
    }

    const response = await fetch('/api/save-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        document.getElementById('errorMessage').textContent = `Save Error: ${handleSessionExpired(errorData.reason)}`;
      } else {
        const details = errorData.error || errorData.details || response.statusText;
        throw new Error(`Failed to save to database. Details: ${details}`);
      }
      return;
    }
    document.getElementById('errorMessage').textContent = '';
  } catch (error) {
    console.error('Database save error:', error);
    document.getElementById('errorMessage').textContent = `Save Error: ${error.message}`;
  } finally {
    showSaveIndicator(false);
  }
}

export async function loadDataFromAPI() {
  const currentToken = getStoredToken();
  if (!currentToken) {
    const overlay = document.getElementById('pageLoadOverlay');
    if (overlay) overlay.classList.add('is-hidden');
    return;
  }

  try {
    const response = await fetch('/api/get-data', {
      headers: { Authorization: `Bearer ${currentToken}` },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        document.getElementById('errorMessage').textContent = `Load Error: ${handleSessionExpired(errorData.reason)}`;
      } else {
        const details = errorData.error || errorData.details || response.statusText;
        throw new Error(`Failed to fetch from database. Details: ${details}`);
      }
      return;
    }

    const dbData = await response.json();

    if (dbData.inventoryData) {
      const { renderRow } = await import('./inventory.js');
      document.getElementById('inventoryTableBody').innerHTML = '';
      state.originalRowsOrder = [];
      state.rowsByCode = new Map();
      dbData.inventoryData.forEach(item => {
        item.remarks =
          typeof item.remarks === 'string' ? JSON.parse(item.remarks || '[]') : item.remarks || [];
        item.locations =
          typeof item.locations === 'string' ? JSON.parse(item.locations || '[]') : item.locations || [];
        renderRow(item, false);
      });
    }
    if (dbData.transactionHistory) {
      state.transactionHistory = dbData.transactionHistory;
    }
    if (dbData.palletCapacities) {
      state.palletCapacities = dbData.palletCapacities;
    }
    const { applyFiltersAndSort } = await import('./inventory.js');
    await applyFiltersAndSort();
    document.getElementById('errorMessage').textContent = '';
  } catch (error) {
    console.error('Database load error:', error);
    document.getElementById('errorMessage').textContent = `Load Error: ${error.message}`;
  } finally {
    const overlay = document.getElementById('pageLoadOverlay');
    if (overlay) overlay.classList.add('is-hidden');
  }
}

export function saveInventoryData(changedCodes = null, deletedCodes = null) {
  saveDataToAPI(['inventoryData'], { changedCodes, deletedCodes });
}

export function saveHistoryData(newEntries = null) {
  saveDataToAPI(['transactionHistory'], {}, newEntries);
}
