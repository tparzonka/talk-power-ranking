#!/usr/bin/env python3
"""Import terminarza z zapisanej strony „Terminarz i wyniki” systemu ligi.

Użycie: python3 scripts/terminarz.py plik.html [plik2.html ...]
Terminarz zmienia się w trakcie sezonu (przełożone mecze, nowe daty), więc każdy import
PODMIENIA cały data/terminarz.json na stan z najnowszego pliku. Wyniki do rankingu dalej
pochodzą wyłącznie z protokołów; terminarz służy do pokazania nadchodzących meczów.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'terminarz.json'
ROMAN = {'I': 1, 'V': 5, 'X': 10, 'L': 50}


def roman(s):
    total, prev = 0, 0
    for ch in reversed(s.upper()):
        v = ROMAN.get(ch, 0)
        total = total - v if v < prev else total + v
        prev = max(prev, v)
    return total


def round_no(text):
    t = ' '.join(text.split())
    m = re.match(r'^(\d+)\.?\s*kolejka', t, re.I)
    if m:
        return int(m.group(1))
    m = re.match(r'^([IVXL]+)\s+kolejka', t, re.I)
    return roman(m.group(1)) if m else None


def parse(path):
    soup = BeautifulSoup(Path(path).read_text(encoding='utf-8', errors='ignore'), 'html.parser')
    table = soup.select_one('.timetable table')
    if table is None:
        return None
    games, k = [], None
    for tr in table.select('tbody > tr'):
        h3 = tr.find('h3')
        if h3:
            k = round_no(h3.get_text(' ', strip=True))
            continue
        if 'box' not in (tr.get('class') or []) or k is None:
            continue
        tds = tr.find_all('td')
        if len(tds) < 3:
            continue
        when = ' '.join(tds[0].get_text(' ', strip=True).split())
        m = re.match(r'(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}:\d{2}))?', when)
        teams = [a.get_text(' ', strip=True) for a in tds[1].find_all('a')]
        link = tds[2].find('a')
        href = link.get('href', '') if link else ''
        mid = re.search(r'/mecz/(\d+)/', href)
        score = re.match(r'^\s*(\d+)\s*:\s*(\d+)\s*$', tds[2].get_text(' ', strip=True))
        if len(teams) != 2:
            continue
        games.append({
            'kolejka': k,
            'mecz_id': int(mid.group(1)) if mid else None,
            'data': f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else '',
            'godz': (m.group(4) or '') if m else '',
            'gosp': ' '.join(teams[0].split()),
            'gosc': ' '.join(teams[1].split()),
            'wynik': [int(score.group(1)), int(score.group(2))] if score else None,
            'url': href,
        })
    return games


def main(paths):
    parsed = [(p, parse(p)) for p in paths]
    parsed = [(p, g) for p, g in parsed if g]
    if not parsed:
        sys.exit('Nie znaleziono terminarza w podanych plikach (brak tabeli .timetable).')
    path, games = parsed[-1]

    # nazwy drużyn jak w data/druzyny.json (bez względu na wielkość liter)
    known = {d['druzyna'].casefold(): d['druzyna'] for d in json.loads((ROOT / 'data' / 'druzyny.json').read_text(encoding='utf-8'))}
    unknown = set()
    for g in games:
        for side in ('gosp', 'gosc'):
            canon = known.get(g[side].casefold())
            if canon:
                g[side] = canon
            else:
                unknown.add(g[side])

    old = {}
    if OUT.exists():
        prev = json.loads(OUT.read_text(encoding='utf-8'))
        old = {g['mecz_id']: g for g in prev.get('mecze', [])}
    new_ids = {g['mecz_id'] for g in games}
    added = [g for g in games if g['mecz_id'] not in old]
    removed = [g for i, g in old.items() if i not in new_ids]
    moved = [g for g in games if g['mecz_id'] in old and (old[g['mecz_id']]['data'], old[g['mecz_id']]['godz']) != (g['data'], g['godz'])]
    results = [g for g in games if g['wynik'] and g['mecz_id'] in old and not old[g['mecz_id']]['wynik']]

    OUT.write_text(json.dumps({'stan': date.today().isoformat(), 'mecze': games}, ensure_ascii=False, indent=1), encoding='utf-8')

    rounds = sorted({g['kolejka'] for g in games})
    played = sum(1 for g in games if g['wynik'])
    print(f'Terminarz: {Path(path).name}')
    print(f'  {len(games)} meczów w {len(rounds)} kolejkach ({rounds[0]}–{rounds[-1]}), z wynikiem: {played}')
    if old:
        print(f'  zmiany od poprzedniego: nowe mecze {len(added)}, usunięte {len(removed)}, zmiana daty {len(moved)}, nowe wyniki {len(results)}')
        for g in moved:
            o = old[g['mecz_id']]
            print(f'    PRZEŁOŻONY: {g["gosp"]} - {g["gosc"]} ({g["kolejka"]}. kol.): {o["data"]} {o["godz"]} -> {g["data"]} {g["godz"]}')
        for g in removed:
            print(f'    USUNIĘTY: {g["gosp"]} - {g["gosc"]} ({g["kolejka"]}. kol.)')
    for name in sorted(unknown):
        print(f'  uwaga: drużyny „{name}” nie ma w data/druzyny.json')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
