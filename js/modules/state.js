// =============================================================================
// Cohin Inventory System — Centralized App State
// Single source of truth for all mutable application state.
// =============================================================================

export const state = {
  loadedWorkbook: null,
  originalRowsOrder: [],
  transactionHistory: [],
  currentEditingRow: null,
  // Raw dataset snapshot captured when the Edit Breakdown modal opened, so
  // Save can detect whether another action (Bulk Withdraw/Delivery/Clear on
  // the same row, done in a modal opened on top) changed the row in the
  // meantime instead of blindly overwriting it.
  editBreakdownOpenSnapshot: null,
  pendingAction: null,
  lastEditBreakdownParts: [],
  markedForDeletionIndices: new Set(),
  rowsByCode: new Map(),
  // Per-item manual override of the ★ moved-mark, set by clicking a row's
  // star while Mark Movement is active — client-side only, never
  // saved/persisted, cleared on page reload. code -> true (force-marked) or
  // false (force-unmarked); a code absent from this map just uses whatever
  // the automatic date-range detection says. This lets a manual click win
  // either way — including un-marking an item the date range auto-detected
  // — rather than only ever adding on top of it.
  movementOverrides: new Map(),

  isLocked: true,
  inactivityTimer: null,

  pendingBulkDeliveries: [],
  pendingBulkWithdrawals: [],
  palletCapacities: {},

  historyFilteredCache: [],
  historyRenderedCount: 0,
  historyCurrentSearchTerm: '',

  activeSaveCount: 0,
  saveQueuePaused: false,
};

export function getStoredToken() {
  const token = localStorage.getItem('sessionToken');
  return token && token.trim() ? token : null;
}

export function clearStoredToken() {
  localStorage.removeItem('sessionToken');
}
