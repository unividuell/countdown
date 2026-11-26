# Game Weights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Community admins set each game to off / rare / normal / often; the round selection honours it.

**Architecture:** The `game` module owns the weights (table, store, endpoint) and feeds them into the pure `GameSelection.pick`. Stages become per-game block lengths relative to the mean factor. The settings page edits them in its community section.

**Tech Stack:** Kotlin, Spring Boot, Spring Data JDBC, Flyway, JUnit 5 + kotest + mockk + MockMvc; Vue 3, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-game-weights-design.md`

## Global Constraints

- `enum class GameWeight(val factor: Double) { OFF(0.0), RARE(1.0 / 3), NORMAL(1.0), OFTEN(3.0) }`; missing id = `NORMAL`.
- `base = max(1, n − 4)`, `n` = candidates after `OFF`; `f̄` = mean factor of those `n`; `blocked_g = max(1, (base · f̄ / factor_g).roundToInt())`.
- No free candidate → candidates minus the previous round's type; if empty → all candidates.
- All candidates `OFF` → ignore `OFF` (preference, not exclusion).
- Only non-`NORMAL` weights are stored. Ids not in `GameCatalog.ids()` are ignored on read, rejected (400) on write.
- PUT rejects (400) a map that sets every catalogue id to `OFF`.
- Admin = super-admin or `MembershipQuery.isAdmin` (as `CommunityController` / `ImagePoolGate`). Non-member → 404, member non-admin PUT → 403.
- UI labels: `aus`, `selten`, `normal`, `häufig`; four equal-width buttons per game (grid, 4 columns), a radio group per game.
- Code, comments, commits English; UI German with `„…“`; commit rules from `CLAUDE.md`.

## Review Focus

- A community with no weight rows behaves exactly like PR #200 (same pick for same seed/history).
- A stored weight for a game id that no longer exists does not break GET or the materialiser.
- PUT replaces: a game set back to `normal` loses its row.
- Super-admin who is not a member can GET and PUT (settings page lets them in).
- Settings save with only the name changed sends no PUT; with only weights changed sends no PATCH.

---

### Task 1: Weighted selection

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameWeight.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameSelection.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundMaterialiser.kt` (pass `weights = emptyMap()` for now)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GameSelectionTest.kt`, call sites in `RoundTimelineOracleTest.kt` (and any other `pick(` caller found by grep)

**Interfaces:**
- Produces: `GameWeight` (public, package `core.game`); `GameSelection.pick(candidates: List<String>, history: List<PastRound>, weights: Map<String, GameWeight>, random: SeededRandom): String?`

- [ ] **Step 1: Failing tests** in `GameSelectionTest` (existing tests pass `weights = emptyMap()`):
  - `all games on one stage pick exactly as all normal` — for seeds 0..49 and history `historyOf(*fourteen.take(7).toTypedArray())`: pick with all `OFTEN` == pick with `emptyMap()`; same for all `RARE`.
  - `an off game is never picked` — g01 `OFF`, empty history, 200 seeds: `picksOver` does not contain g01.
  - `all off falls back to every candidate` — all fourteen `OFF`: result non-null.
  - `often shortens the block` — g01 `OFTEN` (block 4): g01 five rounds back → picked by some seed; four rounds back → never.
  - `rare lengthens the block` — g01 `RARE` (block 29, normals 10): history `g02..g12, g01` → seen == `{g12, g13, g14}`.
  - `with nothing free it still avoids the previous round` — candidates alpha (`RARE`), beta; history `beta, alpha` → always `alpha` over 20 seeds.
  - `over 140 rounds often comes about twice, rare about half as often as normal` — 3 often / 8 normal / 3 rare, seeds 0..99, mean count ratio often/normal in `1.8..2.6`, rare/normal in `0.3..0.55`.
- [ ] **Step 2:** `cd core && ./mvnw test -Dtest=GameSelectionTest` → compile failure.
- [ ] **Step 3:** Implement per Global Constraints. Update KDoc of the interface (weights) and of `NotRecentlyPlayed` (relative stages, why `f̄`: all-one-stage = all normal; without it all-rare blocked everything and repeated back to back).
- [ ] **Step 4:** `./mvnw test -Dtest='GameSelectionTest,RoundTimelineOracleTest,AnnouncementServiceTest'` → PASS.
- [ ] **Step 5:** Commit.

### Task 2: Weight storage and materialiser wiring

**Files:**
- Create: `core/src/main/resources/db/migration/game/V7__create_community_game_weights.sql`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/CommunityGameWeight.kt` (entity + repository)
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameWeightStore.kt`
- Modify: `RoundMaterialiser.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GameWeightStoreTest.kt`, extend a materialiser test (e.g. new `RoundMaterialiserWeightsTest.kt`)

**Interfaces:**
- Produces: `GameWeightStore.weightsOf(communityId: UUID): Map<String, GameWeight>` (only known catalogue ids); `GameWeightStore.replace(communityId: UUID, weights: Map<String, GameWeight>)` (stores non-`NORMAL` only, one transaction).

Table: `community_id UUID NOT NULL REFERENCES community.communities(id) ON DELETE CASCADE`, `game_type TEXT NOT NULL`, `weight TEXT NOT NULL`, `created_at`/`updated_at TIMESTAMPTZ NOT NULL`, `PRIMARY KEY (community_id, game_type)`. Comment: only deviations from normal; a new game is normal by itself.

- [ ] **Step 1: Failing tests** (Testcontainers):
  - `replace stores only non-normal weights` — replace `{a: OFTEN, b: NORMAL, c: OFF}` → `weightsOf` == `{a: OFTEN, c: OFF}` (use catalogue ids).
  - `replace drops what is no longer set` — replace twice, second without a → a gone.
  - `weights of unknown games are ignored` — insert a row for `gone` directly → not in `weightsOf`.
  - Materialiser: community with all catalogue ids but one `OFF` → materialised round carries that one.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; materialiser passes `weights.weightsOf(edition.communityId)`.
- [ ] **Step 4:** Run the new tests plus `RoundMaterialiser*Test` → PASS.
- [ ] **Step 5:** Commit.

### Task 3: Games endpoint

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameController.kt`, `GameWeightService.kt`
- Modify: `GameExceptions.kt`, `GameExceptionHandler.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GameControllerTest.kt` (MockMvc, real service, Testcontainers)

**Interfaces:**
- Produces: `GET /api/communities/{slug}/games` → `[{ "id", "displayName", "weight": "OFF|RARE|NORMAL|OFTEN" }]` sorted by `displayName`; `PUT /api/communities/{slug}/games/weights` body `{ "<id>": "<WEIGHT>" }` → 204.

- [ ] **Step 1: Failing tests:**
  - GET as member lists every catalogue game, default `NORMAL`, sorted by display name.
  - GET for a non-member → 404.
  - PUT as admin then GET reflects it; setting back to `NORMAL` resets it.
  - PUT as member non-admin → 403.
  - PUT as super-admin non-member → 204.
  - PUT with unknown id → 400; PUT all `OFF` → 400.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Gate like `ImagePoolGate` (resolve slug via `CommunityQuery`, membership via `MembershipQuery`). New `GameWeightsForbiddenException` → 403, `InvalidGameWeightsException` → 400; non-member → `RoundAccessDeniedException` (404).
- [ ] **Step 4:** `./mvnw test -Dtest=GameControllerTest` → PASS; then `./mvnw clean test` → BUILD SUCCESS.
- [ ] **Step 5:** Commit.

### Task 4: Settings UI

**Files:**
- Create: `webapp-vue/src/api/games.ts` (`listGames(slug)`, `saveGameWeights(slug, weights)`), types in `webapp-vue/src/api/types.ts`
- Create: `webapp-vue/src/communities/GameWeights.vue` (list of radio groups, `v-model` = `Record<string, GameWeight>`)
- Modify: `webapp-vue/src/pages/c/[slug]/settings.vue`
- Test: `webapp-vue/src/pages/c/[slug]/__tests__/settings.spec.ts`, `webapp-vue/src/communities/__tests__/GameWeights.spec.ts`

**Interfaces:**
- Consumes: Task 3 endpoints.

Layout as in the spec's sketch: under the name field a „Spiele“ heading, per game its name and four equal-width buttons `aus | selten | normal | häufig` (radio inputs, `grid-cols-4`), hint „Gilt ab der nächsten angekündigten Runde.“, one „Speichern“.

- [ ] **Step 1: Failing tests:**
  - GameWeights: renders one radio group per game with four options; clicking `häufig` emits the updated map.
  - settings: loads games and shows current stages checked.
  - save with only weights changed calls `saveGameWeights` with the full map, not `updateCommunity`; only name changed → `updateCommunity` only.
  - all set to `aus` → save refused with message, no request.
  - `saveGameWeights` rejecting → error shown, selections kept.
- [ ] **Step 2:** `cd webapp-vue && pnpm test -- settings GameWeights` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm test`, `pnpm lint` (check for `warning`), `pnpm exec vue-tsc -b` → clean.
- [ ] **Step 5:** Check in the browser pane at phone width (backend + `pnpm dev`): buttons equal width, save round-trips. Screenshot.
- [ ] **Step 6:** Commit.

### Task 5: Guideline

- [ ] Add to `.claude/guidelines/game-rounds.md` (section „A rule that is meant to grow gets its whole input“): weights are relative block lengths; all on one stage = all normal; link the spec. Commit.
