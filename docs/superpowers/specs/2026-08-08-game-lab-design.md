# Spiel-Labor — manuelles Prüfen von Mini-Spielen

**Status:** beschlossenes Design (2026-08-08).

**Baut auf:** dem `rng`-Modul ([Cross-Runtime-RNG](2026-08-02-cross-runtime-rng-design.md)), dem
Community-Modul ([Communities](2026-06-13-communities-design.md)) und dem Test-Login-Muster aus
[security-and-auth.md](../../../.claude/guidelines/security-and-auth.md).
**Steht neben:** [Anti-Cheat](2026-08-02-anti-cheat-design.md) — das Labor übt dessen Fundament,
ersetzt es aber nicht.

**Berührt:** ein neues Modulith-Modul `gamelab`, eine neue Seite in `webapp-vue`, und eine kleine
Ergänzung am vorhandenen Test-Login-Picker. **Keine Migration, kein Schema.**

## Zweck

Ein Mini-Spiel lässt sich nicht am Schreibtisch beurteilen. Man muss damit spielen — mehrfach,
dieselbe Runde, mit mehreren Spielern, und ohne dafür jedes Mal eine Community, eine Runde und
Mitspieler anzulegen. Das Spiel-Labor ist die Umgebung dafür: **eine Test-Runde, deren Parameter
aus der URL kommen, gespielt im Kontext einer echten Community, mit Ergebnissen, die nur im
Arbeitsspeicher liegen.**

Die sieben Anforderungen, gegen die dieses Design gemessen wird:

1. **Zuverlässiger Seed** — Reload erzeugt dieselbe Runde.
2. **Seed veränderbar** — andere Runde ausprobieren.
3. **Mehrspieler** — auch das Nacheinander mehrerer Spieler ist zu testen, nicht nur das Spiel.
4. **Beschränkter Zugang** — Entwickler und Tester, nicht normale Spieler; sonst übt jemand
   unbegrenzt.
5. **Kein Super-Admin-Gate** — die Schranke ist die Umgebung (non-prod), nicht die Rolle.
6. **Echte Community als Kontext** — nicht daneben, sondern darin.
7. **Keine DB-Verschmutzung** — erzeugte Guesses liegen im Speicher, mit einer Aktion zum Leeren.

## Zuschnitt: Infrastruktur, nicht Spiel

Dieses Vorhaben liefert **das Labor und eine Attrappe**, kein echtes Spiel. Die Attrappe hat
bewusst keinen Bezug zum Guess-Hue-Datenset — sie existiert, um den Weg zu beweisen, nicht um
Spaß zu machen. Das Farbrad, die Bewertung und das Spielgefühl gehören ins Spiel-Vorhaben.

### Richtungsregel: das Labor passt sich an, nicht das Spiel

**Das wichtigste Prinzip dieses Dokuments.** `LabGame` (unten) ist eine **Vermutung, kein
Vertrag** — abgeleitet aus null existierenden Spielen. Braucht Spiel #1 einen expliziten
Aufdeck-Schritt, mehrere Guesses pro Runde, eine Zeitmessung oder einen völlig anderen Zuschnitt,
dann **ändert sich das Interface, nicht das Spiel**.

Dass `LabGame` heute so aussieht, ist kein Argument gegen ein Spieldesign und darf später nie als
eines benutzt werden. Wer beim Bau von Spiel #1 auf „aber das Lab-Interface sieht das nicht vor"
stößt, hat einen Grund gefunden, das Lab-Interface zu ändern — sonst nichts.

Der Grund für diese Vorläufigkeit gehört mit ins Dokument, sonst liest ein Späterer die
Abstraktion als Absicht statt als Notlösung: **Henne-Ei.** Ohne Labor lässt sich kein Spiel
entwickeln, ohne Spiel lässt sich das Labor nicht fertig denken. Wir schneiden den Knoten, indem
das Labor zuerst entsteht — und tragen dafür, dass seine Form vorläufig ist. **Umbau bei Spiel #1
ist der eingeplante Normalfall, kein Fehlschlag.**

Daraus folgt auch, warum die Attrappe absichtlich dumm bleibt: an ihr hängt nichts, was das
Umbauen teuer macht.

**Und die Abhängigkeitsrichtung im Modulith folgt derselben Regel:** die `LabGame`-Anpassung eines
echten Spiels lebt **in `gamelab`** und ruft die öffentliche API des Spielmoduls auf — nie
umgekehrt. Kein Spielmodul implementiert `LabGame`, kein Produktionsmodul hängt am Labor. So kann
das Labor jederzeit umgebaut oder ganz gelöscht werden, ohne ein Spiel anzufassen, und `gamelab`
bleibt der einzige Ort, an dem non-prod-Code steht.

## Modul und Gating

Ein neues Modulith-Modul **`gamelab`** (`org.unividuell.countdown.core.gamelab`). **Kein Schema,
keine Flyway-Migration** — der Speicher ist RAM, damit entfällt der ganze Migrations-Ast aus
[modules-and-migrations.md](../../../.claude/guidelines/modules-and-migrations.md).

Den Community-Kontext holt sich das Modul über die **öffentliche** API des Community-Moduls
(`CommunityQuery` + `MembershipQuery`), genau wie `CountdownService` es vormacht — kein Griff nach
`community.internal`. Zugangsregel und 404-Semantik werden von dort übernommen: aktives Mitglied
oder Super-Admin, und ein Nicht-Mitglied bekommt dieselbe Antwort wie bei einer nicht existierenden
Community (kein Mitgliedschafts-Leak).

### Doppeltes Gate, nach dem Muster des Test-Logins

Controller, Store und Registry tragen **beides**:

```kotlin
@Profile("!production")
@ConditionalOnProperty("app.game-lab.enabled")
```

| Datei | Wert |
| --- | --- |
| `application.yaml` | `app.game-lab.enabled: true` |
| `application-staging.yaml` | `true` |
| `application-production.yaml` | `false` |

Auf Produktion ist das Labor damit **zweifach tot**: das Profil-Gate greift, und der Schalter steht
zusätzlich auf `false`. Der Schalter existiert nicht als Redundanz, sondern damit sich das Labor
auf **Staging** abschalten lässt, ohne Code zu ändern oder das Deployment umzubauen — nötig, sobald
dort einmal eine echte Runde mit echten Testern läuft.

**Fallstrick (Spring Boot 4):** den vollen Key als Value schreiben
(`@ConditionalOnProperty("app.game-lab.enabled")`), **nicht** `prefix=…, name=…` — bei einem
Bindestrich-Präfix greift die Relaxed Binding nicht und die Bedingung passt still nie.

`SecurityConfig` bleibt **unangetastet**: `anyRequest authenticated` deckt `/api/lab/…` bereits ab.
Ist das Labor abgeschaltet, existiert die Bean gar nicht — die Antwort ist 404, nicht 403, und das
ist die richtige: die Umgebung soll nicht verraten, dass es hier etwas gäbe.

### Warum non-prod genügt — und wo es nicht ganz genügt

Anforderung 4 und 5 zusammen ergeben: **die Umgebung ist die Schranke, nicht die Rolle.** Auf
Produktion existiert das Labor nicht, also kann dort niemand üben.

Ehrlich dazugesagt: **Staging ist öffentlich erreichbar** (`beta.countdown.unividuell.org`), der
Login dort ist der Test-User-Picker, und das echte kuratierte Guess-Hue-Datenset liegt dort. Wer
die Beta-URL kennt, kommt als Seed-User hinein. Non-prod ist gegen einen entschlossenen Mitspieler
also **keine harte Schranke** — der Schalter oben ist die Antwort darauf: er kostet nichts und
schließt Staging in dem Moment, in dem das relevant wird.

Ein Super-Admin-Gate wurde geprüft und verworfen: es wäre auf Staging ohnehin schwach, weil der
`TestUserSeeder` Seed-Usern die Super-Admin-Rolle mitgeben kann und sie damit im Picker steht.

## URL-Vertrag

```
/c/:slug/lab/:game?seed=<int32>
```

Die Seite liegt unter `/c/` und damit im `[slug]`-Shell — Community-Guard, Kopfzeile und Rollen
greifen unverändert (Anforderung 6). Der Seed ist der einzige Eingabeparameter der Test-Runde.

- **Fehlt der Seed oder ist er unbrauchbar**, würfelt die Seite einen und **ersetzt** die URL
  (`router.replace`). Damit gilt „Reload = dieselbe Runde" ab dem ersten Frame, ohne dass jemand
  daran denken muss (Anforderung 1), und der Zurück-Knopf pendelt nicht zwischen zwei Zuständen.
- **Der Seed ist ein 32-Bit-Int.** Das ist die Signatur von `SeededRandom.fromSeed(Int)` und die
  Zahlensicherheits-Regel der RNG-Spec. Die Lab-URL nutzt **ausschließlich** die Int-Form —
  `fromSeed(7)` und `fromSeed("7")` sind verschiedene Ströme, und im Labor darf darüber keine
  Unklarheit entstehen.
- **Ändern** geht über ein Feld in der Steuerleiste oder einen Würfel-Knopf; beides schreibt die
  URL (Anforderung 2).

## Der Speicher

`LabRoundStore` ist eine **Anwendungs-Bean, nicht sessiongebunden.** Das ist die Bedingung für
Anforderung 3: läge der Stand an der Session, sähe Spieler 2 den Guess von Spieler 1 nie.

Schlüssel `(communityId, gameId)` → genau **eine** aktive Test-Runde:

```
LabRound(seed: Int, entries: Map<userId, LabEntry>)
LabEntry(userId, displayName, avatar, guess: JsonNode, outcome: LabOutcome, at: Instant)
```

Der Eintrag hält den **Guess und das Server-Ergebnis** — der Guess, weil man beim Testen sehen
will, was jemand eingegeben hat; das Ergebnis, weil es der Server bewertet hat und nicht neu
abgeleitet werden soll. `at` ist reine Anzeige (Reihenfolge in der Liste), **keine Wertung** —
Zeitmessung ist ausdrücklich nicht Teil dieses Vorhabens.

`ConcurrentHashMap` plus atomares Ersetzen der Runde; zwei Browserfenster sind echte
Nebenläufigkeit, nicht Theorie.

### Auto-Eviction, und was daraus gratis folgt

Kommt ein Request mit einem **anderen** Seed, wird die alte Runde verworfen und eine neue angelegt.
Daraus folgt eine Eigenschaft, die den Kern von Anforderung 7 erledigt: **der Speicher kann nicht
wachsen.** Eine Runde je (Community, Spiel), Einträge höchstens so viele wie Mitglieder. Kein TTL,
kein LRU-Cap, nichts zu pflegen — aus „verschmutzte DB" werden ein paar Kilobyte, die sich selbst
überschreiben.

**Sichtbare Konsequenz, bewusst nicht versteckt:** zwei Fenster mit *verschiedenen* Seeds spielen
nicht miteinander — das zweite übernimmt die Runde und verwirft den Stand des ersten. Die Shell
sagt das an („Test-Runde auf Seed 4711 umgestellt — vorheriger Stand verworfen"). Das spiegelt die
Fairness-Regel des echten Spiels: **gleiche Runde für alle.** Wer zu zweit testen will, benutzt
dieselbe URL.

### Ein Guess pro Spieler und Runde — durchgesetzt

Das Labor erzwingt die echte Regel (Anti-Cheat #5). Ein zweiter Guess desselben Spielers in
derselben Runde wird mit **409** abgewiesen.

Damit sind die beiden Aufräum-Aktionen kein Komfort, sondern die **Voraussetzung fürs
Wiederholen**:

| Aktion | Wirkung |
| --- | --- |
| **Runde zurücksetzen** | alle Einträge weg, Seed bleibt — dieselbe Runde komplett von vorn |
| **Meinen Guess löschen** | nur der eigene Eintrag — eigene Eingabe wiederholen, Rangliste bleibt |

Ein globaler „alles leeren"-Knopf ist bewusst **nicht** vorgesehen: die Auto-Eviction macht ihn
überflüssig, und ein Neustart des Backends leert ohnehin alles.

**Kein Polling.** Fenster 2 sieht den Guess aus Fenster 1 nach einem Klick auf „Aktualisieren".
Für das Nacheinander aus Anforderung 3 reicht das; Live-Aktualisierung wäre Aufwand für einen
Anwendungsfall, den es hier nicht gibt.

## Der Port

```kotlin
interface LabGame {
    val id: String                                     // URL-Segment, z. B. "sample"
    val displayName: String
    fun reveal(seed: Int): LabPayload                  // was der Spieler sieht — nie die Lösung
    fun score(seed: Int, guess: JsonNode): LabOutcome  // Server leitet neu ab und bewertet
}
```

- `LabPayload` und `LabOutcome` sind **Marker-Interfaces** statt `Any`. An ihnen hängt der
  Serialisierungs-Test, den die Anti-Cheat-Spec für jedes Spiel-DTO fordert.
- Der Guess kommt als `JsonNode` herein, das Spiel konvertiert selbst. Ein `LabGame<G>`-Generikum
  durch die Registry zu fädeln lohnt nicht für etwas, das ein `convertValue` in zwei Zeilen
  erledigt — und die Validierung des Guess gehört ohnehin dem Spiel.
- **Der Server leitet ab und bewertet.** `score` rekonstruiert die Lösung aus dem Seed und
  vergleicht; nichts glaubt dem Client. Das ist der Punkt, an dem das Labor das Anti-Cheat-Fundament
  tatsächlich übt.

Die Registry ist ein von Spring injizierter `Map<String, LabGame>`, Schlüssel = `id`. Doppelte id →
Boot-Fehler (fail fast), unbekannte id → 404.

### REST-Oberfläche

```
GET    /api/lab/{slug}/{game}?seed=123        → LabRoundResponse
POST   /api/lab/{slug}/{game}/guess?seed=123  → LabRoundResponse   (409, wenn schon geraten)
POST   /api/lab/{slug}/{game}/reset?seed=123  → LabRoundResponse   (alle Einträge)
DELETE /api/lab/{slug}/{game}/me?seed=123     → LabRoundResponse   (nur der eigene)
```

```
LabRoundResponse(
    seed: Int,
    payload: LabPayload,          // aus reveal(seed)
    me: LabEntry?,                // null, solange ich nicht geraten habe
    others: List<LabEntry>,       // alle übrigen Testspieler dieser Runde
    tookOverRound: Boolean,       // true, wenn dieser Aufruf eine andere Runde verworfen hat
)
```

Jede Antwort liefert denselben Rundenstand, damit die Shell nach jeder Aktion ohne zweiten Aufruf
neu zeichnen kann. `tookOverRound` ist das Signal für die Übernahme-Meldung — der Client kann sie
nicht selbst erkennen, weil er den vorher gespeicherten Seed nicht kennt.

`reveal(seed)` wird bei **jedem** Aufruf neu gerechnet. Es ist rein und nur vom Seed abhängig, also
ist das idempotent — es braucht keinen Cache und keinen abgelegten Rundenzustand.

Jeder Aufruf trägt den Seed — er ist der Rundenschlüssel, und die Auto-Eviction greift genau dort.
Mutierende Aufrufe laufen über `apiFetch` und tragen den CSRF-Header wie überall sonst.

## Die Attrappe

`SampleLabGame`, id `sample`, Anzeigename „Zahlenraten (Attrappe)". Kein Bezug zum
Guess-Hue-Datenset.

- `reveal(seed)` zieht mit `SeededRandom.fromSeed(seed).nextIntBetween(1, 100)` eine versteckte
  Zahl und liefert als Payload **nur** den Hinweis, in welchem Bereich sie liegt.
- `score(seed, guess)` leitet dieselbe Zahl **neu ab** und vergleicht → `{ correct, distance,
  direction }`.

So dumm sie ist, sie übt genau das, was am Labor schiefgehen kann: Determinismus über
`SeededRandom`, Lösung nie im Payload, Server bewertet, ein Guess pro Runde, beide Resets, zwei
Spieler. **Sie bleibt nach Spiel #1 stehen** — als Rauchprobe des Labors und als Vorlage, an der
man sieht, wie ein Spiel sich einsteckt.

## Frontend

- Seite: `src/pages/c/[slug]/lab/[game].vue` — innerhalb des `[slug]`-Shells.
- Registry: `src/gamelab/games.ts` bildet Spiel-id → Komponente ab. Heute nur `sample`. Eine
  unbekannte id rendert eine freundliche Meldung, nicht den 404-Catch-all — die Route passt ja.
- **Steuerleiste (gehört der Shell, nicht dem Spiel):** Seed anzeigen / eintippen / würfeln,
  „Runde zurücksetzen", „Meinen Guess löschen", „Aktualisieren", „Spieler wechseln", plus die
  Liste der Einträge aller Testspieler.

### Kein Nav-Eintrag, nirgends verlinkt

Der SPA-Bundle ist für Staging und Produktion **derselbe Code** (`develop` → `:staging`, `main` →
`:latest`), die Umgebung ist zur Bauzeit also nicht bekannt. Statt einen `labEnabled`-Flag durch
`/api/me` zu ziehen, gilt dasselbe Prinzip wie beim Login-Knopf: **der Server entscheidet.** Auf
Produktion antwortet die API 404 und die Seite sagt „Das Spiel-Labor ist in dieser Umgebung nicht
verfügbar."

Dass man die URL kennen muss, ist **Teil der Zugangsbeschränkung** aus Anforderung 4, kein Mangel.
Die URL steht in `webapp-vue/README.md`.

## Spielerwechsel

Der Wechsel läuft über den **vorhandenen** Test-Login-Picker — kein zweiter Auth-Mechanismus, keine
„spiele als X"-Umgehung. Der Guess-Pfad bleibt damit identisch zum späteren echten Spiel: echter
Principal, echte Session.

Eine kleine, klar abgegrenzte Ergänzung macht ihn benutzbar: **`/login/github?redirect=<pfad>`**,
und `POST /login/github/as` leitet dorthin statt nach `/`. Validiert wird auf Pfade, die mit genau
einem `/` beginnen (kein `//`, kein Schema) — offener Redirect ausgeschlossen; der Code ist ohnehin
`@Profile("!production")`. Die Steuerleiste bekommt dadurch einen Knopf, der nach der Auswahl
**auf dieselbe Lab-URL mit demselben Seed** zurückkehrt.

Das ist die **einzige Änderung außerhalb des neuen Moduls**, und sie entscheidet, ob
Mehrspieler-Testen benutzbar ist oder nur theoretisch geht: ohne sie kostet jeder Spielerwechsel
die Test-Runde.

Echtes Gleichzeitig-Spielen bleibt möglich, ohne dass wir etwas dafür bauen: zweites
Inkognito-Fenster, anderer Seed-User, **dieselbe** Lab-URL.

## Tests

**Backend** (mockk + kotest + MockMvc Kotlin DSL, siehe
[testing.md](../../../.claude/guidelines/testing.md)):

- `LabRoundStore`: Auto-Eviction beim Seed-Wechsel, beide Resets, Ein-Guess-Regel, nebenläufige
  Schreiber.
- Controller: gleicher Seed → gleicher Payload; anderer Seed → anderer Payload; zweiter Guess →
  409; Nicht-Mitglied → 404; unbekannte Spiel-id → 404.
- **Serialisierungs-Hygiene:** der serialisierte `sample`-Payload enthält die versteckte Zahl
  nicht — als **roter Test**, nicht als Kommentar. Das ist die Vorlage, die die Anti-Cheat-Spec
  für jedes künftige Spiel-DTO fordert.
- Abschalt-Test: mit `app.game-lab.enabled=false` ist keine Lab-Bean im Kontext.
- `ModularityTests` muss mit dem neuen Modul grün bleiben.

**Frontend** (Vitest, siehe
[frontend-testing.md](../../../.claude/guidelines/frontend-testing.md)):

- fehlender oder kaputter Seed → gewürfelt und per `replace` in der URL;
- Steuerleisten-Aktionen treffen die richtigen Endpunkte;
- unbekannte Spiel-id rendert die Meldung.

## Bewusst nicht

- **Keine Rundennummer- oder Countdown-Simulation.** Der Seed *ist* die Rundenidentität im Labor.
- **Keine Zeitmessung, kein Aufdeck-Zeitstempel.** Das gehört zum Guess-Speicher-Weg, den dieses
  Vorhaben ausdrücklich nicht vorwegnimmt.
- **Keine simulierten Mitspieler (Bots).** Erwogen und verworfen: die Rangliste mit mehreren
  Einträgen lässt sich mit zwei Fenstern in einer Minute herstellen.
- **Kein „spiele als X" ohne Session-Wechsel.** Es wäre schneller, ließe den Guess aber nicht mehr
  über den echten Principal laufen — genau die Stelle, die Anti-Cheat später prüft.
- **Kein globaler „alles leeren"-Knopf** — die Auto-Eviction macht ihn überflüssig.
- **Kein Super-Admin-Gate** — siehe *Warum non-prod genügt*.

## Die eine bewusste Abweichung vom echten Spiel

Im Labor steht der **Seed offen in der URL**; im echten Spiel ist der Hidden Seed server-only und
darf in keinem DTO-Typ vorkommen. Das ist unvermeidbar — Anforderung 2 verlangt genau das — und es
ist die **einzige** Abweichung.

Zwei Konsequenzen zum Notieren:

1. Das Labor kann „der Seed erreicht den Client nicht" **nicht prüfen**. Es prüft „die Lösung steht
   nicht im Payload". Das ist weniger, aber es ist die Hälfte, die man automatisiert festhalten
   kann.
2. Der echte Spielweg bekommt später **seinen eigenen Controller**, in den die Lab-URL-Mechanik
   nicht hineinreicht. Der Seed wandert dort aus der URL in die Runden-Zeile; geteilt wird nur der
   reine Spielkern.

## Feed knowledge back

Nach der Umsetzung gehört in `.claude/guidelines/` — vermutlich in eine neue Datei oder als
Abschnitt neben `game-content.md`:

- **Das Muster „non-prod-Werkzeug"**: Profil-Gate **und** eigener Schalter, Beans gar nicht
  verdrahtet statt Rollenprüfung, 404 statt 403, `application-*.yaml` in allen drei Umgebungen
  gesetzt. Das Labor ist nach dem Test-Login der zweite Fall — ab hier ist es eine Konvention.
- **In-Memory-Zustand, der sich selbst begrenzt**: ein Schlüssel, ein aktiver Eintrag,
  Auto-Eviction beim Wechsel. Kein TTL, kein Cap.
- **Die Richtungsregel** aus dem Zuschnitt-Abschnitt: Werkzeug passt sich dem Produkt an, nie
  umgekehrt — mit dem Henne-Ei-Grund, damit sie nicht als Abstraktionsabsicht missverstanden wird.
- **Der Serialisierungs-Hygiene-Test** als Pflichtstück jedes Spiel-DTOs, mit `SampleLabGame` als
  ausführbarer Vorlage.
