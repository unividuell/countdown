# Header-Countdown als Flip-Dot-Tafel

**Status:** beschlossenes Design (2026-08-06).

**Baut auf:** der [Fallback-Reihe](2026-08-04-community-fallback-content-design.md) (`FlipDotBoard`,
`ui/flipdot/font.ts`, `ui/flipdot/board.ts`, `CountdownCard`) und dem
[Header-Avatar](2026-08-06-header-member-avatar-design.md) (Zeile 1 des Headers).

**Berührt:** nur `webapp-vue`. Kein Backend, keine API, keine Migration.

## Zweck

Es gibt zwei Countdowns in zwei Gestaltungen. Die Fallback-Card zeigt eine Flip-Dot-Tafel, der
Header eine Mono-Textzeile (`T- 12d 04h 33m 12s`, `CountdownDisplay.vue`). Die Card ist aber nur
ein Fallback und im Normalfall gar nicht sichtbar — der Header ist praktisch der einzige Countdown,
den der Anwender sieht.

Der Header bekommt dieselbe Tafel. Nicht als zweite Umsetzung derselben Idee, sondern aus denselben
Bausteinen: ein Font, eine Board-Komponente, eine Legende, eine Metrikquelle.

## Entscheidungen (im Brainstorming festgelegt)

Alle Maße sind am echten Font gemessen, nicht geschätzt (Mockups in `.superpowers/brainstorm/`).

- **Eine Tafel, nicht eine Tafel pro Gruppe.** Der ganze Readout ist ein `FlipDotBoard`, dessen
  Zahlengruppen durch Doppelpunkte getrennt sind: `12:04:33:12`. Die Flip-Welle läuft dadurch über
  den gesamten Readout statt in jeder Gruppe für sich.
- **Kein `T-` / `T+`.** Der Präfix fällt weg. Nach dem Start zählt die Tafel hoch, ohne Vorzeichen;
  die Bedeutung trägt das `aria-label` und der Tooltip. Was gerade läuft, sagt auf der
  Community-Seite ohnehin die Fallback-Card.
- **Keine Buchstaben im Font.** Die Einheiten stehen als normale Mono-Schrift unter der Tafel, so
  wie die Card es mit `STD MIN SEK` schon macht. Buchstaben in 5×7 zu zeichnen — insbesondere `M`
  (Monate) gegen `m` (Minuten) auf fünf Punkten Breite — wäre die riskantere Lösung für dasselbe
  Ergebnis.
- **Die Legende passt ausgeschrieben.** Die Doppelpunkte schieben die Gruppenmitten weit genug
  auseinander (bei 26px Tafelhöhe rund 64px im Tage-Zustand), sodass `TAGE STD MIN SEK` hineinpasst
  und nicht `d h m s`. Selbst im dichtesten Fall (sechs Labels im Monats-Zustand) bleiben 14px
  Abstand zwischen den Labels.
- **Der Trenner belegt 3 statt 5 Spalten — überall.** Der Doppelpunkt hat heute die Breite einer
  Ziffer, von der nur die mittlere Spalte leuchtet. Je eine Leerspalte links und rechts entfällt.
  Das ist die Voraussetzung dafür, dass die Extremfälle passen (siehe unten), und es gilt für den
  Font insgesamt, nicht als Parameter pro Aufrufer.
- **Konstante Punktgröße.** Tafelhöhe 26px, Punkt ⌀2,9px — in jedem Zyklus-Zustand und bei jeder
  Viewport-Breite gleich. Die Tafel schrumpft nicht, um Platz zu machen.
- **Die Tafel sitzt immer unter dem Community-Namen.** Auch im breiten Viewport. Es gibt keine
  Breakpoint-Umschaltung, kein Nebeneinander, eine Instanz, ein Layout.
- **Der Header hat überall dieselbe Höhe: 108px.** Auch auf Seiten ohne Countdown (Login,
  Community-Liste, Super-Admin) bleibt die zweite Zeile reserviert. Beim Navigieren springt nichts.
- **360px ist die kleinste unterstützte Breite.** 320px-Geräte werden nicht bedient; ein
  `max-width` fängt sie ab, indem die Tafel dort als Einzelfall schrumpft, statt den Header zu
  sprengen.
- **Der Zyklus bleibt** (Tage → Monate+Wochen+Tage → Wochen+Tage) und schaltet mit der
  Boot-Sequenz um: alles wird weiß, hält, rollt in die neuen Einheiten. Die Breitenänderung
  passiert unter dem weißen Blitz und ist deshalb nicht als Sprung zu sehen.

### Die Extremfälle, die die Maße bestimmen

Monate können zwei, Wochen und Tage drei Stellen belegen. Tafelbreiten bei 26px Höhe und
3-Spalten-Trenner, gegen die verfügbare Headerbreite (Viewport minus 2 × 16px Padding):

| Zustand | schlimmster Fall | Tafelbreite | 375px (343) | 360px (328) |
| --- | --- | --- | --- | --- |
| Tage | `365:04:33:12` | 249px | passt | passt |
| Wochen | `104:6:04:33:12` | 288px | passt | passt |
| Monate | `18:4:6:04:33:12` | 303px | passt | passt |

Mit dem heutigen 5-Spalten-Trenner bräuchte der Monats-Zustand 342px und würde bei 360px
überlaufen — der schmalere Trenner ist keine Kosmetik, sondern die Bedingung für den Zyklus.

Eine Tafelhöhe von 30px ist damit ausgeschlossen: der Monats-Zustand käme auf 368px und passt in
keinen Viewport.

## `ui/flipdot/font.ts` — variable Glyphenbreite und Gruppenmitten

Der Font wird variabel breit. Ziffern behalten fünf Spalten, der Doppelpunkt bekommt drei; zwischen
zwei Glyphen bleibt eine Leerspalte wie bisher.

```ts
export const GLYPH_COLS = 5
export const GLYPH_ROWS = 7
export const SEPARATOR_COLS = 3

/** Columns a glyph occupies. Digits keep the full box; the separator is a slice of it. */
export function glyphCols(ch: string): number
```

`bitmap(text)` summiert künftig die Glyphenbreiten (`sum(widths) + (text.length - 1)`), statt
`text.length * (GLYPH_COLS + 1) - 1` zu rechnen. Das Doppelpunkt-Muster wird aus dem
5-Spalten-Muster mittig geschnitten (Spalten 1–3), damit die leuchtende Spalte die mittlere bleibt.
Das Leerzeichen-Glyph bleibt fünf Spalten breit; es wird von keinem Readout benutzt, aber
`bitmap` soll dafür nicht raten müssen.

Neu, als einzige Quelle für Label-Positionen:

```ts
/** Centre of each run of digits, as a percentage of the board's width. */
export function groupCentres(text: string): number[]
```

Diese Funktion ersetzt die fest verdrahteten Prozentwerte in `CountdownCard`. Deren heutige Werte
(`11.5%`, `50%`, `88.5%`) sind korrekt — sie sind genau die berechneten Mitten des
5-Spalten-Trenners — würden mit dem neuen Trenner aber falsch (`12.57%`, `50%`, `87.43%`). Es geht
also nicht darum, einen Fehler zu beheben, sondern das Nachpflegen abzuschaffen.

## `ui/flipdot/FlipDotBoard.vue` — Relight bei Geometriewechsel

Heute bricht `flip()` ab, wenn sich die Spaltenzahl ändert (`prev.cols !== next.cols`), und die
Tafel wechselt ihren Inhalt hart. Das trifft künftig den Zyklus-Wechsel — und es trifft heute schon
die Card, wenn der Tage-Zähler eine Stelle verliert (`100` → `99`).

Der Geometriewechsel wird zur zweiten Boot-Sequenz: alles weiß, `BOOT_HOLD_MS` halten, dann mit der
Welle in den neuen Inhalt rollen. Das ist genau der Schwanz der bestehenden Mount-Sequenz; er wird
dafür herausgezogen und von beiden Wegen benutzt — die weiße Phase bleibt ein reiner Farbwechsel
ohne Animation (jeder Punkt ändert sich gleichzeitig, eine Kick-Animation pro Punkt wäre auf einem
Telefon nur Last ohne Wirkung).

Bei `prefers-reduced-motion: reduce` wechselt der Inhalt sofort, ohne Blitz und ohne Welle — so wie
das Board heute schon startet.

`emit('resolve')` wird durch `emit('phase', 'dark' | 'white' | 'live')` ersetzt. Das eine Ereignis
trägt die ganze Information, in beide Richtungen: Verbraucher können ihre Legende ausblenden, wenn
die Tafel weiß wird, und nicht nur einmalig einblenden, wenn sie zum ersten Mal auflöst. `resolved`
in `CountdownCard` wird zu `phase === 'live'`.

## `ui/flipdot/FlipDotLegend.vue` (neu)

Die Legendenzeile, benutzt vom Header und vom Card-Strip.

```ts
defineProps<{ text: string; labels: string[]; visible: boolean }>()
```

Sie rendert je Label ein absolut positioniertes `<span>` auf `groupCentres(text)[i]`, in derselben
Typografie wie heute (`font-mono text-[11px] tracking-[0.14em] text-stone-500`, `h-4`), und folgt
`visible` per `transition-opacity`. Sie ist `aria-hidden`, weil die Lesung im `aria-label` der
Tafel steht und sonst doppelt vorgelesen würde.

Ihre Breite erbt sie: Tafel und Legende stehen zusammen in einem `inline-block`-Wrapper, der sich
auf die Tafelbreite zusammenzieht. Damit braucht die Legende keine Breitenrechnung — weder im
Header, wo die Tafel höhengetrieben ist, noch in der Card, wo sie breitengetrieben ist.

## `communities/CountdownDisplay.vue` — der Header-Countdown

Aus `view.chips` (unverändert aus `computeView`) werden zwei Dinge gebaut:

- **Der Tafeltext:** die Werte mit `:` verbunden, wobei die führende Gruppe auf zwei Stellen
  gepolstert wird (`12:04:33:12`, nicht `12:4:33:12`). Die Polsterung hält die Breite über einen
  Tageswechsel hinweg stabil, sodass unterhalb von 100 Tagen kein Relight ausgelöst wird. Die
  inneren Gruppen des Monats-/Wochen-Zustands bleiben einstellig (`18:4:6:…`) — sie zu polstern
  würde die Tafel über die verfügbare Breite hinaus wachsen lassen.
- **Die Labels:** aus der Einheit jedes Chips, `M → MON`, `w → WO`, `d → TAGE`, `h → STD`,
  `m → MIN`, `s → SEK`.

Die Tafel wird höhengetrieben gesetzt: `h-[26px] w-auto max-w-full`. Das `viewBox`-Verhältnis
liefert die Breite; `max-w-full` ist das Netz für alles unter 360px, wo die Tafel dann als
Einzelfall etwas kleiner ausfällt, statt den Header zu sprengen.

Der Klick-Zyklus (`cycleBaseUnit`), `role="button"`, `data-test="countdown"` und der Tooltip
bleiben. Das `aria-label` der Tafel liest den Stand vollständig aus („Noch 12 Tage, 4 Stunden,
33 Minuten, 12 Sekunden bis zum Start"), damit der Wegfall von `T-` niemandem etwas nimmt.

## `App.vue` — die Header-Geometrie

Der Header wird ein zweizeiliges Grid mit festen Zeilenhöhen:

```
grid-cols-[1fr_auto] gap-x-4 gap-y-2 px-4 py-3
  Zeile 1, Spalte 1: CommunityMenu + Brand   (h-8)
  Zeile 1, Spalte 2: MemberMenu
  Zeile 2, über beide Spalten: CountdownDisplay   (h-11)
```

24px Padding + 32px + 8px + 44px = **108px**, unabhängig von Breakpoint und Inhalt. Zeile 1 bekommt
ihre 32px explizit (`h-8`) und nicht vom Avatar: auf der Login-Seite gibt es kein `MemberMenu`, und
die Höhe darf nicht daran hängen, ob ein Anwender angemeldet ist. Zeile 2 hält ihre 44px
(26px Tafel + 2px + 16px Legende) auch dann, wenn `CountdownDisplay` nichts rendert.

## `communities/fallbacks/CountdownCard.vue` — was sich mitändert

Die Card behält ihren Aufbau. Sie erbt drei Dinge:

- Der Strip bekommt den engeren Trenner. Weil er breitengetrieben ist (`w-[94%]`), wird der
  gesparte Platz nicht zu weniger Breite, sondern zu **größeren Punkten**: 43 statt 47 Spalten,
  Punkt ⌀5,66px statt 5,17px, Strip 50,9px statt 46,6px hoch (bei 343px Kartenbreite). Das
  Hero-Board enthält keinen Doppelpunkt und bleibt unverändert.
- Die drei Strip-Labels ziehen in `FlipDotLegend` und stehen auf berechneten Mitten.
- `resolved` folgt `phase === 'live'`, wodurch die Labels auch bei einem Relight mitgehen — etwa
  beim Übergang von dreistelligen auf zweistellige Tage.

## Tests

Vitest mit `vi`, wie in [frontend.md](../../../.claude/guidelines/frontend.md) festgelegt.

- `ui/flipdot/__tests__/font.spec.ts`: der Doppelpunkt belegt `SEPARATOR_COLS` Spalten und leuchtet
  in seiner mittleren; `bitmap` summiert gemischte Breiten korrekt (Spaltenzahl von `12:04` gegen
  Ziffern ohne Trenner); `groupCentres` liefert eine Mitte pro Ziffernfolge, in Reihenfolge, und
  für den 5-Spalten-Text der alten Card genau `11.5 / 50 / 88.5` — das bindet die neue Funktion an
  die als richtig bekannten Werte.
- `ui/flipdot/__tests__/FlipDotBoard.spec.ts`: ein Textwechsel mit gleicher Spaltenzahl flippt nur
  die geänderten Punkte (bestehend); ein Wechsel mit anderer Spaltenzahl geht über Weiß und rollt
  ein, statt hart zu wechseln; `phase` wird in der Reihenfolge `white` → `live` emittiert; bei
  `prefers-reduced-motion` wechselt der Inhalt sofort und ohne `white`.
- `ui/flipdot/__tests__/FlipDotLegend.spec.ts` (neu): setzt je Label ein `left` auf die berechnete
  Mitte; ist `aria-hidden`; folgt `visible`.
- `communities/__tests__/CountdownDisplay.spec.ts`: die bestehenden Fälle prüfen heute den Text
  (`toContain('T-')`) — sie prüfen künftig den Tafeltext (`12:04:33:12`) und die Labels. Neu: die
  führende Gruppe ist zweistellig gepolstert; der Klick wechselt Text *und* Labelsatz; ohne
  `startsAt` rendert die Komponente nichts (bestehend).
- `__tests__/app-header.spec.ts`: die zweite Zeile ist auch ohne Countdown vorhanden, damit die
  Headerhöhe nicht an der Community hängt.
- `communities/fallbacks/__tests__/CountdownCard.spec.ts`: die Strip-Labels stehen auf den
  berechneten Mitten (nicht mehr auf `11.5%`).

## Was nicht dazugehört

- **Keine Buchstaben im Font.** Kein `d`, `h`, `m`, `s`, `M`, `w`, kein `T`.
- **Keine Änderung an `computeView`, `useCountdown` oder der API.** Die Chips, der geteilte Takt
  und die Skew-Korrektur bleiben wie sie sind; hier ändert sich ausschließlich die Darstellung.
- **Kein Umbau des Hero-Boards** und keine neue Aufteilung der Card.
- **Keine 320px-Unterstützung** als gestalteter Zustand.
- **Kein `sticky` Header.** Der Header bleibt Teil des Seitenflusses; ob eine 108px hohe Tafel oben
  kleben soll, ist eine eigene Frage.
