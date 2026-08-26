const GH = {
  token: "",
  user: null,
  controlRepo: "atelier",
  setToken(token) { this.token = (token || "").trim(); },
  headers() {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  },
  async req(path, opts = {}) {
    const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
    const res = await fetch(url, { ...opts, headers: { ...this.headers(), ...(opts.headers || {}) } });
    if (res.status === 204) return null;
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || res.statusText;
      const err = new Error(msg); err.status = res.status; err.data = data; throw err;
    }
    return data;
  },
  async me() { this.user = await this.req("/user"); return this.user; },
  async repos() {
    const out = [];
    for (let page = 1; page <= 4; page++) {
      const batch = await this.req(`/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`);
      if (!batch.length) break; out.push(...batch); if (batch.length < 100) break;
    }
    return out;
  },
  async searchIssues(q, perPage = 30) {
    const data = await this.req(`/search/issues?q=${encodeURIComponent(q)}&per_page=${perPage}`);
    return data.items || [];
  },
  async repoIssues(owner, repo, perPage = 10) {
    try { return await this.req(`/repos/${owner}/${repo}/issues?state=open&per_page=${perPage}`); } catch { return []; }
  },
  async rootTree(owner, repo) {
    try {
      const items = await this.req(`/repos/${owner}/${repo}/contents/`);
      return (Array.isArray(items) ? items : []).map((i) => i.name);
    } catch { return []; }
  },
  async commits(owner, repo, perPage = 8) { return this.req(`/repos/${owner}/${repo}/commits?per_page=${perPage}`); },
  async readme(owner, repo) {
    try { const file = await this.req(`/repos/${owner}/${repo}/readme`); return atob(file.content.replace(/\n/g, "")); } catch { return ""; }
  },
  async contents(owner, repo, path) { return this.req(`/repos/${owner}/${repo}/contents/${path}`); },
  async putFile(owner, repo, path, content, message, sha) {
    const body = { message, content: btoa(unescape(encodeURIComponent(content))), branch: "main" };
    if (sha) body.sha = sha;
    return this.req(`/repos/${owner}/${repo}/contents/${path}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  },
  async createIssue(owner, repo, title, body, labels = []) {
    return this.req(`/repos/${owner}/${repo}/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body, labels }) });
  },
  async issue(owner, repo, number) { return this.req(`/repos/${owner}/${repo}/issues/${number}`); },
  async patchIssue(owner, repo, number, fields) {
    return this.req(`/repos/${owner}/${repo}/issues/${number}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
  },
  async comment(owner, repo, number, body) {
    return this.req(`/repos/${owner}/${repo}/issues/${number}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
  },
  async closeIssue(owner, repo, number) {
    return this.req(`/repos/${owner}/${repo}/issues/${number}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: "closed" }) });
  },
  async dispatch(owner, repo, workflow, ref, inputs) {
    return this.req(`/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref, inputs }) });
  },
  async events(login) { return this.req(`/users/${login}/events?per_page=30`); },
  async pulls(owner, repo) { return this.req(`/repos/${owner}/${repo}/pulls?state=open&per_page=20`); },
  async languages(owner, repo) { try { return this.req(`/repos/${owner}/${repo}/languages`); } catch { return {}; } },
};
