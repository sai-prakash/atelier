const STORE = { token: "atelier.gh.token", llm: "atelier.llm.key", provider: "atelier.llm.provider" };
const state = { view: "studio", token: localStorage.getItem(STORE.token) || "", user: null, repos: [], issues: [], pulls: [], events: [], snapshot: null, selected: null, repoDetail: null, intent: "", plan: null, log: [], filter: "all", query: "", busy: false, error: "", notice: "", sitting: null };
const $ = (sel, el = document) => el.querySelector(sel);
function render() {
  const root = document.getElementById("app");
  if (!state.user) { root.innerHTML = gateView(); bindGate(); return; }
  root.innerHTML = `<div class="shell"><header class="top"><div class="brand">atelier</div><div class="who"><img alt="" src="${esc(state.user.avatar_url)}" /><span>${esc(state.user.login)}</span></div></header><main class="main">${viewBody()}</main><nav class="nav">${navBtn("studio", "Studio")}${navBtn("work", "Work")}${navBtn("plan", "Plan")}${navBtn("settings", "Keys")}</nav></div>`;
  bindView();
}
function navBtn(id, label) { return `<button data-nav="${id}" class="${state.view === id ? "active" : ""}">${label}</button>`; }
function gateView() {
  return `<section class="gate"><div class="gate-inner"><div class="mark"></div><h1>atelier</h1><p class="lede">A quiet place to understand every repository, plan the next slice of work, and execute it on GitHub itself.</p><label class="field"><span class="label">GitHub token</span><input id="token" type="password" autocomplete="off" placeholder="ghp_…" value="${esc(state.token)}" /><p class="hint">Classic or fine-grained. Scopes: <code>repo</code>, <code>workflow</code>, <code>read:user</code>. Stored only in this browser. <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">Create one</a>.</p></label><div class="row"><button class="btn" id="enter">Enter</button></div><p class="err" id="gate-err" hidden></p></div></section>`;
}
function viewBody() {
  if (state.view === "work") return workView();
  if (state.view === "plan") return planView();
  if (state.view === "repo") return repoView();
  if (state.view === "settings") return settingsView();
  return studioView();
}
function studioView() {
  const s = state.snapshot;
  if (!s) return `<section class="panel"><p class="empty">Reading your GitHub…</p></section>`;
  return `<section class="panel"><p class="kicker">Studio</p><h2 class="display">What is alive.</h2><p class="sub">Every number is GitHub. Nothing is invented off-platform.</p><div class="stats"><div class="stat"><b>${s.totals.repos}</b><span>repositories</span></div><div class="stat"><b>${s.totals.issues}</b><span>open issues</span></div><div class="stat"><b>${s.totals.pulls}</b><span>open pull requests</span></div></div><p class="kicker">In motion</p><div class="list">${s.heat.map((r) => `<button class="item" data-open-repo="${esc(r.full)}"><div><div class="t">${esc(r.name)}</div><div class="m">${esc(r.desc || r.lang || "—")} · ${rel(r.pushed)}</div></div><span class="pill ${r.open ? "warn" : ""}">${r.open} open</span></button>`).join("")}</div>${s.recent.length ? `<p class="kicker" style="margin-top:28px">Recent signals</p><div class="list">${s.recent.slice(0, 8).map((e) => `<div class="item"><div><div class="t">${esc(e.title)}</div><div class="m">${esc(e.repo || "")} · ${rel(e.at)}</div></div></div>`).join("")}</div>` : ""}</section>`;
}
function workView() {
  const items = filteredWork();
  return `<section class="panel"><p class="kicker">Work</p><h2 class="display">Across the estate.</h2><p class="sub">Sit stays here. GitHub is the record, not the desk.</p><input class="search" id="q" type="text" placeholder="Filter by title or repo" value="${esc(state.query)}" /><div class="switcher">${["all", "issues", "pulls"].map((f) => `<button class="chip ${state.filter === f ? "active" : ""}" data-filter="${f}">${f}</button>`).join("")}</div><div class="list">${items.length ? items.map((it) => `<div class="item"><div><div class="t">${esc(it.title)}</div><div class="m">${esc(repoFromUrl(it.repository_url || it.html_url))} · #${it.number}</div></div><span class="row tight">${it.pull_request ? `<a class="pill" href="${esc(it.html_url)}" target="_blank" rel="noreferrer">PR</a>` : `<button class="pill on" data-sit-issue="${esc(repoFromUrl(it.repository_url || it.html_url))}#${it.number}" data-sit-title="${esc(it.title)}" data-sit-url="${esc(it.html_url)}">Sit</button><a class="pill" href="${esc(it.html_url)}" target="_blank" rel="noreferrer">GitHub</a>`}</span></div>`).join("") : `<p class="empty">Nothing matches.</p>`}</div></section>`;
}
function planView() {
  if (state.sitting) return sitView();
  const filing = !state.plan ? "Start sitting" : state.plan.mode === "none" ? "Nothing to file" : "Start sitting";
  return `<section class="panel"><p class="kicker">Plan</p><h2 class="display">What should happen next.</h2><p class="sub">One sentence. A work order. Then you sit here until the box flips.</p><div class="composer"><label class="field"><span class="label">The work</span><textarea id="intent" placeholder="Finish one slice. No new repository.">${esc(state.intent)}</textarea></label><div class="row actions"><button class="btn" id="make-plan" ${state.busy ? "disabled" : ""}>${state.busy ? "Reading repos…" : "Make plan"}</button><button class="btn" id="start-sit" ${!state.plan || state.busy || state.plan.mode === "none" ? "disabled" : ""}>${filing}</button><button class="btn ghost tiny" id="execute" ${!state.plan || state.busy || state.plan.mode === "none" ? "disabled" : ""}>Note on GitHub</button></div>${state.plan ? `<p class="hint">Start sitting keeps you in atelier. Note writes on the issue. GitHub is the archive.</p>` : ""}${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}${state.notice ? `<p class="ok">${esc(state.notice)}</p>` : ""}</div>${state.plan ? renderPlan(state.plan) : `<p class="empty">Name the outcome. Then start the sitting — do not bounce to GitHub yet.</p>`}</section>`;
}
function sitView() {
  const sl = state.sitting;
  const issueUrl = sl.url || (sl.continues ? `https://github.com/${sl.repo}/issues/${sl.continues}` : `https://github.com/${sl.repo}`);
  const specUrl = sl.spec ? `https://github.com/${sl.repo}/blob/${sl.branch || "main"}/${sl.spec}` : "";
  const editUrl = sl.spec ? `https://github.dev/${sl.repo}/blob/${sl.branch || "main"}/${sl.spec}` : `https://github.dev/${sl.repo}`;
  return `<section class="panel"><p class="kicker">Sitting</p><h2 class="display">${esc(sl.title)}</h2><p class="consequence">${esc(sl.repo)}${sl.continues ? ` · #${sl.continues}` : ""}${sl.branch ? ` · ${esc(sl.branch)}` : ""}</p><div class="row actions"><button class="btn" id="mark-done" ${state.busy || sl.ticked ? "disabled" : ""}>${sl.ticked ? "Slice marked" : "Mark slice done"}</button><button class="btn ghost tiny" id="leave-sit">End sitting</button></div><div class="doors">${sl.continues ? `<a class="door" href="${esc(issueUrl)}" target="_blank" rel="noreferrer">Issue</a>` : ""}${specUrl ? `<a class="door" href="${esc(specUrl)}" target="_blank" rel="noreferrer">Spec</a>` : ""}<a class="door" href="${esc(editUrl)}" target="_blank" rel="noreferrer">Edit</a></div>${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}${state.notice ? `<p class="ok">${esc(state.notice)}</p>` : ""}<p class="kicker">Do this sitting</p>${(sl.do || []).map((d, i) => `<div class="task"><div class="repo">${i + 1}</div><div class="t">${esc(d)}</div></div>`).join("")}<p class="kicker">Done when</p>${(sl.done || []).map((d) => `<div class="m">${esc(d)}</div>`).join("")}<p class="kicker">Do not</p>${(sl.dont || []).map((d) => `<div class="m">— ${esc(d)}</div>`).join("")}</section>`;
}
function renderPlan(plan) {
  const slice = plan.slice;
  if (!slice) return `<div class="plan"><p class="kicker">Nothing to open</p><h3>${esc(plan.intent)}</h3><p class="consequence">${esc(plan.summary || "")}</p><p class="kicker">Do not</p>${(plan.dont || []).map((d) => `<div class="m">— ${esc(d)}</div>`).join("")}</div>`;
  return `<div class="plan"><p class="kicker">${esc(slice.repo)}</p><h3>${esc(slice.title)}</h3><p class="consequence">${slice.continues ? `Continues #${slice.continues}` : "New issue"}${slice.branch ? ` · ${esc(slice.branch)}` : ""}${slice.spec ? ` · ${esc(slice.spec)}` : ""}</p><p class="kicker">Do this sitting</p>${(slice.do || []).map((d, i) => `<div class="task"><div class="repo">${i + 1}</div><div class="t">${esc(d)}</div></div>`).join("")}<p class="kicker">Done when</p>${(slice.done || []).map((d) => `<div class="m">${esc(d)}</div>`).join("")}<p class="kicker">Do not</p>${(slice.dont || []).map((d) => `<div class="m">— ${esc(d)}</div>`).join("")}</div>`;
}
function repoView() {
  const r = state.repoDetail;
  if (!r) return `<section class="panel"><p class="empty">Select a repository.</p></section>`;
  const repo = r.repo;
  return `<section class="panel"><div class="repo-head"><p class="kicker">Repository</p><h2 class="display">${esc(repo.name)}</h2><p class="sub">${esc(repo.description || "No description.")}</p><div class="meta"><span class="pill">${esc(repo.language || "—")}</span><span class="pill">${repo.private ? "private" : "public"}</span><span class="pill">${repo.open_issues_count || 0} open</span><a class="pill" href="${esc(repo.html_url)}" target="_blank" rel="noreferrer">GitHub</a></div><div class="row"><button class="btn tiny" id="use-in-plan">Plan from here</button></div></div>${r.readme ? `<p class="kicker">Readme</p><div class="log">${esc(r.readme.slice(0, 1600))}</div>` : ""}<p class="kicker" style="margin-top:24px">Recent commits</p><div class="list">${(r.commits || []).map((c) => `<a class="item" href="${esc(c.html_url)}" target="_blank" rel="noreferrer"><div><div class="t">${esc(((c.commit.message || "").split("\n")[0]))}</div><div class="m">${esc(c.commit.author && c.commit.author.name || "")} · ${rel(c.commit.author && c.commit.author.date)}</div></div></a>`).join("")}</div></section>`;
}
function settingsView() {
  return `<section class="panel settings"><p class="kicker">Keys</p><h2 class="display">Nothing leaves GitHub but you.</h2><p>atelier is a static site. The token never touches a server we run. The sitting lives here. GitHub keeps the record.</p><hr class="rule" /><label class="field"><span class="label">Token</span><input id="retoken" type="password" value="${esc(state.token)}" /></label><div class="row"><button class="btn" id="save-token">Save</button><button class="btn ghost" id="leave">Sign out</button></div></section>`;
}
function bindGate() {
  $("#enter").onclick = async () => {
    const token = $("#token").value.trim(); const err = $("#gate-err"); err.hidden = true;
    try { await boot(token); } catch (e) { err.hidden = false; err.textContent = e.message || "Could not authenticate."; }
  };
}
function bindView() {
  document.querySelectorAll("[data-nav]").forEach((b) => { b.onclick = () => { state.view = b.dataset.nav; state.error = ""; state.notice = ""; render(); }; });
  document.querySelectorAll("[data-open-repo]").forEach((b) => { b.onclick = () => openRepo(b.dataset.openRepo); });
  document.querySelectorAll("[data-filter]").forEach((b) => { b.onclick = () => { state.filter = b.dataset.filter; render(); }; });
  const q = $("#q"); if (q) q.oninput = () => { state.query = q.value; render(); keepFocus("q"); };
  const intent = $("#intent"); if (intent) intent.oninput = () => { state.intent = intent.value; };
  const make = $("#make-plan"); if (make) make.onclick = composePlan;
  const exec = $("#execute"); if (exec) exec.onclick = executePlan;
  const save = $("#save-plan"); if (save) save.onclick = persistPlan;
  const use = $("#use-in-plan"); if (use) use.onclick = () => { if (state.repoDetail) state.intent = `Advance ${state.repoDetail.repo.name}: ${state.repoDetail.repo.description || "next complete slice"}.`; state.view = "plan"; render(); };
  const saveTok = $("#save-token"); if (saveTok) saveTok.onclick = async () => { try { await boot($("#retoken").value.trim()); } catch (e) { state.error = e.message; render(); } };
  const leave = $("#leave"); if (leave) leave.onclick = () => { localStorage.removeItem(STORE.token); state.user = null; state.token = ""; render(); };
  const start = $("#start-sit"); if (start) start.onclick = startSitting;
  const mark = $("#mark-done"); if (mark) mark.onclick = markSliceDone;
  const endSit = $("#leave-sit"); if (endSit) endSit.onclick = () => { state.sitting = null; state.notice = ""; render(); };
  document.querySelectorAll("[data-sit-issue]").forEach((b) => { b.onclick = () => sitFromWork(b.dataset.sitIssue, b.dataset.sitTitle, b.dataset.sitUrl); });
}
function keepFocus(id) { const el = document.getElementById(id); if (el) { const v = el.value; el.focus(); el.setSelectionRange(v.length, v.length); } }
async function boot(token) {
  if (!token) throw new Error("A token is required.");
  GH.setToken(token); const user = await GH.me(); state.token = token; state.user = user; localStorage.setItem(STORE.token, token); render(); await refresh();
}
async function refresh() {
  state.busy = true;
  try {
    const login = state.user.login;
    const [repos, issues, pulls, events] = await Promise.all([GH.repos(), GH.searchIssues(`user:${login} is:issue is:open`, 40), GH.searchIssues(`user:${login} is:pr is:open`, 30), GH.events(login).catch(() => [])]);
    state.repos = repos; state.issues = issues; state.pulls = pulls; state.events = events; state.snapshot = Agent.understand(repos, issues, pulls, events);
  } catch (e) { state.error = e.message; } finally { state.busy = false; render(); }
}
async function openRepo(full) {
  const [owner, name] = full.split("/"); const repo = state.repos.find((r) => r.full_name === full);
  state.view = "repo"; state.repoDetail = { repo, commits: [], readme: "" }; render();
  try { const [commits, readme] = await Promise.all([GH.commits(owner, name, 10), GH.readme(owner, name)]); state.repoDetail = { repo, commits, readme }; } catch (e) { state.error = e.message; }
  render();
}
async function composePlan() {
  state.error = ""; state.notice = ""; state.sitting = null; state.intent = ($("#intent") && $("#intent").value) || state.intent; state.busy = true; render();
  try {
    const picks = Agent.candidates(state.intent, state.repos, state.snapshot);
    const evidence = [];
    for (const pick of picks) {
      const repo = pick.repo; const [owner, name] = repo.full_name.split("/");
      const [commits, readme, issues, root] = await Promise.all([GH.commits(owner, name, 6).catch(() => []), GH.readme(owner, name).catch(() => ""), GH.repoIssues(owner, name, 10).catch(() => []), GH.rootTree(owner, name).catch(() => [])]);
      evidence.push({ full: repo.full_name, owner, name, lang: repo.language, pushed: repo.pushed_at, open: repo.open_issues_count || 0, desc: repo.description || "", homepage: repo.homepage || "", score: pick.score, readme, root, commits: (commits || []).map((c) => (c.commit && c.commit.message) || ""), issues: (issues || []).filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, body: i.body || "", html_url: i.html_url || "", updated_at: i.updated_at })) });
    }
    state.plan = Agent.reason(state.intent, state.snapshot, evidence);
  } catch (e) { state.error = e.message; } finally { state.busy = false; render(); }
}
async function persistPlan() {
  if (!state.plan) return; state.busy = true; state.error = ""; state.notice = ""; render();
  try {
    const slug = slugify(state.plan.intent); const path = `workspace/plans/${slug}.md`; let sha;
    try { const existing = await GH.contents(state.user.login, GH.controlRepo, path); sha = existing.sha; } catch {}
    await GH.putFile(state.user.login, GH.controlRepo, path, Agent.toMarkdown(state.plan), `atelier: plan ${slug}`, sha);
    state.notice = `Kept a copy in ${GH.controlRepo}/${path}`;
  } catch (e) { state.error = e.message; } finally { state.busy = false; render(); }
}
async function executePlan() {
  if (!state.plan) return; state.busy = true; state.error = ""; state.notice = ""; render(); const opened = [];
  try {
    const slice = state.plan.slice;
    if (!slice || state.plan.mode === "none") state.notice = "Nothing to file.";
    else if (slice.kind === "continue" && slice.continues) {
      await GH.comment(slice.owner, slice.name, slice.continues, "atelier sitting:\n\n" + slice.body);
      await persistPlanQuiet();
      state.notice = "Noted on " + slice.repo + "#" + slice.continues + ".";
    } else {
      const issue = await GH.createIssue(slice.owner, slice.name, slice.title, slice.body, slice.labels || ["atelier"]);
      slice.continues = issue.number; slice.url = issue.html_url; slice.kind = "continue";
      await persistPlanQuiet();
      state.notice = "Opened " + slice.repo + "#" + issue.number + ". Start the sitting.";
    }
    await refresh();
  } catch (e) { state.error = e.message; } finally { state.busy = false; render(); }
}
async function persistPlanQuiet() {
  try { const slug = slugify(state.plan.intent); await GH.putFile(state.user.login, GH.controlRepo, `workspace/plans/${slug}.md`, Agent.toMarkdown(state.plan), `atelier: plan ${slug}`); } catch {}
}
function filteredWork() {
  let items = []; if (state.filter !== "pulls") items = items.concat(state.issues); if (state.filter !== "issues") items = items.concat(state.pulls);
  const q = state.query.trim().toLowerCase(); if (q) items = items.filter((it) => `${it.title} ${it.html_url}`.toLowerCase().includes(q));
  return items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}
function repoFromUrl(url) {
  const s = String(url || ""); const marker = "github.com/"; const i = s.indexOf(marker);
  if (i < 0) return "";
  let rest = s.slice(i + marker.length); if (rest.indexOf("repos/") === 0) rest = rest.slice(6);
  const parts = rest.split("/"); return parts.length >= 2 ? parts[0] + "/" + parts[1] : "";
}
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "plan"; }
function rel(date) { if (!date) return ""; const d = (Date.now() - new Date(date).getTime()) / 1000; if (d < 60) return "just now"; if (d < 3600) return `${Math.floor(d / 60)}m ago`; if (d < 86400) return `${Math.floor(d / 3600)}h ago`; if (d < 604800) return `${Math.floor(d / 86400)}d ago`; return new Date(date).toLocaleDateString(); }
function esc(s) { const map = { "&": "\u0026amp;", "<": "\u0026lt;", ">": "\u0026gt;", '"': "\u0026quot;" }; return String(s ?? "").replace(/[&<>"]/g, (c) => map[c]); }
function startSitting() {
  if (!state.plan || !state.plan.slice) return;
  state.sitting = Object.assign({}, state.plan.slice, { ticked: false });
  state.notice = "Sitting is open. Mark the slice when the box is true.";
  state.view = "plan"; render();
}
function sitFromWork(ref, title, url) {
  const parts = String(ref || "").split("#"); const repo = parts[0] || ""; const num = Number(parts[1] || 0); const bits = repo.split("/");
  state.sitting = { repo, owner: bits[0], name: bits[1], title: title || repo, continues: num, url: url || "", kind: "continue", branch: null, spec: null, ticked: false, do: ["Do the next empty box on #" + num + ".", "Do not open a second issue."], done: ["The next box on #" + num + " is checked"], dont: ["A second issue next to #" + num] };
  state.view = "plan"; state.notice = ""; render();
}
async function markSliceDone() {
  const sl = state.sitting;
  if (!sl || !sl.continues) { state.error = "This sitting has no issue to tick."; render(); return; }
  state.busy = true; state.error = ""; state.notice = ""; render();
  try {
    const issue = await GH.issue(sl.owner, sl.name, sl.continues);
    const next = checkFirstOpenBox(issue.body || "", sl.title);
    if (!next.changed) state.notice = "No empty checkbox left on #" + sl.continues + ".";
    else {
      await GH.patchIssue(sl.owner, sl.name, sl.continues, { body: next.body });
      await GH.comment(sl.owner, sl.name, sl.continues, "atelier: marked the slice done from the sitting.\n\n" + (sl.title || ""));
      sl.ticked = true; state.sitting = sl;
      state.notice = "Checked the next box on " + sl.repo + "#" + sl.continues + ".";
    }
    await refresh(); state.view = "plan";
  } catch (e) { state.error = e.message; } finally { state.busy = false; render(); }
}
function checkFirstOpenBox(body, hint) {
  const lines = String(body || "").split("\n");
  const hintBits = String(hint || "").toLowerCase().slice(0, 24);
  let idx = lines.findIndex((ln) => /^\s*[-*+]\s*\[ \]\s*/.test(ln) && (!hintBits || ln.toLowerCase().indexOf(hintBits.slice(0, 8)) >= 0));
  if (idx < 0) idx = lines.findIndex((ln) => /^\s*[-*+]\s*\[ \]\s*/.test(ln));
  if (idx < 0) return { changed: false, body };
  lines[idx] = lines[idx].replace("[ ]", "[x]");
  return { changed: true, body: lines.join("\n") };
}
try { if (state.token) { boot(state.token).catch(() => { state.user = null; render(); }); } else { render(); } } catch (e) { document.getElementById("app").textContent = e.message; }
