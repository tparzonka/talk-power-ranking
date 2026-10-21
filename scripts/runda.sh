#!/usr/bin/env bash
# Jedna komenda na nową porcję protokołów:
#   bash scripts/runda.sh plik1.html [plik2.html ...]   (protokoły meczów i/lub strona terminarza)
# Import (z kontrolą ID meczu) -> budowa strony -> test -> kopia do publikacji -> paczka projektu.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Pliki terminarza (strona „Terminarz i wyniki”) i protokoły meczów można podać razem.
TERM=(); PROT=()
for f in "$@"; do
  if grep -q 'class="timetable"' "$f"; then TERM+=("$f"); else PROT+=("$f"); fi
done
if [ "${#TERM[@]}" -gt 0 ]; then python3 scripts/terminarz.py "${TERM[@]}"; fi
if [ "${#PROT[@]}" -gt 0 ]; then python3 scripts/import_html.py "${PROT[@]}"; fi
python3 scripts/wiek.py
python3 scripts/build.py
python3 scripts/ics.py
node scripts/test.mjs | tail -1
# Kopia do publikacji i paczka projektu tylko w środowisku, które je publikuje (domyślnie /home/claude).
PUB="${PUBLISH_DIR:-/home/claude}"
if [ ! -d "$PUB" ]; then echo "Gotowe: dist/ranking-publiczny.html"; exit 0; fi
cp dist/ranking-publiczny.html "$PUB/ranking-publiczny.html"
# Paczka projektu (tar.xz w base64, bez dat urodzenia ze składów) publikowana przy stronie jako projekt.txt.
TMP="$(mktemp -d)"; mkdir -p "$TMP/power-ranking"
tar -cf - README.md docs VERSION scripts/*.py scripts/*.mjs scripts/*.sh src data assets | tar -xf - -C "$TMP/power-ranking"
if [ -f data/sklady.txt ]; then cp data/sklady.txt "$TMP/power-ranking/data/"; sed -i -E 's/^Urodzony:.*/Urodzony: -/' "$TMP/power-ranking/data/sklady.txt"; fi
XZ_OPT=-9 tar -cJf - -C "$TMP" power-ranking | base64 -w0 > "$PUB/projekt.txt"
rm -rf "$TMP"
echo "Gotowe: $PUB/ranking-publiczny.html + $PUB/projekt.txt"
