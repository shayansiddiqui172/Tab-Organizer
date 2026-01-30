// Background Service Worker - Version 1.0.0
// Auto-saves recovery sessions when windows close

// Save session when window is removed
// Inline functions to work in service worker context

async function saveCurrentSessionInline(sessionName) {
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    const sessionData = {
      id: Date.now().toString(),
      name: sessionName,
      timestamp: Date.now(),
      windows: [],
      groups: []
    };
    
    const groupMap = new Map();
    
    for (const window of windows) {
      try {
        const windowData = {
          id: window.id,
          tabs: []
        };
        
        if (window.tabs) {
          for (const tab of window.tabs) {
            try {
              const tabData = {
                id: tab.id,
                url: tab.url,
                title: tab.title,
                pinned: tab.pinned,
                active: tab.active,
                groupId: tab.groupId !== chrome.tabs.TAB_ID_NONE ? tab.groupId : null
              };
              
              windowData.tabs.push(tabData);
              
              if (tab.groupId !== chrome.tabs.TAB_ID_NONE) {
                if (!groupMap.has(tab.groupId)) {
                  try {
                    const group = await chrome.tabGroups.get(tab.groupId);
                    groupMap.set(tab.groupId, {
                      id: group.id,
                      title: group.title,
                      color: group.color,
                      collapsed: group.collapsed,
                      tabIds: []
                    });
                  } catch (error) {
                    console.warn('[Background] Error getting group info:', error);
                    // Continue without this group's metadata
                  }
                }
                
                const groupInfo = groupMap.get(tab.groupId);
                if (groupInfo) {
                  groupInfo.tabIds.push(tab.id);
                }
              }
            } catch (error) {
              console.warn('[Background] Error processing tab:', error);
              // Continue with other tabs
            }
          }
        }
        
        sessionData.windows.push(windowData);
      } catch (error) {
        console.warn('[Background] Error processing window:', error);
        // Continue with other windows
      }
    }
    
    sessionData.groups = Array.from(groupMap.values());
    
    try {
      const result = await chrome.storage.local.get('sessions');
      const sessions = result.sessions || [];
      sessions.push(sessionData);
      
      await chrome.storage.local.set({ sessions: sessions });
    } catch (storageError) {
      console.error('[Background] Storage error saving session:', storageError);
      // If storage fails, still return the session ID but log the error
      // The session won't be saved but we won't crash
    }
    
    return sessionData.id;
  } catch (error) {
    console.error('[Background] Error saving session:', error);
    // Don't throw - background errors should be logged but not crash the extension
    return null;
  }
}

async function cleanupRecoverySessionsInline() {
  try {
    const result = await chrome.storage.local.get('sessions');
    const sessions = result.sessions || [];
    
    const recoverySessions = sessions
      .filter(s => s.name && s.name.startsWith('Recovery ('))
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (recoverySessions.length > 3) {
      const toDelete = recoverySessions.slice(3);
      const remainingSessions = sessions.filter(s => 
        !toDelete.find(ds => ds.id === s.id)
      );
      
      await chrome.storage.local.set({ sessions: remainingSessions });
    }
  } catch (error) {
    console.error('[Background] Error cleaning up recovery sessions:', error);
    // Fail silently - cleanup is not critical
  }
}

// Auto-save functionality
let autoSaveInterval = null;

async function setupAutoSaveTimer() {
  try {
    const { autoSaveEnabled, autoSaveInterval: interval } = await chrome.storage.local.get([
      'autoSaveEnabled',
      'autoSaveInterval'
    ]);
    
    // Clear existing timer
    if (autoSaveInterval) {
      clearInterval(autoSaveInterval);
      autoSaveInterval = null;
    }
    
    // Set up new timer if enabled
    if (autoSaveEnabled !== false) {
      const minutes = interval || 5;
      autoSaveInterval = setInterval(async () => {
        try {
          await autoSaveSession();
        } catch (error) {
          console.error('[Background] Error in auto-save timer callback:', error);
          // Continue running - don't crash the timer
        }
      }, minutes * 60 * 1000);
    }
  } catch (error) {
    console.error('[Background] Error setting up auto-save timer:', error);
    // Continue without auto-save if setup fails
  }
}

async function autoSaveSession() {
  try {
    const { showNotifications } = await chrome.storage.local.get(['showNotifications']);
    const timestamp = new Date().toLocaleString();
    const sessionName = `Auto-save (${timestamp})`;
    
    await saveCurrentSessionInline(sessionName);
    
    // Clean up old auto-save sessions (keep last 5)
    try {
      const { sessions } = await chrome.storage.local.get(['sessions']);
      if (sessions) {
        const autoSaveSessions = sessions
          .filter(s => s.name && s.name.startsWith('Auto-save ('))
          .sort((a, b) => b.timestamp - a.timestamp);
        
        if (autoSaveSessions.length > 5) {
          const toDelete = autoSaveSessions.slice(5);
          const remainingSessions = sessions.filter(s => 
            !toDelete.find(ds => ds.id === s.id)
          );
          await chrome.storage.local.set({ sessions: remainingSessions });
        }
      }
    } catch (cleanupError) {
      console.warn('[Background] Error cleaning up auto-save sessions:', cleanupError);
      // Continue - cleanup failure is not critical
    }
    
    if (showNotifications !== false) {
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon48.png'),
          title: 'Session Auto-Saved',
          message: 'Your tabs have been automatically saved'
        }).catch(() => {
          // Fail silently - notification is not critical
        });
      } catch (notifError) {
        console.warn('[Background] Error creating notification:', notifError);
        // Continue - notification failure is not critical
      }
    }
  } catch (error) {
    console.error('[Background] Auto-save failed:', error);
    // Fail silently - auto-save is a background operation
  }
}

// Setup auto-save on extension load
chrome.runtime.onInstalled.addListener(() => {
  try {
    setupAutoSaveTimer();
  } catch (error) {
    console.error('[Background] Error in onInstalled listener:', error);
  }
});

chrome.runtime.onStartup.addListener(() => {
  try {
    setupAutoSaveTimer();
  } catch (error) {
    console.error('[Background] Error in onStartup listener:', error);
  }
});

// Listen for messages from options page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === 'updateAutoSave' || message.type === 'setupAutoSave') {
      setupAutoSaveTimer();
      sendResponse({ success: true });
    }
    return true;
  } catch (error) {
    console.error('[Background] Error in message listener:', error);
    sendResponse({ success: false, error: error.message });
    return true;
  }
});

// Update the window removal listener to use inline functions
chrome.windows.onRemoved.addListener(async (windowId) => {
  try {
    const { crashRecoveryEnabled } = await chrome.storage.local.get(['crashRecoveryEnabled']);
    
    if (crashRecoveryEnabled !== false) {
      try {
        const windows = await chrome.windows.getAll({ populate: true });
        
        if (windows.length > 0) {
          const timestamp = new Date().toLocaleString();
          const sessionName = `Recovery (${timestamp})`;
          
          await saveCurrentSessionInline(sessionName);
          
          // Clean up recovery sessions based on max count
          try {
            const { maxRecoverySessions } = await chrome.storage.local.get(['maxRecoverySessions']);
            const maxCount = maxRecoverySessions || 3;
            
            const { sessions } = await chrome.storage.local.get(['sessions']);
            if (sessions) {
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
            }
          } catch (cleanupError) {
            console.warn('[Background] Error cleaning up recovery sessions:', cleanupError);
            // Continue - cleanup failure is not critical
          }
        }
      } catch (saveError) {
        console.error('[Background] Error saving recovery session:', saveError);
        // Fail silently - recovery save is not critical
      }
    }
  } catch (error) {
    console.error('[Background] Error in window removal listener:', error);
    // Fail silently - don't crash the extension
  }
});

// Undo Manager inline functions
async function captureCurrentGroupsInline() {
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    const state = { windows: [] };
    
    for (const window of windows) {
      try {
        const windowState = {
          id: window.id,
          tabs: [],
          groups: []
        };
        
        if (window.tabs) {
          for (const tab of window.tabs) {
            try {
              windowState.tabs.push({
                id: tab.id,
                url: tab.url,
                title: tab.title,
                groupId: tab.groupId !== chrome.tabs.TAB_ID_NONE ? tab.groupId : null,
                index: tab.index,
                pinned: tab.pinned
              });
            } catch (error) {
              console.warn('[Background] Error processing tab:', error);
              // Continue with other tabs
            }
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
              console.warn('[Background] Error getting group:', error);
              // Continue with other groups
            }
          }
        }
        
        state.windows.push(windowState);
      } catch (error) {
        console.warn('[Background] Error processing window:', error);
        // Continue with other windows
      }
    }
    
    return state;
  } catch (error) {
    console.error('[Background] Error capturing current groups:', error);
    return { windows: [] };
  }
}

async function saveUndoStateInline(actionType) {
  try {
    const result = await chrome.storage.local.get('undoHistory');
    const history = result.undoHistory || [];
    
    const state = {
      type: actionType,
      timestamp: Date.now(),
      previousGroups: await captureCurrentGroupsInline()
    };
    
    history.push(state);
    
    if (history.length > 20) {
      history.shift();
    }
    
    await chrome.storage.local.set({ undoHistory: history });
    return true;
  } catch (error) {
    console.error('[Background] Error saving undo state:', error);
    return false;
  }
}

async function restoreUndoStateInline(state) {
  try {
    for (const windowState of state.windows) {
      try {
        const window = await chrome.windows.get(windowState.id).catch(() => null);
        if (!window) continue;
        
        const currentTabs = await chrome.tabs.query({ windowId: window.id });
        for (const tab of currentTabs) {
          if (tab.groupId !== chrome.tabs.TAB_ID_NONE) {
            try {
              await chrome.tabs.ungroup([tab.id]);
            } catch (error) {
              console.warn('[Background] Error ungrouping tab:', error);
              // Continue with other tabs
            }
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        for (const group of windowState.groups) {
          try {
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
                console.warn('[Background] Error recreating group:', error);
                // Continue with other groups
              }
            }
          } catch (error) {
            console.warn('[Background] Error processing group in restore:', error);
            // Continue with other groups
          }
        }
      } catch (error) {
        console.warn('[Background] Error processing window in restore:', error);
        // Continue with other windows
      }
    }
    
    return true;
  } catch (error) {
    console.error('[Background] Error restoring state:', error);
    return false;
  }
}

async function undoLastActionInline() {
  try {
    const result = await chrome.storage.local.get('undoHistory');
    const history = result.undoHistory || [];
    
    if (history.length === 0) {
      return false;
    }
    
    const lastState = history.pop();
    await chrome.storage.local.set({ undoHistory: history });
    
    await restoreUndoStateInline(lastState.previousGroups);
    return true;
  } catch (error) {
    console.error('[Background] Error undoing action:', error);
    return false;
  }
}

// Listen for keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'undo-last-action') {
    try {
      const success = await undoLastActionInline();
      try {
        if (success) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon48.png'),
            title: 'Action Undone',
            message: 'Previous state restored'
          }).catch(() => {
            // Fail silently - notification is not critical
          });
        } else {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon48.png'),
            title: 'Nothing to Undo',
            message: 'No previous actions available'
          }).catch(() => {
            // Fail silently - notification is not critical
          });
        }
      } catch (notifError) {
        console.warn('[Background] Error creating notification:', notifError);
        // Continue - notification failure is not critical
      }
    } catch (error) {
      console.error('[Background] Error handling undo command:', error);
      // Fail silently - don't crash the extension
    }
  }
});
