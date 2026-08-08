#!/usr/bin/env sh
# Bequemer Weg zum lokalen, opt-in Guess-Hue-Datenset. Siehe core/README.md
# ("Guess Hue: das Datenset pruefen") fuer den Kontext und
# docs/superpowers/specs/2026-08-07-guess-hue-dataset-design.md ("Ablage und Uebergabe")
# fuer den vollen Weg eines Eintrags.
#
# Usage: ./scripts/guess-hue-dataset.sh decrypt [--force]
#        ./scripts/guess-hue-dataset.sh encrypt
set -eu

usage() {
  echo "usage: $0 decrypt [--force] | encrypt" >&2
  exit 2
}

SUBCOMMAND="${1:-}"
[ -n "$SUBCOMMAND" ] || usage
shift

FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    *) usage ;;
  esac
  shift
done

case "$SUBCOMMAND" in
  decrypt|encrypt) ;;
  *) usage ;;
esac

command -v sops >/dev/null 2>&1 || {
  echo "sops ist nicht installiert. Installieren (z.B. 'brew install sops') und erneut versuchen." >&2
  exit 1
}

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "Kein Git-Repo hier: $(pwd)" >&2
  echo "Dieses Skript muss aus einem Checkout von countdown.unividuell.org heraus laufen." >&2
  exit 1
}

# Aufgeteilt in zwei Anweisungen statt einer verschachtelten Kommandosubstitution: bei
# $(dirname "$(git ...)") ginge der Exit-Status von "git rev-parse" verloren -- scheitert es,
# liefe "dirname" auf leerer Eingabe weiter, laege bei "." und wuerde selbst erfolgreich sein,
# sodass "set -e" nie feuert. Das Skript wuerde dann versuchen, den Klartext des Datensets in
# das aktuelle Arbeitsverzeichnis zu schreiben statt nach .local/ -- ungitignored und ausserhalb
# des Hauptverzeichnisses. Kanonischer Ort fuer den Klartext ist immer das Hauptverzeichnis des
# Repos, auch wenn dieses Skript aus einem Worktree heraus laeuft -- Worktrees sind temporaer,
# .local/ im Hauptverzeichnis ist es nicht.
GIT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_ROOT="$(dirname "$GIT_COMMON_DIR")"
PLAINTEXT="$MAIN_ROOT/.local/guess-hue-dataset.yaml"

# .sops.yaml und die committete Chiffre kommen dagegen aus dem aktuellen Checkout: solange dieser
# Branch nicht in das Hauptverzeichnis gemerged ist, hat nur der Worktree eine .sops.yaml.
CHECKOUT_ROOT="$(git rev-parse --show-toplevel)"
CONFIG="$CHECKOUT_ROOT/.sops.yaml"
CIPHER="$CHECKOUT_ROOT/deploy/guess-hue-dataset.sops.yaml"

# SOPS sucht die .sops.yaml sonst vom Verzeichnis der Eingabedatei aufwaerts, nicht vom aktuellen
# Checkout aus -- ohne --config faende es im Hauptverzeichnis keine, solange dieser Branch nicht
# gemerged ist.
[ -f "$CONFIG" ] || {
  echo "Keine .sops.yaml unter $CONFIG gefunden." >&2
  exit 1
}

# Auf macOS sucht sops den age-Key sonst unter ~/Library/Application Support/sops/age/keys.txt statt
# unter ~/.config -- Verschluesseln (nur Public Key) laeuft trotzdem, Entschluesseln scheitert dann
# mit "identity did not match any of the recipients".
SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
export SOPS_AGE_KEY_FILE

# Deckt beide Richtungen und auch Abbruch per Strg-C ab: scheitert nicht sops, sondern erst das
# abschliessende "mv" (volle Platte, Rechte), wuerde ohne diesen Trap eine .tmp-Datei liegen
# bleiben -- bei decrypt waere das eine Klartextdatei, die niemand erwartet. Vor dem Anlegen der
# jeweiligen .tmp-Datei gesetzt, nach dem erfolgreichen mv durch Leeren der Pfadvariable entschaerft.
TMP_FILE=""
cleanup_tmp() {
  # "if" statt "[ -n "$TMP_FILE" ] && rm -f ...": bei leerem TMP_FILE ist die Bedingung falsch,
  # und deren eigener (nichtnullter) Exit-Status wuerde als letzter Befehl des EXIT-Traps den
  # echten Exit-Code des Skripts ueberschreiben -- ein erfolgreicher Lauf mit geleertem TMP_FILE
  # meldete sich dann faelschlich als Fehler.
  if [ -n "$TMP_FILE" ]; then
    rm -f "$TMP_FILE"
  fi
}
trap cleanup_tmp EXIT

case "$SUBCOMMAND" in
  decrypt)
    [ -f "$CIPHER" ] || {
      echo "Keine verschluesselte Chiffre unter $CIPHER gefunden." >&2
      exit 1
    }

    if [ -f "$PLAINTEXT" ] && [ "$FORCE" -eq 0 ]; then
      echo "Pufferdatei existiert bereits: $PLAINTEXT" >&2
      echo "Mit --force ueberschreiben, sonst gehen dort unversionierte Aenderungen verloren." >&2
      exit 1
    fi

    [ -f "$SOPS_AGE_KEY_FILE" ] || {
      echo "Kein age-Key unter $SOPS_AGE_KEY_FILE gefunden." >&2
      echo "Ohne ihn kann die Chiffre nicht entschluesselt werden -- Key dorthin legen oder" >&2
      echo "SOPS_AGE_KEY_FILE auf den richtigen Pfad setzen." >&2
      exit 1
    }

    mkdir -p "$(dirname "$PLAINTEXT")"
    TMP_FILE="$PLAINTEXT.tmp"

    # umask nur waehrend des Schreibens des Klartexts, danach wiederherstellen. Ueber eine
    # temporaere Datei schreiben und erst bei Erfolg per mv an die Zielstelle: ein Fehlschlag darf
    # keine halbe Datei hinterlassen (siehe auch den EXIT-Trap oben).
    OLD_UMASK="$(umask)"
    umask 077
    if ! sops -d --config "$CONFIG" "$CIPHER" > "$TMP_FILE"; then
      umask "$OLD_UMASK"
      echo "sops konnte die Chiffre nicht entschluesseln (Meldung siehe oben)." >&2
      exit 1
    fi
    umask "$OLD_UMASK"
    mv "$TMP_FILE" "$PLAINTEXT"
    TMP_FILE=""

    echo "Entschluesselt nach: $PLAINTEXT"
    echo "Zum Verwenden exportieren:"
    echo "  export GUESS_HUE_DATASET_PATH=$PLAINTEXT"
    ;;

  encrypt)
    [ -f "$PLAINTEXT" ] || {
      echo "Keine Pufferdatei unter $PLAINTEXT gefunden." >&2
      echo "Erst '$0 decrypt' laufen lassen oder die Datei von Hand anlegen." >&2
      exit 1
    }

    TMP_FILE="$CIPHER.tmp"
    if ! sops -e --config "$CONFIG" "$PLAINTEXT" > "$TMP_FILE"; then
      echo "sops konnte die Pufferdatei nicht verschluesseln (Meldung siehe oben)." >&2
      exit 1
    fi
    mv "$TMP_FILE" "$CIPHER"
    TMP_FILE=""

    echo "Verschluesselt nach: $CIPHER"
    ;;
esac
