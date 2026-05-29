// Service Worker for Duofocus
importScripts('utils.js');

chrome.runtime.onInstalled.addListener(async () => {
    console.log('Duofocus installed.');
    // Initialize storage with defaults if not present
    const data = await chrome.storage.local.get(['config']);
    if (!data.config) {
        await chrome.storage.local.set({ config: DEFAULT_CONFIG });
        console.log('Default config initialized.');
    }

    // Set up alarm for checking time every minute
    chrome.alarms.create('checkTime', { periodInMinutes: 1 });

    // Initial update
    updateBlockingRules();
});

// Open Options Page on Icon Click
chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkTime') {
        updateBlockingRules();
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.config) {
        updateBlockingRules();
    }
});

// ============================================
// TIME TRACKING (CAN BE REMOVED IF NEEDED)
// ============================================
let timeTrackingState = {
    activeTabId: null,
    activeUrl: null,
    startTime: null,
    isWindowFocused: true,
    isExtensionEnabled: true
};

// Check if extension is enabled
async function checkExtensionEnabled() {
    const data = await chrome.storage.local.get(['config']);
    const config = data.config || DEFAULT_CONFIG;
    return config.masterEnabled !== false;
}

// Get domain from URL
function getDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '');
    } catch (e) {
        return null;
    }
}

// Get YYYY-MM-DD for a date
function getDateKey(date) {
    const d = date || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Save time to storage (all-time and per-day)
// countVisit: only true when user actually navigates to a tab (not on periodic saves)
async function saveTime(domain, timeSpent, countVisit = false) {
    const data = await chrome.storage.local.get(['usageStats']);
    const stats = data.usageStats || {};
    const todayKey = getDateKey(new Date());
    
    if (!stats[domain]) {
        stats[domain] = {
            totalSeconds: 0,
            visitCount: 0,
            lastVisited: null,
            days: {}
        };
    }
    
    stats[domain].totalSeconds += timeSpent;
    stats[domain].lastVisited = Date.now();
    
    if (!stats[domain].days) {
        stats[domain].days = {};
    }
    if (!stats[domain].days[todayKey]) {
        stats[domain].days[todayKey] = { totalSeconds: 0, visitCount: 0 };
    }
    stats[domain].days[todayKey].totalSeconds += timeSpent;
    
    // Only count visit when user actually switches to a tab (not on periodic saves)
    if (countVisit) {
        stats[domain].visitCount += 1;
        stats[domain].days[todayKey].visitCount += 1;
    }
    
    await chrome.storage.local.set({ usageStats: stats });
}

// Stop tracking current session
async function stopTracking() {
    if (timeTrackingState.startTime && timeTrackingState.activeUrl) {
        const timeSpent = Math.floor((Date.now() - timeTrackingState.startTime) / 1000);
        if (timeSpent > 0) {
            const domain = getDomain(timeTrackingState.activeUrl);
            if (domain) {
                await saveTime(domain, timeSpent);
            }
        }
    }
    timeTrackingState.startTime = null;
    timeTrackingState.activeUrl = null;
}

// Start tracking a new session
async function startTracking(tabId, url) {
    await stopTracking(); // Save previous session (time only, no visit count)
    
    const isEnabled = await checkExtensionEnabled();
    if (!isEnabled || !timeTrackingState.isWindowFocused) {
        return;
    }
    
    // Record the visit (this is when user actually navigates to a tab)
    const domain = getDomain(url);
    if (domain) {
        await saveTime(domain, 0, true); // 0 seconds, but count the visit
    }
    
    timeTrackingState.activeTabId = tabId;
    timeTrackingState.activeUrl = url;
    timeTrackingState.startTime = Date.now();
}

// Handle tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        await startTracking(activeInfo.tabId, tab.url);
    } else {
        await stopTracking();
    }
});

// Handle tab updates (URL changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && 
        (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        // Check if this is the active tab
        const windows = await chrome.windows.getAll({ populate: true });
        for (const window of windows) {
            if (window.focused) {
                for (const wTab of window.tabs || []) {
                    if (wTab.active && wTab.id === tabId) {
                        await startTracking(tabId, tab.url);
                        return;
                    }
                }
            }
        }
    }
});

// Handle window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Window lost focus
        timeTrackingState.isWindowFocused = false;
        await stopTracking();
    } else {
        // Window gained focus
        timeTrackingState.isWindowFocused = true;
        const isEnabled = await checkExtensionEnabled();
        timeTrackingState.isExtensionEnabled = isEnabled;
        
        // Get active tab and start tracking
        try {
            const window = await chrome.windows.get(windowId, { populate: true });
            if (window.focused) {
                const activeTab = window.tabs?.find(tab => tab.active);
                if (activeTab && activeTab.url && 
                    (activeTab.url.startsWith('http://') || activeTab.url.startsWith('https://'))) {
                    await startTracking(activeTab.id, activeTab.url);
                }
            }
        } catch (e) {
            console.error('Error getting window:', e);
        }
    }
});

// Periodic save (every 10 seconds) to prevent data loss
setInterval(async () => {
    if (timeTrackingState.startTime && timeTrackingState.activeUrl && 
        timeTrackingState.isWindowFocused && timeTrackingState.isExtensionEnabled) {
        const isEnabled = await checkExtensionEnabled();
        if (!isEnabled) {
            await stopTracking();
            timeTrackingState.isExtensionEnabled = false;
        } else {
            // Save current session progress
            const timeSpent = Math.floor((Date.now() - timeTrackingState.startTime) / 1000);
            if (timeSpent >= 10) { // Save every 10 seconds
                const domain = getDomain(timeTrackingState.activeUrl);
                if (domain) {
                    await saveTime(domain, timeSpent);
                    timeTrackingState.startTime = Date.now(); // Reset timer
                }
            }
        }
    }
}, 10000); // Check every 10 seconds

// Handle extension disable/enable
chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local' && changes.config) {
        const isEnabled = await checkExtensionEnabled();
        timeTrackingState.isExtensionEnabled = isEnabled;
        if (!isEnabled) {
            await stopTracking();
        }
    }
});
// ============================================
// END TIME TRACKING
// ============================================

// ============================================
// REDIRECT CHAIN TRACKING
// Captures the user's intended URL (what they typed/clicked) per tab,
// so blocked.html can tell the difference between a direct block and
// a blocked intermediate redirect from an otherwise-allowed site.
// ============================================

// In-memory map: tabId -> intended URL (cleared on tab close)
const tabIntendedUrl = {};

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) return; // main frame only
    const extensionOrigin = chrome.runtime.getURL('');
    if (details.url.startsWith(extensionOrigin)) return; // ignore extension pages

    const qualifiers = details.transitionQualifiers || [];
    const isRedirect =
        qualifiers.includes('server_redirect') ||
        qualifiers.includes('client_redirect');

    if (!isRedirect) {
        // Fresh navigation — this is what the user actually intended
        tabIntendedUrl[details.tabId] = details.url;
    }

    // Always write the latest snapshot so blocked.html can read it.
    // Using chrome.storage.local (not session) for maximum compatibility.
    chrome.storage.local.set({
        [`blockedNav_${details.tabId}`]: {
            intendedUrl: tabIntendedUrl[details.tabId] || details.url,
            blockedUrl: details.url,
            isRedirect: isRedirect,
            ts: Date.now()
        }
    });
});

// Clean up nav data when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabIntendedUrl[tabId];
    chrome.storage.local.remove([`blockedNav_${tabId}`]);
});

// ============================================
// END REDIRECT CHAIN TRACKING
// ============================================

// Mutex for rule updates
let updatePromise = Promise.resolve();

async function updateBlockingRules() {
    // Chain updates to prevent race conditions accessing/writing rules
    updatePromise = updatePromise.then(async () => {
        try {
            await applyRules();
        } catch (e) {
            console.error("Error applying rules:", e);
        }
    });
    return updatePromise;
}

async function applyRules() {
    const data = await chrome.storage.local.get(['config']);
    const config = data.config || DEFAULT_CONFIG;

    // CHECK MASTER SWITCH
    if (config.masterEnabled === false) {
        console.log("Extension is disabled via Master Switch. Unblocking all.");

        // Override static block by allowing everything
        const allowAllRule = {
            id: 9999,
            priority: 9999, // Highest priority
            action: { type: 'allow' },
            condition: { urlFilter: '*', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest'] }
        };

        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const removeRuleIds = existingRules.map(r => r.id);

        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: removeRuleIds,
            addRules: [allowAllRule]
        });

        await chrome.storage.local.set({ currentMode: 'disabled' });
        return;
    }

    const currentModeTime = getCurrentMode(config.schedule);
    const currentMode = currentModeTime;

    await chrome.storage.local.set({ currentMode });
    console.log(`Updating rules. Current mode: ${currentMode}`);

    const modeSettings = config.modes ? config.modes[currentMode] : { type: 'allowlist', domains: [] };
    // Deduplicate domains to be safe
    const rawDomains = modeSettings.domains || [];
    const domains = [...new Set(rawDomains)];

    const type = modeSettings.type || 'allowlist';

    let newRules = [];

    // Base ID for dynamic rules to avoid conflict with static rules (ID 1)
    const BASE_ID = 1000;

    if (type === 'allowlist') {
        // In allowlist mode, we need to:
        // 1. Allow specific domains (priority 3 - higher than static block)
        // 2. Block everything else (priority 2 - lower than allows, but higher than static)
        
        // First, add allow rules for each domain (higher priority)
        domains.forEach((domain, index) => {
            newRules.push({
                id: BASE_ID + index,
                priority: 3, // Higher priority than the static block rule
                action: { type: 'allow' },
                condition: {
                    urlFilter: `||${domain}`,
                    resourceTypes: ['main_frame']
                }
            });
        });
        
        // Then, add a catch-all block rule for everything else (lower priority than allows)
        // This will block anything not explicitly allowed
        newRules.push({
            id: 999,
            priority: 2, // Higher than static (1), but lower than allows (3)
            action: {
                type: 'redirect',
                redirect: { extensionPath: '/blocked.html' }
            },
            condition: {
                urlFilter: '*',
                resourceTypes: ['main_frame']
            }
        });
    } else {
        // Blocklist
        // Rule to Unblock Everything (ID 999)
        newRules.push({
            id: 999,
            priority: 2,
            action: { type: 'allow' },
            condition: { urlFilter: '*', resourceTypes: ['main_frame'] }
        });

        domains.forEach((domain, index) => {
            // 1. Redirect Main Frame (The friendly blocked page)
            newRules.push({
                id: BASE_ID + index, // e.g., 1000, 1001
                priority: 3,
                action: {
                    type: 'redirect',
                    redirect: { extensionPath: '/blocked.html' }
                },
                condition: {
                    urlFilter: `||${domain}`,
                    resourceTypes: ['main_frame']
                }
            });

            // 2. Block Sub-resources (iframe, xhr, etc.) - The "Aggressive Block"
            // This prevents embedded widgets like Google Chat
            newRules.push({
                id: BASE_ID + 5000 + index, // e.g., 6000, 6001
                priority: 3,
                action: { type: 'block' },
                condition: {
                    urlFilter: `||${domain}`,
                    resourceTypes: ['sub_frame', 'xmlhttprequest', 'script', 'websocket', 'image']
                }
            });
        });
    }

    // Fetch existing dynamic rules to remove them
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules.map(r => r.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: removeRuleIds,
        addRules: newRules
    });

    console.log(`Applied ${newRules.length} rules for mode ${currentMode} (${type}).`);
}
