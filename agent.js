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
    const heat = repos
      .slice()
      .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
      .slice(0, 8)
      .map((r) => ({
        name: r.name,
        full: r.full_name,
        pushed: r.pushed_at,
        open: r.open_issues_count || 0,
        private: r.private,
        lang: r.language,
        desc: r.description || "",
      }));

    const blockers = issues.filter((i) =>
      (i.labels || []).some((l) => /block|p0|urgent|bug/i.test(l.name || l))
    );

    const recent = (events || [])
      .slice(0, 12)
      .map((e) => ({
        type: e.type,
        repo: e.repo && e.repo.name,
        at: e.created_at,
        title: summarizeEvent(e),
      }));

    return {
      totals: {
        repos: repos.length,
        private: privateN,
        active: active.length,
        stale: stale.length,
        issues: issues.length,
        pulls: pulls.length,
      },
      languages: Object.entries(byLang).sort((a, b) => b[1] - a[1]).slice(0, 6),
      heat,
      blockers,
      recent,
      stale: stale.slice(0, 8).map((r) => r.full_name),
    };
  },

  plan(intent, snapshot, repos) {
    const text = (intent || "").trim();
    if (!text) throw new Error("Write what you want to do.");
    const scored = repos.map((r) => ({
      repo: r,
      score: scoreRepo(text, r),
    })).sort((a, b) => b.score - a.score);

    const chosen = scored.filter((s) => s.score > 0).slice(0, 5);
    const targets = chosen.length ? chosen : scored.slice(0, 2);

    const verbs = detectVerbs(text);
    const tasks = [];
    targets.forEach(({ repo }, i) => {
      verbs.forEach((verb, j) => {
        tasks.push({
          id: `${i + 1}.${j + 1}`,
          repo: repo.full_name,
          owner: repo.owner.login,
          name: repo.name,
          title: titleFor(verb, text, repo),
          body: bodyFor(verb, text, repo, snapshot),
          labels: labelsFor(verb),
          why: repo.description || repo.language || "recent activity",
        });
      });
    });

    return {
      intent: text,
      created: new Date().toISOString(),
      summary: summaryFor(text, targets),
      targets: targets.map((t) => t.repo.full_name),
      tasks,
      method: "native-heuristic",
    };
  },

  toMarkdown(plan) {
    const lines = [
      `# ${plan.intent}`,
      "",
      `_Planned ${plan.created} · ${plan.method}_`,
      "",
      plan.summary,
      "",
      "## Targets",
      ...plan.targets.map((t) => `- ${t}`),
      "",
      "## Work",
    ];
    plan.tasks.forEach((t) => {
      lines.push(`### ${t.id} — ${t.title}`);
      lines.push(`Repo: \`${t.repo}\``);
      lines.push("");
      lines.push(t.body);
      lines.push("");
    });
    lines.push("---");
    lines.push("Written by atelier. Source of truth lives in this repository.");
    return lines.join("\n");
  },
};

function scoreRepo(intent, repo) {
  const hay = `${repo.name} ${repo.full_name} ${repo.description || ""} ${repo.language || ""}`.toLowerCase();
  const words = intent.toLowerCase().split(/[^a-z0-9/+.-]+/).filter((w) => w.length > 2);
  let score = 0;
  words.forEach((w) => { if (hay.includes(w)) score += 3; });
  if (/agent|langgraph|harness|swarm|graph/.test(intent) && /agent|graph|harness|forge|deep/.test(hay)) score += 6;
  if (/design|ux|ui|portfolio/.test(intent) && /design|portfolio|ux/.test(hay)) score += 5;
  if (/atlas|aether/.test(intent) && /aether|atlas/.test(hay)) score += 8;
  const ageDays = (Date.now() - new Date(repo.pushed_at).getTime()) / 86400000;
  if (ageDays < 14) score += 2;
  if (repo.archived) score -= 8;
  return score;
}

function detectVerbs(intent) {
  const verbs = [];
  if (/fix|bug|break|fail|error/.test(intent)) verbs.push("fix");
  if (/ship|launch|release|publish|deploy/.test(intent)) verbs.push("ship");
  if (/doc|readme|write/.test(intent)) verbs.push("document");
  if (/plan|roadmap|scope/.test(intent)) verbs.push("plan");
  if (/test|qa|audit/.test(intent)) verbs.push("verify");
  if (/refactor|clean|simplify/.test(intent)) verbs.push("refine");
  if (!verbs.length) verbs.push("build");
  return verbs.slice(0, 3);
}

function titleFor(verb, intent, repo) {
  const clipped = intent.replace(/\s+/g, " ").slice(0, 72);
  const prefix = {
    fix: "Fix",
    ship: "Ship",
    document: "Document",
    plan: "Plan",
    verify: "Verify",
    refine: "Refine",
    build: "Build",
  }[verb] || "Work";
  return `${prefix}: ${clipped}`.replace(new RegExp(`${repo.name}`, "i"), repo.name);
}

function bodyFor(verb, intent, repo, snapshot) {
  const heat = (snapshot.heat || []).find((h) => h.full === repo.full_name);
  return [
    intent,
    "",
    `## Context`,
    `- Repository: ${repo.full_name}`,
    `- Language: ${repo.language || "unspecified"}`,
    `- Last push: ${repo.pushed_at}`,
    `- Open items: ${repo.open_issues_count || 0}`,
    heat && heat.desc ? `- About: ${heat.desc}` : "",
    "",
    `## Suggested move`,
    verbInstruction(verb),
    "",
    `_Opened by atelier from a native plan. No external backend._`,
  ].filter(Boolean).join("\n");
}

function verbInstruction(verb) {
  return {
    fix: "Reproduce, isolate, write the smallest patch, open a pull request.",
    ship: "Confirm the public surface, tag a release if needed, and record what changed.",
    document: "Write the missing README or AGENTS.md so the next session can start cold.",
    plan: "Turn this intent into a sequenced checklist with owners and done-when.",
    verify: "List acceptance checks and run them. File gaps as follow-up issues.",
    refine: "Remove one layer of complexity without changing behavior.",
    build: "Implement the smallest complete slice and leave the tree green.",
  }[verb];
}

function labelsFor(verb) {
  const map = {
    fix: ["bug"],
    ship: ["release"],
    document: ["docs"],
    plan: ["planning"],
    verify: ["qa"],
    refine: ["chore"],
    build: ["enhancement"],
  };
  return ["atelier", ...(map[verb] || [])];
}

function summaryFor(intent, targets) {
  const names = targets.map((t) => t.repo.name).join(", ");
  return `Intent maps most naturally to ${names || "your recent repositories"}. Each task below is a GitHub issue waiting to be opened in that repo.`;
}

function summarizeEvent(e) {
  const payload = e.payload || {};
  if (e.type === "PushEvent") return `Pushed ${payload.distinct_size || payload.commits && payload.commits.length || 0} commit(s)`;
  if (e.type === "IssuesEvent") return `${payload.action} issue ${payload.issue && payload.issue.title || ""}`;
  if (e.type === "PullRequestEvent") return `${payload.action} PR ${payload.pull_request && payload.pull_request.title || ""}`;
  if (e.type === "CreateEvent") return `Created ${payload.ref_type} ${payload.ref || ""}`;
  return e.type.replace(/Event$/, "");
}
