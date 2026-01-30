/**
 * Options Page - Version 1.0.0
 * Settings page with theme, auto-save, grouping behavior, and storage management
 * @fileoverview Options page script with input validation
 */

/** @constant {number} Minimum auto-save interval in minutes */
const MIN_AUTO_SAVE_INTERVAL = 1;

/** @constant {number} Maximum auto-save interval in minutes */
const MAX_AUTO_SAVE_INTERVAL = 120;

/** @constant {number} Minimum recovery sessions to keep */
const MIN_RECOVERY_SESSIONS = 1;

/** @constant {number} Maximum recovery sessions to keep */
const MAX_RECOVERY_SESSIONS = 20;

/** @constant {number} Maximum import file size in bytes (5 MB) */
const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Show notification toast
 * @param {string} message - Message to display
 * @param {string} type - Notification type ('info', 'success', 'warning', 'error')
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Validate and parse integer input
 * @param {string} value - Input value to parse
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {number} defaultValue - Default value if parsing fails
 * @returns {number} Validated integer value
 */
function validateIntInput(value, min, max, defaultValue) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

/**
 * Apply theme to page based on settings
 * @returns {Promise<void>}
 */
async function applyTheme() {
  try {
    const { theme } = await chrome.storage.local.get(['theme']);
    const selectedTheme = theme || 'auto';

    if (selectedTheme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', selectedTheme);
    }
  } catch (error) {
    console.error('[Options] Error applying theme:', error);
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

/**
 * Load settings from storage and populate form
 * @returns {Promise<void>}
 */
async function loadSettings() {
  try {
    const settings = await chrome.storage.local.get([
      'autoSaveEnabled',
      'autoSaveInterval',
      'crashRecoveryEnabled',
      'maxRecoverySessions',
      'autoCollapseGroups',
      'showNotifications',
      'skipSingleTabGroups',
      'theme'
    ]);

    document.getElementById('auto-save-enabled').checked = settings.autoSaveEnabled !== false;
    document.getElementById('auto-save-interval').value = settings.autoSaveInterval || 5;
    document.getElementById('crash-recovery-enabled').checked = settings.crashRecoveryEnabled !== false;
    document.getElementById('max-recovery-sessions').value = settings.maxRecoverySessions || 3;
    document.getElementById('auto-collapse-groups').checked = settings.autoCollapseGroups || false;
    document.getElementById('show-notifications').checked = settings.showNotifications !== false;
    document.getElementById('skip-single-tab-groups').checked = settings.skipSingleTabGroups !== false;

    const theme = settings.theme || 'auto';
    const themeRadio = document.getElementById(`theme-${theme}`);
    if (themeRadio) {
      themeRadio.checked = true;
    }
  } catch (error) {
    console.error('[Options] Error loading settings:', error);
    showNotification('Error loading settings', 'error');
  }
}

/**
 * Update storage display with current usage
 * @returns {Promise<void>}
 */
async function updateStorageDisplay() {
  try {
    const { sessions } = await chrome.storage.local.get(['sessions']);
    const sessionCount = sessions ? sessions.length : 0;

    const storageStr = JSON.stringify(sessions || []);
    const storageMB = (storageStr.length / 1024 / 1024).toFixed(2);
    const storagePercent = Math.min((parseFloat(storageMB) / 10) * 100, 100);

    document.getElementById('storage-bar').style.width = `${storagePercent}%`;
    document.getElementById('storage-text').textContent = `Storage used: ${storageMB} MB / 10 MB`;
    document.getElementById('sessions-text').textContent = `Saved sessions: ${sessionCount} / 50`;
  } catch (error) {
    console.error('[Options] Error updating storage display:', error);
  }
}

/**
 * Validate imported session data structure
 * @param {Array} sessions - Array of session objects to validate
 * @returns {boolean} True if valid
 */
function validateImportedSessions(sessions) {
  if (!Array.isArray(sessions)) {
    return false;
  }

  for (const session of sessions) {
    if (!session || typeof session !== 'object') {
      return false;
    }
    if (typeof session.id !== 'string' && typeof session.id !== 'number') {
      return false;
    }
    if (typeof session.name !== 'string') {
      return false;
    }
    if (typeof session.timestamp !== 'number') {
      return false;
    }
  }

  return true;
}

/**
 * Setup auto-save by notifying background script
 */
function setupAutoSave() {
  chrome.runtime.sendMessage({ type: 'setupAutoSave' }).catch(() => {});
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  await applyTheme();
  await loadSettings();
  await updateStorageDisplay();
  setupAutoSave();

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
    try {
      const { theme } = await chrome.storage.local.get(['theme']);
      if (!theme || theme === 'auto') {
        await applyTheme();
      }
    } catch (error) {
      console.error('[Options] Error handling theme change:', error);
    }
  });
});

// Save settings with validation
document.getElementById('save-settings-btn').addEventListener('click', async () => {
  try {
    // Validate inputs
    const autoSaveInterval = validateIntInput(
      document.getElementById('auto-save-interval').value,
      MIN_AUTO_SAVE_INTERVAL,
      MAX_AUTO_SAVE_INTERVAL,
      5
    );

    const maxRecoverySessions = validateIntInput(
      document.getElementById('max-recovery-sessions').value,
      MIN_RECOVERY_SESSIONS,
      MAX_RECOVERY_SESSIONS,
      3
    );

    // Update input fields with validated values
    document.getElementById('auto-save-interval').value = autoSaveInterval;
    document.getElementById('max-recovery-sessions').value = maxRecoverySessions;

    const settings = {
      autoSaveEnabled: document.getElementById('auto-save-enabled').checked,
      autoSaveInterval: autoSaveInterval,
      crashRecoveryEnabled: document.getElementById('crash-recovery-enabled').checked,
      maxRecoverySessions: maxRecoverySessions,
      autoCollapseGroups: document.getElementById('auto-collapse-groups').checked,
      showNotifications: document.getElementById('show-notifications').checked,
      skipSingleTabGroups: document.getElementById('skip-single-tab-groups').checked,
      theme: document.querySelector('input[name="theme"]:checked').value
    };

    await chrome.storage.local.set(settings);

    // Apply theme immediately
    await applyTheme();

    // Update auto-save interval if it changed
    chrome.runtime.sendMessage({ type: 'updateAutoSave' }).catch(() => {});

    // Show success feedback
    const btn = document.getElementById('save-settings-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Settings Saved';
    btn.style.background = '#10B981';

    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
    }, 2000);
  } catch (error) {
    console.error('[Options] Error saving settings:', error);
    showNotification('Failed to save settings', 'error');
  }
});

// Theme radio buttons - apply immediately on change
document.querySelectorAll('input[name="theme"]').forEach(radio => {
  radio.addEventListener('change', async () => {
    try {
      const theme = radio.value;
      await chrome.storage.local.set({ theme });
      await applyTheme();
    } catch (error) {
      console.error('[Options] Error changing theme:', error);
    }
  });
});

// Back button
document.getElementById('back-btn').addEventListener('click', () => {
  window.close();
});

// Customize shortcuts button
document.getElementById('customize-shortcuts-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// Export sessions
document.getElementById('export-sessions-btn').addEventListener('click', async () => {
  try {
    const { sessions } = await chrome.storage.local.get(['sessions']);

    if (!sessions || sessions.length === 0) {
      showNotification('No sessions to export', 'warning');
      return;
    }

    const dataStr = JSON.stringify(sessions, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `tab-organizer-sessions-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showNotification('Sessions exported successfully', 'success');
  } catch (error) {
    console.error('[Options] Error exporting sessions:', error);
    showNotification('Failed to export sessions', 'error');
  }
});

// Import sessions with validation
document.getElementById('import-sessions-btn').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';

  input.onchange = async (e) => {
    try {
      const file = e.target.files[0];

      if (!file) {
        return;
      }

      // Check file size
      if (file.size > MAX_IMPORT_FILE_SIZE) {
        showNotification('File too large. Maximum size is 5 MB.', 'error');
        return;
      }

      const text = await file.text();
      let importedSessions;

      try {
        importedSessions = JSON.parse(text);
      } catch (parseError) {
        showNotification('Invalid JSON file format', 'error');
        return;
      }

      if (!validateImportedSessions(importedSessions)) {
        showNotification('Invalid session data format', 'error');
        return;
      }

      // Check if merged size would exceed quota
      const { sessions } = await chrome.storage.local.get(['sessions']);
      const existingSessions = sessions || [];
      const merged = [...existingSessions, ...importedSessions];

      const estimatedSize = JSON.stringify(merged).length * 2;
      if (estimatedSize > 10 * 1024 * 1024) {
        showNotification('Import would exceed storage limit. Delete some sessions first.', 'error');
        return;
      }

      await chrome.storage.local.set({ sessions: merged });
      await updateStorageDisplay();
      showNotification(`Successfully imported ${importedSessions.length} sessions!`, 'success');
    } catch (error) {
      showNotification('Failed to import sessions. Please check the file format.', 'error');
      console.error('[Options] Import error:', error);
    }
  };

  input.click();
});

// Clear old sessions
document.getElementById('clear-old-sessions-btn').addEventListener('click', async () => {
  if (!confirm('Delete recovery sessions older than 7 days?')) return;

  try {
    const { sessions } = await chrome.storage.local.get(['sessions']);
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    const filtered = (sessions || []).filter(s => {
      if (s.name && s.name.startsWith('Recovery (') && s.timestamp < sevenDaysAgo) {
        return false;
      }
      return true;
    });

    const removed = (sessions || []).length - filtered.length;

    await chrome.storage.local.set({ sessions: filtered });
    await updateStorageDisplay();
    showNotification(`Removed ${removed} old recovery sessions`, 'success');
  } catch (error) {
    console.error('[Options] Error clearing old sessions:', error);
    showNotification('Failed to clear old sessions', 'error');
  }
});

// Give feedback
document.getElementById('give-feedback-btn').addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://chrome.google.com/webstore'
  });
});
