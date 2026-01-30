/**
 * Divider Page Script
 * Applies a random gradient theme to the divider page
 */

// Available gradient themes
const themes = [
  'theme-default',
  'theme-sunset',
  'theme-ocean',
  'theme-forest',
  'theme-cosmic',
  'theme-fire',
  'theme-mint'
];

// Apply random gradient theme on load
const randomTheme = themes[Math.floor(Math.random() * themes.length)];
if (randomTheme !== 'theme-default') {
  document.body.classList.add(randomTheme);
}
