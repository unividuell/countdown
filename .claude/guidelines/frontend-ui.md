# Frontend — UI & layout (webapp-vue)

How a screen is built: the device we build for, the sizing traps that don't show up
in tests, and the accessibility rules that are structural rather than cosmetic.
Siblings: [frontend.md](frontend.md) (stack, HTTP, tooling),
[frontend-routing.md](frontend-routing.md), [frontend-state.md](frontend-state.md),
[frontend-testing.md](frontend-testing.md).

**happy-dom computes no CSS, no layout, no masks and no clipping.** Nothing in this file is visible
in a unit test: a spec can only assert the structural proxy (the wrapper carries `w-full`, no
element carries both classes); the numbers are a browser measurement.

## Mobile-first — the audience is phones

**The primary device is a mobile phone.** Build for the narrow viewport first, then widen with
breakpoints upward (`sm:`/`md:` add, never `md:`-down to fix a desktop layout written first).

- **Never write a `dark:` variant.** Dark mode lives in the colour roles
  ([frontend.md](frontend.md)). Code ported from `huettehuette` carries `dark:` classes: strip them
  on the way in.
- **No hover-only affordances.** Hover may enhance, never carry.
- **44px is the tap floor.** Named exceptions: a strip that must stay whole beats it — Blockierung's
  hotbar never scrolls, so its slots shrink on a narrow phone (`CopyBlocksBoard`); Anmaßung's tools
  are 32px wide (44 tall) and the row never wraps, the colour picker gives way (`PaintRatioBoard`);
  the drawer's pool links are packed likewise (`NavDrawer`); Anspielung's give-up × is 36px, small
  on purpose next to the transport it must not be mistaken for (`SongSnippetBoard`).
- **What changes round to round goes in a box's headline.** `InfoBox` and `AwardBox` fold, and
  folded is their usual state, so a figure only in the body goes unread: the stake, a tolerance
  (`AwardBox`'s `detail`).
- **A tolerance's sign follows its deviation.** „± 1,0“ only where a guess can miss on both sides
  (Anmaßung); a distance is never negative, so its bound is „≤ 1,5“ (Peilung).
- **An image under a gesture must not take the touch.** A long press on an `<img>` opens the OS
  image menu and fires `pointercancel` mid-gesture. Give the image
  `pointer-events-none [-webkit-touch-callout:none]` and let its container own the pointer.
  `DedusterMark`, `PlacePatchBoard`.
- **A text field's font is at least 16px (`text-base`).** Below that, iOS Safari zooms the page
  in on focus. Never `maximum-scale=1` instead: it also kills pinch zoom. `SongSearchBox`.

### Stacking

- **A component that layers its own content with `z-index` isolates itself:** `isolate` on its
  root, so its layers never stack against the page (the round card's cover against the members'
  fly-in). Raising the page's elements instead escalates.
- **Only the element that must ride above an overlay gets the `z-index`, not its container** — a
  z-index lifts everything inside. `NavDrawer`'s toggle and the sound switch beside it carry
  `relative z-30`; the header none.
- **An outside-click check listens in the capture phase.** A click that changes state re-renders
  in a microtask before it bubbles to `document`; a swapped icon is then detached, inside nothing,
  and the menu closes under the finger. happy-dom runs no microtask between listeners, so only a
  spec that detaches the target itself catches it (`NavDrawer`).
- **Place a fixed box against a fixed `inset-0` box, never against `clientWidth`.** Under a scroll
  lock with a classic scrollbar, `clientWidth` counts the kept gutter as content. `NavDrawer`'s
  scrim is the frame its dialog's `right` counts from.

### Scrolling strips

- **A horizontally scrolling strip must genuinely scroll:** a flex child needs `shrink-0`, or
  `scrollWidth` equals `clientWidth`. Hiding the scrollbar costs mouse users their only
  affordance: only once touch swipe covers them.
- **A strip that becomes scrollable _late_ resets its own `scrollLeft`.** Firefox restores the
  session's offset when the element _becomes_ a scroll container. On **every** settle path,
  `prefers-reduced-motion` included:
  `void nextTick(() => { el.scrollLeft = 0; requestAnimationFrame(() => { el.scrollLeft = 0 }) })`.
  Same wherever the scroll position derives from data (a ranking opens on the leader). `MemberRow`.
- **Replacing a strip's content resets its scroll offset**, or the parked box hides what just
  arrived. In a `watch` on the data with `{ flush: 'post' }`. `SongSearchBox`.
- **`overflow-x: auto` computes `overflow-y` to `auto` too**, which clips transformed children: an
  element that scrolls and hosts an animation escaping its box must not clip while it runs.

### Animation on a phone's main thread

- **The resting appearance is correct without the animation; the animation only covers the
  transition.** Bind the final state declaratively, then animate — the animation is skipped under
  reduced motion, in a hidden tab and wherever `Element.animate` is missing. `HoldButton`.
- **An element animated in from nothing is `inert` until it arrives**, not merely invisible, or it
  is tabbable and a hold on it completes unseen. Bind `:inert="!ready || undefined"`: a plain
  `false` stays in the DOM and stays in effect.
- **Create a per-element animation over many elements across the frames it plays over, not all at
  once.** One `Element.animate()` per element in a single frame is a visible stall. Give each group
  its animation shortly before its turn and pay the deferral out of `delay`; until then write the
  pre-state by hand — `fill: 'backwards'` only covers an element once its animation exists.
  `FlipDotBoard.flip`.
- **On SVG children, `transform` is not a GPU shortcut.** A `<circle>` or `<g>` gets no compositing
  layer, so a transform on many costs style and paint every frame; `fill` alone costs almost
  nothing, `will-change` changes nothing. Keep the concurrent count down.
- **A looping animation and a fade never share an element when both drive `opacity`.** Tailwind's
  `pulse` takes its 0%/100% from the element's underlying opacity, so `animate-pulse` beside
  `opacity-0` blinks into view. Fade outside, loop inside; a spec pins that no element carries
  both. `GuessHueScoreboard`.

### A WebGL view gives its context back

- **On unmount call `renderer.dispose()`, then `renderer.forceContextLoss()`.** A page has a budget
  of contexts (~16 in Chrome); `dispose()` frees buffers, not the context, and module-level
  materials keep it reachable. `games/copyblocks/BlockScene.vue`.

### A control that is not a rectangle

- **`touch-action` is the intersection over the hit element and every ancestor:** a descendant can
  only remove panning, never restore it. Put `none` on the element that claims the gesture and
  leave the ancestors alone.
- **A long press and native scrolling do not mix on iOS.** With `touch-pan-y` Safari cancels a
  finger held still at about 500 ms (simulator, iOS 18), so no long press arrives. A field with a
  long press keeps `touch-none` and does not scroll; a drag past a small slop is no click
  (`echolocate/SonarField.vue`). Never scroll by hand (`window.scrollBy` on a drag): scrolling is
  the browser's, and a fake one never feels native.
- **`mask` does not affect hit-testing; `clip-path` does.** Where the shape decides who gets the
  event, the shape is a clip.
- **Sibling shapes in one `<clipPath>` are unioned;** `clip-rule="evenodd"` works within a single
  path. An annulus is one `<path>` with two subpaths, its inner radius from the constant the hit
  test and the mask use.

Verify by measurement: `document.elementFromPoint(x, y)` plus `getComputedStyle(el).touchAction` up
the ancestor chain answers all three. `HueWheel`.

### Controls inside controls

- **A gesture that commits something must not be reachable by a single key.** A synthetic click
  from assistive tech fires `Enter`, never a hold. Give the keyboard the _same_ gesture — `keydown`
  starts the hold, `keyup` abandons it, `event.repeat` is ignored, the default is prevented. The
  residual limit (someone who cannot hold a key) belongs in the spec, not in a cheaper fallback.
  `ui/HoldButton.vue`.
- **A board whose hold button can be covered draws the hold itself, large, on the play area — and
  a touch there cancels it.** A palm resting on the button while painting would submit unseen.
  `HoldButton` emits `progress` for the board to draw; its `disabled` watch cancels a running hold,
  so the board disables it while the play area is touched. `PaintRatioBoard` is the worked example.
- **A hold charges, on one curve.** Ring, sparks and knocks all read `ui/charge.ts`: slow, faster,
  then even from half the hold on. Anything new that should move with the hold takes that curve
  rather than a timing of its own. `progress` reports the ring as shown, so a board's `HoldLock`
  follows it. The count-in (`beats`) is exempt from all of it: its ring is a metronome.
- **A hold that ends something does not celebrate.** Giving up (Anspielung) is a plain hold:
  `sparks: false`, no knocks, its name only while held.
- **A surface where play starts drags at its rim stays off the screen's side edges.** The OS owns a
  touch that starts there (Android: both edges are „back“, iOS Safari: the left), and no web API
  excludes the zone. Keep such a surface inside the page gutter; a drag begun inside may still
  leave it under pointer capture. The bleed stays where nothing drags (Entstauber: taps), the
  player easily works around the rim (Platzierung) or play happens centrally (Blockierung).
  `PaintRatioBoard`.
- **A container that reads raw pointer events exempts whatever it nests.** `pointerdown` bubbles: a
  press on a nested button starts the container's drag, and a radius dead zone only suppresses the
  first jump. Put `@pointerdown.stop` on the slot wrapper — the nested control stays ignorant of
  being nested. A dead-zone radius equal to the nested control's radius is a knife-edge. `HueWheel`.
- **Wrap `setPointerCapture` in a `try`/`catch`.** It throws `NotFoundError` for a pointer the
  browser is not tracking, and a listener's exception is swallowed: the control is dead with no
  error. Dragging without capture only degrades at the edges.

### Sizing that doesn't do what it looks like

- **`HoldButton` has no size of its own** (`size-full`): in an auto-height flex column it renders
  0 × 0. Wrap it in a sized box (`size-24 shrink-0`; `RevealCover`, `PlacePatchBoard`).
- **A resting transform is `none`, never `scale(1)`.** Under a parent's `opacity` (a greyed
  hold), Safari clips a transformed element to its box: the 1px ring outside a round button
  flattens at 12, 3, 6 and 9 o'clock (iOS simulator, Anmaßung's „Signieren“).
- **A percentage width needs a parent that has a width.** In a flex column with `items-center` a
  child is shrink-to-fit, so a `w-[72%]` grandchild resolves against max-content — and a widthless
  inline `<svg viewBox>` contributes 300px. Give the wrapper `w-full`, and drop the container's
  horizontal padding where the percentage means the outer width.
- **A fixed row height is stated on every cell of that row.** A grid track is as tall as its
  tallest item, and alignment is resolved after track sizing.
- **Reserve height at the element that comes and goes, not on its container.** A `min-h` plus
  `items-center` guarantees the box; the content still slides when a conditional element leaves.
  Keep that element rendered and `invisible`, its height written down (`h-4` for `text-xs`).
  `MemberRow`'s live-points chip.
- **A placeholder that only reserves space must not be countable as content.** Six blank tiles
  behind three hits read as "six more are loading". Reserve with exactly one placeholder, shown
  only while the list is empty, and let it carry the state: spinner, „Keine Treffer“, mute before
  the first answer and after a failure. `SongSearchBox`.
- **Stack a caption under an image; don't overlay it inside a rounded tile.** An overlay is clipped
  out of the corner arcs while the image behind still paints there — dark crescents, and no radius
  or mask fixes it. The tile carries the caption's ground, the image sits in a `flex-1 min-h-0`
  block above. `SongSearchBox`.
- **A child whose own root is `relative` ignores a parent's `absolute` class** — both land on one
  element and Tailwind emits `.relative` later. Wrap the child in a `div` and position that
  (`EchoLocateReveal.vue`).
- **A width the script also needs belongs in the script.** `NavDrawer` computes `min(320px, 85vw)`
  from `useWindowSize()` as an inline style, with no Tailwind width beside it: the avatar's spin
  angle derives from the same number. It also makes the width testable.
- **A `<th>` can `truncate` once the table is `table-fixed`:** the ellipsis needs a resolved width,
  which the fixed layout hands the un-widthed column. `GuessHueScoreboard`.
- **A fixed column is as wide as its widest content, measured, plus ~2 px.** There is no web font
  (SF on Apple, Roboto on Android), so measure in the browser — a span with the cell's classes,
  `getBoundingClientRect`. A lone wide label may take two lines (Entstauber's „Max [ms]“); a state
  chip may overhang into empty head cells. `RevealScoreboard`'s points column.
- **`w-full` and a negative inline margin are mutually exclusive.** A bleed (`-mx-4`) only widens a
  box whose width is `auto`; with a definite width CSS drops the right margin and the box merely
  shifts. A square that gains a bleed loses its `w-full`. `round-bleed`, `MessageCard`,
  `CountdownCard`.
- **A bleed and the gutter it gives back are one measurement.** Derive the bleed from the variable
  Tailwind computes the padding from (`margin-inline: calc(var(--spacing) * -4)`), name it once as
  an `@utility`, and pin the ancestor's padding in a test. `@utility round-bleed`, the `<main>`
  guard in `app-header.spec.ts`.
- **`<main>` owns the side gutter; a page's column sets width and rhythm only:**
  `mx-auto max-w-* py-8`, nothing sideways (`page-gutter.spec.ts`).
- **Two screens that must not jump share one measurement, not two matching numbers.** Where a
  board and its reveal show the same thing in the same place, the size is one named class both
  spell out (`song-cover.css`, `hue-wheel.css`); a slot one fills with a control and the other with
  text gets one named height. A spec asserts both ends carry the class. Where they show the same
  _control_, make it one component (`PlayButton`). A sideways scroller is not that measurement — a
  desktop scrollbar adds height: lay it over a sizer of the shared size (`SongSearchBox`).
- **Write a component's comments as `//` in `<script setup>`, never beside the template's root.**
  A comment there makes the component multi-root in dev and in tests (not in the build), and a
  mount-level `.classes()` then reads the wrapper: a class-absence assertion passes whatever
  renders. `ui/RoundSurface.vue`.
- **A flip-dot board never stands on `DOT_OFF`'s own colour** (`#292524`): the unlit dots vanish
  and it reads as floating digits. Use the `board` roles and assert the class.
- **A `<button class="flex flex-col">` needs `items-stretch` where its children fill the width.**
  WebKit's UA sheet gives buttons `align-items: flex-start`, so the children start at the left,
  shrunk to their content; Chromium stretches them.
- **A hidden measuring element goes in a zero-size `overflow: hidden` host, never straight on
  `body`.** Text set at measuring size is wider than a phone, and the whole page scrolls
  sideways. `useTypeWidth` in `ui/ramp/poster.ts`.
- **Content sized from its box's measured height stays out of the flow** (`absolute inset-0`).
  In the flow it adds to the box it measures, and every resize buys one more row: endless.
  `ui/ramp/RasterPoster.vue`.

### Accessible by construction

- **Read the accessibility tree, not the DOM, when a control's name matters.** A `role="button"`
  does not take its name from a child `<svg role="img" aria-label>` in Chromium. The wrapping
  control carries `:aria-label` and the graphic inside is `aria-hidden="true"`; a graphic nothing
  wraps stays self-describing.
- **A panel that stays in the DOM needs `inert`, not just `aria-hidden`** — the latter leaves it
  focusable. `:inert="!open || undefined"`, as above. `NavDrawer`.

## The reveal cover

- **A sealed round mounts its game.** The game lays `RevealCover` over its own play area and
  nothing else, and sets `inert` on that area — glass stops a finger, not a keyboard. Its rules and
  stake stay outside both: the sealed round is when they are read at leisure.
- **The game owns the cover's state.** It knows whether its scene stands (`preparing | ready |
failed`); a failed scene offers a retry and never a reveal, so a broken load costs no attempt.
- **When the payload arrives, a game only inserts.** Anything that costs time belongs to the scene
  under the cover — a picture's sealed bytes included (`useSealedAsset`: `ready` means the bytes are
  here, the key's arrival only opens them). The cover leaves in the same render, with no transition:
  the scored clock is already running, and a fade would be ours on top of the line's.
- **The hold is the count-in.** `HoldButton` with `beats`: the digit follows the hold, a release
  hides it rather than counting it back up, and a new press always starts at the top.
