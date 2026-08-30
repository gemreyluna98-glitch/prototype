// =============================================================================
// Cohin Inventory System — Authentication & Lock System
// =============================================================================

import { state, clearStoredToken } from './state.js';
import { loadDataFromAPI } from './api.js';

const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes

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
}

export function showPasswordModal(callback) {
  state.pendingAction = callback;
  const modal = document.getElementById('passwordModal');
  modal.style.display = 'block';
  document.getElementById('systemPasswordInput').value = '';
  document.getElementById('passwordErrorMessage').textContent = '';
  document.getElementById('systemPasswordInput').focus();
}

export async function handleUnlock() {
  const pass = document.getElementById('systemPasswordInput').value;
  const errorMsg = document.getElementById('passwordErrorMessage');
  errorMsg.textContent = 'Verifying password...';
  errorMsg.style.color = 'blue';

  try {
    const response = await fetch('/api/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass }),
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('sessionToken', data.token || pass);
      state.isLocked = false;
      updateLockUI();
      resetInactivityTimer();
      document.getElementById('passwordModal').style.display = 'none';
      await loadDataFromAPI();
      if (state.pendingAction) {
        const action = state.pendingAction;
        state.pendingAction = null;
        action();
      }
    } else {
      errorMsg.style.color = 'red';
      errorMsg.textContent = 'Incorrect Password!';
      document.getElementById('systemPasswordInput').value = '';
      document.getElementById('systemPasswordInput').focus();
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

  confirmUnlockBtn.addEventListener('click', handleUnlock);
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
}
