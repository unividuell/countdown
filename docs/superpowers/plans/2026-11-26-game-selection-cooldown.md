# Game Selection Cooldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "not the same game twice in a row" with "the games of the last rounds are blocked", so every game comes up about equally often per edition.

**Architecture:** One pure `GameSelection` implementation swapped in place of `DifferentFromPreviousRound`. Signature, caller (`RoundMaterialiser`), history query and random stream stay.

**Tech Stack:** Kotlin, Spring Boot, JUnit 5 + kotest matchers.

**Spec:** `docs/superpowers/specs/2026-11-26-game-selection-cooldown-design.md`

## Global Constraints

- `UNBLOCKED = 4`; blocked rounds = `max(1, candidates.size - UNBLOCKED)`.
- Blocked types = `gameType` of the first `blocked` entries of `history` (most recent first).
- Pick uniformly from candidates minus blocked; if that is empty, from all candidates. Empty candidates → `null`.
- Exactly one `GameSelection` bean.
- Code, comments, commits in English; commit rules from `CLAUDE.md`.

## Review Focus

- History shorter than the block (edition start): only the rounds present block; nothing breaks.
- History holds a type no longer in `candidates`: it uses a block slot, more than 4 stay free — no exception.
- 14 candidates, 140 rounds fed back as history: every type 8–12 times.
- 2 candidates (`RoundTimelineOracleTest`): still alternate.
- 1 candidate with itself as previous round: picked again, not `null`.

---

### Task 1: `NotRecentlyPlayed` replaces `DifferentFromPreviousRound`

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameSelection.kt` (replace the class `DifferentFromPreviousRound`, KDoc of the interface stays)
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/game/GameSelectionTest.kt`
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundTimelineOracleTest.kt:30,155` (import + call site rename only)
- Modify: `.claude/guidelines/game-rounds.md` section „A rule that is meant to grow gets its whole input“

**Interfaces:**
- Produces: `@Component class NotRecentlyPlayed : GameSelection` with `companion object { const val UNBLOCKED = 4 }`; `pick(candidates, history, random)` unchanged.

- [ ] **Step 1: Write the failing tests**

In `GameSelectionTest`: `selection = NotRecentlyPlayed()`. The seven existing tests stay unchanged (all use ≤ 3 candidates, so only the previous round is blocked). Add:

```kotlin
private val fourteen = (1..14).map { "g%02d".format(it) }

/** [types] most recent first, as `historyOf` returns them. */
private fun historyOf(vararg types: String) =
    types.mapIndexed { i, type -> PastRound(roundNumber = 100 - i, gameType = type) }

@Test
fun `with fourteen candidates the last ten rounds are blocked`() {
    val history = historyOf(*fourteen.take(10).toTypedArray())

    val seen = (0 until 50).mapNotNull {
        selection.pick(candidates = fourteen, history = history, random = SeededRandom.fromSeed(it))
    }.toSet()

    seen shouldBe fourteen.drop(10).toSet()
}

@Test
fun `the eleventh round back is free again`() {
    // g01 was played eleven rounds ago, outside the block of ten.
    val history = historyOf(*fourteen.drop(1).take(10).toTypedArray(), "g01")

    val seen = (0 until 50).mapNotNull {
        selection.pick(candidates = fourteen, history = history, random = SeededRandom.fromSeed(it))
    }.toSet()

    seen shouldContain "g01"
}

@Test
fun `a short history blocks only what it holds`() {
    val history = historyOf("g01", "g02")

    val seen = (0 until 200).mapNotNull {
        selection.pick(candidates = fourteen, history = history, random = SeededRandom.fromSeed(it))
    }.toSet()

    seen shouldBe (fourteen - setOf("g01", "g02")).toSet()
}

@Test
fun `a type no longer available still takes a block slot without failing`() {
    // "gone" is not a candidate; the block of ten then covers only nine candidates.
    val history = historyOf("gone", *fourteen.take(9).toTypedArray())

    val seen = (0 until 200).mapNotNull {
        selection.pick(candidates = fourteen, history = history, random = SeededRandom.fromSeed(it))
    }.toSet()

    seen shouldBe fourteen.drop(9).toSet()
}

@Test
fun `over an edition of 140 rounds every game comes up 8 to 12 times`() {
    val random = SeededRandom.fromSeed(4711)
    val history = ArrayDeque<PastRound>()

    repeat(140) { round ->
        val picked = selection.pick(candidates = fourteen, history = history, random = random)!!
        history.addFirst(PastRound(roundNumber = round, gameType = picked))
    }

    val counts = history.groupingBy { it.gameType }.eachCount()
    counts.keys shouldBe fourteen.toSet()
    counts.values.forEach { it shouldBeInRange 8..12 }
}
```

(Import `io.kotest.matchers.ints.shouldBeInRange`.) In `RoundTimelineOracleTest` rename `DifferentFromPreviousRound` → `NotRecentlyPlayed` (import and line 155); the KDoc „The real rule … so they must alternate“ stays true.

- [ ] **Step 2: Run, expect compile failure**

Run: `cd core && ./mvnw test -Dtest=GameSelectionTest`
Expected: FAIL, unresolved reference `NotRecentlyPlayed`.

- [ ] **Step 3: Implement `NotRecentlyPlayed.pick` in `GameSelection.kt`**

Rule exactly as in Global Constraints. Use `random.pick(...)` as today. Replace the old class's KDoc with one stating the rule, why (uniform choice gave 5–15 per game over 140 rounds, this 8–12), that a late-arriving game joins without catching up, and that a predictable next game is fine — which game comes is no secret.

- [ ] **Step 4: Run the tests**

Run: `cd core && ./mvnw test -Dtest='GameSelectionTest,RoundTimelineOracleTest,AnnouncementServiceTest'`
Expected: PASS. If the 140-round test fails on seed 4711, that is a real result (≈ 5 % of editions reach 12 or 8 at the edge, outside 8–12 is rare): report it, do not tune the seed silently.

- [ ] **Step 5: Update `game-rounds.md`**

In „A rule that is meant to grow gets its whole input“, replace `"not twice in a row" needs one row` with the current rule and add one line: the next game being predictable is fine — it is no secret. Keep it to the section's style; link the new spec.

- [ ] **Step 6: Full suite**

Run: `cd core && ./mvnw clean test`
Expected: BUILD SUCCESS.

- [ ] **Step 7: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameSelection.kt \
  core/src/test/kotlin/org/unividuell/countdown/core/game/GameSelectionTest.kt \
  core/src/test/kotlin/org/unividuell/countdown/core/game/RoundTimelineOracleTest.kt \
  .claude/guidelines/game-rounds.md
git commit   # subject e.g. "Block recently played games in the selection"
```
