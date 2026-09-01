// ---------------------------------------------------------------------------
// Modal Stack
// ---------------------------------------------------------------------------
// Centralized open/close tracking for all modals so Escape always closes
// whichever modal is actually on top, regardless of what else happens to be
// open underneath it. Replaces the old hardcoded `escapeCancelableModals`
// array, which only knew about 3 of the app's 10+ modals and could close the
// wrong modal when one was opened on top of another (e.g. the Detailed
// Report modal opened from within the Edit Item modal).
//
// Usage: call openModal(id) / closeModal(id) instead of setting
// `element.style.display` directly anywhere a modal is shown or hidden.

export const openModalStack = [];

// Maps modalId -> the id of the button that should be "clicked" to close it
// (so closing always goes through the same Cancel/Close logic a real click
// would, instead of just hiding the element and skipping any cleanup that
// button's own click handler does).
const modalCancelButtons = {
  importDataModal: 'cancelImportButton',
  editBreakdownModal: 'cancelBreakdownButton',
  itemDetailedReportModal: 'closeItemReportButton',
  fileOpsModal: 'cancelFileOps',
  clearChoiceModal: 'cancelClearChoice',
  bulkClearQtyModal: 'cancelBulkClear',
  bulkWithdrawModal: 'cancelBulkWithdraw',
  bulkDeliveriesModal: 'cancelBulkDelivery',
  varianceModal: 'closeVarianceModalButton',
  // glassDialogModal intentionally omitted: it manages its own dedicated
  // Escape listener already (see ui.js showGlassDialog), so this module
  // never drives its close button directly — it's still pushed onto the
  // stack below so other modals correctly see it as "on top" while open.
  // passwordModal intentionally omitted: it must not be Escape-closable.
};

export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.style.display = 'block';
  // Avoid duplicate stack entries if openModal is called twice for the
  // same modal without an intervening close.
  const existingIndex = openModalStack.indexOf(modalId);
  if (existingIndex !== -1) openModalStack.splice(existingIndex, 1);
  openModalStack.push(modalId);
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
  const index = openModalStack.indexOf(modalId);
  if (index !== -1) openModalStack.splice(index, 1);
}

// Empties the stack without touching the DOM — for use alongside code paths
// (like lockSystem()) that already force-hide every `.modal` element
// directly and just need the stack's bookkeeping reset to match.
export function clearModalStack() {
  openModalStack.length = 0;
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!openModalStack.length) return;

  const topModalId = openModalStack[openModalStack.length - 1];

  if (topModalId === 'glassDialogModal') {
    // Let glassDialog's own listener handle this keystroke; do not also
    // pop/close it here.
    return;
  }

  if (topModalId === 'passwordModal') {
    // Security modal — must not be closable via Escape.
    return;
  }

  const cancelBtnId = modalCancelButtons[topModalId];
  if (cancelBtnId) {
    document.getElementById(cancelBtnId)?.click();
  } else {
    // No known cancel button (shouldn't normally happen) — fall back to a
    // plain close so Escape still does *something* sensible.
    closeModal(topModalId);
  }
});
