#!/usr/bin/env python3
"""Z data/sklady.txt wylicza kategorie wiekowe do nagród i zapisuje data/wiek.json.

Na stronę trafia tylko kategoria ("U23" albo "45+"), bez dat urodzenia.
Wiek liczony na dzień pierwszego meczu sezonu. Wpisy bez poprawnej daty
(np. w paczce projektu, gdzie daty są usunięte) zostawiają poprzednią kategorię.
"""
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MLODZI_DO, WETERANI_OD = 23, 45
_W = ROOT / 'data' / 'wyjatki.json'  # lokalnie, w .gitignore
BAD = set(json.loads(_W.read_text(encoding='utf-8')).get('bledne_dane', [])) if _W.exists() else set()  # błędny rocznik w systemie ligi


def main():
    md = json.loads((ROOT / 'data' / 'mecze_druzyn.json').read_text(encoding='utf-8'))
    start = min(date.fromisoformat(r['data']) for r in md if r.get('data'))
    out_path = ROOT / 'data' / 'wiek.json'
    cats = json.loads(out_path.read_text(encoding='utf-8')) if out_path.exists() else {}
    src = ROOT / 'data' / 'sklady.txt'
    if not src.exists():  # składy z datami urodzenia są tylko lokalnie (w .gitignore)
        print('wiek: brak data/sklady.txt, zostaje obecny data/wiek.json')
        return
    lines = [l.strip() for l in src.read_text(encoding='utf-8').splitlines()]
    for i, l in enumerate(lines):
        m = re.match(r'Urodzony:\s*(\d{2})\.(\d{2})\.(\d{4})', l)
        if not m:
            continue
        name = f'{lines[i - 2]} {lines[i - 1]}'
        if name in BAD:
            cats.pop(name, None)
            continue
        born = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        age = start.year - born.year - ((start.month, start.day) < (born.month, born.day))
        if age <= MLODZI_DO:
            cats[name] = 'U23'
        elif age >= WETERANI_OD:
            cats[name] = '45+'
        else:
            cats.pop(name, None)
    out_path.write_text(json.dumps(dict(sorted(cats.items())), ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'Kategorie wiekowe: U23 {sum(v == "U23" for v in cats.values())}, 45+ {sum(v == "45+" for v in cats.values())}')


if __name__ == '__main__':
    main()
