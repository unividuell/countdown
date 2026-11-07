# Edition erzeugen und bearbeiten

**Status:** beschlossenes Design (2026-11-05).

**Löst:** #120 (Sofortstart), #72 (Erste Spielrunde nicht leerbar, stumme Fehlermeldung),
#27 (`startsAt` nicht leerbar) — Letzteres anders als im Issue gedacht, siehe „Termin“.

**Baut auf:** `docs/superpowers/specs/2026-11-05-round-number-line-design.md` (Branch
`feature/round-numbering-redesign-820c15`). Alle Rundennummern hier sind in der **neuen**
Zählung: Runde `0` = letzter Tag vor dem Start, `1` = erster Eventtag, davor negativ.

**Reihenfolge:** Stacked PR. Sobald die Umsetzung der Rundennummerierung steht, zweigt diese
Arbeit von deren Branch ab, der PR zielt auf ihn. Schemaänderungen (`label` nullable, `starts_at`
und `games_from_round` `NOT NULL`) gehen **in place** in `community/V3__create_editions.sql`, das die
Rundennummerierung ohnehin umschreibt. Damit gibt es **einen** gemeinsamen Datenbank-Reset für
beide.

## Zweck

Eine Community besteht dauerhaft (Name, Slug, Mitglieder). Eine Edition ist ein Lauf darin
(Termin, Zeitzone, Spielfenster, Phase 2, Rangliste). Heute gilt „genau eine aktive Edition“:
`CommunityService.create` legt sofort eine an, und der Community-`PATCH` bearbeitet Community und
Edition in einem Aufwasch, mit „`null` = unverändert“.

Daraus entstehen die drei Issues: ein leeres Feld lässt sich nicht speichern (#27, #72), ein Fehler
kommt als „Speichern fehlgeschlagen.“ an (#72), und wer nach dem Anlegen nur einen Termin einträgt,
startet sofort die erste Spielrunde, ohne es zu merken (#120).

Künftig gilt **höchstens eine** aktive Edition. Null ist ein normaler Zustand: direkt nach dem
Anlegen einer Community und (später) nach dem Archivieren eines Laufs.

## Ziele

- Eine Community ohne aktive Edition funktioniert überall: Shell, Einstellungen, Countdown,
  Spiele, Super-Admin-Übersicht.
- Community und Edition haben getrennte Schreibwege. Der Community-`PATCH` ändert nur den Namen.
- Die Edition wird über ein eigenes Formular erzeugt und bearbeitet. Ein leeres Feld heißt „leer“.
- Ein Kalender im Formular zeigt, auf welche Tage Start, erste Spielrunde und Phase 2 fallen.
- Fehler beim Speichern zeigen den Grund.

## Nicht-Ziele

- **Archivieren.** Kommt später als eigene Aktion. Bis dahin endet kein Lauf.
- **Folgelauf mit übernommenen Einstellungen** (heute `EditionService.startNew` mit
  `inheritFrom`). Gehört zum Archivieren.
- Runden durch Antippen im Kalender setzen. Der Kalender zeigt nur an.
- `gamesUntilRound` im Formular. Bleibt beim Default `0`, wie heute.
- Datenmigration. Es gibt noch keine Nutzer; der Reset fällt mit dem der Rundennummerierung
  zusammen.

## Anti-Ziele

- Ein Formular, das wieder Community und Edition mischt, auch nicht als Zwischenlösung.
- Ein Kalender, der mehr erklärt, als Termine zu finden: keine Punkte, keine Abstufung im Einsatz.
- Ein leeres Feld, das stillschweigend den alten Wert behält.

## Ablauf (UI)

Mobile-first, Einstellungsseite `/c/[slug]/settings`.

```
 Community angelegt
        │
        ▼
 ┌─────────────────────────┐   „Edition erzeugen“   ┌──────────────────────┐
 │ Einstellungen           │ ─────────────────────▶ │ Edition-Formular     │
 │  Name  [Speichern]      │                        │  (leer, POST)        │
 │  Kein Lauf aktiv.       │ ◀───────────────────── │                      │
 │  [Edition erzeugen]     │       gespeichert       └──────────────────────┘
 │  Einladungslink …       │
 └─────────────────────────┘
        │ aktive Edition
        ▼
 ┌─────────────────────────┐  „Edition bearbeiten“  ┌──────────────────────┐
 │ Einstellungen           │ ─────────────────────▶ │ Edition-Formular     │
 │  Name  [Speichern]      │                        │  (befüllt, PUT)      │
 │  Hüttenwochenende 2026  │ ◀───────────────────── │                      │
 │  Kalender (nur Anzeige) │       gespeichert       └──────────────────────┘
 │  [Edition bearbeiten]   │
 │  Einladungslink …       │
 └─────────────────────────┘
```

1. **Keine aktive Edition:** Die Einstellungen zeigen nur den Namen (Slug bleibt unveränderlich),
   einen Hinweis, dass kein Lauf aktiv ist, und den Button **„Edition erzeugen“**.
2. **Edition erzeugen:** Formular mit allem, was die Edition braucht. Absenden erzeugt die Edition
   und macht sie aktiv.
3. **Aktive Edition:** Die Einstellungen zeigen eine Zusammenfassung (Bezeichnung, Start, Kalender)
   und den Button **„Edition bearbeiten“**. Er öffnet dasselbe Formular, befüllt.

Ob das Formular eine eigene Route ist oder in der Seite aufklappt, entscheidet der Builder.

### Formularfelder

| Feld | Pflicht | Bedeutung |
|---|---|---|
| Bezeichnung | nein | Leer: die Edition heißt wie die Community. |
| Start-Datum, Uhrzeit | ja | Siehe „Termin“. |
| Zeitzone | ja | IANA-Region, Default `Europe/Berlin`. |
| Erste Spielrunde | ja | Negative Zahl. Darunter das abgeleitete Datum („beginnt Do., 19. Nov. 18:00“). Siehe „Kein Sofortstart“. |
| Phase 2 ab | nein | Zahl ≤ 0, nicht vor der ersten Spielrunde. Leer: keine Phase 2. Darunter das abgeleitete Datum. |

Eine Zeile unter den Rundenfeldern nennt den Nullpunkt (Runde `0` = letzter Tag vor dem Start).

Ist der Lauf eingefroren (ab dem Tag vor der ersten Spielrunde), sind Start und Zeitzone
gesperrt, mit Hinweis warum. Das ist die heutige Freeze-Regel, unverändert.

### Bezeichnung

Die meisten Editionen brauchen keine eigene Bezeichnung und schon gar kein Jahr. Der Header zeigt
**Bezeichnung oder Community-Name**, dahinter wie heute `'JJ` aus dem Startjahr
(„Hütte Hütte '26“). Das Formular zeigt diese Kopfzeile als Vorschau.

### Kalender

Wie die Aktivitätsansicht auf GitHub:

- Spalten = Wochen, Zeilen = Wochentage Mo–So, Monatsnamen über der ersten Spalte eines Monats.
- Ein Kästchen pro Runde, datiert auf den Tag, an dem die Runde beginnt.
- Reicht von drei Runden vor der ersten Spielrunde bis zum Start-Kästchen (Runde `1`), vor und
  während des Laufs gleich; „heute“ ist nur markiert, wenn es darin liegt. Wird es breiter als der
  Bildschirm, scrollt es seitlich.
- Farben:
  - keine Spielrunde: neutral (Stone)
  - Phase 1: `--color-phase-one`
  - Phase 2: `--color-phase-two`, **einheitlich**
  - Start: dunkel
  - heute: Rahmen
  - ab hier fix: Kante mit Schloss an der Runde, mit deren Beginn der Lauf einfriert
- **Legende immer sichtbar.**
- Antippen eines Kästchens zeigt darunter Runde, Wochentag, Datum, Uhrzeit und Phase
  („Runde −1 · Fr., 18. Dez. 18:00 · Phase 2“).
- Im Formular rechnet der Kalender live mit den eingegebenen, noch nicht gespeicherten Werten.
  In der Zusammenfassung zeigt er die gespeicherte Edition.
- Solange Start oder erste Spielrunde im Formular fehlen, steht an seiner Stelle ein Hinweis.

Unter dem Kalender steht, ab wann Start und Zeitzone fest sind („ab Mi., 18. Nov. 18:00“).

Die Mockups (`.superpowers/brainstorm/…/edition-form-grid-v3.html`, nicht eingecheckt) zeigen
Ablauf, Kalender und Legende.

## API

| Methode | Pfad | Wirkung |
|---|---|---|
| `POST` | `/api/communities` | Legt Community und Admin-Mitgliedschaft an, **keine** Edition. |
| `GET` | `/api/communities/{slug}` | Liefert die Community, die aktive Edition als `edition` oder `null`. |
| `PATCH` | `/api/communities/{slug}` | Ändert **nur** den Namen. |
| `POST` | `/api/communities/{slug}/editions` | Erzeugt eine Edition. 409, wenn schon eine aktiv ist. |
| `PUT` | `/api/communities/{slug}/editions/active` | Ersetzt die aktive Edition vollständig. Bei optionalen Feldern heißt fehlend oder `null` leer, fehlende Pflichtfelder ergeben 400. 404 ohne aktive Edition. |

- **`PUT` statt `PATCH`** macht Bezeichnung und Phase 2 leerbar, ohne `Optional`/Clear-Flags:
  Das Formular schickt immer alle Felder, `null` heißt leer.
- Freeze-Verstöße und Validierungsfehler kommen mit einem lesbaren Grund zurück, und das Formular
  zeigt ihn an (#72). Dazu gehört „ein eingefrorener Lauf darf nicht wieder auftauen“. Muster:
  `webapp-vue/src/profile/saveError.ts` zitiert das `detail` des ProblemDetail.
- Der bestehende `POST …/editions` (`startNew`: archivieren + neu anlegen + Einstellungen erben)
  wird zu „nur anlegen“. Archivieren und Erben kommen mit dem Archivieren zurück.
- `CommunityResponse` trägt die Edition verschachtelt (`edition: … | null`) statt flach. Alle
  Frontend-Stellen, die heute `startsAt`, `startsAtTimezone` usw. von der Community lesen, lesen
  sie von dort (`App.vue`, `communities/*`, `RoundFallback.vue`, Super-Admin-Übersicht,
  Einstellungen).

## Backend

- `editions.label` wird nullable, `starts_at` und `games_from_round` werden `NOT NULL` (in place in
  V3). In `CommunityEdition` werden `startsAt` und `gamesFromRound` nicht-null; die Zweige für
  „Edition ohne Termin“ bzw. „unbegrenztes Spielfenster“ (Countdown, Spiele, Freeze,
  Materialisierung) entfallen. Sie fallen mit „keine Edition“ zusammen.
- `CommunityService.create` legt keine Edition mehr an. `CommunityService.update` fasst die
  Edition nicht mehr an.
- `EditionService.requireActive` und die Stellen, die eine aktive Edition voraussetzen
  (`CommunityController`), behandeln „keine Edition“ als normalen Fall.
- Countdown, Spiele, Materialisierung und Super-Admin-Übersicht kommen schon ohne Edition aus. Dort
  fallen nur die `warn`-Logs und Kommentare weg, die den Fall „Invariantenbruch“ nennen. Ebenso die
  Kommentare zu „genau eine aktive Edition“ in `CommunityEdition`, `EditionService` und
  `community/V3__create_editions.sql`.
- Der partielle Unique-Index (`archived_at IS NULL`) bleibt, er erzwingt schon „höchstens eine“.

## Termin

Eine erste Spielrunde ergibt nur zusammen mit einem Start einen Sinn. Deshalb sind **Start und erste
Spielrunde beide Pflicht**: Eine Edition hat immer einen Termin.

Der Zustand „Noch kein Termin“ heißt damit **„keine aktive Edition“**. Countdown und Spiele zeigen
ihn wie heute (`RoundFallback`). #27 wollte ein gesetztes `startsAt` wieder leeren können, etwa wenn
ein Event abgesagt wird. Das geht künftig über das Archivieren des Laufs, das noch nicht gebaut ist.
Bis dahin bleibt der Termin änderbar (bis zum Freeze), aber nicht leerbar.

## Kein Sofortstart (#120)

Heute heißt eine leere erste Spielrunde „ab der ersten Runde“, und das ist die laufende. Der Lauf
ist damit sofort eingefroren (`frozenSince` = `Instant.MIN`), und Spielrunden materialisieren
sofort. Dasselbe passiert mit einer gesetzten, aber zu frühen ersten Spielrunde (Start in 5 Tagen,
erste Spielrunde `−89`).

Entschieden:

- **`gamesFromRound` ist Pflicht**, in Formular und API (`POST` und `PUT`). Ein unbegrenztes
  Spielfenster gibt es nicht mehr. Der `Instant.MIN`-Zweig in `EditionFreeze` /
  `frozenSinceDescription` entfällt.
- **Das Backend lehnt eine Edition ab, deren Freeze-Zeitpunkt schon vorbei ist** (Beginn der Runde
  `gamesFromRound − 1`), mit lesbarem Grund. Gilt beim Erzeugen und für jede Änderung an einem
  noch nicht eingefrorenen Lauf.
- **Ein schon eingefrorener Lauf** bleibt bearbeitbar wie heute: Start und Zeitzone fest, und er
  darf nicht wieder auftauen. Die neue Regel greift dort nicht.

Das Formular zeigt die Verletzung schon vor dem Absenden unter dem Kalender an (rote Zeile), der
Server ist die Instanz, die entscheidet.

**Nachtrag (2026-11-05):** Die Regel „Freeze-Zeitpunkt muss in der Zukunft liegen“ erzwang ein bis
zwei Tage Wartezeit. Jetzt darf die erste Spielrunde die laufende Runde sein (der Lauf ist dann von
Anfang an fest), nur keine schon vorbei gegangene. Das Formular verlangt dafür eine Bestätigung
(„Sofort starten“). Den Fehler aus #120 verhindert weiter die Pflicht-Spielrunde.

## Dem Builder überlassen

- Eigene Route oder Aufklappen für das Formular.
- Wortlaut von Hinweisen und Fehlermeldungen (deutsche Anführungszeichen „…“).
- Ob der Kalender die Runden-Daten selbst rechnet (Luxon, kalenderbewusst in der Zeitzone, wie
  `CountdownEngine`) oder vom Server bekommt. Er muss mit dem Backend übereinstimmen,
  `.claude/guidelines/cross-runtime-parity.md` beachten.
