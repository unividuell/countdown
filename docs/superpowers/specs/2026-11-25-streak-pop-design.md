# Member-Pop — Design

## Warum

Hält jemand die Streak, erklingt die Triangel und das Symbol am eigenen Avatar im Roster flammt
auf. Der Roster steht oben auf der Seite; wer gerade spielt, hat ihn meist aus dem Bild gescrollt.
Die Triangel klingt dann ohne sichtbares Gegenstück, ihre Bedeutung bleibt unklar. Dasselbe gilt
für die neuen Punkte, die mit dem Urteil im Roster landen.

## Ziel

Ändert sich mein Stand (Punkte, Live-Punkte, gewachsene Streak) und ist meine Roster-Spalte nicht
im Bild, erscheint sie 1,5-fach an einer zufälligen Stelle im oberen Viertel des Sichtfelds: erst
mit dem alten Stand, dann mit dem neuen; eine gewachsene Streak flammt zur Triangel auf.

## Nicht-Ziele

- Kein Flug, keine Verbindung zur Position im Roster.
- Kein Pop für Änderungen anderer Mitglieder.
- Bei reduzierter Bewegung oder Tab im Hintergrund: nichts (wie die Triangel heute).

## Ansätze

1. **Avatar-Kopie fliegt in die Reihe und zurück** (Schwarm-Physik) — verworfen: der Rückflug
   zeigt nur etwas, wenn man hochscrollt.
2. **Avatar-Kopie fährt vom oberen Rand herein und hinaus** — verworfen: scrollt man dabei hoch,
   steht der Avatar doppelt da und die Kopie fliegt ins Nichts.
3. **Nur das Symbol, zufällig im Sichtfeld** — gebaut, verworfen: wirkte zu beliebig.
4. **Avatar mit Symbol, zufällig im oberen Viertel** — gebaut, erweitert zu 6.
6. **Ganze Roster-Spalte bei jeder Änderung meines Stands** — *gewählt*: zeigt auch die
   Punkteänderung; die Spalte ist dafür als `MemberColumn` aus `MemberRow` herausgelöst.
5. **An meiner Zeile in der Auswertung** (`RevealScoreboard`) — zurückgestellt; braucht einen
   Ausweichweg, wenn die Zeile nicht im Bild ist.

## Verhalten

```
Urteil (Roster-Refresh, mein Stand ändert sich)
  └─ eigener Kreis nicht im Bild? ──▶ Pop (fixed, ×1,5, oberes Viertel), alter Stand
       250 ms ──▶ neuer Stand
       VERDICT_MS ──▶ Triangel + Aufflammen (nur bei gewachsener Streak)
       1650 ms ──▶ ausgeblendet
```

- **Sichtbar** heißt: der eigene Kreis liegt ganz im Bildschirm und, waagrecht, ganz im sichtbaren
  Teil der seitlich scrollbaren Reihe.
- **Stelle:** waagrecht in der Inhaltsspalte (Breite der Reihe), auf dem Desktop bis zu 96 px
  darüber hinaus; senkrecht im oberen Viertel. Avatar und Flamme bleiben ganz im Bild.
- **Aufflammen:** der Pop zeigt die Streak, die die Reihe gerade zeigt; steigt sie nach
  `VERDICT_MS`, spielt der bestehende Watcher in `StreakMark` die Flamme samt Stufenwechsel.

## Entscheidungen des Bauenden

- 1,5-fache Größe, Ankerpunkt ist die Mitte des Avatars.
- Einblenden 100 ms, Wechsel auf den neuen Stand nach 250 ms, gesamt 1,65 s — auch ohne Flamme.
- Über allem (`z-30`), `pointer-events: none`, `aria-hidden` — die Reihe trägt die Ansage weiter.
