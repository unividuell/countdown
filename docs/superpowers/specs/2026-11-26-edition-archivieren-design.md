# Edition archivieren

## Warum

Eine Edition endet. Danach soll die nächste starten können, die DB sauber bleiben und nichts mehr
an Nutzern hängen. Was bleibt, ist die Endrangliste: genug, um das Abschluss-Poster später (etwa in
einer Editions-Historie pro Community) wieder zu zeichnen. Welches Spiel vor zwei Jahren in Runde N
lief, interessiert niemanden.

## Ziele

- Admins beenden die aktive Edition jederzeit, auch mitten in einer Runde.
- Einstieg: `c/$SLUG/settings`, Abschnitt „Edition“, roter Button „Edition beenden“ mit Rückfrage.
- Beim Beenden wird die Endrangliste an der Edition gespeichert, danach werden alle Spieldaten der
  Edition gelöscht.
- Die Momentaufnahme enthält keine `user_id`: Ein späteres Löschen eines Nutzers ändert das Archiv
  nicht und wird nicht davon blockiert.

## Nicht-Ziele

- Keine Historie- oder Archiv-Ansicht, kein Poster aus dem Archiv. Kommt, wenn es gebraucht wird.
- Kein Löschen von Nutzerkonten (gibt es noch nicht).
- Keine Wiederherstellung: Beenden ist endgültig.
- Kein Folgelauf mit übernommenen Einstellungen (früher `startNew` mit `inheritFrom`, ausgebaut in
  `bd981009`). Die nächste Edition wird über das Formular neu angelegt.

## Vorarbeit

Im Code gibt es keine. Die frühen Freigabe-Hooks (`materialised`/`release`,
`releaseStagesOlderThan`, Stores je Spiel) sind mit `48634420` ausgebaut worden. Seitdem liegen alle
Runden-Bytes in `game.round_assets`, und das Round-Assets-Design sieht für das Archivieren
„ein einziges `DELETE`“ vor. Dieses Design setzt genau das um.

## Ansätze

| | Weg | Abwägung |
|---|---|---|
| A | Nur `archived_at` setzen, alles behalten | Kein Aufwand. Assets (bytea) wachsen unbegrenzt, Lösungen kuratierter Inhalte bleiben liegen, gelöschte Nutzer verändern den alten Stand per Cascade. |
| **B** | **Endrangliste sichern, Spieldaten löschen** | **Gewählt.** Kleine DB, nichts hängt an `iam.users`, Poster bleibt zeichenbar. |
| C | Wie B, Rundenliste (Runde → Spieltyp) bleibt | Nimmt eine Historie vorweg, die niemand gebaut hat. |

## Design

```
POST /api/communities/{slug}/editions/active/archive        (Admin)
  community.EditionService.archive  ── eine Transaktion ──────────────┐
    1. aktive Edition holen (sonst 404)                                │
    2. EditionGameData.finalPoints(editionId) ── game ─► Map<userId,Int>│
    3. Rangliste bauen: aktive Mitglieder × Identität × Punkte          │
    4. EditionGameData.purge(editionId)  ── game ─► DELETE round_games  │
       (Cascade: round_plays, round_play_votes, round_assets)          │
    5. final_standings + archived_at setzen                            │
  ◄── CommunityResponse (edition = null) ──────────────────────────────┘
```

- **Momentaufnahme:** neue Spalte `community.editions.final_standings JSONB NULL`, gesetzt genau
  beim Archivieren. Inhalt, nach Rangliste sortiert:
  `[{ "rank": 1, "name": "…", "shortName": "…", "bgColorHex": "#…", "points": 12 }]`.
  Ranking wie das Poster (`standings.ts`): Wettkampf-Ranking 1, 1, 3; Gleichstand in Roster-Reihenfolge.
  Name, Kürzel, Farbe aus `MemberIdentityResolver`, also wie im Roster. Keine `user_id`.
- **Punkte:** Summe aller `round_plays.points` der Edition je Spieler, unabhängig vom Betrachter
  und inklusive der laufenden, noch vorläufigen Runde. Das ist der Stand, den alle beim Beenden
  zuletzt gesehen hätten, ohne die Sichtbarkeitssperre von `MemberPointsQuery`.
- **Wer in der Rangliste steht:** die aktiven Mitglieder zum Zeitpunkt des Beendens, wie im Roster.
- **Modulgrenze:** `community` darf nicht von `game` abhängen. Neue Schnittstelle `EditionGameData`
  im Modul `community` (wie `MemberPointsQuery`), implementiert in `game`.
- **Poster-Wahl:** `pickPoster(edition.id)` bleibt deterministisch, die Edition-ID bleibt erhalten.
  Keine Poster-ID speichern.
- **Frontend:** In `settings.vue` unter der aktiven Edition ein Button „Edition beenden“ in
  `text-error`. Rückfrage per `window.confirm` (wie im Bilder-Pool):
  „Edition „{Titel}“ beenden? Alle Runden, Tipps und Spieldaten werden gelöscht. Nur die
  Endrangliste bleibt.“ Danach `refresh()`; der Abschnitt zeigt „Kein Lauf aktiv.“

## Dem Umsetzer überlassen

- Rennen gegen Rundenansage und Tipp während des Archivierens: Eine Ansage darf nach dem Beenden
  keine `round_games`-Zeile für die archivierte Edition anlegen. Prüfen, ob der vorhandene Pfad das
  schon ausschließt (er liest die aktive Edition); sonst Edition-Zeile sperren.
- Name der Schnittstelle und der DTOs, Fehlercodes außer 404/403.
