# atelier

A GitHub-native studio for understanding, planning, and executing work across every repository you own.

No product backend. The system of record is GitHub: repositories, issues, pull requests, files in this repo, and Actions.

Live: [sai-prakash.github.io/atelier](https://sai-prakash.github.io/atelier/)

## Why it exists

Work is already on GitHub. Trackers that copy issues into another database go stale. atelier reads the estate, composes a plan from your intent, writes that plan as markdown here, and opens issues where the code lives.

## Product principles

- Quiet. Jony Ive restraint: paper, ink, one mark, no chrome.
- Native. If GitHub cannot store it, atelier does not store it.
- Agentic. Observe → gather evidence → infer → decide → execute. Humans approve by pressing Open.
- Honest. Reasoning is explicit and sourced from GitHub. An optional model belongs in Actions secrets — not a vendor server.

## How to use

1. Open the Pages site.
2. Paste a GitHub token with `repo`, `workflow`, and `read:user`.
3. Studio shows what is alive.
4. Work lists open issues and pull requests across the account.
5. Plan takes an intent, reads README/commits/issues from the matching repos, writes a reasoning trace, then can open issues and save `workspace/plans/*.md`.

The token stays in `localStorage` on your machine.

## Architecture

```
Browser (this site)
    │  GitHub REST
    ▼
Your repositories, issues, PRs, events
    │
    ▼
This repo: workspace/plans  +  .github/workflows/agent.yml
```

## Optional agent runner

`.github/workflows/agent.yml` is the compute plane. It reads a brief and can write a plan file. Attach `XAI_API_KEY` or `OPENAI_API_KEY` as an Actions secret when you want a model in the loop — still no atelier server.

## Local

Any static server from this folder. There is no build step.
