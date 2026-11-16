// Test gotowej strony i panelu w przeglądarce (Playwright). Bez Playwrighta test się pomija.
// Użycie: node scripts/test-strona.cjs
const path = require('path'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { console.log('Test strony: brak Playwrighta, pomijam'); process.exit(0); }
const ROOT = path.resolve(__dirname, '..');
const bad = [];
(async () => {
  const b = await pw.chromium.launch();
  const page = async (file) => {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    p.on('pageerror', (e) => bad.push(path.basename(file) + ': błąd JS: ' + e.message));
    await p.goto('file://' + path.join(ROOT, file)); await p.waitForTimeout(400);
    return p;
  };
  // strona publiczna: zapowiedź musi przeliczać szansę przy zmianie meczu
  const s = await page('dist/ranking-publiczny.html');
  const n = await s.locator('#ov-next .o-upk').count();
  const seen = new Set();
  for (let i = 0; i < Math.min(n, 4); i++) {
    await s.locator('#ov-next .o-upk').nth(i).click(); await s.waitForTimeout(150);
    const a = (await s.locator('#ov-pv .o-pvh .a b').textContent()).trim();
    const note = await s.locator('#ov-pv .o-pvnote').textContent();
    if (!note.startsWith(a + ' ')) bad.push(`zapowiedź: nagłówek „${a}”, podsumowanie „${note.slice(0, 40)}”`);
    seen.add(await s.locator('#ov-pv .o-chn').textContent());
  }
  if (n > 2 && seen.size < 2) bad.push('zapowiedź: szansa wygranej nie zmienia się między meczami');
  const over = await s.evaluate(() => [...document.querySelectorAll('#ov-led .o-row')].some((r) => { const f = r.querySelector('.o-fb'), x = r.querySelector('.o-nxc'); if (!f || !x || !x.offsetWidth) return false; return f.getBoundingClientRect().right > x.getBoundingClientRect().left + 1; }));
  if (over) bad.push('przegląd: forma nachodzi na kolumnę „Następny mecz”');
  // adresy: drużyna, kolejka, karta zawodnika; Wstecz zamyka kartę i zostaje na stronie
  {
    const src = fs.readFileSync(path.join(ROOT, 'data/mecze_druzyn.json'), 'utf8');
    const md = JSON.parse(src), team = md[0].druzyna, kol = String(md[0].kolejka);
    const slug = (x) => String(x).toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const open = async (hash) => { const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); p.on('pageerror', (e) => bad.push('adres ' + hash + ': błąd JS: ' + e.message)); await p.goto('file://' + path.join(ROOT, 'dist/ranking-publiczny.html') + hash); await p.waitForTimeout(400); return p; };
    const vis = (p) => p.evaluate(() => [...document.querySelectorAll('main > section, .view')].filter((x) => x.id && !x.hidden && ['przeglad', 'druzyny', 'zawodnicy', 'mecze', 'nagrody'].includes(x.id)).map((x) => x.id).join(','));
    let p = await open('#druzyna/' + slug(team));
    if (await vis(p) !== 'zawodnicy' || await p.evaluate(() => document.getElementById('team').value) !== team) bad.push('adres drużyny nie ustawia widoku i filtra');
    p = await open('#mecze/' + kol);
    if (await vis(p) !== 'mecze' || await p.evaluate(() => document.getElementById('game-pick').value) !== kol) bad.push('adres kolejki nie ustawia widoku i kolejki');
    p = await open('#zawodnicy');
    const btn = p.locator('#zawodnicy button.pl').first();
    if (await btn.count()) {
      const name = await btn.getAttribute('data-name');
      await btn.click(); await p.waitForTimeout(350);
      if (!(await p.evaluate(() => document.getElementById('card').open)) || !(await p.evaluate(() => location.hash)).startsWith('#zawodnik/')) bad.push('karta zawodnika nie zapisuje adresu');
      await p.goBack(); await p.waitForTimeout(450);
      if (await p.evaluate(() => document.getElementById('card').open) || await p.evaluate(() => location.hash) !== '#zawodnicy') bad.push('Wstecz nie zamyka karty zawodnika');
      const q = await open('#zawodnik/' + slug(name));
      if (!(await q.evaluate(() => document.getElementById('card').open)) || await vis(q) !== 'zawodnicy') bad.push('adres zawodnika nie otwiera karty');
      await q.locator('#card-x').click(); await q.waitForTimeout(350);
      if (await q.evaluate(() => document.getElementById('card').open) || await q.evaluate(() => location.hash) !== '#zawodnicy') bad.push('zamknięcie karty z adresu nie wraca do widoku');
    }
  }
  // panel: średnia ligi spójna (atak = obrona, NetRtg 0)
  if (fs.existsSync(path.join(ROOT, 'dist/panel-scouting.html'))) {
    const p = await page('dist/panel-scouting.html');
    const lt = await p.evaluate(() => D.LT);
    if (!lt || Math.abs(lt.ortg - lt.drtg) > 1e-6 || Math.abs(lt.net) > 1e-6) bad.push('panel: średnia ligi niespójna ' + JSON.stringify(lt && { o: lt.ortg, d: lt.drtg }));
    const past = await p.evaluate(() => { const d = new Date(), t = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); return D.next.filter((m) => m.data && m.data < t).length; });
    if (past) bad.push('panel: mecze po terminie na liście następnych');
  }
  await b.close();
  if (bad.length) { console.log('Test strony: BŁĘDY\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('Test strony: OK');
})();
