# Feeding knowledge back into the guidelines

**Principle:** Every development task ends by feeding the important knowledge it
produced back into `.claude/guidelines/`. This is a standing, non-optional part
of the work — not a nice-to-have. It is how the project stays consistent and how
the next person (or AI assistant) avoids re-learning what we already paid for.

## Make it part of the task

- When writing an implementation plan, include a **final task: "update the
  guidelines"** (and, for a brand-new area, "add a new guideline file").
- A change isn't "done" until the knowledge worth keeping has been captured.
- Treat it like tests or docs: part of the definition of done, in scope of the PR.

## What to capture ("important things")

Capture the things that are **not obvious from reading the code or git history**:

- **Decisions and their rationale** — especially "use X, not Y" choices and *why*
  (e.g. mockk over Mockito; Vue Router 5 built-in routing over the archived
  unplugin; app-side auditing over DB triggers).
- **Conventions** future work must follow (naming, structure, schema-per-module).
- **Non-obvious framework / version behaviour and gotchas** we hit and how we
  resolved them (e.g. Spring Data JDBC sends explicit NULL for unset timestamps;
  `user` is a reserved word so the module is `iam`; `build.rollupOptions` →
  `build.rolldownOptions` in Vite 8).
- **Integration contracts** between parts (the 401/CSRF SPA contract, dev proxy).

## What NOT to capture

- Things obvious from the code, a quick grep, or `git log`.
- One-off, transient, or task-local details with no future relevance.
- Anything secret (credentials, tokens).

## How

- Prefer **adding to the relevant existing file**; only create a new topic file
  for a genuinely new area, and then **link it from
  [`README.md`](README.md)** (and from the root `CLAUDE.md` if it's a new area).
- Keep entries concise and actionable — a short rule plus the *why*, ideally with
  a one-line code/SQL snippet. High signal, low noise.
- If new knowledge contradicts an existing guideline, **update the guideline**
  (don't leave both) and adjust the code if needed.
