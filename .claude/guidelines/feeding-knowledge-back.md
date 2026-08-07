# Feeding knowledge back into the guidelines

**Principle:** Every development task ends by feeding back the knowledge that will
change how someone writes code *elsewhere*. This is a standing, non-optional part
of the work. But the guidelines are a **working set, not a logbook** — they only
keep their value while they stay short enough to be read in full.

## Three places knowledge can live

Pick the *lowest* one that works. Only what survives all three questions below
reaches the guidelines.

1. **Code, test, lint or type** — enforced, can't rot. Always the first choice.
2. **Commit message / PR description** — the post-mortem: what we measured, in
   which browser, at which viewport, before/after numbers. `git log -S` finds it.
3. **A guideline file** — *only* the transferable rule that the next, unrelated
   change must follow.

"Important, but not in the guidelines" is a legitimate outcome, not a shortcut.

## The admission bar — all three must be yes

- **Will it bite again somewhere else?** If the fix lives in one component and no
  future file will hit it, the code plus its test *is* the record.
- **Is there no guardrail already?** If a test, lint rule or type enforces it,
  that is the guideline. Prose beside it is a duplicate that will rot.
- **Does rediscovering it cost more than a grep?** What `git log` or a one-minute
  search hands you doesn't earn a line here.

Typical passes: "use X, not Y" decisions and *why* (mockk over Mockito;
app-side auditing over DB triggers), conventions future work must follow
(schema-per-module, naming), integration contracts (the 401/CSRF SPA contract),
version gotchas that affect every future edit (`build.rolldownOptions` in Vite 8).

Typical fails: a single component's layout bug, a measurement session, anything
obvious from the code, task-local detail — and anything secret.

## Form

- **One entry = the rule + the why, ~3 lines, imperative.** Write what the next
  person must *do*, not what we found.
- **No measurements inline.** Numbers, browser matrices, before/after tables go
  in the commit or PR; link it if the reasoning matters.
- **Soft budget: ~150 lines per file, ~8 bullets per section.** Going over is the
  signal to *condense* — pull several bullets up into one principle, drop the ones
  that no longer bite — not to append.
- Prefer **adding to the relevant existing file**; only create a new topic file
  for a genuinely new area, and then link it from [`README.md`](README.md) (and
  from the root `CLAUDE.md` if it's a new area).
- If new knowledge contradicts an existing guideline, **update the guideline**
  (don't leave both) and adjust the code if needed.

## Make it part of the task

- When writing an implementation plan, include a **final task: "update the
  guidelines"** — which explicitly includes deciding that nothing needs to change.
- Treat it like tests: part of the definition of done, in scope of the PR.
