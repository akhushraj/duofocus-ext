// blocked.js — Logic for the blocked/focus page

function getDomain(url) {
    try { return new URL(url).hostname.replace('www.', ''); } catch (e) { return url; }
}

// ── Mode badge ────────────────────────────────────────────────────────────
function calcMode(schedule) {
    const mins = new Date().getHours() * 60 + new Date().getMinutes();
    const times = Object.keys(schedule).sort();
    if (!times.length) return 'free';
    let active = times[times.length - 1]; // wrap-around default
    for (const t of times) {
        const [h, m] = t.split(':').map(Number);
        if (mins >= h * 60 + m) active = t; else break;
    }
    return schedule[active] || 'free';
}

function setModeBadge(mode) {
    const el = document.getElementById('modeName');
    if (el) el.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
}

// Show immediately using the default schedule (no storage needed)
const DEFAULT_SCHEDULE = {"07:00":"free","15:00":"study","18:00":"free","20:00":"sleep"};
setModeBadge(calcMode(DEFAULT_SCHEDULE));

// Then refine from the user's actual config
chrome.storage.local.get(['config']).then(data => {
    if (data.config?.schedule) setModeBadge(calcMode(data.config.schedule));
}).catch(() => {});

// ── Block reason message ──────────────────────────────────────────────────
function setBlockMessage(mode, listType) {
    const el = document.getElementById('blockReason');
    if (!el) return;
    if (mode === 'sleep') {
        el.textContent = "It's sleep time 🌙 — screen time is over for now.";
    } else if (mode === 'study' && listType === 'allowlist') {
        el.textContent = "You're in Study mode — only your approved sites are accessible.";
    } else if (listType === 'blocklist') {
        el.textContent = "This site has been blocked.";
    } else {
        el.textContent = "This site isn't available right now.";
    }
}

// ── Nav tracking & auto-navigate ──────────────────────────────────────────
(async function () {
    let intendedUrl = null;
    let blockedUrl  = null;
    let mode        = null;
    let listType    = null;

    // 1. Hash survives a refresh — fastest path
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
        try { intendedUrl = decodeURIComponent(hash.slice(1)); } catch (e) {}
    }

    // 2. Ask the service worker directly (reads from memory, no storage race)
    try {
        const nav = await chrome.runtime.sendMessage({ type: 'getBlockedNav' });
        if (nav) {
            if (!intendedUrl) intendedUrl = nav.intendedUrl;
            blockedUrl = nav.blockedUrl;
            mode       = nav.mode;
            listType   = nav.listType;
        }
    } catch (e) {}

    // 3. Fall back to local storage
    if (!intendedUrl) {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs?.length) {
                const key  = `blockedNav_${tabs[0].id}`;
                const data = await chrome.storage.local.get([key]);
                const nav  = data[key];
                if (nav && Date.now() - (nav.ts || 0) < 5 * 60 * 1000) {
                    intendedUrl = nav.intendedUrl;
                    blockedUrl  = nav.blockedUrl;
                    mode        = nav.mode;
                    listType    = nav.listType;
                }
            }
        } catch (e) {}
    }

    // Update the reason message now that we know mode/listType
    if (mode || listType) setBlockMessage(mode, listType);

    // Persist in hash so a page refresh retries the right URL
    if (intendedUrl) {
        history.replaceState(null, '', `${window.location.pathname}#${encodeURIComponent(intendedUrl)}`);
    }

    // The URL to check when deciding whether the block has been lifted.
    // Use blockedUrl (the URL that actually got stopped) if available —
    // intendedUrl may itself be allowed while still redirecting through
    // a blocked domain, which would cause an infinite redirect loop.
    const checkUrl = blockedUrl || intendedUrl;

    // Listen for config changes unconditionally — master toggle off must
    // always navigate away, even if we couldn't resolve the intended URL
    chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area !== 'local') return;
        if (changes.config || changes.currentMode) {
            if (checkUrl && !(await wouldBeBlocked(checkUrl))) {
                window.location.href = intendedUrl || checkUrl;
            } else if (!checkUrl && changes.config?.newValue?.masterEnabled === false) {
                history.back();
            }
        }
    });

    if (!intendedUrl) return;

    // If the block was already lifted before we loaded, navigate now.
    // Check blockedUrl specifically — if intendedUrl is allowed but still
    // routes through a blocked domain, navigating would loop infinitely.
    if (!(await wouldBeBlocked(checkUrl))) {
        window.location.href = intendedUrl;
        return;
    }

    // Show redirect-chain notice only when domains differ
    if (blockedUrl) {
        const iDomain = getDomain(intendedUrl);
        const bDomain = getDomain(blockedUrl);
        if (iDomain && bDomain && iDomain !== bDomain) {
            document.getElementById('intendedDomain').textContent      = iDomain;
            document.getElementById('blockedDomain').textContent       = bDomain;
            document.getElementById('blockedDomainRepeat').textContent = bDomain;
            document.getElementById('redirectNotice').style.display    = 'block';
        }
    }
})();
