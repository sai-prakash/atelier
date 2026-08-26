const Agent = {
  understand(repos, issues, pulls, events) {
    const now = Date.now();
    const week = 7 * 24 * 3600 * 1000;
    const active = repos.filter((r) => now - new Date(r.pushed_at).getTime() < week);
    const stale = repos.filter((r) => now - new Date(r.pushed_at).getTime() > 90 * 24 * 3600 * 1000 && !r.archived);
    const byLang = {};
    repos.forEach((r) => { const lang = r.language || "Other"; byLang[lang] = (byLang[lang] || 0) + 1; });
    return {
      totals: { repos: repos.length, private: repos.filter((r) => r.private).length, active: active.length, stale: stale.length, issues: issues.length, pulls: pulls.length },
      languages: Object.entries(byLang).sort((a, b) => b[1] - a[1]).slice(0, 6),
      heat: repos.slice().sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at)).slice(0, 8).map(briefRepo),
      blockers: issues.filter((i) => (i.labels || []).some((l) => /block|p0|urgent|bug/i.test(l.name || l))),
      recent: (events || []).slice(0, 12).map((e) => ({ type: e.type, repo: e.repo && e.repo.name, at: e.created_at, title: summarizeEvent(e) })),
      stale: stale.slice(0, 8).map((r) => r.full_name),
    };
  },
  candidates(intent, repos, snapshot) {
    const text = (intent || "").trim();
    if (!text) throw new Error("Write the work in a sentence.");
    const advance = isAdvance(text);
    const ranked = repos.map((repo) => ({ repo, score: scoreRepo(text, repo, snapshot) })).sort((a, b) => b.score - a.score);
    if (advance) return ranked.slice(0, 6);
    return ranked.filter((c) => c.score > 0).slice(0, 5);
  },
  reason(intent, snapshot, evidence) {
    const text = (intent || "").trim();
    if (!text) throw new Error("Write the work in a sentence.");
    const inspections = (evidence || []).map(inspect);
    const slice = pickSlice(text, inspections, snapshot);
    const created = new Date().toISOString();
    if (!slice || slice.kind === "none") {
      return { intent: text, created, method: "work-order", mode: "none", summary: (slice && slice.why) || "Nothing to open.", slice: null, tasks: [], dont: ["New repository", "A second issue next to unfinished work", "More planning files"], evidence: inspections.slice(0, 4).map((x) => x.full + ": " + x.note), inspections };
    }
    const task = workOrder(text, slice);
    return { intent: text, created, method: "work-order", mode: slice.kind, summary: slice.why, slice: task, tasks: [task], dont: task.dont, evidence: task.evidence, inspections };
  },
  toMarkdown(plan) {
    if (!plan.slice) return ["# " + plan.intent, "", "NOTHING TO OPEN", "", plan.summary, "", "## Do not", ...(plan.dont || []).map((d) => "- " + d)].join("\n");
    return plan.slice.body;
  },
};
function briefRepo(r) { return { name: r.name, full: r.full_name, pushed: r.pushed_at, open: r.open_issues_count || 0, private: r.private, lang: r.language, desc: r.description || "" }; }
function isAdvance(intent) {
  if (/atelier|forgegraph|aether|social-engine|deep-agent|statix|capfile|wake\b/i.test(intent)) return false;
  return /no new repo|hottest work|finish one slice|advance the hottest|do not create/i.test(intent);
}
function forbidsNewRepo(intent) { return /no new repo|do not create a new repo|don't create a new repo|not a new repo/i.test(intent); }
function scoreRepo(intent, repo, snapshot) {
  const hay = haystack(repo); const words = tokenize(intent); let score = 0;
  words.forEach((w) => { if (hay.includes(w)) score += 3; });
  const families = [[/agent|harness|langgraph|swarm|orchestr/i, /agent|harness|forge|deep|graph|kimi|sidebrain/i, 8], [/graph|studio|swarm|forge/i, /graph|forgegraph|studio/i, 8], [/atlas|aether|catalog|observatory/i, /aether|atlas/i, 9], [/design|ux|thinking|wcag|prototype/i, /design|portfolio|ux/i, 6], [/social|reel|statix|vibe|desk|telegram/i, /social|statix|vibe|reel|engine/i, 10]];
  families.forEach(([q, r, w]) => { if (q.test(intent) && r.test(hay)) score += w; });
  const ageDays = (Date.now() - new Date(repo.pushed_at).getTime()) / 86400000;
  if (ageDays < 3) score += 4; else if (ageDays < 14) score += 2; else if (ageDays > 180) score -= 2;
  if (repo.archived) score -= 12;
  if (repo.name === "atelier") score += /atelier|tracker|studio|plan/.test(intent) ? 8 : -2;
  const open = repo.open_issues_count || 0;
  if (open > 0 && /close|finish|debt|issue|slice|hottest|advance/i.test(intent)) score += 8 + Math.min(open, 4);
  if (isAdvance(intent)) { score += Math.max(0, 10 - ageDays); if (open > 0) score += 12; if (repo.name === "atelier") score -= 6; }
  if ((snapshot.heat || []).find((h) => h.full === repo.full_name)) score += 1;
  return score;
}
function haystack(repo) { return (repo.name + " " + repo.full_name + " " + (repo.description || "") + " " + (repo.language || "")).toLowerCase(); }
function tokenize(text) { return String(text).toLowerCase().split(/[^a-z0-9/+.-]+/).filter((w) => w.length > 2 && !STOP.has(w)); }
const STOP = new Set("the and for with from that this into onto your you are was not all any can how what when why one".split(" "));
function inspect(ev) {
  const issues = (ev.issues || []).filter((i) => !i.pull_request);
  const withBoxes = issues.map((i) => {
    const boxes = parseBoxes(i.body || "");
    const openBox = boxes.find((b) => !b.checked);
    return { number: i.number, title: i.title, body: i.body || "", url: i.html_url || "", updated: i.updated_at, boxes, openBox, branch: findBranch(i.body || ""), spec: findSpec(i.body || "") };
  });
  const continueIssue = withBoxes.find((i) => i.openBox) || withBoxes[0] || null;
  const commits = (ev.commits || []).map((c) => firstLine(c)).filter(Boolean);
  const root = ev.root || []; const readme = ev.readme || "";
  return { full: ev.full, owner: ev.owner, name: ev.name, lang: ev.lang, pushed: ev.pushed, age: daysSince(ev.pushed), open: issues.length, root, hasReadme: !!(readme.trim()) || root.includes("README.md"), hasAgents: /AGENTS\.md/i.test(root.join("\n")) || /(^|\n)#+\s*agents\b/i.test(readme), hasPagesHint: hasLiveLink(readme, ev.homepage), homepage: ev.homepage || "", commits, docsHeavy: commits.length > 0 && commits.slice(0, 5).every(isDocsCommit), issues: withBoxes, continueIssue, firstUnchecked: continueIssue && continueIssue.openBox, note: continueIssue ? ("#" + continueIssue.number + " " + (continueIssue.openBox ? continueIssue.openBox.text : continueIssue.title)) : (commits[0] ? ("last: " + commits[0]) : "quiet") };
}
function relevantInspections(intent, inspections) {
  if (!inspections.length) return [];
  const lower = String(intent || "").toLowerCase();
  const named = inspections.filter((ev) => lower.includes(ev.name.toLowerCase()) || lower.includes(String(ev.full).toLowerCase()));
  if (named.length) return named;
  const words = tokenize(intent);
  const scored = inspections.map((ev) => {
    const hay = (ev.full + " " + ev.name + " " + (ev.commits || []).join(" ") + " " + (ev.issues || []).map((i) => (i.title || "") + " " + (i.body || "")).join(" ")).toLowerCase();
    let n = 0; words.forEach((w) => { if (hay.includes(w)) n += 1; }); return { ev, n };
  }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  if (scored.length) return scored.map((x) => x.ev);
  return isAdvance(intent) ? inspections : [];
}
function pickSlice(intent, inspections) {
  const pool = relevantInspections(intent, inspections);
  if (!pool.length) return { kind: "none", why: "That sentence does not match a repo or an open issue. Name the repo, or say finish one slice." };
  const ranked = pool.slice().sort((a, b) => rankInspect(b) - rankInspect(a));
  const noNew = forbidsNewRepo(intent) || isAdvance(intent);
  for (const ev of ranked) {
    if (ev.continueIssue && ev.firstUnchecked) return { kind: "continue", ev, issue: ev.continueIssue, box: ev.firstUnchecked, title: cleanTitle(ev.firstUnchecked.text).slice(0, 92), why: "Open issue #" + ev.continueIssue.number + " already has a checklist. The slice is the first empty box." };
  }
  for (const ev of ranked) {
    if (ev.continueIssue) return { kind: "continue", ev, issue: ev.continueIssue, box: null, title: cleanTitle(ev.continueIssue.title).slice(0, 92), why: "Open issue #" + ev.continueIssue.number + " has no checklist. The slice is that issue, not a new file." };
  }
  const named = inspections.some((ev) => String(intent).toLowerCase().includes(ev.name.toLowerCase()));
  const noInvent = noNew || named || /advance |finish one slice|use this repo/i.test(intent);
  if (noInvent && !ranked.find((e) => e.open > 0)) {
    const ev = ranked[0];
    return { kind: "none", why: (ev ? ev.full : "This repo") + " has no unfinished issue. Sit on an issue, or name a file. atelier will not invent AGENTS.md." };
  }
  for (const ev of ranked) {
    if (noInvent) break;
    if (!ev.hasReadme || !ev.hasAgents) {
      if (ev.open === 0 && ev.docsHeavy) continue;
      return { kind: "open", ev, issue: null, box: null, title: !ev.hasReadme ? "Write README so a cold start is possible" : "Write AGENTS.md from the last commits", why: ev.full + " is missing " + (!ev.hasReadme ? "README" : "AGENTS.md") + "." };
    }
  }
  for (const ev of ranked) {
    const staticSite = (ev.root || []).some((n) => /^index\.html$/i.test(n));
    if (staticSite && !ev.hasPagesHint) return { kind: "open", ev, issue: null, box: null, title: "Put a working Pages URL at the top of the README", why: ev.name + " looks like a site and has no Live URL." };
  }
  if (noNew && !ranked.find((e) => e.open > 0)) return { kind: "none", why: "No unfinished issue on the hot repos. Intent forbids a new repository." };
  const lead = ranked[0];
  if (!lead) return { kind: "none", why: "No repository scored." };
  const file = (lead.root || []).find((n) => /\.(js|ts|html|md)$/i.test(n)) || "README.md";
  return { kind: "open", ev: lead, issue: null, box: null, title: "Change " + file + " for: " + clip(intent, 48), why: "No open issue to continue. One slice in " + lead.full + ", naming a file that exists." };
}
function rankInspect(ev) {
  let n = 0;
  if (ev.firstUnchecked) n += 40; else if (ev.continueIssue) n += 20;
  if (ev.age <= 2) n += 8; else if (ev.age <= 14) n += 3;
  if (ev.docsHeavy && ev.open === 0) n -= 12;
  if (ev.name === "atelier") n -= 8;
  return n;
}
function workOrder(intent, slice) {
  const ev = slice.ev; const issue = slice.issue;
  let branch = (issue && issue.branch) || null; const spec = (issue && issue.spec) || null;
  if (branch && spec && (branch === spec || /\.[a-z0-9]{1,5}$/i.test(branch))) branch = null;
  const continues = issue ? issue.number : null; const title = slice.title;
  const doSteps = buildDo(slice, branch, spec); const done = buildDone(slice); const dont = buildDont(intent, slice); const evidence = buildEvidence(ev, slice);
  const body = ["# " + title, "", "INTENT " + intent, "REPO " + ev.full, "SLICE " + title, continues ? ("CONTINUE issue #" + continues + (branch ? " | branch " + branch : "") + (spec ? " | spec " + spec : "")) : "CONTINUE new issue", "", "## Do this sitting", ...doSteps.map((s, i) => (i + 1) + ". " + s), "", "## Done when", ...done.map((s) => "- [ ] " + s), "", "## Do not", ...dont.map((s) => "- " + s), "", "## Evidence", ...evidence.map((s) => "- " + s), ""].join("\n");
  return { id: "01", repo: ev.full, owner: ev.owner, name: ev.name, title, slice: title, continues, branch, spec, url: issue && issue.url, kind: slice.kind, do: doSteps, done, dont, evidence, why: slice.why, labels: ["atelier"], body };
}
function buildDo(slice, branch, spec) {
  const issue = slice.issue; const box = slice.box; const ev = slice.ev;
  if (slice.kind === "continue" && box) {
    const steps = [];
    if (branch) steps.push("git checkout " + branch + " (create that branch from main if it is missing).");
    else steps.push("Use the branch written on #" + issue.number + ", or create feat/ from main.");
    if (spec) steps.push("Open the spec file " + spec + " — that is a file, not a branch. Implement only: " + cleanTitle(box.text));
    else steps.push("Do only this box on #" + issue.number + ": " + cleanTitle(box.text));
    const others = (issue.boxes || []).filter((b) => !b.checked && b.text !== box.text);
    if (others.length) steps.push("Do not start " + others.slice(0, 3).map((b) => clip(cleanTitle(b.text), 24)).join(", ") + " in this sitting.");
    steps.push("Tick that box on #" + issue.number + ". Leave the other boxes.");
    return steps.slice(0, 5);
  }
  if (slice.kind === "continue") {
    const steps = [];
    if (issue && issue.branch) steps.push("git checkout " + issue.branch + " (create it from main if missing).");
    steps.push("Open #" + issue.number + ": " + cleanTitle(issue.title) + ".");
    if (issue && issue.spec) steps.push("The spec file is " + issue.spec + " — a file, not a branch.");
    steps.push("Do not open a second issue in " + ev.name + ".");
    return steps.slice(0, 4);
  }
  if (/README/.test(slice.title)) return ["Write README.md from the last commits.", "State how a stranger starts, in three steps."];
  if (/AGENTS/.test(slice.title)) return ["Write AGENTS.md from the last commits.", "Say what not to touch."];
  return ["Open " + ev.full + " and change only the named file.", "Do not add a repository."];
}
function buildDone(slice) {
  if (slice.kind === "continue" && slice.box) return [cleanTitle(slice.box.text) + " is checked on #" + slice.issue.number, "No new issue was opened in this repo"];
  if (slice.kind === "continue") return ["#" + slice.issue.number + " moved: comment, checkbox, or close"];
  return ["The named change is on main"];
}
function buildDont(intent, slice) {
  const list = [];
  if (forbidsNewRepo(intent) || isAdvance(intent)) list.push("New repository");
  if (slice.kind === "continue") list.push("A second issue next to #" + slice.issue.number);
  if (slice.box) {
    const rest = (slice.issue.boxes || []).filter((b) => !b.checked && b.text !== slice.box.text);
    if (rest.length) list.push("Later boxes: " + rest.slice(0, 4).map((b) => clip(cleanTitle(b.text), 28)).join("; "));
  }
  list.push("Extra planning files in atelier"); list.push("A paid provider call");
  return unique(list);
}
function buildEvidence(ev, slice) {
  const rows = [];
  if (slice.issue) rows.push(ev.name + "#" + slice.issue.number + " is open" + (slice.box ? " with an unchecked box: " + clip(cleanTitle(slice.box.text), 60) : ""));
  rows.push(ev.full + " last push " + ev.age + "d ago; last commit: " + (ev.commits[0] || "none"));
  rows.push(ev.open ? ev.open + " open issue(s) seen" : "No open issues seen on this repo");
  return rows.slice(0, 4);
}
function parseBoxes(body) {
  return String(body || "").split("\n").map((line) => {
    const m = line.match(/^\s*[-*+]\s*\[( |x|X)\]\s*(.+)$/);
    if (!m) return null;
    return { checked: m[1].toLowerCase() === "x", text: m[2].replace(/\s+/g, " ").trim() };
  }).filter(Boolean);
}
function findBranch(body) {
  const text = String(body || "");
  const looksFile = (s) => /\.[a-z0-9]{1,5}$/i.test(s) || /\/(docs|spec|specs|superpowers)\//i.test(s);
  const take = (s) => { if (!s || looksFile(s)) return null; return s.replace(/^[`'\"]+|[`'\"]+$/g, ""); };
  const labeled = text.match(/\bbranch(?:\s+name)?\s*[:\-]?\s*`?((?:feat|fix|chore|hotfix|refactor|test|build|ci)\/[A-Za-z0-9._/-]+)`?/i);
  if (labeled) return take(labeled[1]);
  const tick = text.match(/`((?:feat|fix|chore|hotfix|refactor)\/[A-Za-z0-9._/-]+)`/);
  if (tick) return take(tick[1]);
  const bare = text.match(/\b((?:feat|fix|chore|hotfix)\/[A-Za-z0-9._-][A-Za-z0-9._/-]*)/);
  return take(bare && bare[1]);
}
function findSpec(body) {
  const m = String(body || "").match(/((?:docs|spec|specs|superpowers)\/[A-Za-z0-9._/-]+\.md)/);
  return m ? m[1] : null;
}
function hasLiveLink(readme, homepage) {
  if (homepage && /github\.io|netlify|vercel|pages/i.test(homepage)) return true;
  return /https?:\/\/[^\s)]*github\.io[^\s)]*|^\s*live\s*:/im.test(readme || "");
}
function isDocsCommit(msg) { return /^(docs?|note|readme|sitemap|launch|kit|typo|copy|comment)\b|^add (notes|sitemap|launch|readme)/i.test(msg); }
function summarizeEvent(e) {
  const payload = e.payload || {};
  if (e.type === "PushEvent") return "Pushed " + (payload.distinct_size || (payload.commits && payload.commits.length) || 0) + " commit(s)";
  if (e.type === "IssuesEvent") return (payload.action || "") + " issue " + (payload.issue && payload.issue.title || "");
  if (e.type === "PullRequestEvent") return (payload.action || "") + " PR " + (payload.pull_request && payload.pull_request.title || "");
  if (e.type === "CreateEvent") return "Created " + (payload.ref_type || "") + " " + (payload.ref || "");
  return String(e.type || "").replace(/Event$/, "");
}
function cleanTitle(s) { return String(s || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim(); }
function firstLine(s) { return String(s || "").split("\n").map((x) => x.trim()).find(Boolean) || ""; }
function clip(s, n) { const t = String(s || ""); return t.length <= n ? t : t.slice(0, n - 1) + "…"; }
function daysSince(date) { if (!date) return 999; return Math.floor((Date.now() - new Date(date).getTime()) / 86400000); }
function unique(arr) { return [...new Set(arr)]; }
