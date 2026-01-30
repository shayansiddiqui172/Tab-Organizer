# Tab Organizer Extension - Version History

## Version 1.0.0 - Current Release

### Features Implemented

#### Core Functionality
- ✅ Tab grouping by domain
- ✅ Tab grouping by type (16 categories with smart classification)
- ✅ Ungroup all tabs
- ✅ Session save/restore with full group preservation
- ✅ Auto-recovery sessions on window close

#### Divider System
- ✅ New Divider: Creates collapsed group with about:blank tab
- ✅ Visual separator between tab sections
- ✅ Customizable colors and names via right-click

#### Tab Classification Categories
- Development (GitHub, GitLab, localhost, etc.)
- AI & Tools (ChatGPT, Notion, etc.)
- Education (LMS platforms, .edu domains, learning sites)
- Video (YouTube, Netflix, streaming platforms)
- Social (Twitter, LinkedIn, Reddit, etc.)
- Work (Google Workspace, Office, email, productivity)
- Documentation (Stack Overflow, MDN, docs sites)
- Design (Figma, Canva, Dribbble, etc.)
- Shopping (comprehensive domain and pattern matching)
- News (major news outlets)
- Finance (banking, payments, investment)
- Reference (Wikipedia, IMDb, etc.)
- Search (Google Search, Bing, DuckDuckGo)
- Entertainment (gaming, music platforms)
- Other (fallback for unmatched sites)

#### UI Features
- Modern, clean interface with professional icons
- Toast notifications for user feedback
- Welcome card for first-time users
- Active groups display with color indicators
- Saved sessions with human-readable timestamps
- Tab count display for sessions

#### Button Layout (2x3 Grid)
1. Group by Type (smart categorization)
2. Group by Domain (website-based)
3. Ungroup All
4. New Group (empty group creation)
5. New Divider (visual separator)
6. Save Session

### Technical Details

- **Manifest Version**: 3
- **Permissions**: tabs, tabGroups, storage
- **Browser Support**: Chrome (Chromium-based browsers)
- **Storage**: chrome.storage.local for sessions and settings

### Known Behaviors

- Divider groups must remain collapsed to function as separators
- Empty groups require at least one tab (uses about:blank for dividers)
- System pages (chrome://, chrome-extension://) are skipped during grouping
- Session restore recreates tabs and groups in new windows

### Code Structure

```
tab-organiser-extension/
├── manifest.json
├── background.js (auto-save sessions)
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── utils/
│   ├── tabManager.js (grouping operations)
│   ├── tabClassifier.js (smart tab classification)
│   └── sessionManager.js (save/restore sessions)
└── divider/
    └── divider.html (divider page)
```

## Version 1.0.0 - Current Release (2026-01-13)

### New Features & Improvements

#### Settings Page
- ✅ Full-featured settings page with dark/light/auto theme support
- ✅ Auto-save configuration (enable/disable, interval selection)
- ✅ Grouping behavior settings (auto-collapse, skip single-tab groups)
- ✅ Storage management (view usage, export/import sessions, clear old sessions)
- ✅ Keyboard shortcuts display
- ✅ About section with version info

#### UI Enhancements
- ✅ Professional full-width settings page design
- ✅ Beautiful divider page with animated gradients and instructions
- ✅ Session restore dialog (choose current window or new window)
- ✅ Tip banner with helpful instructions
- ✅ Improved typography and spacing throughout

#### Functionality Improvements
- ✅ Undo feature with keyboard shortcut (Ctrl+Shift+Z / Cmd+Shift+Z)
- ✅ Settings persistence across sessions
- ✅ Consistent settings application across all grouping functions
- ✅ Domain grouping only creates groups with multiple tabs
- ✅ Auto-save timer management
- ✅ Crash recovery with configurable session limits

### Technical Updates

- **Settings Storage**: All settings stored in chrome.storage.local
- **Theme System**: Complete dark/light/auto mode with CSS variables
- **Auto-save**: Background timer with configurable intervals
- **Session Management**: Enhanced restore options (replace vs new window)

---

## Version 1.0.0 - Initial Release (2024-12-19)
