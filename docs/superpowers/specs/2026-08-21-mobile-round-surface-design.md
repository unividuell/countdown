# Mobiles Spielfeld — die geteilte Bühne (`RoundSurface`)

**Status:** beschlossenes Design (2026-08-21).

**Baut auf:** dem [Runden-Frontend](2026-08-14-round-frontend-design.md), den beiden
bestehenden Spielen ([Guess Hue Input](2026-08-08-guess-hue-input-design.md),
[Song Snippet](2026-08-20-song-snippet-design.md)) und dem
[Spiel-Labor](2026-08-08-game-lab-design.md), das dieselben Spiel-Components rendert wie die
echte Seite.

**Berührt:** ausschließlich `webapp-vue`. Neu: `ui/RoundSurface.vue` und zwei `@utility` in
`assets/main.css`. Umgebaut: die vier Spiel-Views von Guess Hue und Song Snippet,
`rounds/RoundCard.vue`, die Labor-Spielseite, `communities/fallbacks/{MessageCard,CountdownCard}.vue`,
die zwei Runden-Platzhalter. Kein Backend, keine API, keine Migration.

## Zweck

Auf einem Telefon begrenzen heute **zwei** Ränder die Spielfläche: `main p-4` in `App.vue` und
das `p-4` der Karte, die jedes Spiel selbst mitbringt. Bei 375 px Viewport bleiben davon 309 px
Inhalt übrig — die Karte ist 343 px breit, minus 32 px Padding, minus die zwei 1-px-Ränder.
Ein Fünftel der Displaybreite geht für Abstände weg, die auf dem Desktop richtig sind und auf
dem Telefon nur teuer.

Zugleich baut jedes Spiel diesen Rahmen selbst: dieselbe Klassenkette
`rounded-xl border border-neutral-200 bg-white p-4` steht heute an sechs Stellen
(`GuessHueBoard`, `GuessHueReveal`, `SongSnippetBoard`, `SongSnippetReveal`, zwei Gesichter in
`RoundCard`), plus einer siebten Variante in `MessageCard`. Ein neues Spiel muss den Rahmen
kennen und richtig treffen.

Beides wird zusammen gelöst: **mobil wird die Karte eine randlose Bahn, ab `sm` ist sie wieder
die heutige Karte — und wer sie montiert, ist nicht mehr das Spiel, sondern sein Wirt.**

Die Breite bleibt bei `max-w-xl` gedeckelt. Ein Desktop-Spieler soll gegenüber einem
Telefon-Spieler keinen Vorteil haben; das ist die Begründung, die im Shell schon steht
(`pages/c/[slug].vue`), und sie ändert sich hier nicht.

## Die Entscheidungen

### Mobil eine Bahn, ab `sm` eine Karte

Die Karte behält ihr `p-4`. Was mobil verschwindet, ist ihr **Rand zum Displayrand**: die Bahn
bricht um genau `main`s Seitenrand aus, wird also 375 px breit, und ihre Kanten sind eine
Haarlinie oben und unten statt eines umlaufenden Rahmens mit Radius. Weiß auf `neutral-100`
trägt die Abgrenzung.

Bei 375 px Viewport:

| | heute | neu |
|---|---|---|
| weiße Fläche | 343 px | **375 px** |
| Inhalt (Zitat, Hinweis, Suchfeld, Scoreboard) | 309 px | **343 px** (+34, +11 %) |
| Farbrad | 309 px | **343 px** |
| Song-Cover-Kachel | 134 px | **144 px** (am `9rem`-Deckel) |

Ab `sm` ist alles wie heute: 576 px Spalte, umlaufender Rahmen, Radius, 542 px Inhalt.

Erwogen und verworfen wurden drei weitere Startbilder (siehe [Verworfen](#verworfen)):
Schultern oben statt eckiger Kanten, gar keine weiße Fläche, und eine dunkle Bühne.

### Bruchpunkt `sm` (40 rem), nicht `xl`

`max-w-xl` ist ein *max-width*-Name (36 rem = 576 px) und hat mit dem Breakpoint `xl`
(80 rem = 1280 px) nichts zu tun. Ab 608 px Viewport ist die Spalte an ihrem Deckel; der
nächste echte Breakpoint darüber ist `sm` bei 640 px. Mit `xl` als Grenze sähe ein Laptop bei
1000 px eine 576 px breite, rahmenlose Bahn mitten im Grau — das liest sich wie ein Fehler,
nicht wie ein Layout.

`sm` ist damit der **erste** Gebrauch dieses Breakpoints im Projekt; bisher existiert nur
`md:` in `App.vue`. Die Defaults gelten unverändert: `main.css` definiert keine
`--breakpoint-*`, es gibt keine `tailwind.config`.

### Ein Rand, 16 px — es gibt keine zweite Zone

Der erste Entwurf hatte zwei Zonen: Text behält 16 px, die Spielfläche geht bis an die Kante.
Beides ist gestrichen, aus zwei unabhängigen Gründen.

**Das Rad darf nicht an der Kante kleben.** Die Geometrie sagt, wie knapp es dort wird: der
Knopf reitet bei `KNOB_TRACK_FRACTION = 0.89` des Radius und ist `KNOB_SIZE_FRACTION = 0.09`
der Radbreite groß, sein Außenrand liegt also bei 0,98 R — nur 1 % der Radbreite innerhalb der
Box. Eine bündige Bahn stellt den Knopf 3,8 px vor den Displayrand. Greifbar ist ohnehin nur
das Band ab `BAND_INNER_FRACTION = 0.78`, dessen äußere Hälfte am linken und rechten Extrem in
der System-Zurück-Zone der Gestennavigation liegt (~24 dp). Die Zone lässt sich nicht
freiräumen — dafür bräuchte das Rad 20,6 px Rand, mehr als der Textrand —, aber sie schließt
0 px sicher aus.

**Und die Spielfläche gewinnt durch einen Ausbruch nichts.** Der einzige Kandidat war das
scrollende Cover-Band von Song Snippet. `song-cover` ist `min(43.5%, 9rem)`, die Kachel also
**ab 331 px Containerbreite auf 144 px gedeckelt**. Bei 343 px Inhalt ist sie gedeckelt, bei
375 px auch — ein Ausbruch macht die Kachel nicht größer, er lässt nur ein Fünftel Kachel mehr
durchgucken. Dafür ein zweites Randmaß, `scroll-padding` und einen Testfall einzuführen ist
ein schlechter Tausch. Nebenbei ist der Deckel auch das, was Board und Reveal weiterhin
dieselbe Kachelbreite gibt: 43,5 % von 343 und 43,5 % von 375 sind beide gedeckelt, es gibt
keinen Sprung beim Auflösen.

Damit ist der Rand **überall 16 px**, mobil wie ab `sm`, und die Bühne kennt genau einen
Innenabstand.

### Der Rad-Deckel wird ein Maß mit Namen

`max-w-80` (20 rem = 320 px) steht heute zweimal da, Zeichen für Zeichen dieselbe
Klassenkette: `HueWheelInput.vue:292` und `HueWheelReveal.vue:141`. Das ist genau die Falle,
die `frontend-ui.md` beschreibt — der Reveal blendet seine Marker auf denselben Radius und
Winkel wie den Knopf des Eingaberads, „mein Marker deckt den Knopf exakt" ist gebaut, nicht
nachgerechnet. Zwei Literale, die gleich sein müssen, sind ein sichtbarer Sprung, sobald
eines wandert.

Mobil wird der Deckel auf **27 rem = 432 px** gezogen: die Breite des breitesten verbreiteten
Telefons (iPhone 16 Pro Max, 430 px). Damit greift er auf *jedem* echten Telefon nie — das Rad
ist voll ausgereizt —, und im Fenster 430–640 px Viewport wächst es nicht ins Absurde. Ohne
Deckel wäre das Rad bei einem aufgeklappten Foldable 608 px breit; das ist kein Bedienelement
mehr, sondern ein Poster, und der Bestätigen-Knopf stünde tiefer als die halbe Seite. Ab `sm`
gelten weiter 20 rem.

### Die Wirte montieren die Bühne, nicht die Spiele

Ein Spiel soll den Rahmen nicht *kennen müssen*. Also verlieren die vier Spiel-Views ihren
Rahmen und werden nackte Inhalte; montiert wird die Bühne von den zwei Stellen, die ein Spiel
einsetzen: `RoundCard` und die Labor-Spielseite.

Das kostet: zwei Wirte müssen sich einig bleiben, und wenn das Labor das Wrappen vergisst,
sieht ein Spiel dort anders aus als im Spiel — während das Labor genau dafür existiert, dass
es *nicht* anders aussieht. Ein Test nagelt es fest.

Das bringt: ein neues Spiel schreibt nur sein Brett und *kann* den Rahmen nicht falsch machen.
`RoundCard` wird aufgeräumt — statt zweier selbstgebauter Rahmen für „Aufdecken" und „noch
keine Ansicht" eine Bühne mit drei Gesichtern darin. Und der Crossfade in `GuessHueGame`
bekommt einen Rahmen statt zwei: heute tragen Board und Reveal je einen, die während der
300 ms Überblendung übereinanderliegen.

Verworfen wurden: „jedes Spiel montiert selbst" (kleinster Diff, aber die Vereinheitlichung
bleibt Disziplin statt Struktur, und der doppelte Rahmen im Crossfade bleibt) und „nur zwei
`@utility`-Namen ohne Component" (dito, plus ein Test könnte nur Klassen-Strings prüfen).

### Die frühen Views passen sich an, sie biegen die Bühne nicht

Treiber dieses Umbaus sind die zwei Spiele. `MessageCard`, `CountdownCard` und `RoundFallback`
sind frühe Views und dürfen das Ergebnis nicht formen. Ein erster Entwurf gab `RoundSurface`
deshalb zwei Props — `tone: 'paper' | 'ink'` und `flush` — und **beide waren ausschließlich
von diesen Fallbacks erzwungen**; kein Spiel braucht sie. Sie sind gestrichen, `RoundSurface`
hat keine Props.

- **`MessageCard`** wird Verbraucher der Bühne und verliert dabei sein `px-6`; es nimmt die
  16 px der Bühne. Frühe View, kostet nichts.
- **`CountdownCard`** behält ihr eigenes Design und nimmt nur das **Maß**. Ihre `w-[72%]`
  (Hero) und `w-[94%]` (Zeitleiste) müssen Prozente der *vollen* Fläche sein — deshalb hat
  sie aus Absicht nur `py-4` und kein horizontales Padding (siehe den Kommentar dort und
  `frontend-ui.md`, „a percentage width only means what you think inside a parent that has a
  width"). Unter einem `p-4` wären 94 % der Innenfläche 103 % der Bahn, also nicht
  ausdrückbar, und der Hero bliebe bei 247 px statt auf 270 px zu wachsen. Sie ist damit
  Verbraucher des Maßes, nicht der Component — der ehrlichere Schnitt, und in sie ist schon
  viel Design geflossen, das hier nichts zu gewinnen hätte.

## Die Bausteine

### `@utility round-bleed` (in `assets/main.css`)

Das Ausbruchsmaß wird an vier Stellen gebraucht — Bühne, Countdown-Karte, zwei Platzhalter.
Vier gleiche Literale sind drei Gelegenheiten zum Driften, also bekommt es einen Namen:

```css
@utility round-bleed {
  margin-inline: calc(var(--spacing) * -4);
  @media (width >= theme(--breakpoint-sm)) { margin-inline: 0; }
}
```

`var(--spacing)` ist dieselbe Variable, aus der Tailwind `p-4` rechnet. Der Ausbruch und
`main`s Seitenrand sind damit *eine* Messung und nicht zwei zufällig gleiche. Der Breakpoint
steht ebenfalls nicht als Literal da, sondern als `theme(--breakpoint-sm)`.

Der Kommentar im Code nennt `App.vue`s `main p-4` als Gegenstück, und ein Test hält fest, dass
dieses `p-4` dort noch steht — das ist die prüfbare Hälfte von „diese zwei Zahlen sind eine".

### `@utility hue-wheel` (in `assets/main.css`)

Ersetzt die zwei `max-w-80`-Literale. Ein Name, den beide Räder aussprechen — genau wie
`song-cover` es für die Cover-Breite vormacht:

```css
@utility hue-wheel {
  width: 100%;
  max-width: 27rem;
  @media (width >= theme(--breakpoint-sm)) { max-width: 20rem; }
}
```

Beide Räder tragen dann `hue-wheel relative mx-auto aspect-square rounded-full select-none`.

**Zu prüfen beim ersten Build:** dass Tailwind v4 ein verschachteltes `@media` innerhalb von
`@utility` durchlässt und `theme(--breakpoint-sm)` dort auflöst. Falls nicht, bleibt die
Media Query aus der Utility draußen und der Breakpoint steht als Variante im Template
(`round-bleed sm:mx-0`, `hue-wheel sm:max-w-80`) — dann streiten wieder zwei Klassen um eine
Eigenschaft, weshalb es nur die zweite Wahl ist.

### `ui/RoundSurface.vue`

Ein Slot, keine Props, keine Events:

```
round-bleed border-y border-neutral-200 bg-white p-4 sm:rounded-xl sm:border-x
```

`border-y` gilt immer, `border-x` erst ab `sm` — so streitet keine Klasse mit einer anderen um
dieselbe Eigenschaft, und es gibt keine Frage, welche Variante in der Kaskade gewinnt. Trägt
`data-test="round-surface"`. Was von außen an Layout dazukommt (`aspect-square`,
`flex flex-col`, `mt-6`), kommt per Vues Klassen-Durchgabe.

`ui/`, nicht `rounds/` oder `games/`: Verbraucher sind Spiele, das Labor, `RoundCard` und ein
Fallback — die Bühne gehört keinem davon.

## Der Umbau, pro Verbraucher

| Datei | heute | neu |
|---|---|---|
| `games/guesshue/GuessHueBoard.vue` | `group rounded-xl border … p-4` | `group` |
| `games/guesshue/GuessHueReveal.vue` | `rounded-xl border … p-4` | nackter `<div>` (trägt weiter `[grid-area:1/1]` von außen) |
| `games/songsnippet/SongSnippetBoard.vue` | `flex flex-col gap-4 rounded-xl border … p-4` | `flex flex-col gap-4` |
| `games/songsnippet/SongSnippetReveal.vue` | dito | `flex flex-col gap-4` |
| `games/guesshue/HueWheelInput.vue:292` | `w-full max-w-80` | `hue-wheel` |
| `games/guesshue/HueWheelReveal.vue:141` | `w-full max-w-80` | `hue-wheel` |
| `rounds/RoundCard.vue` | zwei eigene Rahmen, Spiel rahmenlos | eine `<RoundSurface>` um alle drei Gesichter; `notice` bleibt darüber außerhalb; die Gesichter verlieren ihr `p-6` |
| `pages/c/[slug]/lab/[game].vue` | `<component :is>` blank | `<RoundSurface v-if="round">` darum |
| `communities/fallbacks/MessageCard.vue` | eigene Karte, `aspect-square w-full px-6` | `<RoundSurface class="flex aspect-square flex-col items-center justify-center text-center">` |
| `communities/fallbacks/CountdownCard.vue` | `flex aspect-square w-full flex-col items-center justify-between rounded-xl bg-stone-900 py-4` | `round-bleed flex aspect-square flex-col items-center justify-between bg-stone-900 py-4 sm:rounded-xl` |
| `pages/c/[slug]/index.vue` (`round-placeholder`) | `mt-6 aspect-square w-full` | `mt-6 round-bleed aspect-square` |
| `communities/fallbacks/RoundFallback.vue` (`fallback-placeholder`) | `aspect-square w-full` | `round-bleed aspect-square` |

Unverändert bleiben: `group` auf `GuessHueBoard`s Wurzel (dort landet die
`hue-card-leaving`-Klasse der Transition), `[grid-area:1/1]` auf beiden Guess-Hue-Wurzeln, der
`grid`+`Transition`-Bau in `GuessHueGame` (er wandert nur *in* die Bühne), und der vertikale
Rhythmus in den Spielen (`gap-4` bei Song Snippet, `mt-6`/`mt-8` bei Guess Hue). `main`s
Padding und jede andere Seite bleiben unberührt.

## Fallen

### `w-full` und ein negativer `margin-inline` schließen sich aus

Bei definierter Breite ist die CSS-Gleichung überbestimmt und der rechte Margin wird
verworfen: die Box bleibt 343 px breit und **wandert** nur 16 px nach links, statt auf 375 px
aufzugehen. Die Breite muss `auto` bleiben, damit der Ausbruch sie aufzieht. Drei Stellen
tragen heute `aspect-square w-full` und müssen das `w-full` **verlieren**: `MessageCard`,
`CountdownCard` und die zwei Platzhalter. Ohne das steht die Countdown-Karte schief statt
breit — und happy-dom rechnet kein Layout, kein Unit-Test würde es sehen. Nur eine Messung im
Browser (oder ein Blick) findet es.

### Die Platzhalter müssen mitwachsen

`round-placeholder` und `fallback-placeholder` reservieren die Höhe, damit die Seite beim Laden
nicht springt. Beide sind `aspect-square`, also ist ihre Höhe ihre Breite. Wenn die echten
Karten 375 px breit werden und die Platzhalter 343 px bleiben, springt die Seite um 32 px,
sobald die Antwort da ist. Sie bekommen deshalb denselben `round-bleed` — ohne Rahmen, sie
bleiben unsichtbar.

Damit stehen alle vier Boxen desselben Slots auf derselben Kantenlänge: `MessageCard`,
`CountdownCard` und beide Platzhalter sind mobil 375 × 375 (Border-Box, Tailwinds Preflight
setzt `box-sizing: border-box`), ab `sm` 576 × 576.

### Die 32-px-Delle bei 608–640 px Viewport

In diesem Fenster ist die Spalte schon am `max-w-xl`-Deckel, der Ausbruch holt aber nur die
32 px von `main` zurück — die Bahn ist 608 px breit und lässt links und rechts ein paar Pixel
Grau stehen. Bewusst nicht behandelt: ein echter Vollbild-Ausbruch bräuchte
`margin-inline: calc(50% - 50vw)`-Akrobatik, und das Fenster ist 32 px breit.

### Ein Test hängt heute an `.rounded-xl`

`games/guesshue/__tests__/GuessHueGame.spec.ts:236` sucht die Reveal-Karte über
`.closest('.rounded-xl')`, um an ihr `[grid-area:1/1]` zu prüfen. Die Klasse heißt künftig
`sm:rounded-xl` — und die Karte ist an dieser Stelle ohnehin weg. Der Test prüft
`[grid-area:1/1]` direkt an der Reveal-Wurzel.

## Tests

happy-dom rechnet kein CSS und keine Box-Größen. Geprüft wird deshalb strukturell, nie in
Pixeln:

- **`ui/__tests__/RoundSurface.spec.ts`** — rendert den Slot, trägt `data-test="round-surface"`
  und die Klassenkette; und: `App.vue`s `main` trägt `p-4`. Letzteres ist der Wächter für die
  Kopplung, die `round-bleed` eingeht.
- **Pro Spiel-View** — die Wurzel trägt **kein** `rounded-xl` und **kein** `border-neutral-200`
  mehr. Das Negativ ist das, was ein Zurückrutschen verhindert; ein neu geschriebenes Spiel,
  das sich wieder selbst rahmt, fällt auf.
- **`rounds/__tests__/RoundCard.spec.ts`** — genau eine Bühne, alle drei Gesichter darin,
  `notice` außerhalb.
- **Labor-Seitenspec** — das Spiel-Component steht innerhalb einer Bühne. Das ist der Test für
  „zwei Wirte bleiben einig".
- **`MessageCard` / `CountdownCard` / Platzhalter** — tragen `round-bleed`, tragen **kein**
  `w-full`. Der zweite Teil ist der einzige Schutz vor der Überbestimmungs-Falle, den ein
  Unit-Test geben kann.
- **`HueWheelInput` / `HueWheelReveal`** — beide tragen `hue-wheel`, keiner trägt `max-w-80`.
  Dass die zwei Räder gleich groß sind, ist damit strukturell und nicht mehr nachgerechnet.

Zusätzlich eine Messung im Browser, weil kein Test sie ersetzt: bei 375 px die Bahn auf
375 px, das Rad auf 343 px, der Knopf am linken Extrem sichtbar mit Abstand zur Kante; bei
640 px die Karte zurück mit Radius und umlaufendem Rahmen; und die Countdown-Karte quadratisch
statt verschoben.

## Verworfen

- **Schultern statt eckiger Kanten** (Radius nur oben, keine Unterkante — die Bahn steigt von
  unten in die Seite). Sieht gut aus und setzt voraus, dass das Spielfeld das Letzte auf der
  Seite ist. Es ist heute das Letzte, aber die Variante ist später eine Zeile CSS und nimmt
  jetzt nichts vorweg.
- **Gar keine weiße Fläche** („die Seite *ist* weiß"). Maximal ruhig, aber die Runde verliert
  ihre Objekthaftigkeit, und alles, was heute auf Weiß liegt (Scoreboard, Cover-Kacheln),
  bräuchte eine eigene Abgrenzung.
- **Dunkle Bühne** (`bg-stone-900` randlos, wie die Countdown-Karte und das Flip-Dot-Band im
  Header). Reizvoll und schon Teil der Bildsprache, aber jedes Spiel müsste seine Innenfarben
  umdrehen — ein Re-Skin, kein Layout-Schnitt.
- **Ein zweiter, kleinerer Spielflächen-Rand** (etwa 8 px, das Rad dann 359 px). 16 px
  Unterschied im Raddurchmesser sind 4,7 % — auf dem Schirm kaum zu sehen, im Kopf der
  Component ein ganzer zusätzlicher Begriff mit eigener Begründung und eigenem Testfall.
- **`RoundSurface` mit `tone`/`flush`-Props.** Beide waren nur von den frühen Views erzwungen.
  Wenn irgendwann ein *Spiel* eine dunkle oder randlose Bühne braucht, kommt die Prop dann.
- **`main`s Padding wegnehmen und jede Seite ihren eigenen Rand geben.** Wäre strukturell
  saubererer als ein Ausbruch, aber es berührt jede Seite der App und macht „vergiss das
  `px-4`" zur neuen Falle für jede künftige.
