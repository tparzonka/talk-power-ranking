// Szybki test: liczy rankingi z data/*.json i wypisuje czołówkę.
// Użycie: node scripts/test.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { ratingRange, rankTeams, rankPlayers, leagueTable, winChance, forecastLog, SUM_KEYS, teamTotals, fourFactors, FACTOR_BETTER, teamProfile, gameSummary, gmscOf } = require('../src/ranking.js');
import { existsSync } from 'node:fs';
const load = (n) => { const u = new URL(`../data/${n}.json`, import.meta.url); return existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : []; };
// data/zawodnicy.json jest tylko lokalnie (dane osobowe); w CI test sprawdza drużyny i tabelę.
const md = load('mecze_druzyn'), dr = load('druzyny'), zw = load('zawodnicy');
const teams = rankTeams(md, dr);
const players = rankPlayers(zw, md);
if (teams.length !== dr.length) throw new Error(`Drużyn w rankingu ${teams.length}, w druzyny.json ${dr.length}`);
console.log('Drużyny:'); teams.slice(0, 5).forEach((t) => console.log(' ', t.miejsce, t.druzyna, t.net));
if (zw.length) console.log('Zawodnicy (wszyscy):'); players.filter((p) => p.pozycja === 'wszyscy').slice(0, 5).forEach((p) => console.log(' ', p.miejsce, p.zawodnik, p.ocena));
const tab = leagueTable(md, dr);
const zw_ = tab.reduce((s, t) => s + t.w, 0), po_ = tab.reduce((s, t) => s + Number(t.g) - t.w, 0);
if (zw_ !== po_) throw new Error(`Tabela: zwycięstw ${zw_}, porażek ${po_}`);
if (tab.some((t, i) => i && t.miejsce && Number(t.pkt) > Number(tab[i - 1].pkt))) throw new Error('Tabela: zła kolejność punktów');
console.log('Tabela:'); tab.slice(0, 3).forEach((t) => console.log(' ', t.miejsce, t.druzyna, t.pkt, t.roz));
// Próg rankingu zawodników: połowa meczów drużyny, mecz bez minut się nie liczy.
if (zw.length) {
  const mins = (m) => { const p = String(m).split(':').map(Number); return (p[0] || 0) + (p[1] || 0) / 60; };
  const tg = new Map(); md.forEach((r) => tg.set(r.druzyna, (tg.get(r.druzyna) || 0) + 1));
  const played = new Map(); zw.forEach((z) => { if (mins(z.min) > 0) played.set(z.zawodnik, (played.get(z.zawodnik) || 0) + 1); });
  for (const p of players.filter((r) => r.pozycja === 'wszyscy')) {
    if (Number(p.g) !== played.get(p.zawodnik)) throw new Error(`Ranking: ${p.zawodnik} G=${p.g}, rozegranych ${played.get(p.zawodnik)}`);
    if (Number(p.g) < 0.5 * tg.get(p.druzyna)) throw new Error(`Ranking: ${p.zawodnik} poniżej połowy meczów drużyny`);
  }
}
// Szansa wygranej: symetryczna, w przedziale (0, 1).
if (md.length) {
  const ch = winChance(md), names = [...new Set(md.map((r) => r.druzyna))];
  for (const a of names) for (const b of names) if (a !== b) {
    const p = ch(a, b);
    if (!(p > 0 && p < 1) || Math.abs(p + ch(b, a) - 1) > 1e-9) throw new Error(`Szansa wygranej ${a} – ${b}: ${p}`);
  }
}
// Ocena po korekcie: średnia ligi 0, każda drużyna z meczami ma ocenę.
{
  const vals = teams.filter((t) => t.miejsce).map((t) => Number(String(t.skor).replace(',', '.')));
  if (vals.some((v) => !isFinite(v))) throw new Error('Ocena po korekcie: brak wartości');
  if (Math.abs(vals.reduce((a, b) => a + b, 0) / (vals.length || 1)) > 0.1) throw new Error('Ocena po korekcie: średnia ligi ≠ 0');
}
// Rozliczenie zapowiedzi nie może korzystać z przyszłości: po usunięciu meczów z ostatniego dnia
// wcześniejsze wiersze są identyczne.
{
  const log = forecastLog(md);
  for (const r of log) if (!(r.pewnosc >= 0.5 && r.pewnosc < 1)) throw new Error(`Zapowiedź ${r.a} – ${r.b}: pewność ${r.pewnosc}`);
  const last = md.reduce((m, r) => (r.data > m ? r.data : m), '');
  const cut = forecastLog(md.filter((r) => r.data < last));
  const head = log.filter((r) => r.data < last);
  if (cut.length !== head.length || cut.some((r, i) => r.mecz_id !== head[i].mecz_id || Math.abs(r.p - head[i].p) > 1e-12))
    throw new Error('Rozliczenie zapowiedzi zależy od późniejszych meczów');
}
// Cztery czynniki: sumy drużyn i rywali, wzór eFG% liczony wprost z protokołów.
{
  const near = (x, y, what) => { if (Math.abs(x - y) > 1e-9) throw new Error(`Cztery czynniki: ${what}: ${x} zamiast ${y}`); };
  for (const okno of [0, 5]) {
    const totals = teamTotals(md, okno);
    if (!totals.length) throw new Error('Cztery czynniki: brak drużyn');
    // Sumy własne i rywali całej ligi są równe tylko dla całego sezonu: w oknie „ostatnie N” okno rywala obejmuje inne mecze.
    if (okno === 0) for (const k of SUM_KEYS) {
      near(totals.reduce((s, t) => s + t.own[k], 0), totals.reduce((s, t) => s + t.opp[k], 0), `suma „${k}” własna i rywali`);
    }
    if (okno > 0 && totals.some((t) => t.g > okno)) throw new Error(`Cztery czynniki: drużyna ma więcej niż ${okno} meczów w oknie`);
    const t = totals[0];
    const rows = md.filter((r) => r.druzyna === t.druzyna);
    const last = okno ? rows.sort((a, b) => String(a.data).localeCompare(String(b.data)) || a.mecz_id - b.mecz_id).slice(-okno) : rows;
    const num = (r, k) => Number(r[k]) || 0;
    const fgm = last.reduce((s, r) => s + num(r, 'fgm'), 0), tpm = last.reduce((s, r) => s + num(r, 'tpm'), 0), fga = last.reduce((s, r) => s + num(r, 'fga'), 0);
    const f = fourFactors(t.own, t.opp);
    near(f.efg, (fgm + 0.5 * tpm) / fga * 100, `eFG% ${t.druzyna}, zakres ${okno}`);
    if (okno === 0) near(t.g, rows.length, `liczba meczów ${t.druzyna}`);
    for (const k of Object.keys(FACTOR_BETTER)) if (f[k] != null && !Number.isFinite(f[k])) throw new Error(`Cztery czynniki: ${k} nie jest liczbą`);
  }
}
// Profil drużyny: zgodność z rankingiem i tabelą, miejsca w lidze bez dziur.
{
  const dr = JSON.parse(readFileSync(new URL('../data/druzyny.json', import.meta.url), 'utf8'));
  const names = dr.map((d) => d.druzyna);
  let withGames = 0;
  for (const okno of [0, 5]) {
    const rank = rankTeams(md, dr, { okno }), table = leagueTable(md, dr);
    for (const name of names) {
      const pr = teamProfile(name, md, dr, { okno });
      const row = table.find((x) => x.druzyna === name);
      if (!Number(row.g)) { if (pr !== null) throw new Error(`Profil ${name}: bez meczów powinien być null`); continue; }
      if (okno === 0) withGames++;
      if (String(pr.ranking.miejsce) !== String(rank.find((x) => x.druzyna === name).miejsce)) throw new Error(`Profil ${name}: miejsce w rankingu, zakres ${okno}`);
      if (pr.mecze.length !== Number(row.g)) throw new Error(`Profil ${name}: ${pr.mecze.length} meczów zamiast ${row.g}`);
      if (pr.mecze.reduce((s, m) => s + m.pf, 0) !== row.pf) throw new Error(`Profil ${name}: punkty zdobyte nie zgadzają się z tabelą`);
      if (pr.mecze.some((m, i) => i && m.data < pr.mecze[i - 1].data)) throw new Error(`Profil ${name}: mecze nie są rosnąco po dacie`);
      if (pr.mecze.filter((m) => m.win).length !== row.w) throw new Error(`Profil ${name}: wygrane nie zgadzają się z tabelą`);
      if (pr.czynniki.length !== 8) throw new Error(`Profil ${name}: ${pr.czynniki.length} czynników zamiast 8`);
      for (const c of pr.czynniki) if (c.wartosc != null && (c.miejsce < 1 || c.miejsce > c.z)) throw new Error(`Profil ${name}: miejsce ${c.miejsce} poza zakresem 1–${c.z} (${c.key})`);
    }
    // miejsca w lidze: dla każdego czynnika zajęte są miejsca od 1, a remisy nie zostawiają dziur większych niż remis
    const profiles = names.map((nm) => teamProfile(nm, md, dr, { okno })).filter(Boolean);
    for (const key of Object.keys(FACTOR_BETTER)) {
      const places = profiles.map((p) => p.czynniki.find((c) => c.key === key).miejsce).filter((v) => v != null).sort((a, b) => a - b);
      if (places[0] !== 1) throw new Error(`Profil: czynnik ${key} nie ma 1. miejsca`);
      places.forEach((v, i) => { if (v > i + 1) throw new Error(`Profil: czynnik ${key}: miejsce ${v} na pozycji ${i + 1} listy`); });
    }
    // NetRtg ważony posiadaniami z listy meczów równa się wartości z rankingu (po zaokrągleniu do 0,1)
    if (okno === 0) for (const p of profiles) {
      const net = (p.mecze.reduce((s, m) => s + m.pf - m.pa, 0) / p.mecze.reduce((s, m) => s + m.poss, 0) * 100);
      const shown = (net > 0.05 ? '+' : '') + net.toFixed(1).replace('.', ',');
      if (shown !== p.ranking.net) throw new Error(`Profil ${p.druzyna}: NetRtg z meczów ${shown}, ranking ${p.ranking.net}`);
    }
  }
  if (!withGames) throw new Error('Profil: żadna drużyna nie ma meczów');
}
// kwarty: suma kwart każdego meczu równa się wynikowi; w profilu średnie kwart odtwarzają punkty z dopasowanych meczów
{
  const kw = load('kwarty');
  const kwMap = Array.isArray(kw) ? {} : kw;
  const ptsOf = new Map();
  for (const r of md) { const k = String(r.mecz_id); ptsOf.set(k, [...(ptsOf.get(k) || []), Number(r.pts)]); }
  for (const [id, q] of Object.entries(kwMap)) {
    const a = q.reduce((t, x) => t + x[0], 0), b = q.reduce((t, x) => t + x[1], 0);
    const w = ptsOf.get(id);
    if (!w) throw new Error(`Kwarty: mecz ${id} nie ma wyniku w mecze_druzyn`);
    if ([a, b].sort((x, y) => x - y).join(':') !== w.slice().sort((x, y) => x - y).join(':')) throw new Error(`Kwarty: mecz ${id} suma ${a}:${b}, wynik ${w.join(':')}`);
    if (!q.flat().every((v) => Number.isInteger(v) && v >= 0)) throw new Error(`Kwarty: mecz ${id} ma wartości inne niż liczby`);
  }
  if (Object.keys(kwMap).length) {
    for (const t of new Set(md.map((r) => r.druzyna))) {
      const p = teamProfile(t, md, dr, { kwarty: kwMap });
      if (!p.kwarty) throw new Error(`Kwarty: ${t} bez kwart`);
      const used = p.mecze.filter((m) => kwMap[String(m.mecz_id)]);
      const pf = used.reduce((s, m) => s + m.pf, 0), pa = used.reduce((s, m) => s + m.pa, 0);
      const own = p.kwarty.own.reduce((s, v) => s + v, 0) * p.kwarty.mecze, opp = p.kwarty.opp.reduce((s, v) => s + v, 0) * p.kwarty.mecze;
      const ot = used.some((m) => kwMap[String(m.mecz_id)].length > 4);
      if (!ot && (Math.abs(own - pf) > 1e-6 || Math.abs(opp - pa) > 1e-6)) throw new Error(`Kwarty ${t}: ${own}:${opp} zamiast ${pf}:${pa}`);
    }
  }
}
// zakres niepewności NetRtg: lo ≤ net ≤ hi, net zgodny z rankTeams, brak zakresu poniżej 3 meczów, powtarzalny wynik
// odchylenie zbiorcze ligi policzone niezależnie od silnika (te same mecze w zakresie)
const leagueVar = (okno) => {
  const n = (x) => Number(x) || 0, poss = (t) => n(t.fga) + 0.44 * n(t.fta) - n(t.oreb) + n(t.to);
  const g = new Map(md.map((r) => [r.mecz_id + '|' + r.druzyna, r])), by = new Map();
  const per = new Map();
  for (const r of md) (per.get(r.druzyna) || per.set(r.druzyna, []).get(r.druzyna)).push(r);
  for (const [t, list] of per) {
    list.sort((a, b) => Number(a.kolejka) - Number(b.kolejka) || String(a.data || '').localeCompare(String(b.data || '')));
    for (const r of okno ? list.slice(-okno) : list) {
      const o = g.get(r.mecz_id + '|' + r.rywal); if (!o) continue;
      const p = (poss(r) + poss(o)) / 2; if (!p) continue;
      (by.get(t) || by.set(t, []).get(t)).push((n(r.pts) - n(o.pts)) / p * 100);
    }
  }
  let ss = 0, df = 0;
  for (const m of by.values()) if (m.length > 1) { const mu = m.reduce((a, b) => a + b, 0) / m.length; ss += m.reduce((s, x) => s + (x - mu) ** 2, 0); df += m.length - 1; }
  return ss / df;
};
const minSd = (okno, g) => Math.sqrt(leagueVar(okno) * 4 / (g - 1 + 4));
for (const okno of [0, 5]) {
  const rr = ratingRange(md, { okno }), rk = rankTeams(md, dr, { okno });
  const rr2 = ratingRange(md, { okno });
  for (const [t, x] of rr) {
    const row = rk.find((r) => r.druzyna === t);
    if (!(x.lo <= x.net && x.net <= x.hi && x.se >= 0)) throw new Error(`Zakres ${t}: lo ${x.lo}, net ${x.net}, hi ${x.hi}`);
    if (row.net !== (x.net > 0.05 ? '+' : '') + x.net.toFixed(1).replace('.', ',')) throw new Error(`Zakres ${t}: net ${x.net} inny niż w rankingu ${row.net}`);
    if (!row.zakres.includes(' do ')) throw new Error(`Zakres ${t}: brak napisu w rankTeams`);
    if (JSON.stringify(x) !== JSON.stringify(rr2.get(t))) throw new Error(`Zakres ${t}: wynik niepowtarzalny`);
    // dolna granica z łączenia z ligą: sd ≥ sd_l · √(K / (g − 1 + K)), więc szerokość nie spada do zera przy kilku podobnych meczach
    if (x.se * Math.sqrt(x.g) < minSd(okno, x.g) - 1e-9) throw new Error(`Zakres ${t}: sd ${x.se * Math.sqrt(x.g)} poniżej granicy ${minSd(okno, x.g)}`);
  }
  for (const r of rk) if (r.miejsce && !rr.has(r.druzyna) && r.zakres !== '-') throw new Error(`Zakres ${r.druzyna}: napis bez liczb`);
}
{
  const two = md.filter((r) => Number(r.kolejka) <= 2);
  const rr = ratingRange(two), cnt = new Map();
  for (const r of two) cnt.set(r.druzyna, (cnt.get(r.druzyna) || 0) + 1);
  for (const [t, g] of cnt) if ((g < 3) === rr.has(t)) throw new Error(`Zakres: drużyna ${t} z ${g} meczami ${rr.has(t) ? 'ma' : 'nie ma'} zakresu`);
  // ręczny przykład: trzy sztuczne mecze A–B. Obie drużyny mają tę samą sumę kwadratów odchyleń ss, więc
  // var ligi = 2ss / 4, sd² = (ss + 4 · ss/2) / (2 + 4) = ss / 2, t dla 2 + 4 = 6 stopni swobody = 1,440
  const mk = (id, k, d, pts, rywal) => ({ mecz_id: id, kolejka: k, data: '2026-10-0' + k, druzyna: d, rywal, pts, fga: 50, fta: 0, oreb: 0, to: 0 });
  const fake = [];
  [[60, 50], [70, 60], [50, 60]].forEach(([a, b], i) => { fake.push(mk(900 + i, i + 1, 'A', a, 'B'), mk(900 + i, i + 1, 'B', b, 'A')); });
  const x = ratingRange(fake).get('A');
  const m = [10, 10, -10].map((v) => v / 50 * 100), mean = m.reduce((s, v) => s + v, 0) / 3;
  const se = Math.sqrt(m.reduce((s, v) => s + (v - mean) ** 2, 0) / 2) / Math.sqrt(3);
  if (Math.abs(x.hi - x.net - 1.440 * se) > 1e-9 || Math.abs(x.net - mean) > 1e-9) throw new Error(`Zakres: ręczny przykład ${JSON.stringify(x)}, oczekiwano se ${se}`);
}
// PER i EWA tylko przy progu rankingu: każdy wiersz z PER ma co najmniej połowę meczów swojej drużyny
if (zw.length) {
  const tg = new Map(); for (const r of md) tg.set(r.druzyna, (tg.get(r.druzyna) || 0) + 1);
  for (const r of players) if (r.per !== '-' && Number(r.g) < 0.5 * tg.get(r.druzyna)) throw new Error(`PER ${r.zawodnik}: ${r.g} meczów, poniżej progu`);
}
// gameSummary: punkty zgodne z mecze_druzyn, czynniki obu drużyn lustrzane, trzech najlepszych według GmSc, kwarty zgodne z wynikiem
{
  const kw = existsSync(new URL('../data/kwarty.json', import.meta.url)) ? JSON.parse(readFileSync(new URL('../data/kwarty.json', import.meta.url), 'utf8')) : null;
  const ids = [...new Set(md.map((r) => r.mecz_id))];
  const fl = new Set(forecastLog(md).map((e) => String(e.mecz_id)));
  let sprawdzone = 0, zKwartami = 0;
  if (gameSummary(-1, md, zw) !== null) throw new Error('gameSummary: nieznany mecz powinien dać null');
  for (const id of ids) {
    const rows = md.filter((r) => r.mecz_id === id);
    if (rows.length !== 2) { if (gameSummary(id, md, zw) !== null) throw new Error(`gameSummary ${id}: mecz bez dwóch stron powinien dać null`); continue; }
    const g = gameSummary(id, md, zw, { kwarty: kw || undefined });
    sprawdzone++;
    const [a, b] = g.teams;
    for (const t of g.teams) {
      const row = rows.find((r) => r.druzyna === t.druzyna), opp = rows.find((r) => r.druzyna !== t.druzyna);
      if (t.pts !== Number(row.pts) || t.opp !== Number(opp.pts) || t.rywal !== opp.druzyna) throw new Error(`gameSummary ${id}: wynik ${t.druzyna} nie zgadza się z mecze_druzyn`);
    }
    if (Math.abs(a.ortg - b.drtg) > 1e-9 || Math.abs(a.drtg - b.ortg) > 1e-9) throw new Error(`gameSummary ${id}: ORtg i DRtg nie są lustrzane`);
    const mirror = [['efg', 'oefg'], ['tov', 'otov'], ['ftr', 'oftr']];
    for (const [x, y] of mirror) {
      if (Math.abs(a.czynniki[x] - b.czynniki[y]) > 1e-9 || Math.abs(b.czynniki[x] - a.czynniki[y]) > 1e-9) throw new Error(`gameSummary ${id}: ${x} jednej drużyny ≠ ${y} drugiej`);
    }
    if (Math.abs(a.czynniki.orb - (100 - b.czynniki.drb)) > 1e-9 || Math.abs(b.czynniki.orb - (100 - a.czynniki.drb)) > 1e-9) throw new Error(`gameSummary ${id}: zbiórka w ataku i obronie nie są lustrzane`);
    if ((g.szansa !== null) !== fl.has(String(id))) throw new Error(`gameSummary ${id}: szansa niezgodna z forecastLog`);
    for (const t of g.teams) {
      if (t.najlepsi.length > 3 || t.najlepsi.some((p, i) => i && p.gmsc > t.najlepsi[i - 1].gmsc)) throw new Error(`gameSummary ${id}: najlepsi źle uporządkowani`);
      if (zw.length) {
        const all = zw.filter((z) => z.mecz_id === id && z.druzyna === t.druzyna && (Number(String(z.min).split(':')[0]) > 0 || Number(String(z.min).split(':')[1]) > 0));
        const best = Math.max(...all.map(gmscOf));
        if (all.length && Math.abs(t.najlepsi[0].gmsc - best) > 1e-9) throw new Error(`gameSummary ${id}: najlepszy GmSc ${t.najlepsi[0].gmsc} zamiast ${best}`);
      }
      if (t.kwarty) {
        zKwartami++;
        if (t.kwarty.length !== 4 || t.kwarty.reduce((s, q) => s + q[0], 0) !== t.pts || t.kwarty.reduce((s, q) => s + q[1], 0) !== t.opp) throw new Error(`gameSummary ${id}: kwarty ${t.druzyna} nie sumują się do wyniku`);
      }
    }
  }
  if (!sprawdzone) throw new Error('gameSummary: brak meczów do sprawdzenia');
  console.log(`gameSummary: ${sprawdzone} meczów, kwarty w ${zKwartami / 2 | 0} z nich`);
}
console.log('OK');
