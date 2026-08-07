# Cross-Runtime RNG (JVM ↔ Browser)

**Status:** Machbarkeitsanalyse — **empirisch verifiziert** (2026-08-02)
**Frage:** Kann dieselbe zufällige, aber reproduzierbare Zahlenreihe auf der JVM *und* im Browser
erzeugt werden, wenn beide mit demselben Seed initialisiert werden?
**Code:** `core/src/main/kotlin/…/rng/SeededRandom.kt` (Modul `rng`),
`webapp-vue/src/lib/rng/__tests__/seededRandom.reference.ts` (Test-Scope),
Vertrag in `shared/rng/golden-vectors.json`.

> ## Nachtrag: die Antwort ist „ja", die Konsequenz war trotzdem eine andere
>
> Aus der anschließenden Anti-Cheat-Diskussion folgte, dass die geteilte Ableitung **nicht gebraucht
> wird — und für ein kompetitives Spiel schädlich wäre.** Ein Seed, aus dem der Client die Runde
> ableiten kann, verrät ihm jede künftige Ziehung. Runden sind deshalb **server-autoritativ**: der
> Server leitet Rätsel und Lösung aus einem Seed ab, den er nie ausliefert, und validiert die
> Einsendung selbst. Der Client bekommt nur Renderbares.
>
> **Warum diese Analyse trotzdem trägt:** der Kotlin-Generator ist unabhängig davon nötig, weil der
> Server Runden reproduzieren können muss, ohne generierten Zustand zu speichern — und *keine*
> Plattform-RNG leistet das (siehe „Warum keine Plattform-RNG"). Was wegfällt, ist nur der
> *Verwendungszweck* der Browser-Seite.
>
> Die TS-Implementierung liegt darum in **Test-Scope**: sie hält die Portabilität nachweisbar, ohne
> dass jemand darauf aufbaut. Fördern nach `src/lib/rng/` nur für Präsentations-Zufall — nie für
> Spielausgänge. Ein wahrscheinlicher erster Anlass steht im
> [Anti-Cheat-Spec](2026-08-02-anti-cheat-design.md): dekorative Geometrie muss bei *jedem* Spieler
> identisch aussehen (Wahrnehmung ist Teil der Fairness), und sie aus einem öffentlichen Seed
> abzuleiten ist billiger, als jede Koordinate zu übertragen.
>
> Rückblickend war die Frage nach der Parität von der alten Nuxt-App geprägt: dort lag die Spiellogik
> in Client-Composables gegen Firestore, es gab keinen Ort für autoritative Runden. Mit einem echten
> Backend verschiebt sich die richtige Grenze — und damit die richtige Antwort.

## Ergebnis

**Ja — bit-identisch, nicht nur „statistisch gleich".** Nachgewiesen über **alle drei
JS-Engine-Familien** (V8, JavaScriptCore, SpiderMonkey) und **fünf JVMs von fünf Herstellern**,
darunter OpenJ9 als zweite VM-Implementierung. Übereinstimmung bis auf die IEEE754-Bits, über
1.000.000 Ziehungen hinweg, inklusive Umlaut- und Emoji-Seeds.

Das gilt allerdings **nur unter zwei harten Bedingungen**, und beide sind kontraintuitiv:

1. **Keine Plattform-RNG verwenden** — weder `kotlin.random.Random` noch
   `RandomGeneratorFactory`. Deren Ausgabe ist nicht versionsstabil (Belege unten).
2. **Nur exakt spezifizierte Operationen** im deterministischen Pfad. `Math.sin/cos/tan/log/exp/
   atan/cbrt/pow` sind laut Spezifikation *implementation-approximated* — und sie divergieren
   messbar bereits **zwischen Chrome und Safari**.

Punkt 2 ist der eigentliche Fallstrick. Ein Würfel oder Shuffle ist trivial portabel; eine
Normalverteilung über Box-Muller ist es **nicht**.

## Was tatsächlich gemessen wurde

Abgedeckte Runtimes: **alle drei JS-Engine-Familien** — V8 (Node 24, Chromium 148), JavaScriptCore
(Safari-Engine), SpiderMonkey (Firefox 151) — und **fünf JVMs von fünf Herstellern**, darunter eine
zweite VM-Implementierung:

| JVM | VM | Ergebnis |
|---|---|---|
| Eclipse Temurin 25.0.3 | HotSpot | Referenz |
| BellSoft Liberica 25.0.4 *(die JRE, die Paketo verwendet)* | HotSpot | identisch |
| Amazon Corretto 25.0.4 | HotSpot | identisch |
| Azul Zulu 25.0.3 | HotSpot | identisch |
| IBM Semeru 25.0.3 | **Eclipse OpenJ9** | identisch |

Der JVM-Lauf verwendete die **kompilierte `SeededRandom`-Klasse selbst** (nicht eine
Java-Nachbildung), in je einem Container pro JRE. Der Browser-Lauf verwendete die **aus
`seededRandom.reference.ts` kompilierte** Datei, gegen dieselbe Vektor-Datei: 97/97 Fälle in
Firefox 151, 97/97 in Chromium 148.

| Prüfung | Runtimes | Ergebnis |
|---|---|---|
| 12 Rohwörter × 20 Seeds (int + string) | JVM, Node, Chromium, JSC | identisch |
| `nextInt(bound)` für 12 Bounds inkl. 1, 2^16, 2^31−1 | JVM, Node | identisch |
| `nextIntBetween` inkl. `Int.MIN..Int.MAX` | JVM, Node | identisch |
| `nextDouble()` — Vergleich auf **IEEE754-Bitebene** | JVM, Node, Chromium | identisch |
| `nextBoolean()` × 64 | JVM, Node | identisch |
| Fisher-Yates-Shuffle, Größe 0/1/2/5/20/52/200 | JVM, Node, Chromium | identisch |
| `weightedPick` inkl. Gewicht 0 und `1e-9 … 1e9` | JVM, Node | identisch |
| **1.000.000 Ziehungen**, Prüfsumme mod 1e9+7 | JVM, Node, Chromium, JSC | identisch |
| Seeds mit Umlauten/Emoji (`hütte-2026`, `Grüße`, `Silvester🎉`) | JVM, Node, Chromium | identisch |

Ausgeführt als reguläre Test-Suites: **7 Kotlin-Tests** (`./mvnw test`, 117 Tests gesamt grün) und
**105 Vitest-Tests** (`pnpm test`, 215 gesamt grün), beide gegen *dieselbe* Vektor-Datei.

### Der Gegenbeweis, der die Regeln definiert

200.000 identische Eingaben pro Funktion, V8 gegen JavaScriptCore, XOR-Faltung der Ergebnis-Bits:

| Funktion | V8 vs. JSC |
|---|---|
| `sqrt`, `Math.imul`, Division durch 2⁵³ | **identisch** |
| `sin`, `cos`, `tan`, `log`, `exp`, `atan`, `cbrt` | **divergent** |

Konkretes Einzelbeispiel: `Math.cos(0.3333333333333333 × 2π)` ergibt in V8 die Bits
`…422716`, in JSC `…422717` — 1 ULP Unterschied. In einem Spiel mit geteiltem Seed genügt das, um
Chrome- und Safari-Clients auseinanderlaufen zu lassen. Deckungsgleich mit der Spezifikation: die
ECMAScript-Spec erlaubt für diese Funktionen ausdrücklich „implementation-approximated" Werte,
`Math.sqrt` hingegen ist per IEEE 754 korrekt gerundet.

Auf der JVM gilt dasselbe Muster: `Math.log` garantiert nur 1-ULP-Genauigkeit, `StrictMath.log` ist
bit-exakt (fdlibm). Ein JS-Äquivalent zu `StrictMath` existiert nicht — also bleibt der Ausweg
„StrictMath verwenden" dem Browser verschlossen.

## Warum keine Plattform-RNG

| Quelle | Warum unbrauchbar |
|---|---|
| `kotlin.random.Random(seed)` | KDoc schränkt selbst ein: gleiche Folge nur „within the same version of Kotlin runtime", plus expliziter Hinweis, dass künftige Versionen den Algorithmus ändern dürfen. |
| `RandomGeneratorFactory.of("Xoshiro256PlusPlus")` u. a. | Implementierungen liegen in `jdk.internal.random`, die Seed→State-Expansion ist nirgends spezifiziert, und `java.util.random`-Paketdoku sagt das Gegenteil einer Garantie zu: „Over time, new algorithms may be added and old algorithms may be removed." |
| `SplittableRandom` | Reproduzierbarkeit ist auf „the same seed **in the same program**" beschränkt; die SplitMix64-Konstanten stehen nur im Quellcode-Kommentar, nicht in der Spec. *(De facto ist es reines SplitMix64 — hier gegengeprüft: `SplittableRandom(42).nextLong()` = −4767286540954276203 = meine SplitMix64-Referenz.)* |
| `SecureRandom` | Laut Spec ausdrücklich nicht-deterministisch, zusätzlich provider-abhängig. |
| `java.util.Random` | **Die einzige spec-garantierte portable Option** — das Javadoc verpflichtet Implementierungen auf die abgedruckten Algorithmen „for the sake of absolute portability". Als Fallback tragfähig, aber: 48-Bit-LCG, Periode 2⁴⁸, schwache niedrige Bits. Und die von `RandomGenerator` *geerbten* Methoden (`nextInt(origin,bound)`, `ints()`, `nextGaussian(mean,sd)`) sind **nicht** bit-exakt spezifiziert. |

Dass „nicht spezifiziert" hier nicht theoretisch ist, zeigt ein realer Fall: der Stream von
`L32X64MixRandom` — dem Algorithmus hinter `RandomGenerator.getDefault()` — hat sich in einem
**Patch-Release einer LTS** geändert ([JDK-8282551](https://bugs.openjdk.org/browse/JDK-8282551),
„L32X64MixRandom does not initialize x0 and x1 fields", ausgeliefert in OpenJDK 17.0.4). Ein
persistierter Seed hätte nach einem JDK-Patch andere Spielergebnisse erzeugt.

Lokal auf Temurin 25 gegengeprüft: `RandomGeneratorFactory.of("L32X64MixRandom").create(42L)` liefert
`3032659597387867542, 5220667421160197718` — die Werte *nach* dem Fix.

**Konsequenz:** Der Generator muss selbst geschrieben und in beiden Sprachen gepflegt werden. Das
sind ~40 Zeilen pro Seite; die Kosten liegen nicht im Code, sondern in der Absicherung gegen Drift.

## Spielt die konkrete JRE eine Rolle?

**Nein — und das ist keine Beobachtung, sondern eine Folge der Algorithmuswahl.** Der Container wird
via Paketo/Buildpacks gebaut; es ist kein `BP_JVM_VERSION` gesetzt, die JRE ist also die
Buildpack-Vorgabe (BellSoft Liberica) und kann sich mit jedem CI-Lauf ändern. Für diesen Generator
ist das ohne Belang, weil er ausschließlich Operationen verwendet, die die **JLS** festnagelt:

- Ganzzahlarithmetik ist Zweierkomplement mit stillem Überlauf (JLS 4.2.2: „The integer operators do
  not indicate overflow or underflow in any way"), Shifts maskieren die Distanz (5 Bit bei `Int`).
- `double`-Addition/Multiplikation/Division folgen IEEE 754, und seit **Java 17 ist `strictfp`
  dauerhaft aktiv** (JEP 306) — es gibt keine „erweiterte Präzision" mehr, die je nach Plattform
  abweichen könnte.

Genau deshalb wurde `RandomGeneratorFactory` verworfen: dort steckt die Logik in nicht
spezifiziertem JDK-Code, und da *hat* ein Patch-Release den Stream geändert. Was wir stattdessen
benutzen, kann sich nicht ändern, ohne die JVM-Spezifikation zu brechen.

Empirisch bestätigt (Tabelle oben): fünf Hersteller, fünf identische Ausgaben, inklusive OpenJ9 —
einer anderen VM mit anderem JIT. Das ist die Bestätigung, nicht die Begründung.

### Und die Prozessorarchitektur?

**Ebenfalls nein, aus demselben Grund.** Die Spezifikationen beschreiben Ergebnisse, nicht Register:
JVM-Bytecode-Ops wie `imul`/`iushr` sind unabhängig vom Befehlssatz definiert, und ECMAScript
definiert `Math.imul` als exakte modulare 32-Bit-Multiplikation. Ein JIT darf die Semantik nicht
verändern, egal auf welcher ISA er übersetzt. Auch die Wortbreite ist irrelevant: ein Kotlin-`Int`
ist per Spec 32 Bit, ob die CPU 32 oder 64 Bit rechnet.

Gemessen — dieselbe kompilierte `SeededRandom`-Klasse bzw. dasselbe kompilierte
`seededRandom.js` unter QEMU:

| Plattform | JVM (Temurin 25) | Node (97 Vektoren) |
|---|---|---|
| arm64 (Host) | Referenz | PASS |
| linux/amd64 | identisch | PASS |
| linux/ppc64le | identisch | PASS |
| **linux/arm/v7 (32 Bit)** | kein JDK-25-Build | **PASS** (Node 22) |
| **linux/s390x (Big-Endian, IBM Z)** | **identisch** | **PASS** (Node 20, Debian) |

Der 32-Bit-Lauf ist der Gegenprobe wegen dabei: er zeigt, dass die Wortbreite der CPU nichts ändert.
Die JS-Seite meldet auf s390x korrekt `endianness=BE` — die Prüfung lief also wirklich Big-Endian
und lieferte trotzdem alle 97 Fälle identisch.

**Die eine Stelle, an der die Architektur durchschlagen könnte, ist die Byte-Reihenfolge** — und die
ist bewusst entschärft: der Generator interpretiert nie Bytes, er rechnet nur. Nur der Test-Helfer
liest IEEE754-Bits, und der benutzt `DataView` mit **explizitem** Endianness-Flag. Ein
`Uint32Array`-View auf denselben Puffer würde die Byte-Reihenfolge des Agents verwenden — die folgt
in der Praxis der CPU und wäre auf s390x eine andere. Der Big-Endian-JVM-Lauf bestätigt, dass hier
nichts durchsickert.

Auf der JS-Seite ist das ebenfalls belegt: die offiziellen Node-Images decken nur Little-Endian ab
(amd64, arm64, ppc64le) — praktisch existiert also gar kein Big-Endian-Browser-Ziel —, aber über
Debian s390x (V8 hat dort einen gepflegten Port) lief die Prüfung trotzdem: `endianness=BE`,
97/97 identisch.

Ein Nebenaspekt gehört hierher, weil er die Verbotsliste stützt: bei den *verbotenen*
transzendenten Funktionen **kann** die Architektur sehr wohl durchschlagen. V8 liefert eine eigene
fdlibm-Portierung mit und ist deshalb über ISAs hinweg konsistent; JavaScriptCore und SpiderMonkey
können an die Plattform-`libm` delegieren — dann hängt das letzte Bit an libm-Version *und*
Architektur. Die gemessene V8-gegen-JSC-Divergenz unterschätzt das Problem also eher.

Zwei praktische Konsequenzen bleiben:

- **Wenn `BP_JVM_VERSION` je unter die Bytecode-Version fällt, startet die App gar nicht.** Der
  Kotlin-Output ist Bytecode 69 (Java 25); eine JRE 21 wirft `UnsupportedClassVersionError`. Das ist
  ein Deployment-, kein Determinismus-Thema — es fällt beim ersten Start auf, nicht schleichend.
- **Der Golden-Vector-Test läuft in CI ohnehin auf der Build-JVM.** Er würde eine hypothetische
  JVM-Abweichung ohne Zusatzaufwand melden.

## Der Entwurf

**xoshiro128\*\*** (4 × 32 Bit State) mit **splitmix32**-Seed-Expansion, String-Seeds über
**FNV-1a-32 auf UTF-8-Bytes**.

**Verifiziert gegen die kanonische Referenz** ([prng.di.unimi.it/xoshiro128starstar.c](https://prng.di.unimi.it/xoshiro128starstar.c)):
unsere `next()`-Schritte sind zeilengleich mit Vignas C-Code. Das ist keine Formalie — es gibt **zwei
Varianten**, und die überholte v1.0 liest den Scrambler aus `s[0]` statt `s[1]`. Unsere
Implementierung liest `s[1]` (v1.1). Qualität: xoshiro128\*\* läuft PractRand 0.95 bis 64 GB ohne
Anomalie, auch mit bit-umgekehrten Wörtern — womit auch die Frage nach schwachen niedrigen Bits
erledigt ist (deshalb steht im Code keine solche Behauptung).

Bewusst 32-Bit statt 64-Bit: 64-Bit-Generatoren (splitmix64, xoshiro256\*\*) sind im Browser nur über
`BigInt` exakt darstellbar. Gemessen (5 Mio. Ziehungen, Node 24, mit Warmup):

| Variante | ns/Ziehung |
|---|---|
| xoshiro128\*\* mit `Math.imul` (gewählt) | **1,7** |
| xoshiro256\*\* via `BigInt`, `BigInt.asUintN(64, …)` | 163 |
| xoshiro256\*\* via `BigInt`, `& ((1n<<64n)-1n)` | 173 |

Also rund **zwei Größenordnungen**. `asUintN` brachte hier nur ~6 % gegenüber der Maske — deutlich
weniger, als ihm gelegentlich zugeschrieben wird. Beide 64-Bit-Varianten wurden ebenfalls
JVM↔Browser bit-genau verifiziert; sie funktionieren, kosten aber Leistung ohne Gegenwert für
Mini-Spiele. (Frühere Notiz „~34×" in diesem Dokument war ein ungewärmter Messlauf mit
Closure-Overhead auf der 32-Bit-Seite; obige Tabelle ist die belastbare Messung.)

Ein zusätzlicher Vorzug, der beim Portieren zählt: die einzigen Multiplikatoren im Update-Schritt
sind 5 und 9 — deren Produkte bleiben unter 2⁵³, sodass dort selbst ein naives `(x*5)|0` korrekt
wäre. Der klassische JS-Multiplikationsfehler kann im Kern also gar nicht auftreten. Nötig ist
`Math.imul` in der **splitmix32**-Seed-Expansion, die mit `0x21f0aaad`/`0x735a2d97` rechnet.

**Fallback**, falls man sich gegen die xoshiro-Familie absichern will: `sfc32` (chaotisch statt
F₂-linear, ebenfalls sauber bis 64 GB) — dann aber die Warmup-Rundenzahl explizit festschreiben, die
zwischen den verbreiteten Implementierungen von 0 bis 15 schwankt.

### Warum keine Bibliothek

Der stärkste Einzelbefund gegen „nimm doch ein Package": Apache Commons RNG 1.6 liefert unter
`XoShiRo128StarStar` die **überholte v1.0** und stimmt damit nicht mit Vignas Referenz überein. Auf
npm-Seite gibt `pure-rand` (~65 Mio. Downloads/Woche) nur die *niedrigen* 32 Bit von xoroshiro128+
zurück und erzeugt mit kleinen Integer-Seeds sichtbare Muster (`1,6,5,4,3,2,1,6,5,4,…` bei
`uniformIntDistribution(1,6)` über die Seeds 1…20). Zwei Abhängigkeiten plus Versions-Pinning
leisten weniger als eine eingecheckte Vektor-Datei.

### Operations-Abbildung

| Zweck | Kotlin | TypeScript |
|---|---|---|
| 32-Bit-Multiplikation | `a * b` (Int) | `Math.imul(a, b)` — **nie** `a * b` |
| Rotation | `(x shl k) or (x ushr (32-k))` | `(x << k) \| (x >>> (32-k))` |
| Logischer Shift | `ushr` | `>>>` |
| Unsigned lesen | `Int.toUInt().toLong()` | `x >>> 0` |
| Double aus 53 Bit | `(hi * 2^26 + lo) / 2^53` | identisch |

Beide Plattformen maskieren die Shift-Distanz mod 32, und `Math.imul` ist per Spec exakt die
modulare 32-Bit-Multiplikation — also bitgleich zu Kotlins `Int`-Multiplikation.

### Die Signed-Falle

Der gefährlichste Unterschied ist kein Rechenfehler, sondern ein Vergleichsfehler: ein uint32 über
2³¹ ist als Kotlin-`Int` **negativ**, in JS nach `>>> 0` dagegen positiv. Ein Rejection-Loop
`while (r < threshold)` verhält sich dann auf beiden Seiten unterschiedlich. Deshalb gibt
`nextUint32()` in Kotlin **`Long`** zurück (0…2³²−1) — die Falle wird nicht umgangen, sondern
strukturell entfernt.

### Abgeleitete Werte

- `nextInt(bound)`: Rejection mit `threshold = 2^32 % bound`, dann `r % bound`. Unverzerrt; ein
  nacktes `% bound` würde die niedrigen Reste übergewichten.
- `nextDouble()`: 53 Bit aus zwei Wörtern, Skalierung durch eine exakte Zweierpotenz.
- `nextBoolean()`: **höchstes** Bit (die niedrigen Bits der xoshiro-Familie sind schwächer).
- `shuffled()`: Fisher-Yates **absteigend**, `j = nextInt(i+1)`. Richtungswechsel oder `nextInt(n)`
  ergeben eine andere *und* verzerrte Permutation.
- `weightedPick()`: Gewichte strikt von links nach rechts summiert, damit beide Seiten dieselbe
  IEEE754-Additionsfolge ausführen.

### Verboten im deterministischen Pfad

- `sin`, `cos`, `tan`, `log`, `exp`, `pow`, `atan`, `cbrt` → **kein Box-Muller-Gauss**. Wer eine
  Normalverteilung braucht: serverseitig ziehen und den Wert übertragen, oder eine ganzzahlige
  Approximation (Summe uniformer Ziehungen) verwenden.
- `Collections.shuffle` / `MutableList.shuffle(Random)` / Sortieren mit Zufalls-Comparator.
  (`Array.prototype.sort` ist seit ES2019 stabil spezifiziert — das Problem ist nicht die Sortierung,
  sondern dass ein Zufalls-Comparator inkonsistent ist, engine-abhängig oft verglichen wird und eine
  verzerrte Permutation liefert.)
- Bit-Reinterpretation über mehrbytige TypedArray-Views: die Byte-Reihenfolge des Agents ist
  *implementation-defined*. `DataView` mit **explizitem** Endianness-Flag verwenden.
- `Intl` / `localeCompare` / `for-in`-Reihenfolge.
- **`DoubleStream.sum()`** zum Summieren der Gewichte: Java wendet dort Kahan-Kompensation an und
  weicht damit von einer naiven Schleife ab. Ein einzelnes ULP im Gesamtgewicht kippt die Auswahl,
  sobald die Ziehung nahe an einer Kumulationsgrenze landet. Kotlins `Iterable<Double>.sum()` ist
  dagegen eine gewöhnliche Links-nach-rechts-Schleife und damit unbedenklich. Am robustesten wären
  **ganzzahlige Gewichte** — dann entfällt das Problem konstruktiv.

## Seeds

**String-Seeds müssen über UTF-8-Bytes gehasht werden.** Der naive JS-Loop über `charCodeAt`
iteriert UTF-16-Code-Units und divergiert für jeden Nicht-ASCII-Seed — bei einem deutschsprachigen
Projekt mit Umlauten in Slugs also praktisch immer. Gemessen:

| Seed | FNV-1a über UTF-8 | FNV-1a über UTF-16 |
|---|---|---|
| `huette` | 833766324 | 833766324 |
| `hütte-2026` | 3145535092 | **3329605845** |
| `straße` | 640088088 | **3227776835** |
| `Silvester🎉` | 418153750 | **604378453** |

`TextEncoder().encode()` (JS) und `toByteArray(Charsets.UTF_8)` (Kotlin) stimmen exakt überein.
Wichtig auf JVM-Seite: `Byte` ist vorzeichenbehaftet, `byte.toInt()` sign-extendet `ü` zu
`0xFFFFFFC3` — deshalb `and 0xff`. Der Fehler ist für ASCII-Seeds **beweisbar unsichtbar** und tritt
genau bei den deutschen Fällen auf.

UTF-16-Code-Units wären die ebenso gangbare Alternative — Kotlins `String` *ist* UTF-16, `it.code`
entspricht dann `charCodeAt`, und die Byte-Vorzeichenfalle entfällt. Gewählt wurde UTF-8, weil es die
plattformneutrale Darstellung ist; wichtig ist allein, dass **eine** Konvention festgeschrieben und
getestet ist.

**Nicht gelöst, absichtlich:** Unicode-Normalisierung. `hütte` als NFC (`ü` = U+00FC) und als NFD
(`u` + U+0308) sind unterschiedliche Byte-Folgen und hashen verschieden — auf *beiden* Plattformen
gleich verschieden, es ist also keine Runtime-Divergenz, sondern ein Eingabe-Hygiene-Problem. NFC
selbst wäre unbedenklich (die Unicode-Stabilitätsgarantie sichert zu, dass sich die Normalform
bereits zugewiesener Zeichen nie ändert); der Grund, sie *nicht* in den Generator zu ziehen, ist
Zuständigkeit: Kanonisierung von Benutzereingaben gehört an die Persistenzschicht, nicht in einen
Zufallsgenerator. **Empfehlung:** Seeds auf `[a-z0-9-]` begrenzen oder direkt vom
UUID-v7-Primärschlüssel der Runde ableiten, statt vom Anzeige-Slug — dann erreicht nie ein
Nicht-ASCII-Zeichen den Hash. Zusätzlich auf JVM-Seite: `lowercase()` (Kotlin, locale-unabhängig)
statt `toLowerCase()` ohne `Locale.ROOT` — unter türkischem Default-Locale ergibt letzteres ein
punktloses `ı`, und der Seed hinge an der Locale-Konfiguration des Servers.

**64-Bit-Seeds dürfen nicht als JSON-*Zahl* übertragen werden.** Gemessen: die JVM schreibt
`7205759403792793601`, `JSON.parse` liefert `7205759403792794000` — stillschweigender Datenverlust,
weil ein JS-`Number` nur 2⁵³ exakt trägt. Deshalb: Seed auf 32 Bit begrenzen (hier gewählt) oder
als String/Hex übertragen. Ein `Long`-Seed, den Jackson als JSON-Zahl serialisiert, ist ein
Korrektheitsfehler, der keine Exception wirft.

**Cheating ist in diesem Schritt bewusst außerhalb des Scopes.** Wer den Seed im HTTP-Verkehr sieht
und den Algorithmus kennt, kann die Reihe nachrechnen. Das ist eine Entscheidung, kein Versehen: es
geht um Spaß, und die Messlatte ist „nicht *ganz* so einfach wie die Lösung direkt über HTTP zu
übertragen" — die ist damit klar überschritten. Der Vorgänger huettehuette hat genau dasselbe
Niveau: `useFindPatternGameSolution` leitet den Lösungsindex client-seitig aus dem Seed ab, dort war
Mitlesen also ebenso möglich.

Ein Folgeschritt kann das echt dichtmachen. Die Bausteine dafür (nicht Teil dieses Commits):

- **Zwei Seeds, zwei Vertrauensniveaus** — ein Präsentations-Seed (ausgeliefert, treibt nur
  Kosmetik/schon Öffentliches) und ein server-only Seed, der in *keinem* DTO-Typ auftaucht (strukturell,
  nicht per `@JsonIgnore`); der Server wertet aus und schickt nur das Ergebnis.
- **Commit-and-Reveal** für nachprüfbare Fairness: vorab `SHA-256(hiddenSeed || roundId)`
  veröffentlichen, nach der Runde den Seed offenlegen, damit Spieler nachrechnen können.
- **Obfuskation als Ergänzung, nicht als Ersatz** — huettehuette hashte Puzzle-Teil-Dateinamen
  (`p_<puzzleId>_<hash>.jpg`), damit die URL nicht verrät, welches Teil wohin gehört.

## Absicherung gegen Drift

Die JVM ist Source of Truth. `RngGoldenVectors.build()` erzeugt die Erwartungswerte aus der
Kotlin-Implementierung, `SeededRandomGoldenVectorTest` schreibt/prüft
`shared/rng/golden-vectors.json`, und `seededRandom.spec.ts` liest **dieselbe Datei**.

Das ist eine bewusste Abweichung von dem Muster bei `Slugs.slugify` ↔ `slugify.ts`: dort stehen die
Paritäts-Fälle als Literale in *beiden* Test-Dateien. Bei fünf Slug-Beispielen ist das
überschaubar; bei einem RNG würde es bedeuten, dass eine Seite driften kann, ohne rot zu werden.
Eine geteilte Datei macht Drift unmöglich zu übersehen.

Regenerieren nach einer *gewollten* Algorithmusänderung:

```bash
cd core && ./mvnw test -Dtest=SeededRandomGoldenVectorTest -Drng.vectors.write=true
```

Das ist zugleich die Warnschwelle: eine Änderung der Vektoren ist ein **Breaking Change** für jeden
bereits persistierten Seed. Darum trägt die Datei ein `version`-Feld.

### Gleichheit allein genügt nicht

Ein wichtiger blinder Fleck: die gefährlichsten Fehler reproduzieren *perfekt* auf beiden Seiten und
bestehen daher jeden Paritätstest. Ein Shuffle, der `nextInt(size)` statt `nextInt(i+1)` zieht, ist
verzerrt — aber auf JVM und im Browser identisch verzerrt. Deshalb liegen drei Schichten übereinander:

1. **Paritätsvektoren** — JVM gegen Browser. Fangen Divergenz. Weil jeder Fall eine *Folge* von
   12–32 Werten prüft, fangen sie auch abweichenden **Wort-Verbrauch**: verbraucht eine Seite ein
   Wort mehr, verschieben sich alle Folgewerte.
2. **Golden-File-Charakter** — dieselben Vektoren schlagen fehl, wenn sich der Algorithmus ändert,
   *auch wenn beide Seiten gleichzeitig geändert werden*.
3. **Verteilungstest** — Shuffle über alle 24 Permutationen von 4 Elementen, 240.000 Runden, ±10 %.
   Gegengeprüft, dass er wirklich diskriminiert: die verzerrte `nextInt(size)`-Variante liefert
   min 3681 / max 19023 statt 10.000 und fällt klar durch.

Grenze dieser Schichten, offen benannt: die *aufsteigende* Fisher-Yates-Variante mit `nextInt(i+1)`
ist ebenfalls uniform und würde den Verteilungstest passieren. Die Laufrichtung ist also **allein**
durch die Vektor-Datei festgenagelt — nicht durch eine Eigenschaft, die ein Test herleiten könnte.

## Restrisiken

- **Keine Engine-Familie mehr offen.** V8, JavaScriptCore und SpiderMonkey sind gemessen. Der
  Firefox-Nachweis lässt sich jederzeit wiederholen, siehe unten.
- **`rng` ist jetzt ein eigenes Modulith-Modul** (`org.unividuell.countdown.core.rng`, von Modulith
  als `Rng` erkannt, keine Beans, keine Tabellen, keine Flyway-Migration). `SeededRandom` ist die
  exponierte API im Basis-Paket. `ModularityTests` bleibt grün. **Nicht thread-safe und nicht als
  Bean gedacht** — jede Ziehung mutiert den State; eine geteilte Instanz würde parallele Replays
  desynchronisieren. Pro Seed-Einheit (Runde, Rätsel) eine Instanz.
- **NaN-Bitmuster sind implementation-defined.** Im aktuellen Pfad nicht erreichbar, aber bei einer
  künftigen Float-Serialisierung relevant.
- **`Float`/`nextFloat` ist absichtlich nicht enthalten** — nicht benötigt und damit nicht verifiziert.

## Erkenntnisse aus huettehuette (dem portierten Vorgänger)

Die Nuxt-App war reines JS auf beiden Seiten und nutzte **`seedrandom`** (David Bau, ARC4-basiert) —
für uns nicht übernehmbar, weil es kein JVM-Gegenstück hat. Der Blick hinein lohnt trotzdem, denn
dort steht, was der Generator können muss:

**Ein einziges Primitiv trägt alle Spiele.** `utils/seed-random.ts` ist genau
`Math.floor(rng() * max)`, und `utils/predictable-rnd-int.ts` dasselbe mit Min/Max. Sämtliche
Spiellogik ist also gegen **`rng() → double in [0,1)`** geschrieben, nicht gegen bounded Ints.

**Das ist die wichtigste Konsequenz für die Portierung:** unser `nextInt(bound)` zieht per Rejection
direkt aus Rohwörtern, ihr `seedRandom(rng, max)` skaliert einen Double. Beide sind
cross-runtime-exakt, liefern aber **unterschiedliche Werte und verbrauchen unterschiedlich viele
Wörter**. Beim Portieren eines Spiels heißt das: nicht mechanisch `seedRandom(rng, n)` durch
`nextInt(n)` ersetzen und annehmen, es käme dasselbe heraus. Für Spiele, deren Rätsel-Charakter an
der konkreten Verteilung hängt, ist entweder ihr Float-Pfad exakt nachzubauen (`Math.floor(nextDouble() * n)`
— mit `nextDouble()` bit-exakt, also portabel) oder das Spiel gegen die neue API neu zu verifizieren.
Alte Spielstände/Rätsel sind ohnehin nicht reproduzierbar, weil der Kern ein anderer ist.

**Ihr Shuffle bestätigt unseren.** `usePuzzleScrambleGame.shuffleArray` ist absteigendes Fisher-Yates
mit Bound `i + 1` — strukturgleich zu `shuffled()`. Die Laufrichtung, die bei uns nur durch die
Vektor-Datei festgenagelt ist, entspricht damit auch der erprobten Vorlage.

**Seeds waren dort durchweg Strings**, und zwar heterogen: `seedrandom(round.toString())`
(Rundennummer), `seedrandom(gameId)`, `seedrandom(db.uid)`. Zwei Lehren:

- `fromSeed(7)` und `fromSeed("7")` sind bei uns **verschiedene Ströme**. Wenn die Rundennummer der
  Seed ist, muss festgelegt sein, welche Variante gilt — sonst driften Server und Client
  auseinander, obwohl beide „Runde 7" meinen.
- Die dort verwendeten Seeds (Firebase-IDs, UUIDs, Zahlen) sind ASCII. Die Umlaut-Falle wäre also
  nicht aufgefallen — genau das macht sie gefährlich, sobald jemand einen Community-Slug als Seed
  nimmt.

**Ein zweiter Hash lauert dort**, falls Puzzle Scramble portiert wird: `hashPieceId` ist ein
djb2-artiger 32-Bit-Hash über `charCodeAt` (UTF-16), der in Dateinamen einfließt. Wenn der Server
diese Namen künftig mit erzeugt, ist das ein weiterer Paritäts-Vertrag — und dort gilt **UTF-16**
(`it.code` in Kotlin), nicht UTF-8, weil die bestehenden Dateinamen daran hängen.

**Presentation-Randomness gibt es schon:** `useUsers` leitete die Avatar-Hintergrundfarbe aus
`seedrandom(db.uid)` ab. Im neuen Backend ist `bgColorHex` persistiert — die Portierung hat diese
RNG-Abhängigkeit bereits eliminiert, und das ist die bessere Lösung.

## Nachweise wiederholen

**Beide Testsuiten** (das ist die eigentliche Absicherung, läuft in CI):

```bash
cd core && ./mvnw test -Dtest=SeededRandomGoldenVectorTest && cd ../webapp-vue && pnpm vitest run src/lib/rng
```

**Andere JVMs** — kompilierte Klasse pro JRE in einem Container, Ausgaben müssen identisch sein:
Klassen + `kotlin-stdlib.jar` + ein `main`, das ein paar Ströme druckt, per `docker build` in
`eclipse-temurin:25-jre`, `bellsoft/liberica-openjre-debian:25`, `amazoncorretto:25`,
`azul/zulu-openjdk:25-jre`, `ibm-semeru-runtimes:open-25-jre` kopieren und `diff`en. (Bind-Mounts
scheitern unter Docker Desktop an File Sharing — `docker build` umgeht das.)

**Firefox / andere Browser** — `seededRandom.reference.ts` mit `tsc` nach JS übersetzen, es zusammen mit
`shared/rng/golden-vectors.json` von einem lokalen Node-Server ausliefern, im Browser alle Fälle
prüfen und das Ergebnis per `fetch` an den Server zurückposten. Gemessen: Firefox 151 → 97/97,
Chromium 148 → 97/97. Sinnvoll als gelegentlicher manueller Lauf; für CI wäre Playwright mit
`firefox`/`webkit` der Weg, kostet dann aber Browser-Downloads im Build.

## Nicht Teil dieser Analyse

Ziel dieses Schritts ist ausschließlich: **mit demselben Seed isoliert dieselben Werte berechnen
können** — auf der JVM und im Browser. Das ist erreicht und abgesichert.

Kein Feature, kein Endpoint, keine Persistenz: der Generator ist an nichts angeschlossen. Offen
bleiben, als Folgeschritte:

1. **Anti-Cheat** — ausgearbeitet in [Anti-Cheat für die Mini-Spiele](2026-08-02-anti-cheat-design.md)
   (Absichtserklärung; wird am ersten Mini-Game validiert).
2. **Seed-Herkunft und -Lebensdauer** — Runde? Community? UUID-v7-PK? Und `fromSeed(7)` vs.
   `fromSeed("7")` verbindlich festlegen.
3. **Portierung der Spiele** — mit der Float-vs-Rejection-Frage aus dem huettehuette-Abschnitt.

## Feed knowledge back

Kandidaten für `.claude/guidelines/`:

- **Determinismus-Regel** (neu oder in `frontend.md`): Im JVM↔Browser-geteilten Code sind nur
  exakt spezifizierte Operationen erlaubt; `sin/cos/tan/log/exp/pow/atan/cbrt` sind verboten, weil
  sie zwischen V8 und JavaScriptCore messbar um 1 ULP divergieren.
- **UTF-8-Regel**: Jeder Hash über einen String, der auf beiden Seiten gleich sein muss, läuft über
  UTF-8-Bytes — nie über `charCodeAt`/UTF-16.
- **JSON-`Long`-Regel** (`security-and-auth.md` oder `persistence.md`): Ein `Long` über 2⁵³ darf nicht
  als JSON-Zahl an die SPA gehen. Betrifft potenziell jede künftige numerische ID.
- **Paritäts-Verträge**: Wenn Kotlin und TS dieselbe Funktion implementieren, gehören die
  Erwartungswerte in *eine* geteilte Datei, nicht als Literale in zwei Test-Dateien.
- **Jackson 3**: Dieses Projekt nutzt `tools.jackson.*` (Jackson 3), nicht `com.fasterxml.jackson`.
  Mapper sind unveränderlich — `jacksonObjectMapper()` +
  `writerWithDefaultPrettyPrinter()` statt `.enable(SerializationFeature…)`.
