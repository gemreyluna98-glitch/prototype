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
// successful save — not just on full loads/unlocks — so an edit saved
// successfully to the database doesn't still look "missing" if the device
// is later locked/refreshed before its next full load.
//
// Merges only the exact payload that was just confirmed sent, rather than
// snapshotting the current live DOM state. The DOM can already reflect
// newer edits that are still queued (not yet sent/confirmed) at the moment
// an earlier entry succeeds — snapshotting the full live state at that
// point would mark those not-yet-saved edits as "synced" in the offline
// cache, which would be wrong if a later queued save then failed.
function mergeConfirmedPayloadIntoCache(payload) {
  const cached = readSnapshotCache();
  const base = cached ? cached.data : { inventoryData: [], transactionHistory: [], palletCapacities: {} };
  let inventoryData = Array.isArray(base.inventoryData) ? [...base.inventoryData] : [];
  let transactionHistory = Array.isArray(base.transactionHistory) ? [...base.transactionHistory] : [];
  let palletCapacities =
    base.palletCapacities && typeof base.palletCapacities === 'object' ? { ...base.palletCapacities } : {};

  if (payload.inventoryData) {
    inventoryData = payload.inventoryData;
  } else {
    if (payload.changedItems && payload.changedItems.length) {
      const byCode = new Map(inventoryData.map(item => [item.code, item]));
      payload.changedItems.forEach(item => byCode.set(item.code, item));
      inventoryData = Array.from(byCode.values());
    }
    if (payload.deletedCodes && payload.deletedCodes.length) {
      const deletedSet = new Set(payload.deletedCodes);
      inventoryData = inventoryData.filter(item => !deletedSet.has(item.code));
    }
  }

  if (payload.transactionHistory) {
    transactionHistory = payload.transactionHistory;
  } else if (payload.newHistoryEntries && payload.newHistoryEntries.length) {
    transactionHistory = [...payload.newHistoryEntries, ...transactionHistory];
  }

  if (payload.palletCapacities) {
    palletCapacities = payload.palletCapacities;
  } else if (payload.changedPalletCapacity) {
    palletCapacities = {
      ...palletCapacities,
      [payload.changedPalletCapacity.code]: payload.changedPalletCapacity.capacity,
    };
  }

  const syncedAt = writeSnapshotCache({ inventoryData, transactionHistory, palletCapacities });
  updateLastSyncedLabel(syncedAt);
}

// --- Save Queue ---
// Saves are enqueued (payload built immediately, from current state) rather
// than fired off directly, and processed one at a time so two rapid edits
// can never arrive at the server out of order and let a stale write clobber
// a newer one. On failure, the whole queue pauses (failed + any still-
// waiting items are kept, not discarded) and the visible table is reverted
// to the server's truth so the screen never implies a save succeeded when
// it didn't; the user must click Retry, which replays the queue from where
// it stopped using the same saved payloads — no need to redo the edit.
const saveQueue = [];
let queueProcessing = false;

function buildSavePayload(dataToSave, invOptions, newHistoryEntries, palletCapOptions) {
  const payload = {};

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
  return payload;
}

function showSaveQueueError(message) {
  const banner = document.getElementById('saveQueueErrorBanner');
  const msgEl = document.getElementById('saveQueueErrorMessage');
  if (msgEl) msgEl.textContent = message;
  if (banner) banner.style.display = 'flex';
}

function hideSaveQueueError() {
  const banner = document.getElementById('saveQueueErrorBanner');
  if (banner) banner.style.display = 'none';
}

async function sendSavePayload(payload) {
  const currentToken = getStoredToken();
  if (!currentToken) {
    const err = new Error('Unlock the system before saving.');
    err.status = 401;
    throw err;
  }
  const response = await fetch('/api/save-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const details = errorData.error || errorData.details || response.statusText;
    const err = new Error(details);
    err.status = response.status;
    err.reason = errorData.reason;
    throw err;
  }
}

async function processSaveQueue() {
  if (queueProcessing || state.saveQueuePaused) return;
  if (saveQueue.length === 0) {
    // Fully drained — refresh from the server so the display reflects the
    // canonical saved state.
    await loadDataFromAPI();
    return;
  }

  queueProcessing = true;
  const entry = saveQueue[0];
  try {
    await sendSavePayload(entry.payload);
    saveQueue.shift();
    showSaveIndicator(false);
    document.getElementById('errorMessage').textContent = '';
    mergeConfirmedPayloadIntoCache(entry.payload);
    entry.resolve({ success: true });
    queueProcessing = false;
    await processSaveQueue(); // continue with whatever's next
  } catch (error) {
    queueProcessing = false;
    console.error('Save queue paused — error saving:', error);
    state.saveQueuePaused = true;

    let message;
    if (error.status === 401) {
      message = handleSessionExpired(error.reason);
    } else {
      message = error.message || 'Failed to save.';
    }
    showSaveQueueError(`Save Error: ${message} — I-retry para ipagpatuloy ang ${saveQueue.length} pending na pagbabago.`);
    document.getElementById('errorMessage').textContent = `Save Error: ${message}`;

    // Let this entry's original caller know it did NOT actually save — it
    // stays in the queue (not shifted off) so Retry can still resend it.
    entry.resolve({ success: false, error: message });

    // Revert the visible table to the server's truth — any still-queued
    // (unsent) edits stay out of view until a successful retry, so the
    // screen never shows a change as if it were saved when it wasn't.
    await loadDataFromAPI();
  }
}

export async function retrySaveQueue() {
  if (saveQueue.length === 0) {
    state.saveQueuePaused = false;
    hideSaveQueueError();
    return;
  }
  if (state.isLocked) {
    // The pause was (at least in part) due to a lost/expired session — ask
    // for the password again before re-attempting, instead of immediately
    // re-failing with the same missing-token error.
    const { showPasswordModal } = await import('./auth.js');
    showPasswordModal(async () => {
      state.saveQueuePaused = false;
      hideSaveQueueError();
      await processSaveQueue();
    });
    return;
  }
  state.saveQueuePaused = false;
  hideSaveQueueError();
  await processSaveQueue();
}

export function saveDataToAPI(dataToSave, invOptions = {}, newHistoryEntries = null, palletCapOptions = {}) {
  const payload = buildSavePayload(dataToSave, invOptions, newHistoryEntries, palletCapOptions);
  showSaveIndicator(true);
  return new Promise(resolve => {
    saveQueue.push({ payload, resolve });
    processSaveQueue();
  });
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
  return saveDataToAPI(['inventoryData'], { changedCodes, deletedCodes });
}

export function saveHistoryData(newEntries = null) {
  return saveDataToAPI(['transactionHistory'], {}, newEntries);
}
