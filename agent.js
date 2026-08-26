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
    const ranked = repos.map((repo) => ({ repo, score: scoreRepo(text, repo, snapshot) })).sort((a, b) => b.score - a.score);
    if (isAdvance(text)) return ranked.slice(0, 6);
    return ranked.filter((c) => c.score > 0).slice(0, 5);
  },
  reason(intent, snapshot, evidence) {
    const text = (intent || "").trim();
    if (!text) throw new Error("Write the work in a sentence.");
    const inspections = (evidence || []).map(inspect);
    const slice = pickSlice(text, inspections, snapshot);
    if (!slice || slice.kind === "none") {
      return { intent: text, created: new Date().toISOString(), method: "work-order", mode: "none", summary: (slice && slice.why) || "Nothing to open.", slice: null, tasks: [], dont: ["New repository"], evidence: inspections.slice(0, 4).map((x) => x.full + ": " + x.note), inspections };
    }
    const task = workOrder(text, slice);
    return { intent: text, created: new Date().toISOString(), method: "work-order", mode: slice.kind, summary: slice.why, slice: task, tasks: [task], dont: task.dont, evidence: task.evidence, inspections };
  },
  toMarkdown(plan) { return plan.slice ? plan.slice.body : plan.summary; },
};
function briefRepo(r) { return { name: r.name, full: r.full_name, pushed: r.pushed_at, open: r.open_issues_count || 0, private: r.private, lang: r.language, desc: r.description || "" }; }
function isAdvance(intent) {
  if (/atelier|forgegraph|aether|social-engine|deep-agent|statix|capfile|wake\b|vibe-me-better/i.test(intent)) return false;
  return /no new repo|hottest work|finish one slice|advance the hottest|do not create/i.test(intent);
}
function forbidsNewRepo(intent) { return /no new repo|do not create a new repo|don't create a new repo|not a new repo/i.test(intent); }
function scoreRepo(intent, repo, snapshot) {
  const hay = haystack(repo); const words = tokenize(intent); let score = 0;
  words.forEach((w) => { if (hay.includes(w)) score += 3; });
  const ageDays = (Date.now() - new Date(repo.pushed_at).getTime()) / 86400000;
  if (ageDays < 3) score += 4; else if (ageDays < 14) score += 2;
  if (repo.archived) score -= 12;
  if (repo.name === "atelier") score += /\batelier\b/.test(intent) ? 8 : -10;
  const open = repo.open_issues_count || 0;
  if (open > 0 && /close|finish|debt|issue|slice|hottest|advance/i.test(intent)) score += 8 + Math.min(open, 4);
  if ((snapshot.heat || []).find((h) => h.full === repo.full_name)) score += 1;
  return score;
}
function haystack(repo) { return (repo.name + " " + repo.full_name + " " + (repo.description || "") + " " + (repo.language || "")).toLowerCase(); }
function tokenize(text) { return String(text).toLowerCase().split(/[^a-z0-9/+.-]+/).filter((w) => w.length > 2 && !STOP.has(w)); }
const STOP = new Set("the and for with from that this into onto your you are was not all any can how what when why one".split(" "));
function inspect(ev) {
  const issues = (ev.issues || []).filter((i) => !i.pull_request && !isVaporIssue(i));
  const withBoxes = issues.map((i) => {
    const boxes = parseBoxes(i.body || "");
    const openBox = boxes.find((b) => !b.checked);
    return { number: i.number, title: i.title, body: i.body || "", url: i.html_url || "", updated: i.updated_at, boxes, openBox, branch: findBranch(i.body || ""), spec: findSpec(i.body || "") };
  });
  const continueIssue = withBoxes.find((i) => i.openBox) || withBoxes[0] || null;
  const commits = (ev.commits || []).map((c) => firstLine(c)).filter(Boolean);
  const root = ev.root || []; const readme = ev.readme || "";
  return { full: ev.full, owner: ev.owner, name: ev.name, lang: ev.lang, pushed: ev.pushed, age: daysSince(ev.pushed), open: issues.length, files: ev.files || [], root, hasReadme: !!(readme.trim()) || root.includes("README.md"), commits, issues: withBoxes, continueIssue, firstUnchecked: continueIssue && continueIssue.openBox, note: continueIssue ? ("#" + continueIssue.number) : (commits[0] || "quiet") };
}
function relevantInspections(intent, inspections) {
  if (!inspections.length) return [];
  const lower = String(intent || "").toLowerCase();
  const named = inspections.filter((ev) => lower.includes(ev.name.toLowerCase()) || lower.includes(String(ev.full).toLowerCase()));
  if (named.length) return named;
  const words = tokenize(intent);
  const scored = inspections.map((ev) => {
    const hay = (ev.full + " " + ev.name + " " + (ev.commits || []).join(" ")).toLowerCase();
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
  const namedAtelier = /\batelier\b/i.test(intent);
  for (const ev of ranked) {
    if (ev.name === "atelier" && !namedAtelier) continue;
    if (ev.continueIssue && ev.firstUnchecked) return { kind: "continue", ev, issue: ev.continueIssue, box: ev.firstUnchecked, title: cleanTitle(ev.firstUnchecked.text).slice(0, 92), why: "Open issue #" + ev.continueIssue.number + " already has a checklist." };
  }
  for (const ev of ranked) {
    if (ev.name === "atelier" && !namedAtelier) continue;
    if (!ev.continueIssue || ev.firstUnchecked) continue;
    if (!String(intent).toLowerCase().includes(ev.name.toLowerCase())) continue;
    return { kind: "continue", ev, issue: ev.continueIssue, box: null, title: cleanTitle(ev.continueIssue.title).slice(0, 92), why: "Open issue #" + ev.continueIssue.number + " has no checklist." };
  }
  const named = inspections.some((ev) => String(intent).toLowerCase().includes(ev.name.toLowerCase()));
  const noInvent = noNew || named || /finish one slice/i.test(intent);
  const ev = ranked.filter((e) => e.name !== "atelier" || namedAtelier)[0] || ranked[0];
  if (!ev) return { kind: "none", why: "No repository scored." };
  const file = pickFile(ev);
  const last = (ev.commits && ev.commits[0]) ? firstLine(ev.commits[0]) : "the current tree";
  return { kind: "open", ev, issue: null, box: null, title: "Change " + file + " after: " + clip(last, 52), why: "The slice is a file that exists in " + ev.full + "." };
}
function pickFile(ev) {
  const files = (ev.files || []).filter((f) => !/(^|\/)(\.github|package-lock|yarn\.lock|pnpm-lock)/.test(f));
  const code = files.find((f) => /\.(js|ts|tsx|jsx|html|css|py|rs|go)$/i.test(f));
  if (code) return code;
  if (files[0]) return files[0];
  const root = ev.root || [];
  return root.find((n) => /^index\.(html|js|tsx?)$/i.test(n)) || root.find((n) => /\.(js|ts|tsx|jsx|html)$/i.test(n)) || "README.md";
}
function rankInspect(ev) {
  let n = 0;
  if (ev.firstUnchecked) n += 40; else if (ev.continueIssue) n += 20;
  if (ev.age <= 2) n += 8;
  if (ev.name === "atelier") n -= 20;
  return n;
}
function workOrder(intent, slice) {
  const ev = slice.ev; const issue = slice.issue;
  let branch = (issue && issue.branch) || null; const spec = (issue && issue.spec) || null;
  if (branch && spec && branch === spec) branch = null;
  const continues = issue ? issue.number : null; const title = slice.title;
  const doSteps = buildDo(slice, branch, spec); const done = buildDone(slice); const dont = buildDont(intent, slice); const evidence = buildEvidence(ev, slice);
  return { id: "01", repo: ev.full, owner: ev.owner, name: ev.name, title, slice: title, continues, branch, spec, url: issue && issue.url, kind: slice.kind, do: doSteps, done, dont, evidence, why: slice.why, labels: ["atelier"], body: title };
}
function buildDo(slice, branch, spec) {
  const issue = slice.issue; const box = slice.box; const ev = slice.ev;
  if (slice.kind === "continue" && box) {
    const steps = [];
    if (branch) steps.push("git checkout " + branch);
    if (spec) steps.push("Open spec " + spec + " and do only: " + cleanTitle(box.text));
    else steps.push("Do only this box on #" + issue.number + ": " + cleanTitle(box.text));
    steps.push("Tick that box on #" + issue.number + ".");
    return steps;
  }
  if (slice.kind === "continue") return ["Open #" + issue.number + ": " + cleanTitle(issue.title) + "."];
  const file = pickFile(ev);
  return ["Open `" + file + "` in " + ev.full + ".", "Next slice after: " + ((ev.commits && ev.commits[0]) || "the current tree") + "."];
}
function buildDone(slice) {
  if (slice.kind === "continue" && slice.box) return [cleanTitle(slice.box.text) + " is checked on #" + slice.issue.number];
  if (slice.kind === "continue") return ["#" + slice.issue.number + " moved"];
  return [pickFile(slice.ev) + " on main changed"];
}
function buildDont(intent, slice) {
  const list = [];
  if (forbidsNewRepo(intent) || isAdvance(intent)) list.push("New repository");
  if (slice.kind === "continue") list.push("A second issue next to #" + slice.issue.number);
  list.push("Treating atelier #2 as the work");
  return unique(list);
}
function buildEvidence(ev, slice) {
  const rows = [];
  if (slice.issue) rows.push(ev.name + "#" + slice.issue.number + " is open");
  rows.push(ev.full + " last: " + (ev.commits[0] || "none"));
  if ((ev.files || []).length) rows.push("Last commit files: " + ev.files.slice(0, 4).join(", "));
  return rows;
}
function isVaporIssue(i) {
  const title = String((i && i.title) || "");
  const body = String((i && i.body) || "");
  if (/Opened by atelier after gather/i.test(body)) return true;
  if (/^Build: atelier/i.test(title)) return true;
  if (/plan is a sentence, a list, and a filing/i.test(title + body)) return true;
  return false;
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
  const take = (s) => { if (!s || looksFile(s)) return null; return String(s).replace(/^[`'\"]+|[`'\"]+$/g, ""); };
  const labeled = text.match(/\bbranch(?:\s+name)?\s*[:\-]?\s*`?((?:feat|fix|chore|hotfix)\/[A-Za-z0-9._/-]+)`?/i);
  if (labeled) return take(labeled[1]);
  return take((text.match(/\b((?:feat|fix|chore|hotfix)\/[A-Za-z0-9._/-]+)/) || [])[1]);
}
function findSpec(body) {
  const m = String(body || "").match(/((?:docs|spec|specs|superpowers)\/[A-Za-z0-9._/-]+\.md)/);
  return m ? m[1] : null;
}
function cleanTitle(s) { return String(s || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim(); }
function firstLine(s) { return String(s || "").split("\n").map((x) => x.trim()).find(Boolean) || ""; }
function clip(s, n) { const t = String(s || ""); return t.length <= n ? t : t.slice(0, n - 1) + "…"; }
function daysSince(date) { if (!date) return 999; return Math.floor((Date.now() - new Date(date).getTime()) / 86400000); }
function unique(arr) { return [...new Set(arr)]; }
function summarizeEvent(e) { return String((e && e.type) || "").replace(/Event$/, ""); }
