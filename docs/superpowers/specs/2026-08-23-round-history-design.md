# Runden-History — „Abgeschlossene Runden“ unter der laufenden

**Status:** beschlossenes Design (2026-08-23).

**Baut auf:** dem [Runden-Framework](2026-08-11-round-game-selection-design.md), dem
[Runden-Frontend](2026-08-14-round-frontend-design.md), der
[mobilen Spielbühne](2026-08-21-mobile-round-surface-design.md) und
[Song Snippet](2026-08-20-song-snippet-design.md) — dem ersten Spiel mit gespeicherten Bytes, deren
Lebenszyklus dieses Design umdreht.
**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md) — hier wird zum ersten Mal ein Gate
*geöffnet*, und die Begründung dafür muss so scharf sein wie die Begründungen der geschlossenen.

**Berührt:** im Backend das Modul `game` — `CurrentRound` wird zu `ResolvedRound`, neu ist ein
`HistoryService`, `RoundResponses` bekommt ein zweites Sichtbarkeitsargument, `RoundController` eine
Rundennummer als Pfadsegment, `AnnouncementService` verliert seinen Asset-Aufräumer. Im Frontend
`api/rounds.ts`, `api/types.ts`, `rounds/RoundCard.vue`, neu `rounds/useRoundHistory.ts`,
`rounds/RoundHistory.vue`, `ui/LabelledDivider.vue`, und die Community-Startseite. Keine Migration.

## Zweck

Die Community-Seite zeigt heute genau eine Runde: die laufende, oder den Fallback, wenn keine läuft.
Wer die App einmal am Tag öffnet, um zu spielen, sieht am nächsten Tag die nächste Runde — und hat
keine Möglichkeit mehr, das Ergebnis der Runde von gestern nachzulesen. Die Auflösung, die fremden
Tipps, die Punkteverteilung: alles war einen Tag lang sichtbar und ist dann weg.

Das ist die Lücke. Unter der laufenden Runde hängt ab jetzt die **vorherige** Runde — dieselbe
Reveal-UI, die man gestern gesehen hätte, wenn man geraten hat — und darunter, auf Knopfdruck, die
Runde davor, und so weiter bis zum Anfang des Laufs.

Zwei Dinge fallen dabei mit an, weil sie sonst sofort im Weg stehen: der Countdown im Kopfband einer
abgeschlossenen Runde wäre eine Uhr, die immer `00:00:00` zeigt, und das Song-Audio einer vergangenen
Runde wird heute beim Materialisieren der nächsten gelöscht.

## Die Entscheidungen

### Eine Runde ist eine Adresse, nicht ein Zeitpunkt

`CurrentRound` heißt ab jetzt `ResolvedRound`: der Typ beschreibt „eine aufgelöste Runde dieser
Community“, und die laufende ist nur der häufigste Fall davon. Drei Werte wandern auf das Interface,
weil beide Auflösungspfade sie brauchen und beide sie zum selben Zeitpunkt kennen — vor der Runde:

- `edition: CommunityEdition?` — der Lauf. `null` nur, wenn es keinen gibt; `Announced` überschreibt
  non-null. Dieselbe Begründung, die `communityId` schon auf dem Interface hat.
- `round: Round?` — `Announced` überschreibt non-null.
- `previousRoundNumber: Int?` — der Zeiger in die Vergangenheit (siehe unten).

`Announced` bekommt zusätzlich `closed: Boolean`. Das ist **kein** Schalter, dessen richtige Antwort
überall dieselbe wäre — die Sorte, die `game-rounds.md` als Bug ausweist — sondern eine am
Konstruktor festgeschriebene Tatsache: der Announce-Pfad setzt immer `false`, der History-Pfad immer
`true`. Es gibt keine Stelle, an der jemand die Antwort pro Fall abwägen müsste.

Dass der Typ jetzt beides trägt, ist der Kern: `RoundResponses` bleibt der **eine** Ort, an dem die
Gates leben, und `AnnouncementService.resolve` bleibt der **eine** Ort mit dem Mitgliedschafts-Gate.
Ein zweiter Renderer oder ein zweites Gate wären genau die Verdopplung, gegen die `CurrentRound`
ursprünglich eingeführt wurde.

### Eine abgeschlossene Runde ist offen — für alle

Die Gates von heute hängen an „hat der Viewer geraten“. Bei einer abgeschlossenen Runde schützen sie
nichts mehr: nur die laufende Runde ist spielbar, wer eine vergangene verpasst hat, hat null Punkte
dafür und kann sie nicht nachholen. Also fällt das Gate weg, und zwar für jedes Mitglied — auch für
eines, das die Runde damals nie aufgedeckt hat. Sonst hätte genau der Nutzer, der einen Tag
ausgesetzt hat, eine Lücke in seiner History, und die History existiert für ihn.

Aus `hasGuessed` wird `open = hasGuessed || closed`:

| Feld | laufende Runde | abgeschlossene Runde |
| --- | --- | --- |
| `payload` | nur mit eigener Spielzeile | immer |
| `solution` | nur nach eigenem Tipp | immer |
| `others` | nur nach eigenem Tipp | immer |
| `me` | eigene Zeile oder `null` | unverändert |

Was **nicht** aufgeht: aufgedeckt-aber-nie-geraten bleibt aus `others` draußen. Diese Zeilen sagen,
*wer geschaut hat*, und das ist eine Information über Personen, nicht über die Runde — daran ändert
das Ende der Runde nichts. `others` enthält also weiter nur beendete Tipps, und der Filter dafür ist
unverändert `guessedAt != null`.

Die eigene Zeile ist von der Regel nicht betroffen: wer damals aufgedeckt und nie geraten hat, findet
seine Zeile in `me`, mit `guessedAt: null`, wie heute.

Nebenwirkung, die getragen wird: bei Song Snippet vermeidet der Zug Tracks aus `previousParams`, und
wer die History liest, kennt diese Tracks jetzt vollständig. Der Vorteil daraus ist ein winziges
Ausschlussverfahren über einen Pool von Hunderten — und er stand jedem offen, der jede Runde
gespielt hat. Kein Grund, die History dafür zu verschließen.

### Ein Zeiger statt einer Seite

Der Client braucht zwei Antworten: „welche Runde kommt als nächste älter?“ und „gibt es überhaupt
noch eine?“ — die zweite *bevor* er klickt, denn der Button verschwindet am Ende und wird durch einen
Hinweis ersetzt. Beide beantwortet ein Feld auf jeder Runden-Antwort:

```kotlin
val previousRoundNumber: Int?
```

„Vorherige Runde“ heißt `round_number > n`, wie überall in diesem Projekt: eine größere Nummer ist
früher. Der Wert ist die **kleinste angekündigte** Rundennummer oberhalb von `n`, innerhalb des
Spielfensters — oder `null` für „ganz am Anfang angekommen“.

Warum das und keine Paginierung: es gibt keine Seitengröße zu erfinden, keinen zweiten Response-Typ,
keine Merge-Logik im Client. Und Lücken lösen sich von selbst auf — an einem Tag, an dem niemand die
App geöffnet hat, wurde nie eine Runde angekündigt, also gibt es keine Zeile, und `MIN` überspringt
sie, ohne dass irgendwer sie zählen muss.

Ein Request pro Klick ist der Preis. Bei „eine Runde pro Klick“ ist das exakt ein Request pro
Nutzeraktion, also nichts, was man optimieren müsste.

### Die laufende Runde ist tabu

`GET /rounds/{roundNumber}` nimmt ausschließlich Runden, die **strikt älter** als die laufende sind.
Das ist keine Aufräum-Regel, sondern die Sicherheitszeile des ganzen Designs: ohne sie wäre der
Endpunkt ein zweiter Weg an die Lösung der laufenden Runde, an dem `present()`/`solution()` und ihre
Feldmengen-Tests vorbeilaufen. Alles andere — die laufende Nummer, jede jüngere, eine nie
angekündigte, eine aus dem Fenster gefallene — ist 404.

### Ein Asset-Endpunkt, zwei Gates

Aus `/rounds/current/assets/{roundNumber}/{key}` wird `/rounds/{roundNumber}/assets/{key}`. Die
Rundennummer stand schon in der URL; `current` war das Segment, das jetzt zur Lüge würde.

Ein Endpunkt, eine Verzweigung an der Nummer:

- **laufende Runde** — das Stufen-Gate von heute, unverändert: eigene Spielzeile nötig,
  `key <= stage`, `99` erst mit verbrauchtem Tipp.
- **ältere Runde** — offen. Eine Runde, die niemand mehr spielen kann, hat nichts zu verbergen, und
  ihr Reveal zeigt die Lösung ohnehin. Keine Spielzeile nötig: wer damals nicht dabei war, darf sich
  den Song trotzdem anhören.

Der Asset-Pfad verlässt dabei `PlayService.playable()`. Der erzwingt `isSuperAdmin = false`, und die
Begründung dafür steht dort ausdrücklich: der Bypass existiert, damit ein Admin *schauen* darf, ohne
beizutreten — „a read“. Assets holen ist ein Read. Der Endpunkt löst also mit dem Flag des Aufrufers
auf, wie die Ankündigung. Folge: ein Super-Admin ohne Mitgliedschaft bekommt beim Asset der
*laufenden* Runde jetzt 409 (keine Spielzeile) statt 404 (keine Mitgliedschaft). Niemand hängt an dem
Statuscode, und die neue Antwort ist die ehrlichere.

Die Verzweigung selbst bleibt in `PlayService.asset`: es löst die laufende Runde einmal auf,
vergleicht die Nummer und gibt den abgeschlossenen Fall an `HistoryService.resolve(current, n)` ab.
Damit gibt es weiter genau eine Stelle, die entscheidet, wer welche Bytes bekommen darf.

Wichtig für den After-Window-Fall: die Verzweigung hängt an `round.number` der aufgelösten Runde,
nicht daran, ob sie ein Spiel trägt. Sonst wären am Tag, an dem das Spielfenster schließt, alle
Reveal-Clips der History unerreichbar.

### Die History hängt auch unter dem Fallback

Sobald der Lauf ein Startdatum hat, hängt die History unter der aktuellen Karte — egal ob das die
Spielkarte oder der Fallback ist. Nach dem Event (`AFTER_WINDOW`) ist Zurückschauen der einzige
Grund, die Seite noch zu öffnen; würde die History dort fehlen, wäre sie genau dann verschwunden,
wenn sie am meisten wert ist. Kein Startdatum heißt kein Raster heißt keine History.

### Runden außerhalb des Fensters tauchen nicht auf

Verkleinert ein Admin das Spielfenster nachträglich, fallen angekündigte Runden heraus. Die Wertung
summiert sie schon heute nicht (`windowReasonOf`, dieselbe Funktion für Ankündigung und Standings).
Die History zeigt sie ebenfalls nicht — sonst stünde in der History eine Runde mit Punkten, die in
keiner Summe vorkommen.

Nach oben begrenzt das nur `gamesFromRound`: älter heißt größere Nummer, und `gamesUntilRound` grenzt
die *jüngere* Seite ab. Der Zeiger braucht deshalb genau eine Grenze.

### Die Karte bekommt eine Prop, keinen Zwilling

`RoundCard` bekommt `closed?: boolean`, statt daneben eine `HistoryRoundCard` zu stellen. Der Auftrag
lautet „dieselbe Reveal-UI“, und das heißt: Bühne, Kopfband, Renderer-Auflösung und der `key` auf der
Rundennummer müssen *dieselbe* Stelle bleiben. Zwei Karten wären zwei Stellen, an denen das
auseinanderlaufen kann — und die Liste der Dinge, die dort schon subtil begründet sind (der `key`
gegen überlebende Spielstände, der Unrenderbar-Zweig *vor* dem Stage-Zweig), ist genau die Liste, die
eine Kopie falsch bekommt.

Eine Prop, drei Wirkungen an einem Ort: die Karte zeigt das Reveal-Gesicht, das Kopfband bekommt
`endsAt: null` — die Uhr verschwindet und es tritt nichts an ihre Stelle —, und es wird keine
Aktionsfläche gerendert. `stage` und die vier Callbacks werden dadurch optional: eine abgeschlossene
Runde hat keine.

## Die Bausteine — Backend

### `ResolvedRound.kt` (ersetzt `CurrentRound.kt`)

```kotlin
sealed interface ResolvedRound {
    val communityId: UUID
    val edition: CommunityEdition?
    val round: Round?
    val previousRoundNumber: Int?

    data class NoGame(
        override val communityId: UUID,
        override val edition: CommunityEdition?,
        override val round: Round?,
        override val previousRoundNumber: Int?,
        val reason: NoGameReason,
    ) : ResolvedRound

    data class Announced(
        override val communityId: UUID,
        override val edition: CommunityEdition,
        override val round: Round,
        override val previousRoundNumber: Int?,
        val roundGame: RoundGame,
        val handle: GameTypeHandle<*>,
        val closed: Boolean,
    ) : ResolvedRound
}
```

### `AnnouncementService`

`resolve` füllt die neuen Felder auf allen Rückgabepfaden und setzt `closed = false`. Für die beiden
NOT_SCHEDULED-Fälle bleibt `previousRoundNumber` `null` — ohne Raster gibt es keine Runde, zu der
eine andere die vorherige wäre. Für Fenster- und NO_GAME_TYPE-Antworten wird der Zeiger berechnet,
weil die History auch unter dem Fallback hängt.

`releaseEarlierRounds` und sein Aufruf fallen weg (siehe Asset-Lebenszyklus).

### `HistoryService` (neu)

```kotlin
@Transactional
fun pastRound(slug: String, userId: UUID, isSuperAdmin: Boolean, roundNumber: Int): RoundResponse

/** Löst [roundNumber] gegen eine bereits aufgelöste laufende Runde auf. */
fun resolve(current: ResolvedRound, roundNumber: Int): ResolvedRound
```

`pastRound` ruft `announcements.resolve(...)` — das liefert Gate, Lauf und laufende Rundennummer in
einem Aufruf und ist damit der Grund, warum hier keine Gate-Zeile dupliziert wird — und rendert dann
über `responses.of(...)`.

`resolve` nimmt die schon aufgelöste laufende Runde als Parameter, damit der Asset-Pfad nicht doppelt
auflöst. Der Ablauf:

1. `edition` und `round.number` müssen da sein, sonst `RoundNotFoundException`.
2. `roundNumber <= current.round.number` → `RoundNotFoundException`.
3. `windowReasonOf(edition, roundNumber) != null` → `RoundNotFoundException`.
4. `store.find(edition, roundNumber)` fehlt → `RoundNotFoundException`.
5. `engine.intervalOf(roundNumber, edition.startsAt, zone)` liefert `[start, end)` der alten Runde.
6. `catalog.handle(roundGame.gameType)` fehlt → `NoGame(NO_GAME_TYPE)` mit Runde und Zeiger, **nicht**
   404: die History soll eine Lücke nicht verschweigen, und die Kette läuft über sie hinweg weiter.
7. sonst `Announced(closed = true)`.

`RoundNotFoundException` ist neu und wird im bestehenden `GameExceptionHandler.notFound` auf 404
gemappt.

### `RoundGameStore` / `RoundGameRepository`

```sql
SELECT MIN(round_number) FROM game.round_games
WHERE edition_id = :editionId AND round_number > :after AND round_number <= :notOlderThan
```

`notOlderThan = edition.gamesFromRound ?: Int.MAX_VALUE`. `MIN` über die leere Menge ist `NULL`, und
das ist „ganz am Anfang“ — kein zweiter Query, kein `COUNT`, kein Flag.

`roundIdsExcept` / `idsOfOtherRounds` fallen weg: „alle außer der laufenden“ ist die Announce-Zeit-
Semantik, die verschwindet.

### `RoundResponses`

`open = hasGuessed || closed` steuert `payload`, `solution` und `others` wie in der Tabelle oben.
`previousRoundNumber` wird von `ResolvedRound` durchgereicht — das ist der Grund, warum es dort
liegt und nicht als Parameter durch alle sechs Aufrufstellen wandert.

### `RoundController`

```
GET  /api/communities/{slug}/rounds/current                     (unverändert)
POST /api/communities/{slug}/rounds/current/{reveal,guess,skip,give-up}   (unverändert)
GET  /api/communities/{slug}/rounds/{roundNumber}                (neu)
GET  /api/communities/{slug}/rounds/{roundNumber}/assets/{key}   (ersetzt /current/assets/...)
```

Spring bevorzugt das Literal `/current` vor dem Template `/{roundNumber}`; mit dem Umzug der Assets
gibt es außerdem kein `/current/assets/...` mehr, das mit `/{roundNumber}/assets/...` konkurrieren
könnte.

### `RoundResponse` (DTO)

Ein Feld mehr: `previousRoundNumber: Int?`. Die Feldmengen-Tests der Spiele hängen an `GamePayload`
und `GameSolution`, nicht an der Hülle — sie sind nicht betroffen. Die Labor-Antwort ist ein eigener
Typ und bleibt unberührt.

## Die Bausteine — Frontend

### `api/rounds.ts`, `api/types.ts`

`getRound(slug, roundNumber)`; `roundAssetUrl` behält seine Signatur und wechselt nur den Pfad, also
bleibt die bestehende Closure auf der Seite unverändert. `RoundResponse` bekommt
`previousRoundNumber: number | null`.

### `rounds/useRoundHistory.ts` (neu)

```ts
useRoundHistory(slug: string, from: Ref<number | null>): {
  items: Ref<RoundResponse[]>
  busy: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
  canLoadMore: ComputedRef<boolean>
  loadMore: () => Promise<void>
}
```

`from` ist `previousRoundNumber` der laufenden Antwort. Die nächste zu ladende Nummer wird abgeleitet,
nie gespeichert: leere Liste → `from`, sonst `previousRoundNumber` des letzten Eintrags. `null` heißt
Ende, und `canLoadMore` ist genau das.

`loadMore` läuft durch **`useAction`**. Das liefert `busy` für den Button, verschluckt den
Doppelklick — ein zweiter `run` während eines laufenden wird verworfen, nicht angehängt — und räumt
`busy` im `finally` auf, sodass ein Fehler den Button nicht für immer sperrt.

Der erste Eintrag lädt von selbst: `watch(from, …, { immediate: true })`, dieselbe Funktion, kein
zweiter Pfad. Wechselt `from`, wird die Liste verworfen und neu aufgebaut — das ist der Fall
„Tagesgrenze unter offenem Tab“, in dem `useRound` nach einem 409 eine andere Runde nachgeladen hat
und die History sonst an der falschen Stelle hängen würde.

### `rounds/RoundCard.vue`

`closed?: boolean` (Default `false`); `stage`, `busy`, `notice` und die vier Callbacks werden
optional — eine abgeschlossene Runde hat weder ein Gesicht zu wählen noch eine Aktion in Flug noch
einen fehlgeschlagenen Versuch zu melden. Intern:
`face = closed ? 'done' : (stage ?? 'no-game')`, `endsAt = closed ? null : round?.round?.end ?? null`,
`disabled = closed || busy || face === 'done'`.

### `ui/LabelledDivider.vue` (neu)

Der Trenner aus `huettehuette`s `GamesHistory.vue`, auf die Palette dieses Projekts gebracht (kein
Dark-Mode — den gibt es hier nicht): zwei `grow border-t`, dazwischen das Label im Default-Slot, die
Linien `aria-hidden`. Rein präsentativ; beide Beschriftungen benutzen ihn.

### `rounds/RoundHistory.vue` (neu)

Rendert **nichts**, solange `from === null`: keine History, kein Trenner, kein Hinweis. Sonst der
Trenner „Abgeschlossene Runden“, die Karten mit `closed`, und darunter entweder
`<ActionButton :busy>Weiter zurück</ActionButton>` mittig oder — wenn `canLoadMore` falsch ist — der
Abschluss-Trenner „Du bist ganz am Anfang angekommen“.

Props: `slug: string` und `from: number | null`. Die Karten sind auf `round.number` gekeyt — dieselbe
Größe, auf die `RoundCard` intern den Spiel-Renderer keyt.

Die `assetUrl`-Closure entsteht pro Eintrag inline. Unkritisch: `SongPlayerReveal` ruft sie nur im
Click-Handler auf, kein Watcher hängt an ihrer Identität.

### `pages/c/[slug]/index.vue`

Das Segment hängt unter Karte *und* Fallback, sobald `roundState === 'ready'`, mit
`:from="round?.previousRoundNumber ?? null"`.

## Asset-Lebenszyklus

`AnnouncementService.releaseEarlierRounds` und sein Aufruf im Materialisieren fallen weg. Die
Reveal-UI einer vergangenen Runde spielt ihr Audio, also darf es nicht beim Ankündigen der nächsten
Runde verschwinden.

Stehen bleiben `GameType.releaseAssets`, `GameCatalog.releaseAssets` und
`SongSnippetAudioStore.release` — die Naht, an die der Archivierungs-Hook später andockt. Bewusst
kein Aufrufer heute: „wann darf das weg“ ist eine Frage über Editionen, und die wird beim Archivieren
beantwortet, nicht hier.

Zwei Folgen:

- **Der Speicher wächst innerhalb eines Laufs unbegrenzt.** Fünf Stufen (0,1 / 0,5 / 2 / 8 / 15 s)
  plus 30-s-Auflösung sind grob ein paar hundert KB pro Runde, also einige zehn MB pro Community und
  Lauf. Tragbar, aber es ist keine Obergrenze mehr, sondern eine Wachstumsrate.
- **Der Kommentar in `V1__create_round_audio.sql`** („Lifecycle is owned by releaseAssets
  (announce-time cleanup)“) wird falsch und **darf nicht angefasst werden**: eine angewandte
  Migration zu editieren bricht die Flyway-Checksumme. Die Korrektur gehört nach `game-rounds.md`.

## Fallen

### Der Zeiger darf nicht am Spiel hängen

`MIN(round_number)` kennt den Katalog nicht. Eine alte Runde mit einem Spieltyp, den dieser Build
nicht hat, bleibt deshalb in der Kette — und muss als Karte mit `game: null` sichtbar bleiben, sonst
endet die History für alle Nutzer dieses Builds an dieser Runde.

### `previousRoundNumber` muss auch auf den Aktions-Antworten stehen

`reveal`/`guess`/`skip`/`give-up` ersetzen im Frontend die ganze Antwort. Fehlte das Feld dort, wäre
die History nach dem ersten Tipp verschwunden. Genau darum liegt der Zeiger auf `ResolvedRound` und
nicht als Parameter an `RoundResponses.of` — es gibt keine Aufrufstelle, die ihn vergessen kann.

### Die Reveal-Choreografie darf nicht nachträglich abspielen

Guess Hue spielt sein Reveal nur bei einem echten `null → non-null`-Übergang von `solution`; ein
Instanz, die schon aufgelöst montiert, startet `false` und bleibt dort. History-Karten montieren
immer schon aufgelöst — also passiert von selbst das Richtige. Ein `immediate: true` an jenem
`watch` würde es kaputt machen.

### Der erste History-Eintrag lädt nach dem Trenner

Zwischen „`from` ist bekannt“ und „der erste Eintrag ist da“ steht der Trenner mit einem laufenden
Button darunter. Bewusst kein Platzhalter wie bei der laufenden Karte: das Segment liegt unter dem
Falz, ein Sprung dort kostet nichts, und ein reservierter Kartenrahmen ohne Inhalt behauptet eine
Runde, die es vielleicht nicht gibt.

## Tests

**Backend (MockMvc + Testcontainers):**

- Eine abgeschlossene Runde liefert `payload`, `solution` und alle beendeten Tipps an ein Mitglied,
  das damals nie aufgedeckt hat.
- Aufgedeckt-aber-nie-geraten bleibt aus `others` einer abgeschlossenen Runde draußen.
- Die laufende Nummer und jede jüngere → 404. Eine nie angekündigte Runde → 404. Eine aus dem
  Fenster gefallene → 404.
- Ein Nicht-Mitglied → 404 (`RoundAccessDeniedException`, Mitgliedschaft leakt nicht).
- `previousRoundNumber` verkettet drei angekündigte Runden und endet auf `null`; eine Lücke in den
  Rundennummern wird übersprungen.
- Assets: Lösungs-Clip einer alten Runde ohne eigene Spielzeile → 200; Stufen-Gate der laufenden
  Runde unverändert (`key > stage` → 403, `99` vor dem Tipp → 403).
- Assets einer alten Runde bleiben nach Fensterschluss erreichbar.
- `RoundAssetGateTest` („an unfilled key inside the allowed range is a 404, a foreign round a 409“)
  spaltet sich: eine *ältere* fremde Runde ist jetzt 200, eine *jüngere* 404. Das 409 verschwindet,
  weil die Rundennummer nicht mehr gegen „die laufende“ geprüft, sondern in ihr eigenes Gate geleitet
  wird.
- `AnnouncementMaterialisedHookTest` dreht seine Cleanup-Zusicherung um: Materialisieren lässt die
  Assets früherer Runden in Ruhe.

**Frontend (Vitest):**

- `useRoundHistory`: Erstladung bei bekanntem `from`, Kette über `loadMore`, Ende bei `null`, Reset
  bei Wechsel von `from`, Fehlerfall lässt die Liste stehen, zweiter Klick während eines Ladevorgangs
  wird verworfen.
- `RoundHistory`: Label des Trenners, Button verschwindet am Ende und der Hinweis erscheint, nichts
  gerendert bei `from === null`.
- `RoundCard`: `closed` blendet die Uhr aus, zeigt das Reveal-Gesicht und rendert keine Aktion.

## Verworfen

**Ein History-Endpunkt mit Seite** (`?before=n&limit=k` → Liste plus `hasMore`). Ein Request pro
Klick statt einem pro Runde, aber der Preis ist eine erfundene Seitengröße, ein zweiter Response-Typ
und Merge-Logik im Client. Mit `limit=1` ist es das gewählte Design mit Zeremonie.

**Der Client probiert Nummern** und liest 404 als Ende. Kein neues Feld — aber Lücken sehen aus wie
das Ende der History, und „gibt es noch was?“ wäre nur durch einen fehlgeschlagenen Request
beantwortbar, der Button würde flackern.

**Reveal nur für die, die damals gespielt haben.** Hätte das bestehende Gate unverändert gelassen —
und genau dem Nutzer, für den die History gebaut wird, eine leere Stelle in seine History gesetzt.

**Eine eigene `HistoryRoundCard`.** Zwei Stellen, an denen „dieselbe Reveal-UI“ auseinanderlaufen
kann.

**Zwei Asset-URLs** (die alte für die laufende Runde, eine neue für die History). Hätte die eine
Verzweigung im Gate gespart und dafür zwei URLs für dieselbe Ressource eingeführt.

## Bewusst verschoben

- **Der Archivierungs-Hook**, der die Assets eines abgeschlossenen Laufs freigibt. Die Naht steht,
  der Aufrufer nicht.
- **Ein Sprung zu einer bestimmten Runde** (Deep-Link, Datumsauswahl). Der Endpunkt kann es schon;
  eine UI dafür fordert niemand.
- **Runden aus früheren Läufen.** Die History endet am Anfang des aktiven Laufs, weil alles, was an
  einer Runde hängt, an `edition_id` hängt.
