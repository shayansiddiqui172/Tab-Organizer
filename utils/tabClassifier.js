/**
 * Tab Classifier - Version 1.0.0
 * Smart tab classification with 16 categories
 * @fileoverview Classifies tabs based on URL patterns, domain matching, and title analysis
 */

/**
 * Available tab categories
 * @type {string[]}
 */
const TAB_CATEGORIES = [
  'video',
  'news',
  'shopping',
  'social',
  'work',
  'documentation',
  'search',
  'entertainment',
  'development',
  'education',
  'design',
  'ai-tools',
  'finance',
  'reference',
  'other'
];

/**
 * Classify a tab into a category based on its URL and title
 * Uses domain matching, URL patterns, and title keywords
 * @param {chrome.tabs.Tab} tab - Tab object to classify
 * @returns {string} Category name (one of TAB_CATEGORIES)
 */
function classifyTab(tab) {
  // Edge cases - skip invalid URLs
  if (!tab.url) {
    return 'other';
  }
  
  const url = tab.url.toLowerCase();
  const title = (tab.title || '').toLowerCase();
  
  // Extract domain early
  let domain = '';
  try {
    const urlObj = new URL(tab.url);
    domain = urlObj.hostname.toLowerCase().replace('www.', '');
  } catch (e) {
    domain = url;
  }
  
  // Skip chrome:// and extension pages
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || 
      url.startsWith('about:') || url.startsWith('data:')) {
    return 'other';
  }
  
  // Extract hostname for precise domain matching
  let hostname = '';
  let pathname = '';
  try {
    const urlObj = new URL(tab.url);
    hostname = urlObj.hostname.toLowerCase().replace('www.', '');
    pathname = urlObj.pathname.toLowerCase();
    if (!domain) {
      domain = hostname;
    }
  } catch (e) {
    hostname = url;
    pathname = '';
    if (!domain) {
      domain = url;
    }
  }
  
  // Helper function to extract domain properly
  const extractDomain = (urlStr) => {
    try {
      const urlObj = new URL(urlStr);
      return urlObj.hostname.toLowerCase().replace('www.', '');
    } catch {
      return urlStr.toLowerCase();
    }
  };
  
  // Helper function to check if domain matches (handles subdomains)
  const matchesDomain = (domains) => {
    return domains.some(domainCheck => {
      // Exact match
      if (hostname === domainCheck || domain === domainCheck) return true;
      // Subdomain match (mail.google.com matches google.com)
      if (hostname.endsWith('.' + domainCheck) || domain.endsWith('.' + domainCheck)) return true;
      // Contains check for partial domain matches
      if (hostname.includes(domainCheck) || domain.includes(domainCheck)) return true;
      // Suffix match for domains like abcnews.go.com
      const dotIndex = hostname.length - domainCheck.length - 1;
      if (hostname.endsWith(domainCheck) && (hostname === domainCheck || (dotIndex >= 0 && hostname[dotIndex] === '.'))) {
        return true;
      }
      return false;
    });
  };
  
  // Helper function to check if URL/path contains pattern
  const matchesPattern = (patterns) => {
    return patterns.some(pattern => {
      const lowerPattern = pattern.toLowerCase();
      return url.includes(lowerPattern) || pathname.includes(lowerPattern);
    });
  };
  
  // Helper function to check if title contains keyword
  const titleContains = (keywords) => {
    return keywords.some(keyword => title.includes(keyword.toLowerCase()));
  };
  
  // Helper function to check if URL or title contains any keyword
  const hasKeyword = (keywords) => {
    return keywords.some(keyword => {
      const lowerKeyword = keyword.toLowerCase();
      return url.includes(lowerKeyword) || title.includes(lowerKeyword);
    });
  };
  
  // Helper function to check subdomain of a domain
  const isSubdomainOf = (domainCheck, subdomains) => {
    return subdomains.some(sub => hostname.startsWith(sub + '.' + domainCheck) || hostname === (sub + '.' + domainCheck));
  };
  
  // Priority-based classification (most specific first)
  
  // 1. Chrome system pages → Other (already handled above)
  
  // 2. DEVELOPMENT category (separate from Documentation)
  const devDomains = ['gitlab.com', 'bitbucket.org', 'codepen.io', 'codesandbox.io', 'replit.com', 'glitch.com',
                      'vercel.com', 'netlify.com', 'heroku.com', 'railway.app'];
  // GitHub - check if it's NOT docs/wiki
  if (hostname.includes('github.com')) {
    if (!matchesPattern(['/docs/', '/wiki/', '/documentation/'])) {
      return 'development';
    }
  }
  // Local development
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes('192.168.') || hostname.includes('10.0.')) {
    return 'development';
  }
  if (matchesDomain(devDomains)) {
    return 'development';
  }
  
  // 3. AI & TOOLS category
  const aiDomains = ['chat.openai.com', 'chatgpt.com', 'chat.openai', 'bard.google.com', 'perplexity.ai',
                     'obsidian.md', 'evernote.com', 'keep.google.com'];
  if (matchesDomain(aiDomains) || hostname.includes('chatgpt')) {
    return 'ai-tools';
  }
  // Notion is AI & Tools (not Work anymore)
  if (matchesDomain(['notion.so', 'notion.site'])) {
    return 'ai-tools';
  }
  
  // 4. EDUCATION category - Enhanced with LMS and patterns
  const eduDomains = [
    // Learning platforms
    'coursera.org', 'udemy.com', 'khanacademy.org', 'edx.org', 'skillshare.com', 'pluralsight.com',
    'leetcode.com', 'hackerrank.com', 'codecademy.com', 'udacity.com', 'brilliant.org', 'duolingo.com',
    // LMS platforms
    'mylearningspace', 'd2l.com', 'blackboard.com', 'canvas.instructure.com', 'canvas', 'instructure.com',
    'schoology.com', 'brightspace.com', 'moodle', 'pearson.com', 'mcgrawhill.com', 'cengage.com',
    // Google Classroom
    'google.classroom.com', 'classroom.google.com'
  ];
  const eduKeywords = ['course', 'class', 'assignment', 'student', 'learning', 'education', 'homework', 
                       'grades', 'schedule', 'lms', 'studentportal', 'myportal', 'learning portal',
                       'university', 'college', 'school'];
  const eduPatterns = ['/student/', '/course/', '/class/', '/assignment/', '/homework/', '/grades/', 
                       '/schedule/', '/portal/', '/lms/', '/learning/'];
  
  // Check .edu domains
  if (hostname.endsWith('.edu') || domain.endsWith('.edu') || url.includes('.edu')) {
    return 'education';
  }
  
  // Check LMS/education domains
  if (matchesDomain(eduDomains)) {
    return 'education';
  }
  
  // Check for education keywords in URL or title
  if (hasKeyword(eduKeywords) || matchesPattern(eduPatterns) || titleContains(['course', 'assignment', 'learning', 'student portal', 'class', 'homework'])) {
    return 'education';
  }
  
  // 5. VIDEO category
  const videoDomains = ['youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv', 'netflix.com', 'hulu.com',
                        'disneyplus.com', 'hbo.com', 'primevideo.com', 'dailymotion.com'];
  if (matchesDomain(videoDomains) || titleContains(['youtube', '- youtube'])) {
    return 'video';
  }
  // Check for audible property (playing audio/video)
  if (tab.audible) {
    return 'video';
  }
  
  // 6. SOCIAL category
  const socialDomains = ['facebook.com', 'fb.com', 'twitter.com', 'x.com', 'instagram.com', 'linkedin.com',
                         'reddit.com', 'tiktok.com', 'snapchat.com', 'pinterest.com', 'tumblr.com',
                         'discord.com', 'discord.gg', 'whatsapp.com', 'telegram.org', 'web.telegram.org'];
  if (matchesDomain(socialDomains)) {
    return 'social';
  }
  
  // 7. WORK category - Google subdomains and Office
  const googleWorkSubdomains = ['docs', 'sheets', 'slides', 'drive', 'calendar', 'mail'];
  if (hostname.includes('google.com') && isSubdomainOf('google.com', googleWorkSubdomains)) {
    return 'work';
  }
  const workDomains = ['gmail.com', 'outlook.live.com', 'outlook.office.com', 'slack.com', 'trello.com',
                       'asana.com', 'monday.com', 'clickup.com', 'airtable.com', 'zoom.us', 'meet.google.com',
                       'dropbox.com', 'box.com', 'onedrive.live.com', 'teams.microsoft.com'];
  const workPatterns = ['office.com', 'microsoft.com/office'];
  if (matchesDomain(workDomains) || matchesPattern(workPatterns)) {
    return 'work';
  }
  
  // 8. DOCUMENTATION category
  const docPatterns = ['/docs/', '/documentation/', '/api/', '/reference/', '/guide/', '/tutorial/', '/wiki/'];
  const docDomains = ['stackoverflow.com', 'stackexchange.com', 'developer.mozilla.org', 'mdn.io',
                      'w3schools.com', 'devdocs.io'];
  // GitHub - only if it's docs/wiki
  if (hostname.includes('github.com') && matchesPattern(['/docs/', '/wiki/', '/documentation/'])) {
    return 'documentation';
  }
  if (matchesDomain(docDomains) || matchesPattern(docPatterns)) {
    return 'documentation';
  }
  
  // 9. DESIGN category
  const designDomains = ['dribbble.com', 'behance.net', 'adobe.com', 'unsplash.com', 'pexels.com'];
  // Figma and Canva moved from Work to Design
  if (matchesDomain(['figma.com', 'canva.com']) || matchesDomain(designDomains)) {
    return 'design';
  }
  
  // 10. SHOPPING category - Enhanced with extensive domains and patterns
  const shoppingDomains = [
    // Major retailers
    'amazon.com', 'ebay.com', 'etsy.com', 'walmart.com', 'target.com', 'alibaba.com', 'aliexpress.com',
    'shopify.com', 'bestbuy.com', 'costco.com', 'newegg.com', 'microcenter.com',
    // Furniture & home
    'thebrick.com', 'ikea.com', 'wayfair.com', 'homedepot.com', 'lowes.com', 'williams-sonoma.com',
    'crateandbarrel.com', 'cb2.com',
    // Clothing
    'macys.com', 'nordstrom.com', 'gap.com', 'hm.com', 'zara.com', 'uniqlo.com',
    // Beauty
    'sephora.com', 'ulta.com',
    // Pets
    'chewy.com', 'petco.com', 'petsmart.com'
  ];
  const shoppingKeywords = ['shop', 'store', 'buy', 'cart', 'checkout', 'product', 'price', 'sale', 
                            'deals', 'offers', 'shopping', 'purchase', 'order'];
  const shoppingPaths = ['/product/', '/p/', '/item/', '/products/', '/shop/', '/store/', '/cart', 
                         '/checkout', '/add-to-cart', '/buy/', '/purchase/'];
  const shoppingTitleKeywords = ['shop', 'buy', 'cart', 'checkout', 'price', 'product', 'sale', 'deals'];
  
  // Check for .shop domain
  if (hostname.endsWith('.shop') || domain.endsWith('.shop')) {
    return 'shopping';
  }
  
  // Check for "store" subdomain (store.example.com)
  if (hostname.startsWith('store.') || hostname.includes('.store.')) {
    return 'shopping';
  }
  
  // Check shopping domains
  if (matchesDomain(shoppingDomains)) {
    return 'shopping';
  }
  
  // Check for shopping keywords in URL or title
  const hasShoppingKeyword = hasKeyword(shoppingKeywords);
  const hasShoppingPath = matchesPattern(shoppingPaths);
  const hasShoppingTitle = titleContains(shoppingTitleKeywords);
  
  if (hasShoppingKeyword || hasShoppingPath || hasShoppingTitle) {
    return 'shopping';
  }
  
  // 11. NEWS category
  const newsDomains = ['nytimes.com', 'wsj.com', 'cnn.com', 'bbc.com', 'bbc.co.uk', 'theguardian.com',
                       'reuters.com', 'bloomberg.com', 'apnews.com', 'npr.org', 'foxnews.com',
                       'nbcnews.com', 'abcnews.go.com', 'cbsnews.com', 'politico.com', 'theatlantic.com',
                       'time.com', 'newsweek.com'];
  if (matchesDomain(newsDomains)) {
    return 'news';
  }
  
  // 12. FINANCE category
  const financeDomains = ['paypal.com', 'venmo.com', 'cashapp.com', 'stripe.com'];
  // Add common bank/investment patterns
  const financePatterns = ['bank', 'credit', 'mortgage', 'invest', 'trading', 'stock', 'crypto', 'exchange'];
  if (matchesDomain(financeDomains) || titleContains(financePatterns) || matchesPattern(financePatterns)) {
    return 'finance';
  }
  
  // 13. REFERENCE category
  const referenceDomains = ['wikipedia.org', 'wikihow.com', 'wiktionary.org', 'imdb.com', 'rottentomatoes.com'];
  if (matchesDomain(referenceDomains) || titleContains(['wikipedia'])) {
    return 'reference';
  }
  
  // 14. SEARCH category
  const searchPatterns = ['google.com/search', 'bing.com/search', 'search.yahoo.com', '?q=', '/search?', '&q='];
  const searchDomains = ['duckduckgo.com'];
  // Google homepage or search
  if (hostname === 'google.com' || hostname === 'www.google.com' || matchesPattern(searchPatterns) || matchesDomain(searchDomains)) {
    return 'search';
  }
  
  // 15. ENTERTAINMENT category
  const entertainmentDomains = ['spotify.com', 'soundcloud.com', 'bandcamp.com', 'ign.com', 'gamespot.com',
                                'polygon.com', 'kotaku.com', 'steam.com', 'steampowered.com', 'epicgames.com',
                                'playstation.com', 'xbox.com', 'nintendo.com', 'itch.io'];
  if (matchesDomain(entertainmentDomains)) {
    return 'entertainment';
  }
  
  // 16. OTHER category (default - should be minimal)
  return 'other';
}

/**
 * Group tabs by their classified content type
 * @param {Array<chrome.tabs.Tab>} tabs - Array of tab objects to classify
 * @returns {Object<string, number[]>} Object with category names as keys and tab ID arrays as values
 */
function groupTabsByType(tabs) {
  const grouped = {};
  
  for (const tab of tabs) {
    // Skip system pages and invalid URLs
    if (!tab.url || 
        tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('about:') ||
        tab.url.startsWith('data:')) {
      continue;
    }
    
    const category = classifyTab(tab);
    
    if (!grouped[category]) {
      grouped[category] = [];
    }
    
    grouped[category].push(tab.id);
  }
  
  // Return all groups (including single-tab groups)
  // The caller will decide whether to filter
  return grouped;
}


