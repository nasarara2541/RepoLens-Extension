# RepoLens Chrome Extension

RepoLens is a Chrome side panel extension that helps contributors discover **evidence-backed, good-first contributions** in any GitHub repository.

Instead of guessing where to start, you open a repository and let RepoLens analyze it (without executing repository code), then it suggests contribution tasks matched to your:

- experience level,
- available time, and
- preferred focus area.

---

## What this extension does

When you open a GitHub repository and click the RepoLens extension:

1. It detects the current repository from the active tab.
2. It sends the repository URL + your contributor profile to the RepoLens app backend.
3. It receives an analysis summary.
4. It shows ranked contribution suggestions with confidence and evidence.
5. It lets you:
   - inspect evidence used for each suggestion,
   - copy a suggested task,
   - open a prefilled GitHub Issue draft,
   - open a full report in the RepoLens web app.

---

## Key features

- **Automatic GitHub repo detection** from your active browser tab.
- **Contributor profile matching**:
  - Experience: New / Comfortable / Advanced
  - Time: 30 min / 2 hours / Weekend
  - Focus: Docs, Tests, Cleanup, Frontend, or Best overall
- **Evidence-backed recommendations** with confidence labels.
- **Cached scans** to avoid unnecessary repeat analysis (15-minute cache window).
- **Read-only safety posture** with no repository code execution.
- **Side panel UX** for quick use while browsing GitHub.

---

## Project structure

```text
RepoLens-Extension/
├─ README.md
└─ repolens-chrome-extension-v0.1.0/
   ├─ manifest.json
   ├─ background.js
   ├─ config.js
   ├─ lib.js
   ├─ sidepanel.html
   ├─ sidepanel.css
   ├─ sidepanel.js
   └─ icons/
```

---

## Requirements

- Google Chrome **114+**
- Access to GitHub in your browser
- Internet access to reach the RepoLens app backend

Current backend origin configured in the extension:

- `https://repolens-teal.vercel.app`

---

## Installation (developer mode / unpacked)

Use these steps to run the extension locally:

1. Clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked**.
5. Select the folder:
   - `repolens-chrome-extension-v0.1.0`
6. Pin the RepoLens extension from the extensions toolbar (optional but recommended).

That’s it — RepoLens is ready.

---

## How to use RepoLens (step-by-step)

1. Open any repository on GitHub (for example `https://github.com/{owner}/{repo}`).
2. Click the **RepoLens** extension icon.
3. The side panel opens and detects the repository automatically.
4. In **Make it fit me**, choose:
   - your experience,
   - your available time,
   - your preferred focus.
5. Click **Find work for me**.
6. Wait for analysis to complete.
7. Review the returned matches:
   - title,
   - recommendation,
   - difficulty,
   - confidence,
   - category.
8. (Optional) Click **Review evidence** on any match to inspect supporting signals.
9. (Optional) Click **Copy task** to copy the suggested work item.
10. (Optional) Click **Draft GitHub issue** to open a prefilled issue draft.
11. (Optional) Click **Open the full evidence report** for a deeper report in the web app.

---

## Privacy & behavior notes

- The extension is designed as a **read-only companion**.
- Repository code is **not executed** in your browser by RepoLens.
- For analysis, the extension sends only necessary request payload data (repository URL + selected profile) to the RepoLens backend endpoint.

---

## Caching behavior

- Scan results are cached in `chrome.storage.local`.
- Cache TTL is currently **15 minutes** (`cacheMinutes` in `config.js`).
- Re-opening the same repo/profile combination within TTL may load cached results.

---

## Configuration

Backend origin and caching are configured in:

- `repolens-chrome-extension-v0.1.0/config.js`

```js
export const REPOLENS_CONFIG = Object.freeze({
  appOrigin: "https://repolens-teal.vercel.app",
  cacheMinutes: 15,
});
```

If your backend changes, update `appOrigin` and reload the extension in `chrome://extensions`.

---

## Permissions used

From `manifest.json`:

- `activeTab`: detect the current GitHub tab.
- `sidePanel`: render and control the side panel UI.
- `storage`: store profile and cache locally.

Host permissions:

- `https://github.com/*`
- `https://repolens-teal.vercel.app/*`

---

## Troubleshooting

### 1) “Open a repository to find useful work” keeps showing
- Ensure your active tab URL is a GitHub repository page.
- Refresh the tab and click the extension again.
- Use the side panel refresh button.

### 2) Analysis fails with a rate limit message
- GitHub public rate limits may be temporarily exceeded.
- Wait and retry.
- If available in your web app flow, connect GitHub for higher/private access.

### 3) Private repositories are not analyzed
- Public-only access may not include private repositories.
- Open the RepoLens web app and authenticate/connect GitHub where supported.

### 4) Extension changes are not reflected
- Go to `chrome://extensions`.
- Click **Reload** on RepoLens.
- Re-open the side panel.

---

## Roadmap ideas

- Firefox/Edge support
- More profile dimensions (language stack, domain)
- Team mode and shared recommendation views
- Better private-repo onboarding

---

## License

No license is currently defined in this repository.

If this project is intended for reuse, add a `LICENSE` file (e.g., MIT/Apache-2.0).
