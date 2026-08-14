# Die Runde im Frontend — Design

**Umgesetzt** — der Reveal-Schalter, die Rundennummer am Tipp, die geteilte Registry samt
`GuessHueGame`, `useRound` und die Rundenkarte auf der Community-Seite stehen.

## Scope

Der Spielerzugang zur echten Runde. Das Backend ist fertig — `GET /api/communities/{slug}/rounds/current`,
`POST …/reveal`, `POST …/guess` stehen, urteilen, vergeben Punkte und summieren Standings —, aber keine
Seite ruft sie auf. Wer heute spielen will, kommt nur über das Game Lab hinein, und das ist ein
Entwicklerwerkzeug hinter zwei Toren, kein Spielerzugang. Diese Scheibe schließt genau diese Lücke, die
[`2026-08-11-round-game-selection-design.md`](2026-08-11-round-game-selection-design.md) unter *Was
bewusst offen bleibt* benennt.

**Nur die laufende Runde.** Das ist keine Verkürzung, sondern die Zusage der Runden-Spec: „Nur die
laufende Runde ist spielbar. Ein Tipp geht nur innerhalb `[start, end)` der Runde; wer sie verpasst, hat
null Punkte dafür. Vergangene Runden sind Anzeige.“ Ein Verlauf vergangener Runden bräuchte einen
Endpunkt, den es nicht gibt, und eine zweite Ansicht — beides gehört in eine eigene Scheibe.

Nicht in dieser Scheibe: die Vorschau-Stufe vor dem Aufdecken (siehe *Der Reveal-Schalter*),
der Verlauf, Zeitwertung.

## Der Reveal-Schalter gehört dem Spiel

Ob eine Runde ein **bewusstes** Aufdecken braucht, ist eine Aussage des Spiels über sich selbst — nicht
eine Regel des Frameworks. Für ein Ratespiel ohne Zeitwertung ist der Klick reine Zeremonie; für ein
Spiel, dessen Reiz an der Reaktionszeit hängt, ist er der Startschuss. Der Vertrag bekommt deshalb:

```kotlin
interface GameType<P : Any> {
    /**
     * Whether this round needs a deliberate reveal before the player may play it.
     *
     * **No default on purpose.** Every game answers it, because the convenient direction is the unsafe
     * one: `false` means the clock starts without the player's consent and a reload costs nothing.
     * (Contrast `revealsOthersBeforeGuess`, which was deleted precisely *because* it had one right
     * answer everywhere — here the answers genuinely differ per game, so the switch earns its place.)
     */
    fun requiresReveal(params: P): Boolean
}
```

**`params`, nicht die Phase.** Die Phase steckt bereits in den Params — `GuessHueParams.toleranceDeg`
zeigt es vor —, und ein Spiel darf die Antwort auch an seinem Inhalt festmachen, nicht nur an der Phase.

**Guess Hue antwortet `false`, in jeder Phase.** Es wertet nicht auf Zeit; ein Refresh bringt dem
Trickser nichts, und ein Klick vor dem Rad wäre eine Hürde ohne Zweck.

Aus der Antwort folgen zwei Verhalten, und sie unterscheiden sich genau in einem Punkt — wie oft
aufgedeckt werden darf:

| | `requiresReveal = false` | `requiresReveal = true` |
|---|---|---|
| Der Spieler sieht | sofort das spielbare Spiel | erst eine Vorher-Karte, dann per Klick das Spiel |
| Die Uhr (`revealed_at`) | läuft mit dem ersten Anzeigen los — reine Statistik | startet mit dem bewussten Klick |
| Zweites Aufdecken | idempotent, `reveal_count` zählt hoch (wie heute) | **409** |

Die „genau einmal“-Regel wird serverseitig durchgesetzt und mit demselben Muster wie „ein Tipp pro
Runde“: `INSERT … ON CONFLICT (round_game_id, user_id) DO NOTHING`, und null betroffene Zeilen heißt
„schon aufgedeckt“. Kein Lesen-dann-Prüfen, damit zwei gleichzeitige Klicks nicht beide durchkommen.
Damit beantwortet diese Scheibe die offene Frage 5 der Anti-Cheat-Spec („harter Lockout oder
idempotent?“) nicht mit einem Entweder-oder, sondern mit **pro Spiel** — und Guess Hue bleibt beim
idempotenten Verhalten, das dort bereits begründet ist.

### Warum es (noch) keine Vorschau-Stufe gibt

Zum bewussten Aufdecken gehört eigentlich, dass der Spieler dabei schon einen Teil des Spiels sieht —
sonst klickt er ins Leere. Das verlangt aber einen Payload **vor** dem Aufdecken, also zwei
Payload-Stufen im Vertrag. Welcher Teil sinnvoll vorab sichtbar ist, weiß nur das Spiel, das ihn
braucht; und das einzige Spiel, das es heute gibt, braucht das Aufdecken überhaupt nicht. Die
Vorher-Karte zeigt deshalb Spielname und Aufforderung, und die Vorschau-Stufe kommt als **Erweiterung
von `present`** mit dem ersten Spiel, das sie verlangt — nicht als Umbau. Ein Konzept für einen
Abnehmer zu erfinden, den es nicht gibt, ist genau der Vorgriff, den diese Spec-Reihe sonst vermeidet.

## Drei Zustände, alle aus der Antwort abgeleitet

Die Karte hält **keinen** eigenen Spielzustand. Was sie zeigt, folgt aus `RoundResponse`:

| Bedingung | Anzeige |
|---|---|
| `requiresReveal && me == null` | Vorher-Karte: Spielname und Aufdeck-Knopf |
| `me != null && me.guessedAt == null` | das spielbare Spiel, aus `payload` |
| `me.guessedAt != null` | Auflösung: `solution`, fremde Tipps, eigene Punkte |

Das ist dieselbe Ableitung, die das Lab schon fährt (`v-if="solution"` → Auflösung, sonst Brett), und
sie hat denselben Grund: ein lokales „habe ich schon getippt“ könnte von der Wahrheit des Servers
abweichen, die Antwort kann es nicht.

**Bei `requiresReveal = false` überspringt die Seite den ersten Zustand.** Sie sieht ein Spiel, sieht
keinen eigenen Eintrag und schickt sofort `POST …/reveal`, dann rendert sie deren Antwort. Ein Request
mehr als nötig — aber `GET` bleibt lesend, `revealed_at` behält **eine** Bedeutung („der Payload ging
raus“), und die Uhr startet, wenn die **Karte** erscheint, nicht wenn irgendein Seitenabruf passiert.
Zieht die Runde später auf eine eigene Route, gilt das unverändert weiter.

**Der Wiederkehrer sieht sofort sein Ergebnis.** Hat der Spieler die Runde schon getippt, liefert der
`GET` bereits `me.guessedAt`, `solution` und `others` — die Ergebniskarte steht ohne Zwischenschritt da.
Kein „nochmal aufdecken“, kein Zwischenzustand.

Trägt die Runde kein Spiel, entscheidet `noGameReason`: `NOT_SCHEDULED`, `BEFORE_WINDOW` und
`AFTER_WINDOW` sind Countdown-Zustände und gehen an das heutige `RoundFallback` (Countdown, „noch kein
Termin“, Gewinner-Meldung). `NO_GAME_TYPE` ist keiner davon und bekommt eine eigene, nüchterne Meldung —
es ist ein Betriebszustand, nicht ein Zeitpunkt.

## Die Karte sitzt, wo der Ersatz schon steht

`webapp-vue/src/pages/c/[slug]/index.vue` rendert heute die Mitgliederzeile und darunter
`RoundFallback` — der Name sagt es: das ist der **Ersatz** für „keine Runde zu zeigen“. Hat die Runde
ein Spiel, steht dort die Spielkarte; sonst wie heute der Countdown. Eine Karte, eine Bühne, keine neue
Navigation, und der Countdown bleibt an genau der Stelle, an der er heute steht.

## Eine Registry für Lab und Runde

`gamelab/games.ts` bildet heute `id → Vue-Komponente` ab. Die echte Runde braucht dieselbe Abbildung,
und zwei Registries wären wieder „zwei Adapter, die auseinanderlaufen“ — dasselbe Argument, mit dem die
Lab-Scheibe gerade `GuessHueLabGame` gelöscht hat. Also **eine** geteilte Registry unter
`src/games/registry.ts`, benutzt von beiden.

Das Lab behält nur, was ihm wirklich gehört: den Anzeigetitel für seine Spielübersicht. Was das Lab
und die Runde teilen, sind die Komponenten (`GuessHueBoard`, `GuessHueReveal`) — dass sie das können,
ist kein Zufall: `GuessHueBoard` nimmt seine Toleranz als Prop und weiß nichts über Phasen, Lab oder
Runde.

## Zwei Felder, die die Antwort zusätzlich tragen muss

**`awardRule` und `awardPoints` auf `RoundResponse`** — wie die Lab-Antwort sie schon hat. Ohne sie kann
die Karte nicht sagen, was die Runden-Spec selbst verlangt: unter `CLOSEST_ONLY` sind die Punkte der
laufenden Runde **vorläufig**, bis die Runde endet. Eine Punktzahl heißt dort „bester Tipp bisher“, und
weil der Einsatz ab Phase 2 mit jeder Runde steigt, wächst mit ihm auch, was man verlieren kann. Das
gehört sichtbar dorthin, wo die Punkte stehen.

**Die Rundennummer am Tipp.** `POST …/guess` wirkt heute auf „die aktuelle Runde“ — was immer der Server
dafür hält. Ein Tab, der über die Tagesgrenze offen bleibt, schickt seinen Tipp dann gegen die **neue**
Runde: geurteilt gegen ein Ziel, das der Spieler nie gesehen hat, mit einer Abweichung, die ihm nichts
sagt. Das ist dieselbe Fehlerklasse wie die Trennung von Urteil und Ablage im Lab, nur über die Zeit
statt über zwei Aufrufe.

Behebung: der Tipp trägt die Rundennummer mit, die der Client aus der Antwort kennt, und der Server
lehnt eine Abweichung mit **409** ab. Der Client holt daraufhin neu und zeigt die Wahrheit, statt einen
Fehler zu behaupten — die neue Runde ist ja eine gute Nachricht, nur eine andere als erwartet.

## Punkte in der Mitgliederzeile

Hier ist fast nichts zu bauen: `MemberRow` hat die Badges für stabile **und** Live-Punkte längst, sie
zeigen heute nur `0`, weil niemand gespielt hat. `MemberPoints.live` ist serverseitig daran gebunden,
dass der Betrachter selbst getippt hat — der Wert erscheint also von sich aus im richtigen Moment.

Was fehlt: **nach einem erfolgreichen Tipp muss der Roster neu geholt werden**, sonst bleibt das Badge
stehen. Und weil unter `CLOSEST_ONLY` ein späterer, besserer Tipp fremde Punkte verschiebt, ist auch der
Roster eines Wiederkehrers frisch zu holen — die Zahlen anderer können sich geändert haben, ohne dass
dieser Spieler etwas getan hat.

## Modul-Schnitt

| Datei | Verantwortung |
|---|---|
| `src/api/rounds.ts` | die drei Aufrufe, neben `communities.ts`/`countdown.ts` |
| `src/api/types.ts` | die Wire-Typen der Runde — **nicht** in `gamelab/types.ts`, das bleibt der wegwerfbare Ordner |
| `src/rounds/useRound.ts` | Laden, Aufdecken, Tippen, die drei Zustände, der 409-Nachzug |
| `src/rounds/RoundCard.vue` | die Karte samt Zustandswahl; rendert die Spielkomponente aus der Registry |
| `src/games/registry.ts` | `id → Komponente`, geteilt mit dem Lab |
| `src/pages/c/[slug]/index.vue` | wählt zwischen `RoundCard` und `RoundFallback` |

Backend: `GameType.requiresReveal`, `GuessHueGameType`s Antwort darauf, das Aufdeck-Statement für den
`true`-Fall, `requiresReveal`/`awardRule`/`awardPoints` in `RoundResponse`, die Rundennummer am Tipp.

## Tests

**Frontend** (Vitest, `vi`, happy-dom): beide Reveal-Zweige über ein gemocktes Flag — der `true`-Zweig
hat heute kein Spiel, das ihn auslöst, und ist genau deshalb nur so prüfbar; die drei Kartenzustände
inklusive Wiederkehrer; der Roster-Nachzug nach dem Tipp; der 409-Pfad einer veralteten Runde, der neu
lädt statt einen Fehler zu zeigen; und die vorläufige Punktzahl unter `CLOSEST_ONLY`.

**Backend**: `requiresReveal` je Phase für Guess Hue; „genau einmal“ mit einem **gefälschten Spieltyp**,
der `true` antwortet (wie `GameCatalogTest` es für den Katalog vormacht) — sonst wäre die Regel
ungetesteter Code; der Rundennummern-Vergleich in beiden Richtungen; und die neuen Antwortfelder unter
der Feldmengen-Disziplin, die diese Spec-Reihe eingeführt hat.

## Was bewusst offen bleibt

- **Die Vorschau-Stufe** vor dem Aufdecken — kommt mit dem ersten Spiel, das ein bewusstes Aufdecken
  verlangt, als Erweiterung von `present`.
- **Der Verlauf vergangener Runden.** Braucht einen Endpunkt über `round_games` je Durchlauf und eine
  eigene Ansicht.
- **Zeitwertung.** `revealed_at` und `guessed_at` liegen richtig; welche RTT-Kompensation es braucht,
  entscheidet erst das Spiel, das darauf wertet.
- **Die Runde auf eigener Route.** Wenn die Community-Seite zu voll wird, zieht die Karte auf
  `/c/[slug]/round` — die Zustandsableitung und der implizite Reveal gelten dort unverändert.

## Feed knowledge back

- **Eine Frage, die je Spiel verschieden beantwortet wird, gehört ins Spiel — eine mit überall derselben
  Antwort ist ein Bug.** `requiresReveal` ist das erste, `revealsOthersBeforeGuess` war das zweite.
  Der Unterschied ist nicht der Mechanismus, sondern ob es echte Varianz gibt.
- **Kein Default, wenn die bequeme Richtung die unsichere ist.** Beim Aufdecken ist `false` bequem und
  lässt die Uhr ohne Zutun laufen; also muss jedes Spiel antworten.
- **Zustand aus der Antwort ableiten, nicht mitschreiben.** Drei Kartenzustände aus `me`/`solution`
  statt aus lokalen Flags: ein lokales „schon getippt“ kann von der Serverwahrheit abweichen, die
  Antwort kann es nicht.
- **Wer eine Runde adressiert, muss sagen welche.** „Die aktuelle“ ist über die Tagesgrenze hinweg
  nicht dasselbe für Client und Server; die Nummer mitzuschicken kostet ein Feld und verhindert ein
  Urteil gegen ein nie gesehenes Ziel.
