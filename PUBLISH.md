# Publishing Duofocus to the Chrome Web Store

## 1. Create a Chrome Web Store developer account

1. Go to **https://chrome.google.com/webstore/devconsole**
2. Sign in with the **Google account** you want to use as the publisher (e.g. your personal Gmail).
3. Pay the **one-time $5 developer registration fee**.
4. Accept the Developer Distribution Agreement.

After that you can publish unlimited (free) extensions.

---

## 2. Prepare the extension zip

**Include only what the extension needs.** Do not include:
- `_metadata/` (Chrome/generated)
- `.DS_Store`
- `PUBLISH.md` (optional to exclude)
- Any `.git` or IDE files

**Required files:**
- `manifest.json`
- `service_worker.js`
- `utils.js`
- `options.html`, `options.js`
- `blocked.html`
- `styles.css`, `toggle.css`
- `rules.json`
- `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`

**Tip:** Before changing extension icons, back them up (e.g. copy to `icon16.png.bak` etc.) so you can restore the originals if needed.
- `icons/mascot.png` (used by blocked.html)

**Create the zip (from the `duofocus` folder):**

```bash
cd /Users/akhushraj/Development/experiments/duofocus

zip -r duofocus.zip . \
  -x "*.DS_Store" \
  -x "_metadata/*" \
  -x "*.git*" \
  -x "PUBLISH.md" \
  -x "icons/mascot_old.png"
```

Or use the script: `./build-store-zip.sh` (make it executable first: `chmod +x build-store-zip.sh`).

---

## 3. Upload to the Chrome Web Store

1. Go to **https://chrome.google.com/webstore/devconsole**
2. Click **"New Item"**.
3. Click **"Choose file"** and select `duofocus.zip`.
4. If you see errors (e.g. missing icons or manifest errors), fix them and re-zip, then upload again.

---

## 4. Fill in the store listing

You’ll be asked for:

| Field | What to use |
|-------|-------------|
| **Short description** | One line, e.g. "Time-based site blocker to help you focus. Schedule Study, Free, and Sleep modes." |
| **Detailed description** | A few sentences: what it does, who it’s for (e.g. parents/kids), that it’s local-only, password-protected settings, optional usage tracking. |
| **Category** | e.g. **Productivity** |
| **Language** | Primary language (e.g. English). |
| **Screenshots** | At least 1 image (1280x800 or 640x400). Screenshot the options page and/or blocked page. |
| **Small tile** | 440x280 px (Chrome can generate from your 128px icon if needed). |
| **Privacy** | If you don’t collect personal data, say “No personal data collected” and that data stays local. |

**Single permission justification (if asked):**
- **Storage:** Save schedule, rules, password hash, and usage stats locally.
- **declarativeNetRequest:** Block or allow sites by schedule.
- **alarms:** Run the schedule (e.g. every minute).
- **tabs:** Track active tab for usage time (optional; you can mention it’s for “time spent” only).
- **&lt;all_urls&gt;:** Needed so the blocker can match any site.

---

## 5. Submit for review

1. Complete all required fields (no red errors).
2. Set **visibility** (e.g. **Unlisted** if you don’t want it searchable; **Public** if you do).
3. Click **"Submit for review"**.

Review usually takes **1–3 business days** (sometimes longer). You’ll get an email when it’s approved or if changes are requested.

---

## 6. After approval – get the Extension ID

1. In the dev console, open your extension’s listing.
2. The **Extension ID** is in the URL and on the listing, e.g.:
   `https://chrome.google.com/webstore/detail/abcdefghijklmnopqrstuvwxyz123456`
   → ID = `abcdefghijklmnopqrstuvwxyz123456`.

Use this ID in the Mac **force-install** plist so the extension is required and cannot be removed (see your previous setup steps).

---

## 7. Updating the extension later

1. Bump **version** in `manifest.json` (e.g. `1.0.0` → `1.0.1`).
2. Create a new zip (same way as above).
3. In the dev console, open your item → **"Package"** → **"Upload new package"** → select the new zip.
4. Add **release notes** (e.g. “Bug fixes” or “New usage stats”).
5. Submit. Each update is reviewed again (usually quicker).

---

## Checklist before first submit

- [ ] Icons 16, 48, 128 present and correct.
- [ ] No `_metadata` or `.DS_Store` in the zip.
- [ ] Short and detailed description written.
- [ ] At least one screenshot (1280x800 or 640x400).
- [ ] Privacy explanation and permission justifications ready.
- [ ] Visibility chosen (Unlisted vs Public).

Once you’ve done this once, future updates are the same: bump version, zip, upload, submit.
