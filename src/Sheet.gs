/***********************************************************************
 *  Sheet — таблиця відповідей форми: заголовки, рядки, зворотний запис.
 *
 *  Рядок форми не має власного ідентифікатора, тому ключ рядка — мітка
 *  часу подачі (колонка «Позначка часу»), відформатована як
 *  yyyyMMdd-HHmmss. Вона унікальна на практиці й не міняється, коли
 *  таблицю сортують. Номер рядка передається лише як підказка для
 *  швидкого пошуку і завжди перевіряється за ключем.
 ***********************************************************************/

function responsesSs_() {
  var id = cfg_('RESPONSES_SS_ID');
  if (!id) throw new Error('Не задано RESPONSES_SS_ID — таблицю відповідей форми (Config.gs або Script Properties).');
  return SpreadsheetApp.openById(id);
}

function responsesSheet_() {
  var ss = responsesSs_();
  var name = cfg_('RESPONSES_SHEET');
  if (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) throw new Error('Аркуша «' + name + '» немає в таблиці відповідей.');
    return sh;
  }
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (/^(Відповіді|Ответы|Form Responses)/i.test(sheets[i].getName())) return sheets[i];
  }
  return sheets[0];
}

/* Розкладка колонок для поточного виконання (кешується, бо заголовок
   читається один раз на запит). */
var COLS_CACHE_ = null;
function columns_() {
  if (COLS_CACHE_) return COLS_CACHE_;
  var sh = responsesSheet_();
  var lastCol = Math.max(1, sh.getLastColumn());
  var header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h == null ? '' : h); });
  var cols = { idx: {}, how: {}, header: header };
  Object.keys(CFG.COLS).forEach(function (k) {
    var c = CFG.COLS[k];
    var i = (c.match && c.match.length) ? headerMatch(header, c.match) : -1;
    if (i === -1) { i = letterIndex(c.letter); cols.how[k] = 'літера ' + c.letter; }
    else cols.how[k] = 'заголовок «' + header[i] + '»';
    cols.idx[k] = i;
  });
  var photos = headerMatchAll(header, CFG.PHOTO_MATCH);
  if (!photos.length) photos = CFG.PHOTO_LETTERS.map(letterIndex);
  cols.photos = photos;
  cols.how.photos = photos.map(function (i) { return header[i] || ('колонка ' + (i + 1)); }).join(' · ');
  /* Службові колонки: за точною назвою; яких немає — дописуємо праворуч. */
  cols.out = {};
  var missing = [];
  Object.keys(CFG.OUT).forEach(function (k) {
    var name = CFG.OUT[k];
    var i = header.indexOf(name);
    if (i === -1) {
      /* Стара назва → перейменувати заголовок на місці, дані лишаються. */
      var aliases = (CFG.OUT_ALIASES || {})[k] || [];
      for (var a = 0; a < aliases.length && i === -1; a++) i = header.indexOf(aliases[a]);
      if (i !== -1) { sh.getRange(1, i + 1).setValue(name); header[i] = name; }
    }
    if (i === -1) missing.push(k); else cols.out[k] = i;
  });
  if (missing.length) {
    var start = header.length;
    /* Порожні хвостові заголовки (форма інколи лишає) — не затираємо чужі
       дані, а дописуємо після останньої непорожньої. */
    while (start > 0 && !header[start - 1]) start--;
    var names = missing.map(function (k) { return CFG.OUT[k]; });
    sh.getRange(1, start + 1, 1, names.length).setValues([names]).setFontWeight('bold');
    missing.forEach(function (k, j) { cols.out[k] = start + j; header[start + j] = CFG.OUT[k]; });
    SpreadsheetApp.flush();   /* щоб getLastColumn() нижче вже бачив нові колонки */
  }
  COLS_CACHE_ = cols;
  return cols;
}

function columnLetter_(i) {
  var n = i + 1, s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function columnReport_() {
  var c = columns_();
  var lines = ['Аркуш: ' + responsesSheet_().getName()];
  lines.push('Заголовки: ' + c.header.map(function (h, i) { return columnLetter_(i) + ' «' + h + '»'; }).join(' · '));
  Object.keys(CFG.COLS).forEach(function (k) {
    lines.push(k + ' → колонка ' + (c.idx[k] + 1) + ' (' + c.how[k] + ')');
  });
  lines.push('фото → ' + c.photos.map(function (i) { return i + 1; }).join(', ') + ' (' + c.how.photos + ')');
  Object.keys(c.out).forEach(function (k) { lines.push('службова «' + CFG.OUT[k] + '» → колонка ' + (c.out[k] + 1)); });
  return lines;
}

function tz_() { return Session.getScriptTimeZone() || 'Europe/Kyiv'; }

function rowKey_(tsValue) {
  if (tsValue instanceof Date && !isNaN(tsValue)) return Utilities.formatDate(tsValue, tz_(), 'yyyyMMdd-HHmmss');
  return keyFromTimestampString(tsValue);
}

function fmtDate_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz_(), 'dd.MM.yyyy');
  return normText(v);
}
function fmtDateTime_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz_(), 'dd.MM.yyyy HH:mm');
  return normText(v);
}

/* Рядок аркуша → обʼєкт для клієнта. Значення вже прочитані (values). */
function rowRecord_(values, rowNumber) {
  var c = columns_();
  var get = function (k) { var i = c.idx[k]; return (i >= 0 && i < values.length) ? values[i] : ''; };
  var out = function (k) { var i = c.out[k]; return (i != null && i < values.length) ? values[i] : ''; };
  var photoCells = c.photos.map(function (i) { return i < values.length ? values[i] : ''; });
  var photoIds = [];
  photoCells.forEach(function (cell) { extractDriveIds(cell).forEach(function (id) { if (photoIds.indexOf(id) === -1) photoIds.push(id); }); });
  var areaRaw = normText(get('area')), priceRaw = normText(get('price'));
  var rec = {
    row: rowNumber,
    key: rowKey_(get('ts')),
    ts: fmtDateTime_(get('ts')),
    date: fmtDate_(get('date')),
    author: normText(get('author')),
    region: normText(get('region')),
    city: normText(get('city')),
    address: normText(get('address')),
    deal: normText(get('deal')),
    areaRaw: areaRaw,
    area: parseArea(areaRaw),
    priceRaw: priceRaw,
    priceUah: parsePriceUah(priceRaw),
    ramps: normText(get('ramps')),
    yard: normText(get('yard')),
    video: normText(get('video')),
    comment: normText(get('comment')),
    objType: normText(get('objType')),
    reviewDate: fmtDate_(get('reviewDate')),
    reviewer: normText(get('reviewer')),
    decision: normText(get('decision')),
    branch: normText(get('branch')),
    source: normText(get('source')),
    mapLink: normText(get('mapLink')),
    photoIds: photoIds,
    slideUrl: normText(out('slide')),
    slideUpdated: fmtDateTime_(out('updated')),
    slideBy: normText(out('by')),
    slideDeck: normText(out('deck')),
    coordsSaved: normText(out('coords'))
  };
  rec.rejected = CFG.REJECTED_MATCH.test(rec.objType);
  rec.proposalDefault = defaultProposal(rec.objType);
  return rec;
}

/* Усі заявки, найсвіжіші першими — за «Позначкою часу», а не за положенням
   рядка: форма дописує в кінець, але аркуш можуть відсортувати чи вставити
   рядки вручну. Рядки без мітки часу — в кінці, за номером. limit > 0
   обмежує список (CFG.ROWS_LIMIT = 0 — показувати все). */
var READ_MAX_ROWS = 5000;
function readRecent_(limit) {
  var sh = responsesSheet_();
  var c = columns_();  /* гарантує службові колонки до читання ширини */
  var last = sh.getLastRow();
  if (last < 2) return [];
  var n = Math.min(last - 1, READ_MAX_ROWS);
  var first = last - n + 1;
  var width = Math.max(sh.getLastColumn(), 1);
  var vals = sh.getRange(first, 1, n, width).getValues();
  var recs = [];
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    if (!v.some(function (x) { return x !== '' && x != null; })) continue;   /* порожні хвости */
    recs.push({ row: first + i, t: timestampMs(v[c.idx.ts]), v: v });
  }
  recs.sort(function (a, b) { return (b.t - a.t) || (b.row - a.row); });
  if (limit > 0) recs = recs.slice(0, limit);
  return recs.map(function (r) { return rowRecord_(r.v, r.row); });
}

/* Рядок за ключем; hintRow — де він був минулого разу (перевіряється). */
function findRow_(key, hintRow) {
  var sh = responsesSheet_();
  var c = columns_();
  var width = Math.max(sh.getLastColumn(), 1);
  var tsCol = c.idx.ts + 1;
  if (hintRow >= 2 && hintRow <= sh.getLastRow()) {
    var v = sh.getRange(hintRow, 1, 1, width).getValues()[0];
    if (rowKey_(v[c.idx.ts]) === key) return { row: hintRow, values: v };
  }
  var last = sh.getLastRow();
  if (last < 2) return null;
  var ts = sh.getRange(2, tsCol, last - 1, 1).getValues();
  for (var i = ts.length - 1; i >= 0; i--) {
    if (rowKey_(ts[i][0]) === key) {
      var r = i + 2;
      return { row: r, values: sh.getRange(r, 1, 1, width).getValues()[0] };
    }
  }
  return null;
}

function recordByKey_(key, hintRow) {
  var f = findRow_(key, hintRow);
  if (!f) throw new Error('Заявку з ключем ' + key + ' не знайдено в таблиці (рядок видалили?).');
  return rowRecord_(f.values, f.row);
}

/* Зворотний запис у службові колонки. */
function writeOut_(row, fields) {
  var sh = responsesSheet_();
  var c = columns_();
  Object.keys(fields).forEach(function (k) {
    var i = c.out[k];
    if (i == null) return;
    sh.getRange(row, i + 1).setValue(fields[k]);
  });
}

function writeSlideBack_(row, slideUrl, deckName, email) {
  writeOut_(row, { slide: slideUrl, updated: new Date(), by: email, deck: deckName });
}

function writeCoords_(row, lat, lng) {
  writeOut_(row, { coords: (Math.round(lat * 1e6) / 1e6) + ', ' + (Math.round(lng * 1e6) / 1e6) });
}
