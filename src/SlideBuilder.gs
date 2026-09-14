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

var GEOM = {
  title:    [0.16, 0.10, 5.45, 0.71],
  table:    { box: [4.19, 0.10, 8.25, 0.91], cols: [1.98, 1.78, 2.25, 2.25], rows: [0.44, 0.40] },
  photos:   [0.05, 1.37, 8.74, 4.55],   /* область сітки мініатюр */
  map:      [8.89, 1.37, 4.37, 3.64],   /* карта, як на зразках — праворуч угорі */
  proposal: [0.16, 6.05, 8.60, 0.80],
  mapNote:  [8.95, 5.10, 4.30, 0.90]    /* примітка під картою (координати, джерело) */
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
  var shape = slide.insertTextBox(text, b.left, b.top, b.width, b.height);
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
      var txt = r === 0 ? TABLE_HEAD[c] : String(cells[c] == null ? '' : cells[c]);
      cell.getText().setText(txt);
      var st = cell.getText().getTextStyle();
      st.setFontFamily(STYLE.font).setForegroundColor(STYLE.black).setBold(r === 0).setFontSize(r === 0 ? 16 : (txt.length > 24 ? 9 : 12));
      cell.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
      cell.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
      if (r === 0) cell.getFill().setSolidFill(STYLE.headFill);
    }
  }
  return table.getObjectId();
}

/* Картинка цілком у прямокутник (дюйми), по центру, без обрізання. */
function placeImage_(slide, blob, x, y, w, h, k) {
  var img = slide.insertImage(blob);
  var iw = img.getWidth(), ih = img.getHeight();
  var f = fitInto(iw > 0 && ih > 0 ? iw / ih : 4 / 3, x * PT * k, y * PT * k, w * PT * k, h * PT * k);
  img.setLeft(f.left).setTop(f.top).setWidth(f.width).setHeight(f.height);
  return img;
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
  var tableId;
  try {
    addTitle_(slide, k, rec.city);
    tableId = addTable_(slide, k, cells);

    if (images.length) {
      var A = GEOM.photos;
      var grid = gridFor(images.length, A[2], A[3]);
      images.forEach(function (im, j) {
        var c = gridCell(grid, j, A[0], A[1]);
        placeImage_(slide, im.blob, c.x, c.y, c.w, c.h, k);
      });
    }
    if (map.blob) {
      var M = GEOM.map;
      placeImage_(slide, map.blob, M[0], M[1], M[2], M[3], k);
    }
    var mapNote = [];
    if (coords && coords.lat != null) mapNote.push(coords.lat.toFixed(5) + ', ' + coords.lng.toFixed(5) +
      (coords.source === 'geocode' ? ' (геокодер' + (coords.note ? ', ' + coords.note : '') + ')' : ''));
    if (map.kind === 'none') mapNote.push('карти немає: ' + map.note);
    if (mapNote.length) textBox_(slide, GEOM.mapNote, k, mapNote.join('\n'), 9, false, STYLE.muted);

    textBox_(slide, GEOM.proposal, k, 'Пропозиція: ' + rec.proposalDefault, 22, true, STYLE.textColor);

    slide.getNotesPage().getSpeakerNotesShape().getText().setText(JSON.stringify({
      key: rec.key, row: rec.row, by: email, at: new Date().toISOString(),
      photos: images.map(function (im) { return im.name + ' (' + im.mode + ')'; }),
      skipped: skipped, map: map.kind, mapNote: map.note, coords: coords, price: priceMode
    }));
  } catch (eBuild) {
    try { slide.remove(); pres.saveAndClose(); } catch (e0) {}
    throw eBuild;
  }
  removePlaceholder_(pres);
  var slideId = slide.getObjectId();
  pres.saveAndClose();

  var br = applyBatch_(deckId, tableId, k);
  if (br && br.note) notes.push(br.note);
  if (skipped.length) notes.push('пропущено: ' + skipped.join('; '));
  notes.push('карта: ' + map.note);

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
