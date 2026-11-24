# Lautstärke-Regler — Design

## Warum

Bisher gab es nur „Ton an/aus“, und das galt nur für die Dekoklänge. Anspielung und Peilung lassen
sich gar nicht regeln. Ein Regler gibt einen Pegel für alles; in den beiden Hörspielen steht er
direkt bei den Bedienelementen, weil der Mute-Knopf im Header leicht übersehen wird.

## Ziele

- Eine Lautstärke für **alles**, was die App abspielt: Dekoklänge, Anspielung, Peilung (auch die
  Audio-Vorschau im Pool, die über `usePlayback` läuft).
- Mute und Lautstärke sind **ein** Zustand.
- Wer in Anspielung, Peilung oder der Pool-Vorschau stumm geschaltet ist, wird gewarnt.

## Nicht-Ziele

- Kein Regler im Header; dort bleibt nur der Mute-Knopf.
- Keine Änderung an den Vorhängen (`RoundRamp`, `RevealCover`, „N Sprüche“).
- Nicht lauter als heute bei Songs: Deezer-Previews liegen nahe 0 dBFS, Gain > 1 übersteuert.

## Ansätze

1. **Ein Master-Gain vor `destination`** — alle Quellen hängen daran. *Gewählt:* eine Stelle,
   neue Spiele können es nicht vergessen.
2. Jede Quelle liest die Lautstärke selbst — drei Stellen, die auseinanderlaufen. Verworfen.

## Zustand

Ein Wert `games:volume` (0–1) in localStorage, Standard **0,8**. Mute ⇔ Wert 0.

```
Mute-Knopf, Ton an   ──▶ Wert = 0
Mute-Knopf, Ton aus  ──▶ Wert = 0,8 (Standard), nie ein gemerkter Rest
Regler auf 0         ──▶ stumm (Knopf zeigt Mute)
Regler > 0           ──▶ Ton an
```

Kein ausgegrauter Zustand. `useGameSound()` bleibt als abgeleitetes An/Aus (`Wert > 0`), damit
seine Aufrufer unverändert bleiben. `games:sound` entfällt; keine Migration (noch keine Nutzer).

Gain = Wert² (das Ohr hört logarithmisch; 0,8 → 0,64 ≈ −4 dB).

## Signalweg

```
Dekoklänge ─▶ soundOutput ─┐
Anspielung (usePlayback) ──┼─▶ Master-Gain (Wert²) ─▶ destination
Peilung (EchoEngine) ──────┘
```

- `soundOutput` verliert seinen eigenen Mute-Gain-Watch nicht: Mute heißt weiterhin auch „nichts
  Neues starten“ (`soundGraph()` → `null`).
- `usePlayback`s Fallback über das `<audio>`-Element setzt `element.volume`; unter iOS wirkungslos,
  hingenommen.
- **Die künstliche Reduzierung der Dekoklänge fällt:** `VOLUME = 0.35` in `woodKnock.ts` (und seine
  Verwendung in Triangel, Wusch) wird entfernt. Peilungs internes `MASTER_GAIN` bleibt — es ist ein
  Mischverhältnis vor dem Limiter, kein Nutzerpegel.

## Komponente `VolumeSlider`

Natives `<input type="range">`, `accent-primary`, 44 px hoch, `aria-label="Lautstärke"`. Ändert den
Wert live. Weckt bei Bedienung den Graphen wie `SoundToggle` (nur wenn ein Spiel auf der Bühne ist).

Orte:

- **Menü** (Drawer und Dialog): in der Zeile, in der bisher der Name stand, links vom Mute-Knopf.
  Der Name entfällt. Reiht sich in den Tab-Zyklus ein.
- **Anspielung**, Board und Auflösung: linke Spur der Play-Zeile, links neben Stopp, mit Luft.
- **Peilung**, beide Phasen: linke Spur der Abgeben-Zeile, wie in Anspielung.

## Peilung

- **Hörprobe:** Solange am Regler gezogen wird, läuft das Bett-Rauschen (rosa, auf `REF_RMS`
  gepegelt) mit Gain 1 statt `bedDb` durch `MASTER_GAIN` und Limiter — der Pegel, mit dem die
  Sprüche kommen. Kurz nach dem letzten Ziehen verstummt es.
- **Bug-Fix Phase 2:** Unter der `RevealCover` fehlen Status- und Abgeben-Zeile; nach START springt
  die UI. Die versiegelte Ansicht bekommt dieselben Zeilen (Abgeben inaktiv), der Regler darin ist
  schon bedienbar.

## Warnung bei Mute

Anspielung, Peilung und die Audio-Vorschau im Pool zeigen bei Wert 0 einen Hinweis „Ton ist aus“
bei ihren Bedienelementen. *Meine Entscheidung, Ort/Wortlaut im Bau festzulegen.*

## Risiken

- Auf iOS weckt ein Drag den Graphen nicht, nur ein Tipp. Schläft er, bleibt die Hörprobe stumm,
  bis getippt wird. Im Simulator prüfen.
- Guideline `frontend-state.md` (Sound) ändert sich: „ein Schalter im Header“ und „Ton ist das
  Spiel spielt weiter“ fallen.
