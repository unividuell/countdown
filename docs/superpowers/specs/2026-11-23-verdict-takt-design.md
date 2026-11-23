# Verdict im Takt — Entwurf

## Warum

Das Verdict (`ui/verdictSound.ts`) sagt, ob mein Tipp Punkte bringt — Phase 1: im Tor, Phase 2:
meine Zeile hält gerade Punkte (`games/verdict.ts`). Was danach in Tabelle und Roster erscheint,
verrät nichts mehr. Vorher schon: Reihenfolge, Position meiner Zeile, fremde Punkte (Phase 2: nur
der Beste punktet).

Heute laufen drei Uhren: Verdict bei 0,9 s, Zeilen ab 1,9 s, Roster nach 3,8 s + Fetch. In
Verrohrung kommt das Verdict erst nach Wasser und Endsound (bis ~7 s) — die Tabelle läuft vorher und
verrät in Phase 2 den Sieger, bevor das Wasser endet.

## Regel

Nichts in Tabelle und Roster vor dem Verdict. Das Verdict ist der Startschuss der Zeilen-Kaskade.

## Entwurf

1. **Alle Spiele:** `useRevealVerdict` spielt bei `RESULTS_DELAY_MS` statt `SOLUTION_DELAY_MS`.
   `tickOfRow` bleibt. Augenmaß passt schon (Zeilen warten aufs Ende des Zählens).
2. **Verrohrung:** Verdict bleibt nach dem Ausklingen des Endsounds. `RevealScoreboard` bekommt
   einen Haltemodus (`resultsHeld`): Kopf und Band wie bisher, die Zeilen warten; fällt der Halt,
   läuft die Kaskade ab diesem Moment. Verrohrung löst ihn mit dem Verdict — auch stumm, ohne
   eigenen Tipp, oder wenn ein Name vorher angetippt wird.
3. **Roster:** `ui/resultsLanding.ts` — eine animierende Tabelle meldet, wann ihre Zeilen zu landen
   beginnen. `refreshAfterGuess` holt sofort, hält die Antwort und zeigt sie auf die Meldung;
   `SPOILER_HOLD_MS` wird zur Obergrenze, falls keine kommt (Verrohrungs längster Fall). Reduzierte
   Bewegung: sofort. Das Labor nutzt denselben Weg.

## Verworfen

- Nur längere feste Roster-Wartezeit: in allen anderen Spielen 5 s Nachlauf.
- Verdict im `RevealScoreboard` abspielen: Augenmaß und Verrohrung hängen es an ihren eigenen Klang.
- Eigene Zeile allein zuerst, fremde überholen danach (zweites Verdict): das Phase-2-Verdict sagt
  das schon; die Animation bebildert nur.
