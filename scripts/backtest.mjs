// Sprawdzenie modelu zapowiedzi na rozegranych meczach (tylko do konsoli, nic nie zapisuje).
// Każdy mecz jest przewidywany wyłącznie z meczów z wcześniejszych dni. Porównuje źródła oceny drużyn
// (NetRtg jak na stronie, ocena po korekcie o siłę rywali, NetRtg z przyciętymi pogromami) i wartości WIN_SIGMA.
// Użycie: node scripts/backtest.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { winChance, adjustedRatings, forecastLog, FORECAST_MIN_GAMES, WIN_SIGMA, WIN_SHRINK } = require('../src/ranking.js');
const md = JSON.parse(readFileSync(new URL('../data/mecze_druzyn.json', import.meta.url), 'utf8'));
const n = (x) => Number(x) || 0;
const poss = (t) => n(t.fga) + 0.44 * n(t.fta) - n(t.oreb) + n(t.to);
const gk = (r, team) => 'm' + r.mecz_id + '|' + team;
const erf = (x) => { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)); };
const phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

// Źródła oceny: funkcja (wcześniejsze mecze) -> (a, b) -> oczekiwana różnica punktów.
const perGame = (prior) => {
  const game = new Map(prior.map((r) => [gk(r, r.druzyna), r]));
  const by = new Map(); let ps = 0, c = 0;
  for (const r of prior) {
    const o = game.get(gk(r, r.rywal)); if (!o) continue;
    const p = (poss(r) + poss(o)) / 2; if (!p) continue;
    if (!by.has(r.druzyna)) by.set(r.druzyna, []);
    by.get(r.druzyna).push((n(r.pts) - n(o.pts)) / p * 100); ps += p; c++;
  }
  return { by, pace: c ? ps / c : 80, game };
};
const clipped = (cap) => (prior) => {
  const { by, pace } = perGame(prior);
  const rating = (t) => { const g = by.get(t) || []; return g.length ? g.reduce((s, m) => s + Math.max(-cap, Math.min(cap, m)), 0) / (g.length + WIN_SHRINK) : 0; };
  return (a, b) => (rating(a) - rating(b)) / 100 * pace;
};
const sources = {
  'NetRtg (strona)': (prior) => winChance(prior).margin,
  'Po korekcie': (prior) => { const { pace, game } = perGame(prior); const r = adjustedRatings(prior, game); const v = (t) => (r.get(t) || { adj: 0 }).adj; return (a, b) => (v(a) - v(b)) / 100 * pace; },
  'NetRtg, mecz do ±40': clipped(40),
  'NetRtg, mecz do ±25': clipped(25),
};

const base = forecastLog(md); // te same mecze dla wszystkich wariantów
const rows = (src) => base.map((g) => {
  const prior = md.filter((r) => r.data < g.data);
  return { exp: src(prior)(g.a, g.b), real: g.roznica };
});
const score = (rs, sigma) => {
  const N = rs.length; let hit = 0, conf = 0, brier = 0, ll = 0;
  for (const r of rs) { const p = phi(r.exp / sigma), w = r.real > 0 ? 1 : 0; hit += (p >= 0.5) === (w === 1); conf += Math.max(p, 1 - p); brier += (p - w) ** 2; ll -= Math.log(Math.max(1e-9, w ? p : 1 - p)); }
  return { hit, acc: hit / N, conf: conf / N, brier: brier / N, ll: ll / N };
};
const pct = (x) => (x * 100).toFixed(0).padStart(3) + '%';
console.log(`Mecze w rozliczeniu: ${base.length} (obie drużyny miały wcześniej po ${FORECAST_MIN_GAMES} mecze), wszystkich w bazie ${new Set(md.map((r) => r.mecz_id)).size}`);
console.log(`\nŹródło oceny (WIN_SIGMA = ${WIN_SIGMA}):`);
for (const [name, src] of Object.entries(sources)) {
  const rs = rows(src), s = score(rs, WIN_SIGMA);
  const mae = rs.reduce((a, r) => a + Math.abs(r.real - r.exp), 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((a, r) => a + (r.real - r.exp) ** 2, 0) / rs.length);
  console.log(`  ${name.padEnd(22)} faworyt ${String(s.hit).padStart(2)}/${rs.length} ${pct(s.acc)}  pewność ${pct(s.conf)}  Brier ${s.brier.toFixed(3)}  logloss ${s.ll.toFixed(3)}  błąd różnicy ${mae.toFixed(1)} pkt  odchylenie ${sd.toFixed(1)}`);
}
console.log('\nWIN_SIGMA dla źródeł (Brier / pewność):');
for (const [name, src] of Object.entries(sources)) {
  const rs = rows(src);
  console.log('  ' + name.padEnd(22) + [10, 12, 15, 18, 21, 25, 30].map((sg) => { const s = score(rs, sg); return `σ${sg}: ${s.brier.toFixed(3)} ${pct(s.conf)}`; }).join('  '));
}
console.log('\nKalibracja strony (pewność faworyta -> ile razy wygrał):');
for (const [lo, hi] of [[0.5, 0.65], [0.65, 0.8], [0.8, 0.95], [0.95, 1.01]]) {
  const s = base.filter((r) => r.pewnosc >= lo && r.pewnosc < hi);
  if (s.length) console.log(`  ${pct(lo)}–${pct(Math.min(hi, 1))}: ${s.filter((r) => r.trafiony).length} z ${s.length}, średnia pewność ${pct(s.reduce((a, r) => a + r.pewnosc, 0) / s.length)}`);
}
console.log('\nNajwiększe pomyłki strony:');
for (const r of base.filter((x) => !x.trafiony).sort((x, y) => y.pewnosc - x.pewnosc).slice(0, 5)) console.log(`  kol. ${r.kolejka} ${r.a} ${r.pa}:${r.pb} ${r.b} – faworyt ${r.faworyt} ${pct(r.pewnosc)}`);
