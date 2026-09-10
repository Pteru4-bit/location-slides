/***********************************************************************
 *  SlideBuilder — один слайд локації за макетом ручних зразків.
 *
 *  Геометрія в дюймах виміряна на трьох слайдах, які люди зробили вручну
 *  (Чернігів, Чернівці, Київ; 13,33 × 7,5 дюйма). Два макети:
 *    row  — до трьох картинок в один ряд, підпис під ними, «Пропозиція»
 *           внизу по центру;
 *    grid — чотири-пʼять картинок: три вгорі, до двох унизу, «Пропозиція»
 *           і підпис у правому нижньому куті.
 *  Карта завжди остання серед картинок, як на зразках.
 *
 *  Картинки заповнюють слот повністю (center-crop, як робили вручну):
 *  вставляємо через SlidesApp, а обрізання ставимо одним batchUpdate
 *  через Slides API — SlidesApp обрізання не вміє. Якщо API відмовить,
 *  картинки просто вписуються в слот зі збереженням пропорцій.
 ***********************************************************************/

var PT = 72; /* пунктів у дюймі */

var GEOM = {
  title: [0.16, 0.10, 5.45, 0.71],
  table: { box: [4.19, 0.10, 8.25, 0.91], cols: [1.98, 1.78, 2.25, 2.25], rows: [0.44, 0.40] },
  row: {
    slots: [[0.05, 1.37, 4.37, 3.64], [4.47, 1.37, 4.37, 3.64], [8.89, 1.37, 4.37, 3.64]],
    note: [0.16, 5.13, 8.60, 0.50],
    proposal: [3.30, 5.85, 7.37, 0.80]
  },
  grid: {
    slots: [[0.05, 1.01, 4.37, 3.40], [4.47, 1.01, 4.37, 3.40], [8.89, 1.01, 4.37, 3.40],
            [0.05, 4.50, 4.37, 2.85], [4.47, 4.50, 4.37, 2.85]],
    proposal: [9.05, 4.55, 4.20, 1.30],
    note: [9.05, 5.95, 4.20, 0.85]
  }
};
var STYLE = { font: 'Arial', titleColor: '#C00000', textColor: '#201E1D', headFill: '#B6B5B8', black: '#000000' };
var TABLE_HEAD = ['Адреса', 'Площа м2', 'Вартість загальна в грн', 'Вартість м2'];

/* Порожній слайд: типовий макет BLANK майстра; якщо його немає в
   імпортованому шаблоні — перший макет, з якого прибираємо заповнювачі. */
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
  var st = tr.getTextStyle();
  st.setFontFamily(STYLE.font).setFontSize(size).setBold(!!bold).setForegroundColor(color || STYLE.textColor);
  if (align) tr.getParagraphStyle().setParagraphAlignment(align);
  shape.setContentAlignment(SlidesApp.ContentAlignment.TOP);
  return shape;
}

function addTitle_(slide, k, city) {
  return textBox_(slide, GEOM.title, k, city || '', 36, true, STYLE.titleColor);
}

/* Таблиця 2×4 як на зразках: сірий заголовок, значення по центру.
   Ширини колонок, висоти рядків і рамки SlidesApp не вміє — їх ставить
   batchUpdate (applyBatch_) за objectId, який повертається звідси. */
function addTable_(slide, k, cells) {
  var b = box_(GEOM.table.box, k);
  var table = slide.insertTable(2, 4, b.left, b.top, b.width, b.height);
  for (var r = 0; r < 2; r++) {
    for (var c = 0; c < 4; c++) {
      var cell = table.getCell(r, c);
      var txt = r === 0 ? TABLE_HEAD[c] : String(cells[c] == null ? '' : cells[c]);
      cell.getText().setText(txt);
      var st = cell.getText().getTextStyle();
      st.setFontFamily(STYLE.font).setForegroundColor(STYLE.black).setBold(r === 0).setFontSize(r === 0 ? 16 : 12);
      cell.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
      cell.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
      if (r === 0) cell.getFill().setSolidFill(STYLE.headFill);
    }
  }
  return table.getObjectId();
}

/* Вставка картинки у слот: спершу натуральний розмір (щоб знати пропорції),
   потім розтягуємо на слот і рахуємо обрізання по центру. */
function addImage_(slide, slotGeom, k, blob, crops) {
  var slot = box_(slotGeom, k);
  var img = slide.insertImage(blob);
  var iw = img.getWidth(), ih = img.getHeight();
  img.setLeft(slot.left).setTop(slot.top).setWidth(slot.width).setHeight(slot.height);
  if (iw > 0 && ih > 0) {
    var ra = slot.width / slot.height, ri = iw / ih;
    var crop = { leftOffset: 0, rightOffset: 0, topOffset: 0, bottomOffset: 0 };
    if (ri > ra) { var cx = (1 - ra / ri) / 2; crop.leftOffset = cx; crop.rightOffset = cx; }
    else if (ri < ra) { var cy = (1 - ri / ra) / 2; crop.topOffset = cy; crop.bottomOffset = cy; }
    crops.push({ objectId: img.getObjectId(), crop: crop, natural: { w: iw, h: ih }, slot: slot });
  }
  return img;
}

/* Обрізання картинок + ширини колонок, висоти рядків і рамки таблиці одним
   запитом Slides API. */
function applyBatch_(presId, crops, tableId, k) {
  var reqs = [];
  if (tableId) {
    GEOM.table.cols.forEach(function (w, i) {
      reqs.push({ updateTableColumnProperties: { objectId: tableId, columnIndices: [i],
        tableColumnProperties: { columnWidth: { magnitude: w * PT * k, unit: 'PT' } }, fields: 'columnWidth' } });
    });
    GEOM.table.rows.forEach(function (h, i) {
      reqs.push({ updateTableRowProperties: { objectId: tableId, rowIndices: [i],
        tableRowProperties: { minRowHeight: { magnitude: h * PT * k, unit: 'PT' } }, fields: 'minRowHeight' } });
    });
  }
  crops.forEach(function (c) {
    var any = c.crop.leftOffset || c.crop.rightOffset || c.crop.topOffset || c.crop.bottomOffset;
    if (!any) return;
    reqs.push({ updateImageProperties: { objectId: c.objectId,
      imageProperties: { cropProperties: c.crop }, fields: 'cropProperties' } });
  });
  if (tableId) {
    reqs.push({ updateTableBorderProperties: { objectId: tableId, borderPosition: 'ALL',
      tableBorderProperties: { weight: { magnitude: 1, unit: 'PT' }, dashStyle: 'SOLID',
        tableBorderFill: { solidFill: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } } } },
      fields: 'weight,dashStyle,tableBorderFill' } });
  }
  if (!reqs.length) return { ok: true, n: 0 };
  try {
    Slides.Presentations.batchUpdate({ requests: reqs }, presId);
    return { ok: true, n: reqs.length };
  } catch (e) {
    /* Рамки — найвибагливіший запит; якщо відмовив увесь пакет, повторюємо
       без них: обрізання й розміри таблиці важливіші за рамки. */
    var core = reqs.filter(function (r) { return !r.updateTableBorderProperties; });
    if (core.length === reqs.length) throw e;
    Slides.Presentations.batchUpdate({ requests: core }, presId);
    return { ok: true, n: core.length, note: 'рамки таблиці не поставлено: ' + ((e && e.message) || e) };
  }
}

/* Запасний шлях без API: вписати картинку в слот, не обрізаючи. */
function fitContain_(pres, crops) {
  crops.forEach(function (c) {
    var el = pres.getPageElementById(c.objectId);
    if (!el) return;
    var ra = c.slot.width / c.slot.height, ri = c.natural.w / c.natural.h;
    var w, h;
    if (ri > ra) { w = c.slot.width; h = w / ri; } else { h = c.slot.height; w = h * ri; }
    el.setWidth(w).setHeight(h).setLeft(c.slot.left + (c.slot.width - w) / 2).setTop(c.slot.top + (c.slot.height - h) / 2);
  });
}

/* ── Головна функція ──
   payload: { key, row, deckId, address, area, priceUah, proposal, note,
              photos: [fileId…], mapFileId, coords: {lat,lng}|null, replace }  */
function buildSlide_(payload, email) {
  var p = payload || {};
  var rec = recordByKey_(String(p.key || ''), Number(p.row) || 0);
  var deckId = String(p.deckId || '');
  if (!deckId) throw new Error('Оберіть презентацію.');
  var deck = deckEntry_(deckId);
  if (!deck) throw new Error('Такої презентації немає в реєстрі.');

  var photos = (p.photos || []).map(String).filter(Boolean);
  var images = photos.slice();
  if (p.mapFileId) images.push(String(p.mapFileId));
  var layoutKind = layoutFor(images.length);
  if (!layoutKind) throw new Error(images.length ? ('Забагато картинок: ' + images.length + ', максимум ' + MAX_IMAGES + ' разом із картою.') : 'Оберіть хоча б одне фото або карту.');

  var area = Number(p.area) || null;
  var price = Number(p.priceUah) || null;
  var cells = [normText(p.address) || rec.address, area ? formatInt(area) : normText(rec.areaRaw),
               price ? formatInt(price) : '', (price && area) ? formatInt(pricePerM2(price, area)) : ''];

  /* Картинки тягнемо ДО відкриття презентації: якщо якийсь файл не відкривається,
     презентація лишається неторканою. */
  var blobs = images.map(slideImageBlob_);

  var pres = SlidesApp.openById(deckId);
  var k = pres.getPageWidth() / 960;   /* шаблон 16:9 = 960 pt; інша ширина — масштабуємо */
  var index = null, replaced = false;
  var old = parseSlideUrl(rec.slideUrl);
  if (p.replace && old && old.deckId === deckId && old.slideId) {
    var slides = pres.getSlides();
    for (var i = 0; i < slides.length; i++) {
      if (slides[i].getObjectId() === old.slideId) { index = i; slides[i].remove(); replaced = true; break; }
    }
  }
  var slide = blankSlide_(pres, index);
  var G = GEOM[layoutKind];
  var tableId, crops = [];

  /* Будь-який збій усередині — слайд прибирається, презентація лишається
     чистою, а помилка йде людині як є. */
  try {
    addTitle_(slide, k, rec.city);
    tableId = addTable_(slide, k, cells);
    blobs.forEach(function (b, i) { addImage_(slide, G.slots[i], k, b, crops); });
    var proposal = normText(p.proposal) || rec.proposalDefault;
    textBox_(slide, G.proposal, k, 'Пропозиція: ' + proposal, 24, true, STYLE.textColor,
             layoutKind === 'row' ? SlidesApp.ParagraphAlignment.CENTER : SlidesApp.ParagraphAlignment.START);
    var note = normText(p.note);
    if (note) textBox_(slide, G.note, k, note, 16, false, STYLE.textColor);
    slide.getNotesPage().getSpeakerNotesShape().getText().setText(JSON.stringify({
      key: rec.key, row: rec.row, by: email, at: new Date().toISOString(), layout: layoutKind,
      photos: photos, map: p.mapFileId || '', coords: p.coords || null
    }));
  } catch (eBuild) {
    try { slide.remove(); pres.saveAndClose(); } catch (e0) {}
    throw eBuild;
  }
  removePlaceholder_(pres);
  var slideId = slide.getObjectId();
  pres.saveAndClose();

  var cropNote = '';
  try { var br = applyBatch_(deckId, crops, tableId, k); if (br && br.note) cropNote = br.note; }
  catch (e) {
    cropNote = 'обрізання через API не вдалося (' + ((e && e.message) || e) + '), картинки вписано без обрізання';
    try { var p2 = SlidesApp.openById(deckId); fitContain_(p2, crops); p2.saveAndClose(); } catch (e2) {}
  }

  var slideUrl = 'https://docs.google.com/presentation/d/' + deckId + '/edit#slide=id.' + slideId;
  writeSlideBack_(rec.row, slideUrl, deck.name, email);
  if (p.coords && isFinite(Number(p.coords.lat)) && isFinite(Number(p.coords.lng))) {
    writeCoords_(rec.row, Number(p.coords.lat), Number(p.coords.lng));
  }
  try { bumpDeckCount_(deckId, SlidesApp.openById(deckId).getSlides().length); } catch (e3) {}
  logEvent_(email, replaced ? 'слайд оновлено' : 'слайд створено',
            rec.city + ', ' + rec.address + ' → ' + slideUrl + (cropNote ? ' · ' + cropNote : ''));
  return { ok: true, slideUrl: slideUrl, deckUrl: deck.url, deckName: deck.name, layout: layoutKind,
           images: images.length, replaced: replaced, note: cropNote };
}
