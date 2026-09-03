# Die Runde und ihr Spiel — Datenmodell

**Status:** beschlossenes Design (2026-08-11).

**Baut auf:** [Countdown Engine + Display](2026-06-14-countdown-engine-display-design.md) (die
abgeleitete Rundennummer), [Anti-Cheat](2026-08-02-anti-cheat-design.md) (das Fundament und die
Randbedingungen), [Cross-Runtime-RNG](2026-08-02-cross-runtime-rng-design.md) (`SeededRandom`),
[Guess-Hue-Datenset](2026-08-07-guess-hue-dataset-design.md) (der einzige heutige Spielinhalt),
[Game-Lab](2026-08-08-game-lab-design.md) (die Probe-Form, die hier abgelöst wird).

**Beantwortet** die offenen Fragen 5, 7 und 8 der Anti-Cheat-Spec und **revidiert** deren Punkt 1 —
siehe *Was hier revidiert wird*.

**Ersetzt** aus `huettehuette.unividuell.org` den Ablauf, bei dem ein Admin vorab je Runde ein Spiel
setzte und dafür vorab einen Pool von Spielen je Typ pflegte. Beides entfällt vollständig: der
**wiederkehrende** Aufwand pro Runde geht auf null, wie die Anti-Cheat-Randbedingung es fordert.

Was damit **nicht** gesagt ist: dass ein Admin nie etwas bereitstellt. Es wird Spiele geben, die auf
**community-eigenen Bildern** aufbauen — die muss jemand einstellen, einmal je Community und Spieltyp.
Das ist genau der Aufwand, den die Randbedingung erlaubt („einmalig je Spieltyp ist erlaubt, je Runde
nicht“). Für Guess Hue ist der Aufwand tatsächlich null; die Auswahl ist deshalb so gebaut, dass ein
Spieltyp später **ausfallen** kann, weil eine Community ihn nicht bestückt hat — siehe *Die Auswahl ist
eine reine Funktion*.

## Scope

Das **Datenmodell** rund um die Runde einer Community: wie eine Runde zu ihrem Spiel kommt, wie
diese Wahl unverrückbar wird, wo der Tipp liegt und woraus der Punktestand entsteht.

Nicht in dieser Spec: die Anzeige vergangener Runden, ein Admin-UI für Spielfenster und Durchläufe,
Zeitwertung, Commit-Reveal, Anomalie-Erkennung. Alles davon ist mit diesem Modell später möglich,
nichts davon wird hier vorweggenommen.

## Die dritte Koordinate: der Durchlauf

Runden sind heute rein abgeleitet — `CountdownEngine.roundAt(now, startsAt, zone)`, keine Zeile in
der DB. Sobald eine Runde etwas *trägt*, braucht sie einen Schlüssel, und `(community, T-58)` ist
keiner: **das Ziel-Event wiederholt sich.** Eine Community zählt jedes Jahr auf dasselbe Wochenende
herunter, manchmal mehrfach im Jahr; jedes Mal gibt es ein T-58, mit anderen Tipps und anderer
Rangliste. Ein wanderndes `startsAt` verschiebt außerdem das gesamte Rundengitter unter bereits
gespielten Runden weg.

Deshalb bekommt die Community **Durchläufe**. Ein Durchlauf trägt das Ziel-Datum und alles, was am
Gitter hängt; genau einer ist aktiv. Ein neues Datum für ein wiederkehrendes Event heißt: neuer
Durchlauf, alter archiviert und lesbar. Die Mitgliedschaft bleibt, wo sie ist — an der Community.

## Datenmodell

### `community.editions`

Die drei heutigen Spalten `starts_at`, `starts_at_timezone` und `phase_two_start_round` **wandern
von `communities` hierher**; eine Community ohne Durchlauf gibt es nach der Migration nicht.

| Spalte | Typ | Bemerkung |
|---|---|---|
| `id` | UUID PK | Postgres-generierte v7 |
| `community_id` | UUID NOT NULL → `community.communities` | |
| `label` | TEXT NOT NULL | z. B. „Hüttenwochenende 2026“ |
| `starts_at` | TIMESTAMPTZ NULL | NULL = Termin noch nicht gesetzt |
| `starts_at_timezone` | TEXT NOT NULL | Default `Europe/Berlin` |
| `phase_two_start_round` | INT NULL | Schwelle, ab der Phase 2 gilt |
| `games_from_round` | INT NULL | erste Spielrunde; NULL = ab der ersten Runde |
| `games_until_round` | INT NOT NULL | letzte Spielrunde; Default `0` |
| `archived_at` | TIMESTAMPTZ NULL | NULL = aktiv |
| `created_at` / `updated_at` | | Auditing wie überall |

```sql
CREATE UNIQUE INDEX idx_editions_one_active_per_community
    ON community.editions (community_id) WHERE archived_at IS NULL;
```

Das Fenster heißt bewusst nicht start/end: weil eine **größere** Rundennummer **früher** in der Zeit
liegt, verwechselt „Start-Runde = 24, End-Runde = 0“ jeder Leser mindestens einmal. `from`/`until`
sind zeitliche Wörter und lesen sich richtig. Das Fenster ist beidseitig inklusiv:

```
games_until_round ≤ round.number ≤ games_from_round
```

Validierung: `games_from_round >= games_until_round`, wenn beide gesetzt sind. `games_until_round`
darf negativ sein — das sind Runden nach dem Start-Termin, und die will ein Sommerfest vielleicht.

Die Migration legt für jede bestehende Community **genau einen aktiven Durchlauf** an, übernimmt die
drei Spalten unverändert und setzt `label` auf den **Community-Namen** (die bestehenden Communities
sind alle Erstläufe), `games_from_round` auf `NULL` und `games_until_round` auf `0`. Danach fallen
die drei Spalten aus `communities`.

Das ist ein `INSERT … SELECT` und ein `DROP COLUMN` — vier Zeilen, keine Transformation, kein
Datenrisiko. Erwogen und **verworfen**: `community/V1` neu schreiben, sodass `editions` dort schon
steht, und die DBs wegwerfen — produktiv ist noch nichts. Es spart genau diese vier Zeilen, während
der eigentliche Aufwand (neun Backend-Dateien plus Tests; das Frontend bleibt unberührt, weil
`CommunityResponse` **nur wächst**, also kein Feld verliert oder umbenennt) davon
unberührt ist. **Staging läuft**, ein geändertes `V1`
heißt dort Flyway-Checksum-Mismatch, und wer das Wipe vergisst, sucht einen Boot-Fehler, der wie ein
Bug aussieht. Ein Wegwerfen lohnt sich, wenn eine Migration Daten *interpretieren* müsste — Defaults
raten, Duplikate auflösen. Diese nicht.

### `game.round_games` — die Ansage

| Spalte | Typ | Bemerkung |
|---|---|---|
| `id` | UUID PK | |
| `edition_id` | UUID NOT NULL → `community.editions` | Cross-Schema-FK |
| `round_number` | INT NOT NULL | |
| `game_type` | TEXT NOT NULL | die `GameType.id`, z. B. `guess-hue` |
| `params` | JSONB NOT NULL | die eingefrorene Ziehung — **enthält die Lösung** |
| `award_rule` | TEXT NOT NULL | `ALL_QUALIFYING` \| `CLOSEST_ONLY`, siehe *Punkte* |
| `award_points` | INT NOT NULL | wie viele Punkte die Regel vergibt |
| `announced_at` | TIMESTAMPTZ NOT NULL | |

`UNIQUE (edition_id, round_number)`.

**`params JSONB` braucht einen Converter, und zwar genau einen Haken:** eine
`AbstractJdbcConfiguration`-Unterklasse, die `userConverters()` überschreibt (`JsonNode ↔ PGobject`).
Nicht `jdbcCustomConversions()` überschreiben — das setzt die Conversions des Dialekts mit außer Kraft.
Die Unterklasse ersetzt Boots `SpringBootJdbcConfiguration` (`@ConditionalOnMissingBean`), muss deshalb
im Root-Package liegen, damit `getMappingBasePackages()` alle Entities erfasst. Das Feld ist ein
`JsonNode`, kein `String`: ein String-Converter würde jede Textspalte jeder Entity treffen.

**Keine Zeile heißt „kein Spiel“.** Kein `game_type = NULL`, kein Marker-Datensatz. Eine Runde, die
niemand geöffnet hat, hat kein Spiel gehabt — das ist wahr und kostet nichts. Erst wenn ein Admin je
Runde spielfrei stellen soll, kommt die Nullable-Variante, und dann bewusst.

Der Cross-Schema-FK ist erlaubt, weil `game` in **Code** von `community` abhängt; Modulith ordnet
die Flyway-Läufe nach der Modul-Abhängigkeit (siehe
[modules-and-migrations.md](../../../.claude/guidelines/modules-and-migrations.md)).

Der Unique-Index ist die einzige Stelle, an der dieses Modell „ein Spiel pro Tag“ annimmt. Die
[countdown-Guideline](../../../.claude/guidelines/countdown.md) hält für später Fast Rounds fest
(`T{major}.{minor}`, mehrere Spiele an einem Tag). Der Weg dorthin ist eine Spalte `round_minor INT
NOT NULL DEFAULT 1` und ein erweiterter Index — nichts an dieser Spec steht dem im Weg, und nichts
davon wird jetzt gebaut.

### `game.round_plays` — Uhr, Tipp und Punkte

Eine Zeile pro (Runde, Spieler), angelegt beim **ersten Aufdecken** — nicht erst beim Tipp.

| Spalte | Typ | Bemerkung |
|---|---|---|
| `id` | UUID PK | |
| `round_game_id` | UUID NOT NULL → `game.round_games` | |
| `user_id` | UUID NOT NULL → `iam.users` | |
| `revealed_at` | TIMESTAMPTZ NOT NULL | die Uhr; wird **nie** zurückgesetzt |
| `reveal_count` | INT NOT NULL DEFAULT 1 | Signal, siehe *Aufdecken* |
| `guess` | JSONB NULL | NULL = noch nicht getippt |
| `guessed_at` | TIMESTAMPTZ NULL | der Server stempelt, nie der Client |
| `qualifies` | BOOLEAN NULL | punkte-berechtigt — das Urteil des Spiels |
| `deviation` | DOUBLE PRECISION NULL | Abstand zur Lösung, kleiner ist besser |
| `outcome` | JSONB NULL | was der Server berechnet hat, für die Anzeige |
| `points` | INT NULL | NULL = nicht getippt, `0` = getippt und leer ausgegangen |

`UNIQUE (round_game_id, user_id)`. **Dieser Index *ist* die Regel „ein Tipp pro Spieler pro
Runde“** — keine Prüfung im Service.

Eine eigene Standings-Tabelle gibt es nicht: 15 Mitglieder × 60 Runden sind 900 Zeilen, `SUM(points)`
reicht auf Jahre.

## Modul-Schnitt

Neues Modulith-Modul **`game`**, Schema `game`, Migrationen unter `db/migration/game/`.

```
game → community   (aktiver Durchlauf, Mitgliedschaft, MemberPointsQuery)
game → countdown   (CountdownEngine)
game → iam         (Namen und Avatare in der Tippübersicht, und AuthenticatedUser am Controller, ab der Ansage)
game → rng         (SeededRandom für die Ziehung)
game → guesshue    (der Datensatz, aus dem gezogen wird)
gamelab → game     (das Lab läuft durch dieselben Klassen — siehe Das Lab zieht mit)
```

`game` zeigt auf nichts davon zurück, und auf das Lab schon gar nicht. `ModularityTests` bekommt diese
Kanten.

**Die Adapter liegen im Framework, nicht im Spielmodul.** `guesshue` bleibt unangetastet und weiß
nichts von `game`; `GuessHueGameType` liegt in `game.internal` und ruft die öffentliche API von
`guesshue` auf. Dieselbe Richtung wie im `gamelab`, aus einem anderen Grund: dort verbietet die
Guideline dem Produktionsmodul, auf das Lab zu zeigen, hier ist es eine Abwägung — eine Änderung am
`GameType`-Vertrag bleibt lokal in `game`, und „welche Spiele gibt es“ hat genau einen Ort. Der Preis
ist eine Adapterklasse in `game` je neuem Spiel.

Weil damit **niemand außerhalb** `GameType` implementiert, lebt der Vertrag in `game.internal`, nicht
im Basis-Package: eine veröffentlichte API ohne Konsumenten wäre ein falsches Signal. Kippt die
Richtung später zum Plugin-Dreh (Spielmodule implementieren selbst), zieht der Vertrag ins
Basis-Package um.

`game` liest den aktiven Durchlauf über `community`s öffentliche API und ruft `CountdownEngine`
direkt — `CountdownQuery.currentRound(communityId, now)` bleibt für andere Konsumenten und löst den
aktiven Durchlauf intern auf.

## Auflösung: die Ansage materialisiert

`GET /api/communities/{slug}/rounds/current`, gated auf aktive Mitglieder (Super-Admin erlaubt), wie
`CountdownService.forSlug` es vormacht.

```
1  edition = editions.active(community)          → sonst NoGame(NOT_SCHEDULED)
2  edition.startsAt                              → sonst NoGame(NOT_SCHEDULED)
3  round = countdownEngine.roundAt(now, startsAt, zone)
4  round.number > games_from_round               → NoGame(BEFORE_WINDOW)
   round.number < games_until_round              → NoGame(AFTER_WINDOW)
5  find(edition, round.number)                   → vorhanden? Announced.     ← 99,9 % der Requests
6  sonst materialisieren:
     history = SELECT round_number, game_type FROM game.round_games
               WHERE edition_id = :e AND round_number > :n
               ORDER BY round_number ASC          -- zuletzt gespielt zuerst
     rnd    = SeededRandom.fromSeed(secureRandom.nextInt())
     type   = selection.pick(catalog.ids.sorted(), history, rnd)
                                                 → null? NoGame(NO_GAME_TYPE)
     params = type.draw(rnd, RoundContext(round.number, phase))
     award  = awardFor(round.number, phase_two_start_round)   // Regel + Punktzahl, mit eingefroren
     INSERT … ON CONFLICT (edition_id, round_number) DO NOTHING;  danach SELECT
```

`NOT_SCHEDULED` deckt beide Fälle aus Schritt 1 und 2 ab — kein aktiver Durchlauf und kein Termin.
Für den Betrachter ist das dieselbe Aussage („der Countdown läuft noch nicht“), und der erste Fall
ist nach der Migration ohnehin nur noch defensiv.

### Vier Entscheidungen, die begründet gehören

**Ein GET, der schreibt.** Die Ansage *ist* die Materialisierung. Würde erst das Aufdecken die Zeile
anlegen, müsste die Ansage vorher unpersistiert berechnet werden und könnte von der später
geschriebenen Zeile abweichen — genau der Bruch, den diese Spec verhindern soll. Also `@Transactional`
ohne `readOnly`, einmal pro Runde und Durchlauf schreibend, danach nur noch lesend.

**`ON CONFLICT DO NOTHING` + `SELECT`, kein `catch (DuplicateKeyException)`.** Eine
Constraint-Verletzung markiert die Transaktion in Postgres als rollback-only; ein Re-Read *in
derselben* Transaktion schlägt dann fehl. Ein Statement ohne Fehlerzustand vermeidet das Thema,
statt es mit `REQUIRES_NEW` zu umgehen. First-write-wins, der Verlierer liest die Zeile des Siegers.

**„Vorrunde“ ist die zeitlich unmittelbar vorangehende *materialisierte* Runde** —
`round_number > n`, aufsteigend, die erste. Hat eine Runde niemand geöffnet, existiert sie nicht und
wird übersprungen. Das ist die ehrliche Lesart von „falls vorhanden“.

**Die Typ-Regel ist eine Präferenz, kein Ausschlusskriterium.** Ist der Pool nach dem Ausschluss
leer, fällt die Regel weg statt das Spiel abzusagen. Heute existiert genau ein Typ — die Regel
schläft also und ist ungetesteter Code, wenn man sie nicht mit einem **gefälschten Katalog aus ≥ 2
Typen** testet.

### Die Auswahl ist eine reine Funktion — damit sie wachsen kann

„Nicht zwei gleiche Spiele hintereinander“ ist die **erste und einfachste** Fassung der Auswahlregel und
soll später komplexer werden. Damit das später eine kleine Änderung ist und keine Operation an der
Materialisierung, steht die Auswahl von Anfang an als eigene, reine Funktion da — und bekommt die
**ganze Historie** des Durchlaufs, nicht nur die Vorrunde:

```kotlin
fun interface GameSelection {
    /** `null` = kein Typ verfügbar. [history] ist zuletzt-gespielt-zuerst sortiert. */
    fun pick(candidates: List<String>, history: List<PastRound>, random: SeededRandom): String?
}

data class PastRound(val roundNumber: Int, val gameType: String)
```

Heute sind das drei Zeilen (Kandidaten minus `history.firstOrNull()?.gameType`, sonst alle, dann
`random.pick`). Der Punkt ist nicht die Zeilenzahl, sondern was **nicht** mehr passieren muss, wenn die
Regel wächst:

- **„nicht innerhalb der letzten drei“, „Typen gleichmäßig verteilen“, Gewichtung** — steht alles schon
  in `history`. Kein neues Query, kein neuer Parameter, keine Änderung am Aufrufer. Hätte die Auflösung
  nur `previousType` geladen, wäre jede dieser Regeln eine Änderung an Query *und* Service *und* Tests.
- **Ein Spieltyp, der in dieser Community nicht verfügbar ist** — etwa das bildbasierte Spiel, dessen
  Bilder der Admin noch nicht eingestellt hat — ist ein Filter auf `candidates`, **vor** dem Aufruf.
  Auch das ändert die Auswahlregel nicht.

Der Preis: ein `SELECT` über die Runden des Durchlaufs statt über eine Zeile. Das sind bei einem
zweimonatigen Countdown ≤ 60 Zeilen mit zwei Spalten, einmal je Runde und Durchlauf — im Lesepfad kommt
es ohnehin nicht vor, weil Schritt 5 vorher abbiegt.

Ein Nebeneffekt, bewusst hingenommen: wächst der Katalog von leer auf eins, *während* eine Runde
läuft, bekommt diese Runde nachträglich ein Spiel. Sie hatte vorher keins, also hat niemand etwas
verloren.

### Warum es keinen Hidden Seed gibt

Die Anti-Cheat-Spec baut ihr Fundament auf zwei persistierte Seeds. Nach dem Einfrieren der Params
trägt der versteckte Seed **nichts** mehr:

- **Ziehungs-Randomness** braucht er nicht persistiert zu sein — `SeededRandom.fromSeed(secureRandom.nextInt())`
  einmal bauen, ziehen, wegwerfen.
- **Auditierbarkeit** kann er nicht leisten: ein gewachsener Katalog verschiebt `pick(pool)`, ein
  geändertes Datenset die Ziehung. Autorität ist die `params`-Spalte.
- **Commit-Reveal** braucht ihn nicht. Variante (b) der Spec (Commit auf den Seed, jeder rechnet die
  Runde nach) verlangt Datenset *und* Generator im Browser; die kuratierten Beschreibungen sind laut
  [game-content.md](../../../.claude/guidelines/game-content.md) Geheimnis. Für Guess Hue ist (b)
  damit tot. Übrig bleibt Variante (a), Commit auf die **Lösung** — die braucht ein Salt und eine
  Spalte, die man dann hinzufügt.

Dasselbe trifft den Presentation Seed: kein heutiges Spiel hat einen Abnehmer, und ein Spiel, das
später Geometrie clientseitig ableiten will, friert seinen Präsentations-Seed in die **eigenen
Params** ein und liefert ihn über `present()` aus — dort pinnt ihn sogar der Feldmengen-Test des
Spiels, was bei einer Framework-Spalte nicht passierte.

Übrig bleibt eine einfachere Struktur: **pro Runde ein Geheimnis — der Params-Blob — mit genau zwei
Ausgängen, `present()` und `solution()`.** Was von der Zwei-Seed-Regel überlebt, gilt jetzt auf
Spielebene: *ein Wert, der ausgeliefert wird, darf nie derselbe sein wie einer, der die Lösung
treibt.*

**Diese Fassung ist zu schwach — die Regel gilt pro Stream, nicht pro Wert.** `GuessHueDataset.draw`
zieht Eintrag, Hue-Jitter, Sättigung, Helligkeit und Start-Winkel nacheinander aus **einem**
`SeededRandom`. `nextUint32` ist bijektiv (die Multiplikationen mit den ungeraden Faktoren 5 und 9
sind invertierbar mod 2³², `rotl` ist es sowieso, und der xoshiro128\*\*-Zustandsübergang ist eine
Bijektion), und `nextDouble` veröffentlicht 53 Bit aus zwei aufeinanderfolgenden Wörtern. Drei
veröffentlichte Doubles reichen also, um den Generatorzustand zu rekonstruieren, ihn rückwärts
abzuspulen und die Ziel-Hue exakt zu lesen — obwohl keiner der drei Werte selbst der Lösung gleicht
oder aus ihr abgeleitet ist. Die scharfe Fassung: *ein Wert, der aus demselben Generator-Stream wie
die Lösung gezogen wird, grenzt sie ein — auch wenn er ihr nicht gleicht und auch wenn er vor ihr im
Stream steht.* Die Behebung sind **zwei unabhängig geseedete Streams**, und sie ist mit dem Spielen
umgesetzt: `GameRandom` hält beide, `GuessHueDataset.draw` nimmt sie getrennt, und der Schnitt verläuft
nach **Veröffentlichung** statt nach Bedeutung — der Eintrag (und damit die Beschreibung), Sättigung,
Helligkeit und Start-Winkel kommen aus dem Präsentationsstrom, der Lösungsstrom zieht nur den Jitter.
Auch die Spieltyp-Wahl kommt aus dem Präsentationsstrom, weil sie angesagt wird. Übrig bleibt als
Rundengeheimnis genau der Jitter, und den engt kein ausgeliefertes Feld ein. Was danach noch bleibt,
ist Datensatz-Geheimhaltung — dagegen wirkt [game-content.md](../../../.claude/guidelines/game-content.md),
nicht der Generator. Guess Hues Phase 2 war die Stelle, an der es gebissen hätte: dort gibt es kein
Toleranz-Tor, nur der nächste Tipp punktet, und exakte Rekonstruktion hätte dort jede Runde gewonnen.

Und weil der Seed nicht mehr aus `(edition, round)` abgeleitet wird, ist die offene Frage 7 der
Anti-Cheat-Spec anders beantwortet als gestellt: er wird **gar nicht abgeleitet**. Ein gehashter Seed
aus Rundenkoordinaten wäre erratbar gewesen — genau Angriff A.

## Der Spiel-Vertrag

```kotlin
interface GameType<P : Any> {
    val id: String                  // 'guess-hue' — Spaltenwert und URL-Segment
    val displayName: String         // „Farbausmalung“
    val paramsType: Class<P>        // für die JSONB-Deserialisierung

    fun draw(random: SeededRandom, context: RoundContext): P
    fun present(params: P): GamePayload              // was der Spieler sieht — nie die Lösung
    fun judge(params: P, guess: JsonNode): Judgement // wirft bei ungültigem Tipp
    fun solution(params: P): GameSolution?           // erst nach dem eigenen Tipp
}

data class RoundContext(val roundNumber: Int, val phase: Phase)
enum class Phase { ONE, TWO }

/** Was das Spiel über einen Tipp sagen kann — und nur das. */
data class Judgement(
    val qualifies: Boolean,     // punkte-berechtigt
    val deviation: Double,      // Abstand zur Lösung, kleiner ist besser; 0.0 = perfekt
    val outcome: GameOutcome?,  // für die Anzeige
)
```

**Das Spiel urteilt, das Framework vergibt.** `judge` sagt, ob ein Tipp punkte-berechtigt ist und wie
weit er daneben lag — nicht, wie viele Punkte er wert ist. Wie viele Punkte daraus werden und ob ein
Tipp anderen ihre Punkte nimmt, ist über alle Spiele gleich und gehört dem Framework; siehe *Punkte*.

`deviation` ist der einzige Wert, den das Framework braucht, um „am nächsten dran“ *vergleichen* zu
können, ohne es *berechnen* zu müssen — bei Guess Hue der Winkelabstand in Grad, bei einem
zeitgewerteten Spiel Sekunden. Ein Spiel ohne sinnvollen Abstand (reines richtig/falsch) liefert
`0.0` für jeden Treffer; dann sind alle Treffer gleichauf, und das genügt.

Der Generics-Sprung von `Map<String, GameType<*>>` auf einen konkreten `P` wird in **einer** Klasse
`GameTypeHandle<P>` gekapselt, die den Typparameter bei der Konstruktion einfängt (`fun <P : Any>
handle(t: GameType<P>)`). Damit steht kein `UNCHECKED_CAST` in irgendeinem Service.

`GameCatalog` sammelt die `GameType`-Beans und lässt den Boot mit doppelter `id` scheitern — wie
`LabService` es heute tut. Bean-Existenz *ist* die Freigabe: `guesshue` scheitert unter
`production`/`staging` ohnehin am fehlenden Datensatz, siehe game-content-Guideline.

`GameType` **löst `LabGame` ab** — genau die Richtung, die die Lab-Guideline vorschreibt („das Lab passt
sich an, nie das Spiel“). Zwei Dinge sind anders: alle vier Methoden nehmen **Params statt eines Seeds**
(`GuessHueLabGame` rollt heute in `reveal`, `score` und `solution` je den ganzen Seed neu auf; mit
eingefrorenen Params ist ein Spiel eine reine Funktion seiner Runde), und **`judge` urteilt statt zu
werten**. Letzteres ist keine Verschärfung: `LabGame.score` gibt schon heute `LabOutcome?` zurück und
wertet nichts. Die Vergabe war dort nie zu Hause und ist es jetzt auch im Framework nicht.

### Das Lab zieht mit

Das Lab soll einem echten Spielablauf so nah kommen wie möglich, also **läuft es durch dieselben
Klassen** statt neben ihnen: `LabGame`, `GuessHueLabGame`, `SampleLabGame`, `LabPayload`, `LabOutcome`
und `LabSolution` fallen weg, `gamelab` hängt an `game` und benutzt `GameCatalog`, `GameType`,
`GamePayload`, `GameSolution`. Zwei Adapter für dasselbe Spiel gibt es damit nicht, und die Zusage „was
das Lab zeigt, zeigt das echte Spiel“ ist erzwungen statt behauptet.

Der Lab-Runde fehlt gegenüber der echten nur die Tabelle. Sie wird gewählt statt materialisiert:
**Spieltyp + Seed + Phase**, und dann friert der Store `params` und `award` genauso ein wie
`round_games` es täte — aus `SeededRandom.fromSeed(seed)` statt aus `secureRandom`, damit ein Seed
reproduzierbar dieselbe Runde ergibt. Danach ist alles identisch: `present`, `judge`, die Vergaberegel
samt Neuauswertung, `solution` nach dem eigenen Tipp.

- **Der Phasen-Wähler** ist der eigentliche Gewinn und der Grund, warum das jetzt passiert: `CLOSEST_ONLY`
  und die wachsende Punktzahl sind von Hand nur beurteilbar, wenn man Phase 2 herbeischalten kann,
  ohne eine Community-Schwelle zu verbiegen. Die Phase reist dafür als Query-Parameter in der URL
  (Default `ONE`). Der Einsatz kommt dabei aus `awardFor`, aufgerufen über eine synthetische
  Rundennummer, die das Lab an Stelle eines Gitters mitbringt — das Lab wählt die Phase, nicht die
  Punkte.
- **`SampleLabGame` wird gelöscht.** Es war das Beispiel, solange es kein echtes Spiel gab; jetzt gibt es
  eins, und ein Fake-Spiel im echten `GameCatalog` wäre gefährlich, weil es in echten Runden angesagt
  werden könnte. Seine Rolle als Vorlage für den Feldmengen-Test übernimmt `GuessHueGameType`.
- **Der Store behält seine Form:** eine Runde pro (Community, Spieltyp), ein anderer Seed oder eine
  andere Phase verdrängt die vorige. Die Selbstbegrenzung aus der Lab-Guideline bleibt damit, ohne TTL
  und ohne Aufräumjob, und die beiden Reset-Aktionen bleiben auch.

Das Lab bleibt ein Zwei-Tor-Werkzeug (`@Profile("!production")` + `app.game-lab.enabled`, 404 statt
403) und bleibt wegwerfbar: es hängt an `game`, `game` nie an ihm.

`params JSONB` braucht in Spring Data JDBC einen Converter (Jackson 3 `JsonNode` ↔ `PGobject`); die
Spalte wird als `JsonNode` gehalten und erst im `GameTypeHandle` in `P` überführt.

### Phasen wandern in die Params

`phase = if (phaseTwoStartRound != null && round.number <= phaseTwoStartRound) TWO else ONE` —
später in der Zeit heißt kleinere Zahl. Der Kontext geht in `draw`, und Guess Hue backt seine
Toleranz in die Params:

```kotlin
data class GuessHueParams(
    val description: String, val hue: Double, val saturation: Double,
    val lightness: Double, val initHue: Double,
    /** Das Tor *und* der gezeichnete Bogen. `null` = keine Vorbedingung (Phase 2). */
    val toleranceDeg: Double?,
)
```

Damit kann eine spätere Verschiebung der Phasenschwelle vergangene Runden nicht rückwerten — dieselbe
Eigenschaft wie beim Params-Einfrieren, eine Ebene tiefer. `GuessHueTolerance.DEGREES` bleibt der
Phase-1-Wert; in Phase 2 gibt es keine Toleranz, weil es kein Tor gibt — `toleranceDeg = null`, und
`GuessHueSolution.toleranceDeg` wird nullable, damit die Auflösung dort keinen Bogen zeichnet.

Dasselbe gilt für die Vergabe: `award_rule` und `award_points` leiten sich bei der Ansage aus der
Phase ab und werden **mit eingefroren**. Ein Admin, der die Phasenschwelle nachträglich verschiebt,
ändert damit die kommenden Runden und keine vergangene. Die Zahlen selbst sind Spielbalance und leben
als Konstanten im Framework — man darf sie jederzeit ändern, ohne Historie zu verlieren, weil jede
Runde ihre eigene mitbringt.

## Spielen

| | | |
|---|---|---|
| `GET  …/rounds/current` | Ansage (materialisiert) | `payload` erst nach dem Aufdecken, `solution` und `others` erst nach dem eigenen Tipp |
| `POST …/rounds/current/reveal` | legt die `round_plays`-Zeile an | idempotent |
| `POST …/rounds/current/guess` | urteilt, schreibt, wertet die Runde neu aus | |

Aufdecken und Tippen verlangen aktive Mitgliedschaft, ohne Ausnahme — anders als die Ansage bleibt der
Super-Admin-Bypass hier zu, denn beide schreiben `round_plays`, und unter `CLOSEST_ONLY` würde der Tipp
eines Außenstehenden die Punkte aller echten Mitglieder verschieben, ohne selbst in der Rangliste
aufzutauchen.

Die Antwort der Ansage, mit den Feldern, die je nach Zustand `null` bleiben:

```kotlin
data class RoundResponse(
    val round: RoundDto,                  // number, label, start, end — wie CountdownResponse
    val game: GameDto?,                   // id, displayName; null bei NoGame
    val noGameReason: NoGameReason?,      // NOT_SCHEDULED | BEFORE_WINDOW | AFTER_WINDOW | NO_GAME_TYPE
    val payload: GamePayload?,            // erst wenn revealed_at gesetzt ist
    val solution: GameSolution?,          // erst wenn guessed_at gesetzt ist
    val me: PlayDto?,                     // revealedAt, guessedAt, guess, outcome, points
    val others: List<PlayDto>,            // leer bis guessed_at gesetzt ist
)
```

`qualifies` und `deviation` **bleiben innen.** Sie sind die Vergleichsgrößen des Frameworks, keine
Anzeigedaten: was der Spieler über sein Ergebnis erfährt, sagt das spielgeformte `outcome`, und wie er
dasteht, sagt `points`. Ein generisches „so weit daneben“-Feld im DTO wäre ein zweiter Weg aus dem
Server neben `present()` und `solution()`, und genau die wollen wir zählbar halten.

**Nur die laufende Runde ist spielbar.** Ein Tipp geht nur innerhalb `[start, end)` der Runde; wer
sie verpasst, hat null Punkte dafür. Vergangene Runden sind Anzeige. Das hält die Uhr-Semantik
einfach und ist die Fassung, die zur Anti-Cheat-Logik passt.

**Aufdecken ist idempotent, kein harter Lockout.** Das entscheidet die offene Frage 5 der
Anti-Cheat-Spec am ersten Spiel, wie dort vorgesehen: Guess Hue hat keine Zeitwertung, ein Refresh
bringt dem Trickser also nichts, während ein Lockout nur den mit dem schlechten WLAN trifft. Derselbe
Request liefert denselben Payload; `revealed_at` bleibt der erste Zeitstempel, `reveal_count` zählt
hoch und wird geloggt. Die Schwelle, ab der wiederholtes Aufdecken zum Signal wird, kommt mit dem
ersten zeitgewerteten Spiel — sie hier zu erfinden hieße, sie ohne Datenlage zu erfinden.

Der Tipp läuft in drei Schritten, in **einer** Transaktion:

```
1  SELECT … FROM game.round_games WHERE id = :r FOR UPDATE     -- serialisiert die Runde
2  judgement = type.judge(params, guess)                        -- wirft bei ungültigem Tipp
3  UPDATE game.round_plays SET guess = ?, guessed_at = ?, qualifies = ?, deviation = ?, outcome = ?
    WHERE id = ? AND guessed_at IS NULL                         -- 0 Zeilen → 409
4  Runde neu auswerten und `points` aller getippten Zeilen schreiben
```

**Geurteilt wird vor dem Schreiben.** `judge()` wirft bei einem ungültigen Tipp, bevor irgendetwas
persistiert wird — ein Tippfehler darf den einen Versuch nicht verbrauchen. `LabService` macht das
heute schon so und hat den Kommentar dazu.

**„Ein Tipp pro Runde“ ist das atomare `UPDATE`,** kein Lesen-dann-Prüfen: null betroffene Zeilen
heißt „schon getippt“ → 409. Ein Tipp ohne vorheriges Aufdecken ist ebenfalls 409 — eine Farbe zu
raten, deren Beschreibung man nie gesehen hat, ist keine sinnvolle Anfrage, und die Uhr hängt am
Aufdecken.

**Die Zeilensperre auf `round_games` ist wegen Schritt 4 nötig,** nicht wegen Schritt 3. Zwei
gleichzeitige Tipps derselben Runde würden dieselbe Ausgangslage lesen und sich gegenseitig
überschreiben — ein verlorenes Update genau in dem Moment, in dem sich die Punkte verschieben. Eine
Zeile zu sperren serialisiert die Tipps *einer* Runde; bei 15 Mitspielern ist das nicht messbar, und
Runden untereinander behindern sich nicht.

### Sichtbarkeit: kein Schalter

**Die Tipps der anderen werden ausgeliefert, wenn `guessed_at` gesetzt ist — unbedingt.** Kein
`GameType`-Property, keine Entscheidung je Spiel. Serverseitig zurückgehalten, nicht im Client
gefiltert: ein Payload, den der Browser nie bekommt, steht auch nicht im Netzwerk-Tab.

`LabGame.revealsOthersBeforeGuess` war eine Fehlkonstruktion: ein Schalter mit nur einer je richtigen
Antwort erzwingt, dass jedes Spiel die Frage *beantwortet*, nicht dass es sie richtig beantwortet —
und er machte die Regel zu einem Review-Punkt je Spiel statt zu einer Invariante. Er entfällt, im
Lab wie im Framework, samt dem Zweig in `LabService.respond`, seinem Test und dem Absatz in
[game-lab.md](../../../.claude/guidelines/game-lab.md). Die Lab-Guideline schreibt genau diese
Richtung vor: das Lab passt sich dem echten Spiel an.

Eine Grenze ausdrücklich, damit der Schalter nicht durch die Hintertür zurückkommt: die **Tipps** nie
vor dem eigenen, ein reiner **Teilnahme-Zähler** („7 von 15 haben getippt“) dagegen jederzeit — er
sagt nichts über die Lösung, nur über den Fortschritt. Wer diese Anzeige will, bekommt sie als
`COUNT`, nicht als gefilterte Tipp-Liste.

## Punkte sind ein Cache, kein Urteil

Zwei Vergaberegeln, beide im Framework, beide für alle Spiele gleich. Welche gilt, folgt aus der Phase
und wird mit der Runde eingefroren:

| Regel | Phase | Vergabe |
|---|---|---|
| `ALL_QUALIFYING` | 1 | jeder punkte-berechtigte Tipp bekommt `award_points` |
| `CLOSEST_ONLY` | 2 | nur der punkte-berechtigte Tipp mit der kleinsten `deviation` bekommt `award_points`, alle anderen `0` |

Regel **und** Punktzahl kommen aus **einer** Funktion im Framework — nicht aus dem Spiel und nicht aus
Konstanten an zwei Orten:

```kotlin
data class Award(val rule: AwardRule, val points: Int)

enum class AwardRule {
    /** Jeder Berechtigte punktet. */
    ALL_QUALIFYING,

    /** Im Original „winner takes it all“ — `winnerTakesItAll` / `winnerTakesItAllCleaner`. */
    CLOSEST_ONLY,
}

fun awardFor(roundNumber: Int, phaseTwoStartRound: Int?): Award =
    if (phaseTwoStartRound == null || roundNumber > phaseTwoStartRound) {
        Award(ALL_QUALIFYING, 1)
    } else {
        // „Schlag den Raab“: ab der Schwelle steigt der Einsatz je Runde um eins.
        // Über Gauß summierbar — was ab hier insgesamt noch zu holen ist.
        Award(CLOSEST_ONLY, phaseTwoStartRound - roundNumber + 2)
    }
```

Das ist der Port von `pointsOfRound` aus
`huettehuette.unividuell.org/server/composables/useGamePointsCalculator.ts`, wo derselbe Ausdruck steht
(dort mit `gaussSumRule` als Phasenprüfung und einer Wertetabelle im Kommentar, die als Testvektoren
taugt): vor Phase 2 ein Punkt, ab der Schwellenrunde **2**, dann 3, 4, 5 … Bei `phase_two_start_round =
20` also `T-20 → 2`, `T-19 → 3`, …, `T-0 → 22`, `T+1 → 23`. Nach unten offen, wie im Original — ein
`games_until_round` unter `0` lässt den Einsatz einfach weiterwachsen.

**Beide Namen des Originals stehen als Kommentar im Code**, weil jemand später darüber reden wird:
„winner takes it all“ an `CLOSEST_ONLY`, „Schlag den Raab“ an der Kurve. Der Bezeichner bleibt
`CLOSEST_ONLY` — er sagt, *was* passiert, der Kommentar, *woher es kommt*.

Und Gauß gehört dazu, weil er eine andere, nützliche Frage beantwortet: der Einsatz *einer* Runde ist
eine arithmetische Folge, aber deren **Summe** sagt, was ab Phase 2 insgesamt noch zu holen ist —
Schwelle T-20 ergibt `2+3+…+22 = 252`. Darum ging es im Original.

`Phase` und `Award` teilen dieselbe Prüfung `roundNumber <= phaseTwoStartRound`; sie steht an einer
Stelle, damit Toleranz und Einsatz nicht auseinanderlaufen können.

Und weil jede Runde ihren Wert **eingefroren** mitbekommt, darf der Admin `phase_two_start_round`
danach verschieben: die Kurve gilt ab dann, vergangene Runden behalten ihren Einsatz.

### Herkunft im Original

`CLOSEST_ONLY` ist ein **Port**, und zwar aus `server/composables/useGamePointsWriter.ts` — nicht aus
dem Punkte-Rechner, wo man es zuerst vermutet. `winnerTakesItAll(round, phase2Start)` (der **dritte**
Alias derselben `utils/points/phase-2.ts`, neben `gaussSumRule` und `maxToleranzDetector`) schaltet
`winnerTakesItAllCleaner` ein, und der arbeitet genau so, wie diese Spec es beschreibt:

| Original | hier |
|---|---|
| `winnerTakesItAll(round, phase2Start)` schaltet um | `awardFor` liefert `CLOSEST_ONLY` |
| `currentGuesses.filter(g => g.points > 0)` vor dem Sortieren | `qualifies` |
| Vergleicher je Spiel: `distanceOnCircle(hue, target)`, `gamePlayDurationMs`, `averageReactionTimeMs` | `deviation`, ein „kleiner ist besser“-Skalar |
| eigener Tipp nicht bester → `{ …ownGuess, points: 0 }` | Neuauswertung schreibt `0` |
| `fireBulletBill` nullt fremde, schlechtere Tipps | Neuauswertung schreibt fremde Zeilen |
| `bulletBill` auf der Zeile des Verdrängten | nicht portiert, siehe unten |

Zwei Stellen, an denen wir bewusst nicht wörtlich portieren:

**Neuauswertung statt Aufräumen.** Das Original nullt gezielt die schlechteren und lässt alles andere
liegen; wir rechnen die Runde jedes Mal komplett neu. Der Endstand ist derselbe, aber die Neuauswertung
heilt sich selbst — sie hat keinen Zustand, der „daneben“ liegen kann.

**Gleichstand einheitlich.** Das Original entscheidet das **pro Spiel**: GuessColor und Ratio lassen
Gleichstände stehen („remove also equal ones“), ToneDirection und PuzzleScramble nullen alle außer dem
einen Besten (`uid !== best.uid`, begründet mit „unit is milliseconds — not probability“). Wir nehmen
framework-weit „Gleichstand behält“ — das ist die Guess-Hue-Fassung, also die des einzigen Ports.
Braucht ein späteres Spiel den harten Einzelsieger, ist das eine **dritte Vergaberegel**, kein Haken
im Spiel.

**Die Vorbedingung gehört dem Spiel, nicht der Regel.** `CLOSEST_ONLY` vergibt an den Nächsten *unter
den Berechtigten* — wer berechtigt ist, sagt allein `judge`. Damit fallen beide Spielarten unter
dieselbe Regel:

- **Guess Hue: es gewinnt immer jemand.** In Phase 1 ist die Toleranz das Tor (`qualifies = |Δ| ≤
  toleranceDeg`). In Phase 2 gibt es **kein Tor** — jeder Tipp ist berechtigt, und der Nächste
  gewinnt, egal wie schlecht alle geraten haben. Ausgedrückt wird das als `toleranceDeg: Double?`,
  wobei `null` „keine Vorbedingung“ heißt; ein Boolean daneben wäre ein zweiter Weg, dasselbe zu
  sagen.
- **Ein Spiel mit echter Vorbedingung** (Lauf vollständig, Muster korrekt, Trace gültig) setzt
  `qualifies` darauf und ermittelt unter den Erfüllern den aktuellen Gewinner. Erfüllt niemand die
  Vorbedingung, gewinnt niemand — und das ist dann die Aussage des Spiels, nicht die der Regel.

Im Original ist genau das der `points > 0`-Filter vor dem Sortieren: bei den Schätzspielen ist er in
Phase 2 immer wahr, bei den Können-Spielen nicht. Die Aufteilung ist also nicht neu erfunden, nur
benannt.

**Gleichstand teilt nicht, sondern verdoppelt:** liegen zwei Tipps exakt gleich weit daneben, bekommen
beide die volle Punktzahl. Bei Grad-Werten als `Double` praktisch unmöglich, bei einem richtig/falsch-
Spiel (`deviation = 0.0` für jeden Treffer) dagegen der Normalfall — dort verhält sich `CLOSEST_ONLY`
damit automatisch wie `ALL_QUALIFYING`, ohne dass es einen Sonderfall dafür braucht. Der Vergleich
`deviation == best` auf `Double` ist hier korrekt und keine Schlamperei: verglichen werden gespeicherte
Werte mit dem Minimum derselben gespeicherten Werte, nicht zwei unabhängig gerechnete Näherungen.

### „Punkte entziehen“ ist kein Mechanismus, sondern Neuauswertung

In Phase 2 kann ein später abgegebener Tipp dem bisher Besten die Punkte wieder nehmen. Dafür gibt es
**keinen eigenen Mechanismus** — es fällt aus der Cache-Eigenschaft heraus, eine Stufe weiter gedacht:

> Bisher war `points = f(params, guess)`. Jetzt ist es `points = f(award_rule, alle Urteile der
> Runde)` — immer noch eine reine Funktion **persistierter** Werte.

Also wird bei jedem Tipp die Runde neu ausgewertet und `points` für **alle** getippten Zeilen
geschrieben. Kein Entziehen, kein Zurücksetzen, kein Job, keine Ereignisse — ein Neuberechnen über
höchstens so vielen Zeilen, wie die Community Mitglieder hat. Und weil `qualifies` und `deviation` auf
der Zeile liegen, braucht diese Auswertung weder das Spiel noch `params`: sie ist reine
Framework-Arithmetik.

Die Spalte `points` bleibt damit eine materialisierte Sicht und kein unwiderrufliches Urteil: ein
Wertungs-Bugfix kommt mit einem Backfill, nicht mit einem Schulterzucken über verlorene Historie. Sie
existiert nur, damit der Punktestand ein `SUM` ist und nicht 900 JSON-Deserialisierungen pro
Seitenaufruf.

### Kein Bullet Bill — und keine Spalte dafür

Das Original schreibt dem Verdrängten `bulletBill: { firedByUid, firedAt }` auf den Tipp: wer ihm die
Punkte genommen hat. **Nicht portiert.** Im Original hat es nie erfüllt, wofür es gedacht war — die
Spieler haben es nicht verstanden, und es wurde am Ende in der UI ausgeblendet. Ein Feature, das schon
einmal gescheitert ist, kostet hier keine Spalte.

Es kostet auch keine, um den Historiker zu bedienen, denn **die Sequenz ist replaybar**: `guessed_at`,
`qualifies` und `deviation` liegen auf der Zeile, Tipps sind unveränderlich. Wer die Tipps einer Runde
nach `guessed_at` sortiert und die Vergabefunktion nach jedem Schritt über das Präfix laufen lässt, sieht
jeden Übergang „hatte Punkte → 0“ samt Auslöser — genau das, was die Spalte gespeichert hätte.
(Kollidierende Zeitstempel wären eine Lücke; die Zeilensperre auf der Runde serialisiert die Tipps
ohnehin.)

Damit bleibt die Neuauswertung **reine Arithmetik ohne Zustand** — die Eigenschaft ist mehr wert als
das Feature. Für den laufenden Betrieb bleibt eine **Log-Zeile** an der Stelle, an der jemandem Punkte
verschwinden: nach der [Logging-Guideline](../../../.claude/guidelines/logging.md) genau der Fall
„Verhalten degradiert still“, und ohne sie steht im Support-Fall Aussage gegen Aussage.

Eine Folge, die ins Frontend gehört und hier nur benannt wird: unter `CLOSEST_ONLY` sind die Punkte
der **laufenden** Runde vorläufig, bis sie endet. Eine Punktzahl heißt dort „bester Tipp bisher“, und
das sollte auch so dastehen — zumal der Einsatz ab Phase 2 mit jeder Runde steigt und damit auch das,
was man verlieren kann.

`MemberPointsQuery` erfüllt sich so:

- `stable` = `SUM(points)` über Runden des aktiven Durchlaufs, die **abgeschlossen** *und* **im aktuellen
  Spielfenster** liegen — `round_number > n` und `games_until_round ≤ round_number ≤ games_from_round`,
- `live` = die Punkte der laufenden Runde `n` — **nur wenn der Betrachter für `n` selbst getippt
  hat**, sonst `null`, genau wie die Schnittstelle es beschreibt.

### Das Fenster entscheidet die Summe, nicht den Bestand

Verkleinert ein Admin das Spielfenster, fallen bereits materialisierte — womöglich schon gespielte —
Runden heraus. Sie **bleiben erhalten**: die Zeile, ihre Params, ihre Vergaberegel und die `points` auf
den Tipps sind eingefroren und werden nicht gelöscht. Sie **zählen nur nicht mehr** in den Punktestand.
Der Ansage-Endpunkt meldet für sie folgerichtig `AFTER_WINDOW` bzw. `BEFORE_WINDOW` — sie sind wirklich
nicht mehr im Spiel.

Zwei Folgen, beide bewusst:

- **Ein Punktestand kann sinken**, wenn der Admin das Fenster verkleinert. Das folgt zwingend aus der
  Regel und ist kein Nebeneffekt, den man wegkonstruieren sollte: das Fenster des Admins ist maßgeblich.
- **Es ist umkehrbar.** Die Punkte stehen auf der Zeile; dynamisch ist nur ihre *Aufnahme* in die Summe.
  Ein wieder geöffnetes Fenster bringt sie unverändert zurück — keine Neuberechnung, kein Datenverlust.
  Das ist derselbe Grund, aus dem `points` ein Cache über persistierten Eingaben ist.

Die Fensterprüfung ist dabei **dieselbe wie in der Auflösung** und nicht eine zweite Fassung derselben
Vergleiche: `windowReasonOf(roundNumber, gamesFromRound, gamesUntilRound)` liegt neben `Phase.of` und
`awardFor`, und die Standings-Abfrage benutzt sie mit. Beidseitig inklusiv, und ein `games_from_round`
von `NULL` heißt oben unbeschränkt.

Die **Naht bleibt in `community`, ihre Implementierungen ziehen nach `game`.**
`MemberPointsConfiguration` baut „genau einen Bean by construction“, und `community` darf nicht auf
`game` zeigen — ein zweiter Bean derselben Schnittstelle bricht die Invariante, und
`@ConditionalOnMissingBean` in einer User-`@Configuration` ist reihenfolgeabhängig, also keine
Lösung. Deshalb wandern `MemberPointsConfiguration` und `StubMemberPoints` nach `game.internal`,
dieselben Klassen mit derselben Begründung, nur eine Ebene weiter, wo sie zwischen echten Punkten und
Stub entscheiden *können*. `ZeroMemberPoints` wird gelöscht: `game` antwortet für eine Community ohne
gespielte Runden von sich aus mit `0`. `community` behält `MemberPointsQuery` und `MemberPoints`.

> **Nachtrag (2026-08-14):** Der Umzug hat stattgefunden, die Entscheidung danach nicht mehr:
> mit den echten Punkten hatte `StubMemberPoints` keinen Zweck mehr — auch nicht auf Staging, dessen
> Begründung („mit lauter Nullen ist die Rangliste nicht beurteilbar“) die echten Punkte selbst
> erledigen. `StubMemberPoints`, `MemberPointsConfiguration` und `app.stub-points.enabled` sind
> gelöscht; `RoundPlayPoints` ist als `@Component` der einzige `MemberPointsQuery`.

## Tests

TDD, mockk + kotest + MockMvc Kotlin DSL, Testcontainers über den geteilten Postgres.

**Auflösung** — Fenstergrenzen beidseitig inklusiv; kein aktiver Durchlauf; kein `startsAt`; leerer
Katalog; Materialisierung idempotent (zweiter Aufruf liefert dieselbe Zeile); zwei parallele
Transaktionen ergeben **eine** Zeile; die Historie enthält die Runde über eine Lücke hinweg.

**Auswahl** — `GameSelection` ist eine reine Funktion und wird ohne DB getestet: **Typ-Wechsel mit einem
gefälschten Katalog aus 2 Typen**, Abwertung bei 1 Typ (die Regel fällt weg, das Spiel nicht),
leere Kandidatenliste → `null`, leere Historie → beliebiger Kandidat, und bei gleichem `SeededRandom`
dieselbe Wahl. Mit dem echten Katalog feuert die Regel nie, weil es einen Typ gibt — ohne den gefälschten
Katalog wäre sie ungetesteter Code.

**Durchlauf** — ein zweiter aktiver Durchlauf verletzt den partiellen Unique-Index.

Der **Backfill** ist dagegen *kein* Integrationstest: Flyway läuft in der Testcontainers-DB vor jeder
Zeile, dort kopiert das `INSERT … SELECT` also null Zeilen. Er wird gegen echte Zeilen verifiziert —
ein Wegwerf-Container, die Migrationen in Reihenfolge, ein paar gesäte Zeilen, dann ein
`IS DISTINCT FROM` zwischen alter und neuer Seite. Nie gegen die Dev-DB des Entwicklers.

**Spielen** — Aufdecken erzeugt eine Zeile und setzt beim zweiten Mal `revealed_at` *nicht* zurück,
sondern `reveal_count` hoch; Tipp ohne Aufdecken 409; zweiter Tipp 409; ungültiger Tipp verbraucht
nichts und schreibt nichts; `others` leer bis `guessed_at` gesetzt ist (framework-weit, ein Test).

**Vergabe** — die Auswertung ist eine reine Funktion und wird als solche getestet, ohne DB:
`ALL_QUALIFYING` gibt jedem Treffer `award_points` und jedem Nicht-Treffer `0`; `CLOSEST_ONLY` gibt
nur dem kleinsten `deviation` etwas; Gleichstand bekommt **beide Male die volle** Punktzahl; qualifiziert
niemand, bekommt niemand etwas. Dazu der eigentliche Regressionstest über die DB: **ein später
abgegebener, besserer Tipp nimmt dem vorherigen Besten seine Punkte** — also schreibt ein Tipp auch
*fremde* Zeilen. Und zwei gleichzeitige Tipps derselben Runde hinterlassen einen konsistenten Stand
(die Zeilensperre; ohne sie geht genau hier ein Update verloren).

**Vorbedingung** — `GuessHueGameType.judge` setzt `qualifies` in Phase 1 an der Toleranz und in Phase 2
(`toleranceDeg = null`) auf `true`, auch für einen Tipp 179° daneben; `deviation` ist in beiden Phasen
derselbe Winkelabstand.

**Punktekurve** — `awardFor` bekommt die Wertetabelle aus dem Original als Vektoren: ohne Schwelle
überall `ALL_QUALIFYING`/1; mit `phase_two_start_round = 20` dann `T-21 → 1`, `T-20 → 2`, `T-19 → 3`,
`T-0 → 22`, `T+1 → 23`, und ab der Schwelle `CLOSEST_ONLY`. Dazu die Kopplung: `Phase` und `Award`
schlagen bei derselben Runde um.

**Einfrieren** — `award_rule` und `award_points` einer bestehenden Runde ändern sich nicht, wenn der
Admin danach `phase_two_start_round` verschiebt.

**Punkte** — `live` bleibt `null`, bis der Betrachter selbst getippt hat; `stable` schließt die
laufende Runde aus; eine Community ohne Runden ergibt `0`.

**Hygiene** — Feldmengen-Test auf `present(params)` je Spiel; für Guess Hue exakt
`description, initHue, saturation, lightness`, fällt um, sobald `hue` sich einschleicht.
`ModularityTests` grün mit den Kanten oben.

**Lab** — der Zwei-Tor-Test bleibt (`app.game-lab.enabled=false` ⇒ Beans weg, Endpunkt 404); dazu neu,
dass derselbe Seed dieselbe Runde ergibt, ein anderer Seed oder eine andere Phase die vorige verdrängt,
und dass eine Lab-Runde in Phase 2 dieselben Punkte vergibt wie eine echte — der Test, der die
Zusammenlegung überhaupt wert macht.

## Umsetzungsschnitt

1. **Durchlauf** — Migration `community/V3`, `CommunityEdition` + Repository, aktive-Edition-Query,
   `CountdownService` liest die Edition, `CommunityResponse` nach außen **additiv** (Felder kommen
   hinzu, keins fällt weg), API-Aktion
   „neuen Durchlauf starten“.
2. **Ansage** — Modul `game`, Schema, `GameType` / `GameCatalog` / `GameTypeHandle`, Auflösung,
   `GuessHueGameType` mit `draw` und `present`, Ansage-Endpunkt.
3. **Spielen** — Aufdecken/Tippen, `judge` in Guess Hue, `awardFor` samt beiden Vergaberegeln und
   Neuauswertung, Tippübersicht, echte Standings, Umzug von `MemberPointsConfiguration` und
   `StubMemberPoints`.
4. **Lab** — Umbau auf `GameCatalog`/`GameType`, Phasen-Wähler, Löschen von `LabGame`,
   `GuessHueLabGame`, `SampleLabGame` und dem Sichtbarkeits-Schalter; Korrektur von `game-lab.md`.
   **Umgesetzt** — der Vertrag (`GameType`, `GamePayload`/`GameOutcome`/`GameSolution`, `Judgement`,
   `GameRandom`, `GameCatalog`/`GameTypeHandle`, `Phase`, `Award`/`awardFor`, `Verdict`/`pointsFor`,
   `InvalidGuessException`) ist dafür ins Basis-Package `game` gezogen, weil das Lab jetzt sein
   Konsument ist.

2 und 3 sind getrennt beschreibbar, gehen aber vermutlich zusammen live — eine Ansage, die man nicht
spielen kann, ist ein halbes Feature. 4 kommt **nach** 3, nicht davor: das Lab zieht auf Klassen um, die
erst dann fertig sind, und es ist Werkzeug — es darf das Spiel nicht aufhalten.

## Was hier revidiert wird

Die Anti-Cheat-Spec ist als „Absichtserklärung, kein beschlossenes Design“ ausgewiesen und schreibt
selbst: „was sich dort als falsch erweist, wird hier korrigiert, nicht verteidigt.“ Diese Spec nutzt
das an drei Stellen:

| | vorher | jetzt |
|---|---|---|
| Punkt 1 | zwei persistierte Seeds, zwei Vertrauensniveaus | ein Params-Blob als einziges Rundengeheimnis, zwei Ausgänge |
| Frage 5 | harter Aufdeck-Lockout oder idempotent, offen | idempotent + `reveal_count`; Schwelle erst mit Zeitwertung |
| Frage 7 | woraus wird der Seed abgeleitet? | aus nichts — er wird gezogen und nicht gespeichert |
| Frage 8 | wo leben Spiel-Runden im Modulith? | Modul `game`, Schema `game`, zwei Tabellen |

Dazu am Game-Lab: der Schalter `revealsOthersBeforeGuess` entfällt, und das Lab läuft nicht mehr neben
dem Framework, sondern durch es — `LabGame`, `GuessHueLabGame` und `SampleLabGame` fallen weg. Die
Lab-Spec beschrieb `LabGame` als „eine Vermutung, kein Vertrag“ und sagte, sie werde sich am ersten
echten Spiel ändern. Das ist jetzt eingelöst.

## Was bewusst offen bleibt

- **Das Frontend der echten Runde.** Der Umsetzungsschnitt oben hat vier Scheiben, und alle vier sind
  Backend: die Endpunkte stehen (`GET …/rounds/current`, `POST …/reveal`, `POST …/guess`), aber keine
  Seite ruft sie auf. Wer spielen will, kommt nur über das Lab hinein — und das ist ein Werkzeug für
  Entwickler, kein Spielerzugang. Das war je Scheibe die richtige Grenze, hinterlässt aber einen
  Zustand, in dem ein vollständiges Backend keinen Weg nach draußen hat, und gehört deshalb hierhin
  statt nur in ein Planpapier. Die Bausteine liegen bereit: `GuessHueBoard` und `GuessHueReveal` samt
  Toleranzbogen sind spielunabhängig genug, dass das Lab und die echte Runde sie teilen können —
  `GuessHueBoard` nimmt seine Toleranz als Prop und weiß nichts über Phasen. Was fehlt, ist ein
  `rounds`-API-Modul, eine Seite an der Community und die Entscheidung, wann das Aufdecken passiert:
  es startet die Uhr und ist nicht zurücknehmbar, darf also nicht als Nebeneffekt des Seitenaufrufs
  geschehen. Dazu die Anzeige, die weiter unten schon benannt ist: unter `CLOSEST_ONLY` sind die
  Punkte der laufenden Runde vorläufig und sollten auch so dastehen.
- **Zeitwertung.** Kein Spiel wertet heute auf Zeit. `revealed_at` und `guessed_at` liegen bereits
  richtig, aber welche Kompensation die RTT braucht (Anti-Cheat, offene Frage 2), entscheidet erst
  das Spiel, das darauf wertet.
- **Commit-Reveal.** Variante (a), Commit auf die Lösung, braucht ein Salt und eine Spalte — beides
  additiv.
- **Anomalie-Erkennung.** Braucht Runden mit echten Spielern, bevor Grenzen mehr als Raten sind.
- **Fast Rounds.** Eine Spalte `round_minor` plus erweiterter Index, wenn es soweit ist.
- **Reichere Auswahlregeln** („nicht innerhalb der letzten drei“, gleichmäßige Verteilung, Gewichtung,
  Verfügbarkeit je Community). Die erste Fassung ist „nicht zwei gleiche hintereinander“; `GameSelection`
  bekommt die ganze Historie und die Kandidatenliste, damit das später eine Änderung an einer reinen
  Funktion ist.
- **Wiederholungsvermeidung *innerhalb* eines Typs** („nicht dieselbe Farbe wie letzte Woche“). Mit
  eingefrorenen Params ist die Historie lesbar, also ist das später ein Filter beim Ziehen — heute
  nicht gebaut.

## Feed knowledge back

Nach der Umsetzung gehören in `.claude/guidelines/` — vermutlich als neue Datei `game-rounds.md`,
plus Korrekturen an `game-lab.md`:

- **Der Durchlauf ist die Rundenkoordinate**, nicht die Community: ein wiederkehrendes Ziel-Event
  macht `(community, T-n)` mehrdeutig. Alles, was an einer Runde hängt, hängt an `edition_id`.
- **Größere Rundennummer = früher.** Grenzen heißen `from`/`until`, nie start/end, und „Vorrunde“
  ist `round_number > n`.
- **Was pro Runde festliegen muss, wird bei der ersten Ansage materialisiert** — lazy, per
  `ON CONFLICT DO NOTHING` + `SELECT`, weil eine Constraint-Verletzung die Transaktion rollback-only
  macht. Persistieren ist erlaubt; die Anti-Cheat-Randbedingung verbietet *wiederkehrenden
  Admin-Aufwand*, nicht Speicher.
- **Ein Geheimnis pro Runde, zwei Ausgänge.** Ein ausgelieferter Wert darf nie derselbe sein wie
  einer, der die Lösung treibt. Ein Seed, der aus Rundenkoordinaten ableitbar ist, ist kein
  Geheimnis.
- **Punkte sind ein Cache über persistierten Eingaben** — deshalb ist eine Wertungs-Korrektur ein
  Backfill und kein Verlust, und deshalb braucht „ein späterer Tipp nimmt Punkte weg“ keinen
  Mechanismus, sondern nur eine Neuauswertung der Runde.
- **Das Spiel urteilt, das Framework vergibt.** Ein Spiel sagt „punkte-berechtigt“ und „so weit
  daneben“; wie viele Punkte das wert ist und wessen Punkte dabei verfallen, ist über alle Spiele
  gleich. Die Grenze verläuft an dem Wert, den das Framework *vergleichen*, aber nicht *berechnen*
  kann. Regel *und* Punktzahl kommen aus **einer** Funktion und werden pro Runde eingefroren — dann darf
  die Balance sich jederzeit ändern, ohne Historie zu kosten.
- **Eine portierte Regel trägt den Namen des Originals im Kommentar, nicht im Bezeichner.** Der
  Bezeichner sagt, *was* passiert (`CLOSEST_ONLY`), der Kommentar, *woher es kommt* („winner takes it
  all“, „Schlag den Raab“) — sonst sucht später niemand die Stelle im Referenzprojekt. Kurz halten:
  ein paar Worte, kein Aufsatz.
- **Eine Regel, die wachsen soll, bekommt ihre Eingabe vollständig** — nicht das, was die erste Fassung
  gerade braucht. `GameSelection` nimmt die ganze Historie und die Kandidatenliste, obwohl „nicht zwei
  gleiche hintereinander“ mit einer Zeile auskäme; dadurch ist die nächste Regel eine Änderung an einer
  reinen Funktion und nicht an Query, Service und Tests. Das ist kein Vorgriff, solange die vollständige
  Eingabe billig ist — hier ≤ 60 winzige Zeilen, einmal je Runde.
- **Wer fremde Zeilen schreibt, muss serialisieren.** Eine Auswertung über die ganze Runde braucht
  eine Zeilensperre auf der Runde, sonst verliert genau der Moment, in dem sich die Punkte
  verschieben, ein Update.
- **Was aus Zeitstempeln replaybar ist, braucht keine Spalte.** Liegen die Eingaben unveränderlich und
  datiert vor, ist jeder Zwischenzustand rekonstruierbar; „ich brauche eine Spalte für den Moment X“
  gilt erst, wenn der Replay ihn *nicht* hergibt. Ein Log-Eintrag deckt den Betriebsfall, ohne die
  Auswertung zustandsbehaftet zu machen.
- **Ein Schalter, dessen richtige Antwort für alle Fälle gleich ist, ist ein Bug.** Er verlagert eine
  Invariante in einen Review-Punkt. `revealsOthersBeforeGuess` ist das Beispiel.
- **Unique-Index statt Service-Prüfung**, und ein `UPDATE … WHERE guessed_at IS NULL` statt
  Lesen-dann-Schreiben.
