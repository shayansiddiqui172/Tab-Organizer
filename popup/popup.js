/**
 * Tab Organizer Extension - Version 1.0.0
 * Features: Smart tab classification, grouping, dividers, session management, settings page, undo
 * @fileoverview Main popup script with XSS-safe DOM manipulation
 */

// Track event listeners for cleanup
const eventListenerCleanup = [];

/**
 * Register an event listener and track it for cleanup
 * @param {Element} element - DOM element to attach listener to
 * @param {string} event - Event type
 * @param {Function} handler - Event handler function
 */
function addTrackedEventListener(element, event, handler) {
  element.addEventListener(event, handler);
  eventListenerCleanup.push({ element, event, handler });
}

/**
 * Clean up all registered event listeners
 */
function cleanupEventListeners() {
  for (const { element, event, handler } of eventListenerCleanup) {
    element.removeEventListener(event, handler);
  }
  eventListenerCleanup.length = 0;
}

// Clean up on popup close
window.addEventListener('unload', cleanupEventListeners);

/**
 * Sanitize a string for safe text display (escapes HTML entities)
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str;
}

/**
 * Check if user has seen welcome message
 * @returns {Promise<void>}
 */
async function checkWelcomeStatus() {
  try {
    const result = await chrome.storage.local.get('hasSeenWelcome');
    const welcomeCard = document.getElementById('welcomeCard');

    if (!result.hasSeenWelcome) {
      welcomeCard.classList.add('show');
    } else {
      welcomeCard.classList.remove('show');
    }
  } catch (error) {
    console.error('[Popup] Error checking welcome status:', error);
  }
}

// Handle "Got it!" button click
document.getElementById('gotItBtn').addEventListener('click', async () => {
  try {
    await chrome.storage.local.set({ hasSeenWelcome: true });
    document.getElementById('welcomeCard').classList.remove('show');
  } catch (error) {
    console.error('[Popup] Error saving welcome status:', error);
    document.getElementById('welcomeCard').classList.remove('show');
  }
});

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Toast type ('success', 'error', 'info')
 */
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = sanitizeText(message);
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Format timestamp to human-readable format
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted time string
 */
function formatTimestamp(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 66);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
}

/**
 * Count total tabs in a session
 * @param {Object} session - Session object
 * @returns {number} Total tab count
 */
function countSessionTabs(session) {
  let count = 0;
  for (const window of session.windows || []) {
    count += (window.tabs || []).length;
  }
  return count;
}

/**
 * Query all tabs and display count
 * @returns {Promise<void>}
 */
async function updateTabCount() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const count = tabs.length;
    const tabCountEl = document.getElementById('tabCount');

    if (tabCountEl) {
      tabCountEl.classList.add('updating');
      tabCountEl.textContent = `${count} tab${count !== 1 ? 's' : ''}`;

      setTimeout(() => {
        tabCountEl.classList.remove('updating');
      }, 300);
    }
  } catch (error) {
    console.error('[Popup] Error updating tab count:', error);
  }
}

/**
 * Apply theme to popup
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
    console.error('[Popup] Error applying theme:', error);
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

/**
 * Show loading state on a container
 * @param {Element} container - Container element
 */
function showLoadingState(container) {
  container.innerHTML = '';
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading-state';
  loadingDiv.textContent = 'Loading...';
  container.appendChild(loadingDiv);
}

/**
 * Initialize popup
 * @returns {Promise<void>}
 */
async function initPopup() {
  try {
    // Initialize i18n for elements with data-i18n
    try {
      document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = chrome.i18n.getMessage(el.dataset.i18n);
      });
    } catch (e) {
      // Fail silently if i18n isn't available in this context
      console.warn('[Popup] i18n init failed', e);
    }
    await applyTheme();
    await checkWelcomeStatus();
    await initTabScrolling();
    await updateTabCount();
    await loadActiveGroups();
    await loadSavedSessions();

    // Listen for theme changes
    const themeChangeHandler = (changes, namespace) => {
      if (changes.theme) {
        applyTheme().catch(error => {
          console.error('[Popup] Error applying theme from storage change:', error);
        });
      }
    };
    chrome.storage.onChanged.addListener(themeChangeHandler);

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const systemThemeHandler = async () => {
      try {
        const { theme } = await chrome.storage.local.get(['theme']);
        if (!theme || theme === 'auto') {
          await applyTheme();
        }
      } catch (error) {
        console.error('[Popup] Error applying theme from system change:', error);
      }
    };
    mediaQuery.addEventListener('change', systemThemeHandler);
  } catch (error) {
    console.error('[Popup] Error initializing popup:', error);
    showToast('Error loading extension. Please refresh.', 'error');
  }
}

/**
 * Map Chrome tab group colors to CSS hex colors
 * @param {string} color - Chrome color name
 * @returns {string} Hex color code
 */
function getGroupColorHex(color) {
  const colorMap = {
    'grey': '#9CA3AF',
    'blue': '#3B82F6',
    'red': '#EF4444',
    'yellow': '#FBBF24',
    'green': '#10B981',
    'pink': '#EC4899',
    'purple': '#8B5CF6',
    'cyan': '#06B6D4'
  };
  return colorMap[color] || '#9CA3AF';
}

/**
 * Create a group item element safely using DOM methods
 * @param {Object} group - Group object
 * @param {number} tabCount - Number of tabs in group
 * @returns {HTMLElement} Group item element
 */
function createGroupItemElement(group, tabCount) {
  const colorHex = getGroupColorHex(group.color);

  const groupItem = document.createElement('div');
  groupItem.className = 'group-item';

  const leftDiv = document.createElement('div');
  leftDiv.className = 'group-item-left';

  const colorIndicator = document.createElement('div');
  colorIndicator.className = 'group-color-indicator';
  colorIndicator.style.backgroundColor = colorHex;

  const infoDiv = document.createElement('div');
  infoDiv.className = 'group-item-info';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'group-item-title';
  titleDiv.textContent = group.title || 'Untitled Group';

  const countDiv = document.createElement('div');
  countDiv.className = 'group-item-count';
  countDiv.textContent = `${tabCount} tabs`;

  infoDiv.appendChild(titleDiv);
  leftDiv.appendChild(colorIndicator);
  leftDiv.appendChild(infoDiv);
  groupItem.appendChild(leftDiv);
  groupItem.appendChild(countDiv);

  return groupItem;
}

/**
 * Load and display active groups
 * @returns {Promise<void>}
 */
async function loadActiveGroups() {
  const groupsContainer = document.getElementById('activeGroups');
  const metadataContainer = document.getElementById('activeGroupsMetadata');

  // Show loading state
  showLoadingState(groupsContainer);

  try {
    const windows = await chrome.windows.getAll({ populate: true });
    const groups = [];
    let totalTabs = 0;

    for (const window of windows) {
      const tabs = window.tabs || [];
      totalTabs += tabs.length;
      for (const tab of tabs) {
        if (tab.groupId !== chrome.tabs.TAB_ID_NONE) {
          const group = await chrome.tabGroups.get(tab.groupId);
          if (!groups.find(g => g.id === group.id)) {
            groups.push(group);
          }
        }
      }
    }

    // Update metadata
    const windowCount = windows.length;
    metadataContainer.textContent = `${totalTabs} tab${totalTabs !== 1 ? 's' : ''} open · ${windowCount} window${windowCount !== 1 ? 's' : ''}`;

    // Clear container
    groupsContainer.innerHTML = '';

    if (groups.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';

      const emptyText = document.createElement('div');
      emptyText.className = 'empty-state-text';
      emptyText.textContent = `${totalTabs} tab${totalTabs !== 1 ? 's' : ''} open · 0 groups`;

      const br = document.createElement('br');
      const helpText = document.createTextNode('Group your tabs to stay focused.');

      emptyText.appendChild(br);
      emptyText.appendChild(helpText);
      emptyState.appendChild(emptyText);
      groupsContainer.appendChild(emptyState);
      return;
    }

    // Count tabs per group
    const groupTabs = {};
    for (const group of groups) {
      const tabs = await chrome.tabs.query({ groupId: group.id });
      groupTabs[group.id] = tabs.length;
    }

    // Create group items using safe DOM methods
    for (const group of groups) {
      const tabCount = groupTabs[group.id] || 0;
      const groupItem = createGroupItemElement(group, tabCount);
      groupsContainer.appendChild(groupItem);
    }
  } catch (error) {
    console.error('[Popup] Error loading groups:', error);
    groupsContainer.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'empty-state';
    errorDiv.textContent = 'Error loading groups. Please refresh.';
    groupsContainer.appendChild(errorDiv);
    metadataContainer.textContent = '';
  }
}

/**
 * Show rename modal for session
 * @param {string} sessionId - Session ID
 * @param {string} currentName - Current session name
 * @returns {Promise<string|null>} New name or null if cancelled
 */
function showRenameModal(sessionId, currentName) {
  return new Promise((resolve) => {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = 'Rename Session';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'modal-input';
    input.value = currentName;
    input.maxLength = 100;
    input.placeholder = 'Enter session name';

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn modal-btn-cancel';
    cancelBtn.textContent = 'Cancel';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'modal-btn modal-btn-save';
    saveBtn.textContent = 'Save';

    const cleanup = () => {
      overlay.remove();
    };

    cancelBtn.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    saveBtn.addEventListener('click', () => {
      const newName = input.value.trim();
      cleanup();
      resolve(newName || null);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const newName = input.value.trim();
        cleanup();
        resolve(newName || null);
      } else if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(saveBtn);
    modal.appendChild(title);
    modal.appendChild(input);
    modal.appendChild(buttonContainer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Focus input and select text
    setTimeout(() => {
      input.focus();
      input.select();
    }, 10);
  });
}

/**
 * Show save session modal
 * @returns {Promise<string|null>} Session name or null if cancelled
 */
function showSaveSessionModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = 'Save Session';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'modal-input';
    input.maxLength = 100;
    input.placeholder = 'Enter a name for this session';

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn modal-btn-cancel';
    cancelBtn.textContent = 'Cancel';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'modal-btn modal-btn-save';
    saveBtn.textContent = 'Save';

    const cleanup = () => {
      overlay.remove();
    };

    cancelBtn.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    saveBtn.addEventListener('click', () => {
      const name = input.value.trim();
      cleanup();
      resolve(name || null);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const name = input.value.trim();
        cleanup();
        resolve(name || null);
      } else if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(saveBtn);
    modal.appendChild(title);
    modal.appendChild(input);
    modal.appendChild(buttonContainer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(() => {
      input.focus();
    }, 10);
  });
}

/**
 * Create a session item element safely using DOM methods
 * @param {Object} session - Session object
 * @param {Function} onAction - Callback for actions
 * @returns {HTMLElement} Session item element
 */
function createSessionItemElement(session, onAction) {
  const timeStr = formatTimestamp(session.timestamp);
  const tabCount = countSessionTabs(session);

  // Format date in readable format: "22 Jan 2026, 3:45 PM"
  const date = new Date(session.timestamp);
  const dateStr = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  const timeOfDay = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  // Determine session status
  const now = Date.now();
  const sessionAge = now - session.timestamp;
  const oneHour = 60 * 60 * 1000;
  const isRecent = sessionAge < oneHour;
  const isRecovery = session.name && session.name.toLowerCase().includes('recovery');

  let statusClass = '';
  if (isRecovery) {
    statusClass = 'recovery';
  } else if (isRecent) {
    statusClass = 'recent';
  }

  const sessionItem = document.createElement('div');
  sessionItem.className = `session-item ${statusClass}`;
  sessionItem.dataset.sessionId = session.id;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'session-item-content';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'session-item-title';

  // For recovery sessions, show "Recovery", for others show the session name
  if (isRecovery) {
    titleDiv.textContent = 'Recovery';
  } else {
    titleDiv.textContent = session.name || 'Unnamed Session';
  }

  const timeDiv = document.createElement('div');
  timeDiv.className = 'session-item-time';

  // Show date, time, and tab count for all sessions
  timeDiv.textContent = `${dateStr}, ${timeOfDay} · ${tabCount} tab${tabCount !== 1 ? 's' : ''}`;

  contentDiv.appendChild(titleDiv);
  contentDiv.appendChild(timeDiv);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'session-item-actions';

  // Restore button
  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'session-action-btn';
  restoreBtn.title = 'Restore';
  restoreBtn.textContent = '↻';
  restoreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onAction('restore', session.id, restoreBtn);
  });

  // Rename button
  const renameBtn = document.createElement('button');
  renameBtn.className = 'session-action-btn';
  renameBtn.title = 'Rename';
  renameBtn.textContent = '✎';
  renameBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onAction('rename', session.id, renameBtn);
  });

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'session-action-btn';
  deleteBtn.title = 'Delete';
  deleteBtn.textContent = '✕';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onAction('delete', session.id, deleteBtn);
  });

  actionsDiv.appendChild(restoreBtn);
  actionsDiv.appendChild(renameBtn);
  actionsDiv.appendChild(deleteBtn);

  sessionItem.appendChild(contentDiv);
  sessionItem.appendChild(actionsDiv);

  return sessionItem;
}

/**
 * Handle session action
 * @param {string} action - Action type
 * @param {string} sessionId - Session ID
 * @param {HTMLElement} btn - Button element
 */
async function handleSessionAction(action, sessionId, btn) {
  const sessions = await getAllSessions();
  const session = sessions.find(s => s.id === sessionId);

  if (!session) {
    showToast('Session not found', 'error');
    return;
  }

  if (action === 'restore') {
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '⟳';
    btn.style.opacity = '0.6';
    btn.classList.add('loading');

    showToast('Restoring session in new window...', 'info');

    try {
      await restoreSession(sessionId);

      // Show success checkmark animation
      btn.classList.remove('loading');
      btn.classList.add('success');
      btn.textContent = '✓';
      btn.style.opacity = '1';

      showToast(`Session "${session.name}" opened in new window`, 'success');

      // Keep checkmark visible for 2 seconds before reverting
      await new Promise(resolve => setTimeout(resolve, 2000));

      btn.classList.remove('success');
      btn.textContent = originalText;
      btn.disabled = false;
    } catch (error) {
      console.error('[Popup] Failed to restore session:', error);
      showToast('Failed to restore session. Please try again.', 'error');
      btn.disabled = false;
      btn.textContent = originalText;
      btn.style.opacity = '1';
      btn.classList.remove('loading');
    }
  } else if (action === 'rename') {
    const newName = await showRenameModal(sessionId, session.name);
    if (newName && newName !== session.name) {
      try {
        const updatedSessions = sessions.map(s =>
          s.id === sessionId ? { ...s, name: newName } : s
        );
        await chrome.storage.local.set({ sessions: updatedSessions });
        await loadSavedSessions();
        showToast('Session renamed', 'success');
      } catch (error) {
        console.error('[Popup] Error renaming session:', error);
        if (error.message && error.message.includes('QUOTA')) {
          showToast('Could not save session. Storage might be full.', 'error');
        } else {
          showToast('Failed to rename session. Please try again.', 'error');
        }
      }
    }
  } else if (action === 'delete') {
    if (confirm('Are you sure you want to delete this session?')) {
      try {
        await deleteSession(sessionId);
        await loadSavedSessions();
        showToast('Session deleted', 'success');
      } catch (error) {
        console.error('[Popup] Error deleting session:', error);
        showToast('Failed to delete session. Please try again.', 'error');
      }
    }
  }
}

/**
 * Load and display saved sessions
 * @returns {Promise<void>}
 */
async function loadSavedSessions() {
  const sessionsContainer = document.getElementById('savedSessions');

  // Show loading state
  showLoadingState(sessionsContainer);

  try {
    const sessions = await getAllSessions();

    // Clear container
    sessionsContainer.innerHTML = '';

    if (sessions.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.textContent = 'No saved sessions yet.';
      sessionsContainer.appendChild(emptyState);
      return;
    }

    // Create session items using safe DOM methods
    for (const session of sessions) {
      const sessionItem = createSessionItemElement(session, handleSessionAction);
      sessionsContainer.appendChild(sessionItem);
    }
  } catch (error) {
    console.error('[Popup] Error loading sessions:', error);
    sessionsContainer.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'empty-state';
    errorDiv.textContent = 'Error loading sessions. Please refresh.';
    sessionsContainer.appendChild(errorDiv);
    showToast('Failed to load sessions', 'error');
  }
}

/**
 * Save undo state before performing an action
 * @param {string} actionType - Type of action being performed
 * @returns {Promise<void>}
 */
async function saveUndoState(actionType) {
  try {
    const result = await chrome.storage.local.get('undoHistory');
    const history = result.undoHistory || [];

    const windows = await chrome.windows.getAll({ populate: true });
    const state = { windows: [] };

    for (const window of windows) {
      const windowState = {
        id: window.id,
        tabs: [],
        groups: []
      };

      if (window.tabs) {
        for (const tab of window.tabs) {
          windowState.tabs.push({
            id: tab.id,
            url: tab.url,
            title: tab.title,
            groupId: tab.groupId !== chrome.tabs.TAB_ID_NONE ? tab.groupId : null,
            index: tab.index
          });
        }

        const groupIds = new Set();
        for (const tab of window.tabs) {
          if (tab.groupId !== chrome.tabs.TAB_ID_NONE) {
            groupIds.add(tab.groupId);
          }
        }

        for (const groupId of groupIds) {
          try {
            const group = await chrome.tabGroups.get(groupId);
            const tabsInGroup = window.tabs.filter(t => t.groupId === groupId);
            windowState.groups.push({
              id: groupId,
              title: group.title,
              color: group.color,
              collapsed: group.collapsed,
              tabIds: tabsInGroup.map(t => t.id)
            });
          } catch (error) {
            console.warn('Error getting group:', error);
          }
        }
      }

      state.windows.push(windowState);
    }

    history.push({
      type: actionType,
      timestamp: Date.now(),
      previousGroups: state
    });

    if (history.length > 20) {
      history.shift();
    }

    await chrome.storage.local.set({ undoHistory: history });
  } catch (error) {
    console.error('Error saving undo state:', error);
  }
}

/**
 * Perform undo of last action
 * @returns {Promise<boolean>} True if undo was successful
 */
async function performUndo() {
  try {
    const result = await chrome.storage.local.get('undoHistory');
    const history = result.undoHistory || [];

    if (history.length === 0) {
      showToast('Nothing to undo', 'info');
      return false;
    }

    const lastState = history.pop();
    await chrome.storage.local.set({ undoHistory: history });

    for (const windowState of lastState.previousGroups.windows) {
      const window = await chrome.windows.get(windowState.id).catch(() => null);
      if (!window) continue;

      const currentTabs = await chrome.tabs.query({ windowId: window.id });
      for (const tab of currentTabs) {
        if (tab.groupId !== chrome.tabs.TAB_ID_NONE) {
          try {
            await chrome.tabs.ungroup([tab.id]);
          } catch (error) {
            console.warn('Error ungrouping tab:', error);
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      for (const group of windowState.groups) {
        const existingTabs = await chrome.tabs.query({ windowId: window.id });
        const tabsToGroup = [];

        for (const savedTabId of group.tabIds) {
          let tab = existingTabs.find(t => t.id === savedTabId);
          if (!tab) {
            const savedTab = windowState.tabs.find(t => t.id === savedTabId);
            if (savedTab) {
              tab = existingTabs.find(t => t.url === savedTab.url);
            }
          }
          if (tab) {
            tabsToGroup.push(tab.id);
          }
        }

        if (tabsToGroup.length > 0) {
          try {
            const newGroupId = await chrome.tabs.group({ tabIds: tabsToGroup });
            await chrome.tabGroups.update(newGroupId, {
              title: group.title,
              color: group.color,
              collapsed: group.collapsed
            });
          } catch (error) {
            console.warn('Error recreating group:', error);
          }
        }
      }
    }

    await loadActiveGroups();
    showToast('Action undone', 'success');
    return true;
  } catch (error) {
    console.error('[Popup] Error undoing:', error);
    showToast('Failed to undo action. Please try again.', 'error');
    return false;
  }
}

/**
 * Set loading state on a button
 * @param {HTMLElement} btn - Button element
 * @param {boolean} loading - Whether to show loading state
 * @param {string} loadingText - Text to show while loading
 * @returns {Object} Original state to restore
 */
function setButtonLoading(btn, loading, loadingText = 'Loading...') {
  if (loading) {
    const iconElement = btn.querySelector('.action-icon');
    const titleElement = btn.querySelector('.action-title');
    const originalIconHTML = iconElement ? iconElement.innerHTML : '';
    const originalTitleText = titleElement ? titleElement.textContent : '';

    btn.disabled = true;
    btn.classList.add('loading');
    if (iconElement) {
      iconElement.innerHTML = '';
      iconElement.classList.add('spinner-icon');
    }
    if (titleElement) {
      titleElement.textContent = loadingText;
    }

    return { iconElement, titleElement, originalIconHTML, originalTitleText };
  }
  return null;
}

/**
 * Restore button from loading state
 * @param {HTMLElement} btn - Button element
 * @param {Object} state - Original state from setButtonLoading
 */
function restoreButton(btn, state) {
  btn.disabled = false;
  btn.classList.remove('loading');
  if (state.iconElement) {
    state.iconElement.innerHTML = state.originalIconHTML;
    state.iconElement.classList.remove('spinner-icon');
  }
  if (state.titleElement) {
    state.titleElement.textContent = state.originalTitleText;
  }
}

/**
 * Show success state on button with checkmark animation
 * @param {HTMLElement} btn - Button element
 * @param {Object} state - Original state from setButtonLoading
 * @param {string} successText - Text to show during success state
 * @param {number} duration - How long to show success state in ms
 * @returns {Promise<void>}
 */
async function showButtonSuccess(btn, state, successText = 'Done!', duration = 1500) {
  btn.classList.remove('loading');
  btn.classList.add('success');

  if (state.iconElement) {
    state.iconElement.innerHTML = '';
    state.iconElement.classList.remove('spinner-icon');
    state.iconElement.textContent = '✓';
  }
  if (state.titleElement) {
    state.titleElement.textContent = successText;
  }

  await new Promise(resolve => setTimeout(resolve, duration));

  btn.classList.remove('success');
  btn.disabled = false;
  if (state.iconElement) {
    state.iconElement.innerHTML = state.originalIconHTML;
  }
  if (state.titleElement) {
    state.titleElement.textContent = state.originalTitleText;
  }
}

// Button click handlers
document.getElementById('groupByDomainBtn').addEventListener('click', async () => {
  const btn = document.getElementById('groupByDomainBtn');
  const state = setButtonLoading(btn, true, 'Grouping...');

  try {
    await saveUndoState('group-by-domain');
    await ungroupAllTabs();

    const tabs = await chrome.tabs.query({ currentWindow: true });
    const groupedTabs = groupTabsByDomain(tabs);

    await createTabGroups(groupedTabs);
    await loadActiveGroups();

    const { showNotifications } = await chrome.storage.local.get(['showNotifications']);
    if (showNotifications !== false) {
      showToast('Tabs grouped by domain', 'success');
    }

    // Show success checkmark animation
    await showButtonSuccess(btn, state, 'Grouped!');
  } catch (error) {
    console.error('[Popup] Error grouping by domain:', error);
    showToast('Failed to group tabs. Please try again.', 'error');
    await loadActiveGroups();
    restoreButton(btn, state);
  } finally {
    await updateTabCount();
  }
});

document.getElementById('groupByTypeBtn').addEventListener('click', async () => {
  const btn = document.getElementById('groupByTypeBtn');
  const state = setButtonLoading(btn, true, 'Grouping...');

  try {
    await saveUndoState('group-by-type');
    await ungroupAllTabs();

    const tabs = await chrome.tabs.query({ currentWindow: true });
    const validTabs = tabs.filter(tab =>
      tab.url &&
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('chrome-extension://') &&
      !tab.url.startsWith('about:') &&
      !tab.url.startsWith('data:')
    );

    const groupedTabs = groupTabsByType(validTabs);
    await createTabGroupsByType(groupedTabs);
    await loadActiveGroups();

    const groupCount = Object.keys(groupedTabs).filter(cat => groupedTabs[cat].length > 0).length;
    const { showNotifications } = await chrome.storage.local.get(['showNotifications']);
    if (showNotifications !== false) {
      showToast(`Tabs grouped into ${groupCount} categories`, 'success');
    }

    // Show success checkmark animation
    await showButtonSuccess(btn, state, 'Grouped!');
  } catch (error) {
    console.error('[Popup] Error grouping by type:', error);
    showToast('Failed to group tabs. Please try again.', 'error');
    await loadActiveGroups();
    restoreButton(btn, state);
  }
});

document.getElementById('ungroupAllBtn').addEventListener('click', async () => {
  const btn = document.getElementById('ungroupAllBtn');
  const iconEl = btn.querySelector('.secondary-icon');
  const originalIcon = iconEl ? iconEl.textContent : '';

  try {
    btn.disabled = true;
    btn.classList.add('loading');
    if (iconEl) iconEl.textContent = '⟳';

    await saveUndoState('ungroup-all');
    await ungroupAllTabs();
    await loadActiveGroups();
    await updateTabCount();
    showToast('All tabs ungrouped', 'success');

    // Show success checkmark
    btn.classList.remove('loading');
    btn.classList.add('success');
    if (iconEl) iconEl.textContent = '✓';

    await new Promise(resolve => setTimeout(resolve, 1500));

    btn.classList.remove('success');
    if (iconEl) iconEl.textContent = originalIcon;
    btn.disabled = false;
  } catch (error) {
    console.error('[Popup] Error ungrouping tabs:', error);
    showToast('Failed to ungroup tabs. Please try again.', 'error');
    await loadActiveGroups();
    btn.classList.remove('loading');
    if (iconEl) iconEl.textContent = originalIcon;
    btn.disabled = false;
  }
});

document.getElementById('newGroupBtn').addEventListener('click', async () => {
  const btn = document.getElementById('newGroupBtn');
  const iconEl = btn.querySelector('.secondary-icon');
  const originalIcon = iconEl ? iconEl.textContent : '';

  try {
    btn.disabled = true;
    if (iconEl) iconEl.textContent = '⟳';

    await createEmptyGroup('New Group');
    await loadActiveGroups();
    showToast('New group created', 'success');

    // Show success checkmark
    btn.classList.add('success');
    if (iconEl) iconEl.textContent = '✓';

    await new Promise(resolve => setTimeout(resolve, 1500));

    btn.classList.remove('success');
    if (iconEl) iconEl.textContent = originalIcon;
    btn.disabled = false;
  } catch (error) {
    console.error('[Popup] Error creating new group:', error);
    showToast('Failed to create group. Make sure you have at least one tab open.', 'error');
    if (iconEl) iconEl.textContent = originalIcon;
    btn.disabled = false;
  }
});

document.getElementById('newDividerBtn').addEventListener('click', async () => {
  const btn = document.getElementById('newDividerBtn');
  const iconEl = btn.querySelector('.secondary-icon');
  const originalIcon = iconEl ? iconEl.textContent : '';

  try {
    btn.disabled = true;
    if (iconEl) iconEl.textContent = '⟳';

    const dividerTab = await chrome.tabs.create({
      url: chrome.runtime.getURL('divider/divider.html'),
      active: false
    });

    const groupId = await chrome.tabs.group({ tabIds: [dividerTab.id] });

    await chrome.tabGroups.update(groupId, {
      title: "───",
      color: "purple",
      collapsed: true
    });

    await loadActiveGroups();
    await updateTabCount();
    showToast('Divider created! Keep it collapsed to maintain the separator look.', 'info');

    // Show success checkmark
    btn.classList.add('success');
    if (iconEl) iconEl.textContent = '✓';

    await new Promise(resolve => setTimeout(resolve, 1500));

    btn.classList.remove('success');
    if (iconEl) iconEl.textContent = originalIcon;
    btn.disabled = false;
  } catch (error) {
    console.error('[Popup] Error creating divider:', error);
    showToast('Failed to create divider. Please try again.', 'error');
    await loadActiveGroups();
    if (iconEl) iconEl.textContent = originalIcon;
    btn.disabled = false;
  }
});

document.getElementById('saveSessionBtn').addEventListener('click', async () => {
  const sessionName = await showSaveSessionModal();

  if (!sessionName) {
    return;
  }

  const btn = document.getElementById('saveSessionBtn');
  const iconEl = btn.querySelector('.secondary-icon');
  const textEl = btn.querySelector('span:not(.secondary-icon)');
  const originalIcon = iconEl ? iconEl.textContent : '';
  const originalText = textEl ? textEl.textContent : '';

  btn.disabled = true;
  btn.classList.add('loading');
  if (iconEl) iconEl.textContent = '⟳';
  if (textEl) textEl.textContent = 'Saving...';

  try {
    showToast('Saving session...', 'info');

    await saveCurrentSession(sessionName);
    await loadSavedSessions();
    showToast('Session saved!', 'success');

    // Show success checkmark
    btn.classList.remove('loading');
    btn.classList.add('success');
    if (iconEl) iconEl.textContent = '✓';
    if (textEl) textEl.textContent = 'Saved!';

    await new Promise(resolve => setTimeout(resolve, 1500));

    btn.classList.remove('success');
    if (iconEl) iconEl.textContent = originalIcon;
    if (textEl) textEl.textContent = originalText;
    btn.disabled = false;
  } catch (error) {
    console.error('[Popup] Error saving session:', error);
    showToast('Could not save session. Storage might be full.', 'error');
    btn.classList.remove('loading');
    if (iconEl) iconEl.textContent = originalIcon;
    if (textEl) textEl.textContent = originalText;
    btn.disabled = false;
  }
});

// Settings button - open options page
document.getElementById('settingsBtn').addEventListener('click', () => {
  try {
    chrome.runtime.openOptionsPage();
  } catch (error) {
    console.error('[Popup] Error opening options page:', error);
    showToast('Failed to open settings. Please try again.', 'error');
  }
});

// Tip banner dismissal
chrome.storage.local.get(['tipDismissed'], (result) => {
  if (result.tipDismissed) {
    const tipBanner = document.getElementById('tip-banner');
    if (tipBanner) {
      tipBanner.style.display = 'none';
    }
  }
});

document.getElementById('dismiss-tip')?.addEventListener('click', async () => {
  try {
    const tipBanner = document.getElementById('tip-banner');
    if (tipBanner) {
      tipBanner.style.display = 'none';
      await chrome.storage.local.set({ tipDismissed: true });
    }
  } catch (error) {
    console.error('[Popup] Error dismissing tip:', error);
    const tipBanner = document.getElementById('tip-banner');
    if (tipBanner) {
      tipBanner.style.display = 'none';
    }
  }
});

// ============================
// Tab Scrolling Feature
// ============================

/**
 * Initialize the tab scrolling section
 * Reads saved state from storage, wires up toggle/collapse/scroll handlers
 * @returns {Promise<void>}
 */
async function initTabScrolling() {
  try {
    const section = document.getElementById('tabScrollSection');
    const toggle = document.getElementById('tabScrollToggle');
    const body = document.getElementById('tabScrollBody');
    const header = document.getElementById('tabScrollHeader');
    const toggleLabel = document.getElementById('tabScrollToggleLabel');
    const scrollLeftBtn = document.getElementById('scrollLeftBtn');
    const scrollRightBtn = document.getElementById('scrollRightBtn');
    const tabStrip = document.getElementById('tabStrip');

    if (!section || !toggle || !body || !header) return;

    // Read saved state
    const { tabScrollEnabled, tabScrollCollapsed } = await chrome.storage.local.get([
      'tabScrollEnabled',
      'tabScrollCollapsed'
    ]);

    // Default enabled to false (off by default)
    const isEnabled = tabScrollEnabled === true;
    const isCollapsed = tabScrollCollapsed !== false;

    toggle.checked = isEnabled;
    if (isCollapsed) {
      section.classList.add('collapsed');
    } else {
      section.classList.remove('collapsed');
    }
    if (!isEnabled) {
      body.classList.add('disabled');
    }

    // Toggle handler
    addTrackedEventListener(toggle, 'change', async (e) => {
      e.stopPropagation(); // Prevent header click from firing
      const enabled = toggle.checked;
      try {
        await chrome.storage.local.set({ tabScrollEnabled: enabled });
      } catch (error) {
        console.error('[Popup] Error saving tab scroll toggle:', error);
      }
      if (enabled) {
        body.classList.remove('disabled');
        // Auto-expand when enabling
        section.classList.remove('collapsed');
        await chrome.storage.local.set({ tabScrollCollapsed: false });
        await renderTabStrip();
      } else {
        body.classList.add('disabled');
      }
    });

    // Prevent toggle label click from bubbling to header
    if (toggleLabel) {
      addTrackedEventListener(toggleLabel, 'click', (e) => {
        e.stopPropagation();
      });
    }

    // Collapse handler — entire header row is clickable
    addTrackedEventListener(header, 'click', async () => {
      section.classList.toggle('collapsed');
      const collapsed = section.classList.contains('collapsed');
      try {
        await chrome.storage.local.set({ tabScrollCollapsed: collapsed });
      } catch (error) {
        console.error('[Popup] Error saving tab scroll collapse:', error);
      }
    });

    // Scroll arrow handlers
    addTrackedEventListener(scrollLeftBtn, 'click', () => {
      tabStrip.scrollBy({ left: -150, behavior: 'smooth' });
    });

    addTrackedEventListener(scrollRightBtn, 'click', () => {
      tabStrip.scrollBy({ left: 150, behavior: 'smooth' });
    });

    // Update arrow visibility on scroll
    addTrackedEventListener(tabStrip, 'scroll', () => {
      updateScrollArrows(tabStrip, scrollLeftBtn, scrollRightBtn);
    });

    // Render if enabled and not collapsed
    if (isEnabled) {
      await renderTabStrip();
    }

    // Keyboard arrow navigation when hovering the tab strip
    const tabStripContainer = section.querySelector('.tab-strip-container');
    let tabStripHovered = false;
    if (tabStripContainer) {
      addTrackedEventListener(tabStripContainer, 'mouseenter', () => {
        tabStripHovered = true;
      });
      addTrackedEventListener(tabStripContainer, 'mouseleave', () => {
        tabStripHovered = false;
      });

      addTrackedEventListener(document, 'keydown', (e) => {
        if (!tabStripHovered) return;
        const key = e.key;
        if (key === 'ArrowLeft') {
          e.preventDefault();
          tabStrip.scrollBy({ left: -120, behavior: 'smooth' });
          updateScrollArrows(tabStrip, scrollLeftBtn, scrollRightBtn);
        } else if (key === 'ArrowRight') {
          e.preventDefault();
          tabStrip.scrollBy({ left: 120, behavior: 'smooth' });
          updateScrollArrows(tabStrip, scrollLeftBtn, scrollRightBtn);
        }
      });
    }
  } catch (error) {
    console.error('[Popup] Error initializing tab scrolling:', error);
  }
}

/**
 * Show or hide scroll arrow buttons based on scroll position
 * @param {HTMLElement} strip - The tab strip element
 * @param {HTMLElement} leftBtn - Left arrow button
 * @param {HTMLElement} rightBtn - Right arrow button
 */
function updateScrollArrows(strip, leftBtn, rightBtn) {
  const scrollLeft = strip.scrollLeft;
  const maxScroll = strip.scrollWidth - strip.clientWidth;

  if (scrollLeft > 4) {
    leftBtn.classList.add('visible');
  } else {
    leftBtn.classList.remove('visible');
  }

  if (maxScroll - scrollLeft > 4) {
    rightBtn.classList.add('visible');
  } else {
    rightBtn.classList.remove('visible');
  }
}

/**
 * Render the horizontal tab strip with all tabs in the current window
 * @returns {Promise<void>}
 */
async function renderTabStrip() {
  const tabStrip = document.getElementById('tabStrip');
  const scrollLeftBtn = document.getElementById('scrollLeftBtn');
  const scrollRightBtn = document.getElementById('scrollRightBtn');

  if (!tabStrip) return;

  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });

    // Clear existing items
    tabStrip.innerHTML = '';

    for (const tab of tabs) {
      const item = createTabStripItem(tab);
      tabStrip.appendChild(item);
    }

    // Scroll active tab into view
    const activeItem = tabStrip.querySelector('.tab-strip-item.active');
    if (activeItem) {
      // Use requestAnimationFrame to ensure layout is computed
      requestAnimationFrame(() => {
        activeItem.scrollIntoView({ inline: 'center', behavior: 'instant' });
        // Update arrows after scroll
        setTimeout(() => {
          updateScrollArrows(tabStrip, scrollLeftBtn, scrollRightBtn);
        }, 50);
      });
    } else {
      updateScrollArrows(tabStrip, scrollLeftBtn, scrollRightBtn);
    }
  } catch (error) {
    console.error('[Popup] Error rendering tab strip:', error);
  }
}

/**
 * Create a single tab item element for the tab strip
 * Uses safe DOM methods (no innerHTML with user data)
 * @param {chrome.tabs.Tab} tab - Chrome tab object
 * @returns {HTMLElement} Tab strip item element
 */
function createTabStripItem(tab) {
  const item = document.createElement('div');
  item.className = 'tab-strip-item';
  if (tab.active) {
    item.classList.add('active');
  }
  item.title = tab.title || '';

  // Favicon
  if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
    const img = document.createElement('img');
    img.className = 'tab-strip-favicon';
    img.src = tab.favIconUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      // Replace broken image with fallback
      const fallback = createFaviconFallback();
      img.replaceWith(fallback);
    });
    item.appendChild(img);
  } else {
    item.appendChild(createFaviconFallback());
  }

  // Title
  const titleSpan = document.createElement('span');
  titleSpan.className = 'tab-strip-title';
  titleSpan.textContent = sanitizeText(tab.title || 'New Tab');
  item.appendChild(titleSpan);

  // Click to switch tab
  addTrackedEventListener(item, 'click', () => {
    switchToTab(tab.id, item);
  });

  return item;
}

/**
 * Create a fallback icon element when favicon is unavailable
 * @returns {HTMLElement} Fallback element
 */
function createFaviconFallback() {
  const fallback = document.createElement('div');
  fallback.className = 'tab-strip-favicon-fallback';
  fallback.textContent = '⊙';
  return fallback;
}

/**
 * Switch to a tab and update the active highlight in the strip
 * @param {number} tabId - Chrome tab ID
 * @param {HTMLElement} clickedItem - The clicked tab strip item element
 */
async function switchToTab(tabId, clickedItem) {
  try {
    // Update active highlight immediately for visual feedback
    const tabStrip = document.getElementById('tabStrip');
    if (tabStrip) {
      const currentActive = tabStrip.querySelector('.tab-strip-item.active');
      if (currentActive) {
        currentActive.classList.remove('active');
      }
      clickedItem.classList.add('active');
      clickedItem.scrollIntoView({ inline: 'center', behavior: 'smooth' });
    }

    // Brief delay so the user sees the highlight before the popup closes
    await new Promise(resolve => setTimeout(resolve, 150));
    await chrome.tabs.update(tabId, { active: true });
  } catch (error) {
    console.error('[Popup] Error switching tab:', error);
    showToast('Could not switch to tab', 'error');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}
