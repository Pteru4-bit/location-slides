/***********************************************************************
 *  Parse — чисті функції без жодного сервісу Apps Script.
 *
 *  Тут усе, що можна перевірити без Google: розбір площі й вартості з
 *  вільного тексту форми, витяг ідентифікаторів файлів Drive із комірки,
 *  координати з посилання Google Maps, вибір макета за кількістю
 *  картинок, підбір колонок за заголовками. Саме ці функції ганяє
 *  tools/parse-test.js у node на трьох реальних рядках форми.
 *
 *  Правило файлу: жодного SpreadsheetApp/DriveApp/Utilities. Якщо функції
 *  потрібен сервіс — їй місце в іншому файлі.
 ***********************************************************************/

/* Пробіли-розділювачі розрядів у формі бувають різні: звичайний, нерозривний,
   вузький. Зводимо все до одного, щоб «5 300» читалось як 5300. */
function normText(s) {
  return String(s == null ? '' : s).replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* Перше число в тексті. Розряди через пробіл («3 577 500»), дробова частина
   через кому або крапку («1 200,5»). «800кв.м.» → 800: крапка після числа
   без цифр далі не вважається дробовою. Немає числа → null. */
function parseNumberLoose(text) {
  var t = normText(text);
  if (!t) return null;
  var m = t.match(/(\d{1,3}(?: \d{3})+|\d+)(?:[.,](\d+))?/);
  if (!m) return null;
  var whole = m[1].replace(/ /g, '');
  var n = Number(whole + (m[2] ? '.' + m[2] : ''));
  return isFinite(n) ? n : null;
}

/* Площа, м². «1000», «800кв.м.», «до 5 300» → 1000, 800, 5300. */
function parseArea(text) {
  return parseNumberLoose(text);
}

/* Вартість у гривнях, коли її можна взяти з форми БЕЗ припущень.
   Повертає число лише якщо це сума в гривнях за весь обʼєкт. Долари, євро,
   ціна за м² чи текст без числа → null: тоді число впише людина в майстрі.
   Приклади з форми: «160000» → 160000; «100 000 грн» → 100000;
   «від 15 $/м² з ПДВ…» → null; «Договірна, ще заянято до жовтня» → null. */
function parsePriceUah(text) {
  var t = normText(text);
  if (!t || !/\d/.test(t)) return null;
  if (/[$€]|usd|eur|дол|євро|у\.?\s?о\.?|\/\s*м|за\s*м|м²|м2|кв\.?\s*м/i.test(t)) return null;
  return parseNumberLoose(t);
}

/* Вартість за м²: ціле число, як на слайдах (100 000 / 1000 → 100). */
function pricePerM2(price, area) {
  if (!(price > 0) || !(area > 0)) return null;
  return Math.round(price / area);
}

/* «3577500» → «3 577 500». Дробову частину відкидаємо: на слайді гривні цілі. */
function formatInt(n) {
  if (n == null || !isFinite(n)) return '';
  var s = String(Math.round(Math.abs(n)));
  var out = '';
  while (s.length > 3) { out = ' ' + s.slice(-3) + out; s = s.slice(0, -3); }
  return (n < 0 ? '-' : '') + s + out;
}

/* Ідентифікатори файлів Drive з комірки форми. Форма пише посилання виду
   https://drive.google.com/open?id=XXX, кілька файлів — через кому. Також
   розуміємо /file/d/XXX і /d/XXX. Порядок зберігається, дублікати — ні. */
function extractDriveIds(text) {
  var t = String(text == null ? '' : text);
  var re = /(?:[?&]id=|\/d\/)([-\w]{20,})/g, m, out = [], seen = {};
  while ((m = re.exec(t))) {
    if (!seen[m[1]]) { seen[m[1]] = true; out.push(m[1]); }
  }
  return out;
}

/* Межі України — той самий sanity-фільтр, що й у карті мережі. */
var UA_BBOX = { latMin: 43.5, latMax: 53.5, lngMin: 21.5, lngMax: 41.0 };
function inUkraine(lat, lng) {
  return lat >= UA_BBOX.latMin && lat <= UA_BBOX.latMax && lng >= UA_BBOX.lngMin && lng <= UA_BBOX.lngMax;
}

/* Координати з посилання Google Maps або з голого тексту «51.53568, 31.25321».
   Формати посилань: …/@48.2664111,25.9582113,19.71z (центр вікна),
   …!3d48.26!4d25.95 (сама мітка — точніше, тому перевіряється першим),
   ?q=lat,lng · ?ll= · ?query= · ?destination=. Поза межами України → null. */
function coordsFromText(text) {
  var t = String(text == null ? '' : text);
  var pats = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
    /[?&](?:q|ll|query|center|destination|daddr|saddr)=(-?\d{1,2}\.\d+)\s*(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i,
    /(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})/
  ];
  for (var i = 0; i < pats.length; i++) {
    var m = t.match(pats[i]);
    if (!m) continue;
    var lat = Number(m[1]), lng = Number(m[2]);
    if (isFinite(lat) && isFinite(lng) && inUkraine(lat, lng)) {
      return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
    }
  }
  return null;
}

/* Скорочені посилання карт: координат у них немає, треба розкрити редирект. */
function isShortMapLink(url) {
  return /maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\//i.test(String(url || ''));
}

/* Макет за кількістю картинок (фото + карта):
   1–3 → один ряд («row», як у Чернігові й Чернівцях),
   4–5 → два ряди («grid», як у Києві: три вгорі, до двох унизу),
   0 або більше пʼяти → null: слайд без картинок або з надлишком не робимо. */
var MAX_IMAGES = 5;
function layoutFor(nImages) {
  var n = Number(nImages) || 0;
  if (n < 1 || n > MAX_IMAGES) return null;
  return n <= 3 ? 'row' : 'grid';
}

/* Текст «Пропозиція: Відкриття …» за типом обʼєкта з форми. Людина в майстрі
   може переписати. Невідомий тип — як є, малими літерами. */
var PROPOSAL_BY_TYPE = {
  'відділення': 'Відкриття відділення',
  'депо/термінал': 'Відкриття депо або терміналу',
  'депо': 'Відкриття депо',
  'термінал': 'Відкриття терміналу',
  'поштомат': 'Встановлення поштомата',
  'пвз': 'Відкриття ПВЗ',
  'пункт прийому-видачі': 'Відкриття пункту прийому-видачі'
};
function defaultProposal(objType) {
  var raw = normText(objType);
  var t = raw.toLowerCase();
  if (!t || /не підходить/.test(t)) return 'Відкриття';
  if (PROPOSAL_BY_TYPE[t]) return PROPOSAL_BY_TYPE[t];
  /* Кілька значень через кому («Відділення, Депо/термінал») — залишаємо
     як є після двокрапки: людина сформулює. */
  return 'Відкриття: ' + raw;
}

/* Індекс колонки за заголовком: перший заголовок, який МІСТИТЬ будь-який із
   шаблонів (без регістру, апострофи зведено). Нічого не знайдено → -1. */
function headerMatch(headers, patterns) {
  var norm = function (s) { return normText(s).toLowerCase().replace(/[ʼ'’`]/g, ''); };
  var hs = (headers || []).map(norm);
  var ps = (patterns || []).map(norm).filter(Boolean);
  for (var p = 0; p < ps.length; p++) {
    for (var i = 0; i < hs.length; i++) {
      if (hs[i] && hs[i].indexOf(ps[p]) !== -1) return i;
    }
  }
  return -1;
}

/* Усі колонки, заголовок яких містить котрийсь із шаблонів — для фото, яких у
   формі кілька питань. Порядок — як в аркуші. */
function headerMatchAll(headers, patterns) {
  var norm = function (s) { return normText(s).toLowerCase().replace(/[ʼ'’`]/g, ''); };
  var hs = (headers || []).map(norm);
  var ps = (patterns || []).map(norm).filter(Boolean);
  var out = [];
  for (var i = 0; i < hs.length; i++) {
    for (var p = 0; p < ps.length; p++) {
      if (hs[i] && hs[i].indexOf(ps[p]) !== -1) { out.push(i); break; }
    }
  }
  return out;
}

/* Літера колонки → індекс від нуля: A→0, Z→25, AA→26. */
function letterIndex(letter) {
  var s = String(letter || '').toUpperCase().replace(/[^A-Z]/g, ''), n = 0;
  for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n - 1;
}

/* Ідентифікатор деки та слайда з посилання, яке ми самі записали в рядок:
   https://docs.google.com/presentation/d/<deck>/edit#slide=id.<slide> */
function parseSlideUrl(url) {
  var u = String(url || '');
  var d = u.match(/\/presentation\/d\/([-\w]+)/);
  var s = u.match(/#slide=id\.([^&\s]+)/);
  if (!d) return null;
  return { deckId: d[1], slideId: s ? s[1] : '' };
}

/* Стабільний ключ рядка з мітки часу форми: цифри дати й часу. Для Date
   форматує сам викликач (Utilities недоступний тут); для рядка «26.08.2026
   18:19:27» → «20260826-181927». */
function keyFromTimestampString(s) {
  var t = normText(s);
  var m = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    var pad = function (x) { return ('0' + x).slice(-2); };
    return m[3] + pad(m[2]) + pad(m[1]) + '-' + pad(m[4]) + m[5] + pad(m[6] || '00');
  }
  return t.replace(/\D/g, '');
}

/* ── Пакетний режим: сітка мініатюр і вікно карти ──────────────────── */

/* Сітка для n фото в області W×H (дюйми): скільки колонок дає НАЙБІЛЬШІ
   мініатюри. Фото вважаємо 4:3 і вставляємо цілком (без обрізання), тому
   оцінка клітинки — менше з її ширини і висоти×4/3. */
function gridFor(n, W, H, gap) {
  gap = (gap == null) ? 0.08 : gap;
  n = Number(n) || 0;
  if (n < 1) return null;
  var best = null;
  for (var cols = 1; cols <= Math.min(n, 6); cols++) {
    var rows = Math.ceil(n / cols);
    var cw = (W - gap * (cols - 1)) / cols, ch = (H - gap * (rows - 1)) / rows;
    var score = Math.min(cw, ch * 4 / 3);
    if (!best || score > best.score + 1e-9) best = { cols: cols, rows: rows, cellW: cw, cellH: ch, gap: gap, score: score };
  }
  return best;
}

/* Клітинка №i сітки (зліва направо, згори вниз) у координатах області. */
function gridCell(grid, i, x0, y0) {
  var r = Math.floor(i / grid.cols), c = i % grid.cols;
  return { x: x0 + c * (grid.cellW + grid.gap), y: y0 + r * (grid.cellH + grid.gap), w: grid.cellW, h: grid.cellH };
}

/* Вписати картинку з пропорцією ratio (ширина/висота) у прямокутник цілком,
   по центру, без обрізання. */
function fitInto(ratio, x, y, w, h) {
  if (!(ratio > 0)) ratio = 4 / 3;
  var fw = w, fh = w / ratio;
  if (fh > h) { fh = h; fw = h * ratio; }
  return { left: x + (w - fw) / 2, top: y + (h - fh) / 2, width: fw, height: fh };
}

/* Межі видимої області статичної карти (Web Mercator, тайл 256 px):
   що потрапляє в кадр wPx×hPx із центром lat,lng на масштабі zoom. */
function mercatorBbox(lat, lng, zoom, wPx, hPx) {
  var world = 256 * Math.pow(2, zoom);
  var toRad = Math.PI / 180;
  var x = (lng + 180) / 360 * world;
  var s = Math.sin(lat * toRad);
  var y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world;
  var inv = function (px, py) {
    var lng2 = px / world * 360 - 180;
    var n = Math.PI - 2 * Math.PI * py / world;
    var lat2 = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat: lat2, lng: lng2 };
  };
  var a = inv(x - wPx / 2, y - hPx / 2), b = inv(x + wPx / 2, y + hPx / 2);
  return { latMin: Math.min(a.lat, b.lat), latMax: Math.max(a.lat, b.lat), lngMin: Math.min(a.lng, b.lng), lngMax: Math.max(a.lng, b.lng) };
}

/* Масштаб карти за типом обʼєкта: відділенню треба квартал, депо — місто. */
function zoomForType(objType, rules, fallback) {
  var t = normText(objType);
  for (var i = 0; i < (rules || []).length; i++) {
    if (rules[i].match.test(t)) return rules[i].zoom;
  }
  return fallback;
}

/* Для node-тестів: Apps Script цього блоку не бачить (module там немає). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normText: normText, parseNumberLoose: parseNumberLoose, parseArea: parseArea,
    parsePriceUah: parsePriceUah, pricePerM2: pricePerM2, formatInt: formatInt,
    extractDriveIds: extractDriveIds, coordsFromText: coordsFromText, isShortMapLink: isShortMapLink,
    layoutFor: layoutFor, MAX_IMAGES: MAX_IMAGES, defaultProposal: defaultProposal,
    headerMatch: headerMatch, headerMatchAll: headerMatchAll, letterIndex: letterIndex,
    parseSlideUrl: parseSlideUrl, keyFromTimestampString: keyFromTimestampString, inUkraine: inUkraine,
    gridFor: gridFor, gridCell: gridCell, fitInto: fitInto, mercatorBbox: mercatorBbox, zoomForType: zoomForType };
}
