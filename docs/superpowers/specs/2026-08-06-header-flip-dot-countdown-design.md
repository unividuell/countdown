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
- **Die Tafel sitzt unter dem Community-Namen, bis daneben Platz ist.** Schmal bekommt sie eine
  eigene Zeile über die volle Breite. **Ab `md`** wandert sie in Zeile 1 und stellt sich neben das
  Konto-Menü, sodass der Leerraum der Zeile zwischen Titel und den beiden liegt — sonst ist ein
  Desktop-Header überwiegend leeres Schwarz. Eine Instanz, nur ihre Grid-Platzierung wechselt.
  `md` und nicht `sm`: der breiteste Zyklus-Zustand ist 303px, und ein langer Community-Name plus
  diese Tafel plus Avatar braucht 636px — mehr als die 608px Inhalt bei `sm`, was die Zeile über den
  Viewport schieben würde.
- **Die Headerhöhe hängt an der Zeilenzahl, nicht an der Seite.** Gemessen in Chrome: **116px**
  schmal mit Tafel (24px Padding + 40px + 8px + 44px), **68px** ab `md` mit Tafel (24px + 44px), und
  **64px** ohne Tafel (24px + 40px) — auf Login, Community-Liste und Super-Admin gibt es keine
  zweite Zeile, dort ist der Header also wieder so hoch wie vor dieser Arbeit. Was innerhalb einer
  Anordnung nicht passieren darf: dass die Höhe daran hängt, *wer* schaut (siehe `App.vue` unten).
- **360px ist die kleinste unterstützte Breite.** 320px-Geräte werden nicht bedient; ein
  `max-width` fängt sie ab, indem die Tafel dort als Einzelfall schrumpft, statt den Header zu
  sprengen.
- **Der Zyklus bleibt** (Tage → Monate+Wochen+Tage → Wochen+Tage) und schaltet mit der
  Boot-Sequenz um: alles wird weiß, hält, rollt in die neuen Einheiten. Die Breitenänderung
  passiert unter dem weißen Blitz und ist deshalb nicht als Sprung zu sehen.
- **Der Zyklus gilt auch nach dem Start.** `computeView` hat die Basiseinheit im `after`-Zweig
  ignoriert; die Anzeige war dort fest `Tage/Std/Min/Sek`. Weil es derselbe Button ist wie vorher,
  tat ein Klick auf den Countdown einer laufenden Community sichtbar *nichts* — in jedem Browser, und
  nur bei laufenden Communities, weshalb es zunächst wie ein Engine-Unterschied aussah. Der
  `after`-Zweig respektiert die Konfiguration jetzt genauso: `Laufzeit 1 Monat, 1 Woche, 5 Tage, …`.

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

Neu in `ui/flipdot/board.ts`, als einzige Quelle für Label-Positionen:

```ts
/** Centre of each run of digits, as a percentage of the board's width. */
export function groupCentres(text: string): number[]
```

Sie gehört in `board.ts` und nicht in `font.ts`, weil sie `PITCH` und `RADIUS` braucht: die Mitte
eines Labels ist eine Frage der gerenderten Geometrie, nicht des Glyphenmusters. `board.ts` darf
`font.ts` importieren, umgekehrt nicht.

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

`emit('resolve')` wird durch `emit('phase', 'white' | 'live')` ersetzt. Das eine Ereignis trägt die
ganze Information, in beide Richtungen: Verbraucher können ihre Legende ausblenden, wenn die Tafel
weiß wird, und nicht nur einmalig einblenden, wenn sie zum ersten Mal auflöst. Jeder Verbraucher
hält dafür sein eigenes Flag statt eines geteilten `resolved` (siehe unten, Abschnitt zu
`CountdownCard.vue`) — genau deshalb trägt das Ereignis den vollen Zustand und keine einmalige
Kante. Die Dunkelphase wird nicht gemeldet — sie ist der Anfangszustand, und wer folgt, startet
ohnehin unsichtbar.

## `ui/flipdot/FlipDotLegend.vue` (neu)

Die Legendenzeile, benutzt vom Header und vom Card-Strip.

```ts
defineProps<{ text: string; labels: string[]; visible: boolean }>()
```

Sie rendert je Label ein absolut positioniertes `<span>` auf `groupCentres(text)[i]`, in derselben
Typografie wie heute (`font-mono text-[11px] tracking-[0.14em] text-stone-400`, `h-4`), und folgt
`visible` per `transition-opacity`. `text-stone-400` ist eine Kontrast-Untergrenze, nicht eine
Geschmacksfrage: auf `bg-stone-900` misst `text-stone-500` 3,65:1, unter den 4,5:1, die WCAG AA für
11px-Text verlangt; `text-stone-400` liegt bei 6,94:1. Sie ist `aria-hidden`, weil die Lesung
anderswo passiert: in der Card durch die Tafel selbst (dort umschließt sie nichts), im Header durch
den umschließenden Button (dort ist die Tafel selbst ebenfalls `aria-hidden`) — nicht, weil die
Tafel die Lesung immer selbst trägt.

Ihre Breite erbt sie: Tafel und Legende stehen zusammen in einem Wrapper, der sich per `w-fit`
(`fit-content`) auf die Tafelbreite zusammenzieht. Damit braucht die Legende keine Breitenrechnung —
weder im Header, wo die Tafel höhengetrieben ist, noch in der Card, wo sie breitengetrieben ist.
`fit-content` statt eines bloßen `inline-block`, weil die Tafel darin ein `max-width: 100%` auflösen
muss und dafür eine bestimmte Breite braucht.

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

**Ein echtes `<button type="button">`, kein `div` mit `role="button"`.** Der erste Entwurf war ein
`div` mit `role`, `tabindex="0"` und eigenen `@keydown.enter` / `@keydown.space.prevent`-Handlern.
Es funktionierte in Chromium (echter Mausklick verifiziert) und wurde in Firefox als tot gemeldet —
statt die Engine-Differenz zu erraten, fällt die Handarbeit weg: Klick, Tastatur, Fokusreihenfolge
und das Unterdrücken des Seiten-Scrolls bei Leertaste kommen vom Browser und überall gleich. Zwei
Folgen davon:

- Der Inhalt eines `<button>` ist auf *phrasing content* beschränkt, also darf dort kein `<div>`
  stehen. Deshalb ist die Wurzel von `FlipDotLegend` ein `<span class="block …">` — layoutgleich.
- `cursor-pointer` muss explizit dran: Tailwind v4 gibt Buttons keinen Zeiger mehr. Ohne ihn wies
  nichts darauf hin, dass die Tafel überhaupt ein Bedienelement ist — die klickbare Fläche ist
  genau die Tafel (226px von 523px Zeilenbreite bei 555px Viewport), und ein Klick daneben ins
  Schwarze tat sichtbar nichts.

Der Klick-Zyklus (`cycleBaseUnit`), `data-test="countdown"` und der Tooltip bleiben. Anders als im
ursprünglichen Entwurf liest aber nicht die Tafel selbst den Stand vor: die Tafel ist in diesem
Verbraucher `aria-hidden="true"`, und der Button trägt `:aria-label="reading"` („Noch 12 Tage,
4 Stunden, 33 Minuten, 12 Sekunden bis zum Start"), damit der Wegfall von `T-` niemandem etwas
nimmt. Grund: Chromium zieht das `aria-label` eines Kind-`<img>` nicht automatisch in den Accessible
Name eines umschließenden Bedienelements hoch — ohne den eigenen `aria-label` hätte der Button gar
keinen Namen gehabt. In der Card bleibt die Tafel selbst beschreibend, weil dort nichts sie
umschließt. Ein `aria-describedby` verweist auf einen `sr-only`-Span („Drücken, um die Zeiteinheit
umzuschalten"), getrennt vom `aria-label`, damit die Beschreibung der Handlung den Stand (den
eigentlichen Accessible Name) nicht verdeckt.

## `App.vue` — die Header-Geometrie

Der Header ist ein Grid, dessen Zeilenhöhen festliegen und dessen Platzierung ab `md` wechselt:

```
grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto]  gap-x-4 gap-y-2 px-4 py-3
  Titel-Zelle:  CommunityMenu + Brand   Zeile 1, Spalte 1                       (h-10)
  Konto-Zelle:  MemberMenu              Zeile 1, Spalte 2 → ab md Spalte 3      (h-10)
  Tafel-Zelle:  CountdownDisplay        Zeile 2 über beide Spalten
                                        → ab md Zeile 1, Spalte 2               (h-11)
```

Die dritte Spur entsteht erst ab `md`; dadurch bekommt die Titel-Spur (`1fr`) den Leerraum, und Tafel
und Konto-Menü stehen zusammen rechts. Die Tafel-Zelle steht im Markup **hinter** der Konto-Zelle,
weil das die Lesereihenfolge der schmalen Anordnung ist (Titel, Konto, darunter die Tafel) und Phones
der Normalfall sind; die Grid-Platzierung schiebt sie ab `md` optisch dazwischen, ohne das Markup
umzustellen.

Beide Zellen von Zeile 1 tragen `h-10`, nicht nur die Titel-Zelle: eine CSS-Grid-Zeile ist so hoch
wie ihr höchstes Kind, und `MemberMenu`s Trigger ist 40px hoch (ein 32px-Avatar in einem
`p-1`-Button). Die Höhe nur auf der Titel-Zelle zu setzen (`h-8`, 32px) hätte die Login-Seite, auf
der es kein `MemberMenu` gibt, 8px niedriger gelassen als jede andere Seite — eine Höhe, die daran
hängt, ob jemand angemeldet ist.

Ohne Countdown wird die Tafel-Zelle **gar nicht gerendert** (`v-if` auf der Zelle, nicht nur auf der
Komponente). Damit hat der Header dort nur eine Zeile und ist wieder 64px hoch statt 52px
reserviertes Schwarz zu tragen. Existiert die Zelle, hält sie ihre 44px auch dann, wenn
`CountdownDisplay` selbst nichts rendert — etwa während der erste Abruf läuft; so springt die Höhe
nicht, wenn der Countdown auflöst.

## `communities/fallbacks/CountdownCard.vue` — was sich mitändert

Die Card behält ihren Aufbau. Sie erbt drei Dinge:

- Der Strip bekommt den engeren Trenner. Weil er breitengetrieben ist (`w-[94%]`), wird der
  gesparte Platz nicht zu weniger Breite, sondern zu **größeren Punkten**: 43 statt 47 Spalten,
  Punkt ⌀5,66px statt 5,17px, Strip 50,9px statt 46,6px hoch (bei 343px Kartenbreite). Das
  Hero-Board enthält keinen Doppelpunkt und bleibt unverändert.
- Die drei Strip-Labels ziehen in `FlipDotLegend` und stehen auf berechneten Mitten.
- Es gibt kein einzelnes `resolved`. Die Card hält zwei Flags, `heroLive` und `stripLive`, je eines
  pro Tafel, gespeist vom `phase`-Event der jeweiligen Tafel. Der Grund ist die interessanteste
  Erkenntnis des Branches: sobald eine Tafel bei einem Geometriewechsel relighten kann, ist ein
  einziges Flag für beide falsch. Verliert der Tage-Zähler eine Stelle, relightet nur die
  Hero-Tafel — der Strip bleibt die ganze Zeit lesbar. Ein gemeinsames Flag würde `STD MIN SEK` für
  die 300ms des Hero-Relights unnötig ausblenden, obwohl der Strip selbst nichts tut.

## Tests

Vitest mit `vi`, wie in [frontend.md](../../../.claude/guidelines/frontend.md) festgelegt.

- `ui/flipdot/__tests__/font.spec.ts`: der Doppelpunkt belegt `SEPARATOR_COLS` Spalten und leuchtet
  in seiner mittleren; `bitmap` summiert gemischte Breiten korrekt (Spaltenzahl von `12:04` gegen
  Ziffern ohne Trenner).
- `ui/flipdot/__tests__/board.spec.ts` (neu): `groupCentres` liefert eine Mitte pro Ziffernfolge, in
  Reihenfolge; ein Text ohne Trenner hat seine einzige Mitte bei 50%; bei symmetrischem Text
  (`13:42:07`) liegt die mittlere Gruppe exakt auf 50% und die äußeren spiegelbildlich dazu
  (`erste = 100 − letzte`) — die Symmetrie bindet die Arithmetik, ohne sie im Test
  nachzubauen. Dazu ein von Hand hergeleiteter Absolutwert (`12.57%` für die erste Gruppe), damit
  eine falsche Formel nicht durch eine zufällig symmetrische Rechnung schlüpft.
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
- `__tests__/app-header.spec.ts`: ohne Countdown existiert die Tafel-Zelle nicht; mit Countdown
  trägt sie die Platzierung für schmal *und* für `md`, und die Markup-Reihenfolge bleibt die der
  schmalen Anordnung. Dazu: beide Zellen von Zeile 1 nennen ihre Höhe, damit sie nicht daran hängt,
  ob jemand angemeldet ist.
- `communities/fallbacks/__tests__/CountdownCard.spec.ts`: die Strip-Labels stehen auf den
  berechneten Mitten (nicht mehr auf `11.5%`).

## Was nicht dazugehört

- **Keine Buchstaben im Font.** Kein `d`, `h`, `m`, `s`, `M`, `w`, kein `T`.
- **Keine Änderung an `useCountdown` oder der API.** Der geteilte Takt und die Skew-Korrektur bleiben
  wie sie sind. (`computeView` war ursprünglich ebenfalls ausgeschlossen — bis sich zeigte, dass sein
  `after`-Zweig die Basiseinheit ignorierte; siehe oben.)
- **Kein Umbau des Hero-Boards** und keine neue Aufteilung der Card.
- **Keine 320px-Unterstützung** als gestalteter Zustand.
- **Kein `sticky` Header.** Der Header bleibt Teil des Seitenflusses; ob ein Header mit Tafel oben
  kleben soll, ist eine eigene Frage.
