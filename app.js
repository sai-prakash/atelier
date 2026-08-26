const STORE = { token: "atelier.gh.token" };
const state = { view: "desk", token: localStorage.getItem(STORE.token) || "", user: null, repos: [], snapshot: null, intent: "", plan: null, sitting: null, estateRepo: null, busy: false, error: "", notice: "" };
const $ = (sel, el = document) => el.querySelector(sel);
function render() {
  const root = document.getElementById("app");
  if (!state.user) { root.innerHTML = gateView(); bindGate(); return; }
  root.innerHTML = `<div class="shell"><header class="top"><div class="brand">atelier</div><nav class="nav-inline">${navBtn("desk", "Desk")}${navBtn("estate", "Estate")}</nav><button class="who" data-nav="keys" title="Keys"><img alt="" src="${esc(state.user.avatar_url)}" /><span>${esc(state.user.login)}</span></button></header><main class="main">${viewBody()}</main></div>`;
  bindView();
}
function navBtn(id, label) {
  const on = state.view === id || (id === "estate" && state.view === "repo");
  return `<button data-nav="${id}" class="${on ? "active" : ""}">${label}</button>`;
}
function viewBody() {
  if (state.view === "estate") return estateView();
  if (state.view === "repo") return repoView();
  if (state.view === "keys") return keysView();
  return deskView();
}
function gateView() {
  return `<section class="gate"><div class="gate-inner"><div class="mark"></div><h1>atelier</h1><p class="lede">A desk for the next slice. GitHub keeps the record.</p><label class="field"><span class="label">GitHub token</span><input id="token" type="password" autocomplete="off" placeholder="ghp_…" value="${esc(state.token)}" /><p class="hint">Scopes: <code>repo</code>, <code>read:user</code>. Stored only in this browser. <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">Create one</a>.</p></label><div class="row"><button class="btn" id="enter">Enter</button></div><p class="err" id="gate-err" hidden></p></div></section>`;
}
function deskView() {
  if (state.sitting) return sittingView();
  if (state.plan) return orderView();
  return emptyView();
}
function emptyView() {
  return `<section class="panel desk"><p class="kicker">Desk</p><h2 class="display">Name the work in one sentence.</h2><div class="composer bare"><label class="field"><span class="label">The work</span><textarea id="intent" placeholder="Finish one slice. No new repository.">${esc(state.intent)}</textarea></label><div class="row actions"><button class="btn" id="make-plan" ${state.busy ? "disabled" : ""}>${state.busy ? "Reading…" : "Make the work"}</button></div>${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}</div></section>`;
}
function orderView() {
  const plan = state.plan; const sl = plan.slice;
  if (!sl) return `<section class="panel desk"><p class="kicker">Nothing to open</p><h2 class="display">${esc(plan.intent)}</h2><p class="consequence">${esc(plan.summary || "")}</p><div class="row actions"><button class="btn ghost" id="start-over">Start over</button></div></section>`;
  return `<section class="panel desk"><p class="kicker">${esc(sl.repo)}</p><h2 class="display">${esc(sl.title)}</h2><p class="consequence">${sl.continues ? `#${sl.continues}` : "File slice"}${sl.branch ? ` · ${esc(sl.branch)}` : ""}${sl.spec ? ` · ${esc(sl.spec)}` : ""}</p><div class="row actions"><button class="btn" id="start-sit" ${state.busy ? "disabled" : ""}>Sit</button> <button class="btn ghost tiny" id="start-over">Start over</button></div>${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}${state.notice ? `<p class="ok">${esc(state.notice)}</p>` : ""}${renderOrder(sl)}</section>`;
}
function sittingView() {
  const sl = state.sitting;
  const issueUrl = sl.url || (sl.continues ? `https://github.com/${sl.repo}/issues/${sl.continues}` : `https://github.com/${sl.repo}`);
  const specUrl = sl.spec ? `https://github.com/${sl.repo}/blob/${sl.branch || "main"}/${sl.spec}` : "";
  const editUrl = sl.spec ? `https://github.dev/${sl.repo}/blob/${sl.branch || "main"}/${sl.spec}` : `https://github.dev/${sl.repo}`;
  return `<section class="panel desk"><p class="kicker">Sitting</p><h2 class="display">${esc(sl.title)}</h2><p class="consequence">${esc(sl.repo)}${sl.continues ? ` · #${sl.continues}` : ""}</p><div class="row actions"><button class="btn" id="mark-done" ${state.busy || sl.ticked || !sl.continues ? "disabled" : ""}>${sl.ticked ? "Slice marked" : sl.continues ? "Mark done" : "No box to tick"}</button><button class="btn ghost tiny" id="leave-sit">End sitting</button></div><div class="doors">${sl.continues ? `<a class="door" href="${esc(issueUrl)}" target="_blank" rel="noreferrer">Issue</a>` : ""}${specUrl ? `<a class="door" href="${esc(specUrl)}" target="_blank" rel="noreferrer">Spec</a>` : ""}<a class="door" href="${esc(editUrl)}" target="_blank" rel="noreferrer">Edit</a></div>${state.error ? `<p class="err">${esc(state.error)}</p>` : ""}${state.notice ? `<p class="ok">${esc(state.notice)}</p>` : ""}<p class="kicker">Spec</p><div class="log">${esc(sl.specExcerpt || sl.specMissing || "No spec on this slice.")}</div><p class="kicker">Tree</p>${(sl.treeBrief || []).map((t) => `<div class="m">${esc(t)}</div>`).join("")}${renderOrder(sl)}</section>`;
}
function renderOrder(sl) {
  return `${(sl.do || []).length ? `<p class="kicker">Do this sitting</p>${sl.do.map((d, i) => `<div class="task"><div class="repo">${i + 1}</div><div class="t">${esc(d)}</div></div>`).join("")}` : ""}${(sl.done || []).length ? `<p class="kicker">Done when</p>${sl.done.map((d) => `<div class="m">${esc(d)}</div>`).join("")}` : ""}${(sl.dont || []).length ? `<p class="kicker">Do not</p>${sl.dont.map((d) => `<div class="m">— ${esc(d)}</div>`).join("")}` : ""}`;
}
function estateView() {
  const heat = (state.snapshot && state.snapshot.heat) || [];
  return `<section class="panel"><p class="kicker">Estate</p><h2 class="display">Materials.</h2><div class="list">${heat.map((r) => `<button class="item" data-open-repo="${esc(r.full)}"><div><div class="t">${esc(r.name)}</div><div class="m">${esc(r.desc || r.lang || "—")} · ${rel(r.pushed)}</div></div><span class="pill ${r.open ? "warn" : ""}">${r.open} open</span></button>`).join("")}</div></section>`;
}
function repoView() {
  const r = state.estateRepo;
  if (!r) return `<section class="panel"><p class="empty">Select a repository.</p></section>`;
  const repo = r.repo; const issues = (r.issues || []).filter((i) => !i.pull_request);
  return `<section class="panel"><p class="kicker">Estate</p><h2 class="display">${esc(repo.name)}</h2><p class="sub">${esc(repo.description || "")}</p><div class="row"><button class="btn" id="use-repo">Use this repo</button></div><p class="kicker">Open issues</p><div class="list">${issues.length ? issues.map((it) => `<div class="item"><div><div class="t">${esc(it.title)}</div><div class="m">#${it.number}</div></div><button class="pill on" data-sit-issue="${esc(repo.full_name)}#${it.number}" data-sit-title="${esc(it.title)}" data-sit-url="${esc(it.html_url)}">Sit</button></div>`).join("") : `<p class="empty">No open issues. Use this repo to sit on a file.</p>`}</div><p class="kicker">Last commits</p><div class="list">${(r.commits || []).slice(0, 3).map((c) => `<div class="item"><div><div class="t">${esc(((c.commit && c.commit.message) || "").split("\n")[0])}</div><div class="m">${rel(c.commit && c.commit.author && c.commit.author.date)}</div></div></div>`).join("")}</div></section>`;
}
function keysView() {
  return `<section class="panel settings"><p class="kicker">Keys</p><h2 class="display">The token stays in this browser.</h2><label class="field"><span class="label">Token</span><input id="retoken" type="password" value="${esc(state.token)}" /></label><div class="row"><button class="btn" id="save-token">Save</button><button class="btn ghost" id="leave">Sign out</button></div></section>`;
}
function bindGate() {
  $("#enter").onclick = async () => {
    const token = $("#token").value.trim(); const err = $("#gate-err"); err.hidden = true;
    try { await boot(token); } catch (e) { err.hidden = false; err.textContent = e.message || "Could not authenticate."; }
  };
}
function bindView() {
  document.querySelectorAll("[data-nav]").forEach((b) => { b.onclick = () => { state.view = b.dataset.nav; state.error = ""; render(); }; });
  document.querySelectorAll("[data-open-repo]").forEach((b) => { b.onclick = () => openRepo(b.dataset.openRepo); });
  document.querySelectorAll("[data-sit-issue]").forEach((b) => { b.onclick = () => sitFromIssue(b.dataset.sitIssue, b.dataset.sitTitle, b.dataset.sitUrl); });
  const intent = $("#intent"); if (intent) intent.oninput = () => { state.intent = intent.value; };
  const make = $("#make-plan"); if (make) make.onclick = composePlan;
  const sit = $("#start-sit"); if (sit) sit.onclick = startSitting;
  const over = $("#start-over"); if (over) over.onclick = () => { state.plan = null; state.sitting = null; state.notice = ""; state.view = "desk"; render(); };
  const mark = $("#mark-done"); if (mark) mark.onclick = markSliceDone;
  const endSit = $("#leave-sit"); if (endSit) endSit.onclick = () => { state.sitting = null; state.notice = ""; state.view = "desk"; render(); };
  const use = $("#use-repo"); if (use) use.onclick = () => { if (!state.estateRepo) return; const full = state.estateRepo.repo.full_name; state.intent = "Finish one slice in " + full + ". No new repository."; state.plan = null; state.sitting = null; state.view = "desk"; render(); composePlan(); };
  const saveTok = $("#save-token"); if (saveTok) saveTok.onclick = async () => { try { await boot($("#retoken").value.trim()); } catch (e) { state.error = e.message; render(); } };
  const leave = $("#leave"); if (leave) leave.onclick = () => { localStorage.removeItem(STORE.token); state.user = null; state.token = ""; render(); };
}
async function boot(token) {
  if (!token) throw new Error("A token is required.");
  GH.setToken(token); const user = await GH.me(); state.token = token; state.user = user; localStorage.setItem(STORE.token, token); state.view = "desk"; render(); await refresh();
}
async function refresh() {
  state.busy = true;
  try {
    const login = state.user.login;
    const [repos, issues, pulls, events] = await Promise.all([GH.repos(), GH.searchIssues(`user:${login} is:issue is:open`, 40), GH.searchIssues(`user:${login} is:pr is:open`, 20), GH.events(login).catch(() => [])]);
    state.repos = repos; state.snapshot = Agent.understand(repos, issues, pulls, events);
  } catch (e) { state.error = e.message; } finally { state.busy = false; render(); }
}
async function openRepo(full) {
  const repo = state.repos.find((r) => r.full_name === full); const [owner, name] = full.split("/");
  state.view = "repo"; state.estateRepo = { repo, commits: [], issues: [] }; render();
  try { const [commits, issues] = await Promise.all([GH.commits(owner, name, 5), GH.repoIssues(owner, name, 12)]); state.estateRepo = { repo, commits, issues }; } catch (e) { state.error = e.message; }
  render();
}
async function composePlan() {
  state.error = ""; state.notice = ""; state.sitting = null; state.intent = ($("#intent") && $("#intent").value) || state.intent; state.busy = true; state.view = "desk"; render();
  try {
    const picks = Agent.candidates(state.intent, state.repos, state.snapshot); const evidence = [];
    for (const pick of picks) {
      const repo = pick.repo; const [owner, name] = repo.full_name.split("/");
      const [commits, readme, issues, rootItems] = await Promise.all([GH.commits(owner, name, 6).catch(() => []), GH.readme(owner, name).catch(() => ""), GH.repoIssues(owner, name, 10).catch(() => []), GH.rootTree(owner, name).catch(() => [])]);
      const root = (rootItems || []).map((i) => i.name || i);
      let files = [];
      if (commits && commits[0] && commits[0].sha && GH.commit) {
        try { const detail = await GH.commit(owner, name, commits[0].sha); files = (detail.files || []).map((f) => f.filename); } catch {}
      }
      evidence.push({ full: repo.full_name, owner, name, lang: repo.language, pushed: repo.pushed_at, open: repo.open_issues_count || 0, desc: repo.description || "", homepage: repo.homepage || "", score: pick.score, readme, root, files, commits: (commits || []).map((c) => (c.commit && c.commit.message) || ""), issues: (issues || []).filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, body: i.body || "", html_url: i.html_url || "", updated_at: i.updated_at })) });
    }
    state.plan = Agent.reason(state.intent, state.snapshot, evidence);
  } catch (e) { state.error = e.message; } finally { state.busy = false; render(); }
}
async function startSitting() {
  if (!state.plan || !state.plan.slice) return;
  const sl = Object.assign({}, state.plan.slice, { ticked: false, specExcerpt: "", specMissing: "", treeBrief: [] });
  state.sitting = sl; state.view = "desk"; state.busy = true; render();
  try { await enrichSitting(sl); } catch (e) { state.error = e.message; } finally { state.busy = false; render(); }
}
async function sitFromIssue(ref, title, url) {
  const parts = String(ref || "").split("#"); const repo = parts[0] || ""; const num = Number(parts[1] || 0); const bits = repo.split("/");
  state.sitting = { repo, owner: bits[0], name: bits[1], title: title || repo, continues: num, url: url || "", kind: "continue", ticked: false, do: ["Do the next empty box on #" + num + "."], done: ["The next box on #" + num + " is checked"], dont: ["A second issue"], specExcerpt: "", specMissing: "", treeBrief: [] };
  state.view = "desk"; state.busy = true; render();
  try {
    const issue = await GH.issue(bits[0], bits[1], num); const body = issue.body || "";
    const boxes = String(body).split("\n").map((line) => { const m = line.match(/^\s*[-*+]\s*\[( |x|X)\]\s*(.+)$/); return m ? { checked: m[1].toLowerCase() === "x", text: m[2].trim() } : null; }).filter(Boolean);
    const openBox = boxes.find((b) => !b.checked);
    if (openBox) state.sitting.title = openBox.text.replace(/\*\*/g, "");
    const br = body.match(/\bbranch(?:\s+name)?\s*[:\-]?\s*`?((?:feat|fix|chore)\/[A-Za-z0-9._/-]+)`?/i);
    const sp = body.match(/((?:docs|spec|specs|superpowers)\/[A-Za-z0-9._/-]+\.md)/);
    if (br) state.sitting.branch = br[1]; if (sp) state.sitting.spec = sp[1];
    await enrichSitting(state.sitting);
  } catch (e) { state.error = e.message; } finally { state.busy = false; render(); }
}
async function enrichSitting(sl) {
  const brief = [];
  if (sl.spec) {
    const text = await GH.fileText(sl.owner, sl.name, sl.spec, sl.branch || "main") || await GH.fileText(sl.owner, sl.name, sl.spec);
    if (!text) sl.specMissing = "Spec not in the tree: " + sl.spec;
    else sl.specExcerpt = specSection(text, sl.title);
  } else sl.specMissing = "No spec path on this slice.";
  const hits = await GH.searchCode(`repo:${sl.repo} Live`);
  sl.liveHits = hits.map((h) => h.path).filter(Boolean).slice(0, 4);
  brief.push(sl.liveHits.length ? ("Live in " + sl.liveHits.join(", ")) : "No Live hit in code search.");
  sl.treeBrief = brief;
}
function specSection(md, title) {
  const id = (String(title).match(/\bG\d+\b/) || [])[0]; const lines = String(md || "").split("\n");
  if (!id) return lines.slice(0, 28).join("\n");
  let start = lines.findIndex((l) => l.indexOf(id) >= 0); if (start < 0) start = 0;
  return lines.slice(start, start + 36).join("\n");
}
async function markSliceDone() {
  const sl = state.sitting;
  if (!sl || !sl.continues) { state.error = "No issue box to tick. Commit the file."; render(); return; }
  state.busy = true; state.error = ""; state.notice = ""; render();
  try {
    const issue = await GH.issue(sl.owner, sl.name, sl.continues);
    const next = checkFirstOpenBox(issue.body || "", sl.title);
    if (!next.changed) state.notice = "No empty checkbox left.";
    else {
      await GH.patchIssue(sl.owner, sl.name, sl.continues, { body: next.body });
      sl.ticked = true; state.notice = "Checked the box on " + sl.repo + "#" + sl.continues + ".";
    }
  } catch (e) { state.error = e.message; } finally { state.busy = false; render(); }
}
function checkFirstOpenBox(body, hint) {
  const lines = String(body || "").split("\n");
  let idx = lines.findIndex((ln) => /^\s*[-*+]\s*\[ \]\s*/.test(ln));
  if (idx < 0) return { changed: false, body };
  lines[idx] = lines[idx].replace("[ ]", "[x]");
  return { changed: true, body: lines.join("\n") };
}
function rel(date) { if (!date) return ""; const d = (Date.now() - new Date(date).getTime()) / 1000; if (d < 3600) return `${Math.floor(d / 60)}m ago`; if (d < 86400) return `${Math.floor(d / 3600)}h ago`; if (d < 604800) return `${Math.floor(d / 86400)}d ago`; return new Date(date).toLocaleDateString(); }
function esc(s) { const map = { "&": "\u0026amp;", "<": "\u0026lt;", ">": "\u0026gt;", '"': "\u0026quot;" }; return String(s ?? "").replace(/[&<>"]/g, (c) => map[c]); }
try { if (state.token) boot(state.token).catch(() => { state.user = null; render(); }); else render(); } catch (e) { document.getElementById("app").textContent = e.message; }
