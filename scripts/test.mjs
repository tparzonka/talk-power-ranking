// Szybki test: liczy rankingi z data/*.json i wypisuje czołówkę.
// Użycie: node scripts/test.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { rankTeams, rankPlayers, leagueTable, winChance, forecastLog, SUM_KEYS, teamTotals, fourFactors, FACTOR_BETTER, teamProfile } = require('../src/ranking.js');
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
console.log('OK');
