#!/usr/bin/env python3
"""Wczytuje zapisane strony protokołów (Ctrl+S, "tylko HTML") do data/*.json.

Użycie: python3 scripts/import_html.py plik1.html [plik2.html ...]

Z protokołu bierze: numer kolejki, datę, obie drużyny, linijki zawodników
(z pierwszą piątką, którą strona pogrubia), wiersz "Drużynowe" i wiersz "Suma".
Sprawdza punkty każdego zawodnika i zgodność sum. Ten sam mecz zaimportowany
ponownie nadpisuje poprzednie dane tego meczu.
"""
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_round import roster  # noqa: E402

ROMAN = {'I': 1, 'V': 5, 'X': 10, 'L': 50}

# Numer z protokołu: puste lub 0 = brak numeru w systemie ligi (po kilku zawodników w drużynie ma 0).
# Błędne numery w systemie poprawia ręcznie data/numery.json: {"Imię Nazwisko": numer}.
NUMERY = json.loads((ROOT / 'data' / 'numery.json').read_text(encoding='utf-8')) if (ROOT / 'data' / 'numery.json').exists() else {}


# Ręczne korekty błędów stolikowych (data/korekty.json), stosowane przy każdym imporcie:
# {"ID meczu": {"Drużyna": {"pomin": ["Zawodnik"], "sekundy": {"Zawodnik": 1}}}}
KOREKTY = json.loads((ROOT / 'data' / 'korekty.json').read_text(encoding='utf-8')) if (ROOT / 'data' / 'korekty.json').exists() else {}


def popraw(mecz_id, druzyna, players):
    k = KOREKTY.get(str(mecz_id), {}).get(druzyna)
    if not k:
        return players
    out = []
    for p in players:
        if p['zawodnik'] in k.get('pomin', []):
            continue
        extra = k.get('sekundy', {}).get(p['zawodnik'], 0)
        if extra:
            mm, ss = map(int, p['min'].split(':'))
            t = mm * 60 + ss + extra
            p = dict(p, min=f'{t // 60:02d}:{t % 60:02d}')
        out.append(p)
    return out


def numer(name, raw):
    if name in NUMERY:
        return int(NUMERY[name])
    return int(raw) if str(raw).isdigit() and int(raw) > 0 else None


def roman(s):
    total, prev = 0, 0
    for ch in reversed(s.upper()):
        v = ROMAN[ch]
        total = total - v if v < prev else total + v
        prev = max(prev, v)
    return total


def cell(td):
    return td.get_text(' ', strip=True).replace('\xa0', '').strip()


def num(s):
    return int(s) if s not in ('', None) else 0


def pair(s):
    if not s:
        return 0, 0
    a, b = s.split('/')
    return int(a), int(b)


def parse(path):
    soup = BeautifulSoup(Path(path).read_text(encoding='utf-8', errors='replace'), 'html.parser')
    m = re.search(r'/mecz/(\d+)/', str(soup))
    mecz_id = int(m.group(1)) if m else None
    u = re.search(r'talk\.finteractive\.pl/mecz/%s/[a-z0-9-]+\.html' % mecz_id, str(soup)) if mecz_id else None
    url = 'https://' + u.group(0) if u else None
    box = soup.select_one('#result .box')
    info = ' '.join(p.get_text(' ', strip=True) for p in box.select('p.date'))
    km = re.search(r'\b([IVXL]+)\s+kolejka\s*\|\s*(\d{2})\.(\d{2})\.(\d{4})', info)
    if not km:
        sys.exit(f'{path}: nie znalazłem numeru kolejki i daty')
    kolejka = roman(km.group(1))
    data = f'{km.group(4)}-{km.group(3)}-{km.group(2)}'
    zweryfikowane = not box.select_one('.niezweryfikowane')
    headers = [h.get_text(strip=True) for h in soup.select('#timetable-results-table .header h1')]
    tables = soup.select('#timetable-results-table table.game-table')
    if len(headers) != 2 or len(tables) != 2:
        sys.exit(f'{path}: spodziewałem się dwóch drużyn')
    teams = []
    for name, table in zip(headers, tables):
        players, team_row, total = [], None, None
        for tr in table.select('tbody tr'):
            tds = tr.find_all('td')
            if 'c' in (tr.get('class') or []):
                v = [cell(td) for td in tds]
                name_td = tr.select_one('td.zawodnik')
                pname = ' '.join(name_td.get_text(' ', strip=True).split())
                if v[3] in ('', '00:00'):
                    continue
                (m2, a2), (m3, a3), (ftm, fta) = pair(v[4]), pair(v[6]), pair(v[10])
                p = dict(zawodnik=pname, s5=name_td.find('strong') is not None, nr=v[0], min=v[3], pts=num(v[2]),
                         fgm=m2 + m3, fga=a2 + a3, tpm=m3, tpa=a3, ftm=ftm, fta=fta,
                         oreb=num(v[12]), dreb=num(v[13]), ast=num(v[15]), pf=num(v[16]), fw=num(v[17]),
                         to=num(v[18]), stl=num(v[19]), blk=num(v[20]), eval=num(v[22]), pm=num(v[23]))
                if p['pts'] != 2 * m2 + 3 * m3 + ftm:
                    sys.exit(f'{path}: punkty się nie zgadzają u {pname}')
                players.append(p)
            else:
                label = cell(tds[0]) if tds else ''
                if label.startswith('Drużynowe'):
                    v = [cell(td) for td in tds]
                    team_row = dict(oreb=num(v[2]), dreb=num(v[3]), to=num(v[8]) if len(v) > 8 else 0)
                elif label.startswith('Suma'):
                    v = [cell(td) for td in tds]
                    (m2, a2), (m3, a3), (ftm, fta) = pair(v[3]), pair(v[5]), pair(v[9])
                    total = dict(pts=num(v[1]), fgm=m2 + m3, fga=a2 + a3, tpm=m3, tpa=a3, ftm=ftm, fta=fta,
                                 oreb=num(v[11]), dreb=num(v[12]), ast=num(v[14]), pf=num(v[15]),
                                 to=num(v[17]), stl=num(v[18]), blk=num(v[19]))
        if total is None:
            sys.exit(f'{path}: brak wiersza Suma dla {name}')
        teams.append(dict(druzyna=name, players=players, total=total, team_row=team_row))
    return dict(mecz_id=mecz_id, url=url, kolejka=kolejka, data=data, zweryfikowane=zweryfikowane, teams=teams)


def check(game, path):
    problems = []
    for t in game['teams']:
        ps, T = t['players'], t['total']
        for k in ('pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'ast', 'stl', 'blk', 'pf'):
            s = sum(p[k] for p in ps)
            if s != T[k]:
                problems.append(f'{t["druzyna"]}: {k} zawodnicy={s}, Suma={T[k]}')
        for k in ('oreb', 'dreb', 'to'):
            s = sum(p[k] for p in ps)
            if s > T[k]:
                problems.append(f'{t["druzyna"]}: {k} zawodnicy={s} > Suma={T[k]}')
        starters = sum(p['s5'] for p in ps)
        if starters not in (0, 5):
            problems.append(f'{t["druzyna"]}: w pierwszej piątce {starters} zawodników')
    if problems:
        sys.exit(f'{path}:\n  ' + '\n  '.join(problems))


def slug(s):
    s = s.lower().translate(str.maketrans('ąćęłńóśźż', 'acelnoszz'))
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def main(paths):
    pos, hgt = roster()
    md = json.loads((ROOT / 'data' / 'mecze_druzyn.json').read_text(encoding='utf-8'))
    zw = json.loads((ROOT / 'data' / 'zawodnicy.json').read_text(encoding='utf-8'))
    seen, changed = set(), False
    for path in paths:
        g = parse(path)
        if g['mecz_id'] is None:
            sys.exit(f'{path}: brak ID meczu (adresu /mecz/NNN/) w zapisanej stronie')
        a, b = g['teams']
        label = f'[{g["mecz_id"]}] kolejka {g["kolejka"]}, {g["data"]}: {a["druzyna"]} {a["total"]["pts"]}:{b["total"]["pts"]} {b["druzyna"]}'
        if g['mecz_id'] in seen:
            print(f'POMINIĘTY  {label} (ten sam mecz drugi raz w tej paczce)')
            continue
        seen.add(g['mecz_id'])
        check(g, path)
        names = {a['druzyna'], b['druzyna']}
        same = lambda r: r.get('mecz_id') == g['mecz_id'] or (r['kolejka'] == g['kolejka'] and r['druzyna'] in names)
        other_ids = {r.get('mecz_id') for r in md if same(r)} - {g['mecz_id']}
        new_md, new_zw = [], []
        for t, o in ((a, b), (b, a)):
            new_md.append(dict(kolejka=g['kolejka'], mecz_id=g['mecz_id'], url=g['url'], data=g['data'], druzyna=t['druzyna'],
                               rywal=o['druzyna'], pierwsza=t is a, **t['total']))
            for p in popraw(g['mecz_id'], t['druzyna'], t['players']):
                if p['zawodnik'] not in pos:
                    print(f'  uwaga: {p["zawodnik"]} ({t["druzyna"]}) nie ma w data/sklady.txt')
                new_zw.append(dict(kolejka=g['kolejka'], mecz_id=g['mecz_id'], zawodnik=p['zawodnik'], druzyna=t['druzyna'],
                                   pozycje=pos.get(p['zawodnik'], ''), wzrost=hgt.get(p['zawodnik']),
                                   nr=numer(p['zawodnik'], p['nr']),
                                   **{k: v for k, v in p.items() if k not in ('zawodnik', 'nr')}))
        old_md, old_zw = [r for r in md if same(r)], [r for r in zw if same(r)]
        key = lambda r: json.dumps(r, sort_keys=True, ensure_ascii=False)
        if not old_md:
            status = 'NOWY      '
        elif sorted(map(key, old_md)) == sorted(map(key, new_md)) and sorted(map(key, old_zw)) == sorted(map(key, new_zw)):
            status = 'BEZ ZMIAN '
        else:
            status = 'NADPISANY '
        if other_ids:
            print(f'  uwaga: te drużyny miały w kolejce {g["kolejka"]} mecz o innym ID {sorted(other_ids)}; zastępuję go')
        flag = '' if g['zweryfikowane'] else ' (niezweryfikowany)'
        print(f'{status}{label}{flag}')
        dest = ROOT / 'input' / 'protokoly'
        dest.mkdir(parents=True, exist_ok=True)
        raw = Path(path).read_bytes()
        for f in dest.glob(f'{g["mecz_id"]}-*.html'):
            f.unlink()
        (dest / f'{g["mecz_id"]}-{slug(a["druzyna"])}-{slug(b["druzyna"])}.html').write_bytes(raw)
        if status.strip() == 'BEZ ZMIAN':
            continue
        changed = True
        md = [r for r in md if not same(r)] + new_md
        zw = [r for r in zw if not same(r)] + new_zw
    md.sort(key=lambda r: (r['kolejka'], r.get('data', ''), r['druzyna']))
    zw.sort(key=lambda r: (r['kolejka'], r.get('data', ''), r['druzyna']))
    if changed:
        (ROOT / 'data' / 'mecze_druzyn.json').write_text(json.dumps(md, ensure_ascii=False, indent=1), encoding='utf-8')
        (ROOT / 'data' / 'zawodnicy.json').write_text(json.dumps(zw, ensure_ascii=False, indent=1), encoding='utf-8')
    druzyny = json.loads((ROOT / 'data' / 'druzyny.json').read_text(encoding='utf-8'))
    teams = sorted({r['druzyna'] for r in md} | {d['druzyna'] for d in druzyny})
    print('\nStan bazy:')
    for k in sorted({r['kolejka'] for r in md}):
        rows = [r for r in md if r['kolejka'] == k]
        ids = sorted({r['mecz_id'] for r in rows})
        missing = sorted(set(teams) - {r['druzyna'] for r in rows})
        print(f'  kolejka {k}: {len(ids)} z {len(teams) // 2} meczów' + (f'; bez meczu w bazie (jedna drużyna pauzuje): {", ".join(missing)}' if missing else ''))
    print('ZMIANY W DANYCH' if changed else 'BRAK ZMIAN W DANYCH')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
