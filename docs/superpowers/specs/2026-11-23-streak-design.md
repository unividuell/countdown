# Streak — ein Abzeichen für alle, die Runde für Runde mitspielen

**Status:** Entwurf zur Abnahme (2026-11-23).

**Baut auf:** dem Roster (`RosterService`, `members/MemberRow.vue`) und der Punkte-Abfrage
`RoundPlayPoints` mit ihrem Live-Gate; Begriffe aus
[`countdown.md`](../../../.claude/guidelines/countdown.md) und
[`game-rounds.md`](../../../.claude/guidelines/game-rounds.md).

**Berührt:** Backend `game` (`RoundPlayPoints`, `RoundPlayRepository`) und `community`
(`MemberPointsQuery`, `RosterService`, DTO); Frontend `members/` und die Höhenreservierung in
`pages/c/[slug]/index.vue`. Keine Migration, keine neue Tabelle.

## Zweck

Wer regelmäßig wiederkommt, soll dafür sichtbar belohnt werden. Belohnung ist vorerst nur ein
Abzeichen am Avatar im Roster, das alle Mitglieder sehen. Es wächst mit der Länge der Streak, und
spätere Stufen sind härter zu halten als frühere.

## Ziele

- Jedes Mitglied mit einer Streak ab 3 trägt im Roster ein Icon am Avatar.
- Das Icon wechselt in fünf Bändern und wächst innerhalb der Spanne stetig, am Anfang schnell, dann
  zäh.
- Kein Icon verrät mehr über die laufende Runde, als der Live-Chip heute schon verrät.

## Nicht-Ziele

- Keine Zahl am Avatar. Die Länge ist nur am Icon ablesbar, grob.
- Keine Erklärung, Legende oder Benachrichtigung für Spieler.
- Keine Animation und kein Ton beim Laden der Seite und beim Abriss einer Streak (siehe *Übergang*).
- Keine Streak über Editionen hinweg, kein Joker für verpasste Runden.

## Anti-Ziele

- Das Icon darf nie zeigen, dass jemand eine Runde geöffnet, aber nicht abgegeben hat. Diese Zeile
  bleibt laut `game-rounds.md` verborgen, auch nach Rundenende.
- Das Icon darf nicht wachsen, bevor der Betrachter die laufende Runde selbst abgegeben hat.

## Die Regel

**Mitgespielt** hat, wer die Runde abgegeben hat: per Tipp oder per Aufgeben. In den Daten ist das
`game.round_plays.points IS NOT NULL` — genau die Zeilen, die `RoundPlayRepository.pointsOf` heute
liefert. Nur geöffnet (`revealed_at` gesetzt, `points` NULL) zählt nicht.

**Die Streak** ist die Zahl der Runden ohne Lücke, rückwärts gezählt:

```
Spielrunden der aktiven Edition im Spielfenster, absteigend:

   … 41  42  43  44  45 │ 46 (läuft)
     ✓   ✓   ✗   ✓   ✓  │  ✓ / – / ?
                        │
   Start: 46, falls sichtbar (siehe unten) und abgegeben; sonst 45.
   Zählen bis zur ersten Spielrunde ohne Abgabe → hier 2 (44, 45) oder 3 (+46).
```

- **Spielrunde** heißt: Es gibt eine Zeile in `game.round_games` für diese Edition und Nummer, und
  die Nummer liegt im Spielfenster (`windowReasonOf(...) == null`), genau wie bei den Punkten.
- **Runden ohne `round_games`-Zeile** im Fenster (etwa bei fehlgeschlagener Materialisierung) werden
  übersprungen: Sie zählen nicht und unterbrechen nicht.
- **Pro Edition:** Mit einer neuen Edition beginnt die Streak bei 0. Schrumpft das Fenster, kann die
  Streak sinken — dieselbe Folge wie bei den Punkten.
- **Die laufende Runde bricht nie etwas ab.** Abbrechen kann eine Streak nur beim Rundenwechsel.
- **Nach dem Spielfenster** bleiben die Abzeichen stehen, bis die Edition endet: Es kommt keine
  Spielrunde mehr, die abbrechen könnte.

### Sichtbarkeit: wie Live-Punkte

Das Live-Gate von `RoundPlayPoints` gilt unverändert auch für die Streak:

- **Hat der Betrachter die laufende Runde abgegeben**, zählt sie bei jedem Mitglied mit, das sie
  ebenfalls abgegeben hat.
- **Sonst** endet jede Streak bei der letzten abgeschlossenen Runde.

Das verrät nichts Neues: Wer abgegeben hat, sieht am Live-Chip schon heute, wer sonst gespielt hat.
Nach dem Rundenwechsel sind alle abgegebenen Tipps einer Runde ohnehin für jedes Mitglied offen.
Die Entscheidung fällt auf dem Server; das Frontend bekommt nur die fertige Zahl.

**Zeitpunkt:** `streak` reist in derselben Roster-Antwort wie die Live-Punkte. Nach einem Tipp
holt `useRoster.refreshAfterGuess` sie sofort und zeigt sie, wenn der Zeitplan der Aufdeckung sein
Urteil erreicht (`announceResults` → `afterResultsLand`, `ui/resultsLanding.ts`). Der Wechsel des
Abzeichens folgt `VERDICT_MS` später, siehe *Übergang*. Kein eigener Abruf.

## Das Abzeichen

### Bänder

Jedes Band ist länger als das vorige, damit spätere Stufen härter zu halten sind:

| Streak | Icon | Länge |
|---|---|---|
| 0–2 | keins | |
| 3–9 | Flamme orange | 7 |
| 10–19 | Flamme blau | 10 |
| 20–32 | Diamant Eis | 13 |
| 33–49 | Diamant Rubin | 17 |
| ab 50 | Diamant Rubin, funkelt | offen |

### Größe

Kantenlänge `s` des quadratischen Icon-Rahmens in px, eine Log-Kurve über alle Bänder hinweg (die
Größe läuft über den Icon-Wechsel durch, der Diamant übernimmt die Größe der letzten Flamme):

```
s(n) = 14 + 12 · ln(min(n, 50) − 2) / ln(48)      für n ≥ 3

n:   3    4     5    10    20    33    50+
s:  14  16,2  17,4  20,5  23,0  24,6   26
```

### Position

Der Fuß des Icons (Mitte unten im 20×20-viewBox, y ≈ 18) sitzt oben rechts bei 45°, 3px innerhalb
des 48px-Kreises. Dadurch schneidet das Icon schon in seiner kleinsten Größe in den Avatar ein und
gehört sichtbar zum Kreis. Bezogen auf die linke obere Ecke des Avatars:

```
left = 38,8 − s · 0,5        top = 9,2 − s · 0,9
```

Das Icon wächst also nach oben rechts aus dem Kreis heraus. Eine Kontur in der Flächenfarbe
(`--color-surface`, Strichstärke `28 / s` im viewBox) trennt es vom Avatar und von Nachbarn.

### Formen (abgenommen im Mockup, viewBox `0 0 20 20`)

**Flamme:**

```svg
<path d="M10 1 C12 5 16 7 16 12 A6 6 0 0 1 4 12 C4 9 6 8 7 5 C8 7 9 8 10 8 C10 6 9.5 3.5 10 1 Z"
      fill="{außen}" stroke="var(--color-surface)" stroke-linejoin="round"/>
<path d="M10 9 C11 11 13 12 13 14 A3 3 0 0 1 7 14 C7 12.5 8.5 11.5 10 9 Z" fill="{innen}"/>
```

| | außen | innen |
|---|---|---|
| orange | `#f97316` | `#facc15` |
| blau | `#2563eb` | `#e0f2fe` |

**Diamant** (Brillant, Seitenansicht; Spitze bei y = 18 wie der Fuß der Flamme):

```svg
<polygon points="5,3.5 15,3.5 18.5,8 10,18 1.5,8" fill="{mid}" stroke="var(--color-surface)" stroke-linejoin="round"/>
<polygon points="5,3.5 15,3.5 13,8 7,8" fill="{light}"/>
<polygon points="1.5,8 7,8 10,18" fill="{dark}"/>
<polygon points="13,8 18.5,8 10,18" fill="{light}" opacity=".55"/>
<polyline points="1.5,8 18.5,8" fill="none" stroke="{line}" stroke-width=".6"/>
<polyline points="5,3.5 7,8 10,3.5 13,8 15,3.5" fill="none" stroke="{line}" stroke-width=".6" stroke-linejoin="round"/>
<polyline points="7,8 10,18 13,8" fill="none" stroke="{line}" stroke-width=".6"/>
```

| | light | mid | dark | line |
|---|---|---|---|---|
| Eis | `#e0f2fe` | `#7dd3fc` | `#0284c7` | `#0369a1` |
| Rubin | `#fecdd3` | `#e11d48` | `#9f1239` | `#881337` |

**Funkeln (ab 50):** zwei weiße Vierzack-Sterne am Rubin, die versetzt aufblitzen (Zyklus 2,4 s,
sichtbar um 80 %, zweiter Stern −1,2 s versetzt). Unter `prefers-reduced-motion` stehen beide still
und sichtbar.

```svg
<path d="M17 -1 Q17.4 1.6 20 2 Q17.4 2.4 17 5 Q16.6 2.4 14 2 Q16.6 1.6 17 -1 Z" fill="#fff" stroke="{line}" stroke-width=".35"/>
<path d="M2.5 -0.5 Q2.8 1.2 4.5 1.5 Q2.8 1.8 2.5 3.5 Q2.2 1.8 0.5 1.5 Q2.2 1.2 2.5 -0.5 Z" fill="#fff" stroke="{line}" stroke-width=".3"/>
```

Die Farben sind feste Werte, keine Rollen: Das Icon sieht in hell und dunkel gleich aus, nur die
Kontur folgt der Fläche. Im Mockup in beiden Modi geprüft.

### Übergang: Auflodern

Wird die Streak eines Mitglieds größer, lodert das Icon auf, wie eine Flamme, die Luft bekommt:
Es streckt sich nach oben, blitzt hell auf und setzt sich. Das gilt für alle Fälle — Erscheinen
(2 → 3), Wachsen im Band (5 → 6), Bandwechsel (9 → 10), Funkeln (49 → 50) — und für Flamme wie
Diamant gleich.

```
Neues Icon, 600 ms, ease-out, transform-origin 50% 90% (der Fuß im Kreis):

  offset  transform                  filter            opacity
  0       scale(k·1,05, k·0,7)       brightness(1)     0 bei neuem Band, sonst 1
  0,4     scale(0,88, 1,38)          brightness(1,9)   1
  0,7     scale(1,06, 0,94)          brightness(1,2)   1
  1       scale(1)                   brightness(1)     1

  k = s(alt) / s(neu) im selben Band, sonst 0,5.

Altes Icon (nur bei neuem Band): opacity 1 → 0 in 250 ms, darunter, dann entfernen.
```

- **Wann:** nur wenn eine Roster-Antwort bei offener Seite eine größere Streak bringt als die
  vorige. Sie landet mit dem Urteil (siehe *Zeitpunkt*); das Icon bleibt dann noch `VERDICT_MS`
  (550 ms) beim alten Stand und lodert erst auf, wenn der Urteilston verklungen ist — im selben
  Moment, in dem die Zeilen der anderen landen:

  ```
  Aufdeckung:  … story ── verdict ─────────── +VERDICT_MS ── others (still)
  Roster:                 Punkte, Reihenfolge
  Abzeichen:              (alter Stand)       Auflodern, bei mir + Triangel
  ```

  Beim Laden steht das Icon einfach da; dort läuft der Einflug.
- **Nicht animiert:** Abriss und Sinken. Beides sieht man erst beim nächsten Laden.
- **Reduzierte Bewegung, Hintergrund-Tab:** Das Icon wechselt sofort, ohne Auflodern und ohne Ton.
- Läuft gleichzeitig eine Umsortierung der Reihe, lodert das Icon während der Fahrt; es sitzt im
  bewegten Element und braucht keine Abstimmung.

### Ton: Triangel

Lodert **mein eigenes** Icon auf, klingt dazu eine Triangel, hoch und ausklingend („biiinnng“).
Also in jeder Runde, in der meine Streak beginnt (3) oder weiter anhält. Sonst nichts: kein Ton für
das Auflodern anderer (sie lodern still), keiner für einen Abriss. Der Ton sagt nur „du bist
dabeigeblieben“, nicht, ob der Tipp gewonnen hat — das hat das Urteil davor schon gesagt.

Klang „Schimmernd“, per Gehör aus drei Kandidaten gewählt. Synthetisiert, eine Stimme wie
`ui/woodKnock.ts` (neues gemeinsames Modul, etwa `ui/triangleSound.ts`):

```
Grundton 2093 Hz (C7). Je Teilton ein Sinus: Anstieg 2 ms, dann exponentiell abklingend.

  Verhältnis  Pegel   Abklingen  Verstimmung
  1           0,12    3,0 s       0
  1           0,07    3,0 s      +4 Hz     ← Schwebung, das Flirren
  2,76        0,06    1,8 s       0
  2,76        0,035   1,8 s      −3 Hz
  5,4         0,03    1,0 s       0

Dazu der Schlägel: 12 ms Rauschen, Hochpass 5 kHz, Pegel 0,04, quadratisch abfallend.
Alles über den gemeinsamen Bus: VOLUME (0,35) → soundOutput(graph).
```

- Ein Einmal-Ton: Er fragt `soundGraph()` und bleibt stumm, wenn der Graph schläft oder der Ton
  aus ist ([frontend-state.md](../../../.claude/guidelines/frontend-state.md), „Sound“).
- **Richtlinie anpassen:** „The verdict is a reveal's last sound“ bekommt eine Ausnahme — die
  Triangel gehört zum Roster, nicht zur Aufdeckung, und spielt erst nach `VERDICT_MS` in die
  stille Lücke, in der die übrigen Zeilen lautlos landen.

## Bauweise

### Ansätze

| | Ansatz | Abwägung |
|---|---|---|
| **A** ✔ | **In der Punkte-Abfrage mitrechnen.** `RoundPlayPoints` leitet die Streak aus denselben Zeilen ab, die es für die Punkte schon lädt. | Fenster und Live-Gate gelten automatisch für beides gleich; eine Abfrage mehr (Rundennummern der Edition). Dafür trägt `MemberPoints` mehr als Punkte. |
| B | Eigene `MemberStreakQuery`. | Saubere Namen, aber Fenster-Filter und Live-Gate stehen doppelt im Code; laufen sie auseinander, widerspricht das Abzeichen den Punkten. |
| C | Gespeicherter Zähler. | Verworfen: Der Wert ist aus `round_plays` ableitbar, und ein Zähler bräuchte einen Job beim Rundenwechsel. |

Gewählt: **A**.

### Backend

- `MemberPoints` bekommt `streak: Int` (≥ 0). `RoundPlayPoints.standings` berechnet sie nach der
  Regel oben, aus den schon gefilterten `scored`-Zeilen und dem schon berechneten Live-Gate.
- Neu in `RoundPlayRepository`: die Rundennummern aller `round_games` einer Edition. Daraus und aus
  dem Fenster ergeben sich die Spielrunden.
- `RosterMemberResponse` bekommt `streak: Int` auf oberster Ebene, neben `points`.
- Ohne aktive Edition: `streak = 0`, wie die Punkte.

### Frontend

- `RosterMemberResponse.streak: number` in `api/types.ts`.
- Die Abbildung Streak → Band und Größe ist reine Darstellung und liegt im Frontend.
- Das Icon sitzt im `data-swarm-circle`-Avatar oder direkt daneben im selben `data-swarm-item`,
  so dass es Einflug und Umsortierung ohne eigenes Zutun mitmacht.
- **Abschneiden:** Nach dem Einflug wird die Reihe `overflow-x-auto`, das schneidet auch vertikal ab.
  Das Icon ragt bis etwa 14px über den Avatar. Die Reihe braucht oben entsprechend Platz, und die
  72px-Reservierung in `pages/c/[slug]/index.vue` wächst mit.
- **Labor:** `pages/c/[slug]/lab/[game]/index.vue` zeigt dieselbe `MemberRow` mit eigener
  72px-Reservierung, und `gamelab/roster.ts` baut `RosterMemberResponse`. Beide brauchen `streak`
  und die höhere Reihe.

## Eigene Entscheidungen (zur Prüfung)

- **Runden ohne Spiel** im Fenster überspringen statt abbrechen.
- **Streak pro Edition**, nur im Spielfenster.
- **Bildschirmleser:** Das `aria-label` des Avatars nennt das Icon, nicht die Zahl, passend zu dem,
  was Sehende sehen: „…, Streak: Flamme“ / „blaue Flamme“ / „Eis-Diamant“ / „Rubin“ /
  „funkelnder Rubin“.
- **`streak` auf oberster Ebene** der Roster-Antwort, nicht unter `points`.

## Dem Bauenden überlassen

- Name und Schnitt der Vue-Komponente für das Icon.
- Ob `MemberPoints` umbenannt wird.
- Die genaue zusätzliche Höhe der Reihe, am echten Roster gemessen.
- Tests: Die Regel (Lücken, Rundenwechsel, Live-Gate in beide Richtungen, Aufgeben, nur geöffnet,
  Runde ohne `round_games`, Fenster) gehört in Backend-Tests; Band- und Größenabbildung in
  Vitest.
