/**
 * Session Manager - Version 1.0.0
 * Handles session save/restore with full group preservation
 * @fileoverview Session management utilities with storage quota checks
 */

/** @constant {number} Storage quota limit in bytes (10 MB) */
const STORAGE_QUOTA = 10 * 1024 * 1024;

/** @constant {number} Warning threshold as percentage of quota */
const STORAGE_WARNING_THRESHOLD = 0.9;

/**
 * Check available storage space
 * @returns {Promise<{bytesInUse: number, available: number, percentUsed: number}>}
 */
async function checkStorageQuota() {
  try {
    const bytesInUse = await chrome.storage.local.getBytesInUse();
    const available = STORAGE_QUOTA - bytesInUse;
    const percentUsed = bytesInUse / STORAGE_QUOTA;
    return { bytesInUse, available, percentUsed };
  } catch (error) {
    console.warn('[SessionManager] Could not check storage quota:', error);
    return { bytesInUse: 0, available: STORAGE_QUOTA, percentUsed: 0 };
  }
}

/**
 * Estimate the size of a session object in bytes
 * @param {Object} sessionData - Session data to estimate
 * @returns {number} Estimated size in bytes
 */
function estimateSessionSize(sessionData) {
  try {
    return JSON.stringify(sessionData).length * 2; // UTF-16 encoding
  } catch (error) {
    return 0;
  }
}

/**
 * Save current session to storage
 * @param {string} sessionName - Name for the session
 * @returns {Promise<string>} Session ID
 * @throws {Error} If storage fails or quota exceeded
 */
async function saveCurrentSession(sessionName) {
  try {
    // Test storage access first
    try {
      await chrome.storage.local.set({ _test: 'test' });
      await chrome.storage.local.remove('_test');
    } catch (storageError) {
      console.error('[SessionManager] Storage access failed:', storageError);
      throw new Error('Cannot access storage. Check permissions.');
    }

    const windows = await chrome.windows.getAll({ populate: true });

    const sessionData = {
      id: Date.now().toString(),
      name: sessionName,
      timestamp: Date.now(),
      windows: [],
      groups: []
    };

    // Collect all groups and their tabs
    const groupMap = new Map();

    for (const window of windows) {
      const windowData = {
        id: window.id,
        tabs: []
      };

      if (window.tabs) {
        for (const tab of window.tabs) {
          // Skip chrome:// and extension pages as they can't be restored
          if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
            continue;
          }

          const tabData = {
            url: tab.url,
            title: tab.title || 'Untitled',
            pinned: tab.pinned || false,
            active: tab.active || false,
            originalGroupId: tab.groupId !== chrome.tabs.TAB_ID_NONE ? tab.groupId : null
          };

          windowData.tabs.push(tabData);

          // Collect group information
          if (tab.groupId !== chrome.tabs.TAB_ID_NONE) {
            if (!groupMap.has(tab.groupId)) {
              try {
                const group = await chrome.tabGroups.get(tab.groupId);
                groupMap.set(tab.groupId, {
                  originalId: group.id,
                  title: group.title || 'Untitled Group',
                  color: group.color || 'grey',
                  collapsed: group.collapsed || false,
                  tabUrls: []
                });
              } catch (error) {
                console.warn('[SessionManager] Error getting group info:', error);
              }
            }

            const groupInfo = groupMap.get(tab.groupId);
            if (groupInfo && tab.url) {
              groupInfo.tabUrls.push(tab.url);
            }
          }
        }
      }

      if (windowData.tabs.length > 0) {
        sessionData.windows.push(windowData);
      }
    }

    // Convert group map to array
    sessionData.groups = Array.from(groupMap.values());

    // Check storage quota before saving
    const { available, percentUsed } = await checkStorageQuota();
    const estimatedSize = estimateSessionSize(sessionData);

    if (estimatedSize > available) {
      throw new Error('Storage quota exceeded. Please delete old sessions or export and clear.');
    }

    if (percentUsed > STORAGE_WARNING_THRESHOLD) {
      console.warn('[SessionManager] Storage is nearly full:', Math.round(percentUsed * 100) + '%');
    }

    // Save to storage
    try {
      const result = await chrome.storage.local.get('sessions');
      const sessions = result.sessions || [];
      sessions.push(sessionData);

      await chrome.storage.local.set({ sessions: sessions });

      return sessionData.id;
    } catch (storageError) {
      console.error('[SessionManager] Storage error:', storageError);
      if (storageError.message && (storageError.message.includes('QUOTA') || storageError.message.includes('quota'))) {
        throw new Error('Storage quota exceeded. Please delete old sessions.');
      }
      throw new Error('Could not save session. Storage might be full.');
    }
  } catch (error) {
    console.error('[SessionManager] Error saving session:', error);
    if (error.message && (error.message.includes('Could not') || error.message.includes('Storage') || error.message.includes('quota'))) {
      throw error;
    }
    throw new Error('Could not save session. Storage might be full.');
  }
}

/**
 * Get all saved sessions sorted by timestamp
 * @returns {Promise<Array>} Array of session objects
 */
async function getAllSessions() {
  try {
    const result = await chrome.storage.local.get('sessions');
    const sessions = result.sessions || [];

    // Sort by timestamp (newest first)
    const sorted = sessions.sort((a, b) => b.timestamp - a.timestamp);
    return sorted;
  } catch (error) {
    console.error('[SessionManager] Error getting sessions:', error);
    return [];
  }
}

/**
 * Validate session data structure
 * @param {Object} session - Session object to validate
 * @returns {boolean} True if valid
 */
function validateSession(session) {
  if (!session) return false;
  if (typeof session.id !== 'string') return false;
  if (typeof session.name !== 'string') return false;
  if (typeof session.timestamp !== 'number') return false;
  if (!session.windows && !session.groups) return false;

  // Check if session has any tabs
  let hasTabs = false;
  if (session.windows && Array.isArray(session.windows) && session.windows.length > 0) {
    for (const windowData of session.windows) {
      if (windowData.tabs && Array.isArray(windowData.tabs) && windowData.tabs.length > 0) {
        hasTabs = true;
        break;
      }
    }
  }

  if (!hasTabs && (!session.groups || session.groups.length === 0)) {
    return false;
  }

  return true;
}

/**
 * Wait for tabs to be created in a window with improved reliability
 * @param {number} windowId - Window ID
 * @param {number} expectedCount - Expected number of tabs
 * @param {number} maxWait - Maximum wait time in ms
 * @returns {Promise<Array>} Array of tab objects
 */
async function waitForTabs(windowId, expectedCount, maxWait = 10000) {
  try {
    const startTime = Date.now();
    let lastTabCount = 0;
    let stableCount = 0;

    while (Date.now() - startTime < maxWait) {
      try {
        const tabs = await chrome.tabs.query({ windowId: windowId });

        // Check if we have all expected tabs
        if (tabs.length >= expectedCount) {
          // Wait for tabs to have URLs (not just pending)
          const tabsWithUrls = tabs.filter(tab => tab.url || tab.pendingUrl);
          if (tabsWithUrls.length >= expectedCount) {
            return tabs;
          }
        }

        // Check if tab count is stable (no new tabs being created)
        if (tabs.length === lastTabCount) {
          stableCount++;
          // If stable for 3 checks (~600ms), return what we have
          if (stableCount >= 3 && tabs.length > 0) {
            return tabs;
          }
        } else {
          stableCount = 0;
          lastTabCount = tabs.length;
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.warn('[SessionManager] Error querying tabs in waitForTabs:', error);
        break;
      }
    }

    // Return whatever tabs we have after timeout
    return await chrome.tabs.query({ windowId: windowId });
  } catch (error) {
    console.error('[SessionManager] Error in waitForTabs:', error);
    return [];
  }
}

/**
 * Find a tab by URL with fuzzy matching
 * @param {Array} tabs - Array of tab objects
 * @param {string} targetUrl - URL to find
 * @returns {Object|null} Matching tab or null
 */
function findTabByUrl(tabs, targetUrl) {
  // Exact match first
  let tab = tabs.find(t => t.url === targetUrl);
  if (tab) return tab;

  // Match with pendingUrl
  tab = tabs.find(t => t.pendingUrl === targetUrl);
  if (tab) return tab;

  // Try without protocol
  const normalizeUrl = (url) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname + parsed.pathname + parsed.search;
    } catch {
      return url;
    }
  };

  const normalizedTarget = normalizeUrl(targetUrl);
  tab = tabs.find(t => {
    const normalizedTab = normalizeUrl(t.url || t.pendingUrl || '');
    return normalizedTab === normalizedTarget;
  });

  return tab || null;
}

/**
 * Restore a saved session
 * @param {string} sessionId - Session ID to restore
 * @returns {Promise<void>}
 * @throws {Error} If session not found or restoration fails
 */
async function restoreSession(sessionId) {
  try {
    const sessions = await getAllSessions();
    const session = sessions.find(s => s.id === sessionId);

    if (!session) {
      throw new Error('Session not found');
    }

    if (!validateSession(session)) {
      throw new Error('Invalid or empty session');
    }

    // Create new window with tabs
    for (const windowData of session.windows) {
      const tabUrls = windowData.tabs
        .map(tab => tab.url)
        .filter(url => url && !url.startsWith('chrome://') && !url.startsWith('chrome-extension://'));

      if (tabUrls.length === 0) {
        continue;
      }

      // Create window with first tab
      const firstTabUrl = tabUrls[0];
      const remainingUrls = tabUrls.slice(1);

      const window = await chrome.windows.create({
        url: firstTabUrl,
        focused: false
      });

      // Create remaining tabs in parallel for faster restoration
      if (remainingUrls.length > 0) {
        const tabPromises = remainingUrls.map(url =>
          chrome.tabs.create({
            windowId: window.id,
            url: url,
            active: false
          }).catch(error => {
            console.warn('[SessionManager] Error creating tab:', error);
            return null;
          })
        );
        await Promise.all(tabPromises);
      }

      // Wait for tabs to load with improved reliability
      const createdTabs = await waitForTabs(window.id, tabUrls.length);

      // Restore pinned state before grouping
      try {
        for (const originalTab of windowData.tabs) {
          if (originalTab.pinned) {
            const createdTab = findTabByUrl(createdTabs, originalTab.url);
            if (createdTab) {
              try {
                await chrome.tabs.update(createdTab.id, { pinned: true });
              } catch (error) {
                console.warn('[SessionManager] Error pinning tab:', error);
              }
            }
          }
        }
      } catch (error) {
        console.warn('[SessionManager] Error restoring pinned state:', error);
      }

      // Refresh tabs after pinning (pinned tabs may have moved)
      const updatedTabs = await chrome.tabs.query({ windowId: window.id });

      // Restore groups
      if (session.groups && session.groups.length > 0) {
        for (const groupData of session.groups) {
          const groupTabIds = [];

          for (const tabUrl of groupData.tabUrls) {
            const matchingTab = findTabByUrl(updatedTabs, tabUrl);
            if (matchingTab && !matchingTab.pinned) {
              groupTabIds.push(matchingTab.id);
            }
          }

          if (groupTabIds.length > 0) {
            try {
              const groupId = await chrome.tabs.group({
                tabIds: groupTabIds,
                windowId: window.id
              });

              await chrome.tabGroups.update(groupId, {
                title: groupData.title || 'Restored Group',
                color: groupData.color || 'grey',
                collapsed: groupData.collapsed || false
              });
            } catch (error) {
              console.error('[SessionManager] Error restoring group:', error);
            }
          } else {
            console.warn('[SessionManager] No tabs found for group:', groupData.title);
          }
        }
      }

      // Restore active tab
      try {
        for (const originalTab of windowData.tabs) {
          if (originalTab.active) {
            const createdTab = findTabByUrl(updatedTabs, originalTab.url);
            if (createdTab) {
              await chrome.tabs.update(createdTab.id, { active: true });
              break;
            }
          }
        }
      } catch (error) {
        console.warn('[SessionManager] Error restoring active tab:', error);
      }
    }
  } catch (error) {
    console.error('[SessionManager] Error restoring session:', error);
    if (error.message && (error.message.includes('Session not found') || error.message.includes('Invalid') || error.message.includes('Failed to restore'))) {
      throw error;
    }
    throw new Error('Failed to restore session. Some tabs may be unavailable.');
  }
}

/**
 * Delete a saved session
 * @param {string} sessionId - Session ID to delete
 * @returns {Promise<void>}
 * @throws {Error} If deletion fails
 */
async function deleteSession(sessionId) {
  try {
    const sessions = await getAllSessions();
    const filtered = sessions.filter(s => s.id !== sessionId);
    await chrome.storage.local.set({ sessions: filtered });
  } catch (error) {
    console.error('[SessionManager] Error deleting session:', error);
    throw new Error('Failed to delete session. Please try again.');
  }
}

/**
 * Clean up old recovery sessions (keep only last N)
 * @param {number} maxCount - Maximum number of recovery sessions to keep
 * @returns {Promise<void>}
 */
async function cleanupRecoverySessions(maxCount = 3) {
  try {
    const sessions = await getAllSessions();
    const recoverySessions = sessions
      .filter(s => s.name && s.name.startsWith('Recovery ('))
      .sort((a, b) => b.timestamp - a.timestamp);

    if (recoverySessions.length > maxCount) {
      const toDelete = recoverySessions.slice(maxCount);
      const remainingSessions = sessions.filter(s =>
        !toDelete.find(ds => ds.id === s.id)
      );

      await chrome.storage.local.set({ sessions: remainingSessions });
    }
  } catch (error) {
    console.error('[SessionManager] Error cleaning up recovery sessions:', error);
  }
}
