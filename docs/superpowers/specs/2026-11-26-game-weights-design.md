# Spielgewichte je Community (#37)

Baut auf [Spielauswahl-Sperre](2026-11-26-game-selection-cooldown-design.md) (PR #200) auf; gestapelter PR.

## Warum

[#37](https://github.com/unividuell/countdown/issues/37): Der Admin einer Community bestimmt, wie oft
ein Spiel drankommt — pro Spiel `aus | selten | normal | viel`, Standard `normal`. Eine Community ohne
Musikfreunde schaltet „Anspielung“ ab, eine mit Lieblingsspiel dreht es hoch.

## Ziele

- Pro Spiel eine von vier Stufen, gespeichert **an der Community** (gilt für jede Edition).
- Bearbeitet in den Einstellungen, im bestehenden Community-Abschnitt — keine eigene Unterseite.
- `aus` nimmt das Spiel aus der Auswahl; `selten`/`viel` verschieben die Häufigkeit spürbar.
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
basis_g    = max(1, n − 4)               // wie PR #200
gesperrt_g = round(basis_g / faktor_g)   // viel 3, normal 1, selten 1/3
```

Spiel `g` ist gesperrt, wenn es in den letzten `gesperrt_g` Runden lief. Gezogen wird gleichverteilt
aus den freien; sind keine frei, aus allen Kandidaten (wie PR #200).

Simuliert, 14 Spiele (3 viel, 3 selten, 8 normal), 140 Runden, 1000 Seeds — Mittel je Spiel (in Klammern: Ziel „viel doppelt, selten halb so oft wie normal“):

| Faktoren | viel | normal | selten |
|---|---|---|---|
| 2 / ½ | 14,7 (18) | 9,8 (9) | 5,9 (4,5) |
| **3 / ⅓** | **17,5 (18)** | **9,4 (9)** | **4,2 (4,5)** |

3/⅓ trifft „viel ≈ doppelt, selten ≈ halb so oft wie normal“ im echten Katalog (Entscheidung von Claude,
korrigierbar). `K = 12` aus der Vorgänger-Spec entfällt: es widerspricht „alle normal = PR #200“.

Grenze: Bei kleinem Katalog (≤ 5 eingeschaltet) ist die Sperre kurz, die Stufen wirken kaum. Gewollt
in Kauf genommen — der Katalog hat 14 Spiele.

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

Spiele
Anspielung
[  aus  ][ selten ][ normal ][  viel  ]
Augenmaß
[  aus  ][ selten ][ normal ][  viel  ]
…
[ Speichern ]
```

- Vier **gleich breite** Knöpfe je Spiel (Grid, 4 Spalten), technisch eine Radiogruppe je Spiel.
- Ein Speichern-Knopf für den ganzen Abschnitt; er sendet nur, was sich geändert hat (Name per
  `PATCH /api/communities/{slug}`, Gewichte per `PUT …/games/weights`).
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
- **Speichern** sendet PATCH (Name) vor PUT (Gewichte), jeweils nur bei Änderung. Schlägt einer fehl,
  bleibt der Formularstand stehen, die Meldung nennt, was nicht gespeichert wurde.

## Dem Bauenden überlassen

Namen von Klassen, Enum, DTOs; Migrationsnummer; Komponentenschnitt im Frontend; Tests nach
`testing.md` und `frontend-testing.md`. Guideline `game-rounds.md` um die Gewichte ergänzen.
