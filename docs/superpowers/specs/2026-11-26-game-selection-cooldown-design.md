# Spielauswahl: die letzten Spiele sperren

Kurzes Design. Ersetzt die Auswahlregel aus
[2026-08-11-round-game-selection-design.md](2026-08-11-round-game-selection-design.md) („nicht zweimal
hintereinander“); Rahmen, Aufrufer und Abfrage bleiben.

## Warum

Heute: gleichverteilt, nur nicht das Spiel der Vorrunde. Bei 14 Spielen und 140 Runden kommt jedes
Spiel typisch 5- bis 15-mal dran (simuliert, 200.000 Editionen). Ein Zufall ohne Gedächtnis streut
um ±3 je Spiel; Gleichverteilung braucht einen Blick zurück.

## Ziele

1. Nie zweimal dasselbe Spiel hintereinander.
2. Kein Muster (nicht a, b, c, a, b, c).
3. Über die Edition jedes Spiel ungefähr gleich oft — nicht exakt.
4. Ein Spiel, das mitten in der Edition dazukommt (Deploy, Pool später befüllt), zählt ab Ankunft:
   es holt nicht auf.

**Kein Ziel:** das nächste Spiel unvorhersagbar machen. Welches Spiel kommt, ist kein Geheimnis.

**Anti-Ziel:** zusätzlicher Zustand (Spalte, Tabelle) nur für die Auswahl.

## Ansätze

Simuliert mit 14 Spielen, 140 Runden; „je Spiel“ = typische Spanne der Einsätze.

| Ansatz | je Spiel | Zustand | Entscheidung |
|---|---|---|---|
| Kartenstapel (Durchgänge, je neu gemischt) | genau 10 | Spalte „verfügbare Spiele je Runde“ für die Ankunft | verworfen: zu aufwendig für „ungefähr“ |
| Anteilskonto (Anspruch je verfügbarer Runde, Spielraum 1) | 9–11 garantiert | dieselbe Spalte | verworfen: dito |
| Gewicht ∝ Wartezeit² | 8–12 | keiner | verworfen: gleich gut, schwerer zu erklären |
| **Letzte Spiele sperren** | **8–11** (schlimmste 5 %: 8–12) | **keiner** | **gewählt** |

Die Ankunft eines Spiels lässt sich aus dem Verlauf nicht ablesen (ein neues und ein noch nicht
gezogenes Spiel sehen gleich aus); eine Schätzung daraus verrutschte bis Spanne 7. Die Sperre braucht
die Ankunft nicht: ein neues Spiel ist ungesperrt, kommt bald einmal dran und läuft danach mit.

## Regel

```
frei     = 4
gesperrt = max(1, |Kandidaten| − frei)            14 Spiele → 10 gesperrt
gesperrte Spiele = Spieltypen der letzten `gesperrt` Runden im Verlauf
Auswahl  = gleichverteilt aus Kandidaten ohne gesperrte;
           ist das leer, aus allen Kandidaten       (Vorliebe, kein Ausschluss)
```

- Mindestens das Spiel der Vorrunde ist gesperrt → Ziel 1.
- Aus 4 Kandidaten wird jede Runde neu gezogen → Ziel 2.
- Kleiner Katalog (≤ 5 verfügbare Spiele) fällt auf die heutige Regel zurück; ein einziges Spiel
  wird weiter gezogen.
- Spiele im Verlauf, die nicht mehr verfügbar sind, belegen einen Sperrplatz; dann sind kurz mehr als
  4 frei. Harmlos.

`frei = 4` ist eine Konstante: weniger frei heißt gleichmäßiger, aber näher an einem festen Zyklus.

## Umfang

- `GameSelection.kt`: neue Implementierung ersetzt `DifferentFromPreviousRound` (genau ein Bean).
- `GameSelectionTest`: Regelfälle (Vorrunde gesperrt, letzte n gesperrt, kleiner Katalog, leer →
  `null`) plus ein Lauf über 140 Runden mit 14 Spielen und festem Seed: jedes Spiel 8- bis 12-mal.
- `RoundTimelineOracleTest` nutzt die echte Regel mit zwei Spielen; die alterniert weiter.
- `game-rounds.md`: die Regel in einem Satz, „das nächste Spiel ist kein Geheimnis“.

Signatur, Aufrufer, `historyOf`-Abfrage und Zufallsstrom (`presentation`) bleiben unverändert.
