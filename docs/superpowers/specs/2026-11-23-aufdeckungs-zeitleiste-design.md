# Aufdeckungs-Zeitleiste — Entwurf

## Warum

Jede Aufdeckung baut ihr Timing selbst: eigene `setTimeout`s ab Mount, CSS-Verzögerungen ab dem
Scharfschalten (zwei Frames später — zwei Uhren), eigene Ruhe-Regeln (Reload, Hintergrund,
reduzierte Bewegung), eigene Verdict-Aufrufe. Kein Spiel sagt, *was* bei ihm urteilt. Darum rutscht
immer wieder Urteilendes vor das Verdict: Blockierungs Fehler, Farbausmalungs Sektor, Platzierungs
Lösung, Peilungs Ziele, Anmaßungs Bild, Anspielungs Titel, die „Lösung“ im Tabellenkopf — alle bei
0,9 s oder früher, das Verdict bei 1,9 s.

## Regel

**Was urteilt, kommt mit dem Verdict.** Verdict-Ton, urteilende Bilder (Lösung, Fehler, Sektor),
meine Zeile und der Roster fallen auf einen Schlag: das *Urteil*. Fremde Zeilen, Marker und ihr
Klopfen kommen erst, wenn das Verdict ausgeklungen ist.

## Modell

Eine Zeitleiste pro Aufdeckung, ein Ursprung (das Scharfschalten), benannte Schläge:

```
open ─ head ─ story (0,9 s) ──[Erzählung]── verdict ── +VERDICT_MS: others ── settled
 │      │       │                              │                │
 │      │       Lösung erscheint /             ├ Verdict-Ton    ├ fremde Zeilen (Rang)
 │      │       Erzählung beginnt              ├ Urteilendes    ├ fremde Marker + Klopfen
 │      Tabellenkopf, fertig vor story         ├ meine Zeile
 Karte steht, mein Tipp                        └ Roster-Meldung
```

Die Schläge sind eine feste Folge; ein Schlag fällt nie vor seinem Vorgänger.

Drei Arten, wie ein Spiel das Urteil erreicht:

| Art | `verdict` fällt | Spiele |
|---|---|---|
| ohne Erzählung | mit `story` (0,9 s) | Farbausmalung, Platzierung, Peilung, Anmaßung, Anspielung, Blockierung, Weltanschauung |
| mit Erzählung | wenn das Spiel seinen Halt löst | Augenmaß (Tonfolge), Verrohrung (Wasser + Endsound), Musterung (Möglichkeiten, Brett zurück) |
| schon geurteilt | direkt nach `head`, ohne Ton | Entstauber (Verdict im Brett) |

Weltanschauung hat kein Verdict (`won` fehlt): Urteil still, nur Zeilen und Roster.

**Eine Erzählung darf das Urteil schrittweise zeigen** — das ist ihr Inhalt (Augenmaß' B wächst
auf die Lösung zu, Musterungs Möglichkeiten erscheinen nacheinander). Das Verdict schließt sie ab.
Musterung ändert sich darum im Ablauf nicht, sie wird nur portiert. *(Einordnung: Entscheidung des
Entwurfs.)*

## Schnittstelle (Vorschlag, Namen dem Bauenden überlassen)

`games/revealTimeline.ts`:

- `provideRevealTimeline({ animate, won, judged? })` — in jedem `*Reveal.vue` (dort liegen
  `animate` und `won`; Tabelle und Bild sind Kinder). `judged: 'before'` für Entstauber.
- `useRevealTimeline()` — in Bild, Tabelle, Marker-Komponenten.
- `reached(beat): Readonly<Ref<boolean>>` — für CSS: Klasse kippt beim Schlag, Verzögerungen
  *relativ* zum Schlag (Muster von `resultsHeld` heute).
- `on(beat, fn)` — einmal, beim Schlag; für Töne, rAF-Schleifen, Zustandswechsel.
- `hold(): release` — die Erzählung; `verdict` wartet auf alle Halte. Ein Spiel mit Erzählung
  holt seinen Halt beim Setup.
- `still` — Reload, reduzierte Bewegung, Hintergrund, kein rAF: alle Schläge sofort beim Mount,
  in Reihenfolge, Halte zählen nicht.

Die Zeitleiste besitzt: Verdict-Ton (außer `judged: 'before'`), Roster-Meldung
(`announceResults` beim Urteil, nur `animate`), Abbruch aller Timer und des Tons beim Unmount.

## Ton

- Verdict spielt die Zeitleiste bei `verdict`: nur `animate`, nicht im Hintergrund; still +
  `animate` (reduzierte Bewegung) sofort; Reload stumm. Wie heute.
- **Keine Ausnahme für Augenmaß:** seine Tonfolge endet, das Spiel löst den Halt, die Zeitleiste
  spielt das geteilte Verdict. `playCount` verliert `won`. Den Lösezeitpunkt rechnet das Spiel aus
  demselben Tonplan wie die Tonfolge (`growMs` + Abstand nach dem letzten Ton), damit Timer- und
  Audio-Uhr nicht auseinanderlaufen.
- Fremde Marker klopfen bei `others` + ihrer Staffel (Farbausmalung). Mein Marker nie.
- Wiederholungen per Namens-Tipp (Verrohrung) laufen außerhalb der Zeitleiste, ohne Verdict.
  Ein Tipp vor dem Urteil löst den Halt **stumm**: Zeilen und Roster kommen, das Verdict nicht
  (wie heute). Die Schnittstelle braucht dafür ein stilles Lösen. *(Entscheidung des Entwurfs.)*

## Tabelle

`RevealScoreboard` liest die Zeitleiste statt `animate`/`resultsDelayMs`/`resultsHeld`: Kopf auf
`head` — außer den Fakten-Zellen (`fact`: „Lösung“, „Toleranz“, Anmaßungs Kollektiv-Zeile,
Augenmaß' Kopfnotizen), die urteilen und darum auf `verdict` kommen —, meine Zeile (Tick 0) auf
`verdict`, Tick ≥ 1 auf `others` mit `(tick − 1) · rowStagger`.
Die drei Props entfallen. `tickOfRow` bleibt wie jetzt (meine zuerst, ohne eigene Zeile bleibt
Tick 0 leer).

## Pro Spiel

- **Farbausmalung:** Sektor auf `verdict`; fremde Marker + Klopfen auf `others`;
  Band-Wachstum auf `others` — es macht Platz für die Bahnen fremder Marker und bleibt an die
  Zeilen gekoppelt. `revealDelayMs` wandert aus
  `GuessHueGame` in die Zeitleiste.
- **Musterung:** Erzählung: Möglichkeiten ab `story`, Brett zurück, dann Halt lösen. Fremde
  Umrisse erscheinen von selbst, mit ihrer Zeile auf `others`.
- **Platzierung:** Lösung auf `verdict`; fremde Umrisse erscheinen von selbst, jeder mit seiner
  Zeile auf `others`.
- **Peilung:** Karte auf `verdict`; die Pins der anderen stehen ungefragt auf der Karte, sie kommen
  auf `others`.
- **Anmaßung:** Bild auf `verdict`. Fremde Ebenen nur per Tipp — kein Schlag.
- **Blockierung:** Fehler + Drehung auf `verdict` (zurück auf 0,9 s).
- **Anspielung:** Titel und Cover verdeckt bis `verdict` — nur wenn billig; der Treffer zeigt
  sich meist schon durch die Weiterleitung.
- **Augenmaß:** Erzählung: B wächst mit Tonfolge ab `story`, Halt lösen am Ende. Fremde Umrisse
  nur per Tipp.
- **Verrohrung:** Erzählung: Drehen, Wasser, Endsound + Atempause, Halt lösen.
- **Entstauber:** `judged: 'before'`.
- **Weltanschauung:** nur Tabelle.

## Zahlen

`story` bleibt 0,9 s (im Labor gedreht). `head` so früh, dass der Kopf vor `story` fertig ist
(heutiger Test: letzte Kopfzelle + `FADE_MS` < Urteil). `VERDICT_MS` 550 bleibt. Feinschliff im
Labor, nicht im Entwurf.

## Absicherung

**Spielübergreifend** (entschieden): Jedes Spiel kennzeichnet, was urteilt — eine kleine Hülle,
die erst bei `verdict` sichtbar wird (bzw. ein Marker, den sie setzt). Ein gemeinsamer Spec hängt
jede registrierte Aufdeckung gegen eine Fake-Zeitleiste ein und prüft: vor `verdict` ist nichts
Gekennzeichnetes sichtbar, danach alles. Ein neues Spiel fällt durch, sobald es in der Registry
steht und keine Fixture mitbringt. Fixtures für alle Aufdeckungen liegen an einem Ort. Ausnahme:
Erzählungen (Augenmaß, Musterung, Verrohrung) zeigen schrittweise — ihr Urteilendes zählt erst ab
dem Ende ihrer Erzählung, der Spec prüft dort das Lösen des Halts statt der Sichtbarkeit.

## Ziele / Nicht-Ziele

- Ziel: eine Uhr, eine Regel, ein Ort für Ruhe-Regeln und Abbruch. Neue Spiele bringen nur
  *was* sich bewegt und ggf. eine Erzählung.
- Nicht-Ziel: neue Animationen, neue Klänge, Überholanimation in der Tabelle.
- Anti-Ziel: ein Spiel, das wieder Urteilendes vor `verdict` zeigt, ohne dass ein Test es merkt.

## Ansätze

1. **Zeitleiste pro Aufdeckung (gewählt):** `provide`/`inject`, benannte Schläge, Halte. Kopplung
   explizit statt verteilt.
2. **Globaler Bus / Modul-Singleton:** einfacher zu erreichen, aber eine Aufdeckung pro Seite ist
   keine Garantie (Historie, Labor), und Abbruch hängt an Komponenten — verworfen.
3. **Nur Zahlen in `revealChoreography` nachziehen:** behebt die sechs Spiele, nicht die Ursache;
   das nächste Spiel rutscht wieder — verworfen.

## Dem Bauenden überlassen

Namen, ob `reached` pro Schlag oder ein `beat`-Ref, Testhilfe (Fake-Zeitleiste für Specs),
Reihenfolge der Migration (Vorschlag: Tabelle + Farbausmalung zuerst, dann Spiel für Spiel),
die Zahl für `head`.
