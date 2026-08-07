# Frontend — UI & layout (webapp-vue)

How a screen is built: the device we build for, the sizing traps that don't show up
in tests, and the accessibility rules that are structural rather than cosmetic.
Siblings: [frontend.md](frontend.md) (stack, HTTP, tooling),
[frontend-routing.md](frontend-routing.md), [frontend-state.md](frontend-state.md),
[frontend-testing.md](frontend-testing.md).

## Mobile-first — the audience is phones

**The primary device is a mobile phone.** Design and build for the narrow viewport
first, then widen with breakpoints upward (`sm:`/`md:` add, never `md:`-down to fix a
desktop layout that was written first).

- **No hover-only affordances.** Anything discoverable by hovering must also be
  reachable by tap. Hover may enhance, never carry.
- **Watch the tap target.** 44px is the floor for anything interactive; the 48px avatar
  circle is deliberately at that scale.
- **A horizontally scrolling strip must genuinely scroll.** `overflow-x: auto` only helps if
  the container's content is never shrunk to fit — a flex child needs `shrink-0` (or an
  equivalent intrinsic width), or `scrollWidth` stays equal to `clientWidth` and there is
  nothing to scroll. Hiding the scrollbar is then a choice, not a default: it costs
  mouse/trackpad users their only affordance, so only reach for it once touch swipe covers
  them. And **a strip that becomes scrollable *late* must reset its own `scrollLeft`** —
  Firefox keeps the offset in session history and applies it when the element *becomes* a
  container, so a strip that flips to `overflow-x: auto` after an animation settles jumps to
  the reader's old offset on reload (Firefox only). Fix, on **every** settle path including
  `prefers-reduced-motion`:
  `void nextTick(() => { el.scrollLeft = 0; requestAnimationFrame(() => { el.scrollLeft = 0 }) })`
  — the write also cancels the pending restore, and the extra frame covers the restore
  landing in the reflow that first builds the scroll frame. Same wherever a strip's scroll
  position is derived from data (a ranking must open on the leader). See `MemberRow`.

### Animation on a phone's main thread

- **Create a per-element animation over many elements across as many frames as it plays out
  over, not all at once.** `Element.animate()` is not free, and one call per element in a single
  frame is a stall the eye sees — on any animation running beside it, not just its own. Give each
  group its animation shortly before its turn and pay the deferral out of that call's `delay`, so
  the visible timing is untouched. What the deferral *does* cost is the hold: `fill: 'backwards'`
  only covers an element from the moment its animation exists, so the pre-state the render has
  already moved past has to be written out by hand until then. See `FlipDotBoard.flip`.
- **On SVG children, `transform` is not a GPU shortcut.** Only an element that can get its own
  compositing layer animates off the main thread, and an SVG `<circle>` or `<g>` cannot — a
  transform on many of them costs a full style and paint pass every frame, while animating a paint
  property like `fill` alone costs almost nothing. `will-change` does not change this; a canvas
  renderer is the only route to the GPU, so keep the concurrent element count down instead.

### Sizing that doesn't do what it looks like

- **A percentage width only means what you think inside a parent that has a width.** In a flex
  column with `items-center`, a child is cross-axis **shrink-to-fit** — its width comes from its
  own max-content size, so a `w-[72%]` grandchild resolves against *that*, not against the card.
  And a widthless inline `<svg viewBox="…">` contributes exactly **300px**, the CSS default
  object width for a replaced element with no intrinsic size. Give such a wrapper `w-full`, and
  drop the container's horizontal padding where a percentage must mean a percentage of the outer
  width the design names.
- **A fixed row height has to be stated on every cell of that row.** A CSS grid track is as tall
  as its tallest item, and alignment (`items-center`) is resolved *after* track sizing, so it
  never feeds back. Stating the height on one cell only lets the row grow wherever a taller cell
  renders — the header's height would otherwise depend on who is looking.
- **Beware `overflow` on animation ancestors.** `overflow-x: auto` computes `overflow-y` to
  `auto` as well, which clips transformed children — so an element that both scrolls and hosts
  an animation that escapes its box must not clip while the animation runs.
- **A width the script also needs belongs in the script.** `NavDrawer` computes `min(320px, 85vw)`
  from `useWindowSize()` and sets it as an inline style, with no Tailwind width class beside it:
  the avatar's spin angle derives from that same number, and two sources for one width drift the
  moment someone touches one of them. Side effect, without which there would be no test for it —
  a spec can set `window.innerWidth` and assert the angle, whereas a width read from layout is
  always `0` under happy-dom.

None of these are visible in tests: **happy-dom computes no CSS and no box sizes**. A spec can
only assert the structural proxy (the wrapper carries `w-full`, both cells carry `h-10`); the
numbers themselves are a browser measurement.

### Accessible by construction

- **Read the accessibility tree, not the DOM, when a control's name matters.** Name-from-content
  on a `role="button"` does **not** pull a child `<svg role="img" aria-label="…">` up into the
  button's name in Chromium — leaving a focusable control with *no* accessible name, invisible in
  the DOM (every `aria-*` attribute looks right) and invisible in tests. A wrapping control
  carries `:aria-label` and the graphic inside is `aria-hidden="true"` so the value isn't
  announced twice; a graphic that nothing wraps stays self-describing.
- **A panel that stays permanently in the DOM needs `inert`, not just `aria-hidden`.** `NavDrawer`
  stays mounted closed (so its width is always known and the transition needs no enter/leave
  machinery); `aria-hidden` alone only removes it from the accessibility tree, leaving it
  focusable, so Tab lands in an invisible menu. Bind both as `:inert="!open || undefined"` — Vue
  omits an attribute only for `null`/`undefined`/`false`, and `false` only for genuine boolean
  attributes, so `inert="false"` would otherwise end up in the DOM and still be in effect.

