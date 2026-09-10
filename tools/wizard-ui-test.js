/*
 * wizard-ui-test.js — майстер слайда в справжньому браузері, без Google.
 *
 *   node tools/wizard-ui-test.js
 *
 * Сторінка збирається з src/Wizard*.html так само, як це робить Apps Script
 * (include → вставка), а замість google.script.run підставляється
 * window.__TEST_API з даними трьох реальних заявок. Перевіряється те, що
 * найлегше зламати правкою інтерфейсу: список і фільтр, типовий вибір фото,
 * стеля «5 картинок разом із картою», порядок фото, обовʼязкова вартість у
 * гривнях, payload, який іде на сервер, і кнопка «Оновити», коли слайд у цій
 * деці вже є. Помилки JS на сторінці — теж провал.
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

const BOOT = { email: 'test@novaposhta.ua', mapUrl: 'https://script.google.com/a/x/macros/s/MAP/exec', key: '', row: 0, shotZoom: 15, maxImages: 5 };
const thumb = (label, color) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="' + color + '"/><text x="10" y="60" font-size="18" fill="#fff">' + label + '</text></svg>');
const photo = (id, name, okk) => ({ id, ok: okk !== false, name, mime: 'image/jpeg', url: '#', thumb: okk === false ? '' : thumb(name, '#5a7'), error: okk === false ? 'нема доступу' : '' });

const RECS = {
  '20260826-181927': { row: 2, key: '20260826-181927', ts: '26.08.2026 18:19', date: '26.08.2026', author: 'Дусь Т.', region: 'Чернігівська обл.', city: 'Чернігів', address: 'Дрозда, 16', deal: 'Оренда',
    areaRaw: '1000', area: 1000, priceRaw: 'Договірна, ще заянято до жовтня', priceUah: null, ramps: '2, + можоивість зробмти 5+', comment: 'Від власника', objType: 'Депо/термінал',
    reviewDate: '26.08.2026', reviewer: 'Корнієнко', decision: 'На розгляді', branch: 'Лівобережжя', source: 'МРМ знайшов самостійно', mapLink: '', photoIds: ['p1', 'p2'],
    slideUrl: '', slideUpdated: '', slideBy: '', slideDeck: '', coordsSaved: '', proposalDefault: 'Відкриття депо або терміналу',
    photos: [photo('p1', 'фасад.jpg'), photo('p2', 'склад.jpg')],
    coords: { lat: 51.53568, lng: 31.25321, source: 'geocode', precision: 'building', note: '', label: 'вулиця Володимира Дрозда, 16, Чернігів' },
    mapShots: [{ id: 'm1', ok: true, name: 'slide-20260826-181927-20260910-1200.png', created: '10.09 12:00', thumb: thumb('карта', '#48c'), url: '#' }] },
  '20260828-184042': { row: 3, key: '20260828-184042', ts: '28.08.2026 18:40', date: '28.08.2026', author: 'Колодій Д', region: 'Чернівецька обл.', city: 'Чернівці', address: 'Чкалова, 34', deal: 'Оренда',
    areaRaw: '800кв.м.', area: 800, priceRaw: '160000', priceUah: 160000, ramps: '1', comment: 'наразі в процесі переговорів', objType: 'Відділення',
    reviewDate: '', reviewer: '', decision: '', branch: 'Правобережжя', source: 'Рієлтор', mapLink: 'https://www.google.com.ua/maps/@48.2664111,25.9582113,19.71z', photoIds: ['q1', 'q2', 'q3'],
    slideUrl: 'https://docs.google.com/presentation/d/DECK1/edit#slide=id.g1', slideUpdated: '09.09.2026 10:00', slideBy: 'x@novaposhta.ua', slideDeck: 'Розгляд 09.09', coordsSaved: '', proposalDefault: 'Відкриття відділення',
    photos: [photo('q1', 'фасад.jpg'), photo('q2', 'цех.jpg'), photo('q3', 'третє.heic', false)],
    coords: { lat: 48.266411, lng: 25.958211, source: 'link', precision: 'building', note: '' }, mapShots: [] },
  '20260827-222034': { row: 4, key: '20260827-222034', ts: '27.08.2026 22:20', date: '27.08.2026', author: 'Нижник Н.', region: 'Київська обл.', city: 'Київ', address: 'Велика Кільцева', deal: 'Оренда',
    areaRaw: 'до 5 300', area: 5300, priceRaw: 'від 15 $/м² з ПДВ + комунальні та експлуатаційні витрати 10%', priceUah: null, ramps: '8', comment: 'https://www.olx.ua/…', objType: 'Депо/термінал',
    reviewDate: '27.08.2026', reviewer: 'Труфанов М', decision: '15$, мала к-сть рамп', branch: 'Київ та обл', source: 'Рієлтор', mapLink: '', photoIds: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'],
    slideUrl: '', slideUpdated: '', slideBy: '', slideDeck: '', coordsSaved: '', proposalDefault: 'Відкриття депо або терміналу',
    photos: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].map((id) => photo(id, id + '.webp')),
    coords: { lat: 50.38357, lng: 30.43296, source: 'geocode', precision: 'area', note: 'знайдено приблизно — район або населений пункт', label: 'Кільцева дорога, Київ' },
    mapShots: [{ id: 'km', ok: true, name: 'slide-20260827-222034-20260910-1300.png', created: '10.09 13:00', thumb: thumb('карта', '#48c'), url: '#' }] }
};
RECS['20260909-090000'] = Object.assign({}, RECS['20260828-184042'], { row: 5, key: '20260909-090000', city: 'Одеса', address: 'вул. Академіка Сахарова 1',
  objType: 'Не підходить', rejected: true, decision: 'мала площа', slideUrl: '', slideDeck: '', yard: 'так', video: 'https://example.com/360',
  proposalDefault: 'Відкриття', photos: [photo('o1', 'фасад.jpg')], photoIds: ['o1'], mapShots: [] });
const rowsList = () => Object.keys(RECS).map((k) => RECS[k]).sort((a, b) => b.key.localeCompare(a.key));

/* Мок API живе на сторінці: усі виклики записуються у window.__calls. */
const MOCK = `
window.__calls = []; window.__decks = [{ id: 'DECK1', name: 'Розгляд 09.09', url: 'https://docs.google.com/presentation/d/DECK1/edit', created: '09.09.2026 09:00', by: 'x', slides: 3 }];
const RECS = ${JSON.stringify(RECS)};
const rows = () => Object.values(RECS).map(r => Object.assign({}, r, { photos: undefined, coords: undefined, mapShots: undefined })).sort((a,b) => b.key.localeCompare(a.key));
const rec = (k) => { const r = RECS[k]; if (!r) throw new Error('немає ' + k); return JSON.parse(JSON.stringify(r)); };
window.__TEST_API = {
  apiListRows: () => { __calls.push(['apiListRows']); return { ok: true, rows: rows() }; },
  apiGetRow: (k) => { __calls.push(['apiGetRow', k]); return { ok: true, rec: rec(k) }; },
  apiListMapShots: (k) => { __calls.push(['apiListMapShots', k]); return { ok: true, shots: rec(k).mapShots }; },
  apiUploadMapShot: (k, d) => ({ ok: true, shot: { id: 'up1', ok: true, name: 'slide-' + k + '-manual.png', created: 'зараз', thumb: d, url: '#' } }),
  apiGeocode: (q) => { __calls.push(['apiGeocode', q]); return { ok: true, lat: 50.45, lng: 30.52, label: 'знайдено: ' + q, precision: 'building', note: '' }; },
  apiSaveCoords: (k, r, la, ln) => { __calls.push(['apiSaveCoords', k, la, ln]); return { ok: true }; },
  apiListDecks: () => ({ ok: true, decks: __decks.slice() }),
  apiCreateDeck: (n) => { const d = { id: 'DECK' + (__decks.length + 1), name: n, url: '#', created: 'зараз', by: 'test', slides: 0 }; __decks.unshift(d); return { ok: true, deck: d }; },
  apiBuildSlide: (p) => { __calls.push(['apiBuildSlide', p]); if (p.deckId === 'FAIL') throw new Error('сервер відмовив'); return { ok: true, slideUrl: 'https://docs.google.com/presentation/d/' + p.deckId + '/edit#slide=id.NEW', deckUrl: '#', deckName: 'дека', layout: 'row', images: p.photos.length + (p.mapFileId ? 1 : 0), replaced: !!p.replace, note: '' }; },
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

  console.log('Список');
  ok((await pg.$$('.row')).length === 2, 'фільтр «лише без слайда» ховає заявку зі слайдом, «Не підходить» схована типово (2 з 4)');
  await pg.uncheck('#onlyNew');
  ok((await pg.$$('.row')).length === 3, 'без фільтра слайдів — три, відхилена й далі схована');
  await pg.check('#showRejected');
  ok((await pg.$$('.row')).length === 4 && (await pg.$$('.row .badge.rej')).length === 1, '«показувати Не підходить» → четверта з червоною поміткою');
  await pg.click('.row[data-key="20260909-090000"]');
  await pg.waitForFunction(() => window.__wiz.state().key === '20260909-090000');
  ok(/не підходить/.test(await pg.textContent('#hMeta')) && /автодвір: так/.test(await pg.textContent('#hMeta')), 'у шапці: помітка «не підходить», автодвір');
  ok((await pg.$eval('#hMeta a', (a) => a.href)) === 'https://example.com/360', 'відео 360 — посилання');
  await pg.uncheck('#showRejected');
  await pg.fill('#q', 'чернів');
  ok((await pg.$$('.row')).length === 1, 'пошук за містом');
  await pg.fill('#q', '');

  console.log('Чернігів: 2 фото + карта');
  await pg.click('.row[data-key="20260826-181927"]');
  await pg.waitForFunction(() => window.__wiz.state().key === '20260826-181927');
  let s = await st();
  ok(s.sel.length === 2 && s.sel[0] === 'p1', 'обидва фото обрано типово, у порядку форми');
  ok(s.map === 'm1', 'найновіший знімок карти обрано сам');
  ok(/один ряд \(3 із 3\)/.test(s.layout), 'макет: один ряд, 3 із 3', s.layout);
  ok(await pg.$eval('#priceHint', (e) => e.style.display !== 'none'), 'підказка: вартість у формі не в гривнях');
  ok((await pg.$eval('#openMap', (e) => e.href)).indexOf('ll=51.53568,31.25321&z=15') !== -1, 'посилання на карту несе координати й ключ',
     await pg.$eval('#openMap', (e) => e.href));
  ok((await pg.$eval('#openMap', (e) => e.href)).indexOf('slide=20260826-181927') !== -1, '…і ключ заявки для назви файлу');
  await pg.fill('#fPrice', '100 000');
  ok((await pg.$eval('#fM2', (e) => e.value)) === '100', 'вартість за м² рахується: 100 000 / 1000 = 100');
  /* порядок фото: стрілка «пізніше» на першому */
  await pg.click('.th[data-id="p1"] [data-mv="1"]');
  s = await st();
  ok(s.sel[0] === 'p2' && s.sel[1] === 'p1', 'стрілка міняє порядок фото');
  /* створити слайд без деки в списку? дека DECK1 є — але спершу без вартості */
  await pg.fill('#fPrice', '');
  await pg.click('#build');
  await pg.waitForSelector('#result.err');
  ok(/вартість у гривнях/i.test(await pg.textContent('#result')), 'без вартості слайд не збирається, є пояснення');
  await pg.fill('#fPrice', '100000');
  await pg.click('#newDeck');
  await pg.waitForFunction(() => window.__wiz.state().decks === 2);
  ok((await pg.$eval('#deck', (e) => e.value)) === 'DECK2', 'нова дека створена й обрана');
  await pg.click('#build');
  await pg.waitForSelector('#result:not(.err)');
  const built = (await calls()).filter((c) => c[0] === 'apiBuildSlide').pop()[1];
  ok(built.deckId === 'DECK2' && built.priceUah === 100000 && built.area === 1000, 'payload: дека, вартість, площа', JSON.stringify(built));
  ok(JSON.stringify(built.photos) === '["p2","p1"]' && built.mapFileId === 'm1', 'payload: фото в обраному порядку + карта');
  ok(built.replace === false && built.coords && built.coords.lat === 51.53568, 'payload: новий слайд, координати з майстра');
  ok(/Слайд створено/.test(await pg.textContent('#result')), 'результат з посиланням');
  ok((await pg.$$('.row .badge:not(.no)')).length === 2, 'у списку заявка тепер «є слайд»');

  console.log('Чернівці: слайд у цій деці вже є');
  await pg.click('.row[data-key="20260828-184042"]');
  await pg.waitForFunction(() => window.__wiz.state().key === '20260828-184042');
  await pg.waitForFunction(() => /Оновити/.test(window.__wiz.state().build) || document.getElementById('deck').value !== 'DECK1');
  await pg.selectOption('#deck', 'DECK1');
  s = await st();
  ok(/Оновити слайд/.test(s.build), 'кнопка «Оновити слайд у цій деці» для деки зі слайдом', s.build);
  ok(s.sel.length === 2, 'файл, що не відкрився, типово не обрано (2 з 3)');
  ok((await pg.$eval('#fPrice', (e) => e.value)) === '160000' && (await pg.$eval('#fM2', (e) => e.value)) === '200', 'числа з форми підставлено: 160000 → 200 за м²');
  ok(/посилання Google Maps/.test(await pg.textContent('#coordsNote')), 'джерело координат: посилання з заявки');
  await pg.click('.th[data-id="q3"]');
  ok((await st()).sel.length === 2, 'зламаний файл не обирається кліком');
  ok(/не відкрився/.test(await pg.textContent('#buildMsg')), '…і про це сказано');
  await pg.selectOption('#deck', 'DECK2');
  ok(/Створити/.test((await st()).build), 'в іншій деці — «Створити»');

  console.log('Київ: 6 фото + карта, стеля 5');
  await pg.click('.row[data-key="20260827-222034"]');
  await pg.waitForFunction(() => window.__wiz.state().key === '20260827-222034');
  s = await st();
  ok(s.sel.length === 4 && s.map === 'km', 'типово 4 фото + карта = 5, більше не влазить', JSON.stringify(s.sel));
  ok(/два ряди \(5 із 5\)/.test(s.layout), 'макет: два ряди, 5 із 5', s.layout);
  await pg.click('.th[data-id="k5"]');
  ok((await st()).sel.length === 4, 'шосту картинку не додати');
  ok(/Максимум 5/.test(await pg.textContent('#buildMsg')), '…з поясненням');
  await pg.click('.th[data-id="k1"]');
  await pg.click('.th[data-id="k5"]');
  s = await st();
  ok(s.sel.length === 4 && s.sel[3] === 'k5', 'зняв одне — можна додати інше, воно стає останнім');
  await pg.click('[data-shot=""]');
  s = await st();
  ok(s.map === '' && /без карти/.test(s.layout) && /один ряд|два ряди/.test(s.layout), 'без карти: макет за 4 фото', s.layout);
  ok(/приблизно/.test(await pg.textContent('#coordsNote')), 'попередження про приблизне геокодування');
  await pg.click('#geoBtn');
  await pg.waitForFunction(() => /знайдено:/.test(document.getElementById('coordsNote').textContent));
  ok((await pg.$eval('#fLat', (e) => e.value)) === '50.45', 'геокодер оновив координати');
  await pg.click('#saveCoords');
  await pg.waitForFunction(() => window.__calls.some((c) => c[0] === 'apiSaveCoords'));
  ok(true, 'координати збережено викликом API');

  console.log('Помилка сервера');
  await pg.evaluate(() => { __decks.unshift({ id: 'FAIL', name: 'зламана', url: '#', created: '', by: '', slides: 0 }); });
  await pg.click('#reload');
  await pg.waitForFunction(() => window.__wiz.state().rows === 4);
  await pg.click('.row[data-key="20260828-184042"]');
  await pg.waitForFunction(() => window.__wiz.state().key === '20260828-184042' && window.__wiz.state().decks === 3);
  await pg.selectOption('#deck', 'FAIL');
  await pg.click('#build');
  await pg.waitForSelector('#result.err');
  ok(/сервер відмовив/.test(await pg.textContent('#result')), 'помилка сервера показана людині');
  ok(!(await pg.$eval('#build', (e) => e.disabled)), 'кнопка знову активна');

  await pg.click('#colsToggle');
  await pg.waitForFunction(() => /city/.test(document.getElementById('cols').textContent));
  ok(true, 'звіт про колонки відкривається');

  const errs = await pg.evaluate(() => (window.__errors || []).slice(0, 4));
  ok(errs.length === 0, 'жодної помилки JS на сторінці', errs.join(' | '));

  await br.close(); server.close();
  console.log(failed ? '\n' + failed + ' перевірок не пройшло' : '\nУсі перевірки пройшли');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('✘ тест упав: ' + (e && e.stack || e)); process.exit(1); });
