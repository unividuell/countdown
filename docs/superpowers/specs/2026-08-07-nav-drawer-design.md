# Navigations-Drawer — ein Menü statt zwei

**Status:** beschlossenes Design (2026-08-07).

**Löst:** [#32 — Die Header-Menüs brauchen eine Gestaltung](https://github.com/unividuell/countdown.unividuell.org/issues/32).
Nicht durch Umgestaltung der beiden Dropdowns, sondern indem sie durch **einen** Drawer ersetzt
werden; `HeaderMenu.vue` und seine beiden Verwender entfallen ersatzlos.

**Baut auf:** [Header-Avatar](2026-08-06-header-member-avatar-design.md) (`Avatar.vue`,
`MeResponse.avatar`) und [Flip-Dot-Countdown](2026-08-06-header-flip-dot-countdown-design.md)
(`flipdot/board.ts` — `PITCH`, `RADIUS`).

**Berührt:** ausschließlich `webapp-vue`. Kein Backend-Anteil, keine neue API.

## Zweck

Der Header trägt heute zwei Overflow-Menüs: links ein Community-Menü hinter einem Lucide-Icon
(`CommunityMenu.vue`), rechts ein Konto-Menü hinter dem Avatar (`MemberMenu.vue`). Beide benutzen
dieselbe Dropdown-Hülle `ui/HeaderMenu.vue` — weißer Kasten, dünner Rahmen, Standard-Listenzeilen.
Die Aufteilung ist außerdem willkürlich: „Anfragen“ und „Community wechseln“ liegen links,
„Super-Admin“ und „Abmelden“ rechts, obwohl beides Navigation für denselben Menschen ist.

Künftig gibt es **ein** Menü: einen Drawer, der von rechts hereinfährt. Der Avatar oben rechts ist
sein einziger Schalter. Das Community-Icon oben links entfällt.

## Entscheidungen (im Brainstorming festgelegt)

- **Der Avatar schiebt den Drawer wie auf einer Schiene.** Fahrt und Drehung teilen sich *eine*
  Dauer und *eine* Kurve, sind also nicht „ungefähr gleich lang“, sondern zu jedem
  Zwischenzeitpunkt deckungsgleich. Der Drehwinkel ist **proportional zur Strecke** (echte
  Radphysik), nicht auf eine volle Umdrehung gerundet: bei offenem Drawer steht der Avatar deshalb
  in einer Zwischenstellung und rollt beim Schließen exakt in die Ausgangslage zurück.
- **Der Drawer beginnt unter dem Header, nicht darüber.** Der Header wird stattdessen nach
  Material-Art angehoben (Schlagschatten) und liegt über dem Drawer. Der Avatar bleibt dadurch
  sichtbar und ist zugleich der Schließen-Schalter.
- **Weiß.** Verglichen wurden Header-Schwarz, Papier-Weiß und Seiten-Grau am laufenden Mockup.
  Weiß gewinnt wegen der klarsten Ebenen-Ordnung: der Header-Schatten liegt sichtbar darauf.
- **Getrennt wird durch Striche, nicht durch Abstand.** Bereichsabstand allein war zu weich und
  brauchte zu viel Höhe.
- **Genau eine Zwischenüberschrift**, und die trägt den **Community-Namen** — nicht das Wort
  „Verwaltung“. Bei mehreren Communities ist „welche Community betreffen diese drei Punkte?“ die
  eigentliche Frage, und der Name beantwortet sie. Alle anderen Bereiche bleiben unbeschriftet.
- **Das Logo ist keine Leerstands-Behandlung, sondern der Abschluss der Liste.** Ursprünglich nur
  für den leeren Fall gedacht; es steht jetzt immer da. Bei langer Liste scrollt man zu ihm.
- **Das Logo wird ins Flip-Dot-Raster gerastert, statt es abzublenden.** Die Dämpfung kommt daraus,
  dass Punkte nur einen Teil der Fläche bedecken — es bleibt dadurch auch auf einem flauen Display
  sichtbar, statt in Weiß zu verschwinden, und stammt sichtbar aus derselben Werkstatt wie die
  Tafel im Header.
- **Kein Kopfbereich mit Username.** Der Avatar steht 40px darüber im Header; eine Namenszeile
  wäre Dopplung. Damit taucht der eigene Username in der UI nicht mehr auf — bewusst in Kauf
  genommen, bis es eine Profil-Seite gibt.

## Aufbau

Von oben nach unten. Jeder Bereich entfällt vollständig, wenn er nichts zu zeigen hat.

| # | Bereich | Sichtbar wenn | Trenner darüber | Inhalt |
|---|---|---|---|---|
| 1 | Communities | `list.length > 1 \|\| mayCreate` | nein | Community-Liste (nur bei `length > 1`), darunter ohne Trenner „＋ Spielgemeinschaft“ (nur bei `mayCreate`) |
| 2 | Verwaltung | `activeCommunity?.viewerIsAdmin` | **ja** | Überschrift = Community-Name; Anfragen (+ Zähler), Mitglieder, Einstellungen |
| 3 | Logo | immer | nein | Wasserzeichen, siehe unten |
| 4 | Fußblock | immer | **ja** | Super-Admin (nur bei `user.isSuperAdmin`), Abmelden |

Es gibt also höchstens **zwei** Trennstriche, und der über Bereich 2 entfällt mit ihm. Beide laufen
voll durch (kein Material-Einzug).

**Community-Liste:** alle Communities des Anwenders, alphabetisch nach
`localeCompare('de')`. Die aktuelle ist enthalten, aber **ausgegraut, nicht klickbar** und trägt
rechts einen Haken. Ohne aktive Community (z. B. auf `/communities` oder `/super-admin`) ist keine
markiert und alle sind klickbar.

**Bereich 1 ist ein Block, keine zwei.** Zwischen Liste und „＋ Spielgemeinschaft“ steht kein
Trenner — Anlegen ist derselbe Gedanke wie Wechseln.

**Der Fußblock steht außerhalb der Scroll-Fläche** und ist deshalb in keiner Konstellation
wegscrollbar.

### Ziele der Einträge

| Eintrag | Ziel |
|---|---|
| Community (nicht die aktuelle) | `router.push(communityPath(c.slug))` |
| ＋ Spielgemeinschaft | `/communities/new` |
| Anfragen / Mitglieder / Einstellungen | `communityPath(slug, 'requests' \| 'members' \| 'settings')` |
| Super-Admin | `/super-admin` |
| Abmelden | `useAuth().logout()`, danach `router.replace('/login')` |

Alles außer den Communities und Abmelden ist ein `RouterLink`; die Community-Einträge bleiben
`<button>` mit `router.push` (wie heute in `CommunityMenu`), die aktuelle ist ein `<div>`.

### Farben (Tailwind)

| Element | Klassen |
|---|---|
| Drawer | `bg-white text-neutral-900 shadow-2xl` |
| Scrim | `bg-black/45` |
| Trenner | `border-t border-neutral-200` |
| Überschrift | `px-5 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400` |
| Zeile | `flex h-11 items-center gap-2.5 px-5 text-sm hover:bg-neutral-100` |
| Aktuelle Community | zusätzlich `text-neutral-400`, Haken `~icons/lucide/check size-4 ml-auto` |
| ＋ Spielgemeinschaft | `text-neutral-600`, `~icons/lucide/plus size-4` |
| Anfragen-Zähler | `ml-auto rounded-full bg-blue-600 px-1.5 text-xs text-white` |
| Wasserzeichen | `text-neutral-300` |

## Geometrie und Animation

```
Breite      min(320px, 85vw)          — auf 375px sind das 319px, also Materials
                                         „screen − 56dp“; links bleibt ein Streifen Seite
                                         sichtbar, der „daneben tippen schließt“ andeutet.
Oben        Unterkante des Headers, beim Öffnen gemessen, auf ≥ 0 geklemmt
Unten       Viewport-Unterkante
Dauer       300 ms
Kurve       cubic-bezier(.4, 0, .2, 1)
```

**Der Header bleibt im Fluss** (nicht `sticky` — 116px auf dem Handy will man beim Lesen nicht
dauerhaft opfern). Beim Öffnen wird `header.getBoundingClientRect().bottom` gelesen und als `top`
des Drawers gesetzt, dazu Scroll-Sperre auf `document.body` (VueUse `useScrollLock`). Ist die Seite
gescrollt und der Header außer Sicht, ist die Unterkante ≤ 0 und der Drawer geht über die volle
Höhe — genau richtig, denn dann ist kein Header da, unter dem er bleiben müsste. Die Scroll-Sperre
verhindert, dass der gemessene Wert während der Anzeige veraltet.

**Ebenen:** Header `z-30` + `shadow-lg`, Drawer `z-20`, Scrim `z-10`. Der Avatar liegt damit immer
über dem Drawer.

**Der Drehwinkel** kommt aus der **gemessenen** Drawer-Breite, nicht aus einer Konstante — sonst
stimmt er auf keinem Viewport außer dem, für den er notiert wurde:

```ts
/** Wie weit ein Rad vom Durchmesser `wheelPx` rollt, wenn es `travelPx` zurücklegt. */
export function spinDegrees(travelPx: number, wheelPx: number): number {
  return (travelPx / (wheelPx / 2)) * (180 / Math.PI)
}
```

Bei 319px Strecke und dem 32px-Avatar: **1142,4°**, also 3,17 Umdrehungen. Im Uhrzeigersinn beim
Öffnen (positiver Winkel), zurück auf 0 beim Schließen.

**Der Drawer bleibt immer im DOM**, geschlossen per `translate-x-full`. Das hat drei Gründe: die
Breite ist dadurch jederzeit messbar (sonst kennt man sie erst, wenn die Animation schon läuft), die
Transition braucht keine Enter/Leave-Maschinerie, und der Zustandswechsel ist eine einzige
Klassenumschaltung. Geschlossen trägt er `inert` **und** `aria-hidden="true"`, ist also weder
fokussierbar noch für Screenreader vorhanden.

**`prefers-reduced-motion`:** keine Fahrt, keine Drehung. Der Winkel bleibt 0
(`usePreferredReducedMotion`), die Transform-Transition entfällt
(`motion-reduce:transition-none`) — der Drawer steht also sofort da, statt zu fahren. Nur der Scrim
blendet weiter, in 150 ms, damit der Wechsel nicht ganz ohne Übergang passiert.

## Rest-Raum, Logo und Scrollen

Der Drawer ist eine Flex-Spalte aus **zwei** Kindern:

```
.drawer          flex flex-col
  .scrollarea    flex flex-col  flex-1 min-h-0 overflow-y-auto
    …Bereiche 1–2…
    .mark        grow shrink-0 basis-auto   grid place-items-center
  .foot          flex-none                  (Trenner + Super-Admin + Abmelden)
```

Das Logo ist das **letzte Element im Scroll-Fluss** mit `grow shrink-0 basis-auto`: `grow` nimmt freien
Platz auf und zentriert das Logo darin, `shrink: 0` gibt seine 200px nie her. Bei langer Liste
wächst deshalb die Scroll-Höhe, und man scrollt zum Logo — es verschwindet nie. Gemessen im Mockup
(375×660, Drawer-Innenhöhe 481px):

| Fall | Logo-Block | Logo | Scroll-Überhang |
|---|---|---|---|
| Mitglied, 1 Community | 475px | 200px | 0 |
| Admin, 2 Communities | 248px | 200px | 83px |
| Admin, 9 Communities | 248px | 200px | 435px |

Weil `.foot` ein Geschwister der Scroll-Fläche ist, bleibt „Abmelden“ in allen drei Fällen stehen.
Der bewusst akzeptierte Preis: unter dem letzten Eintrag liegen immer ~250px, in denen nur das Logo
steht — der Scrollbalken verspricht dadurch mehr Inhalt, als kommt.

**Fallstrick, der beim Bauen kostet, wenn man ihn nicht kennt:** eine frühere Fassung ließ das Logo
per `max-height: 100%` mitschrumpfen. Das greift nicht — die Höhe eines Flex-Kindes gilt für die
Prozentauflösung als **unbestimmt**, das SVG blieb auf 200px und sprengte die Fläche (gemessen:
Rest-Raum 166px, SVG 200px, 47px Überhang, im Bild fast unsichtbar). Wer je eine mitschrumpfende
Variante braucht, muss Container-Query-Einheiten nehmen (`min(200px, 100cqw, 100cqh)` gegenüber
`container-type: size`) — die sind definit. Die beschlossene Lösung umgeht das Problem, indem sie
gar nicht schrumpft.

## Das Wasserzeichen

Neu: `webapp-vue/src/ui/BrandMark.vue`. Zeichnet eine feste 36×36-Bitmap als Kreise im **selben
Raster wie die Flip-Dot-Tafel** — `PITCH` und `RADIUS` werden aus `ui/flipdot/board.ts` importiert,
damit eine Änderung dort das Zeichen mitnimmt. Gefüllt mit `currentColor`, im Drawer also
`text-neutral-300`; `aria-hidden="true"`, weil es nichts aussagt.

Die Bitmap ist aus `unividuell_logo_circle_wb.png` (1042×1042, RGBA) abgeleitet: je 36×36-Zelle
wird die Deckung mit *opaken und dunklen* Pixeln (`alpha > 127 && r < 128`) bestimmt, Punkt an ab
50%. Die weiße Marke im Logo bleibt dadurch als Aussparung erhalten.

```
..............##.....#..............
...........#####.....####...........
.........#######.....######.........
.......#########......#######.......
......##########......########......
.....###########......#########.....
....############.......#########....
...#############.......##########...
...#############.......##########...
..##############........##########..
..##############........##########..
.###############.........##########.
.###############....#....##########.
.###############....#....##########.
################....##....#########.
################....##....#########.
################....##....#########.
################....###....#######..
################....###....#######..
################....###.....######..
################....####....#####...
################....####....#####...
.###############....#####....####...
.###############....#####....###....
.##############.....#####....###....
..#############.....######....##....
..#############....#######....#.....
...###########.....########...#.....
...##########.....#########.........
....#######.......#########.........
.................###########........
................############........
..............##############........
...........################.........
...........##############...........
..............########..............
```

Das PNG selbst wird **nicht** ausgeliefert: es gibt keinen Bild-Request und keine Bytes im Bundle
außer diesen 36 Zeilen. Der Preis: ein geändertes Logo muss neu gerastert werden. Die Regel oben
macht das reproduzierbar.

## Bedienung und Barrierefreiheit

- Der Avatar-Schalter trägt `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` und ein
  `aria-label` („Menü öffnen“ / „Menü schließen“, ergänzt um „, offene Anfragen“, wenn der Punkt
  leuchtet). **Ein `aria-label` am Schalter selbst, nicht am Avatar darin** — Name-from-content
  zieht ein `aria-label` eines Kindes in Chromium nicht hoch (siehe frontend.md).
- Der Drawer ist `role="dialog" aria-modal="true"`, beschriftet über `aria-label="Menü"`.
- Beim Öffnen wandert der Fokus in den Drawer, `Escape` schließt und gibt ihn dem Avatar zurück.
- **Minimaler eigener Fokus-Käfig:** Tab am letzten fokussierbaren Element springt zum ersten,
  Shift+Tab am ersten zum letzten. Bewusst handgeschrieben statt `focus-trap` als Abhängigkeit —
  der Drawer ist die einzige modale Fläche der App.
- Schließen außerdem per Klick daneben und bei jedem Routenwechsel. **Nicht** bei Klick *im*
  Drawer: ein fehlgeschlagenes Abmelden muss ihn offen lassen, um seine Fehlermeldung zeigen zu
  können. Die Außenklick-Erkennung hört wie bisher direkt auf `document` und prüft Containment
  selbst — VueUse `onClickOutside` feuert unter happy-dom nicht (siehe frontend.md).
- Jede Zeile ist 44px hoch (Touch-Minimum).
- Der Anfragen-Punkt wandert vom entfallenden Community-Icon an den Avatar; die Zahl bleibt am
  Eintrag „Anfragen“.

## Daten

`useCommunities().refresh()` wird wie bisher **einmal beim Mount** geholt — `NavDrawer` sitzt im
App-Header und mountet genau einmal pro Seitenaufruf — und zusätzlich **bei jedem Öffnen**.
Gerendert wird währenddessen aus dem Modul-Singleton, damit der Switcher nicht aufpoppt.
Schlägt die Liste fehl, bleibt der Rest des Drawers bedienbar (`catch` + `console.error`, wie
`CommunityMenu` es heute hält).

`activeCommunity` (Name, `viewerIsAdmin`, `pendingCount`) kommt unverändert aus
`communities/context.ts`.

## Dateien

**Neu**

| Datei | Inhalt |
|---|---|
| `src/nav/NavDrawer.vue` | Besitzt den Auf/Zu-Zustand und rendert **beides**: den Avatar-Schalter im Header und den Drawer (`<Teleport to="body">`). Zusammen in einer Komponente, weil die Synchronität von Drehung und Fahrt sonst über eine Naht liefe. |
| `src/nav/drawer.ts` | Reine Funktionen: `communityEntries(list, activeSlug)` und `spinDegrees(travelPx, wheelPx)`. Ohne Mounten testbar. |
| `src/ui/BrandMark.vue` | Die 36×36-Bitmap als SVG-Punkte. |

**Gelöscht**

- `src/ui/HeaderMenu.vue` + `src/ui/__tests__/HeaderMenu.spec.ts`
- `src/auth/MemberMenu.vue` + `src/auth/__tests__/MemberMenu.spec.ts`
- `src/communities/CommunityMenu.vue` + `src/communities/__tests__/CommunityMenu.spec.ts`

**Geändert**

- `src/App.vue` — `CommunityMenu` raus, `MemberMenu` → `NavDrawer`, Header bekommt `relative z-30`
  und `shadow-lg`.

### Aufräumen: der Rattenschwanz

Über die drei Komponenten hinaus gibt es **keine** geteilte Datei, die nur dem alten Menü diente —
`HeaderMenu.vue` *war* das Geteilte. Es gibt aber Verweise, die sonst verrotten. Zwei davon bleiben
grün und beweisen nichts mehr; die sind der eigentliche Grund, das hier vollständig aufzuzählen.

| Stelle | Was passiert | Warum es nicht liegen bleiben darf |
|---|---|---|
| `src/pages/c/__tests__/slug-shell.spec.ts:89` | `expect(find('[data-test=community-menu]')).toBe(false)` → auf den Marker des Drawers umhängen | **Verrottet still.** Nach dem Löschen kann dieses Attribut nirgends mehr existieren, die Zeile ist also unfälschbar wahr. Der Test soll weiter beweisen, dass die Shell keine Navigation in den Inhaltsbereich malt — dafür muss er auf etwas zeigen, das es gibt. |
| `src/__tests__/icons.spec.ts` | `~icons/lucide/users` → `~icons/lucide/check` (oder `plus`) | **Verrottet still.** `lucide/users` hat nach dem Löschen keinen Verwender mehr in der App; der Test würde das Bündeln eines Icons prüfen, das wir gar nicht mehr ausliefern. `check` und `plus` benutzt der Drawer wirklich. |
| `src/pages/super-admin.vue:10` | Kommentar „der Weg zurück ist der `MemberMenu`-Eintrag“ → Fußblock des Drawers | Zeigt sonst auf eine gelöschte Datei. |
| `src/App.vue:53,54` | Kommentare über die 40px-Höhe nennen `MemberMenu` | Die Geometrie stimmt weiter (der Avatar-Schalter ist derselbe), nur der Name nicht. |

Und in den Guidelines, wo mehrere Lektionen ihr Beispiel in genau diesen Dateien hatten. Die
Lektionen bleiben richtig — nur ihre Zeiger nicht:

| Datei | Zeile(n) | Neuer Bezug |
|---|---|---|
| `multi-tenancy.md` | 120 | „Logout lebt an genau einer Stelle“ → `nav/NavDrawer.vue` |
| `frontend.md` | 60 | 40px-Zeilenhöhe: `MemberMenu`-Trigger → Avatar-Schalter in `NavDrawer` |
| `frontend.md` | 109–110 | `.catch` an jeder Navigation → `NavDrawer.vue` |
| `frontend.md` | 173 | `enableAutoUnmount(afterEach)`-Beispiel → `NavDrawer.spec.ts` |
| `frontend.md` | 206–209 | `onClickOutside` feuert nicht unter happy-dom → `NavDrawer.vue` |
| `frontend.md` | 219–224 | Ref-Doubles für `useAuth` → `NavDrawer.spec.ts` |
| `frontend.md` | 350–351 | „Navigation lebt im Header (`CommunityMenu`, `MemberMenu` auf `HeaderMenu`)“ → ein Drawer |
| `frontend.md` | 367 | Super-Admin-Einstieg ist ein `MemberMenu`-Eintrag → Fußblock des Drawers |

Dazu kommen in `frontend.md` die neuen Lektionen dieser Arbeit: der Flex-Prozenthöhen-Fallstrick,
`container-type: size` + cq-Einheiten, und das `inert`-Muster für eine dauerhaft gemountete, aber
geschlossene Fläche.

**Nicht angefasst:** `docs/superpowers/specs/2026-08-06-header-member-avatar-design.md` nennt
`MemberMenu.vue:28`. Specs sind Protokolle eines Entscheidungsstands, keine gepflegte Dokumentation
— rückwirkend korrigiert sagen sie nicht mehr, was damals galt.

## Tests

TDD, Vitest + `@vue/test-utils` + happy-dom.

`nav/__tests__/drawer.spec.ts` (rein)
- `communityEntries` sortiert nach `localeCompare('de')` — Fixture mit Umlaut, der sich unter
  Codepoint-Sortierung anders einordnet als unter deutscher Kollation.
- Die aktuelle Community ist **enthalten** und als `current` markiert; ohne aktiven Slug ist keine
  markiert.
- `spinDegrees(319, 32)` ≈ 1142,4; `spinDegrees(0, 32) === 0`; linear in der Strecke.

`nav/__tests__/NavDrawer.spec.ts`
- `aria-expanded` kippt beim Klick; geschlossen trägt der Drawer `inert` und `aria-hidden`.
- Bereichs-Sichtbarkeit über alle vier Zeilen der Tabelle oben, inklusive der Kombination
  „eine Community + Anlege-Recht“ (Liste weg, Anlegen bleibt).
- Die aktuelle Community ist kein Button und trägt `aria-current`; ein Klick darauf navigiert nicht.
- Anfragen-Zähler und Avatar-Punkt erscheinen nur bei `viewerIsAdmin && pendingCount > 0`.
- Abmelden: Erfolg → `router.replace('/login')`; Fehler → Meldung sichtbar **und Drawer offen**.
  (`push`/`replace`-Doubles müssen `mockResolvedValue(undefined)` sein, siehe frontend.md.)
- `Escape` schließt und fokussiert den Avatar; Routenwechsel schließt; Klick im Drawer schließt
  nicht.
- Reduced Motion (`matchMedia`-Stub) → Winkel bleibt 0.

`__tests__/app-header.spec.ts` — angepasst: kein Community-Icon mehr, `NavDrawer` vorhanden, auf
`/login` (ohne Anwender) nicht.

**Was Tests hier nicht können:** happy-dom rechnet keine Boxen und kein CSS. Weder die 1142°, noch
die Deckungsgleichheit von Fahrt und Drehung, noch der Rest-Raum-Mechanismus sind im Unit-Test
beweisbar — prüfbar sind nur die Klassen und die gebundenen Werte. Die Zahlen in diesem Dokument
stammen aus Messungen im Browser und gehören dorthin zurück, wenn sie jemand anzweifelt.

## Nicht-Ziele

- Keine Profil-Seite. „Profil bearbeiten“ kommt später und gehört dann in den Fußblock.
- Kein Dark Mode.
- Keine Wisch-Geste zum Öffnen. Der Avatar ist der Schalter.
- Keine Fokus-Käfig-Bibliothek.
