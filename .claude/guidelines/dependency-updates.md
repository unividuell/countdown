# Dependency updates (Maven · npm · Docker)

How to run a "update all libs" pass across the three ecosystems, and — more
importantly — **which newest versions we deliberately do NOT take, and why**.
Re-read the holdback table before bumping anything: every entry is a trap we
already stepped in once.

## Holdbacks — newest is NOT the target

| Dependency | We pin | Newest exists | Why we hold back |
|---|---|---|---|
| `typescript` | `~6.0.x` | `7.x` | **TS 7 breaks `vue-tsc`.** TS 7 is the native Go port and its `package.json` `exports` no longer expose `./lib/tsc`, which `vue-tsc` resolves at startup → `ERR_PACKAGE_PATH_NOT_EXPORTED`, failing both `pnpm typecheck` and `pnpm build`. Revisit only when `vue-tsc`/Volar ship TS 7 support. |
| `@types/node` | `^24.x` | `26.x` | The types major must match the **runtime** major, not the newest published. We run Node 24 (`deploy/web.Dockerfile`, `setup-node` in CI). Types ahead of the runtime type-check against APIs that don't exist at run time. |
| `node` (image + CI) | `24` | `26` | 24 is **Active LTS**; 26 is *Current*. Production tracks Active LTS only. Node 26 becomes LTS in Oct 2026 — bump `@types/node` in the same commit. |
| `kotlin` | latest **stable** | `-Beta` builds | `versions:display-property-updates` happily suggests `2.4.20-Beta2`. Take stable only; filter pre-release tags yourself. |

## Maven (`core/`)

```bash
cd core && ./mvnw -B versions:display-parent-updates versions:display-property-updates versions:display-dependency-updates
```

- **Do not** pass `-DprocessDependencyManagement=true` and act on the output: it lists the
  entire Spring Boot BOM (Jackson, Hikari, Netty, …). Those are the parent's business — the
  BOM is the single source of truth. **Only** the versions written literally in our `pom.xml`
  are ours: the parent, `kotlin.version`, `spring-modulith.version`, and the four test deps
  (`kotest`, `mockk`, `springmockk`).
- `search.maven.org`'s solr index **lags badly** (it reported Boot 3.5.3 as latest while 4.1.0
  was long out). Trust `versions-maven-plugin` or
  `repo.maven.apache.org/maven2/<path>/maven-metadata.xml`, never the search API.
- Gate: **`./mvnw -B clean verify`** (full suite incl. Testcontainers + `ModularityTests`).

### Kotlin 2.4: drop `-Xannotation-default-target`

`param-property` is the **default** from Kotlin 2.4, so the explicit
`-Xannotation-default-target=param-property` arg now only earns
`The argument '…' is redundant for the current language version 2.4.` It was removed from the
`kotlin-maven-plugin` `<args>`; `-Xjsr305=strict` stays.

> The ~58 `Unnecessary non-null assertion (!!) on a non-null receiver of type 'UUID'` warnings
> are **pre-existing** (identical count on 2.3.21) — not caused by a Kotlin bump. Don't
> "fix" them as part of a dependency pass; that's a separate source change.

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

## Docker

The compose files and `web.Dockerfile` intentionally use **floating major tags** —
`postgres:18`, `caddy:2-alpine`, `node:24-alpine`, `dpage/pgadmin4:latest`. Patch and minor
updates therefore arrive on `docker pull` with **no file to edit**. A dependency pass here
means *verifying the pinned major is still the right one*, not bumping a string:

```bash
docker pull -q postgres:18 && docker run --rm postgres:18 postgres --version
docker compose -f compose.yaml config -q          # validate after any edit
```

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

- Most "breaking changes" in these majors are just a newer **Node runtime → minimum Actions
  Runner version**. GitHub-hosted runners (`ubuntu-24.04-arm`) are always current, so these
  are non-events for us; they would matter on a self-hosted runner.
- **`setup-node` v5+ auto-caches** when it finds a `packageManager` field / root
  `package.json`, and v6 narrowed that to npm. We're unaffected — there is no root
  `package.json` and pnpm comes from `corepack enable` — but if auto-caching ever misfires,
  the escape hatch is `with: { package-manager-cache: false }`.
- These can only be verified by **pushing** — there is no local run. Bump them in their own
  commit so a CI break is trivial to bisect and revert.
