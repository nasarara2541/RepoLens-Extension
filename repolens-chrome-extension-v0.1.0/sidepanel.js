import { REPOLENS_CONFIG } from "./config.js";
import {
  DEFAULT_PROFILE,
  buildFullReportUrl,
  buildIssueUrl,
  cacheKey,
  normalizeGitHubRepositoryUrl,
  normalizeProfile,
  summarizeAnalysis,
} from "./lib.js";

const elements = {
  welcome: document.querySelector("#welcome-view"),
  repositoryView: document.querySelector("#repository-view"),
  repositoryName: document.querySelector("#repository-name"),
  preferences: document.querySelector("#preferences"),
  preferenceSummary: document.querySelector("#preference-summary"),
  experience: document.querySelector("#experience"),
  time: document.querySelector("#time"),
  focus: document.querySelector("#focus"),
  analyze: document.querySelector("#analyze"),
  loading: document.querySelector("#loading-view"),
  loadingCopy: document.querySelector("#loading-copy"),
  error: document.querySelector("#error-view"),
  errorMessage: document.querySelector("#error-message"),
  results: document.querySelector("#results-view"),
  resultsTitle: document.querySelector("#results-title"),
  resultsSummary: document.querySelector("#results-summary"),
  coverageValue: document.querySelector("#coverage-value"),
  matchList: document.querySelector("#match-list"),
  fullReport: document.querySelector("#open-full-report"),
  toast: document.querySelector("#toast"),
};

const labels = {
  experience: {
    new: "New contributor",
    comfortable: "Comfortable with code",
    advanced: "Experienced maintainer",
  },
  time: {
    "half-hour": "About 30 minutes",
    "two-hours": "A couple of hours",
    weekend: "A weekend",
  },
  category: {
    community: "Community",
    "developer-experience": "Developer experience",
    "documentation-quality": "Documentation",
    testing: "Tests & CI",
    maintainability: "Maintainability",
    "frontend-quality": "Frontend",
  },
  difficulty: {
    "quick-win": "Under 1 hour",
    moderate: "1–3 hours",
    substantial: "A weekend",
  },
};

let currentRepository = null;
let currentProfile = { ...DEFAULT_PROFILE };
let currentSummary = null;
let toastTimer = null;
let scanSequence = 0;

function setHidden(element, hidden) {
  element.hidden = hidden;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function openTab(url) {
  void chrome.tabs.create({ url });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 2200);
}

function showState(state) {
  setHidden(elements.loading, state !== "loading");
  setHidden(elements.error, state !== "error");
  setHidden(elements.results, state !== "results");
  elements.analyze.disabled = state === "loading";
  elements.analyze.querySelector("span").textContent = state === "results" ? "Scan again" : "Find work for me";
}

function updatePreferenceSummary() {
  elements.preferenceSummary.textContent = `${labels.experience[currentProfile.experience]} · ${labels.time[currentProfile.time]}`;
}

async function saveProfile() {
  currentProfile = normalizeProfile({
    experience: elements.experience.value,
    time: elements.time.value,
    focus: elements.focus.value,
  });
  updatePreferenceSummary();
  await chrome.storage.local.set({ contributorProfile: currentProfile });
}

function setProfileInputs(profileInput) {
  currentProfile = normalizeProfile(profileInput);
  elements.experience.value = currentProfile.experience;
  elements.time.value = currentProfile.time;
  elements.focus.value = currentProfile.focus;
  updatePreferenceSummary();
}

async function readActiveRepository() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return normalizeGitHubRepositoryUrl(tab?.url);
}

async function detectRepository({ analyze = true } = {}) {
  const detected = await readActiveRepository();
  currentSummary = null;
  currentRepository = detected;
  setHidden(elements.welcome, Boolean(detected));
  setHidden(elements.repositoryView, !detected);
  showState("idle");
  if (!detected) return;

  elements.repositoryName.textContent = detected.name;
  if (analyze) await analyzeRepository({ preferCache: true });
}

async function loadCachedSummary() {
  const key = cacheKey(currentRepository.repoUrl, currentProfile);
  const stored = await chrome.storage.local.get(key);
  const cached = stored[key];
  const maxAge = REPOLENS_CONFIG.cacheMinutes * 60 * 1000;
  if (!cached || Date.now() - cached.savedAt > maxAge) return null;
  return cached.summary;
}

async function cacheSummary(summary) {
  const key = cacheKey(currentRepository.repoUrl, currentProfile);
  await chrome.storage.local.set({ [key]: { savedAt: Date.now(), summary } });
}

function friendlyError(response, body) {
  if (response.status === 404) return "That repository is private, missing, or unavailable. Open the web app and connect GitHub for private repositories.";
  if (response.status === 429) return "GitHub’s public rate limit is busy. Wait a little, or connect GitHub in the web app.";
  if (response.status === 422) return body?.error || "This repository could not be fully read within the current analysis limits.";
  return body?.error || "The repository could not be analyzed. Please try again.";
}

async function analyzeRepository({ preferCache = false } = {}) {
  if (!currentRepository) return;
  const sequence = ++scanSequence;
  showState("loading");
  elements.loadingCopy.textContent = "Checking repository evidence without running its code.";

  try {
    if (preferCache) {
      const cached = await loadCachedSummary();
      if (cached && sequence === scanSequence) {
        currentSummary = cached;
        renderResults(cached, true);
        return;
      }
    }

    const response = await fetch(`${REPOLENS_CONFIG.appOrigin}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({ repoUrl: currentRepository.repoUrl, profile: currentProfile }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.audit) throw new Error(friendlyError(response, body));
    if (sequence !== scanSequence) return;

    const summary = summarizeAnalysis(body, currentProfile);
    currentSummary = summary;
    await cacheSummary(summary);
    renderResults(summary, false);

    if (body.analysisId) {
      void fetch(`${REPOLENS_CONFIG.appOrigin}/api/analyze/${encodeURIComponent(body.analysisId)}`, {
        method: "DELETE",
        credentials: "omit",
      }).catch(() => undefined);
    }
  } catch (error) {
    if (sequence !== scanSequence) return;
    elements.errorMessage.textContent = error instanceof Error ? error.message : "The repository could not be analyzed.";
    showState("error");
  }
}

function renderEvidence(finding) {
  const panel = createElement("div", "evidence-panel");
  panel.hidden = true;
  panel.append(createElement("h4", "", "Evidence checked"));
  const list = createElement("ul");
  for (const evidence of finding.evidence) {
    const item = createElement("li");
    item.append(createElement("strong", "", evidence.label));
    item.append(document.createTextNode(evidence.value));
    if (evidence.file) {
      item.append(document.createElement("br"));
      item.append(createElement("code", "", `${evidence.file}${evidence.line ? `:${evidence.line}` : ""}`));
    }
    list.append(item);
  }
  if (finding.evidence.length === 0) list.append(createElement("li", "", "Open the full report to review the source evidence."));
  panel.append(list);
  if (finding.limitation) panel.append(createElement("p", "limitation", finding.limitation));
  return panel;
}

function renderMatch(finding, index) {
  const card = createElement("article", `match-card${index === 0 ? " match-card--best" : ""}`);
  if (index === 0) card.append(createElement("span", "match-card__accent"));
  const content = createElement("div", "match-card__content");
  const top = createElement("div", "match-card__top");
  top.append(createElement("span", "rank", index === 0 ? "Best match · 01" : `Match ${String(index + 1).padStart(2, "0")}`));
  const meta = createElement("div", "meta");
  meta.append(createElement("span", "badge", labels.difficulty[finding.difficulty] ?? finding.difficulty));
  meta.append(createElement("span", "badge badge--confidence", `${finding.confidence} confidence`));
  top.append(meta);
  content.append(top);
  content.append(createElement("h3", "", finding.title));
  content.append(createElement("p", "", finding.recommendation));

  const reasons = createElement("ul", "match-reasons");
  reasons.append(createElement("li", "", labels.category[finding.category] ?? finding.category));
  reasons.append(createElement("li", "", labels.difficulty[finding.difficulty] ?? finding.difficulty));
  content.append(reasons);

  const evidence = renderEvidence(finding);
  const actions = createElement("div", "match-card__actions");
  const evidenceButton = createElement("button", "text-button", "Review evidence");
  evidenceButton.type = "button";
  evidenceButton.addEventListener("click", () => {
    evidence.hidden = !evidence.hidden;
    evidenceButton.textContent = evidence.hidden ? "Review evidence" : "Hide evidence";
  });
  const copyButton = createElement("button", "text-button", "Copy task");
  copyButton.type = "button";
  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(finding.task);
    showToast("Task copied — you’ve got this ✦");
  });
  const issueButton = createElement("button", "text-button text-button--dark", "Draft GitHub issue ↗");
  issueButton.type = "button";
  issueButton.addEventListener("click", () => openTab(buildIssueUrl(currentRepository.repoUrl, finding)));
  issueButton.style.gridColumn = "1 / -1";
  actions.append(evidenceButton, copyButton, issueButton);
  content.append(actions, evidence);
  card.append(content);
  return card;
}

function renderResults(summary, fromCache) {
  elements.matchList.replaceChildren();
  const count = summary.matches.length;
  elements.resultsTitle.textContent = count > 0
    ? `${count} contribution${count === 1 ? "" : "s"} worth starting`
    : "No reliable match yet";
  elements.resultsSummary.textContent = fromCache
    ? `Saved scan for ${summary.name}. Scan again whenever the repository changes.`
    : `${summary.totalFindings} findings reviewed for your experience and available time.`;
  elements.coverageValue.textContent = `${summary.coveragePercent}%`;

  if (count === 0) {
    const empty = createElement("div", "error-card");
    empty.append(createElement("h2", "", "Nothing confident enough to recommend."));
    empty.append(createElement("p", "", "Try a different focus or open the full report to review every finding."));
    elements.matchList.append(empty);
  } else {
    summary.matches.forEach((finding, index) => elements.matchList.append(renderMatch(finding, index)));
  }
  showState("results");
}

async function initialize() {
  const stored = await chrome.storage.local.get("contributorProfile");
  setProfileInputs(stored.contributorProfile ?? DEFAULT_PROFILE);
  document.querySelector("#brand-link").addEventListener("click", (event) => {
    event.preventDefault();
    openTab(REPOLENS_CONFIG.appOrigin);
  });
  document.querySelector("#open-github").addEventListener("click", () => openTab("https://github.com/explore"));
  document.querySelector("#privacy-link").addEventListener("click", () => openTab(`${REPOLENS_CONFIG.appOrigin}/#top`));
  document.querySelector("#refresh-repository").addEventListener("click", () => void detectRepository({ analyze: true }));
  document.querySelector("#retry").addEventListener("click", () => void analyzeRepository());
  elements.analyze.addEventListener("click", () => void analyzeRepository());
  for (const select of [elements.experience, elements.time, elements.focus]) {
    select.addEventListener("change", () => void saveProfile());
  }
  elements.fullReport.addEventListener("click", () => {
    if (!currentRepository) return;
    openTab(buildFullReportUrl(REPOLENS_CONFIG.appOrigin, currentRepository.repoUrl, currentProfile));
  });

  chrome.tabs.onActivated.addListener(() => void detectRepository({ analyze: true }));
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.active) void detectRepository({ analyze: true });
  });
  await detectRepository({ analyze: true });
}

void initialize().catch((error) => {
  console.error("RepoLens extension failed to initialize.", error);
  setHidden(elements.welcome, false);
});
