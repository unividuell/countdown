# Game-Lab-Verbesserungen – Design

**Issue:** #42  
**Datum:** 2026-08-09

## Ziel

Das Game-Lab soll auf großen Bildschirmen schneller bedienbar sein, nach erfolgreichen
Drawer-Aktionen nicht offen stehen bleiben und beim seedlosen Einstieg auf allen Geräten
dieselbe Runde öffnen. Die Tipp-Liste erhält die bereits vorhandenen Laboraktionen direkt am
passenden Inhalt. Der Drawer zeigt auf mobilen Geräten an, wenn darunter weiterer Inhalt liegt.

## Umfang und Abgrenzung

Die Änderung betrifft ausschließlich `webapp-vue`. Das Backend stellt bereits die nötigen
Endpunkte bereit: den eigenen Tipp löschen sowie die gesamte Runde zurücksetzen. Andere
Testpersonen können niemals über die Tipp-Liste gelöscht werden.

Der Würfel-Button bleibt ein zufälliger Seed-Wechsel. Seed setzen und Würfeln schließen den
Drawer bereits über die bestehende Routenänderung; sie werden nicht verändert.

## Architektur

`NavDrawer` behält seinen lokalen Open-State. Das Lab darf ihn nicht über Props durch die
App-Shell steuern. Stattdessen stellt der `nav`-Bereich ein kleines, typisiertes Schließsignal
bereit:

- Die Lab-Seite fordert nach erfolgreichem Aktualisieren, Zurücksetzen oder Löschen des eigenen
  Tipps das Schließen an.
- `NavDrawer` reagiert auf das Signal mit seinem bestehenden Schließpfad, inklusive
  Fokus-Rückgabe an den Toggle.
- Bei einer fehlgeschlagenen Aktion wird kein Signal gesendet. Der Drawer bleibt offen, damit die
  bestehende Fehlermeldung zugänglich bleibt.

Diese schmale Richtung vermeidet sowohl eine untypisierte DOM-Nachricht als auch eine Kopplung der
globalen App-Shell an das Game-Lab.

## Tastenkürzel

Die Lab-Seite registriert zwei macOS-orientierte Tastenkürzel:

| Aktion | Kürzel | Drawer-Darstellung |
| --- | --- | --- |
| Eigenen Tipp löschen | `⌘⇧Z` | Command- und Shift-Symbol, danach `Z` als Tastenkappe |
| Runde zurücksetzen | `⌘⇧X` | Command- und Shift-Symbol, danach `X` als Tastenkappe |

Die Shortcuts lösen exakt dieselben Funktionen wie ihre Drawer-Buttons aus. Sie sind deaktiviert,
solange eine Laboraktion läuft, und werden in Eingabefeldern, Textareas, Selects oder
`contenteditable`-Elementen ignoriert. Die Browser-Standardaktion wird nur abgefangen, wenn der
Shortcut tatsächlich ausgeführt wird. Für Würfeln, Aktualisieren und Spieler wechseln gibt es
keine Tastenkürzel.

## Seedloser Einstieg

Fehlt der `seed`-Query-Parameter oder ist er ungültig, ersetzt die Seite ihn vor dem ersten API-Call
durch FNV-1a-32 über die UTF-8-Bytes der Spiel-ID (`gameId`). Der Hash wird auf 31 Bit maskiert und
damit nicht-negativ in die URL geschrieben — aus demselben Grund, aus dem `rollSeed` nicht-negativ
ist, und stärker noch: dies ist der Seed, auf dem am häufigsten jemand landet und den er weitergibt,
also darf er nicht mit einem Minus beginnen. Damit starten alle Geräte und Tabs eines Spiels bei
derselben initialen Runde, während man mit „Würfeln“ weiterhin eine neue, zufällige Runde wählen
kann.

Die Hashfunktion ist eine Frontend-Umrechnung zur URL-Reparatur; der Server bekommt weiterhin nur
den numerischen Seed. Sie folgt der vorhandenen FNV-1a-32-Konvention, um UTF-16-abhängige
Ergebnisse zu vermeiden.

## Tipp-Liste

`LabEntries` meldet beide Aktionen als Events an die Seite, wie jede andere Komponente im Projekt
auch; die Seite hält die asynchronen Abläufe:

- Die Löschaktion hängt an der Identität, nicht an der Position: nur die Zeile, deren `userId` der
  vom Aufrufer übergebenen eigenen `userId` entspricht, zeigt sie. Ein Spiel, das fremde Tipps
  schon vor dem eigenen Rateversuch aufdeckt (`revealsOthersBeforeGuess`), setzt sonst eine fremde
  Zeile an Position eins — und die Aktion „Meinen Guess löschen“ läge auf ihr.
- Unterhalb der Liste steht eine Aktion zum Zurücksetzen der gesamten Runde.
- Beide Aktionen verwenden dieselben asynchronen Abläufe wie die Drawer-Varianten und schließen
  den Drawer nicht, weil sie außerhalb davon ausgelöst werden.

Die Liste bleibt weiterhin vollständig unsichtbar, solange keine Einträge sichtbar sind.

## Mobiler Scroll-Hinweis

Der scrollbare Mittelteil von `NavDrawer` bestimmt anhand von `scrollTop`, `clientHeight` und der
Position des Logo-Blocks, ob darunter noch eine ungesehene Zeile liegt. Das Logo ist die Kante,
nicht `scrollHeight`: es wächst in den verbleibenden Leerraum hinein, und eine Liste, die deutlich
oberhalb des unteren Rands endet, hielte den Hinweis sonst dauerhaft oben — mit nichts darunter
als dem Logo.

Der Hinweis wird nicht nur beim Öffnen, beim Scrollen und bei Größenänderung neu bestimmt, sondern
auch, wenn Zeilen nachträglich eintreffen: die Spielgemeinschaftsliste ist beim Öffnen noch
unterwegs, und die Werkzeuge einer Seite werden erst beim Mount dorthin teleportiert. Ein Drawer,
der erst dadurch überläuft, bekäme sonst gar keinen Hinweis.

In diesem Zustand liegt ein dekorativer, nicht fokussierbarer Verlauf mit Chevron am unteren Rand
des Scrollbereichs. Am Listenende verschwindet er. Der Chevron federt zweimal und steht unter
`prefers-reduced-motion` still; er ersetzt keine Bedienung, Scrollen per Touch, Maus und Tastatur
bleibt unverändert.

## Fehlerbehandlung und Tests

- Erfolgreiche Antworten aktualisieren den Rundenzustand. Nur erfolgreiche Drawer-Aktionen senden
  das Schließsignal.
- Fehler behalten die bestehende sichtbare Fehlermeldung bei und lassen den Drawer offen.
- Vitest prüft den stabilen FNV-Seed samt Nicht-Negativität und den seedlosen Einstieg, Shortcuts
  einschließlich Eingabefeld-Schutz und Busy-Sperre, das Schließen nur nach Erfolg, die
  Listenaktionen in beiden Konstellationen (mit und ohne eigenen Tipp) sowie das Erscheinen und
  Verschwinden des Scroll-Hinweises, auch bei nachträglich eintreffenden Zeilen.
- Bestehende API- und Backend-Verträge bleiben unverändert.

## Nicht-Ziele

- Keine neuen Backend-Endpunkte oder Berechtigungsregeln.
- Kein Löschen fremder Tipps.
- Keine Tastenkürzel für Würfeln, Aktualisieren oder Spielerwechsel.
- Keine erzwungene sichtbare native Scrollbar.
