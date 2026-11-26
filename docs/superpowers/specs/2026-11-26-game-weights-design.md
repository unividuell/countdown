# Spielgewichte je Community (#37)

Baut auf [Spielauswahl-Sperre](2026-11-26-game-selection-cooldown-design.md) (PR #200) auf; gestapelter PR.

## Warum

[#37](https://github.com/unividuell/countdown/issues/37): Der Admin einer Community bestimmt, wie oft
ein Spiel drankommt — pro Spiel `aus | selten | normal | häufig`, Standard `normal`. Eine Community ohne
Musikfreunde schaltet „Anspielung“ ab, eine mit Lieblingsspiel stellt es auf `häufig`.

## Ziele

- Pro Spiel eine von vier Stufen, gespeichert **an der Community** (gilt für jede Edition).
- Bearbeitet in den Einstellungen, im bestehenden Community-Abschnitt — keine eigene Unterseite.
- `aus` nimmt das Spiel aus der Auswahl; `selten`/`häufig` verschieben die Häufigkeit spürbar.
- Alle `normal` = exakt die Regel aus PR #200.

## Nicht-Ziele

- Exakte Quoten. „Ungefähr“ reicht.
- Gewichte je Edition, Historie der Einstellungen.
- Das Labor auf den neuen Endpunkt umstellen (eigene Aufgabe danach; das Labor diktiert nie den Rahmen).

## Ansätze

| Ansatz | Gewählt |
|---|---|
| Gewichte an der Edition (neue Edition kopiert oder startet bei `normal`) | nein — Geschmack einer Community wechselt nicht pro Lauf; Kopierlogik entfällt |
| **Gewichte an der Community** | ja (Entscheidung des Nutzers) |
| Eigene Bearbeiten-Seite `/c/$SLUG/community` | nein (Entscheidung des Nutzers) |
| **Im Community-Abschnitt der Einstellungen** | ja |
| Schieberegler mit 4 Stufen | nein — braucht Wertanzeige, kollidiert beim Scrollen durch 14 Zeilen |
| **Segmentschalter (Radiogruppe), 4 gleich breite Knöpfe** | ja (Entscheidung des Nutzers) |
| Gewicht nur unter den freien Spielen ziehen | nein — die gemeinsame Sperre ebnet es ein (Spec PR #200) |
| **Stufe = eigene Sperrdauer je Spiel** | ja |

## Regel

`aus` filtert die Kandidaten vor der Auswahl. Für die übrigen `n` Kandidaten:

```
basis      = max(1, n − 4)                         // wie PR #200
f̄          = Mittel der Faktoren der n Kandidaten  // häufig 3, normal 1, selten 1/3
gesperrt_g = max(1, round(basis · f̄ / faktor_g))
```

Spiel `g` ist gesperrt, wenn es in den letzten `gesperrt_g` Runden lief. Gezogen wird gleichverteilt
aus den freien. Sind keine frei, aus allen Kandidaten außer dem Spiel der Vorrunde; nur wenn das
nichts übrig lässt, aus allen.

**Die Stufen sind relativ.** `f̄` hält die Summe der Sperren so, dass im Mittel etwa vier Spiele frei
bleiben. Stehen alle Spiele auf derselben Stufe — alle `häufig`, alle `selten` —, ist das exakt
„alle `normal`“ = PR #200. Ohne `f̄` wäre „alle häufig“ fast reiner Zufall (Spanne 1–20) und „alle
selten“ sperrte alles, sodass ≈ 8 direkte Wiederholungen je Edition entstanden.

Simuliert, 140 Runden, 1000 Seeds, Mittel (Min–Max) je Spiel:

| Einstellung | häufig | normal | selten |
|---|---|---|---|
| 3 häufig, 8 normal, 3 selten | 19,6 (15–24) | 8,8 (6–10) | 3,7 (3–5) |
| alle gleich (egal welche Stufe) | — | 10 (6–13) | — |
| 1 häufig, 13 normal | 17,2 (12–23) | 9,4 (5–12) | — |
| 1 selten, 13 normal | — | 10,4 (7–13) | 4,6 (3–5) |
| 7 häufig, 7 selten | 17 (14–20) | — | 3 (3–3) |

Faktoren 3/⅓ statt 2/½: mit 2/½ landet häufig nur bei ≈ 1,5×, selten bei ≈ 0,6× normal; 3/⅓ trifft
„häufig ≈ doppelt, selten ≈ halb so oft“ (Entscheidung von Claude, korrigierbar). `K = 12` aus der
Vorgänger-Spec entfällt: es widerspricht „alle gleich = PR #200“.

Grenze: Bei kleinem Katalog (≤ 6 eingeschaltet) ist die Sperre kurz, die Stufen wirken schwächer
(1 häufig, 4 normal, 1 selten: 30 / 24 / 13). Gewollt in Kauf genommen — der Katalog hat 14 Spiele.

**Vorrang, kein Ausschluss**: Bleibt nach `aus` kein verfügbares Spiel übrig (z. B. das einzige
eingeschaltete ist für diese Runde nicht verfügbar), wird `aus` ignoriert statt die Runde spiellos zu
lassen.

## Speicherung und Modulgrenze

Die Gewichte gehören dem Modul `game` — es kennt die Spiel-Ids und zieht die Runden. `community` bleibt
unberührt (sonst Zyklus: `game` hängt schon an `community`).

- Tabelle `game.community_game_weights(community_id, game_type, weight)`, PK `(community_id, game_type)`.
  Nur Abweichungen von `normal` als Zeile; ein neues Spiel ist so von selbst `normal`.
- Zeilen für Spiel-Ids, die es nicht mehr gibt, werden ignoriert.
- `RoundMaterialiser` lädt die Gewichte der Community der Edition und reicht sie an `GameSelection.pick`.
- Änderung wirkt ab der nächsten noch nicht angekündigten Runde (Ankündigung ≈ ein Tag vorher).

## API (Modul `game`)

Nach dem Muster `/api/communities/{slug}/audio|images|rounds`:

- `GET /api/communities/{slug}/games` — Mitglieder: `[{ id, displayName, weight }]`, nach Anzeigename
  sortiert, alle Spiele des Katalogs.
- `PUT /api/communities/{slug}/games/weights` — nur Admin: `{ "<gameId>": "OFF|RARE|NORMAL|OFTEN" }`,
  vollständige Map der gewünschten Stufen; fehlende Ids = `normal`. 400 bei unbekannter Id oder wenn
  alle Spiele `aus` wären. 403 für Nicht-Admins.

## UI

Einstellungen, Community-Abschnitt (heute: Name + Slug-Hinweis + Speichern):

```
Name  [ Hüttenwochenende        ]
URL-Slug /c/huette ist unveränderlich.
[ Speichern ]
────────────────────────────────────
Spiele
Anspielung
[  aus  ][ selten ][ normal ][ häufig ]
Augenmaß
[  aus  ][ selten ][ normal ][ häufig ]
…
[ Speichern ]
```

- Vier **gleich breite** Knöpfe je Spiel (Grid, 4 Spalten), technisch eine Radiogruppe je Spiel.
- Eigener Abschnitt „Spiele“ mit eigenem Speichern-Knopf (`PUT …/games/weights`); der Name behält
  seinen Knopf direkt darunter (Entscheidung des Nutzers: ein gemeinsamer Knopf lag zu weit weg).
- Hinweis unter der Liste: „Gilt ab der nächsten angekündigten Runde.“
- Alle auf `aus`: Speichern verweigert mit Meldung (Server prüft auch).

## Festlegungen (Entscheidungen von Claude)

- **Wer**: Die Einstellungsseite ist schon admin-only (`useAdminGuard`). PUT prüft wie `ReviewService`
  per `MembershipQuery.isAdmin`; GET für aktive Mitglieder.
- **Katalog** = `GameCatalog.ids()` (Bean-Präsenz ist das Release). Die „alle aus“-Prüfung zählt gegen
  diesen Katalog. `n` = Kandidaten der Runde (`availableIds` minus `aus`).
- **Verlauf** wie PR #200: alle Runden der laufenden Edition (`historyOf`, ohne Limit) — reicht für
  Sperren bis ≈ 30 Runden.
- **`aus` und Verlauf**: Der Verlauf bleibt eine Liste gespielter Ids; ein ausgeschaltetes Spiel belegt
  dort Plätze wie ein nicht mehr verfügbares (PR #200), zählt aber nicht zu `n`.
- **PUT** ersetzt alle Zeilen der Community in einer Transaktion (löschen + einfügen); idempotent.
  `created_at`/`updated_at` nach `persistence.md`.
- **Speichern** je Abschnitt: Name per PATCH, Spiele per PUT. Schlägt das fehl, bleibt der
  Formularstand stehen, die Meldung steht im jeweiligen Abschnitt.

## Dem Bauenden überlassen

Namen von Klassen, Enum, DTOs; Migrationsnummer; Komponentenschnitt im Frontend; Tests nach
`testing.md` und `frontend-testing.md`. Guideline `game-rounds.md` um die Gewichte ergänzen.
