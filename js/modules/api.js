// =============================================================================
// Cohin Inventory System — API Layer
// Handles all communication with Cloudflare Pages Functions (D1 database).
// =============================================================================

import { state, getStoredToken, clearStoredToken } from './state.js';
import { showSaveIndicator, updateLastSyncedLabel, showCacheModeBanner, hideCacheModeBanner } from './ui.js';

const SNAPSHOT_CACHE_KEY = 'cachedInventorySnapshot';
const SNAPSHOT_TIME_KEY = 'cachedInventorySnapshotTime';

function readSnapshotCache() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_CACHE_KEY);
    if (!raw) return null;
    return { data: JSON.parse(raw), timestamp: localStorage.getItem(SNAPSHOT_TIME_KEY) };
  } catch {
    return null;
  }
}

function writeSnapshotCache(dbData) {
  try {
    const snapshot = {
      inventoryData: dbData.inventoryData || [],
      transactionHistory: dbData.transactionHistory || [],
      palletCapacities: dbData.palletCapacities || {},
    };
    const timestamp = new Date().toISOString();
    localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
    localStorage.setItem(SNAPSHOT_TIME_KEY, timestamp);
    return timestamp;
  } catch {
    // Storage full/unavailable — caching is a nice-to-have, not critical.
    return null;
  }
}

// Populates the table/history/pallet-capacity state from a snapshot object,
// shared by both the live fetch (loadDataFromAPI) and the cached/view-only
// fallback (renderCachedSnapshot) so they stay in sync.
async function renderSnapshot(snapshot) {
  if (snapshot.inventoryData) {
    const { renderRow } = await import('./inventory.js');
    document.getElementById('inventoryTableBody').innerHTML = '';
    state.originalRowsOrder = [];
    state.rowsByCode = new Map();
    snapshot.inventoryData.forEach(item => {
      item.remarks =
        typeof item.remarks === 'string' ? JSON.parse(item.remarks || '[]') : item.remarks || [];
      item.locations =
        typeof item.locations === 'string' ? JSON.parse(item.locations || '[]') : item.locations || [];
      renderRow(item, false);
    });
  }
  if (snapshot.transactionHistory) {
    state.transactionHistory = snapshot.transactionHistory;
  }
  if (snapshot.palletCapacities) {
    state.palletCapacities = snapshot.palletCapacities;
  }
  const { applyFiltersAndSort } = await import('./inventory.js');
  await applyFiltersAndSort();
}

// Offline fallback only — used when the live public fetch itself fails
// (e.g. no connectivity), so the table still shows the last synced data
// instead of going empty.
async function renderCachedSnapshot() {
  const cached = readSnapshotCache();
  const overlay = document.getElementById('pageLoadOverlay');
  if (!cached) {
    if (overlay) overlay.classList.add('is-hidden');
    return;
  }
  try {
    await renderSnapshot(cached.data);
    updateLastSyncedLabel(cached.timestamp);
    showCacheModeBanner();
  } finally {
    if (overlay) overlay.classList.add('is-hidden');
  }
}

// If the backend rejects a token (expired/invalid), clear it and force the
// lock screen back up so the user re-enters their password rather than
// silently failing on every request from then on.
function handleSessionExpired(reason) {
  clearStoredToken();
  state.isLocked = true;
  import('./auth.js').then(({ updateLockUI }) => updateLockUI());
  showCacheModeBanner();
  return reason === 'session_replaced'
    ? 'You were logged out because someone logged in from another device.'
    : 'Your session expired. Please unlock again.';
}

// Keeps the view-only fallback cache reasonably fresh after a confirmed
// successful save — not just on full loads/unlocks — using the current
// in-memory state (which already reflects the save that just succeeded).
// Without this, an edit saved successfully to the database could still look
// "missing" if the device is later locked/refreshed before its next full load.
function refreshSnapshotCacheFromState() {
  const inventoryData = state.originalRowsOrder.map(row => ({
    code: row.dataset.code,
    stockingQty: row.dataset.stockingQty,
    remarks: row.dataset.remarks,
    locations: row.dataset.locations,
  }));
  const syncedAt = writeSnapshotCache({
    inventoryData,
    transactionHistory: state.transactionHistory,
    palletCapacities: state.palletCapacities,
  });
  updateLastSyncedLabel(syncedAt);
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
    refreshSnapshotCacheFromState();
  } catch (error) {
    console.error('Database save error:', error);
    document.getElementById('errorMessage').textContent = `Save Error: ${error.message}`;
  } finally {
    showSaveIndicator(false);
  }
}

// Viewing the inventory is public (no login required) — only editing is
// gated behind a session token. This always tries a live fetch first; the
// local snapshot cache is only a fallback for when that fetch itself fails
// (e.g. offline), not a substitute for it.
export async function loadDataFromAPI() {
  const currentToken = getStoredToken();

  try {
    const response = await fetch('/api/get-data', {
      headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const details = errorData.error || errorData.details || response.statusText;
      throw new Error(`Failed to fetch from database. Details: ${details}`);
    }

    const dbData = await response.json();
    await renderSnapshot(dbData);
    const syncedAt = writeSnapshotCache(dbData);
    updateLastSyncedLabel(syncedAt);
    // The banner reflects edit permission (isLocked), not data freshness —
    // viewing is always live/public now, only editing needs a login.
    if (state.isLocked) {
      showCacheModeBanner();
    } else {
      hideCacheModeBanner();
    }
    document.getElementById('errorMessage').textContent = '';
  } catch (error) {
    console.error('Database load error — falling back to last cached snapshot:', error);
    document.getElementById('errorMessage').textContent = `Load Error: ${error.message}. Showing last synced data.`;
    await renderCachedSnapshot();
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
