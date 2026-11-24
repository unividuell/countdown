# Lautstärke-Regler — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Ziel:** Ein Lautstärkewert für alles, was die App abspielt, mit Regler im Menü, in Anspielung, Peilung; Mute = 0.

**Architektur:** `games:volume` in localStorage ist der einzige Zustand; `useGameSound()` wird daraus abgeleitet. Ein Master-Gain pro `AudioContext` vor `destination`, an dem Dekoklänge, `usePlayback` und `EchoEngine` hängen. Eine Komponente `VolumeSlider`, ein Hinweis `SoundOffNotice`.

**Stack:** Vue 3, TypeScript strict, `@vueuse/core` (`useLocalStorage`), Web Audio, Vitest + happy-dom, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-11-24-lautstaerke-design.md`

## Globale Vorgaben

- Schlüssel `games:volume`, Bereich 0–1, Standard `0.8`. `games:sound` entfällt, keine Migration.
- Gain = Wert² (`0.8` → `0.64`).
- Mute-Knopf: Ton an → Wert `0`; Ton aus → Wert `0.8`. Regler auf 0 = stumm. Kein ausgegrauter Zustand.
- Nutzertext deutsch mit `„…“`: `aria-label="Lautstärke"`, Hinweis „Ton ist aus“.
- Tap-Ziel 44 px (`h-11`). Mobile-first.
- `VOLUME` aus `woodKnock.ts` entfällt samt Verwendungen. Peilungs `MASTER_GAIN = 0.6` bleibt.
- Kommentare/Commits englisch, Commit-Regeln aus `CLAUDE.md`. Nach jedem Task `pnpm test`, `pnpm lint` (Ausgabe auf `warning` prüfen), `pnpm exec vue-tsc -b` in `webapp-vue/`.

## Review-Fokus

1. Mute-Knopf bei Wert 0 → springt auf 0,8, nicht auf einen kleinen Rest. (Test in Task 1)
2. Wert ändert sich, während ein Song oder Peilungs Bett läuft → Pegel folgt sofort, ohne Knacken (Rampe). (Task 2)
3. Fallback über `<audio>`-Element (kein `AudioContext`): `element.volume` folgt dem Wert. (Task 2)
4. Peilung Phase 2: Höhe der versiegelten Ansicht = Höhe des Boards unter dem Feld; nichts springt nach START. (Task 6)
5. Drawer offen, Regler fokussiert: Tab-Zyklus und Klick-außen schließen nicht versehentlich. (Task 4)

---

### Task 1: Zustand — `useGameVolume`, abgeleitetes `useGameSound`

**Dateien:**
- Neu: `webapp-vue/src/ui/useGameVolume.ts`
- Ändern: `webapp-vue/src/ui/useGameSound.ts`
- Tests: `webapp-vue/src/ui/__tests__/useGameVolume.spec.ts`; `SoundToggle.spec.ts`, `soundOutput.spec.ts` auf den neuen Schlüssel umstellen

**Schnittstellen (produziert):**
- `GAME_VOLUME_KEY = 'games:volume'`, `DEFAULT_VOLUME = 0.8`
- `useGameVolume(): Ref<number>` — `useLocalStorage(GAME_VOLUME_KEY, DEFAULT_VOLUME)`
- `volumeGain(volume: number): number` — `volume²`, auf [0,1] geklemmt
- `useGameSound(): WritableComputedRef<boolean>` — get `volume > 0`; set `false` → `0`; set `true` → `DEFAULT_VOLUME` nur wenn Wert `0`, sonst unverändert. `GAME_SOUND_KEY` entfällt.

- [ ] **Schritt 1: Failing Tests**
  - `useGameVolume` ohne Storage → `0.8`
  - `volumeGain(0.8)` → `0.64` (toBeCloseTo), `volumeGain(0)` → `0`, `volumeGain(1.5)` → `1`
  - `useGameSound().value = false` → `localStorage['games:volume'] === '0'`
  - Wert `0`, `useGameSound().value = true` → Wert `0.8`
  - Wert `0.3`, `useGameSound().value = true` → bleibt `0.3`
  - Wert `0.3` → `useGameSound().value === true`; Wert `0` → `false`
- [ ] **Schritt 2:** `pnpm test src/ui/__tests__/useGameVolume.spec.ts` → FAIL
- [ ] **Schritt 3:** Implementieren; `SoundToggle.spec.ts`/`soundOutput.spec.ts` von `games:sound`=`'false'` auf `games:volume`=`'0'` umstellen (Erwartung nach Klick im SoundToggle: `'0'`).
- [ ] **Schritt 4:** `pnpm test` → PASS
- [ ] **Schritt 5:** Commit „Derive the sound switch from one volume value“

### Task 2: Master-Gain vor `destination`

**Dateien:**
- Neu: `webapp-vue/src/ui/masterOutput.ts`
- Ändern: `ui/soundOutput.ts:50` (`connect(masterOutput(graph))`), `ui/usePlayback.ts:137` + Element-Fallback, `games/echolocate/engine.ts:65`, `ui/woodKnock.ts`, `ui/triangleSound.ts`, `ui/whooshSound.ts`
- Tests: `ui/__tests__/masterOutput.spec.ts`; `woodKnock.spec.ts` (VOLUME-Assertion raus), `usePlayback.spec.ts` ergänzen

**Schnittstellen (produziert):**
- `masterOutput(graph: AudioContext): AudioNode` — ein `GainNode` pro Graph, `gain = volumeGain(volume)`, verbunden mit `graph.destination`; folgt dem Wert per `setValueAtTime` + `linearRampToValueAtTime(…, now + 0.02)`. Watch in einem losgelösten `effectScope(true)`, wie `soundOutput`.

- [ ] **Schritt 1: Failing Tests**
  - `masterOutput(g)` zweimal → derselbe Knoten; verbunden mit `g.destination`; `gain.value` bei Standard `0.64`
  - Wert auf `0.5` → `linearRampToValueAtTime(0.25, now + 0.02)` aufgerufen
  - `usePlayback`: Graph-Quelle verbindet sich mit `masterOutput(context)`, nicht mit `destination`
  - `usePlayback` Fallback: `element.volume === 0.64`; nach Wert `0` → `0`
- [ ] **Schritt 2:** gezielt laufen lassen → FAIL
- [ ] **Schritt 3:** Implementieren. `VOLUME` streichen: Bus-Gain in Klopfen/Triangel bleibt 1 bzw. entfällt, Wusch peakt auf `PEAK`. Kommentare, die „shared `VOLUME`“ nennen, anpassen. `fakeGraph.ts` um ein `masterOutput`-Mock erweitern, wo Specs `soundOutput` echt laden.
- [ ] **Schritt 4:** `pnpm test` → PASS
- [ ] **Schritt 5:** Commit „Route all sound through one master volume“ (Body: Dekoreduktion 0,35 entfällt, Regler übernimmt)

### Task 3: `VolumeSlider` und `SoundOffNotice`

**Dateien:**
- Neu: `webapp-vue/src/ui/VolumeSlider.vue`, `webapp-vue/src/ui/SoundOffNotice.vue`
- Tests: `ui/__tests__/VolumeSlider.spec.ts`

**Schnittstellen (produziert):**
- `<VolumeSlider @adjust />` — `<input type="range" min="0" max="1" step="0.05" aria-label="Lautstärke" data-test="volume">`, `h-11`, `accent-primary`, `cursor-pointer`; Breite gibt der Aufrufer per `class`. `input` schreibt `useGameVolume()` und emittiert `adjust`. `change` und `click`: `if (volume > 0 && soundOnStage.value) unlockSound()` (iOS: nur ein Tipp weckt).
- `<SoundOffNotice />` — `<p data-test="sound-off" class="text-sm font-semibold text-error">Ton ist aus</p>`, nur bei Wert 0.

- [ ] **Schritt 1: Failing Tests**
  - Regler zeigt gespeicherten Wert (`0.3` → `input.value === '0.3'`)
  - `setValue('0.5')` → Storage `0.5`, ein `adjust`-Event
  - `setValue('0')` → `useGameSound().value === false`
  - `SoundOffNotice` sichtbar bei `0`, weg bei `0.3`
- [ ] **Schritt 2–4:** FAIL → implementieren → `pnpm test` PASS
- [ ] **Schritt 5:** Commit „Add a volume slider and a sound-off notice“

### Task 4: Menü — Regler statt Name

**Dateien:**
- Ändern: `webapp-vue/src/nav/NavDrawer.vue` (Block `data-test="nav-viewer"`, `viewerName`, Kommentar zu `nameStyle`)
- Tests: `nav/__tests__/NavDrawer.spec.ts`

- [ ] **Schritt 1: Failing Tests** — offen: `[data-test="nav-volume"]` enthält `input[type=range]`; `[data-test="nav-viewer"]` existiert nicht mehr; Tab vom letzten Element landet auf dem Mute-Knopf, der Regler liegt im Zyklus; Klick auf den Regler schließt das Menü nicht.
- [ ] **Schritt 2:** FAIL
- [ ] **Schritt 3:** Name-Block durch `<div data-test="nav-volume" class="absolute left-0 flex items-center pl-5" :style="nameStyle"><VolumeSlider class="w-full" /></div>` ersetzen; `viewerName` und den `user.username`-Bezug nur dafür entfernen. `nameStyle` → `volumeStyle`.
- [ ] **Schritt 4:** PASS; Commit „Put the volume slider in the menu's name row“

### Task 5: Anspielung und Pool

**Dateien:**
- Ändern: `games/songsnippet/SongSnippetBoard.vue:204`, `games/songsnippet/SongPlayerReveal.vue:150`, `audio/AudioPool.vue` (über `<ul>`)
- Tests: bestehende Specs der drei Komponenten

- [ ] **Schritt 1: Failing Tests** — Board und Auflösung: linke Spur enthält `[data-test="volume"]` vor `stop`/`stop-solution`; `sound-off` bei Wert 0 sichtbar. Pool: `sound-off` bei Wert 0.
- [ ] **Schritt 2:** FAIL
- [ ] **Schritt 3:** Linke Spur: `<span class="flex min-w-0 items-center justify-self-end gap-3 pr-4"><VolumeSlider class="w-20 min-w-0" /> <button …stop…/></span>`. `SoundOffNotice` zentriert unter der Play-Zeile (Board, Auflösung), über der Liste (Pool).
- [ ] **Schritt 4:** PASS; Commit „Offer the volume slider beside Anspielung's stop“

### Task 6: Peilung — Regler, Hörprobe, Phase-2-Zeilen unter dem Vorhang

**Dateien:**
- Neu: `games/echolocate/EchoLocateControls.vue` (Status, Pin-Hinweis, Abgeben-Zeile mit Regler links, `SoundOffNotice`)
- Neu: `games/echolocate/useVolumePreview.ts`
- Ändern: `games/echolocate/EchoLocateBoard.vue` (Template-Zeilen 365–420 → `EchoLocateControls`), `games/echolocate/EchoLocateGame.vue:140-165` (versiegelte Ansicht)
- Tests: `games/echolocate/__tests__/` (Board-, Game-Spec; neu `useVolumePreview.spec.ts`)

**Schnittstellen (produziert):**
- `EchoLocateControls` Props: `status: string`, `pinHint: string`, `pinsFull: boolean`, `canHandIn: boolean`, `hasRings: boolean`, `touching: boolean`, `colorHex: string`. Emits: `handIn`, `progress(p: number)`, `clearRings`. Behält alle bestehenden `data-test`s.
- `useVolumePreview(): { onAdjust: () => void }` — bei `adjust`: `runningGraph()`; `null` → nichts. Sonst eine eigene `EchoEngine(graph)`, `startBed(buffer aus bedSamples(graph.sampleRate), 1)`; 400 ms nach dem letzten `adjust` `stopBed()`. Unmount: `dispose()`.

- [ ] **Schritt 1: Failing Tests**
  - Board: Abgeben-Zeile enthält links `[data-test="volume"]`; bisherige Board-Specs grün
  - Game versiegelt: `[data-test="echo-locate-hand-in-row"]` und `[data-test="volume"]` vorhanden, Abgeben deaktiviert, Status „1. Klick: Ping, 2. Klick: Markieren“
  - `useVolumePreview`: zwei `onAdjust` in 100 ms → ein Bett mit Gain 1 gestartet; nach 400 ms gestoppt; ohne laufenden Graphen nichts gestartet
- [ ] **Schritt 2:** FAIL
- [ ] **Schritt 3:** Implementieren. Versiegelte Ansicht: `EchoLocateControls` mit `statusLine` des Leerlaufs (`'1. Klick: Ping, 2. Klick: Markieren'`), `PIN_HINT` (Konstante dafür nach `EchoLocateControls` oder `flow.ts` exportieren), `canHandIn=false`, `hasRings=false`, `touching=false`, `colorHex` aus `useMyColorHex`.
- [ ] **Schritt 4:** PASS; Commit „Give Peilung the volume slider and a noise probe“; separater Commit „Lay out Peilung's controls under the sealed cover“, falls trennbar.

### Task 7: Guideline und Prüfung im Browser

**Dateien:**
- Ändern: `.claude/guidelines/frontend-state.md` (Sound-Abschnitt: „One sound switch, in the header“ → ein Wert, Mute = 0, Regler-Orte; „a game whose sound is the game plays on“ streichen; „one master level (`VOLUME`)“ → Master-Gain in `masterOutput`)

- [ ] **Schritt 1:** Guideline anpassen (wenige Zeilen, Regeln, keine Historie)
- [ ] **Schritt 2:** Browser-Pane, mobile Breite: Menü offen (Regler in der Namenszeile), Anspielung im Labor (Regler neben Stopp, Hinweis bei 0), Peilung Phase 1/2 im Labor (kein Sprung nach START), Pool. Screenshots.
- [ ] **Schritt 3:** iOS-Simulator: Hörprobe nach Tipp auf den Regler; dokumentieren, ob ein reiner Drag stumm bleibt.
- [ ] **Schritt 4:** Commit „Document the one volume value“
