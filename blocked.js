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

    // ── 1. Hash (most reliable — Chrome embeds blockedUrl via regexSubstitution) ──
    // Format A: first load  → blocked.html#https://www.powerschool.com/...  (raw URL)
    // Format B: after save  → blocked.html#<encoded-intended>%7C<encoded-blocked>
    const hash = location.hash;
    if (hash && hash.length > 1) {
        const raw = hash.slice(1);
        const pipeIdx = raw.indexOf('%7C'); // encoded '|'
        if (pipeIdx !== -1) {
            // Format B
            try { intendedUrl = decodeURIComponent(raw.slice(0, pipeIdx)); } catch(e){}
            try { blockedUrl  = decodeURIComponent(raw.slice(pipeIdx + 3)); } catch(e){}
        } else if (raw.startsWith('http')) {
            // Format A — raw URL from regexSubstitution
            blockedUrl = raw;
        }
    }

    // ── 2. SW message — use ONLY for intendedUrl and mode/listType ────────
    // blockedUrl from hash is authoritative; don't let SW override it since
    // onBeforeNavigate never fires for server-side redirect destinations.
    try {
        const nav = await chrome.runtime.sendMessage({ type: 'getBlockedNav' });
        if (!intendedUrl && nav?.intendedUrl) intendedUrl = nav.intendedUrl;
        if (!blockedUrl  && nav?.blockedUrl)  blockedUrl  = nav.blockedUrl;
        if (nav?.mode)     mode     = nav.mode;
        if (nav?.listType) listType = nav.listType;
    } catch (e) {}

    // ── 3. sessionStorage fallback (survives refresh, fills any gaps) ─────
    if (!blockedUrl || !intendedUrl) {
        try {
            const stored = sessionStorage.getItem(SESSION_KEY);
            if (stored) {
                const s = JSON.parse(stored);
                if (!blockedUrl)  blockedUrl  = s.blockedUrl  || null;
                if (!intendedUrl) intendedUrl = s.intendedUrl || null;
                if (!mode)        mode        = s.mode        || null;
                if (!listType)    listType    = s.listType    || null;
            }
        } catch (e) {}
    }

    // ── 4. Persist for future refreshes ──────────────────────────────────
    if (blockedUrl) {
        // sessionStorage: full data
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ blockedUrl, intendedUrl, mode, listType })); } catch (e) {}
        // Hash: Format B so refresh can parse both URLs without the SW
        if (intendedUrl) {
            const h = encodeURIComponent(intendedUrl) + '%7C' + encodeURIComponent(blockedUrl);
            history.replaceState(null, '', location.pathname + '#' + h);
        }
    }

    // ── 5. Update UI ──────────────────────────────────────────────────────
    if (mode || listType) setBlockMessage(mode, listType);
    if (intendedUrl && blockedUrl) showRedirectNotice(intendedUrl, blockedUrl);

    // ── 6. Auto-navigate check ────────────────────────────────────────────
    if (blockedUrl && !(await wouldBeBlocked(blockedUrl))) {
        window.location.href = intendedUrl || blockedUrl;
        return;
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
