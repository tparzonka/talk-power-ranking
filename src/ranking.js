// Funkcje rankingu. Czyste funkcje bez DOM, używane przez stronę publiczną (src/template.html)
// i przez testy (scripts/test.mjs).
// Klucz meczu: ID meczu z protokołu (gdy brak – numer kolejki) + drużyna.
const gk = (r, team) => (r.mecz_id != null ? 'm' + r.mecz_id : 'k' + r.kolejka) + '|' + team;

// opts.okno: liczba ostatnich meczów każdej drużyny / zawodnika (puste = cały sezon).
const lastGames = (rows, keyOf, okno) => {
  if (!okno) return rows;
  const by = new Map();
  for (const r of rows) { const k = keyOf(r); if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  const keep = new Set();
  for (const list of by.values()) {
    list.sort((a, b) => Number(a.kolejka) - Number(b.kolejka) || String(a.data || '').localeCompare(String(b.data || '')));
    list.slice(-okno).forEach((r) => keep.add(r));
  }
  return rows.filter((r) => keep.has(r));
};

const rankTeams = (mecze_druzyn, druzyny, opts = {}) => {
  const n = (x) => Number(x) || 0;
  const poss = (t) => n(t.fga) + 0.44 * n(t.fta) - n(t.oreb) + n(t.to);
  const f1 = (x) => x.toFixed(1).replace('.', ',');
  const sign = (x) => (x > 0.05 ? '+' : '') + f1(x);
  const game = new Map(mecze_druzyn.map((r) => [gk(r, r.druzyna), r]));
  const acc = new Map();
  for (const r of lastGames(mecze_druzyn, (x) => x.druzyna, opts.okno)) {
    const o = game.get(gk(r, r.rywal));
    if (!o) continue;
    const a = acc.get(r.druzyna) || { druzyna: r.druzyna, g: 0, w: 0, pf: 0, pa: 0, poss: 0 };
    a.g += 1; a.pf += n(r.pts); a.pa += n(o.pts); a.poss += (poss(r) + poss(o)) / 2;
    if (n(r.pts) > n(o.pts)) a.w += 1;
    acc.set(r.druzyna, a);
  }
  const notes = new Map(druzyny.map((d) => [d.druzyna, d.uwagi]));
  return [...acc.values()]
    .map((a) => ({ a, net: (a.pf - a.pa) / a.poss * 100, mov: (a.pf - a.pa) / a.g }))
    .sort((x, y) => y.net - x.net || y.mov - x.mov)
    .map(({ a, net, mov }, i) => ({
      miejsce: i + 1, druzyna: a.druzyna, bilans: a.w + '-' + (a.g - a.w),
      net: sign(net), ortg: f1(a.pf / a.poss * 100), drtg: f1(a.pa / a.poss * 100),
      poss: f1(a.poss / a.g), mov: sign(mov), uwagi: notes.get(a.druzyna) || ''
    }))
    .concat(druzyny.filter((d) => !acc.has(d.druzyna)).map((d) => ({
      miejsce: null, druzyna: d.druzyna, bilans: '0-0', net: '-', ortg: '-', drtg: '-', poss: '-', mov: '-', uwagi: d.uwagi || ''
    })));
};

// PER (John Hollinger, wzór jak na Basketball-Reference) i EWA (Estimated Wins Added).
// PER: stałe ligowe z całego sezonu naszej ligi, średnia ligi = 15.
// EWA: liczona dopiero od 5. kolejki. Poziom rezerwowego 11,5. Stałe NBA przeskalowane:
//   dzielnik VA = 28 / punkty ligi na minutę zawodnika (dla NBA ery Hollingera daje 67),
//   punkty na zwycięstwo = 1 / nachylenie (procent zwycięstw ~ średnia różnica punktów) z wyników naszych drużyn.
const EWA_OD_KOLEJKI = 5;
const hollinger = (zawodnicy, mecze_druzyn, okno) => {
  const n = (x) => Number(x) || 0;
  const mins = (m) => { const p = String(m).split(':').map(Number); return (p[0] || 0) + (p[1] || 0) / 60; };
  const poss = (t) => n(t.fga) + 0.44 * n(t.fta) - n(t.oreb) + n(t.to);
  const game = new Map(mecze_druzyn.map((r) => [gk(r, r.druzyna), r]));
  const L = { pts: 0, fgm: 0, fga: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, pf: 0, to: 0, poss: 0, games: 0, min: 0 };
  const teams = new Map();
  for (const r of mecze_druzyn) {
    const o = game.get(gk(r, r.rywal));
    if (!o) continue;
    for (const k of ['pts', 'fgm', 'fga', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'pf', 'to']) L[k] += n(r[k]);
    L.poss += (poss(r) + poss(o)) / 2; L.games += 1; L.min += 200;
    const tm = teams.get(r.druzyna) || { g: 0, w: 0, diff: 0 };
    tm.g += 1; tm.diff += n(r.pts) - n(o.pts); if (n(r.pts) > n(o.pts)) tm.w += 1;
    teams.set(r.druzyna, tm);
  }
  const out = new Map();
  if (!L.games || !L.fgm || !L.ftm || !L.pf) return out;
  const lgTRB = L.oreb + L.dreb;
  const factor = 2 / 3 - (0.5 * (L.ast / L.fgm)) / (2 * (L.fgm / L.ftm));
  const VOP = L.pts / (L.fga - L.oreb + L.to + 0.44 * L.fta);
  const DRBP = (lgTRB - L.oreb) / lgTRB;
  const lgPace = L.poss / L.games;
  const pfTerm = L.ftm / L.pf - 0.44 * (L.fta / L.pf) * VOP;
  const by = new Map();
  for (const z of zawodnicy) {
    if (mins(z.min) <= 0 || !game.has(gk(z, z.druzyna))) continue;
    if (!by.has(z.zawodnik)) by.set(z.zawodnik, []);
    by.get(z.zawodnik).push(z);
  }
  const raw = [];
  for (const [name, all] of by) {
    all.sort((a, b) => n(a.kolejka) - n(b.kolejka));
    const gs = okno ? all.slice(-okno) : all;
    const s = { min: 0, tpm: 0, ast: 0, fgm: 0, fga: 0, ftm: 0, fta: 0, to: 0, oreb: 0, dreb: 0, stl: 0, blk: 0, pf: 0 };
    let tmAst = 0, tmFg = 0, tmPoss = 0;
    for (const z of gs) {
      s.min += mins(z.min);
      for (const k of ['tpm', 'ast', 'fgm', 'fga', 'ftm', 'fta', 'to', 'oreb', 'dreb', 'stl', 'blk', 'pf']) s[k] += n(z[k]);
      const t = game.get(gk(z, z.druzyna)), o = game.get(gk(z, t.rywal));
      tmAst += n(t.ast); tmFg += n(t.fgm); tmPoss += o ? (poss(t) + poss(o)) / 2 : poss(t);
    }
    if (!s.min || !tmFg) continue;
    const r = tmAst / tmFg;
    const uPER = (1 / s.min) * (s.tpm + (2 / 3) * s.ast + (2 - factor * r) * s.fgm
      + s.ftm * 0.5 * (1 + (1 - r) + (2 / 3) * r) - VOP * s.to - VOP * DRBP * (s.fga - s.fgm)
      - VOP * 0.44 * (0.44 + 0.56 * DRBP) * (s.fta - s.ftm) + VOP * (1 - DRBP) * s.dreb + VOP * DRBP * s.oreb
      + VOP * s.stl + VOP * DRBP * s.blk - s.pf * pfTerm);
    const tmPace = tmPoss / gs.length;
    raw.push({ name, min: s.min, aPER: (lgPace / tmPace) * uPER });
  }
  const totMin = raw.reduce((a, x) => a + x.min, 0);
  const lgA = raw.reduce((a, x) => a + x.aPER * x.min, 0) / (totMin || 1);
  const rounds = Math.max(0, ...mecze_druzyn.map((r) => n(r.kolejka)));
  let ppw = null;
  if (rounds >= EWA_OD_KOLEJKI) {
    let num = 0, den = 0;
    for (const tm of teams.values()) {
      if (tm.g < 3) continue;
      const m = tm.diff / tm.g;
      num += m * (tm.w / tm.g - 0.5); den += m * m;
    }
    if (num > 0 && den > 0) ppw = den / num;
  }
  const C = 28 / (L.pts / L.min);
  for (const x of raw) {
    const per = lgA ? x.aPER * 15 / lgA : null;
    const ewa = ppw && per !== null ? (x.min * (per - 11.5) / C) / ppw : null;
    out.set(x.name, { per, ewa });
  }
  return out;
};


/* Pozycja dla zawodnika bez pozycji w systemie ligi: ta, której średni wzrost w lidze jest najbliższy jego wzrostowi.
   Średnie liczone z zawodników mających pozycję (pierwsza wpisana) i wzrost; przy mniej niż 3 zawodnikach na pozycji
   (początek sezonu) obowiązują stałe progi. */
const POZYCJE = ['rozgrywający', 'rzucający', 'niski skrzydłowy', 'silny skrzydłowy', 'środkowy'];
const positionByHeight = (zawodnicy) => {
  const last = new Map();
  for (const z of zawodnicy) last.set(z.zawodnik, z);
  const sum = new Map(POZYCJE.map((p) => [p, { s: 0, c: 0 }]));
  for (const z of last.values()) {
    const a = sum.get(String(z.pozycje || '').split('/')[0].trim());
    const h = Number(z.wzrost) || 0;
    if (a && h) { a.s += h; a.c += 1; }
  }
  const means = POZYCJE.map((p) => (sum.get(p).c >= 3 ? sum.get(p).s / sum.get(p).c : null));
  const fixed = (cm) => (cm >= 200 ? 'środkowy' : cm >= 195 ? 'silny skrzydłowy'
    : cm >= 190 ? 'niski skrzydłowy' : cm >= 184 ? 'rzucający' : 'rozgrywający');
  return (cm) => {
    if (!cm) return '';
    if (means.some((m) => m === null)) return fixed(cm);
    let best = 0;
    means.forEach((m, i) => { if (Math.abs(cm - m) < Math.abs(cm - means[best])) best = i; });
    return POZYCJE[best];
  };
};

const SHRINK = 60; // akcji na boisku, przy których wynik +/- liczy się w połowie
const rankPlayers = (zawodnicy, mecze_druzyn, opts = {}) => {
  const MIN_AVG = 15;
  const POS = ['rozgrywający', 'rzucający', 'niski skrzydłowy', 'silny skrzydłowy', 'środkowy'];
  const byHeight = positionByHeight(zawodnicy);
  const n = (x) => Number(x) || 0;
  const f1 = (x) => x.toFixed(1).replace('.', ',');
  const sign = (x) => (x > 0.05 ? '+' : '') + f1(x);
  const avg = (x) => (Number.isInteger(x) ? String(x) : f1(x));
  const mins = (m) => { const p = String(m).split(':').map(Number); return p[0] + (p[1] || 0) / 60; };
  const poss = (t) => n(t.fga) + 0.44 * n(t.fta) - n(t.oreb) + n(t.to);
  const events = (s) => n(s.pts) + n(s.fgm) + n(s.ftm) - n(s.fga) - n(s.fta) + n(s.dreb) + 0.5 * n(s.oreb)
    + n(s.ast) + n(s.stl) + 0.5 * n(s.blk) - n(s.pf) - n(s.to);
  const game = new Map(mecze_druzyn.map((r) => [gk(r, r.druzyna), r]));
  const team = new Map();
  for (const r of mecze_druzyn) {
    const o = game.get(gk(r, r.rywal));
    if (!o) continue;
    const t = team.get(r.druzyna) || { diff: 0, poss: 0 };
    t.diff += n(r.pts) - n(o.pts); t.poss += (poss(r) + poss(o)) / 2;
    team.set(r.druzyna, t);
  }
  const teamNet = (d) => { const t = team.get(d); return t && t.poss ? t.diff / t.poss * 100 : 0; };
  const pmBase = new Map();
  for (const z of zawodnicy) {
    const k = gk(z, z.druzyna);
    pmBase.set(k, (pmBase.get(k) || 0) + n(z.pm) / 5);
  }
  const byPlayer = new Map();
  for (const z of zawodnicy) {
    const t = game.get(gk(z, z.druzyna));
    const o = t && game.get(gk(z, t.rywal));
    if (!o) continue;
    if (!byPlayer.has(z.zawodnik)) byPlayer.set(z.zawodnik, []);
    byPlayer.get(z.zawodnik).push({ z, t, o });
  }
  const list = [];
  for (const [name, all] of byPlayer) {
    all.sort((a, b) => n(a.z.kolejka) - n(b.z.kolejka));
    const gs = opts.okno ? all.slice(-opts.okno) : all;
    if (gs.reduce((s, g) => s + mins(g.z.min), 0) / gs.length < MIN_AVG) continue;
    const p = { name, druzyna: gs[gs.length - 1].z.druzyna, pozycje: gs[gs.length - 1].z.pozycje, wzrost: gs[gs.length - 1].z.wzrost, g: gs.length,
      onPm: 0, onPoss: 0, offPm: 0, offPoss: 0, wins: 0, pts: 0, fgm: 0, tpm: 0, fga: 0, fta: 0, use: 0, teamUse: 0, min: 0,
      pie: 0, opp: 0, sPts: 0, sReb: 0, sAst: 0, sEval: 0, sGm: 0 };
    const recent = gs;
    for (const { z, t, o } of recent) {
      const m = mins(z.min), gp = (poss(t) + poss(o)) / 2;
      // +/- z protokołu dopasowany do wyniku: suma +/- drużyny musi wynosić 5 × różnica punktów.
      // Brakujące lub nadmiarowe punkty rozdzielone proporcjonalnie do minut.
      const k = gk(z, z.druzyna), margin = n(t.pts) - n(o.pts);
      const pm = n(z.pm) + (5 * margin - 5 * pmBase.get(k)) * m / 200;
      p.onPm += pm; p.onPoss += gp * m / 40;
      p.offPm += margin - pm; p.offPoss += gp * (40 - m) / 40;
      if (n(t.pts) > n(o.pts)) p.wins += 1;
      p.pts += n(z.pts); p.fgm += n(z.fgm); p.tpm += n(z.tpm); p.fga += n(z.fga); p.fta += n(z.fta); p.min += m;
      p.use += n(z.fga) + 0.44 * n(z.fta) + n(z.to); p.teamUse += n(t.fga) + 0.44 * n(t.fta) + n(t.to);
    }
    p.k = recent.length;
    for (const { z, t, o } of gs) {
      p.pie += events(z) / (events(t) + events(o)) * 100; p.opp += teamNet(o.druzyna);
      p.sPts += n(z.pts); p.sReb += n(z.oreb) + n(z.dreb); p.sAst += n(z.ast); p.sEval += n(z.eval);
      p.sGm += n(z.pts) + 0.4 * n(z.fgm) - 0.7 * n(z.fga) - 0.4 * (n(z.fta) - n(z.ftm)) + 0.7 * n(z.oreb) + 0.3 * n(z.dreb)
        + n(z.stl) + 0.7 * n(z.ast) + 0.7 * n(z.blk) - 0.4 * n(z.pf) - n(z.to);
    }
    // Mała próbka: wynik ściągany do średniej ligi (0) z wagą akcje / (akcje + SHRINK).
    const shrink = (x, ps) => x * ps / (ps + SHRINK);
    p.on = shrink(p.onPm / p.onPoss * 100, p.onPoss);
    p.off = p.offPoss >= 15 ? p.offPm / p.offPoss * 100 : null;
    p.diffOn = p.off === null ? null : shrink(p.onPm / p.onPoss * 100 - p.off, 1 / (1 / p.onPoss + 1 / p.offPoss));
    p.win = p.wins / p.k;
    p.shots = p.fga + 0.44 * p.fta;
    p.ts = p.shots ? p.pts / (2 * p.shots) * 100 : null;
    p.efg = p.fga ? (p.fgm + 0.5 * p.tpm) / p.fga * 100 : null;
    p.usg = 100 * p.use * (40 * p.k) / (p.min * p.teamUse);
    p.pie /= p.g; p.opp /= p.g;
    const listed = String(p.pozycje || '').split('/')[0].trim();
    p.glowna = listed || byHeight(n(p.wzrost));
    p.zWzrostu = !listed && !!p.glowna;
    list.push(p);
  }
  const lgShots = list.reduce((s, p) => s + p.shots, 0);
  const lgTs = lgShots ? list.reduce((s, p) => s + p.pts, 0) / (2 * lgShots) * 100 : 0;
  list.forEach((p) => { p.shoot = p.ts === null ? 0 : (p.ts - lgTs) * p.usg / 20; });
  const zOf = (key) => {
    const v = list.filter((p) => p[key] !== null).map((p) => p[key]);
    const mean = v.reduce((s, x) => s + x, 0) / (v.length || 1);
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (v.length || 1));
    return (x) => (x === null || !sd ? null : (x - mean) / sd);
  };
  const zOn = zOf('on'), zDiff = zOf('diffOn'), zWin = zOf('win'), zShoot = zOf('shoot'), zPie = zOf('pie'), zOpp = zOf('opp');
  const mean = (xs) => { const v = xs.filter((x) => x !== null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; };
  list.forEach((p) => {
    const w = opts.wagi || [0.40, 0.25, 0.20, 0.15];
    p.score = w[0] * mean([zOn(p.on), zDiff(p.diffOn), zWin(p.win)]) + w[1] * (zShoot(p.shoot) || 0)
      + w[2] * (zPie(p.pie) || 0) + w[3] * (zOpp(p.opp) || 0);
  });
  list.sort((a, b) => b.score - a.score || b.pie - a.pie);
  const hol = hollinger(zawodnicy, mecze_druzyn, opts.okno);
  const rows = [];
  for (const group of ['wszyscy', ...POS]) {
    list.filter((p) => group === 'wszyscy' || p.glowna === group)
      .forEach((p, i) => rows.push({
        id: group + '|' + p.name, pozycja: group, miejsce: i + 1, zawodnik: p.name, druzyna: p.druzyna, g: String(p.g),
        glowna: p.glowna ? p.glowna + (p.zWzrostu ? ' (wg wzrostu)' : '') : 'brak danych',
        ocena: f1(50 + 10 * p.score), on: sign(p.on), onoff: p.diffOn === null ? '-' : sign(p.diffOn),
        ts: p.ts === null ? '-' : f1(p.ts), efg: p.efg === null ? '-' : f1(p.efg), usg: f1(p.usg), pie: f1(p.pie),
        rywale: sign(p.opp), pkt: avg(p.sPts / p.g), zb: avg(p.sReb / p.g), as: avg(p.sAst / p.g), eval: avg(p.sEval / p.g), gmsc: f1(p.sGm / p.g),
        per: hol.get(p.name) && hol.get(p.name).per !== null ? f1(hol.get(p.name).per) : '-',
        ewa: hol.get(p.name) && hol.get(p.name).ewa !== null ? sign(hol.get(p.name).ewa) : '-'
      }));
  }
  return rows;
};

// Wyścig o nagrody za sezon. Zawsze cały sezon, niezależnie od przełącznika zakresu.
// Warunek: co najmniej połowa meczów swojej drużyny i średnio co najmniej 15 minut.
const awards = (zawodnicy, mecze_druzyn, wiek = {}) => {
  const n = (x) => Number(x) || 0;
  const mins = (m) => { const p = String(m).split(':').map(Number); return (p[0] || 0) + (p[1] || 0) / 60; };
  const f1 = (x) => x.toFixed(1).replace('.', ',');
  const sign = (x) => (x > 0.05 ? '+' : '') + f1(x);
  const gm = (z) => n(z.pts) + 0.4 * n(z.fgm) - 0.7 * n(z.fga) - 0.4 * (n(z.fta) - n(z.ftm)) + 0.7 * n(z.oreb) + 0.3 * n(z.dreb)
    + n(z.stl) + 0.7 * n(z.ast) + 0.7 * n(z.blk) - 0.4 * n(z.pf) - n(z.to);
  const teamGames = new Map();
  for (const r of mecze_druzyn) teamGames.set(r.druzyna, (teamGames.get(r.druzyna) || 0) + 1);
  const rounds = Math.max(0, ...mecze_druzyn.map((r) => n(r.kolejka)));
  const pl = new Map();
  for (const z of zawodnicy) {
    if (mins(z.min) <= 0) continue;
    const p = pl.get(z.zawodnik) || { name: z.zawodnik, g: 0, gs: 0, gsKnown: true, min: 0, pts: 0, druzyna: z.druzyna };
    p.g += 1; p.min += mins(z.min); p.pts += n(z.pts); p.druzyna = z.druzyna;
    if (z.s5 === true) p.gs += 1; else if (z.s5 !== false) p.gsKnown = false;
    pl.set(z.zawodnik, p);
  }
  const eligible = (p) => p && p.g >= 0.5 * (teamGames.get(p.druzyna) || 1) && p.min / p.g >= 15;
  const allRows = rankPlayers(zawodnicy, mecze_druzyn);
  const season = allRows.filter((r) => r.pozycja === 'wszyscy');
  const score = (r) => n(String(r.ocena).replace(',', '.'));
  const rated = season.filter((r) => eligible(pl.get(r.zawodnik)));
  const entry = (r, value) => ({ zawodnik: r.zawodnik || r.name, druzyna: r.druzyna, value });
  const top = (list, k = 5) => list.slice(0, k);
  const out = [];
  out.push({ key: 'mvp', title: 'MVP sezonu', rule: 'Najwyższa ocena w sezonie.',
    list: top(rated.map((r) => entry(r, f1(score(r))))) });
  out.push({ key: 'strzelec', title: 'Król strzelców', rule: 'Najwięcej punktów na mecz.',
    list: top([...pl.values()].filter(eligible).sort((a, b) => b.pts / b.g - a.pts / a.g).map((p) => entry(p, f1(p.pts / p.g) + ' pkt'))) });
  out.push({ key: 'rezerwowy', title: 'Najlepszy rezerwowy', rule: 'Więcej meczów z ławki niż w pierwszej piątce. Najwyższa ocena.',
    list: top(rated.filter((r) => { const p = pl.get(r.zawodnik); return p.gsKnown && p.gs * 2 < p.g; }).map((r) => entry(r, f1(score(r))))) });
  out.push({ key: 'mlodzi', title: 'Młody zawodnik sezonu', rule: 'Do 23 lat. Najwyższa ocena.',
    list: top(rated.filter((r) => wiek[r.zawodnik] === 'U23').map((r) => entry(r, f1(score(r))))) });
  out.push({ key: 'weteran', title: 'Weteran sezonu', rule: '45 lat i więcej. Najwyższa ocena.',
    list: top(rated.filter((r) => wiek[r.zawodnik] === '45+').map((r) => entry(r, f1(score(r))))) });
  const five = [];
  for (const [pos, label] of [['rozgrywający', 'Rozgrywający'], ['rzucający', 'Rzucający'], ['niski skrzydłowy', 'Niski skrzydłowy'],
    ['silny skrzydłowy', 'Silny skrzydłowy'], ['środkowy', 'Środkowy']]) {
    const r = allRows.find((x) => x.pozycja === pos && eligible(pl.get(x.zawodnik)));
    if (r) five.push({ ...entry(r, f1(score(r))), label });
  }
  out.push({ key: 'piatka', title: 'Piątka sezonu', rule: 'Najwyższa ocena na każdej pozycji.', list: five, positions: true });
  // Obrońca sezonu: 40% przechwyty + bloki na 40 minut, 25% DRB% (część zbiórek w obronie zebranych przez zawodnika,
  // gdy był na boisku), 25% obrona drużyny z nim (o ile DRtg drużyny w jego meczach jest lepszy od ligi, razy udział w minutach),
  // -10% faule na 40 minut. Każda część w odchyleniach od średniej uprawnionych zawodników, skala 50 ± 10.
  {
    const possG = (x) => n(x.fga) + 0.44 * n(x.fta) - n(x.oreb) + n(x.to);
    const gmap = new Map(mecze_druzyn.map((r) => [gk(r, r.druzyna), r]));
    let lgPts = 0, lgPoss = 0;
    for (const r of mecze_druzyn) { const o = gmap.get(gk(r, r.rywal)); if (o) { lgPts += n(o.pts); lgPoss += (possG(r) + possG(o)) / 2; } }
    const lgDrtg = lgPoss ? lgPts / lgPoss * 100 : 100;
    const d = new Map();
    for (const z of zawodnicy) {
      const m = mins(z.min); if (m <= 0) continue;
      const tm = gmap.get(gk(z, z.druzyna)), o = tm && gmap.get(gk(z, tm.rywal)); if (!o) continue;
      const x = d.get(z.zawodnik) || { g: 0, min: 0, stl: 0, blk: 0, dreb: 0, pf: 0, reb: 0, drtgW: 0 };
      const gp = (possG(tm) + possG(o)) / 2;
      x.g += 1; x.min += m; x.stl += n(z.stl); x.blk += n(z.blk); x.dreb += n(z.dreb); x.pf += n(z.pf);
      x.reb += n(tm.dreb) + n(o.oreb); x.drtgW += m * (gp ? n(o.pts) / gp * 100 : lgDrtg);
      d.set(z.zawodnik, x);
    }
    const cand = [...d.entries()].filter(([name]) => eligible(pl.get(name))).map(([name, x]) => ({
      name, x, stocks: (x.stl + x.blk) / x.min * 40, pf40: x.pf / x.min * 40,
      drbPct: x.reb ? 100 * x.dreb * (200 * x.g / 5) / (x.min * x.reb) : 0,
      team: (lgDrtg - x.drtgW / x.min) * (x.min / x.g) / 40
    }));
    const zf = (k) => { const v = cand.map((c) => c[k]); const mu = v.reduce((s, y) => s + y, 0) / (v.length || 1);
      const sd = Math.sqrt(v.reduce((s, y) => s + (y - mu) ** 2, 0) / (v.length || 1)); return (y) => (sd ? (y - mu) / sd : 0); };
    const zs = zf('stocks'), zr = zf('drbPct'), zt = zf('team'), zp = zf('pf40');
    cand.forEach((c) => { c.score = 0.40 * zs(c.stocks) + 0.25 * zr(c.drbPct) + 0.25 * zt(c.team) - 0.10 * zp(c.pf40); });
    cand.sort((a, b) => b.score - a.score);
    out.splice(3, 0, { key: 'obronca', title: 'Obrońca sezonu',
      rule: 'Przechwyty i bloki 40%, zbiórki w obronie 25%, obrona drużyny z nim na boisku 25%, faule 10% na minus.',
      list: top(cand.map((c) => ({ zawodnik: c.name, druzyna: pl.get(c.name).druzyna, value: f1(50 + 10 * c.score),
        note: f1(c.x.stl / c.x.g) + ' prz, ' + f1(c.x.blk / c.x.g) + ' bl, ' + f1(c.x.dreb / c.x.g) + ' zb. w obronie na mecz' }))) });
  }
  const games = zawodnicy.filter((z) => mins(z.min) > 0).map((z) => ({ z, v: gm(z) })).sort((a, b) => b.v - a.v);
  out.push({ key: 'wystep', title: 'Występ sezonu', rule: 'Najwyższy GmSc w jednym meczu.',
    list: top(games.map(({ z, v }) => ({ zawodnik: z.zawodnik, druzyna: z.druzyna, value: f1(v),
      note: z.kolejka + '. kolejka: ' + n(z.pts) + ' pkt, ' + (n(z.oreb) + n(z.dreb)) + ' zb, ' + n(z.ast) + ' as' }))) });
  return out;
};

// Tradycyjna tabela ligowa (zawsze cały sezon). Punkty: 2 za zwycięstwo, 1 za porażkę.
// Przy równej liczbie punktów (jak w FIBA):
// bilans meczów między tymi drużynami, różnica punktów w tych meczach, różnica punktów
// w całym sezonie, punkty zdobyte.
const leagueTable = (mecze_druzyn, druzyny) => {
  const n = (x) => Number(x) || 0;
  const game = new Map(mecze_druzyn.map((r) => [gk(r, r.druzyna), r]));
  const acc = new Map();
  const blank = (d) => ({ druzyna: d, g: 0, w: 0, l: 0, pf: 0, pa: 0, res: [] });
  for (const d of druzyny.map((x) => x.druzyna)) acc.set(d, blank(d));
  for (const r of mecze_druzyn) {
    const o = game.get(gk(r, r.rywal));
    if (!o) continue;
    const a = acc.get(r.druzyna) || blank(r.druzyna);
    const win = n(r.pts) > n(o.pts);
    a.g += 1; a.pf += n(r.pts); a.pa += n(o.pts);
    if (win) a.w += 1; else a.l += 1;
    a.res.push({ k: n(r.kolejka), data: String(r.data || ''), win, rywal: r.rywal, pf: n(r.pts), pa: n(o.pts), dom: !!r.pierwsza, url: r.url || '' });
    acc.set(r.druzyna, a);
  }
  const all = [...acc.values()];
  all.forEach((a) => { a.pkt = 2 * a.w + a.l; a.diff = a.pf - a.pa; });
  const played = all.filter((a) => a.g > 0);
  const byPkt = new Map();
  for (const a of played) { if (!byPkt.has(a.pkt)) byPkt.set(a.pkt, []); byPkt.get(a.pkt).push(a); }
  const order = [];
  for (const pkt of [...byPkt.keys()].sort((x, y) => y - x)) {
    const grp = byPkt.get(pkt);
    const names = new Set(grp.map((a) => a.druzyna));
    const h2h = (a) => a.res.filter((x) => names.has(x.rywal)).reduce((s, x) => ({ p: s.p + (x.win ? 2 : 1), d: s.d + x.pf - x.pa }), { p: 0, d: 0 });
    const hh = new Map(grp.map((a) => [a.druzyna, grp.length > 1 ? h2h(a) : { p: 0, d: 0 }]));
    grp.sort((a, b) => hh.get(b.druzyna).p - hh.get(a.druzyna).p || hh.get(b.druzyna).d - hh.get(a.druzyna).d
      || b.diff - a.diff || b.pf - a.pf || a.druzyna.localeCompare(b.druzyna, 'pl'));
    order.push(...grp);
  }
  order.push(...all.filter((a) => a.g === 0).sort((a, b) => a.druzyna.localeCompare(b.druzyna, 'pl')));
  return order.map((a, i) => {
    const res = a.res.slice().sort((x, y) => x.k - y.k || x.data.localeCompare(y.data));
    return {
      miejsce: a.g ? String(i + 1) : null, druzyna: a.druzyna,
      pkt: String(a.pkt), g: String(a.g), w: a.w,
      zp: a.w + '-' + a.l,
      pzs: a.pf + ':' + a.pa, pf: a.pf,
      roz: a.g ? (a.diff > 0 ? '+' : '') + a.diff : '0',
      stos: a.pa ? (a.pf / a.pa).toFixed(3).replace('.', ',') : '-',
      forma: res.slice(-5).map((x) => (x.win ? 'W' : 'P')).join(''),
      formaGry: res.slice(-5).reverse(),
      formaOpis: res.slice(-5).map((x) => (x.win ? 'W' : 'P') + ' ' + x.pf + ':' + x.pa + ' z ' + x.rywal).join(', ')
    };
  });
};

// Szansa wygranej w nadchodzącym meczu (zapowiedź kolejki, pokazywana od ZAPOWIEDZ_OD_KOLEJKI).
// Oczekiwana różnica punktów = (NetRtg A − NetRtg B) / 100 × średnie tempo ligi; NetRtg przybliżony do zera
// przy małej liczbie meczów (× g / (g + WIN_SHRINK)). Wynik meczu ~ rozkład normalny z odchyleniem WIN_SIGMA pkt.
// Bez przewagi gospodarza – wszystkie mecze na tej samej hali. WIN_SIGMA do sprawdzenia po kilku kolejkach.
const ZAPOWIEDZ_OD_KOLEJKI = 4;
const WIN_SIGMA = 15, WIN_SHRINK = 3;
const erf = (x) => {
  const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
};
const winChance = (mecze_druzyn) => {
  const n = (x) => Number(x) || 0;
  const poss = (t) => n(t.fga) + 0.44 * n(t.fta) - n(t.oreb) + n(t.to);
  const game = new Map(mecze_druzyn.map((r) => [gk(r, r.druzyna), r]));
  const acc = new Map();
  let possSum = 0, games = 0;
  for (const r of mecze_druzyn) {
    const o = game.get(gk(r, r.rywal));
    if (!o) continue;
    const p = (poss(r) + poss(o)) / 2;
    const a = acc.get(r.druzyna) || { g: 0, pf: 0, pa: 0, poss: 0 };
    a.g += 1; a.pf += n(r.pts); a.pa += n(o.pts); a.poss += p;
    acc.set(r.druzyna, a);
    possSum += p; games += 1;
  }
  const pace = games ? possSum / games : 80;
  const rating = (t) => {
    const a = acc.get(t);
    return a && a.poss ? (a.pf - a.pa) / a.poss * 100 * a.g / (a.g + WIN_SHRINK) : 0;
  };
  return (a, b) => 0.5 * (1 + erf((rating(a) - rating(b)) / 100 * pace / WIN_SIGMA / Math.SQRT2));
};

if (typeof module !== 'undefined') module.exports = { positionByHeight, rankTeams, rankPlayers, lastGames, hollinger, EWA_OD_KOLEJKI, awards, leagueTable, winChance, ZAPOWIEDZ_OD_KOLEJKI };
