export const DEFAULT_PROFILE = Object.freeze({
  experience: "new",
  time: "two-hours",
  focus: "any",
});

const RESERVED_GITHUB_PATHS = new Set([
  "about",
  "apps",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "events",
  "explore",
  "features",
  "issues",
  "login",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "search",
  "security",
  "settings",
  "site",
  "sponsors",
  "topics",
  "trending",
]);

const FOCUS_CATEGORIES = Object.freeze({
  docs: ["community", "developer-experience", "documentation-quality"],
  tests: ["testing"],
  cleanup: ["maintainability"],
  frontend: ["frontend-quality"],
});

const VALID_PROFILE_VALUES = Object.freeze({
  experience: new Set(["new", "comfortable", "advanced"]),
  time: new Set(["half-hour", "two-hours", "weekend"]),
  focus: new Set(["any", "docs", "tests", "cleanup", "frontend"]),
});

export function normalizeGitHubRepositoryUrl(input) {
  let candidate = String(input ?? "").trim();
  if (!candidate) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);
  if (url.protocol !== "https:" || host !== "github.com" || segments.length < 2) return null;

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  const validSegment = /^[a-zA-Z0-9_.-]+$/;
  if (RESERVED_GITHUB_PATHS.has(owner.toLowerCase())
    || !validSegment.test(owner)
    || !validSegment.test(repo)) return null;

  return {
    owner,
    repo,
    name: `${owner}/${repo}`,
    repoUrl: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`,
  };
}

export function normalizeProfile(value) {
  const profile = value && typeof value === "object" ? value : {};
  return {
    experience: VALID_PROFILE_VALUES.experience.has(profile.experience)
      ? profile.experience
      : DEFAULT_PROFILE.experience,
    time: VALID_PROFILE_VALUES.time.has(profile.time) ? profile.time : DEFAULT_PROFILE.time,
    focus: VALID_PROFILE_VALUES.focus.has(profile.focus) ? profile.focus : DEFAULT_PROFILE.focus,
  };
}

export function contributionMatchScore(finding, profileInput) {
  const profile = normalizeProfile(profileInput);
  const severityScore = { high: 40, medium: 28, low: 14, info: 0 }[finding.severity] ?? 0;
  const confidenceScore = { high: 18, medium: 8, low: -20 }[finding.confidence] ?? -20;
  const timeScore = {
    "half-hour": { "quick-win": 28, moderate: -8, substantial: -20 },
    "two-hours": { "quick-win": 20, moderate: 28, substantial: -6 },
    weekend: { "quick-win": 10, moderate: 22, substantial: 30 },
  }[profile.time][finding.difficulty] ?? 0;
  const experienceScore = {
    new: { "quick-win": 18, moderate: 4, substantial: -12 },
    comfortable: { "quick-win": 9, moderate: 16, substantial: 3 },
    advanced: { "quick-win": 2, moderate: 10, substantial: 18 },
  }[profile.experience][finding.difficulty] ?? 0;
  const focusMatches = profile.focus === "any"
    || (FOCUS_CATEGORIES[profile.focus] ?? []).includes(finding.category);
  const focusScore = profile.focus === "any" ? 0 : focusMatches ? 30 : -10;
  return severityScore + confidenceScore + timeScore + experienceScore + focusScore;
}

export function rankContributionMatches(analysis, profileInput, limit = 3) {
  const findings = Array.isArray(analysis?.audit?.findings) ? analysis.audit.findings : [];
  const opportunities = Array.isArray(analysis?.audit?.opportunities)
    ? analysis.audit.opportunities
    : [];
  const readyIds = new Set(opportunities.map((opportunity) => opportunity.findingId));

  return findings
    .filter((finding) => readyIds.has(finding.id) && finding.contributionReady !== false)
    .sort((left, right) => contributionMatchScore(right, profileInput)
      - contributionMatchScore(left, profileInput)
      || String(left.title).localeCompare(String(right.title)))
    .slice(0, Math.max(0, limit));
}

export function summarizeAnalysis(analysis, profileInput) {
  const profile = normalizeProfile(profileInput);
  return {
    analysisId: String(analysis?.analysisId ?? ""),
    name: String(analysis?.name ?? "Repository"),
    repoUrl: String(analysis?.repoUrl ?? ""),
    coveragePercent: Number(analysis?.audit?.coverage?.coveragePercent ?? 0),
    complete: Boolean(analysis?.audit?.coverage?.complete),
    totalFindings: Array.isArray(analysis?.audit?.findings) ? analysis.audit.findings.length : 0,
    profile,
    matches: rankContributionMatches(analysis, profile).map((finding) => ({
      id: String(finding.id),
      title: String(finding.title),
      summary: String(finding.summary),
      recommendation: String(finding.recommendation),
      whyItMatters: String(finding.whyItMatters),
      task: String(finding.contributionTask),
      category: String(finding.category),
      confidence: String(finding.confidence),
      severity: String(finding.severity),
      difficulty: String(finding.difficulty),
      limitation: finding.limitation ? String(finding.limitation) : "",
      files: Array.isArray(finding.files) ? finding.files.slice(0, 5).map(String) : [],
      evidence: Array.isArray(finding.evidence)
        ? finding.evidence.slice(0, 4).map((item) => ({
          label: String(item.label),
          value: String(item.value),
          file: item.location?.file ? String(item.location.file) : "",
          line: Number.isFinite(item.location?.lineStart) ? Number(item.location.lineStart) : null,
        }))
        : [],
    })),
  };
}

export function buildFullReportUrl(appOrigin, repoUrl, profileInput) {
  const profile = normalizeProfile(profileInput);
  const url = new URL("/", appOrigin);
  url.searchParams.set("repo", repoUrl);
  url.searchParams.set("experience", profile.experience);
  url.searchParams.set("time", profile.time);
  url.searchParams.set("focus", profile.focus);
  url.searchParams.set("analyze", "1");
  url.searchParams.set("source", "extension");
  url.hash = "opportunities";
  return url.toString();
}

export function buildIssueUrl(repoUrl, finding) {
  const body = [
    "## Suggested contribution",
    finding.task,
    "",
    "## Why this matters",
    finding.whyItMatters,
    "",
    "## Evidence",
    ...finding.evidence.map((item) => `- ${item.label}: ${item.value}`),
    "",
    finding.limitation ? `> Verification note: ${finding.limitation}` : "",
    "",
    "Generated as a starting point by RepoLens. Please verify with a maintainer before implementation.",
  ].filter(Boolean).join("\n");
  const url = new URL(`${repoUrl}/issues/new`);
  url.searchParams.set("title", finding.title);
  url.searchParams.set("body", body);
  return url.toString();
}

export function cacheKey(repoUrl, profileInput) {
  const profile = normalizeProfile(profileInput);
  return `analysis:${repoUrl}:${profile.experience}:${profile.time}:${profile.focus}`;
}
