/**
 * Duofocus Utilities
 * Shared logic for time, mode, and crypto.
 */

const MODES = {
    STUDY: 'study',
    FREE: 'free',
    SLEEP: 'sleep',
    DEFAULT: 'free' // Fallback
};

// Default configuration
const DEFAULT_CONFIG = {
    passwordHash: null, // { salt: '...', hash: '...' }
    schedule: {
        // 24h format: Start time -> Mode
        // Sorted by time.
        // Example: "15:00": "study", "18:00": "free", "20:00": "sleep", "07:00": "free"
        "07:00": "free",
        "15:00": "study",
        "18:00": "free",
        "20:00": "sleep"
    },
    // New Schema: modes
    modes: {
        study: {
            type: 'allowlist',
            domains: ['google.com', 'wikipedia.org', 'stackoverflow.com', 'github.com']
        },
        free: {
            type: 'blocklist',
            domains: [] // Block nothing by default
        },
        sleep: {
            type: 'allowlist',
            domains: [] // Allow nothing
        }
    }
};

/**
 * getCurrentMode
 * Determines the current mode based on system time and schedule.
 * @param {Object} schedule - Schedule object
 * @returns {String} mode
 */
function getCurrentMode(schedule) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Sort schedule times
    const times = Object.keys(schedule).sort();

    if (times.length === 0) return MODES.DEFAULT;

    // Find the latest time key that is <= current time
    // Times are "HH:MM"
    const timeToMin = (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    let activeTime = null;

    for (let i = 0; i < times.length; i++) {
        if (currentMinutes >= timeToMin(times[i])) {
            activeTime = times[i];
        } else {
            break; // Since it's sorted, we can stop early
        }
    }

    // If current time is earlier than the first schedule item, 
    // it means we wrap around to the last schedule item of the "previous day"
    if (activeTime === null) {
        activeTime = times[times.length - 1];
    }

    return schedule[activeTime];
}

/**
 * hashPassword
 * PBKDF2 or SHA-256 hash logic.
 * Simple Approach: specific user request says "Hash locally using Web Crypto (SHA-256). Store only salt + hash"
 * @param {string} password 
 * @param {string} [salt] - Hex string if verifying, null if new
 * @returns {Promise<{salt: string, hash: string}>}
 */
async function hashPassword(password, salt = null) {
    const enc = new TextEncoder();

    if (!salt) {
        const saltBytes = crypto.getRandomValues(new Uint8Array(16));
        salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // We will simply confirm Pwd + Salt -> SHA-256
    // More robust: PBKDF2, but request asked for SHA-256. 
    // Let's do: SHA-256(salt + password)
    const keyMaterial = enc.encode(salt + password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyMaterial);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return { salt, hash };
}

/**
 * verifyPassword
 * @param {string} password
 * @param {string} storedSalt
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, storedSalt, storedHash) {
    const result = await hashPassword(password, storedSalt);
    return result.hash === storedHash;
}

/**
 * wouldBeBlocked
 * Checks whether a given URL would currently be blocked by the active rules.
 * Mirrors the logic in applyRules() so blocked.html can decide whether to
 * auto-navigate after a config change or page refresh.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function wouldBeBlocked(url) {
    try {
        const data = await chrome.storage.local.get(['config', 'currentMode']);
        const config = data.config || DEFAULT_CONFIG;

        // Master switch off → nothing is blocked
        if (config.masterEnabled === false) return false;

        const mode = data.currentMode || getCurrentMode(config.schedule);
        const modeSettings = (config.modes && config.modes[mode]) || { type: 'allowlist', domains: [] };
        const domains = modeSettings.domains || [];

        let hostname;
        try { hostname = new URL(url).hostname.replace('www.', ''); } catch (e) { return false; }

        if (modeSettings.type === 'allowlist') {
            // Blocked unless the domain (or a parent domain) is explicitly allowed
            return !domains.some(d => hostname === d || hostname.endsWith('.' + d));
        } else {
            // Blocked only if the domain is in the blocklist
            return domains.some(d => hostname === d || hostname.endsWith('.' + d));
        }
    } catch (e) {
        return false;
    }
}
