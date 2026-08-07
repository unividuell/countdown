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
  fixtures use obviously fake entries. The app **fails to start** outside the `dev` profile if it
  loaded the sample, so a missing mount can't silently ship a broken game.
- **Keep the decryption out of the application.** The backend reads plain YAML from a path; the
  deployment decrypts into it. No crypto library and no key handling in Kotlin, and CI never
  needs the key because the tests run against the sample.

Concrete shape and the validation rules that make a curated set checkable:
[the Guess Hue dataset spec](../../docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md).
