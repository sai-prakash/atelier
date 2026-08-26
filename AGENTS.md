# AGENTS

atelier is a static GitHub Pages product. Do not add a backend, database, or third-party auth server.

## Invariants

- GitHub is the only API for work state.
- Plans live in `workspace/plans/*.md`.
- Execution means issues, comments, files, and workflow_dispatch.
- Tokens belong in the browser or in Actions secrets — never committed.
- Visual language: warm paper `#f4f1ea`, near-black ink, serif display, hairline rules, no drop shadows as decoration.

## Change policy

Prefer fewer files. Keep `github.js`, `agent.js`, and `app.js` as the runtime. Planning must gather README, commits, and issues before it decides. If an LLM is added, it runs in Actions or in the browser with a user-supplied key. No proxy.
