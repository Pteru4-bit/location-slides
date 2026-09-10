/***********************************************************************
 *  Decks — реєстр презентацій і створення нової з шаблону.
 *
 *  Одна презентація = один розгляд у керівництва. Нова презентація — копія шаблону
 *  (Google Slides, у який імпортовано корпоративний PPTX: майстер із
 *  логотипом і шрифтами). Усі слайди шаблону, крім першого, видаляються;
 *  перший лишається як заглушка, бо порожню презентацію Slides не тримає,
 *  і зникає, щойно зʼявляється перший справжній слайд.
 ***********************************************************************/

var PLACEHOLDER_NOTE = '__SLIDES_TEMPLATE_PLACEHOLDER__';

function dataSs_() {
  var id = cfg_('DATA_SS_ID') || initDataSpreadsheet();
  return SpreadsheetApp.openById(id);
}
function decksSheet_() {
  var ss = dataSs_();
  var sh = ss.getSheetByName(CFG.DECKS_SHEET);
  if (!sh) {
    (CFG.DECKS_SHEET_ALIASES || []).forEach(function (old) {
      if (!sh && ss.getSheetByName(old)) { sh = ss.getSheetByName(old); sh.setName(CFG.DECKS_SHEET); }
    });
  }
  if (!sh) { sh = ss.insertSheet(CFG.DECKS_SHEET); sh.appendRow(['id', 'назва', 'url', 'створено', 'ким', 'слайдів']); sh.setFrozenRows(1); }
  return sh;
}
function logEvent_(email, type, details) {
  try {
    var ss = dataSs_();
    var sh = ss.getSheetByName(CFG.LOG_SHEET);
    if (!sh) { sh = ss.insertSheet(CFG.LOG_SHEET); sh.appendRow(['час', 'пошта', 'подія', 'деталі']); sh.setFrozenRows(1); }
    sh.appendRow([new Date(), email || '', type || '', String(details || '').slice(0, 500)]);
  } catch (e) {}
}

function listDecks_() {
  var sh = decksSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, 6).getValues();
  var out = [];
  for (var i = vals.length - 1; i >= 0; i--) {
    var v = vals[i];
    if (!v[0]) continue;
    out.push({ id: String(v[0]), name: String(v[1]), url: String(v[2]),
               created: fmtDateTime_(v[3]), by: String(v[4] || ''), slides: Number(v[5]) || 0 });
  }
  return out;
}

function createDeck_(name, email) {
  var title = normText(name);
  if (!title) throw new Error('Вкажіть назву презентації.');
  var tplId = cfg_('TEMPLATE_DECK_ID');
  if (!tplId) throw new Error('Не задано TEMPLATE_DECK_ID — шаблон Google Slides із майстром НП.');
  var src = DriveApp.getFileById(tplId);
  var folderId = cfg_('DECKS_FOLDER_ID');
  var copy = folderId ? src.makeCopy(title, DriveApp.getFolderById(folderId)) : src.makeCopy(title);
  var pres = SlidesApp.openById(copy.getId());
  var slides = pres.getSlides();
  for (var i = slides.length - 1; i >= 1; i--) slides[i].remove();
  var first = pres.getSlides()[0];
  if (first) first.getNotesPage().getSpeakerNotesShape().getText().setText(PLACEHOLDER_NOTE);
  pres.saveAndClose();
  var url = 'https://docs.google.com/presentation/d/' + copy.getId() + '/edit';
  decksSheet_().appendRow([copy.getId(), title, url, new Date(), email || '', 0]);
  logEvent_(email, 'нова презентація', title + ' ' + url);
  return { id: copy.getId(), name: title, url: url, created: fmtDateTime_(new Date()), by: email || '', slides: 0 };
}

function deckEntry_(id) {
  var all = listDecks_();
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return null;
}

function bumpDeckCount_(id, count) {
  var sh = decksSheet_();
  var last = sh.getLastRow();
  if (last < 2) return;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) { sh.getRange(i + 2, 6).setValue(count); return; }
  }
}

/* Заглушка шаблону зникає, коли в презентації є хоч один справжній слайд. */
function removePlaceholder_(pres) {
  var slides = pres.getSlides();
  if (slides.length < 2) return;
  for (var i = slides.length - 1; i >= 0; i--) {
    var note = '';
    try { note = slides[i].getNotesPage().getSpeakerNotesShape().getText().asString(); } catch (e) {}
    if (normText(note) === PLACEHOLDER_NOTE) slides[i].remove();
  }
}
