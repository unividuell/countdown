# Kurzer Einladungscode und eine Vorschau für geteilte Links

**Status:** beschlossenes Design (2026-09-13).

**Baut auf:** dem Einladungsweg in `community` (`MembershipService.generateInvite`,
`MemberController`, `webapp-vue/src/pages/join/[token].vue`), dem Rundenmotor in `countdown`
(`CountdownQuery.currentRound`) und dem Caddy-Router aus
[deployment-edge.md](../../../.claude/guidelines/deployment-edge.md).

**Berührt:** `core` (neues Modul `socialpreview`, je ein Eingriff in `community` und `iam`),
`webapp-vue` (die Join-Seite wird öffentlich) und `deploy/Caddyfile` (ein Handle-Block).
Keine Migration.

## Zweck

Zwei Beobachtungen am selben Link.

Erstens ist er ein Monster: `/join/NHsgFS5e3wlKFhSdSGSQ4U2aNjjBlECa5bhGsmIsic0`. 32 Zufallsbytes
sind für eine Einladung, die sieben Tage lebt und deren Annahme ein Spielleiter ohnehin bestätigen
muss, weit über der Notwendigkeit — und das ist das erste, was ein neues Mitglied von uns sieht.

Zweitens hat kein geteilter Link eine Vorschau. Wird `/c/huettehuette` oder eine Einladung in
WhatsApp verschickt, steht dort eine nackte URL. Interessant ist dabei nicht die App, sondern der
Mandant: der Community-Name und wie lange es noch dauert.

**Warum das nicht von selbst geht:** Im Vorgänger funktionierte `useSeoMeta`, weil Nuxt dort mit
`ssr: true` läuft — der Crawler bekam fertige Tags im HTML. Unsere `index.html` liefert
`<div id="app"></div>`, und **kein** Vorschau-Crawler führt JavaScript aus (WhatsApp, Signal,
Telegram, Slack, facebookexternalhit). Die Vorschau muss also serverseitig entstehen. Der `401`
samt Login-Redirect ist dabei irrelevant: Der Crawler liest den ersten HTML-Response und hört auf,
lange bevor ein Router-Guard liefe.

## Abgrenzung — was ausdrücklich nicht gebaut wird

- **Kein `og:image`, kein Bildrenderer.** WhatsApp zeigt ohne Bild eine kompakte Karte mit Titel
  und Text; der Name steht drin. Ein Bild lässt sich später ergänzen, ohne den Mechanismus zu
  ändern.
- **Keine Vorschau für andere Pfade** als `/`, `/c/*` und `/join/*`.
- **Kein verteiltes Rate-Limit.** Eine Instanz, In-Memory, kein Redis.
- **Keine Umbenennung von `inviteToken`.** Nutzersichtbar heißt es „Code", im Bestand (Spalte
  `invite_token`, `Community.inviteToken`, Routenparameter `token`) bleibt alles stehen: eine
  Umbenennung quer durch DB, Backend und Frontend wäre Kosmetik ohne Verhaltensänderung.
- **Kein SSR und keine zweite HTML-Quelle für Menschen.** Der Vorschau-Endpunkt liefert ein
  Dokument, das nie ein Mensch sieht.

## Der Code: 6 Zeichen Crockford Base32

`generateInvite` erzeugt statt 32 Zufallsbytes sechs Zeichen aus
`0123456789ABCDEFGHJKMNPQRSTVWXYZ` — Crockford Base32, also ohne `I`, `L`, `O`, `U`. Damit gibt es
kein `0`/`O`-Problem, der Code ist vorlesbar, und Groß-/Kleinschreibung ist egal.

`/join/A7K2MP` statt `/join/NHsgFS5e3wlKFhSdSGSQ4U2aNjjBlECa5bhGsmIsic0`.

**Warum 6 und nicht 4 oder 5.** Der Angriff ist nicht der erschlichene Beitritt — der bleibt
`PENDING` und braucht eine Bestätigung — sondern das Abgrasen gültiger Codes, das über die
öffentliche Einladungsseite Community-Namen preisgibt. Bei 5 Zeichen (33,5 Mio) hängt die
Sicherheit vollständig an der Bremse: ein verteilter Angreifer mit 1000 IPs und je 10 Versuchen pro
Minute durchsucht den Raum in Tagen. Bei 6 Zeichen sind es 1,07 Mrd und dieselbe Rechnung ergibt
Jahre. Optisch kostet das sechste Zeichen nichts.

Zwei Ergänzungen an der Erzeugung: Die Spalte ist `UNIQUE`, also wird bei Kollision neu gewürfelt
(gespeichert wird großgeschrieben). Und der Lookup normalisiert die Eingabe vor dem Vergleich —
Großschreibung plus Crockfords Lesekorrekturen `I`/`L` → `1` und `O` → `0` — damit ein abgetippter
Code trifft. Bestehende lange Tokens laufen unverändert bis zu ihrem Ablauf weiter; es gibt nichts
zu migrieren.

## Die Einladungsseite wird öffentlich

Heute läuft `/join/<code>` in den Guard, und das erste, was ein Eingeladener sieht, ist ein
kontextloser GitHub-Login. Die Route bekommt `meta.public = true` und lädt über
`GET /api/communities/join/{code}` (neu, `permitAll`, liefert nur `{ name }`) den Namen. Die Seite
zeigt „Du bist zu ‚Hütte Hütte‘ eingeladen“ und einen Beitreten-Knopf; **der** löst den Login aus.

Alles Weitere bleibt: `stashPostLoginRedirect` bringt den Nutzer nach dem OAuth-Rundlauf auf die
Seite zurück, und der Beitritt selbst ist weiterhin `POST /api/communities/join/{code}` hinter
Auth. Ungültiger oder abgelaufener Code zeigt weiter die bestehenden Meldungen (404 → ungültig,
410 → abgelaufen).

## Die Vorschau: ein Abzweig am Edge

```
                       ┌─ UA-Regex trifft UND Pfad /, /c/* oder /join/* ─┐
                       │                                                 │
   Messenger ─────────►│  countdown-web (Caddy)                          │
                       │   ├─ @backend  /api/* /oauth2/* …  → core       │
   Browser   ─────────►│   ├─ @preview  rewrite → /api/preview{path}     │
                       │   │                                → core       │
                       │   ├─ /assets/* → file_server (immutable)        │
                       │   └─ catch-all → index.html (SPA, no-cache)     │
                       └─────────────────────────────────────────────────┘
```

Nur Anfragen, die **beide** Bedingungen erfüllen, gehen den neuen Weg; jeder Browser läuft exakt
wie bisher in die SPA. Das ist der Grund für diese Aufteilung und nicht für die Alternative, den
Pfad immer über `core` zu servieren: Fällt `core` aus, lädt die App weiter, und die
Auslieferungskette der SPA wird überhaupt nicht angefasst. Die bekannte Schwäche ist die
UA-Liste — veraltet sie, bekommt ein unbekannter Messenger eben keine Vorschau, und die App bleibt
heil.

Der Block steht als eigenes `handle` zwischen `@backend` und `/assets/*`; die Reihenfolge wird mit
`caddy adapt` geprüft (siehe [deployment-edge.md](../../../.claude/guidelines/deployment-edge.md),
„zwei sich ausschließende handle-Blöcke").

Im Backend ist `/api/preview/**` ein neues Modulith-Modul `socialpreview`, `permitAll`. Es ist die
einzige Stelle, die SPA-Pfade kennt und HTML ausliefert — das gehört weder zu `community` (kennt
keine Routen) noch zu `countdown`. Es hat keine Tabellen, also kein Schema und keine Migration, und
liest ausschließlich über `CommunityQuery.findBySlug` und `CountdownQuery.currentRound`. Der
Namens-Lookup der Join-Seite ist dagegen gewöhnliches JSON und bleibt im `MemberController`.

Die Wurzel landet dabei als `/api/preview/` im Backend, das Mapping muss den abschließenden
Schrägstrich also mit abdecken.

Geliefert wird ein vollständiges, winziges Dokument: `<html lang="de">` mit `<title>`,
`og:title`, `og:description`, `og:url`, `og:type`, `og:locale` und `twitter:card`, sonst nichts.
`og:url` trägt die angefragte URL — außer im generischen Fall unten, wo es die Wurzel ist, damit
die Antwort dort wirklich in jedem Byte gleich ist.

## Was die Vorschau sagt

| Fall | Titel | Beschreibung |
|---|---|---|
| `/c/<slug>`, Termin in der Zukunft | `Hütte Hütte` | `T-58: Spiel mit!` |
| `/c/<slug>`, kein Termin oder bereits gestartet | `Hütte Hütte` | `Spiel mit!` |
| `/join/<code>`, gültig | `Hütte Hütte` | `Du bist eingeladen — T-58: Spiel mit!` |
| `/`, und jeder nicht auflösbare Fall (siehe unten) | `Countdown` | `Spiel jeden Tag ein Mini-Game - gemeinsam auf euer Event hinfiebern` |

Die Regel greift für `/c/<slug>` **und alles darunter** (`/c/x/members`, `/c/x/requests` …) — eine
Regel statt einer Pfadliste, damit auch ein tiefer geteilter Link eine Vorschau hat. `/` matcht
dagegen **exakt** die Wurzel, sonst zöge der Block die ganze App an sich.

Die Wurzel hat keinen Mandanten, also spricht sie von der App selbst — wozu es sie gibt, nicht was
sie technisch ist. Denselben Text bekommt jeder nicht auflösbare Fall: unbekannter Slug,
unbekannter und abgelaufener Code. Dass die Antwort dort **identisch** zur Startseite ist, ist der
Punkt — so ist strukturell unmöglich, aus der Vorschau abzulesen, ob es eine Community oder eine
Einladung überhaupt gibt.

Das Rundenlabel kommt unverändert aus `Round.label`, also mit ASCII-Bindestrich wie in der App
(`T-58`), nicht mit dem Gedankenstrich des Vorgängers. Vorschau und App sollen dasselbe schreiben.

**Eine Ehrlichkeit zur Zahl:** WhatsApp und Facebook halten Vorschauen über Tage bis Wochen. Ein
vor drei Wochen erstmals geteilter Link kann beim nächsten Teilen noch die alte Rundenzahl zeigen.
Ein `Cache-Control: public, max-age=600` auf der Antwort mildert das, garantieren lässt es sich
nicht: die Zahl ist eine Momentaufnahme, kein Ticker.

## Die Bremse

Beide neuen offenen Endpunkte — `/api/preview/**` und `GET /api/communities/join/{code}` — bekommen
ein In-Memory-Rate-Limit pro Client-IP (20 Anfragen pro Minute, darüber `429`). Der Filter ist ein
`OncePerRequestFilter` im `iam`-Modul, wo die Security-Kette ohnehin konfiguriert wird.

**Die Client-IP darf nicht naiv aus `X-Forwarded-For` kommen.** Caddy *hängt* an diesen Header an,
statt ihn zu ersetzen: Sendet ein Client `X-Forwarded-For: 1.2.3.4`, steht seine echte Adresse erst
an zweiter Stelle — und Springs `ForwardedHeaderFilter` (`forward-headers-strategy: framework`,
gesetzt in staging und production) nimmt die **erste**. Ein Angreifer könnte die Bremse also mit
einem selbstgesetzten Header pro Anfrage zurücksetzen. Deshalb setzt `countdown-web` für die beiden
Blöcke `header_up X-Client-IP {client_ip}` — Caddy berechnet diesen Wert selbst unter
Berücksichtigung von `trusted_proxies`, und `header_up` überschreibt einen mitgeschickten Wert. Der
Filter liest diesen Header und fällt nur ohne ihn auf `remoteAddr` zurück (lokale Entwicklung).

Die beiden offenen Endpunkte sind dabei bewusst **nicht** gleich verschwiegen. Der
Vorschau-Endpunkt antwortet auf einen unbekannten Slug oder Code byte-gleich wie auf die
Startseite. Der Namens-Lookup muss dagegen unterscheiden — die Einladungsseite sagt dem Empfänger,
ob sein Link ungültig (`404`) oder abgelaufen (`410`) ist — und gibt bei einem Treffer den Namen
preis. Genau dieser Endpunkt ist der Grund für sechs Zeichen und die Bremse: die beiden sind seine
Sicherheit, nicht Beiwerk.

## Nachweis

- **MockMvc (`socialpreview`):** bekannter Slug → `og:title` trägt den Namen, Beschreibung trägt
  `T-58`; kein Termin und bereits gestartet → ohne Rundenteil; `/`, unbekannter Slug, unbekannter
  und abgelaufener Code → alle vier byte-gleich die generische Antwort.
- **Payload-Hygiene** (wie im Game-Lab): die Antwort enthält Name und Rundenlabel — und
  nachweislich kein Token, keine Mitglieder, keine Spielinhalte.
- **`community`:** Codes sind sechs Zeichen aus dem Crockford-Alphabet; ein kleingeschriebener und
  ein mit `O`/`I` vertippter Code trifft dieselbe Einladung; `GET /api/communities/join/{code}`
  liefert ohne Auth nur den Namen und `404`/`410` wie der POST.
- **`iam`:** über dem Limit `429`, darunter durchgelassen; ein selbstgesetzter
  `X-Forwarded-For` ändert den Zähler nicht.
- **`ModularityTests`:** `socialpreview` hängt nur an den beiden Query-Schnittstellen.
- **Caddy:** `caddy adapt` für die Routenreihenfolge, plus `curl -A "WhatsApp/2.0"` gegen den
  lokalen Stack als Gegenprobe zu einem Browser-`curl` — derselbe Pfad, zwei verschiedene
  Antworten.
- **Vitest:** die öffentliche Join-Seite zeigt den Namen, der Knopf führt in den Login, ungültiger
  Code zeigt die bestehende Meldung.
