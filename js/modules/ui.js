// =============================================================================
// Cohin Inventory System — UI Helpers
// Toasts, glass dialog, dark mode, button loading, date/time, file naming.
// =============================================================================

// --- Toast Notifications ---

export function showToast(message, type = 'info') {
  const stack = document.getElementById('toastStack');
  if (!stack) {
    window.alert(message);
    return;
  }
  const toast = document.createElement('div');
  toast.className = 'app-toast app-toast-' + type;
  const iconClass =
    type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';
  toast.innerHTML = '<i class="fas ' + iconClass + '"></i><span></span>';
  toast.querySelector('span').textContent = message;
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

// --- Glass Dialog (replaces native alert/confirm) ---

function glassDialog(message, { showCancel }) {
  return new Promise(resolve => {
    const modal = document.getElementById('glassDialogModal');
    const msgEl = document.getElementById('glassDialogMessage');
    const okBtn = document.getElementById('glassDialogOk');
    const cancelBtn = document.getElementById('glassDialogCancel');
    msgEl.textContent = message;
    cancelBtn.style.display = showCancel ? '' : 'none';
    modal.style.display = 'block';

    function cleanup(result) {
      modal.style.display = 'none';
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(result);
    }
    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
  });
}

export function customAlert(message) {
  return glassDialog(message, { showCancel: false });
}

export function customConfirm(message) {
  return glassDialog(message, { showCancel: true });
}

// --- Button Loading State ---

export function setButtonLoading(btn, isLoading) {
  if (!btn) return;
  if (isLoading) {
    if (!btn.dataset.originalInnerHtml) btn.dataset.originalInnerHtml = btn.innerHTML;
    if (!btn.querySelector('.btn-label')) {
      btn.innerHTML = `<span class="btn-label">${btn.innerHTML}</span><i class="fas fa-spinner fa-spin btn-spinner"></i>`;
    } else if (!btn.querySelector('.btn-spinner')) {
      btn.insertAdjacentHTML('beforeend', '<i class="fas fa-spinner fa-spin btn-spinner"></i>');
    }
    btn.classList.add('is-loading');
    btn.disabled = true;
  } else {
    if (btn.dataset.originalInnerHtml) {
      btn.innerHTML = btn.dataset.originalInnerHtml;
      delete btn.dataset.originalInnerHtml;
    }
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}

// --- Save Indicator ---

export function showSaveIndicator(isSaving) {
  import('./state.js').then(({ state }) => {
    const el = document.getElementById('saveStatusIndicator');
    if (!el) return;
    state.activeSaveCount += isSaving ? 1 : -1;
    if (state.activeSaveCount < 0) state.activeSaveCount = 0;
    el.classList.toggle('is-visible', state.activeSaveCount > 0);
  });
}

// --- Dark Mode ---

export function updateDarkModeIcon(isDark) {
  const darkModeToggle = document.getElementById('darkModeToggle');
  const icon = darkModeToggle.querySelector('i');
  if (isDark) {
    icon.classList.remove('fa-moon');
    icon.classList.add('fa-sun');
    darkModeToggle.style.backgroundColor = '#f1c40f';
    darkModeToggle.title = 'Switch to Light Mode';
  } else {
    icon.classList.remove('fa-sun');
    icon.classList.add('fa-moon');
    darkModeToggle.style.backgroundColor = '#6c757d';
    darkModeToggle.title = 'Switch to Dark Mode';
  }
}

export function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('darkMode', isDark);
  updateDarkModeIcon(isDark);
}

// --- Date/Time/Shift ---

export function updateDateTimeAndShift() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  document.getElementById('currentDate').value = `${year}-${month}-${day}`;
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('currentTime').value = `${hours}:${minutes}`;
  document.getElementById('currentShift').value = now.getHours() >= 6 && now.getHours() < 18 ? 'Day Shift' : 'Night Shift';
}

// --- Filename Generation ---

export function generateBackupFilename() {
  const dateValue = document.getElementById('currentDate').value;
  const [year, month, day] = dateValue.split('-');
  const shortYear = year.slice(-2);
  const formattedDate = `${month}-${day}-${shortYear}`;
  const timeValue = document.getElementById('currentTime').value;
  let [hours, minutes] = timeValue.split(':');
  hours = parseInt(hours, 10);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const formattedTime = `${hours}-${minutes}-${ampm}`;
  const shiftValue = document.getElementById('currentShift').value;
  const shiftAbbreviation = shiftValue === 'Day Shift' ? 'DS' : 'NS';
  return `backup_${formattedDate}_${formattedTime}_${shiftAbbreviation}.xlsx`;
}

export function generateReportFilename() {
  const dateValue = document.getElementById('currentDate').value;
  const [year, month, day] = dateValue.split('-');
  const shortYear = year.slice(-2);
  const formattedDate = `${month}-${day}-${shortYear}`;
  const timeValue = document.getElementById('currentTime').value;
  let [hours, minutes] = timeValue.split(':');
  hours = parseInt(hours, 10);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const formattedTime = `${hours}-${minutes}-${ampm}`;
  const shiftValue = document.getElementById('currentShift').value;
  const shiftAbbreviation = shiftValue === 'Day Shift' ? 'DS' : 'NS';
  return `report_${formattedDate}_${formattedTime}_${shiftAbbreviation}.xlsx`;
}
