// blocked.js — Logic for the blocked/focus page
// Clean rewrite: service worker message → sessionStorage fallback → local storage fallback

// ── Helpers ───────────────────────────────────────────────────────────────

function getDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return null; }
}

function calcMode(schedule) {
    const mins  = new Date().getHours() * 60 + new Date().getMinutes();
    const times = Object.keys(schedule).sort();
    if (!times.length) return 'free';
    let active = times[times.length - 1];
    for (const t of times) {
        const [h, m] = t.split(':').map(Number);
        if (mins >= h * 60 + m) active = t; else break;
    }
    return schedule[active] || 'free';
}

// ── Mode badge (synchronous — no storage needed) ──────────────────────────

(function () {
    const el = document.getElementById('modeName');
    if (!el) return;
    const DEFAULT = { "07:00": "free", "15:00": "study", "18:00": "free", "20:00": "sleep" };
    const mode    = calcMode(DEFAULT);
    el.textContent = mode[0].toUpperCase() + mode.slice(1);
    // Refine with actual config
    chrome.storage.local.get(['config']).then(d => {
        if (!d.config?.schedule) return;
        const m = calcMode(d.config.schedule);
        el.textContent = m[0].toUpperCase() + m.slice(1);
    }).catch(() => {});
})();

// ── Block reason message ──────────────────────────────────────────────────

function setBlockMessage(mode, listType) {
    const el = document.getElementById('blockReason');
    if (!el) return;
    if (mode === 'sleep')                         el.textContent = "It's sleep time 🌙 — screen time is over for now.";
    else if (listType === 'allowlist')             el.textContent = "You're in Study mode — only your approved sites are accessible.";
    else if (listType === 'blocklist')             el.textContent = "This site has been blocked.";
    else                                           el.textContent = "This site isn't available right now.";
}

// ── Redirect chain notice ─────────────────────────────────────────────────

function showRedirectNotice(intendedUrl, blockedUrl) {
    const iDomain = getDomain(intendedUrl);
    const bDomain = getDomain(blockedUrl);
    if (!iDomain || !bDomain || iDomain === bDomain) return;
    document.getElementById('intendedDomain').textContent      = iDomain;
    document.getElementById('blockedDomain').textContent       = bDomain;
    document.getElementById('blockedDomainRepeat').textContent = bDomain;
    document.getElementById('redirectNotice').style.display    = 'block';
}

// ── Main nav tracking & auto-navigate ────────────────────────────────────

(async function () {
    const SESSION_KEY = 'duofocus_nav'; // sessionStorage key (per-tab, auto-cleared on tab close)

    let intendedUrl = null;
    let blockedUrl  = null;
    let mode        = null;
    let listType    = null;

    function dbg(msg) {
        const el = document.getElementById('debugInfo');
        if (el) el.textContent += msg + '\n';
        console.log('[duofocus]', msg);
    }

    dbg('blocked.js started');

    // ── 1. Ask the service worker (primary source) ────────────────────────
    try {
        const nav = await chrome.runtime.sendMessage({ type: 'getBlockedNav' });
        dbg('SW message: ' + JSON.stringify(nav));
        if (nav?.blockedUrl)  blockedUrl  = nav.blockedUrl;
        if (nav?.intendedUrl) intendedUrl = nav.intendedUrl;
        if (nav?.mode)        mode        = nav.mode;
        if (nav?.listType)    listType    = nav.listType;
    } catch (e) { dbg('SW message error: ' + e); }

    dbg('after SW: intended=' + intendedUrl + ' blocked=' + blockedUrl);

    // ── 2. sessionStorage fallback (survives same-tab refresh) ───────────
    if (!blockedUrl) {
        try {
            const stored = sessionStorage.getItem(SESSION_KEY);
            if (stored) {
                const nav = JSON.parse(stored);
                blockedUrl  = nav.blockedUrl  || null;
                intendedUrl = nav.intendedUrl || null;
                mode        = nav.mode        || null;
                listType    = nav.listType    || null;
                dbg('sessionStorage: ' + JSON.stringify(nav));
            }
        } catch (e) { dbg('sessionStorage error: ' + e); }
    }

    // ── 3. Local storage fallback (very fresh entries only) ──────────────
    if (!blockedUrl) {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs?.length) {
                const key  = `blockedNav_${tabs[0].id}`;
                const data = await chrome.storage.local.get([key]);
                const nav  = data[key];
                const age  = nav ? Date.now() - (nav.ts || 0) : -1;
                dbg('localStorage entry: ' + JSON.stringify(nav) + ' age=' + age + 'ms');
                if (nav && age < 30_000) {
                    if (!blockedUrl)  blockedUrl  = nav.blockedUrl;
                    if (!intendedUrl) intendedUrl = nav.intendedUrl;
                    if (!mode)        mode        = nav.mode;
                    if (!listType)    listType    = nav.listType;
                }
            }
        } catch (e) { dbg('localStorage error: ' + e); }
    }

    dbg('final: intended=' + intendedUrl + ' blocked=' + blockedUrl);

    // ── 4. Persist in sessionStorage for future refreshes ────────────────
    if (blockedUrl) {
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ blockedUrl, intendedUrl, mode, listType })); } catch (e) {}
    }

    // ── 5. Update UI ──────────────────────────────────────────────────────
    if (mode || listType) setBlockMessage(mode, listType);
    if (intendedUrl && blockedUrl) showRedirectNotice(intendedUrl, blockedUrl);

    // ── 6. Auto-navigate check ────────────────────────────────────────────
    if (blockedUrl) {
        const stillBlocked = await wouldBeBlocked(blockedUrl);
        dbg('wouldBeBlocked(' + blockedUrl + ') = ' + stillBlocked);
        if (!stillBlocked) {
            dbg('navigating to ' + (intendedUrl || blockedUrl));
            window.location.href = intendedUrl || blockedUrl;
            return;
        }
    }

    // ── 7. Listen for config changes (e.g. parent disables extension) ─────
    chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area !== 'local') return;
        if (changes.config?.newValue?.masterEnabled === false) {
            window.location.href = intendedUrl || blockedUrl || 'about:blank';
            return;
        }
        if (blockedUrl && (changes.config || changes.currentMode)) {
            if (!(await wouldBeBlocked(blockedUrl))) {
                window.location.href = intendedUrl || blockedUrl;
            }
        }
    });
})();
