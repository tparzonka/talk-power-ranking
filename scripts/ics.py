#!/usr/bin/env python3
"""Kalendarz meczów QUANTUM HOOP (dist/quantum-hoop.ics) z data/terminarz.json.

Tylko mecze bez wyniku. Mecz wpisany na 31.12 (bez godziny) = przełożony, termin nieznany:
całodniowe wydarzenie „TBD TALK: vs …”. UID zależy od ID meczu, więc ponowny import
pliku do kalendarza aktualizuje wydarzenia zamiast je dublować.
"""
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEAM = 'QUANTUM HOOP'
PLACE = 'Hala sportowa Zespołu Szkół Przemysłu Spożywczego, ul. Grunwaldzka 33a, 87-100 Toruń'
MAPS = 'https://www.google.com/maps/place//data=!4m2!3m1!1s0x47033457d1e9ce81:0xa9b5423d843a0ac2'
LEN = timedelta(minutes=75)  # slot meczowy w hali: 19:30 i 20:45


def esc(s):
    return s.replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\n', '\\n')


def fold_lines(line):
    """RFC 5545: linie do 75 oktetów, kontynuacja zaczyna się spacją."""
    parts, cur = [], ''
    for ch in line:
        if len((cur + ch).encode('utf-8')) > (75 if not parts else 74):
            parts.append(cur)
            cur = ch
        else:
            cur += ch
    parts.append(cur)
    return '\r\n '.join(parts)


def main():
    data = json.loads((ROOT / 'data' / 'terminarz.json').read_text(encoding='utf-8'))
    games = [g for g in data['mecze'] if TEAM in (g['gosp'], g['gosc']) and not g['wynik']]
    games.sort(key=lambda g: (g['data'], g['godz'] or '99'))
    now = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Power Ranking TALK//QUANTUM HOOP//PL', 'CALSCALE:GREGORIAN',
         'METHOD:PUBLISH', 'X-WR-CALNAME:TALK – QUANTUM HOOP', 'X-WR-TIMEZONE:Europe/Warsaw',
         'BEGIN:VTIMEZONE', 'TZID:Europe/Warsaw',
         'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000',
         'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
         'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000',
         'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE']
    for g in games:
        rival = g['gosc'] if g['gosp'] == TEAM else g['gosp']
        tbd = not g['godz']
        L += ['BEGIN:VEVENT', f'UID:talk-{g["mecz_id"]}@quantum-hoop', f'DTSTAMP:{now}']
        if tbd:
            d = date.fromisoformat(g['data'])
            L += [f'DTSTART;VALUE=DATE:{d:%Y%m%d}', f'DTEND;VALUE=DATE:{d + timedelta(days=1):%Y%m%d}']
            title = f'TBD TALK: vs {rival}'
            desc = f'{g["kolejka"]}. kolejka. Mecz przełożony, termin do ustalenia (data 31.12 to wpis zastępczy).'
        else:
            s = datetime.fromisoformat(f'{g["data"]}T{g["godz"]}:00')
            L += [f'DTSTART;TZID=Europe/Warsaw:{s:%Y%m%dT%H%M%S}', f'DTEND;TZID=Europe/Warsaw:{s + LEN:%Y%m%dT%H%M%S}']
            title = f'TALK: vs {rival}'
            desc = f'{g["kolejka"]}. kolejka: {g["gosp"]} – {g["gosc"]}.'
        L += [f'SUMMARY:{esc(title)}', f'LOCATION:{esc(PLACE)}', f'DESCRIPTION:{esc(desc + chr(10) + "Mapa: " + MAPS)}',
              f'URL:{g["url"]}' if g.get('url') else 'X-NOURL:1', 'STATUS:TENTATIVE' if tbd else 'STATUS:CONFIRMED', 'END:VEVENT']
    L.append('END:VCALENDAR')
    L = [x for x in L if x != 'X-NOURL:1']
    out = ROOT / 'dist' / 'quantum-hoop.ics'
    out.write_bytes(('\r\n'.join(fold_lines(x) for x in L) + '\r\n').encode('utf-8'))
    print(f'Kalendarz: {len(games)} meczów -> {out.name}')


if __name__ == '__main__':
    main()
