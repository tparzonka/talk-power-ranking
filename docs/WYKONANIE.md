# Power Ranking TALK: zadania do wykonania

Plan rozwoju (cel i kolejność etapów) jest w `docs/PROJEKT.md`, sekcja „Plan rozwoju”. Ten plik rozpisuje etapy na zadania dla modelu wykonującego. Przygotowany 16.11.2026 na stanie: 31 meczów, strona w wersji 80, `main` na `d203ab2`.

## Jak z tego korzystać (Tomek)

1. Przełącz model na Sonneta i napisz: **„Wykonaj zadanie 1.1 z docs/WYKONANIE.md”**. Jedno zadanie na jedną wiadomość.
2. Zadania oznaczone **[Opus]** uruchom po przełączeniu na Opusa. To miejsca, gdzie liczy się ocena wyglądu, poprawność statystyki albo przegląd cudzej pracy.
3. Zadania oznaczone **STOP** kończą się pytaniem albo makietą do akceptacji. Następne zadanie rusza dopiero po Twojej odpowiedzi.
4. Po każdym zadaniu wykonawca zaznacza je w sekcji „Stan” na końcu tego pliku.

## Zasady dla wykonawcy (obowiązują w każdym zadaniu)

**Start sesji**
- Projekt: `/home/claude/export/power-ranking`. Gdy go brak, odtwórz według skilla `power-ranking-talk` (krok 1).
- Klon repozytorium: `/home/claude/talk-power-ranking` (gdy brak: dodaj repo `tparzonka/talk-power-ranking` i sklonuj).
- Przed pierwszą edycją uruchom `node scripts/test.mjs` i `node scripts/test-strona.cjs`. Oba muszą przejść. Jeśli nie przechodzą, zatrzymaj się i zgłoś.

**Zakres**
- Rób dokładnie to, co jest w zadaniu. Pomysł na rozszerzenie zgłoś jednym zdaniem na końcu, nie wdrażaj.
- Nie zmieniaj wzorów rankingu, progów ani kolejności rankingu, jeśli zadanie tego wprost nie każe.
- Nie twórz nowych plików `.md`. Dokumentacja idzie do `docs/PROJEKT.md`.
- Teksty na stronie: po polsku, bezosobowo, bez wyróżniania drużyn, bez angielskich wstawek poza skrótami statystyk.

**Pułapki tego projektu**
- `src/ranking.js` jest wklejany do `src/template.html` w miejscu `/*__RANKING_JS__*/`, w tym samym zakresie co kod strony. Stała o tej samej nazwie w obu plikach to błąd składni całej strony. Przenosząc funkcję do silnika, usuń ją z szablonu.
- `scripts/build.py` ucina `ranking.js` na linii `if (typeof module !== 'undefined')`. Nowe eksporty dopisuj w tej jednej linii.
- Nie czytaj w całości `src/template.html` (logo w base64), `dist/*.html`, `data/zawodnicy.json`. Używaj `grep -n` i `sed -n 'A,Bp' plik | cut -c1-220`.
- Wartości w wierszach `rankTeams`, `rankPlayers`, `leagueTable` to napisy z przecinkiem i znakiem („+12,3”). Do liczenia używaj `num()` (szablon) albo własnej konwersji (testy).
- Funkcje z progiem kolejki testuj na kopii danych poza `data/`. Prawdziwych danych nie zmieniaj.
- Dane zawodników (`data/zawodnicy.json`, `data/sklady.txt`, `data/wiek.json`, `data/korekty.json`, `data/numery.json`, `data/wyjatki.json`), kod panelu i raporty scoutingowe nie trafiają do repozytorium.

**Sprawdzenie i wydanie (koniec każdego zadania, które zmienia kod)**
1. `node scripts/test.mjs` i `node scripts/test-strona.cjs`.
2. Zrzuty w Playwright: 1440×900, iPhone 13 (z dopisanym znacznikiem viewport, patrz skill `power-ranking-talk`), ciemny motyw (`colorScheme: 'dark'`). Sprawdź błędy JS i `document.documentElement.scrollWidth <= innerWidth`. Obejrzyj zrzuty.
3. Porównaj 3–5 liczb z nowego widoku z wyjściem silnika w konsoli.
4. `bash scripts/runda.sh` (bez plików), publikacja strony: Artifact `file_path=/home/claude/ranking-publiczny.html`, `url=https://claude.ai/artifact/XjkJB9hGr284QLAtPpMoKa`, `files={"projekt.txt": "/home/claude/projekt.txt"}`.
5. GitHub: gałąź, kopia zmienionych plików publicznych do klonu, commit po angielsku, PR przez `gh api repos/tparzonka/talk-power-ranking/pulls`, scalenie po zielonym CI (`gh api -X PUT .../pulls/N/merge`). `gh pr create` i GraphQL nie działają.
6. Odpowiedź: co zmienione, w których plikach, jak sprawdzone, czego nie sprawdzono.

**Kiedy Sonnet oddaje zadanie Opusowi** (napisz Tomkowi „to zadanie dla Opusa” i zatrzymaj się)
- test nie przechodzi po jednej sensownej poprawce,
- liczby na stronie nie zgadzają się z silnikiem i przyczyna nie jest oczywista,
- zadanie wymaga wyboru metody statystycznej albo zmiany wzoru,
- trzeba zdecydować o układzie nowego widoku bez zaakceptowanej makiety.

## Mapa kodu (stan na 16.11)

`src/ranking.js`
- `SUM_KEYS`, `teamTotals(md, okno)` → `[{ druzyna, g, own, opp }]`, `fourFactors(own, opp)` → `{ efg, tov, orb, ftr, oefg, otov, drb, oftr }`, `FACTOR_BETTER`.
- `teamProfile(nazwa, md, druzyny, { okno })` → `{ druzyna, ranking, tabela, czynniki: [{ key, wartosc, liga, miejsce, z }], mecze: [{ mecz_id, kolejka, data, rywal, pf, pa, win, url, poss, ortg, drtg, net }] }` albo `null` (brak meczów). Ranking w zakresie, tabela i lista meczów z całego sezonu.
- `gk(r, team)`: klucz meczu. `lastGames(rows, keyOf, okno)`: zakres „ostatnie N”.
- `adjustedRatings(rows, game)` → `Map(drużyna → { adj, sos })`.
- `rankTeams(md, druzyny, { okno })` → wiersze `{ miejsce, druzyna, bilans, net, ortg, drtg, poss, mov, skor, sila }`.
- `rankPlayers(zawodnicy, md, { okno })` → wiersze `{ id, miejsce, zawodnik, druzyna, g, glowna, ocena, on, onoff, ts, efg, usg, pie, rywale, pkt, zb, as, eval, gmsc, per, ewa }`.
- `leagueTable(md, druzyny)` → `{ miejsce, druzyna, pkt, g, w, zp, pzs, roz, forma, formaGry: [{ k, data, win, rywal, pf, pa, url }] }`. Kolejność: punkty, mecze bezpośrednie (punkty, różnica), różnica, punkty zdobyte, nazwa.
- `winChance(md)` → funkcja `(a, b) → szansa a`; `.margin(a, b)` oczekiwana różnica punktów; `.games(t)` liczba meczów. Stałe `WIN_SIGMA = 15`, `WIN_SHRINK = 3`.
- `forecastLog(md)` → `[{ mecz_id, kolejka, data, a, b, pa, pb, p, faworyt, pewnosc, trafiony, oczekiwana, roznica }]`.

`src/template.html` (wszystko w jednej funkcji, `DATA` wstrzyknięte)
- Pomocnicze: `el(tag, cls, text)`, `f1`, `pct`, `num`, `tbd(g)`, `tone`, `store`.
- Dane: `compute()` liczy `teamRank`, `playerRank`, `teamStats`, `teamOpp`, `teamFactors`, `playerStats` dla bieżącego `okno`; `leagueRows` (cały sezon); `games` (protokoły + terminarz: `{ id, kind: 'prot'|'score'|'plan', kolejka, data, godz, url, teams: [{ druzyna, pts }] }`).
- Cztery czynniki: silnik ma `SUM_KEYS`, `teamTotals(md, okno)`, `fourFactors(own, opp)`, `FACTOR_BETTER`; w szablonie zostaje `makeFactors(totals)` (formatowanie wierszy i średnia ligi).
- Tabele: `VIEWS.teams.<widok>` i `VIEWS.players.<widok>` (`{ note, rows(), sort, cols, foot }`), rysuje `drawTable(tableEl, tableName, view, rows, onRow)`. Przełączniki widoków: `seg`/`mini`.
- Widoki: `VIEW_IDS`, `VIEW_TITLES`, `go(id, fromHash)`, `route(hash)`, `setHash(h)`, `slugify`, `teamBySlug`, `playerBySlug`.
- Karta zawodnika: `buildCard(name)`, `openCard(name, fromHash)`, `closeCard(fromHash)`.
- Przegląd: `drawLedger`, `drawScatter`, `drawPreview`, `drawUpcoming`, `drawResults`; wiersze mają `data-team`.
- Zmiana zakresu: `drawRange()` woła `compute(); drawLead(); drawTeams(); drawPlayers(); drawOverview();`.
- Kolory: zmienne CSS w `:root` (`--accent`, `--up`, `--down`, `--muted`, `--line`, `--panel`, `--raised`), osobne wartości dla ciemnego motywu. Nie wpisuj kolorów na sztywno.

---

## Etap 1. Strona drużyny

### 1.1 [Sonnet] Cztery czynniki do silnika
Cel: liczenie czterech czynników przenieść z szablonu do `src/ranking.js`, żeby dało się je testować i użyć na stronie drużyny. Wynik na stronie ma być identyczny.

Kroki:
1. Przed zmianą zapisz tekst tabeli Drużyny → Statystyki → Cztery czynniki (Playwright: `document.querySelector('#t-teams').innerText`) dla obu zakresów do pliku w scratchpadzie.
2. W `src/ranking.js` dodaj i wyeksportuj:
   - `SUM_KEYS` (ta sama lista co w szablonie),
   - `teamTotals(mecze_druzyn, okno)` → `[{ druzyna, g, own, opp }]` (kopia logiki z szablonu, `DATA.mecze_druzyn` zastąp parametrem),
   - `fourFactors(own, opp)` → `{ efg, tov, orb, ftr, oefg, otov, drb, oftr }` (liczby albo `null`; to dzisiejsze `raw(t)` z `makeFactors`),
   - `FACTOR_BETTER = { efg: 1, tov: -1, orb: 1, ftr: 1, oefg: -1, otov: 1, drb: 1, oftr: -1 }`.
3. W szablonie usuń `SUM_KEYS`, `zeroSums`, `teamTotals`, `factors`; `teamTotals(okno)` zamień na `teamTotals(DATA.mecze_druzyn, okno)`; `makeFactors` ma korzystać z `fourFactors` i `FACTOR_BETTER`.
4. `scripts/test.mjs`: suma punktów `own` po wszystkich drużynach równa się sumie `opp`; dla pierwszej drużyny `efg` równa się `(fgm + 0,5·tpm) / fga · 100` policzonemu wprost z `mecze_druzyn`.

Odbiór: tekst tabeli z kroku 1 identyczny po zmianie (diff pusty), testy przechodzą, brak błędów JS.

### 1.2 [Sonnet] `teamProfile` w silniku
Sygnatura: `teamProfile(nazwa, mecze_druzyn, druzyny, opts = {})`, `opts.okno` jak w `rankTeams`. Zwraca `null`, gdy drużyna nie ma meczów.

Zwracany obiekt:
```
{
  druzyna,
  ranking: <wiersz rankTeams tej drużyny w danym zakresie>,
  tabela:  <wiersz leagueTable, zawsze cały sezon>,
  czynniki: [ { key, wartosc, liga, miejsce, z } ]   // 8 pozycji w kolejności FACTOR_BETTER
  mecze: [ { mecz_id, kolejka, data, rywal, pf, pa, win, url, poss, ortg, drtg, net } ]  // rosnąco po dacie, cały sezon
}
```
- `wartosc`: liczba z `fourFactors`; `liga`: ta sama miara policzona z sum całej ligi; `miejsce`: 1 = najlepiej według `FACTOR_BETTER`, wśród drużyn z meczami w zakresie; `z`: liczba tych drużyn.
- `mecze[].poss` = średnia posiadań obu drużyn w meczu, `ortg = pf / poss · 100`, `drtg = pa / poss · 100`, `net = ortg − drtg` (liczby, nie napisy).
- Bez nowych wzorów: posiadania jak w `rankTeams`.

Testy w `scripts/test.mjs`, dla każdej drużyny z meczami: `ranking.miejsce` zgodne z `rankTeams`; `mecze.length` równe liczbie meczów z `leagueTable`; suma `pf` równa punktom zdobytym z `leagueTable`; dla każdego czynnika miejsca w lidze tworzą zbiór bez dziur większych niż remisy (minimum 1, maksimum ≤ liczba drużyn).

Odbiór: testy przechodzą; w konsoli wypisz profil jednej drużyny i porównaj NetRtg oraz eFG% ze stroną.

### 1.3 [Opus] Makieta strony drużyny · STOP
Wczytaj skille `dataviz` i `emil-design-eng`. Makieta powstaje poza produkcją: skopiuj `src/template.html` do scratchpada, dodaj widok, zbuduj kopią `build.py` wskazującą na tę kopię (albo podmień ścieżki zmiennymi), wynik zapisz w `/home/claude/out/makieta-druzyna.html`. Nie zmieniaj `src/`.

Układ (jedna kolumna na telefonie, dwie na komputerze tam, gdzie zaznaczono):
1. **Powrót i nagłówek.** Przycisk „Wszystkie drużyny”. Nazwa drużyny w `h1` (`#view-title`). Pod nią jedna linia: miejsce w rankingu, bilans, miejsce w tabeli.
2. **Kafelki** (wzór `.tiles`/`.tile` z karty zawodnika): NetRtg, Po korekcie (od 5. kolejki), Atak, Obrona, Tempo. Pod wartością miejsce w lidze.
3. **Forma.** Ostatnie 5 meczów jako kafelki wyników (wzór z przeglądu), z rywalem i wynikiem w opisie dla czytników.
4. **Profil gry** (dwie kolumny: Atak, Obrona). Osiem wierszy: nazwa czynnika po polsku, wartość, pasek pozycji w lidze ze znacznikiem średniej, „N. z 15”. Kolor tylko dla wyraźnie lepszych i gorszych od średniej (`--up`, `--down`), reszta neutralna.
5. **Skład.** Tabela: zawodnik (przycisk `plBtn`, otwiera kartę), pozycja, mecze, minuty, punkty, zbiórki, asysty, ocena z miejscem. Zawodnicy poniżej progu rankingu bez oceny. Sortowanie według minut.
6. **Mecze.** Rozegrane: data, rywal (link do jego strony), wynik z W/P, atak i obrona na 100 posiadań, link do protokołu. Zaplanowane: data albo „Termin do ustalenia”, rywal, szansa wygranej (od 4. kolejki).

Zakres „Ostatnie 5” zmienia kafelki, profil gry i skład. Forma, tabela i lista meczów są zawsze z całego sezonu; zaznacz to jednym słowem przy nagłówkach, jak w karcie zawodnika („cały sezon”).

Wynik: zrzuty komputer, telefon i ciemny motyw dla drużyny z 5 meczami i dla drużyny z 2 meczami, wysłane Tomkowi. Opisz w 3–4 zdaniach decyzje, które podjąłeś. Czekaj na akceptację.

### 1.4 [Sonnet] Wpięcie strony drużyny
Warunek: makieta z 1.3 zaakceptowana. Przenieś ją do `src/template.html` bez zmian wyglądu.

1. HTML: `<section class="block view" id="druzyna" hidden>` po sekcji `druzyny`.
2. `VIEW_IDS` dostaje `'druzyna'`; w `go()` przycisk nawigacji „Drużyny” ma `aria-current`, gdy widok to `druzyna`; tytuł to nazwa drużyny.
3. `let teamPage = null; function drawTeamPage()` rysuje z `teamProfile(teamPage, DATA.mecze_druzyn, DATA.druzyny, { okno })`, `playerRank`, `playerStats`, `games`, `winChance`.
4. `openTeam(name)`: `teamPage = name; history.pushState(null, '', '#druzyna/' + slugify(name)); drawTeamPage(); go('druzyna', true); window.scrollTo(0, 0)`.
5. `route()`: gałąź `druzyna` ustawia `teamPage` i pokazuje widok. **Nie** woła już `setTeam`.
6. Wejścia: klik w wiersz tabeli drużyn (dziś `setTeam(next); go('zawodnicy')`, okolice obsługi `tr[data-key]`) woła `openTeam`. Nazwa drużyny w wierszu przeglądu, w meczach i w karcie zawodnika staje się przyciskiem z `data-open-team`; jeden wspólny `document.addEventListener('click', …)`. Klik w resztę wiersza przeglądu nadal przypina podświetlenie na wykresie.
7. `drawRange()`: po `compute()` dopisz odświeżenie strony drużyny, gdy jest otwarta.
8. Lista wyboru drużyny w Zawodnikach zostaje filtrem i działa jak dotąd.
9. `scripts/test-strona.cjs`: zmień test adresu drużyny (widok `druzyna`, `#view-title` = nazwa); dodaj: klik w pierwszy wiersz tabeli drużyn otwiera stronę drużyny, Wstecz wraca do `#druzyny`; NetRtg na stronie drużyny równa się wartości w tabeli; liczba wierszy rozegranych meczów równa się liczbie meczów drużyny; na 390 px brak przewijania w bok.

Odbiór: punkt „Sprawdzenie i wydanie” w całości; zrzuty zgodne z zaakceptowaną makietą.

### 1.5 [Sonnet] Wyniki po kwartach na stronie drużyny
Warunek: zgoda Tomka na kwarty publicznie (decyzja 1). Bez zgody pomiń.

1. `scripts/build.py`: `data['kwarty'] = load('kwarty', {})`.
2. `teamProfile`: parametr `opts.kwarty`; dla drużyny średnie punkty zdobyte i stracone w każdej z 4 kwart (tylko mecze, które są w `kwarty`).
3. Strona drużyny: blok „Kwarty” (4 pary słupków zdobyte/stracone, wartości nad słupkami; skill `dataviz`).
4. Repozytorium: usuń `scripts/kwarty.py` i `data/kwarty.json` z `.gitignore`, dodaj oba pliki. Sprawdź, że `kwarty.json` zawiera tylko ID meczów i liczby.
5. Test: suma kwart każdego meczu w `kwarty.json` równa się wynikowi z `mecze_druzyn` (mecze niezgodne są pomijane przez `kwarty.py`).

### 1.6 [Opus] Przegląd etapu 1
Tylko odczyt, wynik jako lista poprawek.
- `emil-design-eng`: tabela Przed / Po / Dlaczego dla strony drużyny (stany naciśnięcia, fokus, odstępy, czytelność na telefonie).
- 5 liczb ze strony drużyny porównanych z silnikiem dla dwóch drużyn i obu zakresów.
- Klawiatura: dojście Tab do każdego przycisku, widoczny fokus, Wstecz z każdego wejścia.
- Neutralność: żaden tekst nie ocenia drużyny.
Poprawki wykonuje Sonnet jako zadanie 1.6a (lista z przeglądu), potem wydanie.

### 1.6a [Sonnet] Poprawki z przeglądu etapu 1
Wynik przeglądu z 21.11. Sprawdzone bez uwag: 5 liczb ze strony drużyny zgodnych z silnikiem (SOLNO, QUANTUM HOOP, GOOD FATHER BARBER; cały sezon i ostatnie 5), Tab dochodzi do każdego przycisku i linku, fokus widoczny wszędzie, Wstecz działa z tabeli drużyn, Przeglądu, karty zawodnika i z rywala, brak słów oceniających, brak tekstu poniżej 12 px.

| Przed | Po | Dlaczego |
| --- | --- | --- |
| „Wszystkie drużyny” wywołuje `go('druzyny')`, który podmienia wpis historii (`replaceState`) | W `openTeam` zapamiętaj, czy wpis dodała strona (`teamPushed = true` przy `pushState`). Przycisk: gdy `teamPushed`, `history.back()`; inaczej `pushState('#druzyny')` i `go('druzyny', true)` | Po wejściu z linku Wstecz po tym przycisku opuszcza stronę (sprawdzone: `about:blank`); po wejściu z listy cofa do tej samej listy |
| Średnia ligi w profilu gry tylko w `title` i tekście dla czytnika | Druga linia w kolumnie miejsca: `śr. 47,2%` (`.rk`, 12 px, `--muted`) | Na telefonie i z klawiatury `title` nie działa; bez średniej znacznik na pasku nie ma liczby |
| Cele dotyku na telefonie: nazwisko w składzie 23 px, „protokół” 15 px, rywal 32 px | `@media (pointer: coarse)`: `#druzyna button.pl, #druzyna .tp-tm, #druzyna a.proto { position: relative }` i `::after { content: ''; position: absolute; inset: -10px -4px }` | Minimum 44 px bez zmiany wyglądu i wysokości wierszy |
| `.tp-tm` i `.tp-back` bez stanu naciśnięcia | `transition: transform .16s ease-out` i `:active { transform: scale(.97) }`, jak `.lnk` | Przycisk musi potwierdzić naciśnięcie; ten sam wzór co reszta strony |
| Słupki kwart mają `title` z tą samą liczbą, która stoi nad słupkiem | Usuń `title` ze słupków kwart | Dubel; liczba jest już widoczna |
| Po otwarciu strony drużyny fokus zostaje na klikniętym elemencie, który znika z widoku | W `openTeam` po `go`: `#view-title` z `tabindex="-1"`, `focus({ preventScroll: true })` | Użytkownik klawiatury zaczyna od nagłówka nowej strony zamiast od początku dokumentu |

Odrzucone: podpowiedzi kresek innych drużyn na pasku (`title`) zostają jako dodatek na komputerze; kafelki formy w nagłówku są małe (18 px), ale te same mecze są w tabeli „Mecze”; animacje dopiero w etapie 5.

Testy w `scripts/test-strona.cjs`: Wstecz po „Wszystkie drużyny” po wejściu z adresu zostaje na stronie; średnia ligi widoczna w każdym wierszu profilu.

### 1.7 [Sonnet] Dokumentacja i wersja
- `docs/PROJEKT.md`: „Widoki statystyk” (strona drużyny), „Wersje” (wpis 1.2.0, jeśli Tomek zgodził się na numer; wtedy też plik `VERSION`), w „Plan rozwoju” etap 1 jako zrobiony.
- W sekcji „Jak liczony jest ranking” w szablonie punkt „Czego ranking nie uwzględnia” nadal wymienia SRS, choć korekta o siłę rywali działa: usuń SRS z tego zdania.
- `README.md` w repozytorium: jedno zdanie o stronie drużyny i adresach.

---

## Etap 2. Wiarygodność

### 2.1 [Sonnet] Zakres niepewności oceny drużyny
Metoda (ustalona, nie zmieniaj): przedział 80% z rozrzutu wyników mecz po meczu. Dla drużyny z `g ≥ 3` meczami: `m_i` = bilans meczu na 100 posiadań, `sd` = odchylenie standardowe z próby, `se = sd / √g`, zakres = `net ± t · se`, gdzie `t` z tabeli dla `g − 1` stopni swobody: `[3.078, 1.886, 1.638, 1.533, 1.476, 1.440, 1.415, 1.397, 1.383, 1.372, 1.363, 1.356, 1.350, 1.345]`, dalej 1,31. Przy `g < 3` brak zakresu. Bez losowania, więc wynik jest powtarzalny.

- `ratingRange(mecze_druzyn, { okno })` → `Map(drużyna → { net, se, lo, hi, g })` (liczby). Eksport.
- `rankTeams`: nowe pole `zakres` („+12,3 do +35,0” albo „-”).
- Tabela rankingu drużyn: kolumna „Zakres” (`hide: true`, podpowiedź: „Przedział, w którym z 80% pewnością mieści się NetRtg drużyny przy tej liczbie meczów.”). Strona drużyny: ten sam zakres pod kafelkiem NetRtg.
- Metodologia w szablonie: jeden punkt „Zakres”.
- Testy: `lo ≤ net ≤ hi`; dla drużyny z 2 meczami brak zakresu; `net` zgodny z `rankTeams`.

### 2.2 Symulacja końca sezonu (odrzucone 21.11)
Wykonane i wycofane tego samego dnia: Tomek zrezygnował z prognozy końca sezonu i wszystkiego, co z nią związane. Kod usunięty z silnika i testów. Nie wracać bez jego prośby.

### 2.3 Trafność zapowiedzi na stronie (odrzucone 21.11)
Tomek zrezygnował 21.11. Rozliczenie zostaje tylko w konsoli (`node scripts/backtest.mjs`).

### 2.4 Prognoza końca sezonu jako widok tabeli (odrzucone 21.11)
Patrz 2.2.

### 2.5 [Opus] Przegląd etapu 2
Sprawdź kalibrację (`node scripts/backtest.mjs`), zakres NetRtg (czy szerokość ma sens przy liczbie meczów) i teksty pod kątem neutralności. Lista poprawek dla Sonneta, potem wydanie. Numer wersji bez zmian (decyzja Tomka 21.11).

---

### 2.5a [Sonnet] Poprawki z przeglądu etapu 2
Wynik przeglądu z 21.11. Bez uwag: kalibracja zapowiedzi (`node scripts/backtest.mjs`, 18 meczów: faworyt 14 z 18 = 78% przy pewności 80%; w przedziałach 2 z 3 / 5 z 7 / 4 z 5 / 3 z 3), więc `WIN_SIGMA` i źródło oceny bez zmian, powtórka po 8. kolejce. Teksty zakresu neutralne. Kolumna „Zakres” mieści się na 1440 px.

| Przed | Po | Dlaczego |
| --- | --- | --- |
| `sd` zakresu liczone tylko z meczów drużyny | Częściowe łączenie z ligą: `sd² = ((g − 1) · sd_d² + K · sd_l²) / (g − 1 + K)`, `K = 4` (stała `RANGE_POOL`), `sd_l` = odchylenie zbiorcze ligi (suma kwadratów odchyleń od średniej każdej drużyny / suma `g − 1`); `t` dla `g − 1 + K` stopni swobody (poza tabelą 1,31) | Przy 4 meczach podobnych do siebie zakres wychodzi fałszywie wąski: CP MEDICA ±4 pkt (sd 5,1 przy zbiorczym 32,8). Z `K = 4` CP MEDICA 35 pkt szerokości, reszta prawie bez zmian (SOLNO 56 → 47, LUCKY BASTARDS 88 → 61); szerokość dalej zależy od rozrzutu drużyny, ale nie od przypadku przy kilku meczach |
| „przedział, w którym z 80% pewnością mieści się NetRtg drużyny” (podpowiedź kolumny, notka pod kafelkami, metodologia) | „przedział, w którym z 80% pewnością leży rzeczywisty poziom drużyny (NetRtg, jaki miałaby po wielu meczach)” | Pokazany NetRtg jest znany dokładnie; niepewny jest poziom, który on szacuje |
| Metodologia: „Kolumna „Zakres” (do włączenia w tabeli)”; `docs/PROJEKT.md`: „domyślnie ukryta” | „Kolumna „Zakres” w rankingu drużyn (na telefonie ukryta)” | `hide: true` ukrywa kolumnę tylko na wąskim ekranie, na komputerze jest widoczna |

Testy w `scripts/test.mjs`: ręczny przykład policzony nowym wzorem (`sd_l` z tych samych sztucznych danych); dla każdej drużyny szerokość zakresu co najmniej taka, jak przy `sd = sd_l · √(K / (g − 1 + K))` (dolna granica wynikająca z łączenia). Opis metody w `docs/PROJEKT.md` (punkt „Zakres NetRtg”).

## Etap 3. Zawodnicy

### 3.1 [Opus] Rozbieżność sum +/- · STOP
Tylko analiza. W `rankPlayers` znajdź korektę +/- (stała `SHRINK`, rozdzielanie różnicy według minut). Policz na danych: w ilu wierszach drużyna-mecz suma +/- zawodników różni się od 5 × różnica punktów, o ile, i czy różnica bierze się z protokołów (surowe `pm`), czy z naszego liczenia. Sprawdź, jak bardzo korekta zmienia oceny (ranking z korektą i bez: ilu zawodników zmienia miejsce o więcej niż 5). Wynik: opis w `docs/PROJEKT.md` (Metodologia) i rekomendacja dla Tomka. Żadnych zmian we wzorze bez jego zgody.

### 3.2 [Sonnet] PER i EWA tylko przy wystarczającej próbie
W widokach, gdzie pokazywane są `per` i `ewa`, wartość tylko dla zawodników spełniających próg rankingu (połowa meczów drużyny, średnio 15 minut); pozostali „-”. Podpowiedź kolumny dostaje zdanie o progu. Test: żaden wiersz poniżej progu nie ma wartości PER.

### 3.3 [Opus] „Siła rywali” z oceny po korekcie
Napisz `scripts/stabilnosc.mjs` (konsola): ocena zawodników z meczów nieparzystych i parzystych, korelacja między połowami, dla wariantu obecnego (średni NetRtg rywali) i nowego (średnia ocena rywali po korekcie). Zmień wzór tylko, gdy korelacja nie spada i ranking czołowej dwudziestki nie zmienia się o więcej niż 3 miejsca średnio. Wynik liczbowy do `docs/PROJEKT.md`. Jeśli zmiana przechodzi: STOP i pytanie do Tomka (to zmiana wzoru).

### 3.4 [Sonnet] Pełna tabela zawodników na komputerze
Powyżej 860 px: wszystkie wiersze zamiast okna 10 (`fitTen` i przycisk „więcej” zostają tylko na telefonie), nagłówek tabeli przyklejony przy przewijaniu strony (`position: sticky`). Sprawdź, że kolumna z nazwiskiem nadal jest przypięta przy przewijaniu w bok i że wyszukiwarka działa.

### 3.5 [Opus] Makieta porównania zawodników · STOP → [Sonnet] wpięcie
Makieta jak w 1.3: wybór drugiego zawodnika z karty, dwie kolumny wartości (na mecz i na 40 minut, przełącznik istnieje), różnice zaznaczone kolorem tylko przy wyraźnej przewadze, adres `#porownaj/<slug>/<slug>`. Po akceptacji wpięcie przez Sonneta z testem adresu.

### 3.6 [Sonnet] Wykres mecz po meczu w karcie zawodnika
Nad tabelą meczów: słupki GmSc dla kolejnych meczów (wzór słupków z przeglądu, skill `dataviz`), linia średniej, opis dla czytników. Bez biblioteki, czysty SVG albo `div`.

---

## Etap 4. Strona meczu

### 4.1 [Sonnet] `gameSummary` w silniku
`gameSummary(mecz_id, mecze_druzyn, zawodnicy, opts)` → dla obu drużyn: wynik, posiadania, atak i obrona na 100 posiadań, cztery czynniki tego meczu (`fourFactors`), trzech najlepszych zawodników według GmSc (wzór `gmscOf`, przenieś go do silnika jak w 1.1), kwarty (jeśli publiczne), szansa sprzed meczu z `forecastLog` (albo `null`). Testy: punkty zgodne z `mecze_druzyn`; czynniki obu drużyn są lustrzane (eFG% jednej = eFG% rywali drugiej).

### 4.2 [Opus] Makieta strony meczu · STOP → [Sonnet] wpięcie
Rozegrany mecz: nagłówek z wynikiem, kwarty, porównanie czterech czynników, najlepsi zawodnicy, link do protokołu ligi. Zaplanowany: to samo porównanie z całego sezonu i szansa wygranej (dzisiejsza zapowiedź z przeglądu w tym układzie). Wejście: klik w wynik albo w zaplanowany mecz; adres `#mecz/<id>`. Link do protokołu ligi zostaje widoczny.

---

## Etap 5. Szlif

### 5.1 [Opus] Gdzie ruch pomaga · STOP
Skill `find-animation-opportunities` na całej stronie: tabela propozycji z dokładnymi wartościami i lista odrzuconych miejsc. Tylko raport.

### 5.2 [Sonnet] Wdrożenie zaakceptowanych pozycji z 5.1
Skill `emilkowalski-motion`: wyłącznie `transform` i `opacity`, istniejące `--ease-out` i `--ease-drawer`, przełączanie widoków bez animacji, `prefers-reduced-motion`.

### 5.3 [Sonnet] Klawiatura i rozmiar
Fokus i obsługa Enter/Spacja na wierszach i punktach wykresów, kolejność fokusu po otwarciu karty i strony drużyny, kontrast w jasnym motywie (minimum 4,5:1 dla tekstu). Rozmiar: zmierz udział logo i CSS w pliku, zaproponuj oszczędność powyżej 50 KB albo zostaw.

### 5.4 [Sonnet] Panel scoutingowy
Data ostatniego meczu w danych w nagłówku panelu (`scripts/panel.mjs`, `src/panel.html`). Publikacja panelu bez `files`.

### 5.5 [Opus] Fork panelu dla klubu
Porównaj `scouting-panel/src/stats.js` z `src/ranking.js` po etapach 0–3 i rozpisz przeniesienie zmian jako zadania dla Sonneta.

**Wynik porównania (22.11, Opus).** Porównana kopia forka z 3.11 (`scouting-panel`, `src/stats.js`, 452 linie) z `src/ranking.js` (709 linii). Fork używa z silnika tylko `rankTeams` i `rankPlayers` (`scripts/build_panel.mjs`, `scripts/test.mjs`); cztery czynniki, kwarty i raport o rywalu liczy sam.
- Bez zmian od rozdzielenia: `gk`, `lastGames`, `hollinger`, `positionByHeight`, `awards`, `leagueTable`, stałe progów i `WIN_SIGMA`.
- Zmienione w `ranking.js`: `rankTeams` (pola `skor`, `sila`, `zakres`), `rankPlayers` (siła rywali z oceny po korekcie, pominięcie wpisanych bez minut, próg połowy meczów drużyny zamiast 15 minut średnio, pole `min`), `winChance` (`margin`, `games`).
- Tylko w `ranking.js`: `adjustedRatings`, `ratingRange`, `forecastLog`, `teamTotals`, `fourFactors`, `teamProfile`, `gmscOf`, `gameSummary`.
- Nie przenosić: `teamTotals`, `fourFactors`, `teamProfile`, `gameSummary`, `gmscOf`. To funkcje stron drużyny i meczu, których panel nie ma, a `fourFactors` liczy wolne jako FTM/FGA, a oba panele jako FTA/FGA × 100 (zmiana przesunęłaby radar i reguły raportu o rywalu).
- Fork ma `opts.minMinut` z `config.json` (`min_minut`). W `ranking.js` tej opcji już nie ma;.
- Znane ograniczenia z `CLAUDE.md` forka (zawodnik rozpoznawany po imieniu i nazwisku, przybliżenie bez +/-) są w obu plikach takie same. Decyzja o +/- z zadania 3.1 dotyczy też forka.

Fork `scouting-panel` to osobny projekt (decyzja Tomka 22.11): tej listy nie dotyczy i nie przenosimy do niego zmian z tej listy.

---

## Decyzje Tomka

| # | Decyzja | Potrzebna przed | Odpowiedź |
|---|---|---|---|
| 1 | Wyniki po kwartach na stronie publicznej i w repozytorium | 1.5, 4.1 | tak (20.11) |
| 2 | Numery wersji: 1.2.0 (strona drużyny), 1.3.0 (prognozy) | 1.7, 2.5 | bez zmian (21.11) |
| 3 | Małe szanse w prognozie jako „<1%” | 2.4 | nieaktualne: prognoza odrzucona (21.11) |
| 4 | Paczka `projekt.txt` przy stronie publicznej zawiera dane zawodników: zostaje czy do panelu | dowolnie | |

## Stan

- [x] 0 Fundament (16.11): `forecastLog`, `scripts/backtest.mjs`, adresy, testy
- [x] 1.1 Cztery czynniki do silnika (17.11, lokalnie, bez publikacji i bez pushu)
- [x] 1.2 `teamProfile` (17.11, lokalnie, bez publikacji i bez pushu)
- [x] 1.3 Makieta strony drużyny (20.11, zaakceptowana)
- [x] 1.4 Wpięcie strony drużyny (20.11, lokalnie, bez publikacji i bez pushu; dodatkowo podpowiedzi przy kafelkach formy w Przeglądzie)
- [x] 1.5 Kwarty (20.11, lokalnie; `.gitignore` w klonie poprawiony, pliki trafią do repozytorium przy wspólnym pushu)
- [x] 1.6 Przegląd etapu 1 (Opus, 21.11; lista poprawek w 1.6a)
- [x] 1.6a Poprawki z przeglądu (Sonnet, 21.11)
- [x] 1.7 Dokumentacja (21.11; wersja bez zmian: decyzja Tomka)
- [x] 2.1 Zakres niepewności (Sonnet, 21.11)
- [–] 2.2 Symulacja sezonu (odrzucone 21.11)
- [–] 2.3 Trafność zapowiedzi (odrzucone 21.11)
- [–] 2.4 Prognoza końca sezonu (odrzucone 21.11)
- [x] 2.5 Przegląd etapu 2 (Opus, 21.11; lista poprawek w 2.5a)
- [x] 2.5a Poprawki z przeglądu etapu 2 (21.11)
- [x] 3.1 Rozbieżność +/- (Opus, 21.11; analiza w PROJEKT.md, czeka na decyzję Tomka)
- [x] 3.2 PER i EWA przy próbie (21.11; próg jak w rankingu: połowa meczów, bez 15 minut)
- [x] 3.3 Siła rywali (Opus, 21.11; wdrożone za zgodą Tomka)
- [x] 3.4 Pełna tabela zawodników (21.11)
- [x] 3.5 Porównanie zawodników (21.11; makieta zaakceptowana: tylko zawodnicy z rankingu, Wstecz zamyka okno)
- [x] 3.6 Wykres w karcie zawodnika
- [x] 4.1 `gameSummary`
- [x] 4.2 Strona meczu (Opus, STOP, potem Sonnet)
- [x] 5.1 Raport o ruchu (Opus, STOP)
- [x] 5.2 Ruch
- [x] 5.3 Klawiatura i rozmiar
- [x] 5.4 Panel
- [x] 5.5 Fork panelu (Opus, 22.11; tylko porównanie, fork to osobny projekt)
