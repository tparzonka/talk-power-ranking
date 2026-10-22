#!/usr/bin/env python3
"""Buduje dist/ranking-publiczny.html z src/template.html, src/ranking.js i data/*.json."""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    # zawodnicy.json i wiek.json zawierają nazwiska – są tylko lokalnie (w .gitignore); bez nich strona ma same drużyny
    def load(k, empty):
        f = ROOT / 'data' / f'{k}.json'
        return json.loads(f.read_text(encoding='utf-8')) if f.exists() else empty
    data = {'mecze_druzyn': load('mecze_druzyn', []), 'druzyny': load('druzyny', []),
            'zawodnicy': load('zawodnicy', []), 'wiek': load('wiek', {})}
    term = ROOT / 'data' / 'terminarz.json'
    data['terminarz'] = json.loads(term.read_text(encoding='utf-8')) if term.exists() else {'stan': '', 'mecze': []}
    ranking = (ROOT / 'src' / 'ranking.js').read_text(encoding='utf-8')
    ranking = ranking.split("if (typeof module !== 'undefined')")[0].rstrip()
    page = (ROOT / 'src' / 'template.html').read_text(encoding='utf-8')
    assert '__DATA__' in page and '/*__RANKING_JS__*/' in page, 'Brak znaczników w szablonie'
    page = page.replace('__DATA__', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    page = page.replace('/*__RANKING_JS__*/', ranking)
    version = (ROOT / 'VERSION').read_text(encoding='utf-8').strip() if (ROOT / 'VERSION').exists() else ''
    page = page.replace('__VERSION__', version)
    # favicon (piłka, domena publiczna, openclipart.org) wklejona jako data URI
    fav = ROOT / 'assets' / 'favicon.svg'
    page = page.replace('__FAVICON__', 'data:image/svg+xml;base64,' + base64.b64encode(fav.read_bytes()).decode() if fav.exists() else '')
    out = ROOT / 'dist' / 'ranking-publiczny.html'
    out.parent.mkdir(exist_ok=True)
    out.write_text(page, encoding='utf-8')
    print(f'Zapisano {out.relative_to(ROOT)} ({len(page.encode()):,} B)')


if __name__ == '__main__':
    main()
