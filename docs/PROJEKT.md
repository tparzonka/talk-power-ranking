# Power Ranking ligi – wersja 1.0.2

Dokumentacja robocza po polsku (metodologia, import, historia zmian, plan). Opis repozytorium po angielsku: [README.md](../README.md).

Ranking drużyn i zawodników amatorskiej ligi koszykówki w Toruniu (sezon 2026/27), liczony wyłącznie z protokołów meczów i składów z systemu ligi.

Wynikiem jest jeden samodzielny plik HTML (`dist/ranking-publiczny.html`) z danymi wpisanymi na stałe. Otwiera się w przeglądarce bez serwera i bez logowania.

## Struktura

```
data/
  mecze_druzyn.json   sumy drużyn z protokołów, jeden wiersz na drużynę na mecz
  zawodnicy.json      linijki zawodników z protokołów – TYLKO LOKALNIE (.gitignore)
  druzyny.json        lista drużyn (pole uwagi nieużywane – uwagi usunięte ze strony)
  numery.json         ręczne poprawki numerów zawodników – TYLKO LOKALNIE
  wyjatki.json        ręczne wyjątki pozycji i błędnych danych – TYLKO LOKALNIE
  terminarz.json      terminarz z systemu ligi, podmieniany w całości przy każdym imporcie
  sklady.txt          składy z systemu ligi z datami urodzenia – TYLKO LOKALNIE (.gitignore)
  wiek.json           kategorie wiekowe do nagród (U23 / 45+) – TYLKO LOKALNIE
  korekty.json        ręczne poprawki protokołów – TYLKO LOKALNIE
input/                surowe strony z systemu ligi – TYLKO LOKALNIE (.gitignore)
src/
  ranking.js          logika rankingu (czyste funkcje rankTeams i rankPlayers)
  template.html       strona: wygląd, tabele, widoki, sortowanie, objaśnienia
scripts/
  import_round.py     wczytuje input/kolejka-NN.txt do data/ i sprawdza sumy
  build.py            składa dist/ranking-publiczny.html
  test.mjs            liczy rankingi z danych i wypisuje czołówkę
dist/
  ranking-publiczny.html
```

## Szybki start

```bash
python3 scripts/build.py      # buduje dist/ranking-publiczny.html
node scripts/test.mjs         # sprawdza, że rankingi się liczą
```

Potrzebne: Python 3.9+ i Node 18+. Bez zewnętrznych bibliotek.

## Dodawanie kolejki

Źródło: zapisane strony protokołów z systemu ligi (Ctrl+S, „tylko HTML”).

```bash
bash scripts/runda.sh plik1.html plik2.html ...
```

- Każdy mecz ma ID z adresu strony (`/mecz/NNN/`). Ten sam mecz drugi raz: `BEZ ZMIAN` (nic nie zapisuje) albo `NADPISANY` (gdy liga poprawiła protokół). Duplikatów nie ma.
- Protokół ląduje w `input/protokoly/NNN-druzyna-a-druzyna-b.html`.
- Na końcu skrypt wypisuje stan bazy: ile meczów każdej kolejki jest wczytanych i których drużyn brakuje.
- `uwaga: X nie ma w data/sklady.txt` oznacza nowego zawodnika: potrzebny aktualny skład z systemu ligi.
- Skrypt buduje stronę i paczkę `projekt.txt` (tar.xz w base64, bez dat urodzenia), którą publikuje się razem ze stroną, żeby projekt dało się odtworzyć w nowej rozmowie.

Starszy import z pliku tekstowego (`scripts/import_round.py`) zostaje na wszelki wypadek.

### Format pliku kolejki

```
kolejka: 2
== DRUŻYNA A | DRUŻYNA B
SUMA DRUŻYNA A;pkt;2P c/w;3P c/w;FT c/w;zb.atak;zb.obrona;asysty;faule;straty;przechwyty;bloki
Imię Nazwisko;mm:ss;pkt;2P c/w;3P c/w;FT c/w;zb.atak;zb.obrona;asysty;faule;faule wymuszone;straty;przechwyty;bloki;eval;+/-
...
SUMA DRUŻYNA B;...
...
```

- Linia `SUMA` to wiersz „Suma” z protokołu. Zawiera zbiórki i straty drużynowe, więc może być wyższa od sumy zawodników.
- Puste pole w protokole to 0. Zawodników z 0:00 minut pomijamy.
- Import przerywa pracę, gdy punkty zawodnika nie zgadzają się z rzutami albo sumy zawodników nie zgadzają się z linią `SUMA`.
- Ponowny import tej samej kolejki nadpisuje jej mecze.

## Metodologia

**Drużyny (widok Ranking).** Kolejność według NetRtg, przy remisie decyduje różnica punktów na mecz.
- Posiadania = FGA + 0,44 × FTA − ORB + TOV, średnia obu drużyn w meczu.
- ORtg i DRtg to punkty zdobyte i stracone na 100 posiadań, NetRtg to ich różnica.
- Drużyny bez meczu są na końcu tabeli, bez miejsca.

**Zawodnicy (widok Ranking).** Tylko zawodnicy ze średnio co najmniej 15 minutami na mecz. Ocena = 50 + 10 × suma ważona składników przeliczonych na odchylenia od średniej ligi:

| Składnik | Waga | Zakres | Co liczy |
|---|---|---|---|
| Wpływ na wygrywanie | 40% | ostatnie 5 meczów | średnia z: NetRtg na boisku, różnica z nim / bez niego, bilans drużyny |
| Skuteczność przy obciążeniu | 25% | ostatnie 5 meczów | (TS % − średnie TS % ligi) × USG % / 20 |
| Wszechstronność | 20% | sezon | PIE, średnio na mecz |
| Siła rywali | 15% | sezon | średni NetRtg rywali |

**Zakres danych.** Przełącznik na stronie: cały sezon albo ostatnie 5 meczów każdej drużyny i zawodnika (`opts.okno` w `rankTeams` i `rankPlayers`, funkcja `lastGames`). Strona jest w jednym ciemnym motywie w barwach logo TALK (logo w `assets/logo.webp`, wklejone do szablonu jako data URI).

**Korekta +/-.** Suma +/- drużyny powinna wynosić 5 × różnica punktów; w protokołach się nie zgadza. Różnica jest rozdzielana na zawodników proporcjonalnie do minut, a baza „bez zawodnika” to prawdziwa różnica punktów. NetRtg na boisku i różnica z nim / bez niego są ściągane do 0 z wagą akcje / (akcje + 60) (stała `SHRINK` w `src/ranking.js`).

- NetRtg na boisku = +/- zawodnika na szacowaną liczbę posiadań na boisku (posiadania meczu × minuty / 40).
- Bez zawodnika = (+/- drużyny − +/- zawodnika) na posiadania poza boiskiem. +/- drużyny to suma +/- jej zawodników / 5, bo +/- w protokołach ligi nie sumuje się dokładnie do wyników meczów. Liczone tylko, gdy zawodnik siedział na ławce co najmniej 15 posiadań.
- PIE = (PTS + FGM + FTM − FGA − FTA + DRB + 0,5 × ORB + AST + STL + 0,5 × BLK − PF − TOV) zawodnika / to samo dla obu drużyn razem.
- TS % = PTS / (2 × (FGA + 0,44 × FTA)). USG % = 100 × (FGA + 0,44 × FTA + TOV) × 40 / (MP × (FGA + 0,44 × FTA + TOV) drużyny).
- Miejsce jest liczone w obrębie pozycji, w całej lidze. Filtr drużyny nie zmienia miejsc.

**Widoki Statystyki.** Średnie na mecz, procenty z sum sezonu. U zawodników wszyscy, którzy wyszli na boisko.

**Pozycje.** Jedna na zawodnika: pierwsza wpisana w systemie ligi. Bez pozycji w systemie: według wzrostu, pozycja o najbliższej średniej wzrostu w lidze (`positionByHeight` w `src/ranking.js`, średnie liczone z zawodników mających pozycję; przy mniej niż 3 na pozycji stałe progi 183/189/194/199 cm). Bez pozycji i wzrostu: tylko w „Wszyscy”. Ręczne wyjątki od tej reguły są w lokalnym `data/wyjatki.json` (`pozycje`; `bledne_dane` = błędny wzrost lub rocznik w systemie ligi).

**Nie liczymy.** Gry w końcówkach (protokoły nie mają przebiegu meczu), BPM (wymaga regresji na dużej bazie), GS (protokoły nie podają pierwszej piątki). SRS drużyn można dodać, gdy drużyny będą miały wspólnych rywali.

## Publikacja

Strona publiczna: https://claude.ai/artifact/XjkJB9hGr284QLAtPpMoKa (udostępniona przez link).
Wersja Dashboard: https://claude.ai/artifact/X7F82xCboEjkZ6vGPuSHH7 (wymaga logowania, nieaktualizowana).

`dist/ranking-publiczny.html` jest samodzielny, więc można go też wystawić na dowolnym hostingu statycznym, np. GitHub Pages.

## Widoki statystyk
- **Drużyny → Statystyki:** przełącznik Drużyna / Rywale (statystyki przeciwników z tych samych meczów) / Cztery czynniki (eFG%, TOV%, ORB%, FT/FGA w ataku i obronie, liczone z sum; kolor względem średniej ligi, wiersz „Średnia ligi” pod tabelą).
- **Drużyny → Tabela:** tradycyjna tabela ligi z całego sezonu (`leagueTable` w `src/ranking.js`), 2 pkt za zwycięstwo, 1 za porażkę, remis punktowy: mecze bezpośrednie, potem różnica. Kolumna Forma jak na Flashscore: „?” = następny mecz z terminarza (z szansą wygranej od 4. kolejki), potem do 5 ostatnich wyników od najnowszego; najechanie / dotknięcie kafelka pokazuje mecz i podświetla obie drużyny w tabeli.
- **Zawodnicy → Statystyki:** przełącznik Na mecz / Na 40 minut (tylko grający średnio co najmniej 15 minut).
- **Zawodnicy:** wyszukiwarka po nazwisku (bez polskich znaków i wielkości liter).
- **Karta zawodnika:** klik w nazwisko (tabele zawodników, nagrody, najlepszy występ kolejki) otwiera okno z podsumowaniem całego sezonu (ocena i miejsce w rankingu, mecze, minuty, punkty, zbiórki, asysty) i listą mecz po meczu; mecze drużyny bez udziału zawodnika jako „nie grał”. Na telefonie wysuwa się od dołu.
- **Drużyny → Ranking → Miejsce po kolejkach:** wykres miejsca w rankingu (cały sezon do danej kolejki) dla wszystkich drużyn; pokazuje się sam od 4. kolejki (`PRZEBIEG_OD_KOLEJKI` w `src/template.html`). Drużyna wybrana w filtrze, najechana albo dotknięta jest wyróżniona, pod wykresem jej miejsca liczbowo.
- **Mecze + terminarz:** kolejki z protokołów i z terminarza (`data/terminarz.json`). Domyślnie bieżąca kolejka wg daty w przeglądarce (ostatnia, która już się zaczęła); po wyborze drużyny cały jej sezon. Zaplanowane mecze z dniem i godziną, „Pauzuje: …”, mecze z wynikiem w terminarzu bez protokołu linkują do strony meczu, mecze po terminie bez wyniku „wynik wkrótce”. Pod listą data stanu terminarza.
- **Zapowiedź (szansa wygranej):** od 4. kolejki (`ZAPOWIEDZ_OD_KOLEJKI` w `src/ranking.js`) przy zaplanowanych meczach. `winChance`: oczekiwana różnica = (NetRtg A − NetRtg B) / 100 × średnie tempo ligi, NetRtg × g/(g+3), rozkład normalny σ = 15 pkt (`WIN_SIGMA` – sprawdzić po kilku kolejkach na prawdziwych wynikach), bez przewagi gospodarza. Po wejściu SRS można liczyć z SRS.
- **Karta zawodnika:** także „Następny mecz” z terminarza i link do protokołu przy każdym meczu; na telefonie zamykana przeciągnięciem w dół.

## Terminarz
- Import: `bash scripts/runda.sh <plik terminarza>` (można razem z protokołami; skrypt rozpoznaje terminarz po tabeli `.timetable`). `scripts/terminarz.py` przy każdym imporcie PODMIENIA cały `data/terminarz.json` (terminarz się zmienia) i wypisuje zmiany: nowe/usunięte mecze, przełożone (zmiana daty), nowe wyniki.
- Wyniki do rankingu dalej wyłącznie z protokołów; terminarz tylko do wyświetlania meczów.

## Wersje
Numer wersji w pliku `VERSION` (pokazywany w stopce strony). Drobne poprawki i nowe dane: 1.0.x; nowe funkcje: 1.x; nowy sezon albo play-off z innymi zasadami: 2.0.

### 1.0.2 – 21.10.2026
- Nagrody wzorem NBA: zamiast jednej „Piątki sezonu” są Pierwsza piątka sezonu (najwyższa ocena na każdej pozycji), Druga piątka sezonu (druga ocena na każdej pozycji) i Piątka obrońców sezonu (najwyższa ocena obrońcy na każdej pozycji, ta sama miara co Obrońca sezonu).
- Favicon: piłka do koszykówki (`assets/favicon.svg`, domena publiczna z openclipart.org), wklejana do strony przez `scripts/build.py`.
- Pozycja zawodnika bez pozycji w systemie ligi liczona ze średnich wzrostu pozycji w lidze (zamiast stałych progów); przelicza się sama, gdy liga dodaje zawodników.

### 1.0.1 – 19.10.2026
- Numer zawodnika (`#14`) pod nazwiskiem w rankingu, statystykach, kolejce i na karcie zawodnika. Źródło: kolumna NR w protokole (`nr` w `data/zawodnicy.json`). Numer 0 lub pusty = brak numeru w systemie ligi (w wielu drużynach kilku zawodników ma 0), wtedy nic się nie pokazuje. Błędne numery poprawia ręcznie `data/numery.json` (np. zawodnik wpisany w systemie z innym numerem niż faktyczny); import zawsze stosuje tę poprawkę.

- Tabela ligi: znaczniki stref przy miejscu (play-off 1–8, miejsca 9–12, miejsca 13–15 wg systemu rozgrywek TALK), kreski między strefami przy sortowaniu po miejscu i legenda pod tabelą. Strefy są stałymi `ZONES` w `src/template.html`.

- Porządki w wyglądzie (przegląd pod kątem wzorców typowych dla stron z AI): bez ozdobnika z gwiazdkami nad tytułem i bez trzeciej czcionki (Graduate); podtytuły i etykiety zwykłą czcionką, bez pomarańczowych wersalików z rozstrzeleniem; kropka „·” zostaje tylko w podpisie zawodnika („QUANTUM HOOP · środkowy #14”), gdzie jest czytelna; brak danych jako „-”, bilans „2-0”, punkty „170:131” (kolumna „Zdob - Str” w Tabeli); ruch po audycie (skille emilkowalski-motion i find-animation-opportunities): wiersze wjeżdżają po zmianie zakresu/nagrody/sortowania (max. 12 wierszy, 18 ms odstępu, nie przy pisaniu w wyszukiwarce), zasady rozwijają się płynnie, karta i tło wygaszają się krzywą ease-out, przy „ogranicz ruch” zostaje samo pojawienie się; drobny tekst w kolorze `--dim` (kontrast WCAG AA); jedno zaokrąglenie 4px (karta 8px); przyciski na telefonie min. 44px; mecz przełożony (31.12 bez godziny w systemie ligi) pokazywany jako „Termin do ustalenia”.

### 1.0 – 18.10.2026
- Ranking drużyn (NetRtg, cały sezon / ostatnie 5 meczów) i zawodników (ocena 40/25/20/15, GmSc, PER, korekta +/-), pozycje, wyszukiwarka, karta zawodnika.
- Tabela ligi z formą jak na Flashscore („?” = następny mecz, podświetlanie obu drużyn), statystyki drużyn i rywali, cztery czynniki, statystyki na 40 minut, zakładka Kolejka.
- Mecze z protokołów i terminarza (bieżąca kolejka wg daty, pauzujący, przełożone mecze), wyścig o nagrody.
- Import protokołów z kontrolą ID meczu i importem terminarza w jednej komendzie (`scripts/runda.sh`), paczka projektu publikowana przy stronie.

### Zaplanowane w trakcie sezonu (bez zmiany numeru głównego)
- 4. kolejka: wykres „Miejsce po kolejkach” i szansa wygranej przy zaplanowanych meczach włączają się same; po kilku kolejkach sprawdzić `WIN_SIGMA`.
- 5. kolejka: EWA włącza się sama; wdrożyć SRS (patrz Backlog) → 1.1.
- Przed play-off: ustalić z Tomkiem, jak pokazać fazę play-off (osobne zasady, drabinka) → 2.0.

## Backlog
- **GitHub.** Repozytorium github.com/tparzonka/talk-power-ranking (publiczne). Kalendarz do subskrypcji: https://raw.githubusercontent.com/tparzonka/talk-power-ranking/main/dist/quantum-hoop.ics – aktualizuje się po każdym wypchnięciu nowego terminarza. W repozytorium nie ma żadnych danych osobowych: dane zawodników (`zawodnicy`, `wiek`, `numery`, `korekty`, `wyjatki`, `sklady.txt`), `input/` i zbudowana strona są tylko lokalnie (pilnuje tego CI). Pełny projekt z danymi nadal jest w paczce `projekt.txt` przy stronie.

- **EWA (Estimated Wins Added)** – kod jest gotowy w `src/ranking.js` (`hollinger`, `EWA_OD_KOLEJKI = 5`). Kolumna pojawia się sama w rankingu zawodników, gdy w danych jest mecz 5. kolejki. Przelicznik punktów na zwycięstwa liczony z wyników drużyn, które mają co najmniej 3 mecze. Po pojawieniu się warto sprawdzić, czy wartości są rozsądne (lider ligi rzędu 1–2 zwycięstw na 5 meczów).
- **SRS (Simple Rating System)** – ocena drużyny wg Basketball-Reference: średnia różnica punktów w meczu poprawiona o siłę rywali (ocena = średnia różnica + średnia ocena rywali, liczone wspólnie, aż wartości się ustalą; 0 = przeciętna drużyna). Ma sens dopiero, gdy drużyny łączą się wspólnymi rywalami, czyli mniej więcej od 5. kolejki. Plan: osobna kolumna w rankingu drużyn, pokazywana automatycznie od 5. kolejki (jak EWA), bez zmiany kolejności rankingu (ten nadal według NetRtg).
