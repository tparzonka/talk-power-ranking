// Stabilność oceny zawodników (konsola, zadanie 3.3): ocena z meczów kolejek nieparzystych i parzystych,
// korelacja między połowami dla dwóch wariantów „siły rywali”: średni NetRtg rywali (stary) i średnia ocena rywali po korekcie (obecny na stronie od 21.11).
// Użycie: node scripts/stabilnosc.mjs
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { rankPlayers } = require('../src/ranking.js');
const load = (n) => { const u = new URL(`../data/${n}.json`, import.meta.url); return existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : []; };
const md = load('mecze_druzyn'), zw = load('zawodnicy');
if (!zw.length) { console.log('Brak data/zawodnicy.json (dane tylko lokalnie).'); process.exit(0); }
const num = (s) => Number(String(s).replace(',', '.'));
const score = (z, m, opts) => new Map(rankPlayers(z, m, opts).filter((r) => r.pozycja === 'wszyscy').map((r) => [r.zawodnik, num(r.ocena)]));
const place = (z, m, opts) => new Map(rankPlayers(z, m, opts).filter((r) => r.pozycja === 'wszyscy').map((r) => [r.zawodnik, r.miejsce]));
const pearson = (xs, ys) => {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { c += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2; }
  return c / Math.sqrt(vx * vy);
};
const half = (odd) => {
  const keep = (r) => (Number(r.kolejka) % 2 === 1) === odd;
  return [zw.filter(keep), md.filter(keep)];
};
const [zA, mA] = half(true), [zB, mB] = half(false);
const res = {};
for (const [nm, opts] of [['NetRtg rywali (stary)', { rywaleSurowe: true }], ['ocena rywali po korekcie', {}]]) {
  const a = score(zA, mA, opts), b = score(zB, mB, opts);
  const both = [...a.keys()].filter((k) => b.has(k));
  res[nm] = { r: pearson(both.map((k) => a.get(k)), both.map((k) => b.get(k))), n: both.length };
  console.log(`${nm.padEnd(26)} korelacja połówek ${res[nm].r.toFixed(3)} (zawodników w obu połówkach: ${res[nm].n})`);
}
const p0 = place(zw, md, { rywaleSurowe: true }), p1 = place(zw, md, {});
const top = [...p0].filter(([, m]) => m <= 20);
const moves = top.map(([k, m]) => Math.abs(p1.get(k) - m));
console.log(`czołowa 20 (cały sezon): średnia zmiana miejsca ${(moves.reduce((a, b) => a + b, 0) / moves.length).toFixed(2)}, największa ${Math.max(...moves)}`);
const all = [...p0].map(([k, m]) => Math.abs(p1.get(k) - m));
console.log(`wszyscy (${all.length}): zmiana > 5 miejsc u ${all.filter((x) => x > 5).length}, średnio ${(all.reduce((a, b) => a + b, 0) / all.length).toFixed(2)}`);
