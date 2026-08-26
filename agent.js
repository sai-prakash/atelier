const Agent = {
  understand(repos, issues, pulls, events) {
    const now = Date.now();
    const week = 7 * 24 * 3600 * 1000;
    const active = repos.filter((r) => now - new Date(r.pushed_at).getTime() < week);
    const stale = repos.filter((r) => now - new Date(r.pushed_at).getTime() > 90 * 24 * 3600 * 1000 && !r.archived);
    const privateN = repos.filter((r) => r.private).length;
    const byLang = {};
    repos.forEach((r) => {
      const lang = r.language || "Other";
      byLang[lang] = (byLang[lang] || 0) + 1;
    });
    const heat = repos.slice().sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at)).slice(0, 8).map((r) => briefRepo(r));
    const blockers = issues.filter((i) => (i.labels || []).some((l) => /block|p0|urgent|bug/i.test(l.name || l)));
    const recent = (events || []).slice(0, 12).map((e) => ({ type: e.type, repo: e.repo && e.repo.name, at: e.created_at, title: summarizeEvent(e) }));
    return { totals: { repos: repos.length, private: privateN, active: active.length, stale: stale.length, issues: issues.length, pulls: pulls.length }, languages: Object.entries(byLang).sort((a, b) => b[1] - a[1]).slice(0, 6), heat, blockers, recent, stale: stale.slice(0, 8).map((r) => r.full_name) };
  },
  candidates(intent, repos, snapshot) {
    const text = (intent || "").trim();
    if (!text) throw new Error("Write what you want to do.");
    return repos.map((repo) => ({ repo, score: scoreRepo(text, repo, snapshot), signals: signalsFor(text, repo) })).sort((a, b) => b.score - a.score).filter((c) => c.score > 0).slice(0, 4);
  },
  reason(intent, snapshot, evidence) {
    const text = (intent || "").trim();
    if (!text) throw new Error("Write what you want to do.");
    if (!evidence.length) throw new Error("No repositories scored against this intent.");
    const verbs = detectVerbs(text);
    const goal = classifyGoal(text);
    const trace = [];
    trace.push({ step: "Observe", text: `Estate: ${snapshot.totals.repos} repos, ${snapshot.totals.issues} open issues, ${snapshot.totals.pulls} open PRs, ${snapshot.totals.active} touched this week.` });
    trace.push({ step: "Frame", text: `Goal class: ${goal.label}. ${goal.why}` });
    evidence.forEach((ev) => trace.push({ step: "Evidence", text: evidenceLine(ev) }));
    const inferences = evidence.map(inferRepo);
    inferences.forEach((inf) => trace.push({ step: "Infer", text: `${inf.repo}: ${inf.claim}` }));
    const primary = inferences[0];
    const sequence = sequenceWork(goal, verbs, inferences);
    trace.push({ step: "Decide", text: `Lead with ${primary.repo}. ${sequence.why}` });
    const tasks = sequence.tasks.map((t, i) => ({ id: String(i + 1).padStart(2, "0"), repo: t.full, owner: t.owner, name: t.name, title: t.title, body: t.body, labels: ["atelier", t.kind], why: t.why, depends: t.depends || null }));
    return { intent: text, created: new Date().toISOString(), method: "gather-infer-decide", goal: goal.label, summary: sequence.why, targets: unique(tasks.map((t) => t.repo)), trace, inferences, tasks };
  },
  toMarkdown(plan) {
    const lines = [`# ${plan.intent}`, "", `_Reasoned ${plan.created} · ${plan.method} · ${plan.goal}_`, "", plan.summary, "", "## Reasoning"];
    (plan.trace || []).forEach((t) => lines.push(`- **${t.step}.** ${t.text}`));
    lines.push("", "## Work");
    (plan.tasks || []).forEach((t) => { lines.push(`### ${t.id} — ${t.title}`); lines.push(`Repo: \`${t.repo}\`${t.depends ? ` · after ${t.depends}` : ""}`); lines.push(""); lines.push(t.body); lines.push(""); });
    lines.push("---"); lines.push("Written by atelier from repository evidence. Source of truth is GitHub.");
    return lines.join("\n");
  },
};
function briefRepo(r) { return { name: r.name, full: r.full_name, pushed: r.pushed_at, open: r.open_issues_count || 0, private: r.private, lang: r.language, desc: r.description || "" }; }
function scoreRepo(intent, repo, snapshot) {
  const hay = haystack(repo); const words = tokenize(intent); let score = 0;
  words.forEach((w) => { if (hay.includes(w)) score += 3; });
  const families = [[/agent|harness|langgraph|swarm|orchestr/i, /agent|harness|forge|deep|graph|kimi|sidebrain/i, 8], [/graph|studio|swarm|forge/i, /graph|forgegraph|studio/i, 8], [/atlas|aether|catalog|observatory/i, /aether|atlas/i, 9], [/design|ux|thinking|wcag|prototype/i, /design|portfolio|ux/i, 6], [/social|reel|statix|vibe/i, /social|statix|vibe|reel/i, 6], [/ocr|pdf|annotat/i, /pdf|ocr/i, 7]];
  families.forEach(([q, r, w]) => { if (q.test(intent) && r.test(hay)) score += w; });
  const ageDays = (Date.now() - new Date(repo.pushed_at).getTime()) / 86400000;
  if (ageDays < 3) score += 4; else if (ageDays < 14) score += 2; else if (ageDays > 180) score -= 2;
  if (repo.archived) score -= 12;
  if (repo.name === "atelier") score += /atelier|tracker|studio|plan/.test(intent) ? 10 : 1;
  if ((repo.open_issues_count || 0) > 0 && /close|finish|debt|issue/.test(intent)) score += 2;
  if ((snapshot.heat || []).find((h) => h.full === repo.full_name)) score += 1;
  return score;
}
function signalsFor(intent, repo) { return tokenize(intent).filter((w) => haystack(repo).includes(w)).slice(0, 6); }
function haystack(repo) { return `${repo.name} ${repo.full_name} ${repo.description || ""} ${repo.language || ""}`.toLowerCase(); }
function tokenize(text) { return String(text).toLowerCase().split(/[^a-z0-9/+.-]+/).filter((w) => w.length > 2 && !STOP.has(w)); }
const STOP = new Set("the and for with from that this into onto your you are was not all any can how what when why".split(" "));
function classifyGoal(intent) {
  if (/fix|bug|break|fail|error|regression/.test(intent)) return { label: "repair", why: "Stabilize something that is already supposed to work." };
  if (/ship|launch|release|publish|deploy|pages/.test(intent)) return { label: "ship", why: "Make a public surface real and reachable." };
  if (/plan|roadmap|scope|priorit/.test(intent)) return { label: "orient", why: "Decide sequence before more code." };
  if (/doc|readme|write|explain/.test(intent)) return { label: "document", why: "A cold start should be possible from the repo alone." };
  if (/connect|across|tracker|manage|estate|all my|every repo/.test(intent)) return { label: "integrate", why: "Work has to span repositories, not live in one silo." };
  if (/reason|agent|understand|plan and execute/.test(intent)) return { label: "agent", why: "The product must think with evidence, then act on GitHub." };
  return { label: "build", why: "Cut the smallest complete slice that changes the tree." };
}
function evidenceLine(ev) {
  const commits = (ev.commits || []).slice(0, 3).map((c) => firstLine(c)).join("; ");
  const issues = (ev.issues || []).slice(0, 3).map((i) => `#${i.number} ${i.title}`).join("; ");
  const readme = firstLine(ev.readme || ev.desc || "no readme");
  return `${ev.full} · ${ev.lang || "—"} · ${relAge(ev.pushed)} · ${readme}${commits ? ` · commits: ${commits}` : ""}${issues ? ` · open: ${issues}` : ""}`;
}
function inferRepo(ev) {
  const age = daysSince(ev.pushed); const open = (ev.issues || []).length || ev.open || 0; const readme = (ev.readme || "").trim(); const last = firstLine((ev.commits && ev.commits[0]) || "");
  let claim;
  if (age <= 2) claim = `Hot. Last move: ${last || "recent push"}. Treat as the active surface.`;
  else if (age > 90 && open === 0) claim = "Cold and quiet. Only touch if the intent names it.";
  else if (open > 3) claim = `${open} open items. Prefer finishing one before opening five more.`;
  else if (!readme) claim = "No README. A cold agent cannot start here without a page of context.";
  else claim = `Described as “${firstLine(readme).slice(0, 90)}”. ${last ? `Latest: ${last}` : "No recent commit message."}`;
  return { repo: ev.full, owner: ev.owner, name: ev.name, lang: ev.lang, age, open, claim, readme: firstLine(readme), last };
}
function sequenceWork(goal, verbs, inferences) {
  const lead = inferences[0]; const second = inferences[1]; const tasks = [];
  if (goal.label === "integrate" || goal.label === "agent") {
    tasks.push(task(lead, "build", "Make the reasoner write a durable plan file and issues from evidence", "Without a written trace, the loop is a chat."));
    if (second) tasks.push(task(second, "document", "Add a one-page AGENTS.md so atelier can brief this repo cold", "Cross-repo work fails when the target has no constitution.", "01"));
    tasks.push(task(lead, "ship", "Confirm GitHub Pages is the public door and the README points at it", "A studio that cannot be opened is not shipped."));
    return { tasks, why: `Integration work belongs in ${lead.repo}, with ${second ? second.repo : "a sibling"} as the first well-described target.` };
  }
  if (goal.label === "repair") {
    tasks.push(task(lead, "fix", `Reproduce and patch: ${clip(lead.last || lead.readme)}`, lead.claim));
    tasks.push(task(lead, "verify", "Add or run the smallest check that would have caught it", "A fix without a check is a rumor.", "01"));
    return { tasks, why: `Repair concentrates on ${lead.repo}, the hottest match.` };
  }
  if (goal.label === "ship") {
    tasks.push(task(lead, "ship", "Publish the current main to the public URL and verify the first screen", lead.claim));
    tasks.push(task(lead, "document", "Write the three-step open path at the top of the README", "Shipping includes how a stranger starts.", "01"));
    return { tasks, why: `${lead.repo} is the thing to put in front of people.` };
  }
  if (goal.label === "document") {
    tasks.push(task(lead, "document", "Write README + AGENTS.md from the last commits and open issues", lead.claim));
    return { tasks, why: `Documentation pays off first in ${lead.repo}.` };
  }
  if (goal.label === "orient") {
    inferences.slice(0, 3).forEach((inf) => tasks.push(task(inf, "plan", `State done-when for the next slice in ${inf.name}`, inf.claim)));
    return { tasks, why: "Orientation is a short plan in each live repo, not a new tracker." };
  }
  const verb = verbs[0] || "build";
  tasks.push(task(lead, verb, titleFrom(verb, lead), lead.claim));
  if (second && verbs[1]) tasks.push(task(second, verbs[1], titleFrom(verbs[1], second), second.claim, "01"));
  return { tasks, why: `Highest-leverage match is ${lead.repo}${second ? `, then ${second.repo}` : ""}.` };
}
function task(inf, kind, title, why, depends) {
  const [owner, name] = inf.repo.split("/");
  return { full: inf.repo, owner, name, kind, title: `${labelKind(kind)}: ${title}`.slice(0, 92), why, depends: depends || null, body: [title, "", "## Why this repo", why, "", "## Evidence", inf.readme ? `- README: ${inf.readme}` : "- No README on file.", inf.last ? `- Latest commit: ${inf.last}` : "- No commit message loaded.", `- Last push: ${inf.age}d ago`, `- Open items seen: ${inf.open}`, "", "## Done when", doneWhen(kind), "", "_Opened by atelier after gather → infer → decide. No external backend._"].join("\n") };
}
function labelKind(kind) { return { fix: "Fix", ship: "Ship", document: "Document", plan: "Plan", verify: "Verify", refine: "Refine", build: "Build" }[kind] || "Work"; }
function titleFrom(verb, inf) { return `${inf.name} — ${inf.last || inf.readme || "next complete slice"}`.slice(0, 70); }
function doneWhen(kind) { return { fix: "The failure cannot be reproduced on main, and a check exists.", ship: "A URL loads the current main without a local server.", document: "A stranger can start from README + AGENTS.md alone.", plan: "The next slice has a done-when and a named repo.", verify: "The check ran, and gaps are issues — not vibes.", refine: "Behavior is unchanged; one layer of complexity is gone.", build: "Main has the slice, and the tree is usable." }[kind] || "The repo is clearly different in the way the intent asked."; }
function detectVerbs(intent) {
  const verbs = [];
  if (/fix|bug|break|fail|error/.test(intent)) verbs.push("fix");
  if (/ship|launch|release|publish|deploy/.test(intent)) verbs.push("ship");
  if (/doc|readme|write/.test(intent)) verbs.push("document");
  if (/plan|roadmap|scope/.test(intent)) verbs.push("plan");
  if (/test|qa|audit|verify/.test(intent)) verbs.push("verify");
  if (/refactor|clean|simplify/.test(intent)) verbs.push("refine");
  if (!verbs.length) verbs.push("build");
  return verbs.slice(0, 3);
}
function summarizeEvent(e) {
  const payload = e.payload || {};
  if (e.type === "PushEvent") return `Pushed ${payload.distinct_size || payload.commits && payload.commits.length || 0} commit(s)`;
  if (e.type === "IssuesEvent") return `${payload.action} issue ${payload.issue && payload.issue.title || ""}`;
  if (e.type === "PullRequestEvent") return `${payload.action} PR ${payload.pull_request && payload.pull_request.title || ""}`;
  if (e.type === "CreateEvent") return `Created ${payload.ref_type} ${payload.ref || ""}`;
  return e.type.replace(/Event$/, "");
}
function firstLine(s) { return String(s || "").split("\n").map((x) => x.trim()).find(Boolean) || ""; }
function clip(s) { return String(s || "").slice(0, 64); }
function daysSince(date) { if (!date) return 999; return Math.floor((Date.now() - new Date(date).getTime()) / 86400000); }
function relAge(date) { const d = daysSince(date); if (d <= 0) return "today"; if (d === 1) return "yesterday"; return `${d}d ago`; }
function unique(arr) { return [...new Set(arr)]; }
