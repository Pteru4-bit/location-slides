/*
 * parse-test.js — чисті функції розбору на трьох СПРАВЖНІХ рядках форми.
 *
 *   node tools/parse-test.js
 *
 * Рядки — це перші три заявки, за якими люди робили слайди вручну
 * (Чернігів, Чернівці, Київ). Очікувані значення взяті зі слайдів: площа
 * «800кв.м.» на слайді стала 800, «до 5 300» — 5 300, а вартість «від 15 $/м²»
 * людина перерахувала сама — тому тут очікуємо null, а не число.
 *
 * Читаємо справжній src/Parse.gs: файл не кличе сервісів Apps Script, тож
 * виконується в node як є.
 */
'use strict';
const path = require('path');
const P = require(path.join(__dirname, '..', 'src', 'Parse.gs'));

let failed = 0;
function ok(pass, title, detail) {
  console.log((pass ? '  ✔ ' : '  ✘ ') + title + (detail ? '  — ' + detail : ''));
  if (!pass) failed++;
}
function eq(actual, expected, title) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(a === e, title, a === e ? '' : 'отримано ' + a + ', очікувалось ' + e);
}

/* Три рядки форми, як їх вставили з таблиці (табуляція між колонками). */
const ROWS = {
  chernihiv: '26.08.2026 18:19:27\t26.08.2026\tДусь Т.\tЧернігівська обл.\tЧернігів\tДрозда, 16\tОренда\t1000\tДоговірна, ще заянято до жовтня\t2, + можоивість зробмти 5+\tТак\thttps://drive.google.com/open?id=1wj3hBhD4L4KoGE45vuvMyCJcj5G3o-xQ\thttps://drive.google.com/open?id=1S3VUEY_lD5GW3qUT45nRWFrQTR2UZmuL\tВід власника\tДепо/термінал\t26.08.2026\tКорнієнко\tНа розгляді\tЛівобережжя\tМРМ знайшов самостійно (сайт оголошень, пошук, контакти, тощо)\t\t',
  chernivtsi: '28.08.2026 18:40:42\t28.08.2026\tКолодій Д\tЧернівецька обл.\tЧернівці\tЧкалова, 34\tОренда\t800кв.м.\t160000\t1\tтак\thttps://drive.google.com/open?id=1a5tMI5_W4JmacqSVUFFxhTKnxiT83U-Z\thttps://drive.google.com/open?id=1unV-eKgggCyUzNIiSBPlUTupdkXlN0eB\tнаразі в процесі переговорів, попередньо зацікавлені в ремонті під нас\tВідділення\t\t\t\tПравобережжя\tРієлтор\thttps://drive.google.com/open?id=1TWbaxoOsp3x5KacnRPZgI8R6Cnn6jdRB\thttps://www.google.com.ua/maps/@48.2664111,25.9582113,19.71z?hl=ru&entry=ttu&g_ep=EgoyMDI2MDgyNS4wIKXMDSoASAFQAw%3D%3D',
  kyiv: '27.08.2026 22:20:34\t27.08.2026\tНижник Н.\tКиївська обл.\tКиїв \tВелика Кільцева\tОренда\tдо 5 300\tвід 15 $/м² з ПДВ + комунальні та експлуатаційні витрати 10%\t8\tтак\thttps://drive.google.com/open?id=1WGt4kCjj3jGI5TwphzbojC7uYTjbHLJE, https://drive.google.com/open?id=1GrAgM-OaW1pnY_ipXUYnMxnKTEP13KMA\thttps://drive.google.com/open?id=18pcKkDHftnBgDfaiYJVXAeDgCoX50bbO, https://drive.google.com/open?id=1o9__PIn_hv4Dwe4TALrUpqW5r0hOexaH\thttps://www.olx.ua/d/uk/obyavlenie/orenda-novogo-skladu-5300-m-velika-kltseva-h9-m-rampi-klas-b-ID112mL9.html?isPreviewActive=0\tДепо/термінал\t27.08.2026\tТруфанов М\t15$, мала к-сть рамп\tКиїв та обл\tРієлтор\t\t'
};
const C = { ts: 0, city: 4, address: 5, area: 7, price: 8, photo1: 11, photo2: 12, objType: 14, photo3: 20, mapLink: 21 };
const cells = (k) => ROWS[k].split('\t');

console.log('Площа');
eq(P.parseArea(cells('chernihiv')[C.area]), 1000, 'Чернігів «1000» → 1000');
eq(P.parseArea(cells('chernivtsi')[C.area]), 800, 'Чернівці «800кв.м.» → 800');
eq(P.parseArea(cells('kyiv')[C.area]), 5300, 'Київ «до 5 300» → 5300');
eq(P.parseArea('1 200,5 м²'), 1200.5, 'дробова через кому');
eq(P.parseArea('немає'), null, 'без числа → null');

console.log('Вартість у гривнях');
eq(P.parsePriceUah(cells('chernihiv')[C.price]), null, 'Чернігів «Договірна…» → null (число впише людина)');
eq(P.parsePriceUah(cells('chernivtsi')[C.price]), 160000, 'Чернівці «160000» → 160000');
eq(P.parsePriceUah(cells('kyiv')[C.price]), null, 'Київ «від 15 $/м²…» → null (долари за м²)');
eq(P.parsePriceUah('100 000 грн'), 100000, '«100 000 грн» → 100000');
eq(P.parsePriceUah('2500 грн/м²'), null, 'ціна за м² у гривнях — теж null');
eq(P.pricePerM2(160000, 800), 200, 'Чернівці: 160 000 / 800 = 200, як на слайді');
eq(P.pricePerM2(3577500, 5300), 675, 'Київ: 3 577 500 / 5 300 = 675, як на слайді');
eq(P.pricePerM2(100000, 1000), 100, 'Чернігів: 100 000 / 1000 = 100');
eq(P.formatInt(3577500), '3 577 500', 'розряди через пробіл');
eq(P.formatInt(675), '675', 'три цифри без пробілу');

console.log('Фото з комірок форми');
eq(P.extractDriveIds(cells('chernihiv')[C.photo1]), ['1wj3hBhD4L4KoGE45vuvMyCJcj5G3o-xQ'], 'одне посилання → один id');
eq(P.extractDriveIds(cells('kyiv')[C.photo1]),
   ['1WGt4kCjj3jGI5TwphzbojC7uYTjbHLJE', '1GrAgM-OaW1pnY_ipXUYnMxnKTEP13KMA'], 'два через кому → два id, порядок збережено');
eq(P.extractDriveIds(cells('chernivtsi')[C.photo3]), ['1TWbaxoOsp3x5KacnRPZgI8R6Cnn6jdRB'], 'третя колонка фото');
eq(P.extractDriveIds(cells('chernihiv')[C.photo3]), [], 'порожня комірка → []');
eq(P.extractDriveIds('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view'), ['1AbCdEfGhIjKlMnOpQrStUvWxYz012345'], 'формат /file/d/');
eq(P.extractDriveIds('a, https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345, https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345'), ['1AbCdEfGhIjKlMnOpQrStUvWxYz012345'], 'дублікат відкинуто');

console.log('Координати');
eq(P.coordsFromText(cells('chernivtsi')[C.mapLink]), { lat: 48.266411, lng: 25.958211 }, 'Чернівці: @lat,lng із посилання форми');
eq(P.coordsFromText(cells('kyiv')[C.mapLink]), null, 'Київ: посилання немає → null');
eq(P.coordsFromText('https://www.google.com/maps/place/x/@50.45,30.52,17z/data=!3m1!4b1!4m6!3m5!8m2!3d50.450123!4d30.523456'),
   { lat: 50.450123, lng: 30.523456 }, '!3d!4d (сама мітка) важливіший за @центр вікна');
eq(P.coordsFromText('https://maps.google.com/?q=51.53568,31.25321'), { lat: 51.53568, lng: 31.25321 }, '?q=lat,lng');
eq(P.coordsFromText('51.53568, 31.25321'), { lat: 51.53568, lng: 31.25321 }, 'голий текст «lat, lng» (як у попапі карти)');
eq(P.coordsFromText('https://www.google.com/maps/@55.75,37.61,12z'), null, 'Москва — поза межами України → null');
ok(P.isShortMapLink('https://maps.app.goo.gl/AbC123'), 'maps.app.goo.gl — скорочене');
ok(!P.isShortMapLink(cells('chernivtsi')[C.mapLink]), 'повне посилання — не скорочене');

console.log('Макет');
eq(P.layoutFor(3), 'row', 'Чернігів/Чернівці: 2 фото + карта = 3 → один ряд');
eq(P.layoutFor(5), 'grid', 'Київ: 4 фото + карта = 5 → два ряди');
eq(P.layoutFor(1), 'row', 'одна картинка → ряд');
eq(P.layoutFor(0), null, 'без картинок → null');
eq(P.layoutFor(6), null, 'шість → null (обмеження майстра)');
eq(P.MAX_IMAGES, 5, 'стеля — 5 картинок разом із картою');

console.log('Пропозиція за типом обʼєкта');
eq(P.defaultProposal(cells('chernivtsi')[C.objType]), 'Відкриття відділення', '«Відділення» → як на слайді Чернівців');
eq(P.defaultProposal(cells('kyiv')[C.objType]), 'Відкриття депо або терміналу', '«Депо/термінал» → депо або терміналу');
eq(P.defaultProposal('Щось нове'), 'Відкриття: Щось нове', 'невідомий тип — як є');

console.log('Колонки за заголовками');
const H = ['Позначка часу', 'Дата огляду', 'МРМ', 'Область', 'Місто', 'Адреса', 'Оренда / Купівля', 'Площа, м²',
           'Вартість', 'Кількість рамп', 'Чи є ...', 'Фото фасаду', 'Фото приміщення', 'Коментар', "Тип об'єкта",
           'Дата розгляду', 'Хто розглянув', 'Рішення', 'Філія', 'Джерело', 'Додаткові фото', 'Посилання на Google Maps'];
eq(P.headerMatch(H, ['дата огляду', 'дата']), 1, '«дата» → перша колонка «Дата огляду», а не «Дата розгляду»');
eq(P.headerMatch(H, ['тип обʼєкта']), 14, "апостроф у заголовку не заважає (об'єкта / обʼєкта)");
eq(P.headerMatch(H, ['немає такого']), -1, 'не знайдено → -1');
eq(P.headerMatchAll(H, ['фото']), [11, 12, 20], 'усі колонки з «фото» у порядку аркуша');
eq(P.letterIndex('A'), 0, 'A → 0'); eq(P.letterIndex('V'), 21, 'V → 21'); eq(P.letterIndex('AA'), 26, 'AA → 26');

console.log('Службове');
eq(P.parseSlideUrl('https://docs.google.com/presentation/d/1abcDEF_-xyz/edit#slide=id.g2f1a2b3c4d_0_5'),
   { deckId: '1abcDEF_-xyz', slideId: 'g2f1a2b3c4d_0_5' }, 'дека і слайд із записаного посилання');
eq(P.parseSlideUrl(''), null, 'порожнє → null');
eq(P.keyFromTimestampString(cells('chernihiv')[C.ts]), '20260826-181927', 'ключ рядка з мітки часу форми');
eq(P.normText(cells('kyiv')[C.city]), 'Київ', 'пробіл у кінці «Київ » прибрано');

console.log(failed ? '\n' + failed + ' перевірок не пройшло' : '\nУсі перевірки пройшли');
process.exit(failed ? 1 : 0);
