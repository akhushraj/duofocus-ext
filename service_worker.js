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
        flushActiveSession(); // persist time spent since last tick
        syncToCloud();
    }
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'cloudSync') syncToCloud();
    if (msg.type === 'getBlockedNav') {
        // handled elsewhere
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.config) {
        updateBlockingRules();
    }
});

// ============================================
// TIME TRACKING
//
// MV3 service workers are killed after ~30s of inactivity, so setInterval
// and in-memory state are unreliable for long sessions.
//
// Fix: persist the active session in chrome.storage.local so it survives
// the worker sleeping. The 1-minute alarm (which reliably wakes the worker)
// flushes elapsed time. If >2 min passed between flushes (e.g. computer
// slept), that gap is skipped to avoid inflated counts.
// ============================================

function getDomain(url) {
    try { return new URL(url).hostname.replace('www.', ''); } catch (e) { return null; }
}

function getDateKey(date) {
    const d = date || new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function checkExtensionEnabled() {
    const data = await chrome.storage.local.get(['config']);
    return (data.config || DEFAULT_CONFIG).masterEnabled !== false;
}

// Persist seconds to usageStats, optionally counting a visit
async function saveTime(domain, seconds, countVisit = false) {
    if (!domain) return;
    const data  = await chrome.storage.local.get(['usageStats']);
    const stats = data.usageStats || {};
    const today = getDateKey(new Date());

    if (!stats[domain]) stats[domain] = { totalSeconds: 0, visitCount: 0, lastVisited: null, days: {} };
    if (!stats[domain].days) stats[domain].days = {};
    if (!stats[domain].days[today]) stats[domain].days[today] = { totalSeconds: 0, visitCount: 0 };

    stats[domain].totalSeconds                  += seconds;
    stats[domain].days[today].totalSeconds      += seconds;
    stats[domain].lastVisited                    = Date.now();

    if (countVisit) {
        stats[domain].visitCount                += 1;
        stats[domain].days[today].visitCount    += 1;
    }

    await chrome.storage.local.set({ usageStats: stats });
}

// Flush time for the current active session and remove it from storage
async function stopTracking() {
    const data    = await chrome.storage.local.get(['activeSession']);
    const session = data.activeSession;
    if (!session) return;

    const seconds = Math.floor((Date.now() - session.lastSaveTime) / 1000);
    if (seconds > 0) await saveTime(session.domain, seconds);
    await chrome.storage.local.remove(['activeSession']);
}

// Begin tracking a new URL (flushes any previous session first)
async function startTracking(tabId, url) {
    await stopTracking();

    const isEnabled = await checkExtensionEnabled();
    const focusData = await chrome.storage.local.get(['windowFocused']);
    const focused   = focusData.windowFocused !== false; // default true
    if (!isEnabled || !focused) return;

    const domain = getDomain(url);
    if (!domain) return;

    const now = Date.now();
    await chrome.storage.local.set({
        activeSession: { domain, url, tabId, startTime: now, lastSaveTime: now }
    });
    await saveTime(domain, 0, true); // count the visit, 0 extra seconds
}

// Called by the 1-minute alarm — saves elapsed time without ending the session
async function flushActiveSession() {
    const data    = await chrome.storage.local.get(['activeSession', 'windowFocused']);
    const session = data.activeSession;
    const focused = data.windowFocused !== false;
    if (!session || !focused) return;

    const now     = Date.now();
    const elapsed = now - session.lastSaveTime;

    // If the gap is >2 min the worker was asleep / computer was sleeping — skip it
    if (elapsed > 2 * 60 * 1000) {
        await chrome.storage.local.set({ activeSession: { ...session, lastSaveTime: now } });
        return;
    }

    const seconds = Math.floor(elapsed / 1000);
    if (seconds > 0) {
        await saveTime(session.domain, seconds);
        await chrome.storage.local.set({ activeSession: { ...session, lastSaveTime: now } });
    }
}

// ── Event listeners ───────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url?.startsWith('http://') || tab.url?.startsWith('https://')) {
        await startTracking(activeInfo.tabId, tab.url);
    } else {
        await stopTracking();
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    if (!tab.url?.startsWith('http://') && !tab.url?.startsWith('https://')) return;
    const windows = await chrome.windows.getAll({ populate: true });
    for (const win of windows) {
        if (win.focused) {
            for (const t of win.tabs || []) {
                if (t.active && t.id === tabId) { await startTracking(tabId, tab.url); return; }
            }
        }
    }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        await chrome.storage.local.set({ windowFocused: false });
        await stopTracking();
    } else {
        await chrome.storage.local.set({ windowFocused: true });
        try {
            const win = await chrome.windows.get(windowId, { populate: true });
            const active = win.tabs?.find(t => t.active);
            if (active?.url?.startsWith('http://') || active?.url?.startsWith('https://')) {
                await startTracking(active.id, active.url);
            }
        } catch (e) {}
    }
});

// Extension toggled off → stop tracking
chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local' && changes.config) {
        if (!(await checkExtensionEnabled())) await stopTracking();
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

// In-memory maps: tabId -> URL (cleared on tab close)
const tabIntendedUrl = {}; // what the user originally typed/clicked
const tabLastUrl     = {}; // most recent URL navigated to (used as blockedUrl)

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
    tabLastUrl[details.tabId] = details.url;

    // Also write to storage as a backup (blocked.html prefers the message API below)
    chrome.storage.local.set({
        [`blockedNav_${details.tabId}`]: {
            intendedUrl: tabIntendedUrl[details.tabId] || details.url,
            blockedUrl: details.url,
            isRedirect: isRedirect,
            ts: Date.now()
        }
    });
});

// blocked.html asks for nav data via message.
// IMPORTANT: we delay the response by 150ms so that any pending
// onBeforeNavigate events (e.g. for the redirect destination like
// powerschool.com) are processed by the SW before we read tabLastUrl.
// Without the delay, blocked.html's message arrives before the SW
// has processed onBeforeNavigate for the actual blocked URL, so
// tabLastUrl still points to the originally-typed URL (schoology.com).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'getBlockedNav') {
        const tabId = sender.tab?.id;
        setTimeout(() => {
            chrome.storage.local.get(['config', 'currentMode']).then(data => {
                const config = data.config || DEFAULT_CONFIG;
                const mode = (data.currentMode && data.currentMode !== 'disabled')
                    ? data.currentMode
                    : getCurrentMode(config.schedule);
                const modeSettings = (config.modes && config.modes[mode]) || { type: 'allowlist' };
                sendResponse(tabId ? {
                    intendedUrl: tabIntendedUrl[tabId] || null,
                    blockedUrl:  tabLastUrl[tabId]     || null,
                    mode:        mode,
                    listType:    modeSettings.type || 'allowlist'
                } : null);
            });
        }, 150);
        return true; // keep channel open for async response
    }
});

// Clean up nav data when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabIntendedUrl[tabId];
    delete tabLastUrl[tabId];
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

    // Use regexSubstitution so Chrome embeds the blocked URL directly in the
    // redirect URL as a hash fragment. This is the only reliable way to pass
    // the blocked URL to blocked.html — onBeforeNavigate does NOT fire for
    // server-side redirect destinations (Chrome docs: "server side redirects
    // do not trigger a second onBeforeNavigate event"), so the SW can never
    // know the redirect destination URL through navigation events alone.
    const blockedPageBase = chrome.runtime.getURL('/blocked.html');
    const redirectToBlocked = {
        type: 'redirect',
        redirect: { regexSubstitution: `${blockedPageBase}#\\0` }
    };
    // NOTE: regexFilter must be 'https?://.*' (not '.*') to avoid matching
    // the chrome-extension:// URL of blocked.html itself, which would loop.

    if (type === 'allowlist') {
        // Allow specific domains (priority 3)
        domains.forEach((domain, index) => {
            newRules.push({
                id: BASE_ID + index,
                priority: 3,
                action: { type: 'allow' },
                condition: {
                    urlFilter: `||${domain}`,
                    resourceTypes: ['main_frame']
                }
            });
        });

        // Catch-all redirect for everything else (priority 2)
        newRules.push({
            id: 999,
            priority: 2,
            action: redirectToBlocked,
            condition: {
                regexFilter: 'https?://.*',
                resourceTypes: ['main_frame']
            }
        });
    } else {
        // Blocklist — allow everything by default
        newRules.push({
            id: 999,
            priority: 2,
            action: { type: 'allow' },
            condition: { urlFilter: '*', resourceTypes: ['main_frame'] }
        });

        domains.forEach((domain, index) => {
            // Redirect main frame to blocked page
            newRules.push({
                id: BASE_ID + index,
                priority: 3,
                action: redirectToBlocked,
                condition: {
                    regexFilter: 'https?://.*',
                    requestDomains: [domain],
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

// ── Cloud Sync ────────────────────────────────────────────────────────────────

const CLOUD_API = 'https://duofocus-server.vercel.app';

async function syncToCloud() {
    try {
        const { cloudConfig, usageStats } = await chrome.storage.local.get(['cloudConfig', 'usageStats']);
        if (!cloudConfig || !cloudConfig.deviceToken) return; // not paired

        const { deviceToken, deviceId, uid } = cloudConfig;
        const headers = {
            'Content-Type': 'application/json',
            'X-Device-Token': deviceToken,
            'X-Device-Id': deviceId,
            'X-Uid': uid
        };

        // Sync usage stats — send each date's domain data
        if (usageStats && Object.keys(usageStats).length > 0) {
            for (const [date, domains] of Object.entries(usageStats)) {
                if (!domains || Object.keys(domains).length === 0) continue;
                await fetch(`${CLOUD_API}/api/usage`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ date, domains })
                });
            }
        }

        // Pull remote config — apply if newer than local
        const configRes = await fetch(`${CLOUD_API}/api/config`, { headers });
        if (configRes.ok) {
            const { config: remoteConfig } = await configRes.json();
            if (remoteConfig && remoteConfig.updatedAt) {
                const { config: localConfig } = await chrome.storage.local.get(['config']);
                const localUpdatedAt = localConfig && localConfig.updatedAt ? localConfig.updatedAt : 0;
                if (remoteConfig.updatedAt > localUpdatedAt) {
                    // Remote is newer — apply it (strip server-only fields)
                    const { updatedAt, ...rest } = remoteConfig;
                    await chrome.storage.local.set({ config: { ...rest, updatedAt } });
                    updateBlockingRules();
                    console.log('Applied remote config update.');
                }
            }
        }
    } catch (e) {
        console.warn('Cloud sync failed:', e.message);
    }
}
