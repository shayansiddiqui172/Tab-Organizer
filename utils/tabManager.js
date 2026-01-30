/**
 * Tab Manager - Version 1.0.0
 * Handles grouping operations and divider creation
 * @fileoverview Tab grouping utilities for domain and type-based organization
 */

/**
 * Group tabs by their domain name
 * @param {Array<chrome.tabs.Tab>} tabs - Array of tab objects
 * @returns {Object<string, number[]>} Object with domain names as keys and tab ID arrays as values
 */
function groupTabsByDomain(tabs) {
  const grouped = {};

  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      continue;
    }

    try {
      const url = new URL(tab.url);
      const domain = url.hostname.replace('www.', '');

      if (!grouped[domain]) {
        grouped[domain] = [];
      }

      grouped[domain].push(tab.id);
    } catch (error) {
      console.warn('[TabManager] Invalid URL:', tab.url);
    }
  }

  // Only return groups with multiple tabs (domain grouping requires multiple tabs per domain)
  const filtered = {};
  for (const [domain, tabIds] of Object.entries(grouped)) {
    if (tabIds.length > 1) {
      filtered[domain] = tabIds;
    }
  }

  return filtered;
}

/**
 * Create Chrome tab groups from grouped tab data
 * @param {Object<string, number[]>} groupedTabs - Object with group names as keys and tab ID arrays as values
 * @returns {Promise<void>}
 * @throws {Error} If all groups fail to create
 */
async function createTabGroups(groupedTabs) {
  try {
    const { autoCollapseGroups } = await chrome.storage.local.get(['autoCollapseGroups']);
    const colors = [
      'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'
    ];

    let colorIndex = 0;
    let successCount = 0;
    let failureCount = 0;

    for (const [domain, tabIds] of Object.entries(groupedTabs)) {
      try {
        const groupId = await chrome.tabs.group({ tabIds: tabIds });

        await chrome.tabGroups.update(groupId, {
          title: domain,
          color: colors[colorIndex % colors.length],
          collapsed: autoCollapseGroups || false
        });

        colorIndex++;
        successCount++;
      } catch (error) {
        console.error(`[TabManager] Error creating group for ${domain}:`, error);
        failureCount++;
      }
    }

    if (failureCount > 0 && successCount === 0) {
      throw new Error(`Failed to create groups: ${failureCount} groups failed`);
    }
  } catch (error) {
    console.error('[TabManager] Error in createTabGroups:', error);
    throw error;
  }
}

/**
 * Ungroup all tabs in the current window
 * @returns {Promise<void>}
 * @throws {Error} If ungrouping fails
 */
async function ungroupAllTabs() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });

    const tabIdsToUngroup = tabs
      .filter(tab => tab.groupId !== chrome.tabs.TAB_ID_NONE)
      .map(tab => tab.id);

    if (tabIdsToUngroup.length > 0) {
      await chrome.tabs.ungroup(tabIdsToUngroup);
    }
  } catch (error) {
    console.error('[TabManager] Error ungrouping tabs:', error);
    throw error;
  }
}

/** @constant {Object} Category configuration for type-based grouping */
const CATEGORY_CONFIG = {
  'video': { color: 'red', title: 'Video' },
  'news': { color: 'blue', title: 'News' },
  'shopping': { color: 'yellow', title: 'Shopping' },
  'social': { color: 'pink', title: 'Social' },
  'work': { color: 'grey', title: 'Work' },
  'documentation': { color: 'purple', title: 'Documentation' },
  'search': { color: 'cyan', title: 'Search' },
  'entertainment': { color: 'yellow', title: 'Entertainment' },
  'development': { color: 'cyan', title: 'Development' },
  'education': { color: 'purple', title: 'Education' },
  'design': { color: 'pink', title: 'Design' },
  'ai-tools': { color: 'purple', title: 'AI & Tools' },
  'finance': { color: 'green', title: 'Finance' },
  'reference': { color: 'blue', title: 'Reference' },
  'other': { color: 'green', title: 'Other' }
};

/**
 * Create tab groups by content type/category
 * @param {Object<string, number[]>} groupedTabs - Object with category names as keys and tab ID arrays as values
 * @returns {Promise<void>}
 * @throws {Error} If all groups fail to create
 */
async function createTabGroupsByType(groupedTabs) {
  try {
    const { autoCollapseGroups, skipSingleTabGroups } = await chrome.storage.local.get([
      'autoCollapseGroups',
      'skipSingleTabGroups'
    ]);

    let successCount = 0;
    let failureCount = 0;

    for (const [category, tabIds] of Object.entries(groupedTabs)) {
      // Skip groups with 1 or fewer tabs if setting is enabled
      if (skipSingleTabGroups && tabIds.length <= 1) {
        continue;
      }

      if (tabIds.length === 0) {
        continue;
      }

      try {
        const config = CATEGORY_CONFIG[category] || {
          color: 'grey',
          title: category.charAt(0).toUpperCase() + category.slice(1)
        };

        const groupId = await chrome.tabs.group({ tabIds: tabIds });

        await chrome.tabGroups.update(groupId, {
          title: config.title,
          color: config.color,
          collapsed: autoCollapseGroups || false
        });

        successCount++;
      } catch (error) {
        console.error(`[TabManager] Error creating group for ${category}:`, error);
        failureCount++;
      }
    }

    if (failureCount > 0 && successCount === 0) {
      throw new Error(`Failed to create groups: ${failureCount} groups failed`);
    }
  } catch (error) {
    console.error('[TabManager] Error in createTabGroupsByType:', error);
    throw error;
  }
}

/**
 * Create a new empty group with a single tab
 * Note: Chrome requires at least one tab to create a group
 * @param {string} title - Title for the new group
 * @returns {Promise<number>} The created group ID
 * @throws {Error} If no suitable tab is found or group creation fails
 */
async function createEmptyGroup(title = 'New Group') {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!activeTab) {
      throw new Error('No active tab found');
    }

    let tabToGroup = activeTab;

    // If active tab is already grouped, find an ungrouped tab
    if (activeTab.groupId !== chrome.tabs.TAB_ID_NONE) {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const ungroupedTab = tabs.find(tab =>
        tab.groupId === chrome.tabs.TAB_ID_NONE &&
        !tab.url.startsWith('chrome://') &&
        !tab.url.startsWith('chrome-extension://')
      );

      if (ungroupedTab) {
        tabToGroup = ungroupedTab;
      }
    }

    const groupId = await chrome.tabs.group({ tabIds: [tabToGroup.id] });

    await chrome.tabGroups.update(groupId, {
      title: title,
      color: 'grey',
      collapsed: false
    });

    return groupId;
  } catch (error) {
    console.error('[TabManager] Error creating empty group:', error);
    throw error;
  }
}
