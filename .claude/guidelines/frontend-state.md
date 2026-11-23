# Frontend — state & live values (webapp-vue)

Composable-owned app state without Pinia, the shared ambient clock, and the
server-authoritative ticking pattern the countdown is built on.
Siblings: [frontend.md](frontend.md) (stack, HTTP, tooling),
[frontend-ui.md](frontend-ui.md), [frontend-routing.md](frontend-routing.md),
[frontend-testing.md](frontend-testing.md).

## State — composables + VueUse (no Pinia)

- **App-global state is a module-level singleton:** module-scope `ref`s, exposed `readonly()` from
  a composable, mutated only through its functions. Add Pinia only if state outgrows this.
- **Each such module exports a `_reset*State()` hook for specs** (`_resetAuthState()` in
  `useAuth.ts`): module state is per file, not per test. Reset by assigning the module-scope ref
  inside the hook, not through the ref the composable returns — that one may be `readonly()`.
- **Disposal is final, and an async path is mortal.** An `await` in flight when the component
  unmounts still resumes, and a generation counter does not help: an unmount bumps nothing. So a
  composable that owns something outside Vue (audio node, socket, object URL) keeps a `disposed`
  flag that makes its entry points no-ops for good, and each async path in a component checks an
  `alive` flag — cleared in `onUnmounted` — after every `await`, before it creates or hands over
  anything. `usePlayback`, `SongSnippetBoard`, `SongPlayerReveal`.
- **Derive state from the server's answer, don't mirror it into flags.** `useRound`'s `stage` is a
  `computed` over the last `RoundResponse`, not a "have I guessed" ref set by the submit handler: a
  local flag can disagree with the server (second tab, stale reload). A viewer with no row and no
  game-mandated reveal is `no-game`, not sealed — a reveal button there would 404 (the super-admin
  without membership).
- **A 409 on guess or reveal is a reload, not an error.** The server has moved past what the UI
  assumed: fetch that state and render it with one explanatory line.
- **A list that loads more derives its next pointer from its last item** (`useRoundHistory`), so
  `null` is both "nothing more" and what hides the button. The load goes through `useAction`, which
  drops a second call in flight and clears `busy` in a `finally`.
- **A dismissible explanation is permanent, keyed by game.** `InfoBox` collapses into
  `localStorage` under `` `infobox:${storageKey}` ``. Not account-level: a new device reopens it.

## The shared clock

**Ambient time is shared state; the domain around it is not.** Two `setInterval`s started at
different moments never resynchronise, so `nowMs` and `skewMs` live at module scope behind **one**
interval (`useCountdown`); everything domain-shaped — `round`, the base unit, load/retry — stays
per instance and reacts via `watch(nowMs, tick)`.

- **Refcount the interval:** start it with the first consumer, clear it with the last. The
  `_reset*State()` hook resets the refcount *and* clears the interval.
- **A shared clock trades freshness for agreement — don't "fix" it back.** A consumer mounting
  between ticks inherits a `nowMs` up to a second stale; re-anchoring on mount reintroduces the
  drift. Cover a visible stale first paint instead (`FlipDotBoard`'s switch-on sequence).
- Specs that mount such a component need `enableAutoUnmount(afterEach)`
  ([frontend-testing.md](frontend-testing.md)).

## Animation beside a ticking clock and refetched data

- **Gate every animation on `document.hidden`,** beside `prefers-reduced-motion`. The clock ticks
  in a background tab too, and Gecko neither advances nor releases an animation created there —
  they pile up until the tab crashes. Skipping costs nothing: the resting state is what the render
  already shows.
- **Release hand-managed hold state on `visibilitychange`.** A staged reveal resolved from
  `requestAnimationFrame` loses its driver in the background and comes back frozen.
- **Verify such a leak in the failing engine *and* state:** Firefox, tab in the background.
  Chromium and a foreground Firefox measure flat. `document.getAnimations().length`, sampled by the
  page itself, is the instrument.
- **Don't freeze state on a setup-time constant.** A component keyed on a value that survives
  reload (the lab keys on the seed) stays mounted while its props change. Recompute from props, or
  `watch` **without** `immediate`: the default `pre` flush updates the flag before the child
  re-renders — changing `flush` undoes that.
- **A refetch behind an entry animation needs a path that never leaves `'ready'`,** or the
  component unmounts and replays its entrance for new numbers. `useRoster`: `reload` (entering,
  `state` may swing) versus `refresh` (on screen: replace the data only; the list patches in place,
  keyed by id). A failed refresh keeps the last data.
- **Animating the reorder a refetch brings: one owner per transform.** An entrance that measured on
  mount cannot be re-aimed, so data changing mid-flight *ends* it; the rearrangement asks
  `prefers-reduced-motion` and `document.hidden` again at its own moment. Under contact physics a
  single line cannot reorder: whoever overtakes leaves the line and is back in it on arrival.
- **A surface beside a game must not pre-empt that game's reveal — hold the answer, not the
  widget.** `useRoster.refreshAfterGuess` fetches at once and shows the answer when the reveal's
  timeline reaches its verdict (`announceResults`, `ui/resultsLanding.ts`); no game calls it.
  Holding only the chip would leak the new order. `SPOILER_HOLD_MS` is the ceiling for a hold
  nobody ends (background tab); a reveal that runs longer raises it. Only a reveal that just
  happened here (`animate`) announces — a history card mounting mid-hold must not release it. Skip
  the hold under `prefers-reduced-motion`.
  The streak rides in the same answer; `MemberRow` holds a grown streak another `VERDICT_MS`, then
  flares it.
- **Every call the server answers with a re-scored round refreshes the roster** — guess, ballot,
  override, give-up all run `RoundScoring.reevaluate`. Guess and give-up go through
  `refreshAfterGuess`, a ballot through `refresh`. Ballots happen in the running round and in the
  history's open one.

## A game's reveal is shared

- **One timeline per reveal, `games/revealTimeline.ts`:** each `*Reveal.vue` calls
  `provideRevealTimeline`; picture, table and sound read it (`reached`, `on`). A game brings *what*
  moves on a beat, never *when*; the numbers live in `games/revealChoreography.ts`.

  ```
  open ─ head ─ story (0,9 s) ──[holds]── verdict ── +VERDICT_MS ── others
  ```

  **What judges my tip lands on `verdict`** — the solution, a sector, error marks, a title, the
  head's facts — with my row, its sound and the roster. Everyone else's row, marker and pins land on
  `others`, in silence. A game whose solution is told over time (Augenmaß's count, Verrohrung's water,
  Musterung's possibilities) `hold()`s the verdict and releases it at the story's end; a story may
  show the judgement step by step. A board that already judged (Entstauber) passes
  `judged: 'before'`. The quiet rules — reload, reduced motion, background tab — live only there.
- **Every reveal proves it, one way:** its spec runs `expectJudgesWithVerdict`
  (`games/__tests__/judgesWithVerdict.ts`) on its own fixture, and `judgingCoverage.spec.ts` fails
  a registered game whose specs do not. A picture or table mounted alone in a spec gets
  `testTimeline` (`games/__tests__/timelineTiming.ts`).
- **The plumbing is shared the same way** — `GameProps`/`GameEmits`, `games/ranking.ts`, `rowHead`,
  `durations.ts`, `awards.ts`, `useRevealedLive`, `useMyColorHex`, `__tests__/gameFixtures.ts`.
  Import, don't copy; a third copy is the signal to hoist, and a hoist is safe when no game's test
  expectations move. Each helper is opt-in and decides nothing about how a game plays or looks.
- **The switch from board to reveal crossfades only where both cards show the same surface in the
  same place** (a picture, Anspielung's bar and transport): one grid cell, no `mode`. Otherwise it
  is hard. The cover never fades ([frontend-ui.md](frontend-ui.md)). A card with a sideways strip
  needs `grid-cols-1`: a bare `grid` widens its column to the whole strip.
- **`games/RevealScoreboard.vue` owns the table's frame** — heading and live chip inside the
  `thead`, „Name“ first, „Pkt“ last, the clock before it when a row has a duration, band, gutters,
  cascade. A game declares the columns after „Name“ (`games/scoreboardColumns.ts`) and fills
  `cell-<key>` slots; `ground: () => null` for content that is not a table cell.

## Sound — a short clip needs the graph, not the `<audio>` element

An `<audio>` element opens an output stream per playback and tears it down when the clip ends.
On Android that opening and closing costs tens to hundreds of milliseconds, so a clip whose
**entire** content is 0.1 s lives inside that window: its tail gets flushed away, or nothing is
heard at all, and `currentTime` already stands at the end before the first frame paints (observed
on Firefox for Android; Chrome for Android does not show it). **Anything under about a second goes
through Web Audio instead** — one module-level `AudioContext` for the whole app, never closed, so
the output stream stays open *across* clips and a short clip is scheduled into a pipeline that is
already running. The context lives in `src/ui/audio.ts` (`audioGraph()`, `START_LOOKAHEAD_SECONDS`);
`usePlayback` (`src/ui/usePlayback.ts`) and Blockierung's `sounds.ts` are the worked examples;
Peilung's `echolocate/engine.ts` is the one for a looping bed plus many scheduled shots.

- **Schedule with a small lookahead**, `node.start(ctx.currentTime + 0.05)`, never at „now": the
  graph may be mid-render and drop the first samples of a clip that starts in the present.
- **Read the position from the graph's clock** — `ctx.currentTime - startedAt`, clamped to
  `[0, buffer.duration]`. The element's `timeupdate` is ~4 Hz (useless over 0.1 s) and its
  `currentTime` reports the decoder's progress rather than what has been heard.
- **Keep the element as a fallback** for browsers without an `AudioContext` and for a clip
  `decodeAudioData` rejects — resolve the decode to `null` rather than rejecting, and let the
  element carry the same source all along, so falling back costs no second load.
- **The graph has no pause/resume, only `stop()`.** A resume is `start(at, offset)` with an offset
  you keep yourself (`usePlayback`'s `heldAt`); keep `startedAt = at - offset` so the position stays
  `currentTime - startedAt`, and hold the bar at the offset through the lookahead.
- **Swapping to a longer clip without a gap:** one clock schedules both — `old.stop(at)` and
  `next.start(at, offsetAt(at))` with the same `at`. Bump the generation first, so the old node's
  `onended` (it may run out while the new clip decodes) cannot flip the transport to „stopped“
  mid-handover (`usePlayback.extend`).
- **Unlock the graph synchronously inside a `click` (or `pointerup`) handler.** A touch
  `pointerdown` is no user activation on iOS: `resume()` is refused and the round stays silent, with
  no error. A play surface that only listens to touches gets a cover button
  for it (Peilung's, `SonarField.vue`/`EchoLocateBoard.vue`). The graph can stop again later (iOS:
  a call, an app switch, the lock screen): on `statechange` away from `running`, or a hidden page,
  bring the cover back and send no move that must be heard. What a hidden page stops restarts on
  every way back, not only the cover's click. Never `suspend()` the shared graph.
- **Leave `navigator.audioSession` alone; iOS gets no special path.** Measured on devices
  (2026-11-23, music playing in another app): Chrome for iOS stops that music on `resume()` alone,
  whatever the session type (`playback`, `auto`, `ambient`, `transient`), and it does not come
  back; Firefox for Android keeps it playing, its session turns `active` only while a sound plays.
  The iOS 18.1 simulator's Safari sounded under the silent switch with `auto` as with `playback`.
  The app cannot tell Safari from Chrome on iOS, so the mute switch is the answer for whoever minds.
- **Never swallow a refused `play()` or `resume()`.** „Sometimes you hear nothing" is invisible
  from the outside; a `console.warn` is what makes it a report instead of a mystery.
- **A remote clip must be CORS-open** for `decodeAudioData` (the element needs no such thing).
  Deezer's preview CDN sends `Access-Control-Allow-Origin: *`; verify with `curl -sI` before
  routing any remote source through the graph.
- **Synthesised samples: every write index must be an integer.** A `Float32Array` ignores
  `a[1.5] = x` without an error — the sound just has holes. Round positions computed from
  seconds × rate (`Math.round`/`Math.floor`) before indexing; nothing lints this.
- **Noise made in the browser is levelled to the clip's loudness.** Peilung's bed and bursts
  (`echolocate/noise.ts`) are synthesised, its clips and recordings decoded; every part is scaled to
  one RMS before the mix gain. Only then does a dB value mean the signal-to-noise ratio the ear gets,
  and no source is simply louder because of how it was made.
- **One sound switch, in the header:** `SoundToggle` stands left of the avatar (`NavDrawer`), in
  the same place on every page and still there with the menu open; no game card carries one.
  `useGameSound()` is the setting, so no game stores it itself. It governs decoration sound only:
  a game whose sound is the game (Anspielung, Peilung) plays on, muting there would end the round.
- **A board that knocks says so: `useSoundStage()`.** Only while one is on screen does an
  activation wake the graph — waking claims the device's audio session, and on iOS that stops the
  player's music on every other page. Off stage the switch shows the setting and wakes nothing.
- **The poster's tap wakes the graph; the switch shows only the setting.** After a fresh load the
  graph sleeps until a user activation, and a finger setting down is none — on iOS not even the
  release of a drag, only a tap (simulator, iOS 18.1). Every round's board stands behind the
  `RoundRamp` poster, whose tap is that activation. For the rest (a reload mid-run, a graph the OS
  suspended) `useSoundAwake` wakes it on every activation anywhere on the page while a board is on
  stage. A game adds no wake handlers of its own.
- **A hold that sparks also knocks, in every game.** `HoldButton` knocks (charge or count-in)
  wherever it throws sparks, and is then on stage itself (`useSoundStage`). `sparks: false`
  silences both — giving up celebrates nothing. No exception for a game whose sound is the game:
  Peilung's hand-in and its cover's count-in knock too.
- **The synthesised voice is shared:** the wooden knock lives in `ui/woodKnock.ts`, the broom's
  „wruusch“ for tidying up in `ui/whooshSound.ts` (Peilung's „Markierungen löschen“); a game
  schedules them, it does not build its own oscillators. Sound is a side note, not a
  signal: one master level for all of it (`VOLUME`), which a game does not raise.
- **One rule for a sleeping graph: a one-shot stays silent.** A sound scheduled on a suspended
  graph lands on its wake-up, with the next tap, long after what it belonged to — so a one-shot
  asks for the graph only while it runs (`runningGraph()` in `ui/audio.ts`; decoration sound asks
  `soundGraph()`, see below). Waking (`unlockSound`) lives in `ui/audio.ts` too —
  no game carries its own copy.
- **The sound switch is honoured in one place, `ui/soundOutput.ts`.** A play function asks
  `soundGraph()` — or `gameSoundOn()` first, where it wakes the graph itself — and connects to
  `soundOutput(graph)`, never to `graph.destination`. A board calls its play function and nothing
  else: no `if (sound.value)`, no watcher that cuts a sound on mute. The output's gain is the
  mute, so what is already sounding falls silent too. Muted asks for no graph at all — not even to
  preload: by their autoplay policies Chrome and Firefox start a context built after a tap as
  `running`, no `resume()` needed,
  and on iOS that stops the player's music. A preload skipped while muted happens on the first play
  after unmuting (`turnpipes/sounds.ts`).
- **Feedback on an input keeps one pitch.** A pitch that follows the value reads as a hint: „the
  target is where it gets higher“ (Farbausmalung's wheel, a scale tried and dropped). Throttle it
  too — knocks under ~30 ms apart overlap and clip. That ratchet is shared (`ui/ratchetSound.ts`):
  Farbausmalung's knob per degree, Entstauber's scrubbed curve per level, Platzierung's stamp per
  cell it moves on to and per tap — a tap ticks even where nothing moved, it answers the finger;
  Anmaßung's colour picker as it opens.
  A pitch may also name a tool: Anmaßung's brushes sink as they thicken, undo knocks below redo
  (`paintratio/toolSound.ts`). A pitch may follow
  the player's own progress, which says nothing about the target: Musterung climbs a scale per
  marked block, a cover's count-in the same scale per beat (`ui/scale.ts`).
- **A reveal that plays sound decodes it itself** (`onMounted`): the board may not have mounted
  first (reload, history, onlooker).
- **One verdict for every game.** Whether my tip won is `myWin` (`games/verdict.ts`): inside the
  gate, or without a gate my row holding the points. How it sounds is `ui/verdictSound.ts`; a
  reveal's timeline plays it at `verdict`, never a game's own timer: with my row, which lands first
  and alone (`tickOfRow`); the others follow once it has rung out (`VERDICT_MS`). It is the signal
  for my points, so no row and no roster says it first. My
  row's slot gives my rank away a moment early; the verdict has said the part that matters. Only on
  a reveal that just happened here (`animate`) — a reload is silent — and at once where nothing
  moves. Exception: a run that ends itself plays the verdict the moment it ends, in the board, and
  its reveal stays silent (`judged: 'before'`) — Entstauber's last tile wins, a wrong tile or a
  missed beat fails (`deduster/DedusterBoard.vue`). A story whose own animation ends in a sound
  releases its hold after that sound has fallen silent, for my first run only — Verrohrung's water,
  its end sound to the last, then the verdict. The sound says how long it still rings
  (`Playing.endsInS`); no guessed delay. A name tapped first releases silently. Augenmaß releases
  at its count's last tone (`countEndsInMs`), computed from the same tone plan.
- **The verdict is a reveal's last sound.** The cascade after it lands silently: a knock per
  other player's marker (Farbausmalung, tried) came after the verdict and only got in the way.
  Exception: the roster's triangle rings `VERDICT_MS` after the verdict, only for the viewer's own
  grown streak, into the gap where the other rows land silently.
- **Testing knocks:** `ui/__tests__/fakeGraph.ts` is the graph for a spec — it records every
  oscillator's pitch and start. Mock `@/ui/audio` with its `audioMock`; do not copy the fake.
- **Testing:** happy-dom has no `AudioContext`, so tests take the element path unless you stub the
  constructor. Both the context and the „only one clip sounds" registry are module state, so a
  stubbing test needs `vi.resetModules()` + a dynamic import per case, and `requestAnimationFrame`
  stubbed into a queue you step by hand (the sampler re-requests itself).
- **Whatever performs on load waits for `useCurtainOpen()`** (`ui/curtain.ts`). A round's card may
  lie mounted under the ramp, unseen and unheard; an entrance (pop-in, sweep, growing bar,
  opening knock) starts once the curtain is open — `true` wherever no ramp stands. `HoldButton`,
  `MatchScaleBoard`, `HueWheelInput`, `StageBar`.

## Server-authoritative ticking values (countdown pattern)

- **The backend owns the logic and emits absolute instants**
  (`GET /api/communities/{slug}/countdown`: current + next round with `start`/`end`, `serverNow`).
  The SPA ticks a 1 s clock, corrects skew once and only subtracts and formats
  (`communities/countdown.ts` is a pure projection). No KT/TS parity test: no logic is duplicated.
- At a round boundary it shifts to the pre-fetched `nextRound`, then refetches.
- **Decompose:** pure functions, a thin composable, a thin component.
- **Guard async loads** with a generation counter (stale response) and a try/catch — a failed fetch
  hides the widget, never an unhandled rejection.
- **Don't derive "loaded" from the data being null — keep an explicit flag.** `round` is null
  before the load, after a failed one, and legitimately for a community without `targetAt`. Each
  consumer decides what that means for *its* surface (a header widget may vanish, a page's main
  card may not), and the retry (`FAILED_LOAD_RETRY_MS`) is gated on the flag, or it polls a
  community that has nothing to send.

## App-level header state

`App.vue` sits above the `[slug]` provider tree, so what it needs from the active community is a
module-level ref, `activeCommunity` (`communities/context.ts`), not `provide`/`inject`.

- **Every path that loads the community republishes it** through `publishCommunity()` — the
  guard's `afterEach` and the shell's `refresh()`. Publishing only on the initial resolve leaves
  stale header state behind (a pending dot outliving its requests).
- Clearing is the guard's own business: `afterEach`, for a destination without a slug.
- Navigation controls live in the main header (`nav/NavDrawer.vue`, the app's only menu), never
  inside the `[slug]` content area.

## Zone-relative time entry

A `datetime-local` value is a naive wall-clock string: interpret it in the community's
`targetTimezone`, never the browser's — `DateTime.fromISO(local, { zone }).toUTC()` to store,
`DateTime.fromISO(iso, { zone }).toFormat("yyyy-MM-dd'T'HH:mm")` to display. Luxon's fallback
without `{ zone }` is the **system** zone, so `vitest.config.ts` pins `TZ: 'UTC'`, and a zone test
uses a fixture far from UTC (`Pacific/Kiritimati`, the community overview page).
