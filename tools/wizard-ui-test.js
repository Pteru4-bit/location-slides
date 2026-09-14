/*
 * wizard-ui-test.js — пакетний режим у справжньому браузері, без Google.
 *
 *   node tools/wizard-ui-test.js        (Playwright: NODE_PATH=$(npm root -g), якщо глобальний)
 *
 * Сторінка збирається з src/Wizard*.html так само, як це робить Apps Script
 * (include → вставка), а замість google.script.run підставляється
 * window.__TEST_API з даними чотирьох реальних заявок. Перевіряється те,
 * що найлегше зламати правкою інтерфейсу: фільтри й вибір, «Не підходить»
 * сховано типово, нова презентація, пакетний прогін по одній заявці за
 * виклик із правильним payload, помилка однієї заявки не зупиняє решту,
 * «Зупинити», посилання «карта ↗». Помилки JS на сторінці — провал.
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const R = path.join(__dirname, '..', 'src') + '/';

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const d = fs.readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  const b = path.join(base, d, 'chrome-linux', 'chrome');
  return fs.existsSync(b) ? b : undefined;
}
let failed = 0;
function ok(pass, title, detail) {
  console.log((pass ? '  ✔ ' : '  ✘ ') + title + (detail ? '  — ' + detail : ''));
  if (!pass) failed++;
}

const BOOT = { email: 'test@novaposhta.ua', mapUrl: 'https://script.google.com/a/x/macros/s/MAP/exec', key: '', shotZoom: 15, photoMax: 20 };
const base = { ts: '', date: '', author: '', region: '', deal: 'Оренда', areaRaw: '', area: null, priceRaw: '', priceUah: null, ramps: '', yard: '', video: '',
  comment: '', reviewDate: '', reviewer: '', decision: '', branch: '', source: '', mapLink: '', slideUrl: '', slideUpdated: '', slideBy: '', slideDeck: '', coordsSaved: '', rejected: false };
const RECS = [
  Object.assign({}, base, { row: 2, key: '20260826-181927', ts: '26.08.2026 18:19', date: '26.08.2026', author: 'Дусь Т.', region: 'Чернігівська обл.', city: 'Чернігів', address: 'Дрозда, 16',
    areaRaw: '1000', area: 1000, priceRaw: 'Договірна, ще заянято до жовтня', objType: 'Депо/термінал', branch: 'Лівобережжя', photoIds: ['p1', 'p2'], proposalDefault: 'Відкриття депо або терміналу' }),
  Object.assign({}, base, { row: 3, key: '20260828-184042', ts: '28.08.2026 18:40', date: '28.08.2026', author: 'Колодій Д', region: 'Чернівецька обл.', city: 'Чернівці', address: 'Чкалова, 34',
    areaRaw: '800кв.м.', area: 800, priceRaw: '160000', priceUah: 160000, objType: 'Відділення', branch: 'Правобережжя',
    mapLink: 'https://www.google.com.ua/maps/@48.2664111,25.9582113,19.71z', photoIds: ['q1', 'q2', 'q3'],
    slideUrl: 'https://docs.google.com/presentation/d/DECK1/edit#slide=id.g1', slideDeck: 'Розгляд 09.09', proposalDefault: 'Відкриття відділення' }),
  Object.assign({}, base, { row: 4, key: '20260827-222034', ts: '27.08.2026 22:20', date: '27.08.2026', author: 'Нижник Н.', region: 'Київська обл.', city: 'Київ', address: 'Велика Кільцева',
    areaRaw: 'до 5 300', area: 5300, priceRaw: 'від 15 $/м² з ПДВ + комунальні та експлуатаційні витрати 10%', objType: 'Депо/термінал', branch: 'Київ та обл',
    photoIds: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10', 'k11', 'k12', 'k13', 'k14', 'k15'], proposalDefault: 'Відкриття депо або терміналу' }),
  Object.assign({}, base, { row: 5, key: '20260909-090000', ts: '09.09.2026 09:00', date: '09.09.2026', author: 'Хураскін А.', region: 'Одеська обл.', city: 'Одеса', address: 'вул. Академіка Сахарова 1',
    objType: 'Не підходить', rejected: true, decision: 'мала площа', coordsSaved: '46.5, 30.7', photoIds: ['o1'], proposalDefault: 'Відкриття' })
];

const MOCK = `
window.__calls = []; window.__decks = [{ id: 'DECK1', name: 'Розгляд 09.09', url: 'https://docs.google.com/presentation/d/DECK1/edit', created: '09.09.2026 09:00', by: 'x', slides: 3 }];
const RECS = ${JSON.stringify(RECS)};
window.__TEST_API = {
  apiListRows: () => { __calls.push(['apiListRows']); return { ok: true, rows: JSON.parse(JSON.stringify(RECS)).sort((a, b) => b.key.localeCompare(a.key)) }; },
  apiListDecks: () => ({ ok: true, decks: __decks.slice() }),
  apiCreateDeck: (n) => { const d = { id: 'DECK' + (__decks.length + 1), name: n, url: '#', created: 'зараз', by: 'test', slides: 0 }; __decks.unshift(d); return { ok: true, deck: d }; },
  apiBuildSlide: (p) => new Promise((res, rej) => setTimeout(() => {
    __calls.push(['apiBuildSlide', p]);
    if (p.key === '20260827-222034' && window.__failKyiv) return rej(new Error('Диск ще не створив мініатюру'));
    const r = RECS.filter((x) => x.key === p.key)[0];
    r.slideUrl = 'https://docs.google.com/presentation/d/' + p.deckId + '/edit#slide=id.NEW_' + p.key;
    res({ ok: true, slideUrl: r.slideUrl, deckUrl: '#', deckName: 'дека', replaced: !!p.replace && p.key === '20260828-184042',
          photos: r.photoIds.length, skipped: 0, map: p.key === '20260826-181927' ? 'shot' : 'static', mapPoints: 17,
          price: r.priceUah != null ? 'число' : 'текст із форми', coords: 'geocode', notes: ['карта: статична карта, z13, точок мережі в кадрі: 17'] });
  }, 30)),
  apiColumnReport: () => ({ ok: true, lines: ['ts → 1', 'city → 5'] })
};`;

function build() {
  let h = fs.readFileSync(R + 'Wizard.html', 'utf8');
  h = h.replace("<?!= include('Wizard_css'); ?>", fs.readFileSync(R + 'Wizard_css.html', 'utf8'));
  h = h.replace('<?!= boot ?>', JSON.stringify(BOOT));
  h = h.replace("<?!= include('Wizard_js'); ?>", '<script>' + MOCK + '</script>' + fs.readFileSync(R + 'Wizard_js.html', 'utf8'));
  h = h.replace(/<\?!=[^?]*\?>/g, '');
  return h;
}

(async () => {
  const html = build();
  const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const br = await chromium.launch({ executablePath: findChromium() });
  const pg = await br.newPage({ viewport: { width: 1300, height: 900 } });
  pg.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Розгляд тест' : undefined));
  await pg.goto(url);
  await pg.waitForFunction(() => window.__wiz && window.__wiz.state().rows === 4);
  const st = () => pg.evaluate(() => window.__wiz.state());
  const calls = () => pg.evaluate(() => window.__calls);

  console.log('Список і вибір');
  ok((await st()).visible === 2, 'типово: без слайда і без «Не підходить» — 2 з 4');
  await pg.uncheck('#onlyNew');
  ok((await st()).visible === 3, 'без фільтра слайдів — 3, відхилена схована');
  await pg.check('#showRejected');
  ok((await st()).visible === 4 && (await pg.$$('.row .badge.rej')).length === 1, '«показувати Не підходить» → 4, одна з червоною поміткою');
  await pg.uncheck('#showRejected'); await pg.check('#onlyNew');
  ok((await pg.$eval('#build', (b) => b.disabled)), 'без вибору кнопка неактивна');
  await pg.click('#selVisible');
  let s = await st();
  ok(s.sel.length === 2 && /\(2\)/.test(s.build), '«Обрати всі видимі» → 2, кнопка «Створити слайди (2)»', s.build);
  await pg.click('.row[data-key="20260826-181927"]');
  ok((await st()).sel.length === 1, 'клік по заявці знімає вибір');
  await pg.click('.row[data-key="20260826-181927"]');
  ok((await st()).sel.length === 2, '…і повертає');
  const kyivRow = await pg.textContent('.row[data-key="20260827-222034"]');
  ok(/фото: 15/.test(kyivRow) && /ціна текстом/.test(kyivRow), 'у рядку видно кількість фото і що ціна текстом');
  await pg.uncheck('#onlyNew');
  const mapHref = await pg.$eval('.row[data-key="20260828-184042"] a[data-nosel]', (a) => a.href);
  ok(/slide=20260828-184042/.test(mapHref) && /ll=48\.2664111,25\.9582113/.test(mapHref), '«карта ↗» несе ключ і координати з посилання Google Maps', mapHref);
  await pg.$eval('.row[data-key="20260828-184042"] a[data-nosel]', (a) => { a.removeAttribute('target'); a.href = 'javascript:void(0)'; });
  await pg.click('.row[data-key="20260828-184042"] a[data-nosel]');
  ok((await st()).sel.length === 2, 'клік по «карта ↗» не міняє вибір');
  await pg.check('#onlyNew');

  console.log('Презентація і пакет');
  await pg.click('#newDeck');
  await pg.waitForFunction(() => window.__wiz.state().decks === 2);
  ok((await pg.$eval('#deck', (e) => e.value)) === 'DECK2', 'нова презентація створена й обрана');
  await pg.click('#build');
  await pg.waitForFunction(() => /Готово/.test(window.__wiz.state().log));
  let built = (await calls()).filter((c) => c[0] === 'apiBuildSlide').map((c) => c[1]);
  ok(built.length === 2, 'два виклики — по одному на заявку', JSON.stringify(built.map((b) => b.key)));
  ok(built.every((b) => b.deckId === 'DECK2' && b.replace === true && b.row > 0), 'payload: презентація, replace, номер рядка', JSON.stringify(built[0]));
  const log = (await st()).log;
  ok(/фото: 15/.test(log) && /точок поруч 17/.test(log) && /ціна: текст із форми/.test(log), 'у журналі: фото, карта, ціна', log.slice(0, 200));
  ok(/карта: знімок із карти мережі/.test(log), 'для Чернігова — знімок 💾 замість статичної');
  ok(/Готово:.*2 слайдів/.test(log), 'підсумок: 2 слайди');
  await pg.uncheck('#onlyNew');
  ok((await pg.$$('.row .badge a')).length === 3, 'у списку зʼявились посилання «є слайд» (2 нові + 1 стара)');
  await pg.check('#onlyNew');
  ok((await st()).sel.length === 0, 'вибір знято після успіху');
  ok(!(await st()).running && !(await pg.$eval('#stop', (e) => e.style.display !== 'none')), 'прогін завершено, «Зупинити» сховано');

  console.log('Помилка однієї заявки і повтор у тій самій презентації');
  await pg.evaluate(() => { window.__failKyiv = true; });
  await pg.uncheck('#onlyNew');
  await pg.click('#selVisible');
  ok((await st()).sel.length === 3, 'три відмічені, одна з них уже має слайд у DECK1');
  await pg.selectOption('#deck', 'DECK1');
  await pg.click('#build');   /* confirm про заміну приймається автоматично */
  await pg.waitForFunction(() => /Готово/.test(window.__wiz.state().log));
  const log2 = (await st()).log;
  ok(/✘ Київ/.test(log2) && /Диск ще не створив/.test(log2), 'помилка Києва показана з причиною');
  ok(/Готово:.*2 слайдів, помилок 1/.test(log2), 'решта зроблена, підсумок чесний', log2.slice(-120));
  ok((await st()).sel.length === 1 && (await st()).sel[0] === '20260827-222034', 'невдала заявка лишилась відміченою для повтору');
  built = (await calls()).filter((c) => c[0] === 'apiBuildSlide').map((c) => c[1]);
  ok(built.filter((b) => b.key === '20260828-184042' && b.deckId === 'DECK1' && b.replace).length === 1, 'Чернівці пішли на заміну в DECK1');

  console.log('Зупинка');
  await pg.evaluate(() => { window.__failKyiv = false; });
  await pg.click('#selVisible');
  await pg.click('#build');
  await pg.click('#stop');
  await pg.waitForFunction(() => /Готово/.test(window.__wiz.state().log));
  ok(/зупинено/.test((await st()).log), '«Зупинити» перериває після поточної заявки');

  await pg.click('#colsToggle');
  await pg.waitForFunction(() => /city/.test(document.getElementById('cols').textContent));
  ok(true, 'звіт про колонки відкривається');

  const errs = await pg.evaluate(() => (window.__errors || []).slice(0, 4));
  ok(errs.length === 0, 'жодної помилки JS на сторінці', errs.join(' | '));

  await br.close(); server.close();
  console.log(failed ? '\n' + failed + ' перевірок не пройшло' : '\nУсі перевірки пройшли');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('✘ тест упав: ' + (e && e.stack || e)); process.exit(1); });
