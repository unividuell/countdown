# Peilung: Phase zwei auf Zeit, Klick und langer Klick — Plan

Spec: `docs/superpowers/specs/2026-10-25-peilung-design.md`. Ersetzt die Ping-Kosten aus
`2026-11-19-peilung-unlimited-pings.md` (Clemens, 2026-11-19: „Irrweg“).

## Entscheidungen (Clemens)

- Phase zwei auf Zeit wie Verrohrung/Platzierung: `timed = phase == TWO`, `requiresReveal` und
  `scoresOnDuration` = `timed`. Gate in beiden Phasen der Toleranzkreis ≤ 1,5.
- Ping-Kosten zurück: `pingCost`, `score`, `GuessContext.stage`, Balken, Formel, *-Legende, „Wenige
  Pings werden belohnt.“ raus.
- Versiegelung (geteilter `RevealCover`) nennt die Anzahl der Sprüche. Nach dem Aufheben läuft das
  Spiel sofort: der erste Klick ist der erste Ping. Peilungs eigene Abdeckung entfällt (beide Phasen).
- Kurzer Klick: Ping, in der Welle Markierung. Langer Klick: Pin setzen/entfernen, jederzeit.
  Umschalter entfällt.
- „Zurücksetzen“-Knopf entfällt; rechtsbündiger Link unter dem Feld: Besen-Icon + „Markierungen
  löschen“, löscht nur Ringe, Pins bleiben.

## Meine Festlegungen

- Langer Klick ab 500 ms; Entscheidung beim Loslassen bzw. nach 500 ms. Ein kurzer Klick nimmt Ort
  und Zeit vom `pointerdown` (Ringradius bleibt reaktionsgenau), ausgelöst beim `pointerup` — der
  ist für iOS eine Geste, die den Ton freischalten darf.
- Ton noch aus (erster Klick, nach Anruf/App-Wechsel): der Klick schaltet frei und pingt.
- Anzahl ohne Abdeckung: blass mitten auf dem Feld bis zum ersten Ping.
- Zustandszeile: „1. Klick: Ping, 2. Klick: Markieren“ / „Markieren“ / „Sonar lädt …“, darunter
  klein „Lang drücken: Pin setzen oder entfernen“.
- Scene `EchoLocateScene(grid, clips)` aus dem Scene-Strom (Anzahl) — die Abdeckung braucht sie.

## Schritte

1. Backend: Kosten raus, `timed`, Scene, Gate beide Phasen (Tests zuerst).
2. Frontend: Bewertung zurück (Typen, Rangliste, Briefing), Phase zwei: Abstand, Pings, Zeit.
3. `flow.ts`: Modus raus, `press` (kurz) / `hold` (lang), `clearRings`.
4. Board/SonarField: langer Klick, keine Abdeckung, erster Klick pingt, Link „Markierungen löschen“.
5. `EchoLocateGame`: versiegelt → Feld + `RevealCover` mit Anzahl, `reveal`.
6. Regeltexte, Spec, Guidelines, Browserprobe.
