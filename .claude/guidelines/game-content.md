# Game content (hand-curated puzzle data)

Content is assembled at play time from the round seed — generated or **selected from a
hand-curated set**. The rule is that no round may cost admin effort, not that a machine must write
it (see [anti-cheat-design.md](../../docs/superpowers/specs/2026-08-02-anti-cheat-design.md)). A
puzzle *text* is written by hand, or it isn't good.

That makes the curated set **the solution to every round of that game** — in a repository that is
public, because the free GitHub Actions runners require it.

- **Never commit game content in plaintext.** Not in a spec, plan, commit message, PR description
  or test fixture — and not in a commit you intend to amend away: a pushed blob stays reachable by
  its hash.
- **Hand content over via `.local/`, then `sops -e`, then commit the ciphertext.** `.local/` is
  gitignored and lives in the **main checkout, never in a worktree** — a worktree would take the
  only plaintext copy with it. The buffer file is a stop on the way: `sops -d` reproduces it.
- **One folder per game, mirrored across three places:** `.local/games/<game>/X.yaml` ↔
  `deploy/games/<game>/X.sops.yaml` ↔ `core/src/main/resources/games/<game>/` (sample). Each
  game's `scripts/<game>-*.sh` maps the pair; `.sops.yaml` matches any depth.
- **Examples come from a committed sample set, never from the real one.** Specs, tests and
  fixtures use obviously fake entries. The app **fails to start** if it loaded the sample under
  `production` or `staging`, so a missing mount can't ship a broken game.
- **Keep the decryption out of the application.** The backend reads plain YAML from a path; the
  deployment decrypts into it. No key handling in Kotlin, and CI needs no key: tests run against
  the sample.
- **On/off switches stay unencrypted, beside the ciphers.** A plain list (`categories.txt`) decides
  which encrypted files are active — a one-line, reviewable diff without a key. The deployment
  copies it next to the decrypted files, so backend and `update.sh` read the same one. Everything
  switched off must not stop the start: the game is just unavailable.
- **A checker checks only what is mechanically wrong** — types, ranges, a parseable date, a
  non-blank string; those run in the loader on every start. Sentence counts, word lists and quotas
  do not belong there: whoever writes the content writes to the checker, and a rule about taste
  becomes a template.
- **Review curated content by looking at it:** a throwaway page that puts each entry beside what
  the player will see, generated outside the repository because its output *is* the content. It
  flags the cases worth a second look rather than rejecting them. No green test replaces it.
- **Drop a bad entry at review; never clamp its value in code.** A clamp keeps the entry and makes
  its own text a lie.
- **The presentation must not contradict the text.** A property the description names — dark, pale,
  muted — comes from the entry, never re-rolled per round.

Concrete shape, and what is checked versus looked at:
[the Guess Hue dataset spec](../../docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md).
