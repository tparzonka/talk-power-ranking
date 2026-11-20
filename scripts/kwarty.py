"""Wyniki po kwartach z zapisanych protokołów (input/protokoly) do data/kwarty.json.
Dopisuje nowe mecze i nadpisuje zmienione; mecze bez pliku zostają, więc plik działa też po odtworzeniu projektu z paczki."""
import email, json, os, re
from email import policy
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'input', 'protokoly')
OUT = os.path.join(ROOT, 'data', 'kwarty.json')
data = json.load(open(OUT)) if os.path.exists(OUT) else {}
new = 0
# Ręczne poprawki (zgoda Tomka): mecz -> (błędne kwarty z protokołu, poprawione). Działa tylko, gdy protokół dalej ma błędną wersję.
# 236976: kwarty SMAKOSZY sumują się do 86, wynik meczu 85 -> 4. kwarta 19 -> 18.
POPRAWKI = {'236976': ([[10, 20], [10, 24], [11, 23], [6, 19]], [[10, 20], [10, 24], [11, 23], [6, 18]])}
if os.path.isdir(SRC):
    for fn in sorted(os.listdir(SRC)):
        b = open(os.path.join(SRC, fn), 'rb').read()
        h = None
        if b'MIME-Version' in b[:2000] or fn.endswith('.mht'):
            try:
                m = email.message_from_bytes(b, policy=policy.default)
                h = [x.get_content() for x in m.walk() if x.get_content_type() == 'text/html'][0]
            except Exception:
                h = None
        if h is None:
            h = b.decode('utf-8', 'ignore')
        mid = re.search(r'/mecz/(\d+)/', h)
        q = re.search(r'\((\d+\s*:\s*\d+(?:,\s*\d+\s*:\s*\d+){3,})\)', h)
        if not (mid and q):
            continue
        val = [list(map(int, x.split(':'))) for x in re.split(r',\s*', q.group(1).replace(' ', ''))]
        zle, dobre = POPRAWKI.get(mid.group(1), (None, None))
        if val == zle:
            val = dobre
        if data.get(mid.group(1)) != val:
            data[mid.group(1)] = val
            new += 1
# zostają tylko mecze z bazy, których suma kwart zgadza się z wynikiem (dane publiczne: same ID meczów i liczby)
pts = {}
md_path = os.path.join(ROOT, 'data', 'mecze_druzyn.json')
for r in (json.load(open(md_path)) if os.path.exists(md_path) else []):
    pts.setdefault(str(r['mecz_id']), []).append(int(r['pts']))
skip = [m for m, v in data.items() if m not in pts or sorted([sum(x[0] for x in v), sum(x[1] for x in v)]) != sorted(pts[m])]
for m in skip:
    del data[m]
json.dump(data, open(OUT, 'w'), separators=(',', ':'), sort_keys=True)
print(f'Kwarty: {len(data)} meczów ({new} nowych lub zmienionych)' + (f'; pominięte (brak meczu w bazie albo suma ≠ wynik): {", ".join(skip)}' if skip else ''))
