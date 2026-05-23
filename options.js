// Options page logic

let currentConfig = null;

const ELEMENTS = {
    lockScreen: document.getElementById('lockScreen'),
    lockTitle: document.getElementById('lockTitle'),
    lockMessage: document.getElementById('lockMessage'),
    passwordInput: document.getElementById('passwordInput'),
    unlockBtn: document.getElementById('unlockBtn'),
    lockError: document.getElementById('lockError'),
    resetPasswordBtn: document.getElementById('resetPasswordBtn'),
    settingsPanel: document.getElementById('settingsPanel'),
    scheduleEditor: document.getElementById('scheduleEditor'),
    modeSelect: document.getElementById('modeSelect'),
    domainListInput: document.getElementById('domainListInput'),
    listLabel: document.getElementById('listLabel'),
    saveRulesBtn: document.getElementById('saveRulesBtn'),
    changePasswordBtn: document.getElementById('changePasswordBtn'),
    addScheduleBtn: document.getElementById('addScheduleBtn'),
    radioAllowlist: document.querySelector('input[name="modeType"][value="allowlist"]'),
    radioBlocklist: document.querySelector('input[name="modeType"][value="blocklist"]'),
    masterToggle: document.getElementById('masterToggle'),
    usageStats: document.getElementById('usageStats'),
    clearUsageBtn: document.getElementById('clearUsageBtn'),
    usageFilterToday: document.getElementById('usageFilterToday'),
    usageFilterRange: document.getElementById('usageFilterRange'),
    usageFilterAll: document.getElementById('usageFilterAll'),
    usageDateSingle: document.getElementById('usageDateSingle'),
    usageDateSingleWrap: document.getElementById('usageDateSingleWrap'),
    usageDateRangeWrap: document.getElementById('usageDateRangeWrap'),
    usageDateStart: document.getElementById('usageDateStart'),
    usageDateEnd: document.getElementById('usageDateEnd')
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
    const data = await chrome.storage.local.get(['config']);

    // Migration check: if old config exists, migrate it or just reset to new default?
    // For simplicity, if structure doesn't match new schema, use default.
    // In real app, we would migrate.
    if (!data.config || !data.config.modes) {
        currentConfig = DEFAULT_CONFIG;
        // Preserve password if exists
        if (data.config && data.config.passwordHash) {
            currentConfig.passwordHash = data.config.passwordHash;
        }
    } else {
        currentConfig = data.config;
    }

    // Ensure masterEnabled exists (migration)
    if (typeof currentConfig.masterEnabled === 'undefined') {
        currentConfig.masterEnabled = true;
    }

    checkLockState();

    // Event Listeners
    ELEMENTS.unlockBtn.addEventListener('click', handleUnlockOrSetup);
    ELEMENTS.resetPasswordBtn.addEventListener('click', handleResetPassword);
    ELEMENTS.saveRulesBtn.addEventListener('click', saveModeRules);
    ELEMENTS.modeSelect.addEventListener('change', loadModeRules);
    ELEMENTS.changePasswordBtn.addEventListener('click', handleChangePassword);
    ELEMENTS.addScheduleBtn.addEventListener('click', addScheduleItem);
    ELEMENTS.masterToggle.addEventListener('change', handleMasterToggle);
    
    // Allow Enter key to unlock
    ELEMENTS.passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleUnlockOrSetup();
        }
    });

    // Schedule Delete Delegation (Fixed Bug)
    ELEMENTS.scheduleEditor.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.classList.contains('delete-btn')) {
            const time = e.target.dataset.time;
            deleteScheduleItem(time);
        }
    });

    // Radio change -> Update Label
    document.querySelectorAll('input[name="modeType"]').forEach(radio => {
        radio.addEventListener('change', updateListLabel);
    });

    // Navigation handlers
    setupNavigation();
    
    // Usage stats handlers
    if (ELEMENTS.clearUsageBtn) {
        ELEMENTS.clearUsageBtn.addEventListener('click', handleClearUsage);
    }
    
    setupUsageFilterUI();
    setupUsageStats();
}

function getDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getDatesInRange(startStr, endStr) {
    const dates = [];
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (start > end) return dates;
    const cur = new Date(start);
    while (cur <= end) {
        dates.push(getDateString(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

function setUsageDateDefaults() {
    const today = getDateString(new Date());
    if (ELEMENTS.usageDateSingle) ELEMENTS.usageDateSingle.value = today;
    if (ELEMENTS.usageDateStart) ELEMENTS.usageDateStart.value = today;
    if (ELEMENTS.usageDateEnd) ELEMENTS.usageDateEnd.value = today;
}

function setupUsageFilterUI() {
    if (!ELEMENTS.usageFilterToday) return;
    
    setUsageDateDefaults();
    
    function updateFilterVisibility() {
        const isToday = ELEMENTS.usageFilterToday.checked;
        const isRange = ELEMENTS.usageFilterRange.checked;
        if (ELEMENTS.usageDateSingleWrap) {
            ELEMENTS.usageDateSingleWrap.style.display = isToday ? 'flex' : 'none';
        }
        if (ELEMENTS.usageDateRangeWrap) {
            ELEMENTS.usageDateRangeWrap.style.display = isRange ? 'flex' : 'none';
        }
        loadUsageStats();
    }
    
    ELEMENTS.usageFilterToday.addEventListener('change', updateFilterVisibility);
    ELEMENTS.usageFilterRange.addEventListener('change', updateFilterVisibility);
    ELEMENTS.usageFilterAll.addEventListener('change', updateFilterVisibility);
    if (ELEMENTS.usageDateSingle) ELEMENTS.usageDateSingle.addEventListener('change', loadUsageStats);
    if (ELEMENTS.usageDateStart) ELEMENTS.usageDateStart.addEventListener('change', loadUsageStats);
    if (ELEMENTS.usageDateEnd) ELEMENTS.usageDateEnd.addEventListener('change', loadUsageStats);
}

function setupUsageStats() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.dataset.section === 'usage') {
            item.addEventListener('click', () => {
                setUsageDateDefaults();
                setTimeout(loadUsageStats, 100);
            });
        }
    });
    if (document.getElementById('usage-section').classList.contains('active')) {
        loadUsageStats();
    }
}

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

async function loadUsageStats() {
    if (!ELEMENTS.usageStats) return;
    
    try {
        const data = await chrome.storage.local.get(['usageStats']);
        const stats = data.usageStats || {};
        
        const filter = ELEMENTS.usageFilterToday?.checked ? 'today'
            : ELEMENTS.usageFilterRange?.checked ? 'range'
            : 'all';
        
        let entries = [];
        
        if (filter === 'all') {
            entries = Object.entries(stats).map(([domain, d]) => ({
                domain,
                totalSeconds: d.totalSeconds || 0,
                visitCount: d.visitCount || 0,
                lastVisited: d.lastVisited
            })).filter(e => e.totalSeconds > 0 || e.visitCount > 0);
        } else {
            const dateKeys = filter === 'today'
                ? [ELEMENTS.usageDateSingle?.value || getDateString(new Date())]
                : getDatesInRange(
                    ELEMENTS.usageDateStart?.value || getDateString(new Date()),
                    ELEMENTS.usageDateEnd?.value || getDateString(new Date())
                );
            
            const byDomain = {};
            for (const [domain, d] of Object.entries(stats)) {
                const days = d.days || {};
                let totalSeconds = 0;
                let visitCount = 0;
                for (const key of dateKeys) {
                    if (days[key]) {
                        totalSeconds += days[key].totalSeconds || 0;
                        visitCount += days[key].visitCount || 0;
                    }
                }
                if (totalSeconds > 0 || visitCount > 0) {
                    byDomain[domain] = { totalSeconds, visitCount, lastVisited: d.lastVisited };
                }
            }
            entries = Object.entries(byDomain).map(([domain, d]) => ({ domain, ...d }));
        }
        
        if (entries.length === 0) {
            let msg;
            if (filter === 'all') {
                msg = 'No usage data yet. Time will be tracked when you browse with the extension enabled.';
            } else {
                msg = filter === 'today' 
                    ? 'No usage for the selected date.' 
                    : 'No usage for the selected date range.';
                // Add note about old data
                msg += '<br><small style="opacity: 0.7; margin-top: 0.5rem; display: block;">Note: Only data tracked after the date filtering feature was added will appear here. Use "All time" to see older data.</small>';
            }
            ELEMENTS.usageStats.innerHTML = `<p style="color: var(--text-secondary);">${msg}</p>`;
            return;
        }
        
        entries.sort((a, b) => b.totalSeconds - a.totalSeconds);
        
        let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
        entries.forEach(({ domain, totalSeconds, visitCount, lastVisited }) => {
            html += `
                <div style="background: var(--surface-elevated); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <strong style="font-size: 1rem; color: var(--text-primary);">${domain}</strong>
                        <span style="font-size: 1rem; color: var(--primary-color); font-weight: 600;">${formatTime(totalSeconds)}</span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">
                        Visits: ${visitCount}${filter === 'all' && lastVisited ? ' | Last: ' + new Date(lastVisited).toLocaleString() : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        ELEMENTS.usageStats.innerHTML = html;
    } catch (error) {
        console.error('Error loading usage stats:', error);
        ELEMENTS.usageStats.innerHTML = '<p style="color: var(--danger-color);">Error loading usage statistics.</p>';
    }
}

async function handleClearUsage() {
    const confirmClear = confirm("Are you sure you want to clear all usage statistics? This cannot be undone.");
    if (confirmClear) {
        await chrome.storage.local.set({ usageStats: {} });
        await loadUsageStats();
    }
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetSection = item.dataset.section;

            // Update active nav item
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Show target section
            sections.forEach(section => section.classList.remove('active'));
            document.getElementById(`${targetSection}-section`).classList.add('active');
        });
    });
}

function checkLockState() {
    if (!currentConfig.passwordHash) {
        ELEMENTS.lockTitle.textContent = "Welcome to Duofocus";
        ELEMENTS.lockMessage.textContent = "Please set a parent password to protect these settings.";
        ELEMENTS.unlockBtn.textContent = "Set Password";
        // Also hide sidebar or whatever if we had one
    } else {
        ELEMENTS.lockTitle.textContent = "Settings Locked";
        ELEMENTS.lockMessage.textContent = "Enter password to continue.";
        ELEMENTS.unlockBtn.textContent = "Unlock";
    }
}

async function handleUnlockOrSetup() {
    const password = ELEMENTS.passwordInput.value;
    if (!password) {
        ELEMENTS.lockError.textContent = "Password cannot be empty.";
        return;
    }

    if (!currentConfig.passwordHash) {
        const { salt, hash } = await hashPassword(password);
        currentConfig.passwordHash = { salt, hash };
        await saveConfig();
        showSettings();
    } else {
        // Check if passwordHash has the correct structure
        if (!currentConfig.passwordHash.salt || !currentConfig.passwordHash.hash) {
            ELEMENTS.lockError.textContent = "Password data corrupted. Please reset password.";
            console.error("Password hash structure invalid:", currentConfig.passwordHash);
            return;
        }
        
        const { salt, hash } = currentConfig.passwordHash;
        const valid = await verifyPassword(password, salt, hash);
        if (valid) {
            showSettings();
        } else {
            ELEMENTS.lockError.textContent = "Incorrect password.";
        }
    }
    ELEMENTS.passwordInput.value = '';
}

function showSettings() {
    ELEMENTS.lockScreen.classList.add('hidden');
    ELEMENTS.settingsPanel.classList.remove('hidden');

    // Set Master Toggle Status
    ELEMENTS.masterToggle.checked = currentConfig.masterEnabled;

    renderSchedule();
    loadModeRules();
}

async function handleMasterToggle(e) {
    const isEnabled = e.target.checked;
    currentConfig.masterEnabled = isEnabled;
    await saveConfig();
}

async function saveConfig() {
    await chrome.storage.local.set({ config: currentConfig });
}

function renderSchedule() {
    const container = ELEMENTS.scheduleEditor;
    container.innerHTML = '';

    const times = Object.keys(currentConfig.schedule).sort();

    times.forEach(time => {
        const mode = currentConfig.schedule[time];
        const row = document.createElement('div');
        row.className = 'schedule-row';

        row.innerHTML = `
            <strong>${time}</strong>
            <select data-time="${time}" class="schedule-mode-select">
                <option value="study" ${mode === 'study' ? 'selected' : ''}>Study</option>
                <option value="free" ${mode === 'free' ? 'selected' : ''}>Free</option>
                <option value="sleep" ${mode === 'sleep' ? 'selected' : ''}>Sleep</option>
            </select>
            <button class="danger delete-btn" data-time="${time}">Delete</button>
        `;
        container.appendChild(row);
    });

    // Listen for mode changes in rows
    container.querySelectorAll('.schedule-mode-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const time = e.target.dataset.time;
            currentConfig.schedule[time] = e.target.value;
            saveConfig();
        });
    });
}

async function deleteScheduleItem(time) {
    delete currentConfig.schedule[time];
    await saveConfig();
    renderSchedule();
}

async function addScheduleItem() {
    const time = document.getElementById('newTime').value;
    const mode = document.getElementById('newMode').value;

    if (!time) return;

    currentConfig.schedule[time] = mode;
    await saveConfig();
    renderSchedule();
}

function loadModeRules() {
    const mode = ELEMENTS.modeSelect.value;
    const settings = currentConfig.modes[mode] || { type: 'allowlist', domains: [] };

    // Set Radio
    if (settings.type === 'blocklist') {
        ELEMENTS.radioBlocklist.checked = true;
    } else {
        ELEMENTS.radioAllowlist.checked = true;
    }

    // Set Text
    ELEMENTS.domainListInput.value = settings.domains.join('\n');

    updateListLabel();
}

function updateListLabel() {
    const isBlocklist = ELEMENTS.radioBlocklist.checked;
    ELEMENTS.listLabel.textContent = isBlocklist
        ? "Blocked Domains (one per line):"
        : "Allowed Domains (one per line):";
}

async function saveModeRules() {
    const mode = ELEMENTS.modeSelect.value;
    const text = ELEMENTS.domainListInput.value;
    const list = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    const type = ELEMENTS.radioBlocklist.checked ? 'blocklist' : 'allowlist';

    currentConfig.modes[mode] = { type, domains: list };
    await saveConfig();

    // Provide feedback
    const originalText = ELEMENTS.saveRulesBtn.textContent;
    ELEMENTS.saveRulesBtn.textContent = "Saved!";
    setTimeout(() => ELEMENTS.saveRulesBtn.textContent = originalText, 1500);
}

async function handleResetPassword() {
    const confirmReset = confirm("WARNING: This will reset your password and clear ALL settings (schedule, rules, etc.). Are you absolutely sure?");
    if (confirmReset) {
        await chrome.storage.local.clear();
        location.reload();
    }
}

async function handleChangePassword() {
    const confirmReset = confirm("Are you sure you want to change the password? This will lock the interface until you set a new one.");
    if (confirmReset) {
        currentConfig.passwordHash = null;
        await saveConfig();
        location.reload();
    }
}
