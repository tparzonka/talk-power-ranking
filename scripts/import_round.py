#!/usr/bin/env python3
"""Wczytuje protokoły kolejki z input/kolejka-NN.txt do data/*.json.

Użycie: python3 scripts/import_round.py input/kolejka-02.txt

Sprawdza: punkty zawodnika = 2×2P + 3×3P + FT, sumy zawodników vs SUMA drużyny
(punkty, rzuty, asysty, przechwyty, bloki, faule muszą się zgadzać; zbiórki i straty
mogą być wyższe w SUMA o zbiórki/straty drużynowe). Wpisy tej samej kolejki są nadpisywane.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Ręczne wyjątki dotyczące konkretnych zawodników trzymamy lokalnie (data/wyjatki.json, w .gitignore):
#   "pozycje": {"Imię Nazwisko": "pozycja"}  – wyjątek od reguły pierwszej pozycji
#   "bledne_dane": ["Imię Nazwisko"]           – błędny wzrost/rocznik w systemie ligi, pomijany
_W = ROOT / 'data' / 'wyjatki.json'
WYJATKI = json.loads(_W.read_text(encoding='utf-8')) if _W.exists() else {}
POS_OVERRIDES = WYJATKI.get('pozycje', {})
BAD_HEIGHT = set(WYJATKI.get('bledne_dane', []))


def roster():
    lines = [l.strip() for l in (ROOT / 'data' / 'sklady.txt').read_text(encoding='utf-8').splitlines()]
    pos, hgt = {}, {}
    for i, l in enumerate(lines):
        if l.startswith('Urodzony:'):
            name = f'{lines[i - 2]} {lines[i - 1]}'
            m = re.search(r'(\d+)\s*cm', lines[i + 1])
            hgt[name] = None if name in BAD_HEIGHT or not m else int(m.group(1))
            pos[name] = lines[i + 2].replace('Pozycja:', '').strip()
    pos.update(POS_OVERRIDES)
    return pos, hgt


def pair(s):
    a, b = s.split('/')
    return int(a), int(b)


def parse(path):
    kolejka, games, cur, team = None, [], None, None
    for raw in Path(path).read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('kolejka:'):
            kolejka = int(line.split(':')[1])
        elif line.startswith('=='):
            a, b = [x.strip() for x in line[2:].split('|')]
            cur = {'teams': (a, b), 'totals': {}, 'players': {a: [], b: []}}
            games.append(cur)
        elif line.startswith('SUMA '):
            team, *v = line[5:].split(';')
            team = team.strip()
            pts, p2, p3, ft = int(v[0]), pair(v[1]), pair(v[2]), pair(v[3])
            orb, drb, ast, pf, to, stl, blk = map(int, v[4:11])
            cur['totals'][team] = dict(pts=pts, fgm=p2[0] + p3[0], fga=p2[1] + p3[1], tpm=p3[0], tpa=p3[1],
                                       ftm=ft[0], fta=ft[1], oreb=orb, dreb=drb, ast=ast, pf=pf, to=to, stl=stl, blk=blk)
        else:
            f = line.split(';')
            if len(f) != 16:
                sys.exit(f'Zła liczba pól ({len(f)}) w linii: {line}')
            name, mn, pts = f[0], f[1], int(f[2])
            (m2, a2), (m3, a3), (ftm, fta) = pair(f[3]), pair(f[4]), pair(f[5])
            if pts != 2 * m2 + 3 * m3 + ftm:
                sys.exit(f'Punkty się nie zgadzają: {name} ({pts} vs {2 * m2 + 3 * m3 + ftm})')
            cur['players'][team].append(dict(
                zawodnik=name, min=mn, pts=pts, fgm=m2 + m3, fga=a2 + a3, tpm=m3, tpa=a3, ftm=ftm, fta=fta,
                oreb=int(f[6]), dreb=int(f[7]), ast=int(f[8]), pf=int(f[9]), fw=int(f[10]), to=int(f[11]),
                stl=int(f[12]), blk=int(f[13]), eval=int(f[14]), pm=int(f[15])))
    if kolejka is None:
        sys.exit('Brak linii "kolejka: N"')
    return kolejka, games


def main(path):
    kolejka, games = parse(path)
    pos, hgt = roster()
    md = json.loads((ROOT / 'data' / 'mecze_druzyn.json').read_text(encoding='utf-8'))
    zw = json.loads((ROOT / 'data' / 'zawodnicy.json').read_text(encoding='utf-8'))
    teams_in = {t for g in games for t in g['teams']}
    md = [r for r in md if not (r['kolejka'] == kolejka and r['druzyna'] in teams_in)]
    zw = [r for r in zw if not (r['kolejka'] == kolejka and r['druzyna'] in teams_in)]
    problems = []
    for g in games:
        a, b = g['teams']
        for team, rival in ((a, b), (b, a)):
            T = g['totals'][team]
            ps = g['players'][team]
            for k in ('pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'ast', 'stl', 'blk', 'pf'):
                s = sum(p[k] for p in ps)
                if s != T[k]:
                    problems.append(f'{team}: {k} zawodnicy={s}, SUMA={T[k]}')
            for k in ('oreb', 'dreb', 'to'):
                s = sum(p[k] for p in ps)
                if s > T[k]:
                    problems.append(f'{team}: {k} zawodnicy={s} > SUMA={T[k]}')
            md.append(dict(kolejka=kolejka, druzyna=team, rywal=rival, **T))
            for p in ps:
                if p['zawodnik'] not in pos:
                    print(f'  uwaga: {p["zawodnik"]} ({team}) nie ma w data/sklady.txt')
                zw.append(dict(kolejka=kolejka, zawodnik=p['zawodnik'], druzyna=team,
                               pozycje=pos.get(p['zawodnik'], ''), wzrost=hgt.get(p['zawodnik']), **{k: v for k, v in p.items() if k != 'zawodnik'}))
    if problems:
        sys.exit('Błędy w protokołach:\n  ' + '\n  '.join(problems))
    (ROOT / 'data' / 'mecze_druzyn.json').write_text(json.dumps(md, ensure_ascii=False, indent=1), encoding='utf-8')
    (ROOT / 'data' / 'zawodnicy.json').write_text(json.dumps(zw, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'Kolejka {kolejka}: {len(games)} meczów, {sum(len(v) for g in games for v in g["players"].values())} linijek zawodników. OK.')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
