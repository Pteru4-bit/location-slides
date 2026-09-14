/***********************************************************************
 *  SlideBuilder — один слайд локації, зібраний автоматично.
 *
 *  Заголовок і таблиця — за ручними зразками (13,33 × 7,5 дюйма, майстер
 *  НП). Далі — пакетна логіка (рішення 2026-09-14): усі фото заявки йдуть
 *  на слайд мініатюрами в сітці зліва, цілком і без обрізання (розтягнув —
 *  маєш оригінал); карта праворуч; «Пропозиція: …» внизу. Людина потім
 *  править у Презентаціях руками, тому мета слайда — щоб було ЩО правити,
 *  а не ідеальна композиція.
 ***********************************************************************/

var PT = 72; /* пунктів у дюймі */

/* Розкладка — за ручними зразками: верхній ряд із трьох великих клітинок
   (два фото і карта останньою), під ним смуга мініатюр для решти фото
   ліворуч і «Пропозиція» праворуч; якщо решти немає — «Пропозиція» внизу
   по центру, як на слайдах із двома фото. Клітинки таблиці в Google Slides
   мають вбудовані поля 0,1", яких API не міняє, тому шрифти таблиці менші
   за PowerPoint-оригінал, щоб висота вийшла та сама (~0,8"). */
var GEOM = {
  title:    [0.16, 0.10, 5.45, 0.71],
  table:    { box: [4.19, 0.10, 8.25, 0.80], cols: [1.85, 1.55, 2.60, 2.25], rows: [0.30, 0.30] },
  topRow:   { y: 1.37, h: 3.64, x: [0.05, 4.47, 8.89], w: 4.37 },
  strip:    [0.05, 5.10, 8.74, 1.80],   /* решта фото мініатюрами */
  proposalRight:  [8.95, 5.15, 4.30, 1.50],   /* коли є смуга мініатюр */
  proposalCenter: [3.30, 5.85, 7.37, 0.80]    /* коли решти фото немає */
};
var STYLE = { font: 'Arial', titleColor: '#C00000', textColor: '#201E1D', headFill: '#B6B5B8', black: '#000000', muted: '#6B7A88' };
var TABLE_HEAD = ['Адреса', 'Площа м2', 'Вартість загальна в грн', 'Вартість м2'];

/* Порожній слайд: типовий макет BLANK майстра; якщо в імпортованому шаблоні
   його немає — перший макет, з якого прибираємо заповнювачі. */
function blankSlide_(pres, index) {
  var slide;
  try {
    slide = (index == null) ? pres.appendSlide(SlidesApp.PredefinedLayout.BLANK)
                            : pres.insertSlide(index, SlidesApp.PredefinedLayout.BLANK);
  } catch (e) {
    var layouts = pres.getLayouts();
    var lay = layouts[0];
    for (var i = 0; i < layouts.length; i++) {
      if (/blank|пуст|порожн/i.test(layouts[i].getLayoutName())) { lay = layouts[i]; break; }
    }
    slide = (index == null) ? pres.appendSlide(lay) : pres.insertSlide(index, lay);
  }
  slide.getPageElements().forEach(function (el) { try { el.remove(); } catch (e2) {} });
  return slide;
}

function box_(g, k) { return { left: g[0] * PT * k, top: g[1] * PT * k, width: g[2] * PT * k, height: g[3] * PT * k }; }

function textBox_(slide, geom, k, text, size, bold, color, align) {
  var b = box_(geom, k);
  /* Порожній текст — це фігура без текстового блоку, і будь-яке
     форматування далі падає з «The object has no text». */
  var shape = slide.insertTextBox(String(text || '') || ' ', b.left, b.top, b.width, b.height);
  var tr = shape.getText();
  tr.getTextStyle().setFontFamily(STYLE.font).setFontSize(size).setBold(!!bold).setForegroundColor(color || STYLE.textColor);
  if (align) tr.getParagraphStyle().setParagraphAlignment(align);
  shape.setContentAlignment(SlidesApp.ContentAlignment.TOP);
  return shape;
}

function addTitle_(slide, k, city) {
  return textBox_(slide, GEOM.title, k, city || '', 36, true, STYLE.titleColor);
}

/* Таблиця 2×4 як на зразках. Ширини колонок, висоти рядків і рамки
   SlidesApp не вміє — їх ставить batchUpdate (applyBatch_). */
function addTable_(slide, k, cells) {
  var b = box_(GEOM.table.box, k);
  var table = slide.insertTable(2, 4, b.left, b.top, b.width, b.height);
  for (var r = 0; r < 2; r++) {
    for (var c = 0; c < 4; c++) {
      var cell = table.getCell(r, c);
      var txt = r === 0 ? TABLE_HEAD[c] : normText(cells[c]);
      /* Порожня клітинка (вартість за м², коли ціна текстом) — ставимо тире:
         клітинка з порожнім текстом втрачає текстовий блок, і стилі далі
         падають з «The object has no text». */
      if (!txt) txt = '—';
      cell.getText().setText(txt);
      try {
        var st = cell.getText().getTextStyle();
        st.setFontFamily(STYLE.font).setForegroundColor(STYLE.black).setBold(r === 0).setFontSize(r === 0 ? 12 : (txt.length > 24 ? 8 : 11));
        cell.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
      } catch (eSt) {}
      cell.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
      if (r === 0) cell.getFill().setSolidFill(STYLE.headFill);
    }
  }
  return table.getObjectId();
}

/* Вставка в натуральному розмірі — щоб знати пропорції до розкладки. */
function insertNatural_(slide, blob) {
  var img = slide.insertImage(blob);
  var iw = img.getWidth(), ih = img.getHeight();
  return { img: img, ratio: (iw > 0 && ih > 0) ? iw / ih : 4 / 3 };
}
/* Картинка цілком у прямокутник (дюйми), по центру, без обрізання.
   Повертає, де саме вона стала (пункти). */
function placeInto_(it, x, y, w, h, k) {
  var f = fitInto(it.ratio, x * PT * k, y * PT * k, w * PT * k, h * PT * k);
  it.img.setLeft(f.left).setTop(f.top).setWidth(f.width).setHeight(f.height);
  return f;
}

/* Підпис на карті, як попап на ручних зразках: біла плашка в лівому
   верхньому куті з адресою (жирним) і координатами. Статична карта Google
   тексту не малює, тому плашка — окрема фігура поверх картинки. */
function mapLabel_(slide, rect, k, line1, line2) {
  var pad = 0.12 * PT * k;
  var w = Math.min(2.7 * PT * k, rect.width - 2 * pad), h = 0.62 * PT * k;
  /* Текстове поле, а не insertShape: фігура без текстового блоку в SlidesApp
     падає на getText() («The object has no text»). Заливка й рамка у
     текстового поля є. */
  var shape = slide.insertTextBox(line1 + '\n' + line2, rect.left + pad, rect.top + pad, w, h);
  var tr = shape.getText();
  tr.getTextStyle().setFontFamily(STYLE.font).setFontSize(7.5).setForegroundColor('#22303C').setBold(false);
  try { tr.getRange(0, line1.length).getTextStyle().setBold(true); } catch (e2) {}
  try { shape.getFill().setSolidFill('#FFFFFF'); } catch (e3) {}
  try { shape.getBorder().setWeight(0.75); shape.getBorder().getLineFill().setSolidFill('#9AA5B1'); } catch (e4) {}
  shape.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
  return shape;
}

/* Ширини колонок, висоти рядків і рамки таблиці одним запитом Slides API. */
function applyBatch_(presId, tableId, k) {
  if (!tableId) return { ok: true, n: 0 };
  var reqs = [];
  GEOM.table.cols.forEach(function (w, i) {
    reqs.push({ updateTableColumnProperties: { objectId: tableId, columnIndices: [i],
      tableColumnProperties: { columnWidth: { magnitude: w * PT * k, unit: 'PT' } }, fields: 'columnWidth' } });
  });
  GEOM.table.rows.forEach(function (h, i) {
    reqs.push({ updateTableRowProperties: { objectId: tableId, rowIndices: [i],
      tableRowProperties: { minRowHeight: { magnitude: h * PT * k, unit: 'PT' } }, fields: 'minRowHeight' } });
  });
  var border = { updateTableBorderProperties: { objectId: tableId, borderPosition: 'ALL',
    tableBorderProperties: { weight: { magnitude: 1, unit: 'PT' }, dashStyle: 'SOLID',
      tableBorderFill: { solidFill: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } } } },
    fields: 'weight,dashStyle,tableBorderFill' } };
  try {
    Slides.Presentations.batchUpdate({ requests: reqs.concat([border]) }, presId);
    return { ok: true, n: reqs.length + 1 };
  } catch (e) {
    /* Рамки — найвибагливіший запит; розміри важливіші. */
    try {
      Slides.Presentations.batchUpdate({ requests: reqs }, presId);
      return { ok: true, n: reqs.length, note: 'рамки таблиці не поставлено: ' + ((e && e.message) || e) };
    } catch (e2) {
      return { ok: false, n: 0, note: 'розміри таблиці не застосовано: ' + ((e2 && e2.message) || e2) };
    }
  }
}

/* ── Головна функція ──
   payload: { key, row, deckId, replace }. Усе інше береться з заявки. */
function buildSlide_(payload, email) {
  var p = payload || {};
  var rec = recordByKey_(String(p.key || ''), Number(p.row) || 0);
  var deckId = String(p.deckId || '');
  if (!deckId) throw new Error('Оберіть презентацію.');
  var deck = deckEntry_(deckId);
  if (!deck) throw new Error('Такої презентації немає в реєстрі.');

  var notes = [];

  /* 1. Фото: усі, до PHOTO_MAX; ті, що не відкрились, — у примітки. */
  var ids = rec.photoIds.slice(0, CFG.PHOTO_MAX);
  if (rec.photoIds.length > ids.length) notes.push('фото понад ' + CFG.PHOTO_MAX + ' пропущено: ' + (rec.photoIds.length - ids.length));
  var images = [], skipped = [];
  ids.forEach(function (id) {
    try { images.push(slideImage_(id)); }
    catch (e) { skipped.push((e && e.message) || String(e)); }
  });

  /* 2. Таблиця: число, коли воно є, інакше текст із форми як є. */
  var area = rec.area, price = rec.priceUah;
  var cells = [rec.address,
               area != null ? formatInt(area) : rec.areaRaw,
               price != null ? formatInt(price) : rec.priceRaw,
               (price != null && area > 0) ? formatInt(pricePerM2(price, area)) : ''];
  var priceMode = price != null ? 'число' : (rec.priceRaw ? 'текст із форми' : 'порожньо');

  /* 3. Координати й карта. */
  var coords = resolveCoords_(rec);
  var map = mapForLocation_(rec, coords);

  /* 4. Слайд. */
  var pres = SlidesApp.openById(deckId);
  var k = pres.getPageWidth() / 960;
  var index = null, replaced = false;
  var old = parseSlideUrl(rec.slideUrl);
  if (p.replace && old && old.deckId === deckId && old.slideId) {
    var slides = pres.getSlides();
    for (var i = 0; i < slides.length; i++) {
      if (slides[i].getObjectId() === old.slideId) { index = i; slides[i].remove(); replaced = true; break; }
    }
  }
  var slide = blankSlide_(pres, index);
  var tableId, stage = 'початок';
  try {
    stage = 'заголовок';
    addTitle_(slide, k, rec.city);
    stage = 'таблиця';
    tableId = addTable_(slide, k, cells);
    stage = 'фото';

    /* Верхній ряд: до трьох великих клітинок, карта — остання (як на зразках).
       Без карти всі три клітинки — фото. Решта фото — смугою мініатюр нижче. */
    var top = GEOM.topRow;
    var topPhotos = map.blob ? 2 : 3;
    var items = images.map(function (im) { return insertNatural_(slide, im.blob); });
    var head = items.slice(0, topPhotos), rest = items.slice(topPhotos);
    head.forEach(function (it, j) { placeInto_(it, top.x[j], top.y, top.w, top.h, k); });
    if (map.blob) {
      stage = 'карта';
      var mi = insertNatural_(slide, map.blob);
      var mrect = placeInto_(mi, top.x[head.length < topPhotos ? head.length : 2], top.y, top.w, top.h, k);
      /* Знімок 💾 уже містить попап карти мережі; статичній карті підпис додаємо самі. */
      if (map.kind === 'static' && coords && coords.lat != null) {
        var line1 = (coords.source === 'geocode' && coords.label) ? coords.label
                  : [rec.address, rec.city, rec.region].filter(Boolean).join(', ');
        try { mapLabel_(slide, mrect, k, line1, coords.lat.toFixed(5) + ', ' + coords.lng.toFixed(5)); }
        catch (eLbl) { notes.push('підпис на карті не додано: ' + ((eLbl && eLbl.message) || eLbl)); }
      }
    }
    stage = 'мініатюри';
    if (rest.length) {
      var S = GEOM.strip;
      var grid = bestGrid(rest.map(function (it) { return it.ratio; }), S[2], S[3]);
      rest.forEach(function (it, j) {
        var c = gridCell(grid, j, S[0], S[1]);
        placeInto_(it, c.x, c.y, c.w, c.h, k);
      });
      stage = 'пропозиція';
      textBox_(slide, GEOM.proposalRight, k, 'Пропозиція: ' + rec.proposalDefault, 20, true, STYLE.textColor);
    } else {
      stage = 'пропозиція';
      textBox_(slide, GEOM.proposalCenter, k, 'Пропозиція: ' + rec.proposalDefault, 24, true, STYLE.textColor,
               SlidesApp.ParagraphAlignment.CENTER);
    }
    /* Нотатки слайда лишаються порожніми: презентація йде керівництву, а
       службові подробиці (фото, карта, координати) — у журналі й у «Лог». */
  } catch (eBuild) {
    try { slide.remove(); pres.saveAndClose(); } catch (e0) {}
    throw new Error('етап «' + stage + '»: ' + ((eBuild && eBuild.message) || eBuild));
  }
  removePlaceholder_(pres);
  var slideId = slide.getObjectId();
  pres.saveAndClose();

  var br = applyBatch_(deckId, tableId, k);
  if (br && br.note) notes.push(br.note);
  if (skipped.length) notes.push('пропущено: ' + skipped.join('; '));
  notes.push('карта: ' + map.note);
  if (coords && coords.lat != null) notes.push('координати: ' + coords.lat.toFixed(5) + ', ' + coords.lng.toFixed(5) +
    ' (' + ({ saved: 'з таблиці', link: 'з посилання Google Maps', geocode: 'геокодер' }[coords.source] || coords.source) +
    (coords.note ? ', ' + coords.note : '') + ')');
  else notes.push('координат немає: ' + ((coords && coords.note) || ''));

  var slideUrl = 'https://docs.google.com/presentation/d/' + deckId + '/edit#slide=id.' + slideId;
  writeSlideBack_(rec.row, slideUrl, deck.name, email);
  if (coords && coords.lat != null && coords.source !== 'saved') writeCoords_(rec.row, coords.lat, coords.lng);
  try { bumpDeckCount_(deckId, SlidesApp.openById(deckId).getSlides().length); } catch (e3) {}
  logEvent_(email, replaced ? 'слайд оновлено' : 'слайд створено',
            rec.city + ', ' + rec.address + ' → ' + slideUrl + ' · фото ' + images.length + ' · ' + map.kind + ' · ціна: ' + priceMode);
  return { ok: true, slideUrl: slideUrl, deckUrl: deck.url, deckName: deck.name, replaced: replaced,
           photos: images.length, skipped: skipped.length, map: map.kind, mapPoints: map.points || 0,
           price: priceMode, coords: coords && coords.source, notes: notes };
}
