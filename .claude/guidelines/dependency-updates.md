# Dependency updates (Maven · npm · Docker)

How to run an "update all libs" pass, and **which newest versions we deliberately do NOT
take**. Re-read the holdback table before bumping anything.

## Holdbacks — newest is NOT the target

| Dependency | We pin | Newest exists | Why we hold back |
|---|---|---|---|
| `typescript` | `~6.0.x` | `7.x` | **TS 7 breaks `vue-tsc`.** TS 7 is the native Go port and its `package.json` `exports` no longer expose `./lib/tsc`, which `vue-tsc` resolves at startup → `ERR_PACKAGE_PATH_NOT_EXPORTED`, failing both `pnpm typecheck` and `pnpm build`. Revisit only when `vue-tsc`/Volar ship TS 7 support. |
| `@types/node` | `^24.x` | `26.x` | The types major must match the **runtime** major, not the newest published. We run Node 24 (`deploy/web.Dockerfile`, `setup-node` in CI). Types ahead of the runtime type-check against APIs that don't exist at run time. |
| `node` (image + CI) | `24` | `26` | Production tracks **Active LTS** only. When the image moves to the next LTS, bump `@types/node` in the same commit. |
| `kotlin` | latest **stable** | `-Beta` builds | `versions:display-property-updates` happily suggests `2.4.20-Beta2`. Take stable only; filter pre-release tags yourself. |

## Dependabot alerts — triage before you bump

An open alert is **not** evidence the tree is vulnerable. Resolve the actual version
first; only then decide whether there is anything to fix.

```bash
cd webapp-vue
pnpm why postcss                 # how it enters the tree (direct vs. transitive, via whom)
ls -d node_modules/.pnpm/postcss@*   # what is physically installed
```

- pnpm does **not** hoist transitive deps, so `require('postcss/package.json')` throws
  `MODULE_NOT_FOUND` even when the package is installed. That is a resolution artefact,
  not evidence of absence — read `node_modules/.pnpm/` or the lockfile instead.
- **`scope: runtime` on a lockfile alert means the lockfile *importer*, not the browser
  bundle.** GitHub marks the whole subtree under `dependencies` as "runtime"; `postcss`
  reaches us via `vue` → `@vue/compiler-sfc` (and via `vite`), both build-time only. The
  check that settles it is `grep -r postcss dist/` after `pnpm build` — empty means nothing
  shipped, whatever the alert says.
- **An alert can be opened against a version the lockfile has already left.** Then dismiss it as
  *inaccurate*, no code change (precedent: GHSA-r28c-9q8g-f849, postcss).

If an alert **is** real, take the smallest fix: `pnpm update <pkg>` (lands a patched
transitive version inside the existing ranges) before `pnpm.overrides` (only when the
parent has not released yet). Do **not** leave a defensive `overrides` floor behind for a
package that already resolves past the fix — it is dead config that silently goes stale.

## Maven (`core/`)

```bash
cd core && ./mvnw -B versions:display-parent-updates versions:display-property-updates versions:display-dependency-updates
```

- **Do not** pass `-DprocessDependencyManagement=true` and act on the output: it lists the
  entire Spring Boot BOM (Jackson, Hikari, Netty, …). Those are the parent's business — the
  BOM is the single source of truth. **Only** the versions written literally in our `pom.xml`
  are ours: the parent, `kotlin.version`, `spring-modulith.version`, `kotlin-logging.version`,
  `metadata-extractor.version`, `twelvemonkeys.version`, `unividuell-auth.version` (below), and the
  four test deps (`kotest`, `mockk`, `springmockk`).
- **The plugin reports the next *minor*, not the newest *stable* — so it hides the patch you want**
  (it offers `4.2.0-M1` while `4.1.1` is out). Read the metadata yourself and pick the highest tag
  with no `-M`/`-RC`/`-Beta` suffix:
  ```bash
  curl -s https://repo.maven.apache.org/maven2/org/springframework/boot/spring-boot-starter-parent/maven-metadata.xml \
    | grep -oE '<version>[^<]+</version>' | tail -12
  ```
- `search.maven.org`'s index **lags by whole majors.** Trust `versions-maven-plugin` or
  `repo.maven.apache.org/maven2/<path>/maven-metadata.xml`, never the search API.
- Gate: **`./mvnw -B clean verify`** (full suite incl. Testcontainers + `ModularityTests`).
- **`unividuell-auth.version` is the auth lib, which is not on Maven Central.** Bump it by
  releasing [`unividuell/auth-spring-boot-starter`](https://github.com/unividuell/auth-spring-boot-starter)
  and deploying into `core/maven-repo/` (its README, "Releasing"), then commit that directory with
  the new version. The plugin only knows what `core/maven-repo/` already holds. A deploy brings
  three artifacts: `auth-spring-boot-starter-parent` (the others' POMs need it),
  `auth-spring-boot-starter` and `auth-spring-boot-starter-test` (test scope).
  Delete the old version's directories under `core/maven-repo/` first. A release is never
  redeployed under the same version — Maven keeps the first copy it resolved in `~/.m2` and in CI's
  cache; a `-SNAPSHOT` may be, as `updatePolicy=always` makes every build pick it up.

- **Compiler warnings that predate the bump are not the pass's business** (the `Unnecessary
  non-null assertion (!!)` ones on `UUID`). Fixing them is a separate source change.

### Jackson 3, not 2 — `tools.jackson.*` and immutable mappers

Boot 4.1 brings **Jackson 3**, so the package root is `tools.jackson`, *not*
`com.fasterxml.jackson` (only `jackson-annotations` still lives under `com.fasterxml`). Copying a
Jackson 2 snippet fails with `Unresolved reference 'databind'`. Mappers are also immutable now —
there is no `mapper.enable(...)`:

```kotlin
import tools.jackson.module.kotlin.jacksonObjectMapper
val json = jacksonObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(value)
// configuring features: jacksonMapperBuilder().enable(SerializationFeature.…).build()
```

## npm (`webapp-vue/`)

```bash
cd webapp-vue && pnpm outdated
pnpm update --latest "!typescript" "!@types/node"   # honour the holdbacks above
```

- `pnpm update --latest` rewrites the `package.json` ranges — that's what we want; the
  negation patterns keep the held-back packages untouched.
- Gate, in this order: **`pnpm lint && pnpm typecheck && pnpm test && pnpm build`**, then a
  final **`pnpm install --frozen-lockfile`** — CI installs frozen, so a lockfile that drifted
  from `package.json` fails there and nowhere else.
- After a **Prettier minor** bump, run `pnpm exec prettier --check src`. Minors can change
  formatting defaults and silently turn the next `pnpm format` into a repo-wide diff.
- A **happy-dom minor** can add a DOM API, and a capability check that was false in tests is then
  true — the spec silently changes which code path it exercises
  ([frontend-testing.md](frontend-testing.md#happy-dom-limits)).

## Docker

The compose files and `web.Dockerfile` intentionally use **floating major tags** —
`postgres:18`, `caddy:2`, `node:24-trixie-slim`, `debian:trixie-slim`,
`gcr.io/distroless/static-debian13`, `dpage/pgadmin4:latest`. Patch and minor
updates therefore arrive on `docker pull` with **no file to edit**. A dependency pass here
means *verifying the pinned major is still the right one*, not bumping a string:

```bash
docker pull -q postgres:18 && docker run --rm postgres:18 postgres --version
docker compose -f compose.yaml config -q          # validate after any edit
```

**No Alpine images** (musl breaks things). Use Debian-slim or distroless. Caddy publishes only
Alpine images, so `web.Dockerfile` copies its static binary out of `caddy:2` into distroless.

Only edit a tag when the **major** should move (e.g. Postgres 19, Caddy 3) — and for Node,
only to the next **Active LTS** (see the holdback table).

## GitHub Actions — the fourth ecosystem

Easy to forget, because nothing local reports it as outdated. Include it in every pass:

```bash
for r in actions/checkout actions/setup-java actions/setup-node docker/login-action; do
  echo "$r -> $(gh api "repos/$r/releases/latest" --jq .tag_name)"
done
```

Pin to the **major** tag (`@v7`), matching the existing style. Two things to know:

- Most "breaking changes" in these majors are a newer **Node runtime → minimum Actions Runner
  version** — a non-event on GitHub-hosted runners (`ubuntu-24.04-arm`).
- If `setup-node`'s auto-caching ever misfires: `with: { package-manager-cache: false }`. Today it
  finds nothing — no root `package.json`, pnpm comes from `corepack enable`.
- These can only be verified by **pushing** — there is no local run. Bump them in their own
  commit so a CI break is trivial to bisect and revert.
