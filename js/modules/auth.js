// =============================================================================
// Cohin Inventory System — Authentication & Lock System
// =============================================================================

import { state, clearStoredToken, getStoredToken } from './state.js';
import { loadDataFromAPI } from './api.js';
import { customConfirm, showToast, showCacheModeBanner } from './ui.js';

const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const SESSION_CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds
let sessionCheckTimer = null;

export function resetInactivityTimer() {
  clearTimeout(state.inactivityTimer);
  if (!state.isLocked) {
    state.inactivityTimer = setTimeout(lockSystem, INACTIVITY_TIMEOUT);
  }
}

export function lockSystem() {
  state.isLocked = true;
  updateLockUI();
  document.querySelectorAll('.modal').forEach(m => (m.style.display = 'none'));
  clearStoredToken();
  stopSessionCheck();
  showCacheModeBanner();
}

// --- Session Check Polling ---
// While unlocked, periodically ask the server "is my session still the
// active one?" so this device finds out promptly (not just on its next
// save/load) when a newer login elsewhere has taken over. Paused while the
// tab is hidden, and rechecked immediately when it becomes visible again.

export function startSessionCheck() {
  stopSessionCheck();
  if (state.isLocked) return;
  sessionCheckTimer = setInterval(runSessionCheck, SESSION_CHECK_INTERVAL_MS);
}

export function stopSessionCheck() {
  clearInterval(sessionCheckTimer);
  sessionCheckTimer = null;
}

async function runSessionCheck() {
  if (state.isLocked || document.hidden) return;
  const token = getStoredToken();
  if (!token) return;

  try {
    const response = await fetch('/api/session-check', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      const data = await response.json().catch(() => ({}));
      const replaced = data.reason === 'session_replaced';
      stopSessionCheck();
      clearStoredToken();
      state.isLocked = true;
      updateLockUI();
      document.querySelectorAll('.modal').forEach(m => (m.style.display = 'none'));
      showCacheModeBanner();
      showToast(
        replaced
          ? 'You were logged out because someone logged in from another device. The system is now locked.'
          : 'Your session expired. The system is now locked.',
        'error'
      );
    }
    // Network errors or other statuses are ignored — we only act on an
    // explicit, successful 401 response, never on a failed/offline check.
  } catch {
    // Offline or request failed — don't lock the user out over a flaky
    // connection; just try again on the next interval.
  }
}

export function showPasswordModal(callback) {
  state.pendingAction = callback;
  const modal = document.getElementById('passwordModal');
  modal.style.display = 'block';
  document.getElementById('systemPasswordInput').value = '';
  document.getElementById('passwordErrorMessage').textContent = '';
  document.getElementById('systemPasswordInput').focus();
}

export async function handleUnlock(force = false) {
  const pass = document.getElementById('systemPasswordInput').value;
  const errorMsg = document.getElementById('passwordErrorMessage');
  errorMsg.textContent = 'Verifying password...';
  errorMsg.style.color = 'blue';

  try {
    const response = await fetch('/api/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass, force }),
    });

    if (response.ok) {
      const data = await response.json();

      if (data.conflict) {
        const when = data.issuedAt
          ? new Date(data.issuedAt).toLocaleString('en-US', {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
            })
          : 'an unknown time';
        errorMsg.textContent = '';
        const proceed = await customConfirm(
          `Someone is already logged in on ${data.deviceLabel} since ${when}. Log in anyway and end that session?`,
          { allowEnterConfirm: true }
        );
        if (proceed) {
          await handleUnlock(true);
        } else {
          errorMsg.style.color = 'red';
          errorMsg.textContent = 'Login cancelled.';
        }
        return;
      }

      if (!data.token) {
        errorMsg.style.color = 'red';
        errorMsg.textContent = 'Server error: no session token received. Please try again.';
        return;
      }

      localStorage.setItem('sessionToken', data.token);
      state.isLocked = false;
      updateLockUI();
      resetInactivityTimer();
      startSessionCheck();
      document.getElementById('passwordModal').style.display = 'none';
      await loadDataFromAPI();
      if (state.pendingAction) {
        const action = state.pendingAction;
        state.pendingAction = null;
        action();
      }
    } else if (response.status === 429) {
      errorMsg.style.color = 'red';
      errorMsg.textContent = 'Too many attempts. Please wait about a minute before trying again.';
    } else if (response.status === 401) {
      errorMsg.style.color = 'red';
      errorMsg.textContent = 'Incorrect Password!';
      document.getElementById('systemPasswordInput').value = '';
      document.getElementById('systemPasswordInput').focus();
    } else {
      const errData = await response.json().catch(() => ({}));
      errorMsg.style.color = 'red';
      errorMsg.textContent = errData.error || `Unexpected error (${response.status}). Please try again.`;
    }
  } catch (error) {
    console.error('Verification error', error);
    errorMsg.style.color = 'red';
    errorMsg.textContent = 'Error verifying password. Please check connection.';
  }
}

export function updateLockUI() {
  const lockBtn = document.getElementById('lockSystemButton');
  const icon = lockBtn.querySelector('i');
  if (state.isLocked) {
    if (icon) icon.className = 'fas fa-lock';
    lockBtn.style.backgroundColor = '#dc3545';
    lockBtn.title = 'System Locked (Click to Unlock)';
  } else {
    if (icon) icon.className = 'fas fa-lock-open';
    lockBtn.style.backgroundColor = '#28a745';
    lockBtn.title = 'System Unlocked (Click to Lock)';
  }
}

export function checkAccess(callback) {
  if (state.saveQueuePaused) {
    showToast('May pending na hindi pa na-save. I-retry muna sa itaas bago mag-edit ulit.', 'error');
    return;
  }
  if (state.isLocked) {
    showPasswordModal(callback);
    return;
  }
  resetInactivityTimer();
  if (callback) callback();
}

export function initAuth() {
  const confirmUnlockBtn = document.getElementById('confirmUnlockButton');
  const cancelUnlockBtn = document.getElementById('cancelUnlockButton');
  const lockBtn = document.getElementById('lockSystemButton');

  confirmUnlockBtn.addEventListener('click', () => handleUnlock());
  document.getElementById('systemPasswordInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') handleUnlock();
  });
  cancelUnlockBtn.addEventListener('click', () => {
    document.getElementById('passwordModal').style.display = 'none';
    state.pendingAction = null;
  });

  lockBtn.addEventListener('click', () => {
    if (state.isLocked) {
      checkAccess(() => {});
    } else {
      lockSystem();
    }
  });

  ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(name => {
    document.addEventListener(name, resetInactivityTimer);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopSessionCheck();
    } else if (!state.isLocked) {
      runSessionCheck(); // check immediately on return, then resume the interval
      startSessionCheck();
    }
  });
}
