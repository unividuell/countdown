# Runden auf dem Zahlenstrahl

**Status:** beschlossenes Design (2026-11-05).

**Ersetzt:** die Nummerierung in `.claude/guidelines/countdown.md` („Round numbering — count-down
with a round 0“) samt `T−`/`T+`-Anzeige.

**Berührt:** `CountdownEngine` und alles, was Rundennummern vergleicht, verrechnet oder sortiert —
Backend, Frontend, SQL, Migrationen, Leitlinien.

## Zweck

Heute fällt die Rundennummer mit der Zeit: `T−89 … T−1, T−0, T+1, …`, intern `89 … 1, 0, −1, …`.
„Größer ist früher“ widerspricht dem Zahlenstrahl im Kopf. Spätestens beim Setzen der ersten
Spielrunde muss man das einem Community-Admin erklären („Größere Nummer = früher“ steht heute als
Hinweis im Formular).

Künftig steigt die Nummer mit der Zeit:

```
… −90  −89  …  −1   0 │ 1   2  …  20 …
                      │
                   startsAt
```

## Die neue Nummer ist die negierte alte

`neu = −alt`. Nichts verschiebt sich um eins:

- **`0`** bleibt der letzte Tag vor dem Start: `[startsAt − 1 Tag, startsAt)`.
- **`1`** ist der erste Eventtag (heute `−1`, angezeigt `T+1`): `[startsAt, startsAt + 1 Tag)`.
- **`−89`** liegt 89 Tage vor Runde `0` (heute `89`, `T−89`).

```
Runde m = [ startsAt + (m−1) Tage , startsAt + m Tage )
```

Tage kalenderbewusst in `startsAtTimezone`, Beginn inklusive, Ende exklusiv — wie heute.

**Ankerfall** (vom Nutzer, wörtlich als Test übernehmen): `startsAt` = 2027-06-24 11:00
`Europe/Berlin` (MESZ). Um 2027-06-24 10:00 läuft Runde `0`, auf der Uhr stehen noch 0 Tage,
0 Stunden, 60 Minuten (`00:01:00:00`). Um 11:00 beginnt Runde `1`.

Weil die Abbildung eine reine Spiegelung ist, bleibt jede bestehende Regel inhaltlich gleich; nur ihre
Schreibweise kippt (`<` ↔ `>`, `+ 1` ↔ `− 1`, `MIN` ↔ `MAX`, `ASC` ↔ `DESC`, `from`/`until` tauschen
die Rolle in Ungleichungen). `gamesUntilRound = 0` bleibt `0`.

## Ziele

- Rundennummern steigen mit der Zeit — in Datenbank, API, Code und UI.
- Ein Admin trägt die erste Spielrunde als negative Zahl ein (z. B. `−89`), ohne Erklärung zur
  Richtung.
- **Kein Verhalten ändert sich** außer der Anzeige: gleiches Spiel am gleichen Tag, gleiche
  Schwierigkeitskurve, gleiche Phase-2-Grenze, gleicher Freeze-Zeitpunkt, gleiche Historie.

## Nicht-Ziele

- Keine Datenmigration. Alle Datenbanken (lokal, Staging, Prod) dürfen gelöscht werden.
- Keine inhaltliche Korrektur bestehender Regeln, auch wenn sie beim Umbau fragwürdig wirken (z. B.
  `phaseTwoStartRound > 0` → wird `< 0`, nicht neu gedacht). Auffälliges wird notiert, nicht gefixt.
- Keine Fast Rounds. Sie heißen später `1.2` statt `T+1.2`; mehr nicht.
- Alte Specs unter `docs/superpowers/` bleiben, wie sie sind — sie dokumentieren ihren Stand.

## Anti-Ziele

- **Eine übersehene Stelle läuft in die alte Richtung.** Das ist die zentrale Sorge: Die Richtung
  steckt nicht an einer Stelle, sondern in vielen Vergleichen, und `Int` bleibt `Int` — der Compiler
  meldet nichts. Beispiel: `countdown.ts` erkennt „Event läuft“ an `round.number < 0`; nach dem
  Umbau kompiliert das und zeigt den Countdown verkehrt herum.
- Tests, die mitgekippt werden und dadurch einen Fehler festschreiben, statt ihn zu fangen.

## Anzeige

- **Spiel-Header:** die Zahl, wie sie ist — `-89`, `0`, `1`.
- **Countdown:** kein Vorzeichen, kein `T−`. Die Laufrichtung trägt die Information: vor dem Start
  zählt er herunter (Tage = `|Nummer|`), ab `startsAt` hoch. Die Vorlesefassung bleibt bei „Noch …
  bis zum Start“ / „Laufzeit …“.
- **Link-Vorschau** (`PreviewService.describe`, sehen auch Nicht-Mitglieder): vor dem Start wie der
  Countdown ohne Vorzeichen — „Noch 58 Tage: Spiel mit!“, Runde `−1` „Noch 1 Tag: Spiel mit!“,
  Runde `0` „Noch 0 Tage: Spiel mit!“. Ab dem Start unverändert „Spiel mit!“.
- **Einstellungen:** „Erste Spielrunde“ und „Phase-2-Startrunde“ nehmen negative Zahlen. Der Hinweis
  „Größere Nummer = früher“ fällt weg; an seine Stelle tritt eine Zeile, die den Nullpunkt nennt
  (Wortlaut dem Builder überlassen, deutsche Anführungszeichen „…“).

## Absicherung — drei Netze

Jedes fängt, was die anderen durchlassen.

### 1. Zeit als Orakel (vor dem Umbau)

Ein Backend-Integrationstest lässt **eine Edition durch die Zeit laufen** (Clock tageweise vor,
Tageslauf je Tag) und prüft nur zeitliche Fakten:

- an welchem Datum das erste Spiel kommt und an welchem das letzte;
- dass die Runde am Vortag des ersten Spiels angekündigt wird (Materialisierung einen Tag voraus);
- dass Start und Zeitzone bis zum Freeze änderbar sind und ab dann 409 liefern;
- Schwierigkeit: beim ersten Auftreten eines Spiels `0.0`, danach über die Zeit nicht fallend, in
  der letzten Spielrunde `1.0`;
- ab welchem Datum Phase 2 gilt;
- dass `previousRoundNumber` und das Nachladen der Historie in die Vergangenheit führen;
- dass die nächste Runde dort beginnt, wo die laufende endet.

**Der Test enthält keine Rundennummer als Literal.** Wo die Konfiguration eine Nummer braucht
(`gamesFromRound`, `phaseTwoStartRound`), leitet er sie aus einem Datum ab (`engine.roundAt(datum)`).
Er wird **vor** dem Umbau geschrieben und ist grün; der Umbau-Commit **ändert diese Datei nicht**
(`git diff` darauf leer). Bleibt er grün, hat keine Stelle die Richtung verloren.

Die Engine selbst — von der dieser Test die Nummern bezieht — pinnen neue, datumsverankerte Vektoren
(Ankerfall, DST-Tage, exakte Grenzen) und eine Monotonie-Eigenschaft: `t₁ < t₂ ⇒ roundAt(t₁) ≤
roundAt(t₂)`.

### 2. Compiler als Inventur

Die richtungstragenden Namen **vorübergehend umbenennen** — mindestens `Round.number`,
`gamesFromRound`, `gamesUntilRound`, `phaseTwoStartRound`, `previousRoundNumber`, in Kotlin wie in
TypeScript (`vue-tsc -b`). Jede Fehlermeldung ist eine Fundstelle. Jede wird eingeordnet:
**reicht durch** (Pfad-Parameter, Weitergabe) oder **trägt Richtung** (Vergleich, Arithmetik,
Sortierung, Min/Max, Grenzwert, Anzeige). Danach zurückbenennen; der dauerhafte Diff bleibt klein.

### 3. grep für den Rest

Was kein Compiler sieht: SQL in Strings (z. B. `round_number > :after … ORDER BY round_number ASC`
und `MIN(round_number)` in `RoundGameRepository`), **Reihenfolge-Verträge** zwischen Abfrage und
Aufrufer (`difficultyOf` nimmt `history.last()` als älteste Runde, weil `historyOf` aufsteigend
sortiert — `first`/`last`, `sortedBy`, `reversed`, `minOf`/`maxOf`), Migrationen und `CHECK`-Constraints,
Test-Fixtures mit Nummern, KDoc/Kommentare („larger = earlier“, „next = current − 1“), UI-Texte,
Leitlinien.

### Inventur als Artefakt

Die Liste aus 2 und 3 — jede Stelle mit Einordnung — steht in der PR-Beschreibung, damit der Review
sie abhaken kann.

## Bekannte Stellen (Startliste, nicht vollständig)

Vollständig macht sie erst die Inventur.

| Ort | Heute |
|---|---|
| `CountdownEngine` | Formel, `labelOf` (`T−`/`T+`) |
| `CountdownService` | nächste Runde = `current.number − 1` |
| `MaterialisationSchedule` | nächste Runde = `current − 1` |
| `Window.kt` | `gamesUntilRound ≤ n ≤ gamesFromRound` |
| `Difficulty.kt` | `(first − n) / (first − until)` |
| `Awards.kt` | Phase 2 bei `n ≤ phaseTwoStartRound` |
| `EditionFreeze.kt` | `minusDays(gamesFromRound + 2)` |
| `EditionService.validate` | `phaseTwoStartRound > 0`, `from ≥ until` |
| `RoundGameRepository` | `round_number > :after`, `ASC`, `MIN`, `notOlderThan`/`notNewerThan` |
| `community/V3__create_editions.sql` | `CHECK (games_from_round >= games_until_round)` |
| `PreviewService` | `round.number >= 0` = vor dem Start, Text aus `round.label` |
| `countdown.ts` | `round.number < 0` = nach dem Start, `prefix` `T+`/`T−` |
| `settings.vue` | `min="1"`, Hinweis „Größere Nummer = früher“ |
| `gamelab/header.ts` | `labRoundNumber` liefert `0 … 140` („T-0 … T-140“) |
| `CommunityEdition` | KDoc „the *larger* number“ |

## Datenbank & Deploy

Bereits angewandte Migrationen werden **direkt umgeschrieben** (Constraint und Kommentar in
`community/V3__create_editions.sql`), keine neue angehängt. Folge: Flyway-Prüfsummen weichen ab, die
App startet gegen alte Datenbanken nicht. Der **DB-Reset auf Staging und Prod** gehört als
Einmal-Schritt in die PR-Beschreibung.

**Lokal** teilen sich Hauptcheckout und alle Worktrees eine Postgres (`compose.yaml`: `name:
countdown`). Sie wird gelöscht, sobald dieser Branch sie braucht. Andere Checkouts — auch `develop` —
starten danach erst wieder, wenn sie die Änderung enthalten. Bewusst in Kauf genommen.

Seeds sind gezogen, nicht aus `(edition, runde)` abgeleitet — die Nummer fließt in keinen Zufall.

## Leitlinien

- `countdown.md`: Abschnitt zur Nummerierung neu (Zahlenstrahl, Formel, Ankerfall); die
  Abweichung von huettehuette umfasst jetzt auch die Nummerierung und die Anzeige.
- Alle übrigen Leitlinien per grep auf „larger … earlier“, `T−`, `T+` prüfen.
- Übertragbare Regel festhalten (siehe *Feeding knowledge back*): Rundennummern steigen mit der
  Zeit; `0` ist der letzte Tag vor dem Start.

## Commit-Schnitt

1. Zeit-Orakel-Test — grün gegen die alte Nummerierung.
2. Der Umbau in einem Commit: Engine, alle Fundstellen, Migrationen, übrige Tests. Der Orakel-Test
   bleibt unberührt.
3. Leitlinien.

## Meine Entscheidungen (zum Prüfen)

- **`label` entfällt** (`Round`, `RoundDto`, TS-Typ `Round`, `CountdownView.label`, `labelOf`): Es
  wiederholte nur die Zahl. Fast Rounds brauchen später ein eigenes Konzept, keinen Platzhalter
  jetzt.
- **Kein typografisches Minus** im Header; die Zahl wird gerendert, wie sie ist.
- **Migrationen in place** statt angehängt (s. o.).
- **Labor:** `labRoundNumber` liefert `−140 … 0`.
- **Link-Vorschau:** Singular „Noch 1 Tag“.

## Dem Builder überlassen

- Wortlaut der Hinweiszeile in den Einstellungen.
- Ob `min`/`max` am Eingabefeld gesetzt wird (Backend-Validierung bleibt maßgeblich).
- Aufbau des Orakel-Tests (eigene Klasse, Helfer), solange er keine Nummer-Literale enthält.
- Wie bestehende Engine-Tests übertragen werden (negieren oder neu schreiben); die neuen
  datumsverankerten Vektoren sind Pflicht.
