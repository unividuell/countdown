# Runden per Tageslauf materialisieren

**Status:** beschlossenes Design (2026-10-11).

**Baut auf:** der [Rundenauswahl](2026-08-11-round-game-selection-design.md) (Materialisierung beim
ersten Abruf), dem [Einfrieren der Edition](2026-08-16-edition-freeze-design.md) (`frozenSince`) und
[Anspielung](2026-08-20-song-snippet-design.md) (Hook `materialised`, Freigabe der Stufen-Assets —
dort noch „bewusst kein Scheduler“).

**Berührt:** `AnnouncementService`, `RoundGameStore`/`RoundGameRepository`, `CommunityQuery`,
`EditionFreeze`, die KDoc von `GameType.releaseStageAssets`; `game-rounds.md` und `countdown.md`.
Im Frontend nur der Hinweis zum Einfrieren in den Community-Einstellungen.

## Zweck

Heute legt der erste `GET` einer Runde deren Zeile in `game.round_games` an. Das hat zwei Nachteile:

1. **Ein Spieler würfelt.** Wer zuerst öffnet, zieht mit seinem Aufruf das Seed — harmlos, aber die
   Runde hängt dann an einer Person und ihrem Zeitpunkt.
2. **Lücken.** Öffnet niemand die Runde, entsteht keine Zeile; die Historie springt.

Künftig legt ein **täglicher Lauf** die Runden aller aktiven Editionen an, einen Tag im Voraus. Der
`GET` bleibt als Fallback.

## Abgrenzung — was ausdrücklich nicht gebaut wird

- **Kein Nachfüllen vergangener Lücken.** Was vor diesem Feature oder während eines Ausfalls fehlt,
  bleibt fehlend.
- **Kein Lauf beim Start der App.** Was ein Deploy um 03:00 verpasst, fängt der Fallback.
- **Kein Aufholen über mehrere Tage**, nur laufende und nächste Runde.
- **Kein ShedLock.** Eine Instanz pro Umgebung; `ON CONFLICT DO NOTHING` deckt Doppelläufe ohnehin.
- **Keine Fast Rounds.** Siehe *Offen*.

## Warum vorausarbeiten

Eine Rundengrenze liegt bei der Uhrzeit von `startsAt` in `startsAtTimezone` — je Community eine
andere. Ein einziger Tageslauf trifft diese Grenzen nicht; er kann nur die **nächste** Runde vorab
anlegen. Bei Rundenlänge ein Tag beginnt sie immer innerhalb von 24 Stunden nach dem Lauf.

Zusätzlich legt der Lauf die **laufende** Runde an, falls sie fehlt. Das passiert nur, wenn der
Vortageslauf sie verpasst hat (Deezer um 03:00 nicht erreichbar, Server down, Rollout-Tag, Edition
tagsüber geplant, DST außerhalb Berlins — s. u.) **und** sie seitdem niemand geöffnet hat. Ohne
diesen Schritt bliebe dort genau das Loch, das das Feature schließen soll. Kosten: ein `find` pro
Edition und Lauf.

## Ablauf

```
03:00 Europe/Berlin
MaterialisationSchedule.run()                     game.internal, @Scheduled
  └─ für jede Edition aus communities.activeEditions()      archived_at IS NULL
       startsAt == null            → überspringen
       n = engine.roundAt(now).number
       für r in [n, n−1]:
         windowReasonOf(r) != null → überspringen
         store.find(r) != null     → überspringen           egal, woher die Zeile kam
         materialiser.materialise(edition, r)    eigene Tx je Runde
           Fehler → warn(edition, r), weiter
       materialiser.releaseStagesOlderThan(edition, n)

GET /current → AnnouncementService.resolve
  existing ?: materialiser.materialise(edition, n)           Fallback, wie heute
```

### Komponenten

- **`RoundMaterialiser`** (neu, `game.internal`) übernimmt den heutigen Körper von
  `AnnouncementService.materialise` unverändert: Auswahl, Draw, `store.announce`, Hook
  `materialised`. Das Seed bleibt aus `SecureRandom` gezogen — nur zieht es jetzt der Server.
  `communityId` kommt aus `edition.communityId`; der Lauf braucht weder Slug noch Mitgliedschaft.
- **`AnnouncementService`** behält das Gate (Mitgliedschaft, Lauf, Fenster) und ruft für eine
  fehlende Zeile den Materialiser.
- **`MaterialisationSchedule`** (neu, `game.internal`): die Schleife oben, `@Scheduled`.
- **`CommunityQuery.activeEditions()`** (neu, `community`): explizites SQL auf
  `archived_at IS NULL`, im Muster von `activeEditionOf`.

### Transaktionen

**Eine Transaktion pro Runde**, nicht pro Edition: scheitert `n−1` an Deezer, bleibt `n` bestehen.
Die Freigabe läuft in einer eigenen. Netzwerk-I/O im Hook liegt weiter in der Transaktion, wie heute
im `GET`.

### Konfiguration

`countdown.game.materialisation-cron`, Default `0 0 3 * * *`. Zone fest `Europe/Berlin`
(= `CommunityEdition.DEFAULT_TIMEZONE`). Die Test-`application.yaml` setzt `"-"` — Springs
eingebautes „aus“ —, sonst legte ein CI-Lauf um 03:00 nebenher Runden an. Eine Property statt eines
zweiten Schalters. `@EnableScheduling` sitzt auf einer Konfigurationsklasse im `game`-Modul.

### Logging

- `warn` pro gescheiterter Runde: Edition-ID, Rundennummer, Exception.
- `info` pro Lauf: „n rounds materialised across m editions“. Ein still ausbleibender Lauf ist genau
  die degradierende Stelle, die `logging.md` meint.

### Zeitumstellung

Läuft der Cron in Europe/Berlin, trifft für Berliner Communities genau ein Lauf jede Runde — beide
verschieben sich gemeinsam. Bei anderen Zeitzonen kann an DST-Tagen eine 23-Stunden-Runde zwischen
zwei Läufe fallen; die Runde danach legt der nächste Lauf dann als laufende an, bis zu eine Stunde
nach ihrem Beginn. Der Fallback deckt diese Stunde.

## Die vorab angelegte Runde ist unerreichbar

Neu ist, dass `params` — samt Lösung — bis zu einen Tag vor Rundenbeginn in der Datenbank liegt. Kein
Pfad gibt eine Runde jünger als die laufende heraus: `HistoryService.resolve` lehnt alles nicht
strikt Ältere ab, `PlayService.asset` wirft für `roundNumber < current`, `ReviewService` nimmt nur
laufende und vorige Runde, Punkte summieren nur beendete. Diese Wächter gab es schon; sie wurden nur
nie mit einer existierenden jüngeren Zeile geprüft. Test 10 unten pinnt das.

## Einfrierpunkt einen Tag früher

Bisher `frozenSince = startsAt − (f+1) Tage`, der Beginn von Runde `f = gamesFromRound` — begründet
als „frühester Moment, in dem jemand eine Runde ankündigen kann“. Das stimmt nicht mehr: der Lauf
legt `f` schon an, während `f+1` läuft.

Neu: **`frozenSince = startsAt − (f+2) Tage`**, der Beginn von Runde `f+1`. Unbegrenztes Fenster
bleibt `Instant.MIN`.

```
         Runde 15 (kein Spiel)          Runde 14 (erstes Spiel)
  ──18:00────────03:00────────────18:00──────────────────
     ▲ neu frozen  ▲ Lauf legt 14 an  ▲ bisher frozen
```

Für Admins sichtbar am 409, einen Tag früher. Das Frontend erhält `editionFrozen: boolean` und
rechnet nichts selbst — nur der Hinweis unter dem Startfeld verspricht „Änderbar, bis die erste
Spielrunde beginnt“ und wird zu „Änderbar bis einen Tag vor der ersten Spielrunde“.

**Folge:** `phaseTwoStartRound` und das Spielfenster wirken nur auf Runden, die noch nicht angekündigt
sind — die von morgen ist meist schon festgeschrieben. Kein Mechanismus, ein Satz in `countdown.md`.

## Freigabe nur älter als laufend

`releaseEarlierStages` gibt heute alle Runden **außer der gerade angekündigten** frei
(`round_number <> n`). Mit Vorab-Anlage wäre das die laufende: der Lauf um 03:00 nähme der
laufenden Anspielung ihre Leiter. Ebenso träfe der Fallback ein schon vorhandenes `n−1`, etwa wenn
im Lauf `n` scheiterte und `n−1` gelang.

Neu: **`roundIdsOlderThan(n)`** mit `round_number > n` (größere Nummer = früher), aufgerufen

- vom Lauf einmal pro Edition mit der laufenden Runde `n`, auch wenn er nichts anlegt — indizierter
  `DELETE`, idempotent;
- vom Fallback mit `n`, wie heute.

Kosten: die Leiter einer beendeten Runde lebt bis zum nächsten Lauf, bis zu 24 Stunden länger als
heute — eine Leiter, einige MB, pro Community.

## Tests

**Neu: `MaterialisationScheduleTest`** — Unit-Test mit mockk und fester `Clock`, ruft `prepare`
und `run` direkt:

1. Legt laufende und nächste Runde an.
2. Eine Runde mit Zeile wird übersprungen, egal woher die Zeile kam.
3. Fenster: laufend = `gamesUntilRound` → nur diese; laufend = `f+1` → nur `f`; nach dem Fenster
   → keine.
4. Edition ohne `startsAt` → nichts, auch keine Freigabe.
5. Scheitert eine Runde, entstehen die andere Runde und die nächste Edition trotzdem; scheitert eine
   Freigabe, ebenso.
6. Die Freigabe läuft mit der laufenden Runde, auch wenn nichts angelegt wurde.

**Neu: `MaterialisationScheduleBootTest`** — Testcontainers, Test-Transaktion, ruft `prepare` für die
eigene Edition. Nicht `run`: der sähe die Editionen anderer Testklassen im selben Kontext.

7. Laufende und nächste Runde sind persistiert; ein zweiter Aufruf ändert nichts.
8. Eine vorher geschriebene Zeile bleibt unverändert; `materialise` auf eine bestehende Runde
   (verlorenes Rennen gegen den Fallback) liefert diese Zeile ohne Fehler.
9. `releaseStageAssets` erhält genau die Runden älter als die laufende; laufende und nächste fehlen
   (Recorder aus `AnnouncementMaterialisedHookTest`).
10. History- und Asset-Pfad liefern für `n−1` `RoundNotFoundException` (404), obwohl die Zeile
    existiert.

**`CommunityQueryServiceTest`:** `activeEditions()` lässt archivierte Editionen aus.

**Angepasst:**

- `AnnouncementMaterialisedHookTest` (b): „älter als laufend“ statt „alle anderen“; dazu: der Fallback
  lässt ein vorab angelegtes `n−1` in Ruhe.
- `EditionFreezeTest`, `EditionFreezeGridParityTest`: `f+1`.
- `AnnouncementServiceTest` bleibt unverändert — er deckt den Fallback ab.

**Cron-Verdrahtung:** kein Unit-Test. App einmal mit
`SPRING_APPLICATION_JSON` und dem Cron `*/10 * * * * *` booten und die `info`-Zeile im Log sehen
(`configuration.md`: nach einer `application.yaml`-Änderung booten).

## Folgen für andere Dokumente

- **`game-rounds.md`**
  - „What must be fixed per round is materialised on the first announcement“ → „… a day ahead by
    the schedule; the announcement is the fallback“. Die Begründung für `ON CONFLICT` bleibt.
  - Neu: ein Tageslauf muss vorausarbeiten, weil Rundengrenzen Community-Ortszeit sind.
  - Neu: Freigabe „older than the running round“, nie „all but the one just announced“.
  - „A day nobody opened the app has no `round_games` row“ → Lücken entstehen nur noch, wo Lauf
    und Fallback beide verfehlen. Die Zeiger-Begründung bleibt.
  - „`releaseStageAssets` fires for every round but the one just announced“ → älter als laufend.
- **`countdown.md`** — Einfrierabschnitt: `f+1` statt `f`; `phaseTwoStartRound`/Fenster treffen nur
  noch nicht angekündigte Runden.
- **KDoc** von `AnnouncementService` („the announcement **is** the materialisation“) und
  `GameType.releaseStageAssets`.
- Die älteren Specs bleiben Historie.

## Offen

**Fast Rounds** (`countdown.md`, „Related / future“: mehrere Spiele pro Tag, `T{major}.{minor}`) gibt
es im Code nicht — nur die Skizze und den nie übergebenen Parameter `roundLength: Period` am
`CountdownEngine`. Der Lauf führt keine neue „ein Spiel pro Tag“-Annahme ein, er nutzt denselben
Schlüssel wie `GET`, Historie und Punkte. Für deren Spec kommen zwei Stellen dazu:

- Der Lauf iteriert Tagesnummern; mit Unterrunden legt er alle des nächsten Tages an. Passt, solange
  die Aufteilung des Tages um 03:00 feststeht — Spontanes fängt der Fallback.
- „Älter als laufend“ zählt Tage. Eine Unterrunde vom Vormittag hört mitten am Tag auf, spielbar zu
  sein; das sieht die Regel nicht — so wenig wie das heutige `<> n`.
