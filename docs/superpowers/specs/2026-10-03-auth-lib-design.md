# Auth-Lib — ein Login-Setup für alle Spring-Boot-Apps

**Status:** beschlossenes Design (2026-10-03).

**Baut auf:** dem heutigen `iam`-Setup aus
[security-and-auth.md](../../../.claude/guidelines/security-and-auth.md) — GitHub-OAuth, SPA-Vertrag,
Test-Login-Picker — und dem Schloss aus dem
[Gate-Design](2026-09-11-fake-sign-in-gate-design.md).

**Berührt:** ein neues Repo `unividuell/auth-spring-boot-starter`; in countdown `iam` (Security,
Provisioning, `devauth/` entfällt), die Migrationen `iam/V3` und `__root/V2`, `webapp-vue`
(Login-Link), `deploy/` (Umgebungsvariablen), die GitHub-Client-Registrierung und die Guidelines.

## Zweck

Die nächsten Spring-Boot-Apps brauchen denselben Login wie countdown: echte Provider in Prod,
Test-User hinter einem Schloss auf staging, Test-User ohne jede Konfiguration auf localhost.
countdown hat das gebaut; jede neue App würde es nachbauen. Die Lib macht daraus eine Abhängigkeit.

Die Anforderungen, gegen die dieses Design gemessen wird:

1. **Prod** — echter Login über Provider; zuerst GitHub, später Twitch, Discord und weitere.
2. **staging** — Test-User, nur mit Schlüssel.
3. **localhost** — Test-User ohne OAuth-Konfiguration.
4. **„Spieler wechseln“ bleibt** — der Picker mit Rücksprung auf die Seite, von der man kam.
5. **Rollen gehören der App** — die Lib kennt keinen Rollennamen.
6. **Keine Datenbank in der Lib.**
7. **Einbinden ohne Hürde** — kein Token, keine Registry-Konfiguration in der App.

## Verworfen

- **Zentraler IdP** (eigener Spring Authorization Server, Dex, Keycloak). Jede App bräuchte trotzdem
  `oauth2Login`, den SPA-Vertrag und ihr eigenes Provisioning — genau den Teil, den die Lib abdeckt.
  Der IdP käme obendrauf: ein weiterer Dienst, ein Single Point of Failure für alle Logins, und
  localhost bräuchte ihn auch (Cookies sind nicht nach Port getrennt: IdP und App auf `localhost`
  überschreiben sich das Session-Cookie). SSO brächte er kaum — wer bei GitHub angemeldet ist und
  die App autorisiert hat, wird ohne Interaktion durchgereicht. Nachrüstbar: in der App ändern sich
  dann nur Provider-Konfiguration und Claim-Mapping.
- **Forward-Auth am Edge** (oauth2-proxy, die App vertraut einem Header). Jeder Container im
  `edge`-Netz könnte den Header setzen; CSRF und Logout blieben trotzdem in der App; der Edge ist
  geteilte Infrastruktur.
- **Ein OAuth-Client pro App.** Löst sich ohne IdP: Eine GitHub App (nicht OAuth App) erlaubt bis zu
  zehn Callback-URLs. Ergebnis: ein Client pro *Provider* für alle Apps.

## Entscheidungen

1. **Lib, kein IdP.**
2. **Konten werden nicht verknüpft.** Jedes `(provider, subject)` ist ein eigenes Konto. Automatisches
   Verknüpfen über die E-Mail ist ausgeschlossen: Provider prüfen E-Mails unterschiedlich, GitHubs
   `/user`-E-Mail ist die öffentliche Profiladresse ohne Verifiziert-Flag — Kontoübernahme.
   Explizites Verknüpfen („Discord verbinden“) ist nachrüstbar.
3. **Die Konto-Tabelle gehört der App.** Die Lib ruft einen Hook. Eine Tabelle in der Lib bräuchte
   einen eigenen Flyway-Lauf (Modulith scannt nur `db/migration/<modul>` der App-Module), müsste ihre
   Reihenfolge vor App-Migrationen mit FKs selbst sichern und würde jede App an Postgres und Flyway
   binden.
4. **Erster Wurf: Lib plus Umstellung von countdown, Provider `github` und `test`.** Die Lib ist auf
   mehrere Provider zugeschnitten; Twitch und Discord kommen, wenn eine App sie braucht. countdown
   ist die einzige App mit echten Usern und Tests — dort beweist sich die Lib, bevor eine neue App
   auf sie baut.
5. **Name `auth`.** Die Lib deckt Authentication und grobe Authorization ab, dazu den SPA-Vertrag
   (CSRF); ein späterer Passwort-Login fände Platz. Spring selbst nennt den Mechanismus „OAuth 2.0
   Login“ (`oauth2Login`); „social login“ nur umgangssprachlich.

## Artefakt und Verteilung

| | |
|---|---|
| Repo | `github.com/unividuell/auth-spring-boot-starter`, öffentlich |
| Koordinaten | `org.unividuell:auth-spring-boot-starter` — `spring-boot-starter-*` ist für Springs eigene Starter reserviert |
| Package | `org.unividuell.auth` |
| Aufbau | ein Maven-Modul, Auto-Konfiguration und Starter in einem |
| Stack | Kotlin 2.4, Bytecode Java 25 |
| Abhängigkeiten | `spring-boot-starter-security`, `-oauth2-client`, `-webmvc`, kotlin-logging; Versionen aus dem Boot-BOM, die einbindende App gewinnt |
| Release | Maven Central über das Central Portal; Namespace `org.unividuell` per DNS-TXT bestätigt; GitHub-Actions-Workflow auf Tag `v*` mit GPG-Signatur, Sources- und Javadoc-Jar; SemVer, `0.x` während countdown umzieht |
| Lokal | `0.1.0-SNAPSHOT` per `./mvnw install` in `~/.m2`. Ein countdown-PR, der die Lib braucht, merged erst nach dem Release — sonst löst die CI die Version nicht auf. |

GitHub Packages scheidet aus: Es verlangt auch für öffentliche Maven-Pakete einen Token, auf jedem
Rechner und in jeder CI. JitPack scheidet aus: Jeder Build jeder App hinge an einem fremden
Build-Dienst.

## Schnittstelle Lib ↔ App

```
 App                                    Lib (org.unividuell.auth)
 ───                                    ─────────────────────────
 AccountProvisioner  ◄── provision() ── GitHub-Login (OAuth2UserService)
   → UUID                               Test-Login  (Picker)
                                                │
                                                ▼
 @AuthenticationPrincipal me ◄───────── AuthPrincipal (Session)

 SecurityFilterChain ◄──── zuerst angewandt ── Customizer-Bean (SPA-Vertrag, Logins)
   (eigene Regeln + anyRequest)
```

### Was die App liefert — genau eine Bean

```kotlin
data class ExternalIdentity(
    val provider: String,   // "github", "test"
    val subject: String,    // stable provider id, always a String
    val login: String,
    val name: String?,
    val email: String?,
)

fun interface AccountProvisioner {
    fun provision(identity: ExternalIdentity, roles: Set<String>): UUID
}
```

Fehlt die Bean, bricht der Start ab. Beide Türen — echter Provider und Test-Login — enden in diesem
Aufruf. Der Test-Login ist damit per Konstruktion so gut wie ein echter; heute hält das nur ein
Kommentar im Seeder zusammen („Mirrors `UserProvisioningService.sync`“).

`subject` ist immer ein String: Discord-IDs sind 64-Bit-Snowflakes und als JSON-Zahl jenseits von 2⁵³
verloren ([cross-runtime-parity.md](../../../.claude/guidelines/cross-runtime-parity.md)); GitHubs
numerische `id` wird zum String.

### Was die App bekommt

```kotlin
class AuthPrincipal(
    val id: UUID,           // what AccountProvisioner returned
    val provider: String,
    val login: String,
    val roles: Set<String>, // "SUPER_ADMIN", …
) : OAuth2User, Serializable
```

- `getName()` ist `id`; Authorities sind `ROLE_USER` plus `ROLE_<rolle>` je Rolle.
- `Serializable` mit `serialVersionUID = 1`, **nichts weiter darin.** Der Principal liegt
  JDK-serialisiert in der Session-Tabelle; ändert ein Lib-Update die Klasse inkompatibel, bricht jede
  bestehende Session. App-spezifisches liest die App live aus ihrer Zeile.
- Das Feld heißt `id`, damit `me.id` in bestehendem Code unverändert bleibt.

### Rollen

```yaml
unividuell:
  auth:
    roles:
      super-admin: ${SUPER_ADMINS:}        # → ROLE_SUPER_ADMIN
      technical-user: github:some-bot      # → ROLE_TECHNICAL_USER (other app)
```

- Eine Liste `provider:login` pro Rolle; Groß-/Kleinschreibung des Logins egal. Der Schlüssel in
  kebab-case ergibt den Rollennamen (`super-admin` → `SUPER_ADMIN`).
- Ein Eintrag ohne `provider:`-Präfix lässt den Start abbrechen.
- Die Lib wertet die Listen bei jedem Login aus, auch für Test-User (`test:prof`), und reicht das
  Ergebnis an `provision()` weiter — die App darf es speichern.
- `RoleAllowlist.members(role)` gibt die konfigurierten Listen lesbar heraus — für Übersichten wie
  countdowns Super-Admin-Roster, die Liste *und* gespeichertes Flag zeigen.

**Regel: Nur Rollen aus der Konfiguration gehören in den Principal.** Der Principal ist eine
Momentaufnahme vom Login. Eine Konfigurationsliste wird bei jedem Login neu ausgewertet — die
Momentaufnahme veraltet höchstens bis zum nächsten Login, wie heute beim Super-Admin. Zur Laufzeit in
der DB vergebene Rechte würden darin unbemerkt veralten; sie bleiben in der App und werden live aus
der Zeile gelesen.

### Security-Setup

Spring Security 7 wendet `Customizer<HttpSecurity>`-Beans an, **bevor** die App ihre
`SecurityFilterChain` baut („Modular HttpSecurity Configuration“). Die Lib liefert darüber:

- `oauth2Login` mit dem eigenen UserService und `loginPage = "/login"` — sonst gehört `/login` zwei
  Besitzern, der Lib und Springs generierter Login-Seite;
- 401 statt Redirect (`HttpStatusEntryPoint`), `NullRequestCache`;
- CSRF über `CookieCsrfTokenRepository.withHttpOnlyFalse()` + `CsrfTokenRequestAttributeHandler`,
  dazu der `CsrfCookieFilter`;
- `POST /logout` → 204;
- `permitAll` für `/oauth2/**` und `/login/**`.

Die App schreibt nur ihre eigenen Regeln und `anyRequest`. Definiert sie keine Chain, greift ein
Standard der Lib: `anyRequest authenticated`.

### Konfiguration

```yaml
unividuell:
  auth:
    roles: …                 # see above
    test-login:
      enabled: true          # additionally @Profile("!production")
      key: ""                # empty = no lock
      users: …               # optional; default: the twelve Futurama characters
```

## Abläufe je Umgebung

| | localhost | staging | prod |
|---|---|---|---|
| Profil | keins | `staging` | `production` |
| `GET /login` | Picker, ohne Schloss | Schloss, dann Picker | Weiterleitung zu `/oauth2/authorization/github` |
| OAuth-Client | keiner nötig | keiner | Pflicht |
| Test-Login | aktiv | aktiv, Schlüssel Pflicht | Beans existieren nicht (404) |

**Kein Client, kein OAuth-Login.** `oauth2Login` startet nicht ohne `ClientRegistrationRepository` —
deshalb steht in countdown heute ein Platzhalter-Client in `application.yaml`. Die Lib richtet
`oauth2Login` nur ein, wenn mindestens ein Client konfiguriert ist. Damit startet eine neue App auf
localhost ohne jede OAuth-Zeile, und auf staging *existiert* `/oauth2/authorization/github` nicht
mehr, statt wie heute nur wirkungslos zu sein — die zweite Tür am Schloss vorbei gibt es nicht.

**Endpunkte der Lib:**

| | |
|---|---|
| `GET /login[?redirect=…]` | Test-Login aktiv: Picker (bzw. Schloss). Sonst: Weiterleitung zum Provider. Genau ein Controller besitzt die Route. |
| `GET /login?error` | kleine Fehlerseite im Stil des Pickers mit „Erneut versuchen“ — **leitet nie weiter** |
| `POST /login/test/as` | meldet einen Test-User an, springt zu `redirect` zurück |
| `POST /login/test/unlock` | prüft den Schlüssel, setzt das Cookie, zurück zum Picker samt `redirect` |
| `/oauth2/authorization/{id}`, `/login/oauth2/code/{id}` | Spring, nur wenn ein Client konfiguriert ist |
| `POST /logout` | 204 |

**Warum `/login?error` nie weiterleitet:** Spring leitet einen fehlgeschlagenen OAuth-Login auf
`<loginPage>?error`. Leitete `/login` in Prod dort direkt zum Provider, entstünde bei ungültigen
Claims eine Endlosschleife.

**Fail-fast beim Start:**

- unter `production` kein Client konfiguriert — es gäbe keinen Weg hinein;
- Test-Login aktiv, Schlüssel leer und **irgendein** Profil aktiv. Heute bricht nur `staging` ab;
  startet eine neue App in Prod versehentlich ohne Profil, stünde der Test-Login offen. Leerer
  Schlüssel ist nur ohne Profil erlaubt — also localhost.
- ein Rolleneintrag ohne `provider:`-Präfix.

Die Profilnamen `production` und `staging` setzt die Lib voraus, wie
[deployment.md](../../../.claude/guidelines/deployment.md) sie festlegt.

**Fehler im Hook:** Wirft `AccountProvisioner`, behandelt die Lib das als fehlgeschlagenen Login —
dieselbe Fehlerseite, ein Log-Eintrag ohne Token und ohne Claims.

**Test-User:** `provider = "test"`, `subject = login`. Die Standardliste übernimmt countdowns zwölf
Futurama-Figuren **in heutiger Schreibweise** (`Fry`, `leela`, `Bender`, …) samt Emoji. Angelegt wird
beim Klick über denselben `AccountProvisioner`; der Picker liest seine Liste aus der Konfiguration,
nicht aus der DB. `TestUserSeeder` entfällt, und mit ihm die negativen `github_id`s.

**Schloss:** `FakeSignInGate` zieht unverändert um — Cookie mit dem SHA-256 des Schlüssels,
`Path=/login`, `HttpOnly`, `SameSite=Lax`, `Secure` aus dem Request, ein Jahr. Der Cookie-Name
gehört jetzt der Lib.

**„Spieler wechseln“:** `redirect` läuft durch Picker, Schloss und `as`; `safeRedirect` (nur
Same-Site-Pfade; `//`, `/\`, Tab, CR, LF abgewiesen) ist Teil der Lib.

**Sessions:** Wo sie liegen, entscheidet die App (countdown: Spring Session JDBC).

## Später: weitere Provider

Nicht Teil des ersten Wurfs, aber der Zuschnitt muss sie tragen:

- GitHub und Discord sprechen reines OAuth2, Twitch OIDC. Die Lib hängt sich in `userService`
  **und** `oidcUserService` und bildet pro Provider auf `ExternalIdentity` ab.
- `CommonOAuth2Provider` kennt nur GitHub, Google, Facebook, Okta. Für weitere liefert die Lib
  Endpunkte und Mapping; die App konfiguriert nur Client-ID und Secret.
- Bekannte Macke: Twitch liefert `scope` in der Token-Antwort als JSON-Array statt String. Ob Spring 7
  daran scheitert, ist ungeprüft.
- Mit dem zweiten Provider kommt eine Auswahlseite unter `GET /login`.
- Zu prüfen, wenn es so weit ist: ob Discord- und Twitch-Apps mehrere Redirect-URLs erlauben.

## Umstellung von countdown

**Entfällt** (zieht in die Lib): `CsrfCookieFilter`, `CountdownOAuth2User`,
`GitHubOAuth2UserService`, `SuperAdminProperties`, `devauth/` (Picker, Seeder, Schloss,
Weiterleitung). `SecurityConfig` behält nur countdowns Regeln: `/actuator/health`,
`/api/super-admin/**`, `GET /api/communities/join/*`, `GET /api/preview/**`, `anyRequest`.

**Wird umgebaut:**

- `UserProvisioningService` implementiert `AccountProvisioner` mit
  `INSERT … ON CONFLICT (provider, subject) DO UPDATE … RETURNING id`; das ersetzt das Abfangen der
  `DuplicateKeyException`. Vom Benutzer gepflegte Felder (`display_name`, `bg_color_hex`) bleiben
  unberührt.
- `UserController.me` lädt die Zeile per `id`.
- `SuperAdminRosterService` liest die Allowlist über `RoleAllowlist.members("SUPER_ADMIN")`.
- `typealias AuthenticatedUser = AuthPrincipal` im `iam`-Package, dazu die Erweiterung
  `val AuthPrincipal.isSuperAdmin get() = "SUPER_ADMIN" in roles`. Die zwölf Dateien, die
  `AuthenticatedUser` nutzen, ändern sich nur in Imports.

**Datenbank:**

```sql
-- iam/V3
ALTER TABLE iam.users ADD COLUMN provider TEXT, ADD COLUMN subject TEXT;
UPDATE iam.users SET provider = 'test',   subject = github_login    WHERE github_id < 0;
UPDATE iam.users SET provider = 'github', subject = github_id::text WHERE github_id > 0;
-- then: NOT NULL on both, UNIQUE (provider, subject), DROP COLUMN github_id

-- __root/V2
DELETE FROM spring_session;  -- old principals no longer deserialize
```

- `github_login` und `github_name` **behalten ihre Namen.** Umbenennen trifft 63 Testdateien,
  20 Frontend-Dateien und die API; falsch werden die Namen erst mit dem zweiten echten Provider.
  Dann wird umbenannt.
- Rund 60 Testdateien mit `User(githubId = …)` werden mechanisch auf `subject = "…"` umgestellt.

**Konfiguration und Umgebung:**

- `app.test-auth.*` → `unividuell.auth.test-login.*`; `FAKE_SIGN_IN_KEY` bleibt.
- `app.super-admin-github-logins` / `SUPER_ADMIN_GITHUB_LOGINS` → `unividuell.auth.roles.super-admin`
  / **`SUPER_ADMINS`**, Werte mit Präfix: `github:<login>` in Prod, `test:prof` u. a. auf staging.
  Betroffen: `application*.yaml` (auch `core/src/test/resources/application.yaml`),
  `deploy/compose.yaml`, `deploy/.env.*.example`, `deploy/README.md`, `core/README.md`,
  `.claude/launch.json`.
- Der GitHub-Client steht nur noch in `application-production.yaml`; der Platzhalter in
  `application.yaml` fällt weg. Lokal wird er nur für den echten Ablauf per Startargument gesetzt
  (`core/README.md`, „Real GitHub login“).

**GitHub App statt OAuth Apps — im selben Zug.** Die GitHub App ist der eine Client, den alle
künftigen Apps teilen; countdown ist ihr erster Nutzer.

| | |
|---|---|
| Besitzer | Organisation `unividuell` |
| Sichtbarkeit | **öffentlich** („Any account“). Eine private App dürfen nur Mitglieder der besitzenden Organisation autorisieren — niemand sonst könnte sich anmelden. „Öffentlich“ heißt nur, dass jeder sie autorisieren darf. |
| Callback-URLs | `https://countdown.unividuell.org/login/oauth2/code/github`, `http://localhost:5173/login/oauth2/code/github`, `http://localhost:8080/login/oauth2/code/github` — jede weitere Prod-App ergänzt ihre, bis zehn |
| Webhook | aus |
| Berechtigungen | keine. `/user` liefert die öffentliche Profil-E-Mail wie bisher. |

- Die localhost-Callbacks machen eine eigene Dev-App überflüssig; die README-Einschränkung „eine
  OAuth App erlaubt nur eine Callback-URL“ entfällt. Preis: Für den echten Ablauf auf localhost
  liegt das Prod-Secret auf dem Entwicklerrechner — nur im Shell-Export, nie im Repo.
- Ob Springs `CommonOAuth2Provider.GITHUB` mit einer GitHub App unverändert funktioniert (gleiche
  Endpunkte; der `scope`-Parameter wird ignoriert), klärt ein Probelauf **vor** der Lib: heutiges
  countdown, `app.test-auth.enabled=false`, Client-ID der GitHub App, echter Login über `:5173`.
- Jeder User stimmt einmal neu zu; das fällt mit dem erzwungenen Neu-Login zusammen.
- Nach erfolgreicher Umstellung werden die beiden OAuth Apps (Prod `Ov23lihx…`, Dev `Ov23liQz…`)
  gelöscht.

**Frontend:** `/login/github` → `/login` in sechs Dateien, darunter `LabControls.vue` („Spieler
wechseln“) und die zugehörigen Specs.

**Spürbar für Nutzer:** Jeder meldet sich einmal neu an (Sessions geleert). Tester auf staging geben
den Schlüssel einmal neu ein (Cookie-Name ändert sich).

**Auslieferung:**

1. Lib `0.1.0` auf Maven Central.
2. countdown-PR nach `develop`. **Vorher** `SUPER_ADMINS` in der staging-`.env` setzen.
3. Vor dem Release nach `main`: in Prod nachsehen, dass `iam.users` nur die eine echte Zeile enthält
   (keine weiteren User, keine negative `github_id`). **Vorher** in der Prod-`.env`
   `SUPER_ADMINS=github:<login>` und `GITHUB_CLIENT_SECRET` der GitHub App setzen.

Fehlt die Variable, ist niemand Super-Admin — fail-closed, aber lästig.

**Guidelines:** Lib-Wissen aus `security-and-auth.md` wandert ins README der Lib; in countdown
bleiben die eigenen Regeln und ein Verweis.

## Tests

**Lib** — JUnit 5, kotest, mockk, MockMvc-Kotlin-DSL; ohne Testcontainers, die Lib hat keine DB.

- Auto-Konfiguration per `ApplicationContextRunner`: Beans je Profil, Flag und Client; alle
  Fail-fast-Fälle.
- Abläufe per MockMvc in einer Test-App mit einem `AccountProvisioner` im Speicher: 401 auf die API,
  XSRF-Cookie schon bei GET, Logout ohne Token 403 und mit Token 204; Picker, Schloss, `as` samt
  `redirect`; `/login?error` leitet nie weiter; in Prod leitet `/login` zum Provider.
- `safeRedirect`: die bestehenden Fälle.
- GitHub-Mapping Attribute → `ExternalIdentity`, fehlende `id`/`login` lassen den Login scheitern —
  mit Werten, die kein Default erzeugen könnte.
- Serialisierung: ein serialisierter `AuthPrincipal` aus `0.1.0` liegt in den Test-Ressourcen; jede
  spätere Version muss ihn lesen.

Aus countdown ziehen mit und werden angepasst: `DevLoginControllerTest`, `DevLoginLockedTest`,
`FakeSignInGateTest`, `DevLoginProdAbsentTest`, `GitHubOAuth2UserServiceTest`,
`CountdownOAuth2UserTest`. `TestUserSeederTest` entfällt.

**countdown:**

- Provisioning gegen Testcontainers: anlegen, aktualisieren (Login, Name, E-Mail, Rollen),
  Benutzerfelder unberührt; zwei parallele `provision()` derselben Identität ergeben eine Zeile.
- Migration `iam/V3`: Flyway für `iam` bis V2, Zeilen mit positiver und negativer `github_id`
  einfügen, auf V3 migrieren, `provider`/`subject` prüfen.
- Ende-zu-Ende: Login als `test:prof` → `/api/me` meldet Super-Admin.
- Frontend-Specs prüfen `href="/login…"`, auch beim Spieler-Wechsel.

**Von Hand vor Prod:** localhost — Picker, Spieler wechseln im Lab, Logout, einmal mit
`test-login.enabled=false` der echte GitHub-Login über die GitHub App. staging nach dem Deploy —
Schloss, Picker, Super-Admin als `test:prof`. Prod vor dem Deploy — der Blick in `iam.users`; nach
dem Deploy — echter Login, Zustimmungsseite der GitHub App.

## Pläne

Zwei Implementierungspläne:

1. **Lib bis Release `0.1.0`** — Repo, Build, Code, Tests, Release-Workflow, README.
2. **Umstellung von countdown** — beginnt gegen den `SNAPSHOT`, merged nach dem Release.

Offen für Plan 1: ob das Javadoc-Jar per Dokka entsteht oder als leeres Platzhalter-Jar.
