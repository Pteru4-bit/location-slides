/***********************************************************************
 *  Code — точка входу веб-застосунку «Слайди локацій» і API для майстра.
 *
 *  Застосунок виконується від імені власника (як карта мережі), тому
 *  доступ до файлів форми, шаблону й презентацій потрібен лише йому. Користувачу
 *  досить посилання; коло користувачів звужує CFG.ALLOWED_EMAILS.
 ***********************************************************************/

function doGet(e) {
  var email = userEmail_();
  var param = (e && e.parameter) || {};
  if (!allowed_(email)) {
    return HtmlService.createHtmlOutput(
      '<p style="font:15px Arial;padding:24px">Доступ до майстра слайдів не надано для <b>' + esc_(email || 'невідомого акаунта') +
      '</b>. Зверніться до адміністратора.</p>').setTitle('Слайди локацій — доступ').setFaviconUrl(CFG.FAVICON_URL);
  }
  var t = HtmlService.createTemplateFromFile('Wizard');
  t.boot = JSON.stringify({
    email: email,
    mapUrl: cfg_('MAP_WEB_APP_URL'),
    key: String(param.key || ''),
    row: Number(param.row) || 0,
    shotZoom: CFG.SHOT_ZOOM,
    maxImages: MAX_IMAGES
  });
  logEvent_(email, 'вхід', param.key ? 'key=' + param.key : '');
  return t.evaluate()
    .setTitle('Слайди локацій')
    .setFaviconUrl(CFG.FAVICON_URL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function userEmail_() {
  try { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; }
}
function allowed_(email) {
  var list = (CFG.ALLOWED_EMAILS || []).map(function (s) { return String(s).toLowerCase(); });
  if (!list.length) return true;
  return list.indexOf(email) !== -1;
}
function requireAccess_() {
  var email = userEmail_();
  if (!allowed_(email)) throw new Error('Немає доступу.');
  return email;
}

/* ── API майстра (google.script.run) ── */

function apiListRows(limit) {
  requireAccess_();
  return { ok: true, rows: readRecent_(Number(limit) || CFG.ROWS_LIMIT), sheet: responsesSheet_().getName() };
}

function apiGetRow(key, hintRow) {
  requireAccess_();
  var rec = recordByKey_(String(key || ''), Number(hintRow) || 0);
  rec.photos = photoEntries_(rec.photoIds);
  rec.coords = resolveCoords_(rec);
  var shots = [];
  try { shots = listMapShots_(rec.key); } catch (e) { rec.shotsError = (e && e.message) || String(e); }
  rec.mapShots = shots;
  return { ok: true, rec: rec };
}

function apiListMapShots(key) {
  requireAccess_();
  return { ok: true, shots: listMapShots_(String(key || '')) };
}

function apiUploadMapShot(key, dataUrl) {
  var email = requireAccess_();
  return { ok: true, shot: uploadMapShot_(String(key || ''), dataUrl, email) };
}

function apiGeocode(query) {
  requireAccess_();
  var g = geocode_(query);
  if (g.ok) g.note = GEO_PRECISION_NOTE[g.precision] || '';
  return g;
}

function apiSaveCoords(key, hintRow, lat, lng) {
  var email = requireAccess_();
  var la = Number(lat), ln = Number(lng);
  if (!isFinite(la) || !isFinite(ln) || !inUkraine(la, ln)) throw new Error('Координати поза межами України або не числа.');
  var rec = recordByKey_(String(key || ''), Number(hintRow) || 0);
  writeCoords_(rec.row, la, ln);
  logEvent_(email, 'координати', rec.key + ' → ' + la + ', ' + ln);
  return { ok: true, lat: la, lng: ln };
}

function apiListDecks() {
  requireAccess_();
  return { ok: true, decks: listDecks_() };
}

function apiCreateDeck(name) {
  var email = requireAccess_();
  return { ok: true, deck: createDeck_(name, email) };
}

function apiBuildSlide(payload) {
  var email = requireAccess_();
  return buildSlide_(payload, email);
}

function apiColumnReport() {
  requireAccess_();
  return { ok: true, lines: columnReport_() };
}

/* Перевірка з редактора: таблиця, колонки, папка карт, шаблон, презентації. */
function checkSetup() {
  var out = [];
  try { out.push('✅ Таблиця відповідей: ' + responsesSs_().getName() + ' / аркуш «' + responsesSheet_().getName() + '»'); }
  catch (e) { out.push('❌ ' + e.message); }
  try { columnReport_().forEach(function (l) { out.push('   ' + l); }); } catch (e1) { out.push('❌ колонки: ' + e1.message); }
  try { out.push('✅ Папка карт: ' + shotsFolder_().getName()); } catch (e2) { out.push('❌ ' + e2.message); }
  try { var t = cfg_('TEMPLATE_DECK_ID'); out.push(t ? '✅ Шаблон: ' + SlidesApp.openById(t).getName() : '❌ Не задано TEMPLATE_DECK_ID'); }
  catch (e3) { out.push('❌ шаблон: ' + e3.message); }
  try { out.push('✅ Презентацій у реєстрі: ' + listDecks_().length); } catch (e4) { out.push('❌ реєстр презентацій: ' + e4.message); }
  out.push(cfg_('MAP_WEB_APP_URL') ? '✅ URL карти мережі задано' : '⚠️ MAP_WEB_APP_URL порожній — кнопки «Відкрити карту» не буде');
  out.forEach(function (l) { Logger.log(l); });
  return out;
}
