# atelier

**Product & UX specification — v1 final**  
Status: signed for build. Not a workshop.  
Constraint: GitHub Pages + GitHub API only. No product backend.

---

## 1. The job

A person with many GitHub repositories sits down for 25 minutes and must know, without asking another model:

1. which repository to open
2. which file or issue to touch first
3. what they are forbidden to do
4. how they will know they are finished

atelier exists only to answer those four questions and to hold the sitting until the answer is true on GitHub.

If a screen does not serve that job, it is not in the product.

---

## 2. Who it is for

One operator of a personal or small-team GitHub estate. They already know how to write code. They do not need another issue tracker. They need a desk that will not invent work.

Not for: project managers, multi-player standups, Jira refugees, “AI workspace” tourists.

---

## 3. Promise

> Name the work in one sentence. Stay on the desk until the box on GitHub is honestly true.

Positioning: **the sitting**, not the dashboard. GitHub remains the system of record. atelier is the place the work is chosen, framed, and closed.

---

## 4. Non-goals (v1)

- Chat
- A model that picks the repo
- A second database
- An in-browser editor
- Global issue search that clones github.com
- Stats, heatmaps, language charts
- Notifications
- Multi-player
- Creating new repositories
- WebLLM on the critical path

A model may later rewrite the four Do-steps. It may not choose the slice.

---

## 5. Product principles

1. **One object on screen.** The desk is the product. Everything else is a drawer.
2. **GitHub is a door, not a destination.** Links exist to type code and to read the archive. The sitting does not end when the door opens.
3. **Evidence before language.** A work order that cannot name a repo, a ref, a file or issue, and a refuse list is not saved.
4. **Refuse to tick a lie.** Mark done inspects the tree. If the forbid thing is still there, the checkbox stays empty.
5. **As little IA as possible.** Two rooms. One header mark for keys.
6. **The sentence is a filter, not a prompt.** If the sentence matches nothing, the product says nothing to open. It does not fall back to the hottest checkbox.

---

## 6. Objects

| Object | What it is | Source of truth |
|---|---|---|
| Sentence | One line of intent | The desk field |
| Work order | Repo + slice + continue + do + done-when + do-not + evidence | Derived, then optional file in `atelier/workspace/` |
| Sitting | An accepted work order in progress | Browser state + last write to `workspace/sittings.md` |
| Slice | The first relevant empty checkbox, or one named file | Issue body + spec file + tree |
| Estate | Repos the token can see | GitHub |
| Door | Issue, spec blob, github.dev | GitHub URLs |

There is no “Plan” object in the IA. Planning is how a sitting is born.

---

## 7. Information architecture

```
                    ┌──────────┐
     launch ───────►│   Desk   │◄──── Sit / Use this repo
                    └────┬─────┘
                         │
                    ┌────┴─────┐
                    │  Estate  │
                    └────┬─────┘
                         │
                    ┌────┴─────┐
                    │ Repo     │  (drill-in, not a tab)
                    └──────────┘

Header:  atelier          Desk · Estate          ●
● opens Keys. Keys is not a tab.
```

Four previous tabs are void: Studio, Work, Plan, Keys-as-tab.

---

## 8. Desk — three states, one surface

### Empty
One field. One button: **Make the work.** No stats.

### Order
Repo, slice, continue line, Do / Done when / Do not. Primary: **Sit**. Quiet: Start over. None → no Sit.

### Sitting
Spec section for this box. Tree brief. Mark done verifies then ticks. Doors last: Issue · Spec · Edit.

Mark done refuses if the forbid path is still in the tree.

---

## 9. Estate

List: hottest repos, one number. Drill-in: issues with Sit, three commits, Use this repo. No global issue browser.

---

## 10. Workflows

W1 Hottest slice — Empty → sentence → Order → Sit → Edit → Mark done.
W2 Named repo — Estate → Use this repo or Sit on #N.
W3 No match — Nothing to open. No hottest fallback.
W4 End sitting — Empty, issue untouched.
W5 First run — gate once, then Desk Empty.

---

## 11. Copy deck

Make the work · Sit · Start over · Mark done · End sitting · Issue · Spec · Edit · Use this repo · Sit (on an issue)

---

## 12. Worth tests

After Make the work: repo, file or issue, refuse list, done-when — all yes.
After Sit: spec section or honest missing; tree brief names a path or no hit; can mark done here.
After Mark done: lie blocked the tick, or truth allowed it; GitHub matches.
IA: launch is Desk; not four tabs; no Work-as-browser.

---

## 13. Build sequence

A House — two rooms, three Desk states.
B Eyes — spec fetch, tree brief.
C Honesty — verify then tick, sittings.md.

A first. B without A is the old warehouse with fetching.

---

This document is the product. Implementation that contradicts it is a bug.
