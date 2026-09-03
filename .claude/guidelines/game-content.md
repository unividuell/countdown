# Game content (hand-curated puzzle data)

Content is assembled at play time from the round seed — either generated or **selected from a
hand-curated set**. Both are fine; the rule is that no round may cost admin effort, not that a
machine must write it (see
[anti-cheat-design.md](../../docs/superpowers/specs/2026-08-02-anti-cheat-design.md)). Curation is
what language forces: a puzzle *text* is written by hand, or it isn't good.

That makes the curated set **the solution to every round of that game** — in a repository that is
public, because the free GitHub Actions runners require it.

- **Never commit game content in plaintext.** Not in a spec, plan, commit message, PR
  description or test fixture — and not in a commit you intend to amend away. Git keeps the
  blob, and a pushed one stays reachable to anyone who knows its hash even when no branch points
  at it. The first draft of the Guess Hue spec shipped all 60 entries as a table; this rule
  exists because of it.
- **Hand content over via `.local/`, then `sops -e`, then commit the ciphertext.** `.local/` is
  gitignored and lives in the **main checkout, never in a worktree** — worktrees are temporary
  and would take the only plaintext copy with them. The buffer file is a stop on the way, not an
  original: `sops -d` reproduces it.
- **Examples come from a committed sample set, never from the real one.** Specs, tests and
  fixtures use obviously fake entries. The app **fails to start** if it loaded the sample while
  `production` or `staging` is active — the two profiles real players run under (this repo has no
  `dev` profile) — so a missing mount can't silently ship a broken game.
- **Keep the decryption out of the application.** The backend reads plain YAML from a path; the
  deployment decrypts into it. No crypto library and no key handling in Kotlin, and CI never
  needs the key because the tests run against the sample.
- **A checker can only check what is mechanically wrong.** Field types, ranges, a parseable
  date, a non-blank string: those belong in the loader and run on every start. Sentence counts,
  word lists, quotas per category do not. Guess Hue had all three, and what they actually
  enforced was a formula — whoever writes the content writes to the checker, so a rule about
  taste becomes a template, and the template is what made the set unplayable.
- **Review curated content by looking at it.** A throwaway page that puts each entry beside the
  thing the player will actually see, generated outside the repository because its output *is*
  the content. That page is the review step; no green test replaces it. Have it flag the cases
  worth a second look rather than reject them — in Guess Hue, six of the first seven entries the
  reviewer struck were exactly the ones the page had marked as painting an unreadable wheel.
- **Clamping a bad value in code is worse than dropping the entry.** A clamp keeps the entry and
  makes its own text a lie: a pale grey-green rendered as vivid green describes nothing. The
  limit belongs at review time, where a human can strike the entry instead.
- **The presentation must not contradict the text.** If a description names a property — dark,
  pale, muted — that property has to come from the entry, not be re-rolled per round. Guess Hue
  drew saturation and lightness randomly for one revision, and every entry whose text mentioned
  brightness was regularly refuted by its own screen.

Concrete shape, and what is checked versus what is looked at:
[the Guess Hue dataset spec](../../docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md).
