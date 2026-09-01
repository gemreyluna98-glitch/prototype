// =============================================================================
// Cohin Inventory System — Centralized App State
// Single source of truth for all mutable application state.
// =============================================================================

export const state = {
  loadedWorkbook: null,
  originalRowsOrder: [],
  transactionHistory: [],
  currentEditingRow: null,
  pendingAction: null,
  lastEditBreakdownParts: [],
  markedForDeletionIndices: new Set(),
  rowsByCode: new Map(),

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
