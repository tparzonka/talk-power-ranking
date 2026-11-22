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
    const vis = (p) => p.evaluate(() => [...document.querySelectorAll('main > section, .view')].filter((x) => x.id && !x.hidden && ['przeglad', 'druzyny', 'druzyna', 'zawodnicy', 'mecze', 'nagrody', 'mecz'].includes(x.id)).map((x) => x.id).join(','));
    let p = await open('#druzyna/' + slug(team));
    if (await vis(p) !== 'druzyna' || await p.evaluate(() => document.getElementById('view-title').textContent) !== team) bad.push('adres drużyny nie otwiera strony drużyny');
    {
      const R = require(path.join(ROOT, 'src/ranking.js'));
      const druz = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/druzyny.json'), 'utf8'));
      const row = R.rankTeams(md, druz, {}).find((r) => r.druzyna === team);
      await p.evaluate(() => { try { localStorage.removeItem('pr-zakres'); } catch (e) {} });
      const shown = await p.evaluate(() => document.querySelector('.tp-tiles .tile.lead .v').textContent);
      if (await p.evaluate(() => document.getElementById('range-0').getAttribute('aria-pressed')) === 'true' && shown !== row.net) bad.push('strona drużyny: NetRtg ' + shown + ' zamiast ' + row.net);
      if (await p.evaluate(() => document.getElementById('range-0').getAttribute('aria-pressed')) === 'true') {
        const wantZ = row.zakres === '-' ? '' : 'zakres ' + row.zakres;
        const gotZ = await p.evaluate(() => [...document.querySelectorAll('.tp-tiles .tile.lead .s')].map((x) => x.textContent).filter((x) => x.startsWith('zakres ')).join(''));
        if (gotZ !== wantZ) bad.push('strona drużyny: zakres „' + gotZ + '” zamiast „' + wantZ + '”');
      }
      const played = await p.evaluate(() => document.querySelectorAll('#druzyna table.tp-tab')[1].tBodies[0].rows.length);
      const games = md.filter((r) => r.druzyna === team).length;
      if (played !== games) bad.push('strona drużyny: ' + played + ' rozegranych meczów zamiast ' + games);
    }
    p = await open('#druzyny');
    await p.locator('#t-teams tbody tr[data-key]').first().click(); await p.waitForTimeout(300);
    const first = await p.evaluate(() => document.querySelector('#t-teams tbody tr[data-key]').dataset.key);
    if (await vis(p) !== 'druzyna' || await p.evaluate(() => document.getElementById('view-title').textContent) !== first) bad.push('klik w wiersz tabeli drużyn nie otwiera strony drużyny');
    await p.goBack(); await p.waitForTimeout(300);
    if (await vis(p) !== 'druzyny' || await p.evaluate(() => location.hash) !== '#druzyny') bad.push('Wstecz ze strony drużyny nie wraca do listy');
    {
      // „Wszystkie drużyny”: po wejściu z adresu Wstecz zostaje na stronie; po wejściu z listy cofa do niej
      const q = await open('#druzyna/' + slug(team));
      await q.click('.tp-back'); await q.waitForTimeout(300);
      if (await vis(q) !== 'druzyny' || await q.evaluate(() => location.hash) !== '#druzyny') bad.push('„Wszystkie drużyny” po wejściu z adresu nie otwiera listy');
      await q.goBack(); await q.waitForTimeout(300);
      if (await q.evaluate(() => location.protocol) !== 'file:' || await q.evaluate(() => location.hash) !== '#druzyna/' + slug(team)) bad.push('Wstecz po „Wszystkie drużyny” (wejście z adresu) opuszcza stronę');
      const r = await open('#druzyny');
      await r.locator('#t-teams tbody tr[data-key]').first().click(); await r.waitForTimeout(250);
      await r.locator('#druzyna .tp-up .tp-tm, #druzyna .tp-p-m .tp-tm').first().click(); await r.waitForTimeout(250);
      await r.click('.tp-back'); await r.waitForTimeout(300);
      if (await vis(r) !== 'druzyny' || await r.evaluate(() => location.hash) !== '#druzyny') bad.push('„Wszystkie drużyny” po przejściu przez rywala nie wraca do listy');
      // fokus po otwarciu strony drużyny trafia na nagłówek
      await r.locator('#t-teams tbody tr[data-key]').first().click(); await r.waitForTimeout(250);
      if (await r.evaluate(() => document.activeElement && document.activeElement.id) !== 'view-title') bad.push('strona drużyny: fokus nie trafia na nagłówek');
      // średnia ligi widoczna w każdym wierszu profilu, słupki kwart bez podpowiedzi
      const prof = await r.evaluate(() => ({ rows: document.querySelectorAll('.tp-fr').length, avg: [...document.querySelectorAll('.tp-fr .rk small')].filter((s) => /^śr\. /.test(s.textContent) && s.offsetHeight > 0).length,
        titled: document.querySelectorAll('.tp-qc i[title]').length }));
      if (!prof.rows || prof.avg !== prof.rows) bad.push('strona drużyny: średnia ligi nie w każdym wierszu profilu ' + JSON.stringify(prof));
      if (prof.titled) bad.push('strona drużyny: słupki kwart mają podpowiedź title');
    }
    {
      const ph = await (await b.newContext({ ...require('playwright').devices['iPhone 13'] })).newPage();
      // strona nie ma własnego znacznika viewport (dodaje go claude.ai), więc kopia z nim w katalogu tymczasowym
      const tmp = path.join(require('os').tmpdir(), 'ranking-telefon.html');
      fs.writeFileSync(tmp, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' + fs.readFileSync(path.join(ROOT, 'dist/ranking-publiczny.html'), 'utf8'));
      await ph.goto('file://' + tmp + '#druzyna/' + slug(team)); await ph.waitForTimeout(400);
      if (await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth || innerWidth > screen.width)) bad.push('strona drużyny: przewijanie w bok albo pomniejszenie na telefonie');
      const small = await ph.evaluate(() => [...document.querySelectorAll('#druzyna button.pl, #druzyna .tp-tm, #druzyna a.proto')].filter((e) => {
        const r = e.getBoundingClientRect(); const a = getComputedStyle(e, '::after');
        const top = parseFloat(a.top) || 0, bot = parseFloat(a.bottom) || 0;
        return r.height - (a.position === 'absolute' ? top + bot : 0) < 44 - 0.5 && e.offsetParent; }).length);
      if (small) bad.push('strona drużyny: ' + small + ' celów dotyku poniżej 44 px na telefonie');
    }
    p = await open('#przeglad');
    const chip = p.locator('#ov-led .o-fb i[data-tip]').first();
    if (await chip.count()) {
      await chip.hover(); await p.waitForTimeout(200);
      const st = await p.evaluate(() => ({ tip: !document.querySelector('.tip').hidden, hl: document.querySelectorAll('#ov-led .o-row.hl').length }));
      if (!st.tip || st.hl !== 2) bad.push('przegląd: kafelek formy nie pokazuje meczu ' + JSON.stringify(st));
    } else bad.push('przegląd: kafelki formy bez podpowiedzi');
    p = await open('#mecze/' + kol);
    if (await vis(p) !== 'mecze' || await p.evaluate(() => document.getElementById('game-pick').value) !== kol) bad.push('adres kolejki nie ustawia widoku i kolejki');
    // pełna tabela zawodników na komputerze: wszystkie wiersze, przyklejony nagłówek, przypięta kolumna z nazwiskiem, wyszukiwarka
    for (const w of [1440, 900]) {
      const c = await (await b.newContext({ viewport: { width: w, height: 800 } })).newPage();
      await c.goto('file://' + path.join(ROOT, 'dist/ranking-publiczny.html') + '#zawodnicy'); await c.waitForTimeout(500);
      const st = await c.evaluate(() => { const t = document.getElementById('t-players'), sc = document.getElementById('player-scroll'); const rows = [...t.tBodies[0].rows];
        return { rows: rows.length, shown: rows.filter((r) => r.offsetParent).length, free: sc.classList.contains('free'), mh: sc.style.maxHeight, more: !document.getElementById('more').hidden }; });
      if (st.rows > 10) {
        if (st.shown !== st.rows || st.more) bad.push('zawodnicy ' + w + ' px: nie wszystkie wiersze albo przycisk „więcej” ' + JSON.stringify(st));
        if (st.free) {
          await c.evaluate(() => window.scrollTo(0, document.getElementById('t-players').getBoundingClientRect().top + scrollY + 300)); await c.waitForTimeout(150);
          const top = await c.evaluate(() => document.querySelector('#t-players thead th').getBoundingClientRect().top);
          if (Math.abs(top) > 1.5) bad.push('zawodnicy ' + w + ' px: nagłówek tabeli nie jest przyklejony (top ' + top + ')');
        } else if (st.mh) {
          await c.evaluate(() => { const sc = document.getElementById('player-scroll'); sc.scrollLeft = 120; sc.scrollTop = 200; }); await c.waitForTimeout(150);
          const d = await c.evaluate(() => { const sc = document.getElementById('player-scroll').getBoundingClientRect(), th = document.querySelector('#t-players thead th').getBoundingClientRect(), nm = document.querySelector('#t-players tbody td.name'); const r = nm.getBoundingClientRect();
            return { head: Math.abs(th.top - sc.top), left: Math.abs(r.left - sc.left) }; });
          if (d.head > 1.5 || d.left > 1.5) bad.push('zawodnicy ' + w + ' px: nagłówek albo kolumna z nazwiskiem nieprzypięte ' + JSON.stringify(d));
        } else bad.push('zawodnicy ' + w + ' px: ani przyklejony nagłówek strony, ani kontener o wysokości okna');
        const first = await c.evaluate(() => document.querySelector('#t-players tbody td.name button.pl').textContent.trim().split(' ').pop());
        await c.fill('#q', first.slice(0, 4)); await c.waitForTimeout(300);
        const after = await c.evaluate(() => [...document.getElementById('t-players').tBodies[0].rows].filter((r) => r.offsetParent).length);
        if (!after || after >= st.rows) bad.push('zawodnicy ' + w + ' px: wyszukiwarka nie zawęża listy (' + after + ' z ' + st.rows + ')');
      }
      await c.close();
    }
    // porównanie zawodników: wybór w karcie, adres #porownaj/a/b, wejście z adresu, przełącznik na 40 minut
    {
      const c = await open('#zawodnicy');
      const names = await c.evaluate(() => [...document.querySelectorAll('#t-players tbody button.pl')].slice(0, 2).map((x) => x.dataset.name || x.textContent.trim()));
      if (names.length === 2) {
        await c.locator('#t-players tbody button.pl').first().click(); await c.waitForTimeout(350);
        await c.selectOption('#cmp-sel', names[1]); await c.waitForTimeout(350);
        const want = '#porownaj/' + slug(names[0]) + '/' + slug(names[1]);
        const st = await c.evaluate(() => ({ hash: location.hash, rows: document.querySelectorAll('#card .cmp-row').length, open: document.getElementById('card').open }));
        if (!st.open || st.hash !== want || st.rows < 10) bad.push('porównanie: wybór w karcie nie otwiera porównania ' + JSON.stringify(st));
        const opts = await c.evaluate(() => document.querySelectorAll('#cmp-sel option[value]:not([value=""])').length);
        const d = await open(want);
        const v1 = await d.evaluate(() => [document.getElementById('card').open, document.querySelectorAll('#card .cmp-row').length, [...document.querySelectorAll('#card .cmp-row .a')].map((x) => x.textContent).join('|')]);
        if (!v1[0] || v1[1] !== st.rows) bad.push('porównanie: adres nie otwiera porównania');
        await d.click('#card .cmp-bar .mini button:nth-child(2)'); await d.waitForTimeout(200);
        const v2 = await d.evaluate(() => [...document.querySelectorAll('#card .cmp-row .a')].map((x) => x.textContent).join('|'));
        if (v2 === v1[2]) bad.push('porównanie: przełącznik na 40 minut nie zmienia wartości');
        await d.click('#card .cmp-back'); await d.waitForTimeout(300);
        if (await d.evaluate(() => document.getElementById('card-name').textContent) !== names[0]) bad.push('porównanie: „Karta: …” nie wraca do karty pierwszego zawodnika');
        await d.close(); await c.close();
      }
    }
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
      // wykres GmSc: wartości słupków = kolumna GmSc w tabeli meczów (bez meczów „nie grał”), średnia = wiersz „Średnio”
      const gm = await q.evaluate(() => {
        const box = document.querySelector('#card .gm');
        const table = [...document.querySelectorAll('#card table.log tbody tr')].filter((r) => !r.querySelector('td.dnp')).map((r) => r.querySelector('td.key').textContent.trim());
        const bars = box ? [...box.querySelectorAll('.gm-col')].map((c) => c.title.split('GmSc ').pop()) : [];
        const vals = box ? [...box.querySelectorAll('.gm-val')].map((c) => c.textContent.trim()) : [];
        const avg = document.querySelector('#card table.log tfoot td.num').textContent.trim();
        return { has: !!box, role: box && box.getAttribute('role'), label: box && box.getAttribute('aria-label'), table, bars, vals, avg, over: document.getElementById('card').scrollWidth > document.getElementById('card').clientWidth + 1 };
      });
      if (gm.table.length >= 2 && !gm.has) bad.push('wykres GmSc: brak wykresu w karcie z co najmniej 2 meczami');
      if (gm.has) {
        if (gm.role !== 'img' || !gm.label) bad.push('wykres GmSc: brak opisu dla czytników');
        if (JSON.stringify(gm.bars) !== JSON.stringify(gm.table)) bad.push('wykres GmSc: słupki nie zgadzają się z tabelą ' + JSON.stringify([gm.bars, gm.table]));
        if (!gm.label.includes('Średnia z sezonu ' + gm.avg)) bad.push('wykres GmSc: średnia inna niż w tabeli (' + gm.avg + ')');
        if (gm.over) bad.push('wykres GmSc: karta przewija się w bok');
      }
      await q.locator('#card-x').click(); await q.waitForTimeout(350);
      if (await q.evaluate(() => document.getElementById('card').open) || await q.evaluate(() => location.hash) !== '#zawodnicy') bad.push('zamknięcie karty z adresu nie wraca do widoku');
    }
    // strona meczu: wejście z kafelka, adres #mecz/<id>, kwarty zgodne z wynikiem, Wstecz, zapowiedź, wejście z Przeglądu i ze strony drużyny
    {
      const c = await open('#mecze');
      const tiles = await c.evaluate(() => [...document.querySelectorAll('#mecze a.game[href^="#mecz/"]')].map((a) => ({ href: a.getAttribute('href'), kind: a.querySelector('.g-link').textContent.trim(), txt: a.textContent })));
      const prot = tiles.find((t) => t.kind === 'Podsumowanie'), plan = tiles.find((t) => t.kind === 'Zapowiedź');
      if (!prot) bad.push('mecze: brak kafelka rozegranego meczu prowadzącego do podsumowania');
      else {
        await c.locator('#mecze a.game[href="' + prot.href + '"]').click(); await c.waitForTimeout(400);
        const st = await c.evaluate(() => {
          const sc = [...document.querySelectorAll('#mp .mp-res b')].map((x) => Number(x.textContent));
          const rows = [...document.querySelectorAll('#mp .mp-qt tbody tr')].map((r) => [...r.querySelectorAll('td')].slice(1).map((x) => Number(x.textContent)));
          return { hash: location.hash, view: !document.getElementById('mecz').hidden, title: document.getElementById('view-title').textContent, sc, rows,
            cmp: document.querySelectorAll('#mp .o-cr').length, proto: !!document.querySelector('#mp .mp-line a[href^="http"]'), back: document.querySelector('#mp .tp-back').textContent.trim(), over: document.documentElement.scrollWidth > innerWidth };
        });
        if (!st.view || st.hash !== prot.href || !st.title.includes(' – ')) bad.push('strona meczu: kafelek nie otwiera strony ' + JSON.stringify(st));
        if (st.sc.length !== 2 || !prot.txt.includes(String(st.sc[0])) || !prot.txt.includes(String(st.sc[1]))) bad.push('strona meczu: wynik inny niż na kafelku ' + JSON.stringify([st.sc, prot.txt]));
        if (st.rows.length === 2 && st.rows.some((r, i) => r.slice(0, 4).reduce((a, x) => a + x, 0) !== r[4] || r[4] !== st.sc[i])) bad.push('strona meczu: kwarty nie sumują się do wyniku ' + JSON.stringify(st.rows));
        if (st.cmp < 4 || !st.proto) bad.push('strona meczu: brak czterech czynników albo linku do protokołu ligi');
        if (st.back !== 'Wszystkie mecze' || st.over) bad.push('strona meczu: przycisk powrotu „' + st.back + '” albo przewijanie w bok');
        await c.locator('#mp .tp-back').click(); await c.waitForTimeout(400);
        const bk = await c.evaluate(() => [location.hash, !document.getElementById('mecze').hidden]);
        if (bk[0] !== '#mecze' || !bk[1]) bad.push('strona meczu: Wstecz nie wraca do listy meczów ' + JSON.stringify(bk));
        const d = await open(prot.href);
        const dv = await d.evaluate(() => [!document.getElementById('mecz').hidden, document.querySelector('#mp .tp-back').textContent.trim()]);
        if (!dv[0]) bad.push('strona meczu: adres nie otwiera strony');
        await d.locator('#mp .tp-back').click(); await d.waitForTimeout(400);
        if (await vis(d) !== 'mecze') bad.push('strona meczu: po wejściu z adresu przycisk powrotu nie prowadzi do listy meczów');
        await d.close();
      }
      if (!plan) bad.push('mecze: brak kafelka zaplanowanego meczu prowadzącego do zapowiedzi');
      else {
        const d = await open(plan.href);
        const pv = await d.evaluate(() => ({ view: !document.getElementById('mecz').hidden, rows: document.querySelectorAll('#mp .o-cr').length,
          pct: [...document.querySelectorAll('#mp .mp-res.plan .pp b')].map((x) => parseInt(x.textContent, 10)), liderzy: /Liderzy/.test(document.getElementById('mp').textContent) }));
        if (!pv.view || pv.rows < 4) bad.push('zapowiedź meczu: brak widoku albo porównania ' + JSON.stringify(pv));
        if (pv.pct.length === 2 && Math.abs(pv.pct[0] + pv.pct[1] - 100) > 1) bad.push('zapowiedź meczu: szanse nie sumują się do 100% ' + JSON.stringify(pv.pct));
        if (pv.liderzy) bad.push('zapowiedź meczu: panel „Liderzy drużyn” miał zostać usunięty');
        await d.close();
      }
      await c.close();
      const o = await open('#przeglad');
      await o.locator('#ov-results a.o-res[href^="#mecz/"]').first().click(); await o.waitForTimeout(400);
      const ov = await o.evaluate(() => [location.hash.startsWith('#mecz/'), document.querySelector('#mp .tp-back').textContent.trim()]);
      if (!ov[0] || ov[1] !== 'Przegląd') bad.push('strona meczu: wejście z Przeglądu ' + JSON.stringify(ov));
      await o.close();
      const x = await open(prot ? prot.href : '#mecze');
      const teamName = await x.evaluate(() => { const b = document.querySelector('#mp .tp-tm'); return b ? b.dataset.openTeam : ''; });
      await x.close();
      const t = await open('#druzyna/' + slug(teamName));
      const tl = t.locator('#tp a.proto', { hasText: 'podsumowanie' }).first();
      if (await tl.count()) {
        const team = await t.evaluate(() => document.getElementById('view-title').textContent);
        await tl.click(); await t.waitForTimeout(400);
        const bl = await t.evaluate(() => [location.hash.startsWith('#mecz/'), document.querySelector('#mp .tp-back').textContent.trim()]);
        if (!bl[0] || bl[1] !== team) bad.push('strona meczu: wejście ze strony drużyny, przycisk powrotu „' + bl[1] + '” zamiast „' + team + '”');
        await t.locator('#mp .tp-back').click(); await t.waitForTimeout(400);
        if (await vis(t) !== 'druzyna') bad.push('strona meczu: Wstecz nie wraca na stronę drużyny');
      } else bad.push('strona drużyny: brak linku „podsumowanie” przy meczu');
      await t.close();
    }
    // ruch: zmiana treści w tym samym widoku i w otwartym oknie karty, szybkie pociągnięcie zamyka kartę na telefonie
    {
      const x0 = await open('#mecze');
      const href = await x0.evaluate(() => { const a = document.querySelector('#mecze a.game[href^="#mecz/"]'); return a ? a.getAttribute('href') : ''; });
      await x0.close();
      const t = await open(href);
      const tn = await t.evaluate(() => { const b = document.querySelector('#mp .tp-tm'); return b ? b.dataset.openTeam : ''; });
      await t.locator('#mp .tp-tm').first().click(); await t.waitForTimeout(100);
      // strona drużyny -> strona rywala: widok ten sam, treść wchodzi animacją
      const rv = t.locator('#tp table.tp-tab .tp-tm').first();
      if (await rv.count()) {
        await rv.click();
        const a1 = await t.evaluate(() => { const v = document.getElementById('druzyna'); return [v.classList.contains('swap'), v.getAnimations().length > 0, document.getElementById('view-title').textContent]; });
        if (!a1[0] || !a1[1]) bad.push('ruch: strona rywala wchodzi bez animacji ' + JSON.stringify(a1));
      } else bad.push('ruch: brak rywala do kliknięcia na stronie drużyny ' + tn);
      await t.close();
      // karta -> porównanie w otwartym oknie
      const c = await open('#zawodnicy');
      const names = await c.evaluate(() => [...document.querySelectorAll('#t-players tbody button.pl')].slice(0, 2).map((x) => x.dataset.name));
      if (names.length === 2) {
        await c.locator('#t-players tbody button.pl').first().click(); await c.waitForTimeout(350);
        const before = await c.evaluate(() => document.getElementById('card-body').classList.contains('swap'));
        await c.selectOption('#cmp-sel', names[1]); await c.waitForTimeout(30);
        const after = await c.evaluate(() => { const b = document.getElementById('card-body'); return [b.classList.contains('swap'), b.getAnimations().length > 0]; });
        if (before || !after[0] || !after[1]) bad.push('ruch: przełączenie karta → porównanie bez animacji ' + JSON.stringify([before, after]));
      }
      await c.close();
      // telefon: szybkie krótkie pociągnięcie w dół zamyka kartę, wolne takie samo nie
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      const ph = await ctx.newPage();
      ph.on('pageerror', (e) => bad.push('ruch (telefon): błąd JS: ' + e.message));
      await ph.goto('file://' + path.join(ROOT, 'dist/ranking-publiczny.html') + '#zawodnicy'); await ph.waitForTimeout(400);
      const swipe = async (ms) => {
        await ph.locator('#t-players tbody button.pl').first().click(); await ph.waitForTimeout(450);
        await ph.evaluate(async (ms) => {
          const card = document.getElementById('card');
          const mk = (y) => new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [new Touch({ identifier: 1, target: card, clientX: 200, clientY: y })] });
          card.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [new Touch({ identifier: 1, target: card, clientX: 200, clientY: 300 })] }));
          card.dispatchEvent(mk(310));
          card.dispatchEvent(mk(340));
          await new Promise((r) => setTimeout(r, ms));
          card.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] }));
        }, ms);
        await ph.waitForTimeout(500);
        return ph.evaluate(() => document.getElementById('card').open);
      };
      if (await ph.locator('#t-players tbody button.pl').count()) {
        const slow = await swipe(600);
        if (!slow) bad.push('ruch: wolne krótkie pociągnięcie zamknęło kartę');
        else {
          await ph.evaluate(() => { document.getElementById('card-x').click(); }); await ph.waitForTimeout(500);
          const fastOpen = await swipe(5);
          if (fastOpen) bad.push('ruch: szybkie krótkie pociągnięcie nie zamknęło karty');
        }
      }
      await ctx.close();
    }
    // klawiatura: Enter i Spacja przypinają drużynę w Przeglądzie, strzałki wybierają drużynę na wykresie miejsc, fokus po otwarciu strony i karty
    {
      const k = await open('#przeglad');
      const rows = k.locator('#ov-led .o-row');
      if (await rows.count() > 1) {
        await rows.nth(0).focus(); await k.keyboard.press('Enter');
        await rows.nth(1).focus();
        const pinned = await k.evaluate(() => [document.querySelectorAll('.o-row.on').length, document.querySelector('.o-row.on') && document.querySelector('.o-row.on').dataset.team, document.querySelectorAll('.o-row')[0].dataset.team]);
        if (pinned[0] !== 1 || pinned[1] !== pinned[2]) bad.push('klawiatura: Enter na wierszu nie przypina drużyny ' + JSON.stringify(pinned));
        await k.keyboard.press('Escape');
        const dot = k.locator('.o-dot').first();
        await dot.focus(); await k.keyboard.press(' ');
        const pr = await dot.getAttribute('aria-pressed');
        await k.keyboard.press(' ');
        const pr2 = await dot.getAttribute('aria-pressed');
        if (pr !== 'true' || pr2 !== 'false' || await dot.getAttribute('role') !== 'button') bad.push('klawiatura: Spacja na punkcie wykresu ' + JSON.stringify([pr, pr2]));
      } else bad.push('klawiatura: brak wierszy w Przeglądzie');
      await k.close();
      const w = await open('#druzyny');
      if (await w.locator('#bump:not([hidden])').count()) {
        await w.locator('#bump-plot svg').focus();
        await w.keyboard.press('ArrowDown');
        const n1 = await w.evaluate(() => [document.getElementById('bp-note').textContent.slice(0, 30), document.activeElement.tagName.toLowerCase(), document.getElementById('bp-note').getAttribute('aria-live')]);
        await w.keyboard.press('ArrowDown');
        const n2 = await w.evaluate(() => document.getElementById('bp-note').textContent.slice(0, 30));
        if (!n1[0] || n1[1] !== 'svg' || n1[2] !== 'polite' || n1[0] === n2) bad.push('klawiatura: strzałki nie wybierają drużyny na wykresie miejsc ' + JSON.stringify([n1, n2]));
        await w.keyboard.press('Escape');
      }
      await w.close();
      const tp = await open('#druzyna/' + slug(await (async () => { const x = await open('#mecz/' + (await (async () => { const y = await open('#mecze'); const h = await y.evaluate(() => document.querySelector('#mecze a.game[href^="#mecz/"]').getAttribute('href').split('/')[1]); await y.close(); return h; })())); const n = await x.evaluate(() => document.querySelector('#mp .tp-tm').dataset.openTeam); await x.close(); return n; })()));
      const fp = await tp.evaluate(() => document.activeElement.id);
      if (fp !== 'view-title') bad.push('klawiatura: po otwarciu strony drużyny fokus na „' + fp + '”, powinien być nagłówek');
      await tp.close();
      const cz = await open('#zawodnicy');
      await cz.locator('#t-players tbody button.pl').first().focus(); await cz.keyboard.press('Enter'); await cz.waitForTimeout(400);
      const inDialog = await cz.evaluate(() => document.getElementById('card').contains(document.activeElement));
      await cz.keyboard.press('Escape'); await cz.waitForTimeout(400);
      const back = await cz.evaluate(() => document.activeElement.classList.contains('pl'));
      if (!inDialog || !back) bad.push('klawiatura: fokus po otwarciu karty poza oknem albo nie wraca na nazwisko po zamknięciu ' + JSON.stringify([inDialog, back]));
      await cz.close();
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
