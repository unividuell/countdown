# Dev Login Picker: Mobile-First + More Futurama Test Users

**Status:** Approved design (2026-08-04)
**Touches:** backend `iam` devauth only — `TestUserSeeder`, `DevLoginController`, their tests.
**Builds on:** the test-auth picker from [staging-environment](2026-06-13-staging-environment-design.md).

## Purpose

The non-prod test-login picker renders unusably small on a phone, and five test users are too few to
exercise multi-member views. Make the picker mobile-first and grow the Futurama roster from 5 to 12.

The audience for this app is phones, so the dev scaffolding we use to test it has to be usable on
one too — today the picker is the one screen that isn't.

## Root cause of "too small on mobile"

The picker is a server-rendered HTML string in `DevLoginController.picker`. Its `<head>` has no
`<meta name="viewport">`, so mobile browsers lay the page out at their ~980px fallback width and then
scale the whole thing down to fit. Everything shrinks proportionally — that, not the CSS, is the
primary defect. Secondary: `min-width:260px` on the card, `padding:8px` tap targets (below the 44px
minimum), and `height:100vh` on a `place-items:center` grid, which clips rather than scrolls once the
content is taller than the viewport — a real risk at 12 entries on a small screen.

## Decisions (locked during brainstorming)

- **12 test users**, not 8 or 20: the Planet Express crew plus the best-known supporting cast. Enough
  to populate a member list, still a list you can take in on one phone screen.
- **Avatars are system emoji.** Considered and rejected: hand-drawn flat SVGs, procedurally generated
  identicons via the existing `SeededRandom`, and checked-in Noto Emoji SVGs. Actual Futurama
  character art is 20th Television/Disney IP, and a redrawn-but-recognizable version is a derivative
  work, so no show artwork enters the repo under any of those routes. Emoji cost nothing, need no
  assets, and distinguish a 12-row list faster than a text label alone.
- **No avatar colour/short-name reuse from `community`.** `AvatarColor` and `MemberShortName` live in
  `community.internal` and are unreachable from `iam` by Modulith's rules. Re-implementing them for
  dev scaffolding would be duplication without payoff; a per-character accent colour on the seed row
  is enough.
- **Existing five keep their `githubId`s** (-1…-5). The seeder matches on `githubId`, so changing
  them would orphan the current rows in every dev and staging database and insert duplicates.
- **Picker iterates the seed list, not the query result.** `findByGithubLoginIn` returns rows in no
  guaranteed order; at five entries nobody noticed, at twelve a reshuffling list would read as a bug.
- **No frontend change.** `webapp-vue/src/pages/login.vue` is the real login page and is not involved;
  it navigates to `/login/github`, which the server resolves to this picker or to real GitHub OAuth.

## Seed data

`TestUserSeeder`'s `Triple(login, githubName, displayName) to Long` cannot carry two more fields
legibly, so it is replaced by a `data class SeedUser(login, githubName, displayName, githubId, emoji,
accentHex)`. `seedLogins` stays as a derived property — `DevLoginController.loginAs` uses it as the
allowlist that stops a caller assuming any registered identity by name, so that contract must not
change shape.

| # | `githubId` | login | `githubName` | `displayName` | emoji |
|---|---|---|---|---|---|
| 1 | -1 | `Fry` | — | — | 🍕 |
| 2 | -2 | `leela` | Leela | Turanga Leela | 👁️ |
| 3 | -3 | `Bender` | — | — | 🤖 |
| 4 | -4 | `prof` | — | Prof Farnsworth | 🔬 |
| 5 | -5 | `amy` | — | — | 💅 |
| 6 | -6 | `hermes` | — | Hermes Conrad | 📋 |
| 7 | -7 | `zoidberg` | — | Dr. Zoidberg | 🦞 |
| 8 | -8 | `scruffy` | — | Scruffy | 🧹 |
| 9 | -9 | `zapp` | — | Zapp Brannigan | 🎖️ |
| 10 | -10 | `kif` | — | Kif Kroker | 😩 |
| 11 | -11 | `nibbler` | — | Nibbler | 🐾 |
| 12 | -12 | `mom` | — | Mom | 🏭 |

Rows 1–5 are unchanged from today, including the deliberate mix of null/non-null name fields, which
keeps `User.username`'s three-way fallback (`displayName ?: githubName ?: githubLogin`) exercised.

Each row also carries an `accentHex`, used only as the emoji chip's background in the picker. Twelve
fixed literals picked by hand for readable contrast against both the light and the dark card
background — not derived, so there is no colour algorithm to keep in sync with anything.

## Picker markup and CSS

Still a single self-contained HTML string with inline `<style>` — no template engine, no static
resources directory (the backend has none), no external request.

- `<meta name="viewport" content="width=device-width,initial-scale=1">` — the actual fix.
- Card: `width:100%`, `max-width:22rem`, padding-based sizing; `min-width` dropped.
- Page: `min-height:100dvh` with padding and `align-items:center`, so a list taller than the viewport
  scrolls instead of being clipped.
- Each login is a `<form>`-wrapped full-width button laid out as a row: emoji chip (circle in the
  row's `accentHex`) then the display name, left-aligned, `min-height:44px`.
- Colours and type follow the SPA's stone palette and border radii, with a
  `@media (prefers-color-scheme: dark)` block.
- The existing escaping stays: `HtmlUtils.htmlEscape` on every interpolated user value, CSRF token
  hidden field per form. Emoji and accent colours are literals from our own source, not user input.

## Testing

TDD as usual; the seeder and controller both already have Testcontainers-backed `@SpringBootTest`
coverage to extend.

- `TestUserSeederTest`: assert all twelve logins exist and that each maps to its expected negative
  `githubId` — the ID pinning is what protects existing dev/staging rows from being duplicated.
- `TestUserSeederAllowlistTest` / `TestUserSeederConvergenceTest`: unchanged. They pin super-admin
  flag behaviour, which this change does not touch, and each needs its own distinct allowlist value.
- `DevLoginControllerTest`: extend the picker test to assert the viewport meta tag is present and
  that a newly added user (`zoidberg`) appears; assert the rendered order matches the seed list
  order; add a `loginAs` success case for a new login. The existing non-seed rejection test
  (`octocat`) stays as the allowlist guard.

## Out of scope

- Community membership for the new users. The seeder only creates `iam` users; nothing joins them to
  a community, so the member list does not change until someone is added there.
- Any change to real GitHub OAuth, the super-admin allowlist, or the SPA login page.
