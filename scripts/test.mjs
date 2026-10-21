// Szybki test: liczy rankingi z data/*.json i wypisuje czołówkę.
// Użycie: node scripts/test.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { rankTeams, rankPlayers, leagueTable } = require('../src/ranking.js');
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
console.log('OK');
