// Szybki test: liczy rankingi z data/*.json i wypisuje czołówkę.
// Użycie: node scripts/test.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { rankTeams, rankPlayers, leagueTable, winChance, forecastLog } = require('../src/ranking.js');
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
console.log('OK');
