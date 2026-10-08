# Schlüssel vor dem Fake-Login — Zugang zu beta

**Status:** beschlossenes Design (2026-09-11).

**Baut auf:** dem Test-Login-Muster aus
[security-and-auth.md](../../../.claude/guidelines/security-and-auth.md) — dem seeded Picker
unter `/login/github`, der auf `production` gar nicht existiert.
**Steht neben:** [game-content.md](../../../.claude/guidelines/game-content.md) — dort wird der
Inhalt vor dem Repository geschützt, hier vor der Umgebung, in der er läuft.

**Berührt:** `iam/internal/devauth` (zwei bestehende Endpunkte, eine neue Route, eine neue
Komponente), `deploy/compose.yaml`, `deploy/.env.staging.example`, `deploy/README.md`.
**Kein Frontend, keine Migration, kein Schema.**

## Zweck

Staging hält absichtlich die echten Datensätze — nur so prüft man ein Spiel unter den Bedingungen,
unter denen es gespielt wird. Damit ist beta aber genau das, was das Repository nie sein darf: ein
öffentlich erreichbarer Ort, an dem die Lösung jeder Runde liegt. Wer die URL kennt, spielt jedes
Spiel vorab durch, und die Überraschung, für die das Ganze gebaut wird, ist weg.

Der Fake-Login ist auf beta die **einzige** Tür: eine eigene GitHub-OAuth-App gibt es dort nicht,
das committete Client-Secret ist ein Platzhalter, der Callback zeigt auf die Prod-Origin. Also
bekommt diese eine Tür ein Schloss.

Die Anforderungen, gegen die dieses Design gemessen wird:

1. **Lokal ohne Tippen** — `localhost` startet sofort, ohne Schlüssel. Dort gibt es ohne age-Key
   keinen echten Datensatz und keinen fremden Besucher.
2. **beta nur mit Schlüssel** — und ohne Schlüssel kein Weg an der Tür vorbei.
3. **Einmal pro Browser-Profil** — nicht pro Anmeldung, nicht pro Test-Benutzer, nicht pro Tag.
4. **Kein Frontend-Anteil** — die SPA ist in jeder Umgebung dasselbe Bundle und kann sich nicht
   selbst sperren; der Server entscheidet.
5. **Prod bleibt unberührt** — dort existiert weder Picker noch Schloss.
6. **Kein neuer Schlüsselkanal** — die Entwickler sollen nichts installieren, registrieren oder
   verwalten müssen.

## Zuschnitt: das Schloss sitzt an der Tür, nicht im Raum

Die naheliegende Alternative wäre ein Gate vor der ganzen API: jeder `/api`-Aufruf ohne
Freischaltung antwortet gesperrt. Das ist mehr Maschine für dasselbe Ergebnis — ein neuer
Statuscode, den `apiFetch` behandeln muss, eine Locked-Route in der SPA, ein Zustand, den jeder
Guard kennen muss. Und es schützt nichts zusätzlich, solange der Fake-Login die einzige Art ist,
auf beta eine Sitzung zu bekommen.

Daraus folgen zwei Dinge, die dieses Design bewusst in Kauf nimmt:

- **Laufende Sitzungen bleiben gültig.** Das Schloss prüft beim Betreten, nicht beim Verweilen.
  Wer schon angemeldet ist, bleibt es bis zum Ablauf seiner Sitzung, auch wenn der Schlüssel
  danach gewechselt wird.
- **`/oauth2/authorization/github` bleibt offen.** Heute ist der Weg auf staging tot (siehe oben).
  Legt jemand später eine staging-eigene OAuth-App an, entsteht damit ein zweiter Eingang am
  Schloss vorbei — dann muss dieses Design nachziehen. Das gehört als Warnung in
  `security-and-auth.md`, nicht als Vorratscode hierher.

## Die Türen

`DevLoginController` hat heute zwei Einstiege, und **beide** brauchen das Gate:

```
GET  /login/github        -> Picker (die Liste der Test-Benutzer)
POST /login/github/as     -> meldet als einer von ihnen an
```

Nur den Picker zu schützen wäre wirkungslos: `TestUserSeeder` ist committet, die Seed-Logins
stehen im öffentlichen Repository. Ein ungeschützter POST *ist* der Picker, nur ohne Oberfläche.
Abgewiesen wird er mit einem Redirect auf `/login/github` — also auf das Schlüsselloch, nicht in
eine Sackgasse; wer dort ohne Freischaltung landet, hat den Weg zurück vor Augen.

Dazu kommt eine dritte Route:

```
POST /login/github/unlock -> prüft den Schlüssel, setzt das Cookie, zurück auf /login/github
```

Sie liegt unter `/login/**` und ist damit bereits `permitAll`; das CSRF-Token reist als
Hidden-Field mit, genau wie beim Picker-POST. Der optionale `redirect`-Parameter des Pickers wird
durchgereicht, damit die Freischaltung kein Ziel verliert.

**Das ist die Stelle, an der dieses Design kaputtgehen wird:** eine vierte Route unter
`/login/github/…`, bei der jemand den Gate-Aufruf vergisst. Bei zwei Türen in einer Klasse ist
das tragbar; ein Filter wäre die Alternative, aber er müsste HTML rendern, und Rendering im Filter
ist ein schlechterer Tausch.

## Die Komponente

```kotlin
FakeSignInGate.isOpen(request): Boolean   // Schlüssel leer ODER Cookie passt
FakeSignInGate.unlock(response)           // Cookie setzen
```

`isOpen` vergleicht den Cookie-Wert mit dem SHA-256-Hex des konfigurierten Schlüssels; ist dieser
leer, ist die Tür offen und das Cookie wird gar nicht erst gelesen.

`@Profile("!production")` und `@ConditionalOnProperty("app.test-auth.enabled")` wie alles in
`devauth` — das Zwei-Gate-Muster. Ist der Fake-Login abgeschaltet, existiert auch sein Schloss
nicht, weil es dann nichts zu verschließen gibt. `app.test-auth.enabled=false` auf staging bleibt
damit das härtere Schloss: keine verschlossene Tür, sondern keine Tür.

## Das Cookie

| | |
|---|---|
| Name | `countdown_fake_sign_in` |
| Wert | SHA-256-Hex des Schlüssels |
| `Path` | `/login` |
| `Max-Age` | ein Jahr |
| `HttpOnly` | ja |
| `SameSite` | `Lax` |
| `Secure` | wenn `request.isSecure` |

**Warum der Hash und nicht der Schlüssel:** `HttpOnly` hält JavaScript ab, aber nicht den Blick.
Das Cookie-Panel der DevTools zeigt Werte im Klartext, und an einem Entwicklungsrechner stehen die
DevTools offen und Screenshots wandern weiter. Der Hash kostet drei Zeilen und nimmt dem Cookie
die Eigenschaft, den eintippbaren Schlüssel zu verraten. Gegen ein **gestohlenes** Cookie hilft er
nicht — das öffnet die Tür so oder so; er schützt den Schlüssel, nicht die Tür.

**Warum `Path=/login`:** geprüft wird er nirgends sonst, also soll er auch nirgends sonst mitreisen.

**Warum er den Logout überlebt:** Anforderung 3. Er steht nicht in Spring Securitys
`deleteCookies`, und `invalidateHttpSession` betrifft die Sitzung, nicht ihn. Einmal freigeschaltet
heißt: beliebig oft zwischen Test-Benutzern wechseln, ohne erneut zu tippen. Ein zweites
Browser-Profil oder ein Inkognito-Fenster ist ein eigener Cookie-Jar und damit eine eigene
Freischaltung — unvermeidbar und der Grund, warum lokal gar kein Schloss hängt (Anforderung 1).

Verglichen wird mit `MessageDigest.isEqual`.

## Konfiguration

| Datei | `app.test-auth.key` | Wirkung |
|---|---|---|
| `application.yaml` (lokal) | `${FAKE_SIGN_IN_KEY:}` → leer | kein Schloss, Picker wie heute |
| `application-staging.yaml` | `${FAKE_SIGN_IN_KEY}` | Schloss |
| `application-production.yaml` | — | Picker existiert nicht |
| `src/test/resources/application.yaml` | ungesetzt | bestehende Tests laufen unverändert |

Der Schlüssel liegt unter `app.test-auth`, weil `enabled` dort liegt und beide dasselbe Werkzeug
betreffen. Die Umgebungsvariable heißt bewusst anders als der Property-Pfad — überall sonst im
Projekt spiegeln sie sich. Der Name `FAKE_SIGN_IN_KEY` ist der, unter dem dieses Ding im Gespräch
läuft; den ganzen `test-auth`-Block umzubenennen wäre vier YAMLs, drei Annotationen und ein
Guideline-Absatz für null Funktion.

### Fail-fast beim Start, nicht an der Tür

Ist das Profil `staging` aktiv und der Schlüssel leer, **startet die Anwendung nicht**.

Das ist der wichtigste Teil dieses Abschnitts: Compose reicht eine fehlende Variable als *leeren
String* durch, nicht als Fehler. Ohne diesen Check würde ein vergessener Eintrag in `.env.staging`
beta stillschweigend aufsperren — und zwar in einem Zustand, der von außen gesund aussieht. Es ist
dieselbe Überlegung, aus der `GuessHueDatasetConfiguration` den Start verweigert, wenn unter einem
ausgerollten Profil das Beispiel-Datenset geladen wurde, und es benutzt dieselbe Form: eine Menge
ausgerollter Profile, verglichen mit `environment.activeProfiles`. Die Konstante wird in `iam`
neu angelegt, nicht aus `guesshue` importiert — Modulgrenze.

## Der gesperrte Bildschirm

`GET /login/github` rendert ohne Freischaltung „Gesperrt“ mit einem Feld für den Schlüssel. Die
Seite enthält **keine Seed-Logins** — eine gesperrte Tür, die die Namen dahinter aufzählt, zeigt,
wen es zu holen gäbe. Ein falscher Schlüssel führt auf dieselbe Seite mit einem Hinweis, ohne
Cookie und ohne Wink, wie der richtige aussieht.

Picker und gesperrter Bildschirm teilen sich das CSS, das heute als String im Picker klebt. Es
wird in eine private `page(title, body)`-Funktion gezogen — zwei Kopien desselben Stylesheets
driften, und beide Seiten sind serverseitig gerendert und brauchen deshalb beide das
`<meta name="viewport">`, das der Picker schon trägt. Das ist die einzige Änderung an bestehendem
Code.

## Tests

MockMvc-Kotlin-DSL + kotest, Schlüssel je Fall per `@TestPropertySource`:

- leerer Schlüssel → Picker (der lokale Normalfall; alle bestehenden `devauth`-Tests fallen
  hierunter und bleiben unverändert)
- Schlüssel gesetzt, kein Cookie → gesperrter Bildschirm, **und kein Seed-Login im Body**
- falscher Schlüssel → gesperrt, kein `Set-Cookie`
- richtiger Schlüssel → `Set-Cookie` mit den Attributen aus der Tabelle oben, Redirect
- `POST /login/github/as` ohne Cookie bei gesetztem Schlüssel → abgewiesen, keine Sitzung
- Profil `staging` + leerer Schlüssel → der Kontext startet nicht

Der vorhandene Test für `app.test-auth.enabled=false` bleibt, wie er ist.

## Deployment

`deploy/compose.yaml` reicht `FAKE_SIGN_IN_KEY=${FAKE_SIGN_IN_KEY:-}` an `core` durch — mit
Default, weil prod dieselbe Datei benutzt und dort niemand die Variable liest. Dazu der Eintrag in
`deploy/.env.staging.example` und in der Variablenliste von `deploy/README.md`.

`update.sh` bleibt unberührt. Damit fällt dieses Vorhaben **nicht** unter die Änderungen, die
Skript und Compose-Datei gemeinsam bewegen und deshalb erst über `main` auf staging testbar
wären.

**Reihenfolge auf dem Server:** erst `FAKE_SIGN_IN_KEY` von Hand in `.env.staging` eintragen, dann
deployen. `update.sh` schreibt eine bestehende `.env.<target>` nie aus dem Template fort, und der
Fail-fast oben hält den Start sonst an.

Der Wert selbst wird von Hand vergeben und außerhalb des Repositories weitergegeben. **sops bleibt,
was es ist:** ein Verteilweg für Inhalte, kein Ausweis. Die age-Schlüssel der Entwickler als
Authentifizierungsfaktor mitzubenutzen würde ihren Widerruf — der ohnehin schon ein Neuwürfeln der
Inhalte bedeutet — noch teurer machen, für nichts. Eine eigene `deploy/*.sops.yaml` für ein
Geheimnis aus einem Wort wäre der umgekehrte Fehler: sie kostete eine Änderung an `update.sh` und
damit genau die Deploy-Verhakung, die dieser Zuschnitt gerade vermeidet.

## Bewusst nicht gebaut

- **Kein Rate-Limit.** Die Konsequenz ist eine Anforderung an den Schlüssel, nicht an den Code:
  24+ Zeichen aus einem Passwortmanager, kein gemerktes Wort. Ein kurzer Schlüssel wäre hier
  tatsächlich zu erraten.
- **Kein Auswerfen bestehender Sitzungen.** Ein Schlüsselwechsel sperrt neue Browser aus, mehr
  nicht. Wer wirklich alle hinauswerfen will, leert die Sitzungstabelle — das ist ein `DELETE`,
  kein Feature.
- **Kein Schlüssel pro Person, keine Sperrliste.** Ein Wert für alle, Rotation durch Ändern des
  Werts. Das ist kein Banking, sondern ein Vorhang vor einem Rätselheft.
- **Keine Freischaltung lokal.** Anforderung 1. Dass der Pfad damit lokal nie von Hand läuft,
  gleichen die Tests aus.
