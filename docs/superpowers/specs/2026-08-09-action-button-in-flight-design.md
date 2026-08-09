# ActionButton-In-flight-Zustände – Design

**Issue:** #30  
**Datum:** 2026-08-09

## Ziel

Alle asynchronen Bedienhandlungen der Community-Verwaltung erhalten
den vorhandenen `ActionButton` als eindeutiges In-flight-Feedback. Bei Aktionen
innerhalb einer Mitgliederzeile zeigt ausschließlich der ausgelöste Button seinen
Zustand. Der Retry auf der Startseite erhält denselben Hinweis, ohne seinen
eigenen Fehlerzustand zu verändern.

## Umfang und Abgrenzung

Die Änderung betrifft ausschließlich `webapp-vue`. Das Backend und seine
Verträge bleiben unverändert.

Folgende Aufrufstellen verwenden `ActionButton`:

| Seite | Aktionen |
| --- | --- |
| `pages/c/[slug]/requests.vue` | Bestätigen, Ablehnen – einzeln pro Zeile |
| `pages/c/[slug]/members.vue` | Zu Admin, Admin entziehen, Entfernen – einzeln pro Zeile |
| `pages/c/[slug]/settings.vue` | Speichern, Einladungslink erzeugen, Neu generieren, Widerrufen |
| `pages/index.vue` | Erneut versuchen |

Der Logout bleibt unverändert. Er ist bewusst eine vollbreite Drawer-Navigationszeile
mit der gemeinsamen `LINK`-Geometrie und kein kompakter Aktionsbutton. Eine
Umwandlung zu `ActionButton` würde die festgelegte Navigationserfahrung ändern und
gehört nicht zu diesem Issue.

Die synchrone Kopieraktion in den Einstellungen bleibt ebenfalls unverändert.

## Architektur

`ActionButton` bleibt die alleinige Darstellungskomponente: reservierte Slots auf
beiden Seiten, sichtbares Label, Spinner bei `busy`, deaktivierter Button während
der Ausführung und verlangsamte statt abgeschaltete Bewegung unter
`prefers-reduced-motion`. Seine Geometrie und API werden nicht verändert.

Für einzelne, voneinander unabhängige Handlungen bleibt `useAction` zuständig. Jede
Einstellungsaktion und der Startseiten-Retry erhalten eine eigene Instanz, damit
beispielsweise Link-Generieren und Speichern sich nicht gegenseitig sperren. Der
Retry behält seine bestehende Logik: `landingFailed` wird nur nach einer tatsächlich
erfolgreichen Navigation zurückgesetzt und bleibt nach erneutem Fehler oder einer
abgebrochenen Navigation sichtbar.

Für Zeilenaktionen ergänzt eine keyed Variante von `useAction` den UI-Baustein. Sie
hält eine reaktive Menge aktiver Schlüssel und stellt `isBusy(key)`, `error` und
`run(key, fn)` bereit. Ein zweiter Aufruf mit demselben Schlüssel wird während
seiner laufenden Anfrage verworfen; Aufrufe mit anderen Schlüsseln dürfen parallel
laufen. Der betroffene `ActionButton` bindet `busy` an `isBusy` mit seinem
eindeutigen Schlüssel; alle anderen Zeilen bleiben bedienbar und zeigen keinen
Spinner. Der Fehler bleibt einmalig auf Seitenebene sichtbar.

`requests.vue` und `members.vue` nutzen dieses gemeinsame Muster statt je eine
lokale, nahezu gleiche `run()`-Funktion zu pflegen. Nach Erfolg laden sie ihre
Liste neu; die Anfragenseite aktualisiert zusätzlich den Pending-Badge der Shell.
Die bekannte 409-spezifische Meldung beim Degradieren bleibt erhalten.

## Schlüssel und Datenfluss

Ein Zeilenschlüssel besteht aus der Aktion und der `userId`, etwa
`approve:u1`, `reject:u1`, `promote:u1`, `demote:u1` oder `remove:u1`.
Damit sind auch mehrere Aktionen in derselben Zeile unterscheidbar. Der Ablauf ist:

1. Der Klick ruft `run(key, apiCall)` auf.
2. Die Composable fügt den Schlüssel zur Busy-Menge hinzu und löscht den vorherigen
   Seitenfehler.
3. Nur der Button mit passendem Schlüssel zeigt Spinner und `disabled`.
4. Nach erfolgreichem API-Aufruf aktualisiert die Seite Liste und gegebenenfalls
   Community-Kontext.
5. Bei Fehler wird die vorhandene, seitenweite deutsche Fehlermeldung gesetzt.
6. In jedem Fall wird nur der ausgeführte Schlüssel aus der Busy-Menge entfernt.

## Fehlerbehandlung und Zugänglichkeit

- Abgewiesene Requests lassen keinen Button dauerhaft deaktiviert zurück.
- Ein zweiter Klick während derselben laufenden Aktion löst keine zweite Mutation
  aus; andere Zeilen und ihre Aktionen bleiben aktiv und können parallel laufen.
- Alle sichtbaren deutschen Texte bleiben unverändert oder verwenden, wenn neue
  Anführungszeichen notwendig würden, `„…“`.
- Der Retry kann Fehler weiterhin selbst behandeln, weil eine erneute Auflösung
  kein `useAction`-Fehlertext ersetzen soll.

## Tests

Vitest deckt ab:

- die keyed Composable: Busy-Schlüssel während einer Anfrage, unabhängige parallele
  Schlüssel, Rücksetzen nach Erfolg und Fehler sowie das Verwerfen eines erneuten
  Aufrufs desselben Schlüssels;
- Requests und Mitglieder: Spinner und `disabled` nur an der geklickten Zeilenaktion,
  erfolgreicher API-Aufruf, Laden der aktualisierten Liste und bestehende Fehlermeldung;
- Einstellungen: jede asynchrone Aktion erhält ihren eigenen Busy-Zustand und
  behält den bestehenden Erfolgspfad bei;
- Startseite: Retry zeigt während der Auflösung den Busy-Zustand und behält die
  bestehende `landingFailed`-Semantik bei.

Die Tests behaupten nicht irrtümlich, dass ein deaktivierter Button keinen Klick
verarbeitet: Vue Test Utils unterdrückt diesen Klick bereits selbst. Sie prüfen
stattdessen das `disabled`-Attribut und treiben die Handler aus einem aktivierten
Zustand.

## Nicht-Ziele

- Keine Änderungen an Backend-Endpunkten, Berechtigungen oder API-Typen.
- Kein Umbau von `ActionButton` oder seiner festgelegten Geometrie.
- Keine Umgestaltung des Logout-Eintrags im Drawer.
- Keine künstliche Serialisierung aller Einstellungsaktionen.
