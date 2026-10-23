#!/usr/bin/env python3
"""Raport scoutingowy przed meczem: nasza drużyna kontra rywal.

Liczy z protokołów (data/mecze_druzyn.json, data/zawodnicy.json), terminarza i składów:
  1. porównanie drużyn na tle ligi (miejsca 1..N) i cztery czynniki: atak przeciw obronie,
  2. mecze obu drużyn (z siłą rywali),
  3. wspólnych rywali: ten sam przeciwnik, dwa mecze, różnica na 100 posiadań, skład rywala w obu meczach,
  4. zawodników obu drużyn, rotację i niegrających jeszcze zawodników rywala ze składu,
  5. raport indywidualny zawodnika (domyślnie numer 14 naszej drużyny): na tle ligi, pozycji i drużyny,
     wysocy rywala i to, co wysocy innych drużyn robili przeciw temu rywalowi.

Użycie:
  python3 scripts/scouting.py [--druzyna "QUANTUM HOOP"] [--rywal "NAZWA"] [--nr 14]
                              [--out raport.md] [--json dane.json] [--html raport.html --notes wnioski.json]
Bez --rywal: najbliższy niezagrany mecz drużyny z terminarza.
--html buduje stronę z scripts/scouting_template.html; --notes to JSON z interpretacją (lead, wnioski, klucze, cele,
uwagi) pisaną po przeczytaniu liczb – strona pokazuje je obok danych.

Wynik zawiera dane zawodników (dane osobowe): zapisuj go poza repozytorium (np. /home/claude/out), nie commituj.
"""
import argparse
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WYSOCY = ('silny skrzydłowy', 'środkowy')
WYSOKI_OD_CM = 193
KEYS = ('pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'pf', 'to', 'stl', 'blk')


def load(name, default):
    p = ROOT / 'data' / name
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else default


def n(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def mins(s):
    p = str(s or '0:0').split(':')
    return int(p[0]) + (int(p[1]) if len(p) > 1 else 0) / 60


def f1(x, d=1):
    return '-' if x is None else f'{x:.{d}f}'.replace('.', ',')


def sgn(x, d=1):
    return '-' if x is None else ('+' if x > 0.05 else '') + f1(x, d)


def pct(a, b):
    return 100 * a / b if b else None


def r1(x, d=1):
    return None if x is None else round(x, d)


def own_poss(t):
    return n(t['fga']) + 0.44 * n(t['fta']) - n(t['oreb']) + n(t['to'])


def gmsc(z):
    return (n(z['pts']) + 0.4 * n(z['fgm']) - 0.7 * n(z['fga']) - 0.4 * (n(z['fta']) - n(z['ftm'])) + 0.7 * n(z['oreb'])
            + 0.3 * n(z['dreb']) + n(z['stl']) + 0.7 * n(z['ast']) + 0.7 * n(z['blk']) - 0.4 * n(z['pf']) - n(z['to']))


# ---------- drużyny ----------

def pairs(md):
    by = {}
    for r in md:
        by.setdefault(r['mecz_id'], []).append(r)
    out = []
    for rows in by.values():
        if len(rows) == 2:
            a, b = rows
            out += [(a, b), (b, a)]
    return out


def agg(games):
    """games: lista (wiersz drużyny, wiersz rywala) -> miary drużyny i jej rywali."""
    if not games:
        return None
    s = {k: 0.0 for k in KEYS}
    o = {k: 0.0 for k in KEYS}
    poss = own = oppown = 0.0
    w = 0
    for t, r in games:
        for k in KEYS:
            s[k] += n(t[k])
            o[k] += n(r[k])
        poss += (own_poss(t) + own_poss(r)) / 2
        own += own_poss(t)
        oppown += own_poss(r)
        w += n(t['pts']) > n(r['pts'])
    g = len(games)
    return {
        'g': g, 'w': w, 'l': g - w,
        'pts': s['pts'] / g, 'opp_pts': o['pts'] / g, 'mov': (s['pts'] - o['pts']) / g,
        'pace': poss / g,
        'ortg': pct(s['pts'], poss), 'drtg': pct(o['pts'], poss), 'net': pct(s['pts'] - o['pts'], poss),
        'efg': pct(s['fgm'] + 0.5 * s['tpm'], s['fga']),
        'p2': pct(s['fgm'] - s['tpm'], s['fga'] - s['tpa']), 'p3': pct(s['tpm'], s['tpa']),
        'par3': pct(s['tpa'], s['fga']), 'ftr': pct(s['fta'], s['fga']), 'ftp': pct(s['ftm'], s['fta']),
        'tov': pct(s['to'], own), 'orb': pct(s['oreb'], s['oreb'] + o['dreb']), 'drb': pct(s['dreb'], s['dreb'] + o['oreb']),
        'astr': pct(s['ast'], s['fgm']), 'stl100': pct(s['stl'], poss), 'blk100': pct(s['blk'], poss), 'pf100': pct(s['pf'], poss),
        'o_efg': pct(o['fgm'] + 0.5 * o['tpm'], o['fga']), 'o_tov': pct(o['to'], oppown), 'o_ftr': pct(o['fta'], o['fga']),
        'o_orb': pct(o['oreb'], o['oreb'] + s['dreb']),
        'o_par3': pct(o['tpa'], o['fga']), 'o_p3': pct(o['tpm'], o['tpa']), 'o_p2': pct(o['fgm'] - o['tpm'], o['fga'] - o['tpa']),
    }


# klucz, etykieta, większe = lepiej (None = bez oceny, miejsce 1 = najwięcej)
METRYKI = [
    ('net', 'NetRtg (różnica na 100 posiadań)', True), ('ortg', 'Atak: punkty na 100 posiadań', True),
    ('drtg', 'Obrona: punkty rywali na 100 posiadań', False), ('pace', 'Tempo: posiadania na mecz', None),
    ('efg', 'eFG% (trójka liczona ×1,5)', True), ('p2', 'Za 2 %', True), ('p3', 'Za 3 %', True),
    ('par3', 'Udział rzutów za 3 %', None), ('ftr', 'Wolne: próby na 100 rzutów z gry', True), ('ftp', 'Wolne %', True),
    ('tov', 'Straty na 100 posiadań', False), ('orb', 'Zbiórka w ataku %', True), ('drb', 'Zbiórka w obronie %', True),
    ('astr', 'Asysty na 100 celnych rzutów', True), ('stl100', 'Przechwyty na 100 posiadań', True),
    ('blk100', 'Bloki na 100 posiadań', True), ('pf100', 'Faule na 100 posiadań', False),
    ('o_efg', 'Rywale: eFG%', False), ('o_p2', 'Rywale: za 2 %', False), ('o_p3', 'Rywale: za 3 %', False),
    ('o_tov', 'Rywale: straty na 100 posiadań', True), ('o_ftr', 'Rywale: wolne na 100 rzutów z gry', False),
]
HB = {k: hb for k, _, hb in METRYKI}

# cztery czynniki: (czynnik, klucz ataku, klucz tego, na co obrona pozwala, więcej = lepiej dla atakujących)
CZYNNIKI = [
    ('eFG%', 'efg', 'o_efg', True), ('Straty na 100 posiadań', 'tov', 'o_tov', False),
    ('Zbiórka w ataku %', 'orb', 'o_orb', True), ('Wolne na 100 rzutów z gry', 'ftr', 'o_ftr', True),
]


def rank_of(val, values, higher_better):
    vals = [v for v in values if v is not None]
    if val is None or not vals:
        return None
    if higher_better is None:
        higher_better = True
    return 1 + sum(1 for v in vals if (v > val + 1e-9 if higher_better else v < val - 1e-9))


# ---------- oceny z modelu strony ----------

def ratings(team_a, team_b):
    js = r"""
const {rankPlayers, rankTeams, winChance} = require(process.argv[1]);
const fs = require('fs');
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const md = rd(process.argv[2]), zw = rd(process.argv[3]), dr = rd(process.argv[4]);
const [a, b] = JSON.parse(process.argv[5]);
console.log(JSON.stringify({players: rankPlayers(zw, md), teams: rankTeams(md, dr), win: winChance(md)(a, b)}));
"""
    args = ['node', '-e', js, str(ROOT / 'src' / 'ranking.js'), str(ROOT / 'data' / 'mecze_druzyn.json'),
            str(ROOT / 'data' / 'zawodnicy.json'), str(ROOT / 'data' / 'druzyny.json'), json.dumps([team_a, team_b])]
    return json.loads(subprocess.run(args, capture_output=True, text=True, check=True).stdout)


def num(s):
    if s in (None, '-', ''):
        return None
    return float(str(s).replace(',', '.').replace('+', ''))


# ---------- zawodnicy ----------

def player_lines(zw, games_by_key):
    out = {}
    for z in zw:
        key = (z['mecz_id'], z['druzyna'])
        if key not in games_by_key:
            continue
        t, o = games_by_key[key]
        p = out.setdefault(z['zawodnik'], {'zawodnik': z['zawodnik'], 'druzyna': z['druzyna'], 'g': 0, 's5': 0, 'min': 0.0,
                                           'pm': 0.0, 'gm': 0.0, 'use': 0.0, 'tuse_w': 0.0, 'orb_ch': 0.0, 'drb_ch': 0.0,
                                           **{k: 0.0 for k in KEYS}, 'mecze': []})
        m = mins(z['min'])
        p['g'] += 1
        p['s5'] += bool(z.get('s5'))
        p['min'] += m
        p['pm'] += n(z.get('pm'))
        p['gm'] += gmsc(z)
        for k in KEYS:
            p[k] += n(z.get(k))
        p['use'] += n(z['fga']) + 0.44 * n(z['fta']) + n(z['to'])
        p['tuse_w'] += (n(t['fga']) + 0.44 * n(t['fta']) + n(t['to'])) * m / 40  # akcje drużyny, gdy grał (wg minut)
        p['orb_ch'] += (n(t['oreb']) + n(o['dreb'])) * m / 40
        p['drb_ch'] += (n(t['dreb']) + n(o['oreb'])) * m / 40
        if z.get('nr') is not None:
            p['nr'] = z['nr']
        p['wzrost'] = z.get('wzrost') or p.get('wzrost')
        p['pozycje'] = z.get('pozycje') or p.get('pozycje')
        p['mecze'].append((z, t, o))
    for p in out.values():
        g, m = p['g'], p['min']
        p['min_g'] = m / g
        p40 = (lambda v: 40 * v / m if m else None)
        p['p40'] = {k: p40(p[k]) for k in ('pts', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'to', 'pf', 'fta')}
        p['p40']['reb'] = p40(p['oreb'] + p['dreb'])
        p['ts'] = pct(p['pts'], 2 * (p['fga'] + 0.44 * p['fta']))
        p['efg'] = pct(p['fgm'] + 0.5 * p['tpm'], p['fga'])
        p['usg'] = pct(p['use'], p['tuse_w'])
        p['orbp'] = pct(p['oreb'], p['orb_ch'])
        p['drbp'] = pct(p['dreb'], p['drb_ch'])
        p['gm_g'] = p['gm'] / g
        p['pm_g'] = p['pm'] / g
    return out


def roster(team, druzyny):
    """Zawodnicy drużyny z data/sklady.txt (bez dat urodzenia)."""
    src = ROOT / 'data' / 'sklady.txt'
    if not src.exists():
        return []
    lines = [l.strip() for l in src.read_text(encoding='utf-8').splitlines()]
    header, out = None, []
    for i, l in enumerate(lines):
        if i == 0 or lines[i - 1].startswith('___'):
            header = l
        if not l.startswith('Urodzony:') or header is None:
            continue
        full = [d for d in druzyny if d.upper().startswith(header.upper()) or header.upper().startswith(d.upper())]
        if team not in full:
            continue
        h = re.search(r'(\d+)\s*cm', lines[i + 1]) if i + 1 < len(lines) else None
        poz = lines[i + 2].split(':', 1)[1].strip() if i + 2 < len(lines) and lines[i + 2].startswith('Pozycja') else ''
        out.append({'zawodnik': f'{lines[i - 2]} {lines[i - 1]}', 'wzrost': int(h.group(1)) if h else None, 'pozycja': poz})
    return out


# ---------- dane raportu ----------

def build(A, B, nastepny, nr=None, zawodnik=None):
    md = load('mecze_druzyn.json', [])
    zw = load('zawodnicy.json', [])
    druzyny = [d['druzyna'] for d in load('druzyny.json', [])]
    P = pairs(md)
    by_key = {(t['mecz_id'], t['druzyna']): (t, o) for t, o in P}
    team_games = {}
    for t, o in P:
        team_games.setdefault(t['druzyna'], []).append((t, o))
    for v in team_games.values():
        v.sort(key=lambda x: (x[0]['data'], x[0]['mecz_id']))
    tm = {d: agg(g) for d, g in team_games.items()}
    liga = agg(P)
    R = ratings(A, B)
    pl_rating = {(p['zawodnik'], p['pozycja']): p for p in R['players']}
    team_rank = {t['druzyna']: t for t in R['teams']}
    pls = player_lines(zw, by_key)
    ga, gb = tm.get(A), tm.get(B)

    def rating_row(name):
        return pl_rating.get((name, 'wszyscy'), {})

    def pos_of(name):
        r = rating_row(name)
        return r.get('glowna') or ((pls.get(name, {}).get('pozycje') or '-').split(' / ')[0])

    def wysoki(name, p):
        return pos_of(name) in WYSOCY or (p.get('wzrost') or 0) >= WYSOKI_OD_CM

    D = {'druzyna': A, 'rywal': B, 'mecz': nastepny, 'protokoly_od': min(r['data'] for r in md),
         'protokoly_do': max(r['data'] for r in md), 'mecze_ligi': len(md) // 2,
         'g': {A: ga['g'] if ga else 0, B: gb['g'] if gb else 0}, 'druzyn': sum(1 for t in tm.values() if t)}

    # porównanie
    rows = []
    for k, label, hb in METRYKI:
        vals = [m[k] for m in tm.values() if m]
        cell = lambda m: None if not m else {'v': r1(m[k]), 'm': rank_of(m[k], vals, hb)}
        rows.append({'k': k, 'label': label, 'hb': hb, 'a': cell(ga), 'b': cell(gb), 'liga': r1(liga[k])})
    D['porownanie'] = rows
    D['ranking'] = {d: {'miejsce': team_rank.get(d, {}).get('miejsce'), 'bilans': team_rank.get(d, {}).get('bilans'),
                        'net': team_rank.get(d, {}).get('net')} for d in (A, B)}
    D['szansa'] = r1(100 * R['win'], 0)
    lg_orb = liga['orb']
    D['czynniki'] = [{'czynnik': c, 'wiecej_lepiej': up,
                      'atak_a': r1(ga[ka]) if ga else None, 'obrona_b': r1(gb[kd]) if gb else None,
                      'atak_b': r1(gb[ka]) if gb else None, 'obrona_a': r1(ga[kd]) if ga else None,
                      'liga': r1(lg_orb if ka == 'orb' else liga[ka])} for c, ka, kd, up in CZYNNIKI]

    # mecze
    D['mecze'] = {}
    for d in (A, B):
        out = []
        for t, o in team_games.get(d, []):
            ps = (own_poss(t) + own_poss(o)) / 2
            top = sorted((z for z in zw if z['mecz_id'] == t['mecz_id'] and z['druzyna'] == d), key=lambda z: -n(z['pts']))[:2]
            rr = team_rank.get(o['druzyna'], {})
            out.append({'kolejka': t['kolejka'], 'data': t['data'], 'rywal': o['druzyna'], 'url': t.get('url'),
                        'rywal_miejsce': rr.get('miejsce'), 'rywal_net': rr.get('net'),
                        'pkt': int(n(t['pts'])), 'pkt_rywala': int(n(o['pts'])), 'tempo': r1(ps),
                        'atak': r1(pct(n(t['pts']), ps)), 'obrona': r1(pct(n(o['pts']), ps)),
                        'najwiecej': [[z['zawodnik'], int(n(z['pts']))] for z in top]})
        D['mecze'][d] = out

    # wspólni rywale
    opp_a = {o['druzyna'] for _, o in team_games.get(A, [])}
    opp_b = {o['druzyna'] for _, o in team_games.get(B, [])}
    D['bezposrednie'] = [{'data': t['data'], 'pkt': int(n(t['pts'])), 'pkt_rywala': int(n(o['pts']))}
                         for t, o in team_games.get(A, []) if o['druzyna'] == B]
    D['wspolni'] = []
    for C in sorted((opp_a & opp_b) - {A, B}):
        gamesC = {d: [x for x in team_games[d] if x[1]['druzyna'] == C] for d in (A, B)}
        mecze = []
        for d in (A, B):
            for t, o in gamesC[d]:
                g = agg([(t, o)])
                mecze.append({'druzyna': d, 'data': t['data'], 'url': t.get('url'), 'pkt': int(n(t['pts'])),
                              'pkt_rywala': int(n(o['pts'])), 'mov': r1(g['mov'], 0), 'net': r1(g['net']), 'tempo': r1(g['pace']),
                              'efg': r1(g['efg']), 'efg_c': r1(g['o_efg']), 'tov': r1(g['tov']), 'tov_c': r1(g['o_tov']),
                              'orb': r1(g['orb']), 'drb': r1(g['drb']), 'ftr': r1(g['ftr']), 'ftr_c': r1(g['o_ftr'])})
        na, nb = agg(gamesC[A])['net'], agg(gamesC[B])['net']
        ids = {d: {t['mecz_id'] for t, _ in gamesC[d]} for d in (A, B)}
        sklad = {}
        for z in zw:
            if z['druzyna'] != C:
                continue
            for d in (A, B):
                if z['mecz_id'] in ids[d]:
                    sklad.setdefault(z['zawodnik'], {})[d] = {'min': round(mins(z['min'])), 'pkt': int(n(z['pts'])),
                                                              'zb': int(n(z['oreb']) + n(z['dreb']))}
        lineup = []
        for name, gg in sorted(sklad.items(), key=lambda kv: -sum(v['min'] for v in kv[1].values())):
            lineup.append({'zawodnik': name, 'pozycja': pos_of(name), 'wzrost': pls.get(name, {}).get('wzrost'),
                           'a': gg.get(A), 'b': gg.get(B)})
        D['wspolni'].append({'rywal': C, 'mecze': mecze, 'net_a': r1(na), 'net_b': r1(nb), 'roznica': r1(na - nb),
                             'sklad': lineup})
    pace_ab = (ga['pace'] + gb['pace']) / 2 if ga and gb else liga['pace']
    if D['wspolni']:
        e = sum(w['roznica'] for w in D['wspolni']) / len(D['wspolni'])
        D['szacunek'] = {'na100': r1(e), 'pkt': r1(e * pace_ab / 100, 0), 'tempo': r1(pace_ab), 'rywali': len(D['wspolni'])}

    # zawodnicy
    D['zawodnicy'] = {}
    D['rotacja'] = {}
    for d in (A, B):
        team_pts = sum(p['pts'] for p in pls.values() if p['druzyna'] == d)
        rows = []
        for p in sorted((p for p in pls.values() if p['druzyna'] == d), key=lambda p: -p['min_g']):
            r = rating_row(p['zawodnik'])
            g = p['g']
            rows.append({'zawodnik': p['zawodnik'], 'nr': p.get('nr'), 'pozycja': pos_of(p['zawodnik']), 'wzrost': p.get('wzrost'),
                         'g': g, 's5': p['s5'], 'min': r1(p['min_g']), 'pkt': r1(p['pts'] / g), 'udzial_pkt': r1(pct(p['pts'], team_pts), 0),
                         'zb': r1((p['oreb'] + p['dreb']) / g), 'as': r1(p['ast'] / g), 'prz': r1(p['stl'] / g), 'bl': r1(p['blk'] / g),
                         'str': r1(p['to'] / g), 'f': r1(p['pf'] / g), 'fg': [int(p['fgm']), int(p['fga'])],
                         'tp': [int(p['tpm']), int(p['tpa'])], 'ft': [int(p['ftm']), int(p['fta'])],
                         'ts': r1(p['ts']), 'usg': r1(p['usg']), 'pm': r1(p['pm_g']),
                         'ocena': num(r.get('ocena')), 'miejsce': r.get('miejsce')})
        D['zawodnicy'][d] = rows
        rot = []
        for t, o in team_games.get(d, []):
            zs = sorted((z for z in zw if z['mecz_id'] == t['mecz_id'] and z['druzyna'] == d), key=lambda z: -mins(z['min']))
            rot.append({'data': t['data'], 'rywal': o['druzyna'], 'zawodnikow': len(zs),
                        'top3_min': round(sum(mins(z['min']) for z in zs[:3])),
                        'piatka': [z['zawodnik'] for z in zs if z.get('s5')]})
        D['rotacja'][d] = rot
    grali = {p['zawodnik'] for p in pls.values() if p['druzyna'] == B}
    D['nie_grali'] = sorted((r for r in roster(B, druzyny) if r['zawodnik'] not in grali), key=lambda r: -(r['wzrost'] or 0))
    D['liczba_graczy'] = sum(1 for p in R['players'] if p['pozycja'] == 'wszyscy')

    # raport indywidualny
    me = None
    for p in pls.values():
        if p['druzyna'] == A and ((zawodnik and p['zawodnik'] == zawodnik) or (not zawodnik and nr is not None and str(p.get('nr')) == str(nr))):
            me = p
    if me:
        name = me['zawodnik']
        poz = pos_of(name)
        r_all, r_pos = rating_row(name), pl_rating.get((name, poz), {})
        same = [p for p in pls.values() if pos_of(p['zawodnik']) == poz and p['min_g'] >= 15]
        team = [p for p in pls.values() if p['druzyna'] == A and p['min_g'] >= 15]

        def avg(group, f):
            vals = [f(p) for p in group if f(p) is not None]
            return sum(vals) / len(vals) if vals else None

        miary = [
            ('min', 'Minuty na mecz', lambda p: p['min_g'], True), ('pkt40', 'Punkty na 40 min', lambda p: p['p40']['pts'], True),
            ('zb40', 'Zbiórki na 40 min', lambda p: p['p40']['reb'], True), ('zba40', 'Zbiórki w ataku na 40 min', lambda p: p['p40']['oreb'], True),
            ('orbp', 'Zbiórki w ataku %', lambda p: p['orbp'], True), ('drbp', 'Zbiórki w obronie %', lambda p: p['drbp'], True),
            ('bl40', 'Bloki na 40 min', lambda p: p['p40']['blk'], True), ('as40', 'Asysty na 40 min', lambda p: p['p40']['ast'], True),
            ('str40', 'Straty na 40 min', lambda p: p['p40']['to'], False), ('f40', 'Faule na 40 min', lambda p: p['p40']['pf'], False),
            ('fta40', 'Wolne (próby) na 40 min', lambda p: p['p40']['fta'], True), ('ts', 'TS%', lambda p: p['ts'], True),
            ('usg', 'Udział w akcjach %', lambda p: p['usg'], True), ('gm', 'GmSc na mecz', lambda p: p['gm_g'], True),
        ]
        rows = []
        for k, lab, f, hb in miary:
            rows.append({'k': k, 'label': lab, 'hb': hb, 'v': r1(f(me)), 'poz_avg': r1(avg(same, f)),
                         'poz_m': rank_of(f(me), [f(p) for p in same], hb), 'druz_avg': r1(avg(team, f)),
                         'druz_m': rank_of(f(me), [f(p) for p in team], hb)})
        mecze = []
        for z, t, o in me['mecze']:
            mecze.append({'data': t['data'], 'rywal': o['druzyna'], 'wynik': f'{int(n(t["pts"]))}:{int(n(o["pts"]))}', 'min': z['min'],
                          'pkt': int(n(z['pts'])), 'fg': [int(n(z['fgm'])), int(n(z['fga']))], 'ft': [int(n(z['ftm'])), int(n(z['fta']))],
                          'zba': int(n(z['oreb'])), 'zbo': int(n(z['dreb'])), 'as': int(n(z['ast'])), 'prz': int(n(z['stl'])),
                          'bl': int(n(z['blk'])), 'str': int(n(z['to'])), 'f': int(n(z['pf'])), 'pm': int(n(z.get('pm'))), 'gmsc': r1(gmsc(z))})
        wys_b = []
        for p in sorted((p for p in pls.values() if p['druzyna'] == B and wysoki(p['zawodnik'], p)), key=lambda p: -p['min_g']):
            wys_b.append({'zawodnik': p['zawodnik'], 'pozycja': pos_of(p['zawodnik']), 'wzrost': p.get('wzrost'), 'g': p['g'],
                          'min': r1(p['min_g']), 'pkt40': r1(p['p40']['pts']), 'zb40': r1(p['p40']['reb']), 'zba40': r1(p['p40']['oreb']),
                          'bl40': r1(p['p40']['blk']), 'f40': r1(p['p40']['pf']), 'ts': r1(p['ts']), 'usg': r1(p['usg'])})
        przeciw = []
        for t, o in team_games.get(B, []):
            for z in zw:
                if z['mecz_id'] != t['mecz_id'] or z['druzyna'] != o['druzyna'] or not wysoki(z['zawodnik'], pls.get(z['zawodnik'], {})):
                    continue
                m = mins(z['min'])
                if m < 10:
                    continue
                rest = [x for x in pls[z['zawodnik']]['mecze'] if x[0]['mecz_id'] != z['mecz_id']]
                rm = sum(mins(x[0]['min']) for x in rest)
                przeciw.append({'data': t['data'], 'druzyna': z['druzyna'], 'zawodnik': z['zawodnik'], 'pozycja': pos_of(z['zawodnik']),
                                'wzrost': z.get('wzrost'), 'min': round(m), 'pkt': int(n(z['pts'])), 'zba': int(n(z['oreb'])),
                                'zbo': int(n(z['dreb'])), 'pkt40': r1(40 * n(z['pts']) / m), 'zb40': r1(40 * (n(z['oreb']) + n(z['dreb'])) / m),
                                'pkt40_inne': r1(40 * sum(n(x[0]['pts']) for x in rest) / rm) if rm else None,
                                'zb40_inne': r1(40 * sum(n(x[0]['oreb']) + n(x[0]['dreb']) for x in rest) / rm) if rm else None})
        przeciw.sort(key=lambda r: -(r['wzrost'] or 0))
        D['ja'] = {'zawodnik': name, 'nr': me.get('nr'), 'pozycja': poz, 'wzrost': me.get('wzrost'),
                   'ocena': num(r_all.get('ocena')), 'miejsce': r_all.get('miejsce'), 'miejsce_poz': r_pos.get('miejsce'),
                   'liczba_poz': sum(1 for p in R['players'] if p['pozycja'] == poz),
                   'on': num(r_all.get('on')), 'onoff': num(r_all.get('onoff')), 'pie': num(r_all.get('pie')),
                   'grupa_poz': len(same), 'grupa_druz': len(team), 'miary': rows, 'mecze': mecze,
                   'wysocy_rywala': wys_b, 'wysocy_przeciw_rywalowi': przeciw,
                   'wysocy_nie_grali': [r for r in D['nie_grali'] if (r['wzrost'] or 0) >= WYSOKI_OD_CM]}
    return D


# ---------- markdown ----------

def table(head, rows):
    out = ['| ' + ' | '.join(head) + ' |', '|' + '|'.join('---' for _ in head) + '|']
    out += ['| ' + ' | '.join('-' if c is None else str(c) for c in r) + ' |' for r in rows]
    return '\n'.join(out)


def markdown(D):
    A, B = D['druzyna'], D['rywal']
    L = []
    w = L.append
    w(f'# Scouting: {A} – {B}')
    m = D.get('mecz')
    if m:
        w(f'Mecz: {m["data"]} {m.get("godz") or ""}, kolejka {m.get("kolejka")}.')
    w(f'Protokoły {D["protokoly_od"]} – {D["protokoly_do"]} ({D["mecze_ligi"]} meczów ligi). Próba: {A} {D["g"][A]}, {B} {D["g"][B]} mecz(e).')

    w('\n## 1. Porównanie na tle ligi (miejsce w nawiasie, 1 = najlepiej; tempo i udział trójek: 1 = najwięcej)')
    c = lambda x: '-' if not x else f'{f1(x["v"])} ({x["m"]}.)'
    w(table(['Miara', A, B, 'Liga'], [[r['label'], c(r['a']), c(r['b']), f1(r['liga'])] for r in D['porownanie']]))
    ra, rb = D['ranking'][A], D['ranking'][B]
    w(f'\nRanking: {A} {ra["miejsce"]}. ({ra["bilans"]}), {B} {rb["miejsce"]}. ({rb["bilans"]}). '
      f'Szansa wygranej {A} wg modelu strony: {f1(D["szansa"], 0)}%.')
    w('\nCztery czynniki (atak przeciw obronie):')
    w(table(['Czynnik', f'{A} atak', f'{B} pozwala', f'{B} atak', f'{A} pozwala', 'Liga'],
            [[r['czynnik'], f1(r['atak_a']), f1(r['obrona_b']), f1(r['atak_b']), f1(r['obrona_a']), f1(r['liga'])] for r in D['czynniki']]))

    w('\n## 2. Mecze')
    for d in (A, B):
        w(f'\n**{d}**')
        w(table(['Kol.', 'Data', 'Rywal (miejsce, NetRtg)', 'Wynik', 'Tempo', 'Atak', 'Obrona', 'Najwięcej pkt'],
                [[g['kolejka'], g['data'], f'{g["rywal"]} ({g["rywal_miejsce"]}., {g["rywal_net"]})', f'{g["pkt"]}:{g["pkt_rywala"]}',
                  f1(g['tempo']), f1(g['atak']), f1(g['obrona']), ', '.join(f'{x[0].split()[-1]} {x[1]}' for x in g['najwiecej'])]
                 for g in D['mecze'][d]]))

    w('\n## 3. Wspólni rywale')
    for g in D['bezposrednie']:
        w(f'Mecz bezpośredni {g["data"]}: {g["pkt"]}:{g["pkt_rywala"]}.')
    if not D['wspolni']:
        w('Brak wspólnych rywali.')
    for C in D['wspolni']:
        w(f'\n### {C["rywal"]}')
        w(table(['Drużyna', 'Data', 'Wynik', 'Na 100 pos.', 'Tempo', 'eFG%', f'eFG% {C["rywal"]}', 'Straty/100', f'Straty/100 {C["rywal"]}',
                 'Zb. atak %', 'Zb. obrona %', 'Wolne/100 FGA', f'Wolne/100 FGA {C["rywal"]}'],
                [[x['druzyna'], x['data'], f'{x["pkt"]}:{x["pkt_rywala"]}', sgn(x['net']), f1(x['tempo']), f1(x['efg']), f1(x['efg_c']),
                  f1(x['tov']), f1(x['tov_c']), f1(x['orb']), f1(x['drb']), f1(x['ftr']), f1(x['ftr_c'])] for x in C['mecze']]))
        w(f'Przewaga {A}: {sgn(C["roznica"])} na 100 posiadań.')
        cell = lambda v: 'nie grał' if not v else f'{v["min"]} min, {v["pkt"]} pkt, {v["zb"]} zb'
        w(table(['Zawodnik', 'Pozycja', 'Wzrost', f'vs {A}', f'vs {B}'],
                [[s['zawodnik'], s['pozycja'], s['wzrost'], cell(s['a']), cell(s['b'])] for s in C['sklad']]))
    if D.get('szacunek'):
        s = D['szacunek']
        w(f'\nSzacunek ze wspólnych rywali ({s["rywali"]}): {sgn(s["na100"])} na 100 posiadań, przy tempie {f1(s["tempo"])} około {sgn(s["pkt"], 0)} pkt.')

    for d in (B, A):
        w(f'\n## Zawodnicy: {d}')
        w(table(['Zawodnik', 'Poz.', 'Wzrost', 'M (w 5)', 'Min', 'Pkt', '% pkt', 'Zb', 'As', 'Prz', 'Bl', 'Str', 'F', 'Z gry', 'Za 3', 'Wolne',
                 'TS%', 'Udział %', '+/-', 'Ocena (miejsce)'],
                [[f'{p["zawodnik"]} #{p["nr"] if p["nr"] is not None else "-"}', p['pozycja'], p['wzrost'], f'{p["g"]} ({p["s5"]})',
                  f1(p['min']), f1(p['pkt']), p['udzial_pkt'], f1(p['zb']), f1(p['as']), f1(p['prz']), f1(p['bl']), f1(p['str']), f1(p['f']),
                  '/'.join(map(str, p['fg'])), '/'.join(map(str, p['tp'])), '/'.join(map(str, p['ft'])), f1(p['ts']), f1(p['usg']), sgn(p['pm']),
                  f'{f1(p["ocena"])} ({p["miejsce"]}.)' if p['ocena'] is not None else 'poniżej 15 min'] for p in D['zawodnicy'][d]]))
        for r in D['rotacja'][d]:
            w(f'- {r["data"]} vs {r["rywal"]}: {r["zawodnikow"]} zawodników, trzech najdłużej grających {r["top3_min"]} z 120 min; '
              f'pierwsza piątka: {", ".join(x.split()[-1] for x in r["piatka"])}')
    if D['nie_grali']:
        w('\nBez minut w protokołach: ' + ', '.join(f'{r["zawodnik"]} ({r["wzrost"] or "-"} cm, {r["pozycja"] or "-"})' for r in D['nie_grali']))

    J = D.get('ja')
    if J:
        w(f'\n## Raport indywidualny: {J["zawodnik"]} (#{J["nr"]}, {J["pozycja"]}, {J["wzrost"]} cm)')
        w(f'Ocena {f1(J["ocena"])}: {J["miejsce"]}. z {D["liczba_graczy"]}, {J["miejsce_poz"]}. z {J["liczba_poz"]} w rankingu pozycji '
          f'(wlicza zawodników z tą pozycją jako drugą). Z nim na boisku {sgn(J["on"])}, z nim – bez niego {sgn(J["onoff"])}, PIE {f1(J["pie"])}.')
        w(table(['Miara', 'On', f'Średnia: {J["pozycja"]} ({J["grupa_poz"]})', 'Miejsce', f'Średnia {A} ({J["grupa_druz"]})', 'Miejsce'],
                [[r['label'], f1(r['v']), f1(r['poz_avg']), r['poz_m'], f1(r['druz_avg']), r['druz_m']] for r in J['miary']]))
        w(table(['Data', 'Rywal', 'Wynik', 'Min', 'Pkt', 'Z gry', 'Wolne', 'Zb A+O', 'As', 'Prz', 'Bl', 'Str', 'F', '+/-', 'GmSc'],
                [[g['data'], g['rywal'], g['wynik'], g['min'], g['pkt'], '/'.join(map(str, g['fg'])), '/'.join(map(str, g['ft'])),
                  f'{g["zba"]}+{g["zbo"]}', g['as'], g['prz'], g['bl'], g['str'], g['f'], sgn(g['pm'], 0), f1(g['gmsc'])] for g in J['mecze']]))
        w(f'\nWysocy {B}:')
        w(table(['Zawodnik', 'Poz.', 'Wzrost', 'M', 'Min', 'Pkt/40', 'Zb/40', 'Zb atak/40', 'Bl/40', 'F/40', 'TS%', 'Udział %'],
                [[x['zawodnik'], x['pozycja'], x['wzrost'], x['g'], f1(x['min']), f1(x['pkt40']), f1(x['zb40']), f1(x['zba40']), f1(x['bl40']),
                  f1(x['f40']), f1(x['ts']), f1(x['usg'])] for x in J['wysocy_rywala']]))
        if J['wysocy_nie_grali']:
            w('Nie grali jeszcze: ' + ', '.join(f'{r["zawodnik"]} ({r["wzrost"]} cm)' for r in J['wysocy_nie_grali']))
        w(f'\nWysocy rywali przeciw {B} (min. 10 minut):')
        w(table(['Data', 'Drużyna', 'Zawodnik', 'Wzrost', 'Min', 'Pkt', 'Zb A+O', 'Pkt/40', 'Pkt/40 inne', 'Zb/40', 'Zb/40 inne'],
                [[x['data'], x['druzyna'], x['zawodnik'], x['wzrost'], x['min'], x['pkt'], f'{x["zba"]}+{x["zbo"]}', f1(x['pkt40']),
                  f1(x['pkt40_inne']), f1(x['zb40']), f1(x['zb40_inne'])] for x in J['wysocy_przeciw_rywalowi']]))
    return '\n'.join(L) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--druzyna', default='QUANTUM HOOP')
    ap.add_argument('--rywal')
    ap.add_argument('--nr', default='14', help='numer zawodnika do raportu indywidualnego')
    ap.add_argument('--zawodnik', help='zamiast numeru: imię i nazwisko')
    ap.add_argument('--out', help='raport w markdown (domyślnie na ekran)')
    ap.add_argument('--json', help='dane raportu w JSON')
    ap.add_argument('--html', help='strona raportu (szablon scripts/scouting_template.html)')
    ap.add_argument('--notes', help='JSON z interpretacją: lead, wnioski, klucze, cele, uwagi')
    a = ap.parse_args()

    term = load('terminarz.json', {}).get('mecze', [])
    druzyny = [d['druzyna'] for d in load('druzyny.json', [])]
    A = a.druzyna
    if A not in druzyny:
        sys.exit(f'Nie ma drużyny {A}')
    nastepny = None
    if a.rywal:
        B = a.rywal
        nastepny = next((m for m in term if {m['gosp'], m['gosc']} == {A, B} and not m.get('wynik')), None)
    else:
        dzis = date.today().isoformat()
        przyszle = sorted((m for m in term if A in (m['gosp'], m['gosc']) and not m.get('wynik') and m['data'] >= dzis),
                          key=lambda m: (m['data'], m.get('godz') or ''))
        if not przyszle:
            sys.exit('Brak zaplanowanego meczu w terminarzu – podaj --rywal')
        nastepny = przyszle[0]
        B = nastepny['gosc'] if nastepny['gosp'] == A else nastepny['gosp']
    if B not in druzyny:
        sys.exit(f'Nie ma drużyny {B}')

    D = build(A, B, nastepny, nr=None if a.zawodnik else a.nr, zawodnik=a.zawodnik)
    txt = markdown(D)
    if a.out:
        Path(a.out).write_text(txt, encoding='utf-8')
        print(f'Zapisano {a.out}')
    elif not a.html:
        print(txt)
    if a.json:
        Path(a.json).write_text(json.dumps(D, ensure_ascii=False, indent=1), encoding='utf-8')
    if a.html:
        D['notatki'] = json.loads(Path(a.notes).read_text(encoding='utf-8')) if a.notes else {}
        tpl = (ROOT / 'scripts' / 'scouting_template.html').read_text(encoding='utf-8')
        data = json.dumps(D, ensure_ascii=False).replace('</', '<\\/')
        Path(a.html).write_text(tpl.replace('__DATA__', data).replace('__TYTUL__', f'Scouting: {B}'), encoding='utf-8')
        print(f'Zapisano {a.html}')


if __name__ == '__main__':
    main()
