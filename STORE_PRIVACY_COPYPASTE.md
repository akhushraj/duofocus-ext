# Chrome Web Store – Copy-paste for "Unable to publish" errors

Use this on the **Privacy practices** tab and **Account** tab so you can publish.

---

## 1. Account tab (do first)

- **Contact email:** Enter your real email (e.g. your Gmail).
- **Verify contact email:** Click the link to verify, then complete the steps (check email, click link or enter code).

---

## 2. Privacy practices tab – Permission justifications

Paste each line into the matching field.

### alarms
```
Used to run the schedule check every minute so blocking rules (Study / Free / Sleep) stay in sync with the time of day.
```

### declarativeNetRequest
```
Used to block or allow websites according to the user's schedule and allowlist/blocklist. No network requests are made; rules are applied locally in the browser.
```

### host permission / &lt;all_urls&gt;
```
Required to evaluate which tabs match the user's schedule and allowlist/blocklist, and to block or allow navigation. No data is sent to external servers.
```

### remote code
```
This extension does not use remote code. All code is included in the extension package and runs locally.
```

### storage
```
Used to store the user's schedule, mode rules (allowlist/blocklist), password hash, and optional usage statistics locally. No data is sent to external servers.
```

### tabs
```
Used to detect the active tab for optional usage time tracking (time spent per site). Only the active tab's URL is used locally; no data is sent externally.
```

### webNavigation
```
Used to detect redirect chains so the blocked page can show which intermediate domain is preventing an allowed site from loading, and to distinguish user-typed URLs from server-side redirects.
```

---

## 3. Single purpose description

Paste this into the **single purpose** field:

```
Duofocus is a time-based site blocker that lets users set a schedule (e.g. Study, Free, Sleep) and block or allow sites by time. Settings are password-protected and stored locally. Optional usage tracking records time spent per site when the extension is enabled and the tab is focused.
```

---

## 4. Data usage certification

- On the Privacy practices tab, find the **data usage / Developer Program Policies** certification.
- Check the box that you comply with the policies.
- In the data usage section, state that you **do not collect personal data** and that **all data is stored locally** (schedule, rules, password hash, usage stats). No data is sent to your servers or third parties.

---

## 5. After filling everything

1. Click **Save draft**.
2. Try **Submit for review** again.

If any field has a character limit, shorten the text but keep the same meaning. If a new error appears, share the exact message and we can adjust the text.
