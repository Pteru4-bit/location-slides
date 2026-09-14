/***********************************************************************
 *  Code — точка входу веб-застосунку «Слайди локацій» і API для клієнта.
 *
 *  Режим пакетний: людина відмічає заявки, обирає презентацію і натискає
 *  «Створити слайди». Клієнт викликає apiBuildSlide по одній заявці
 *  (кожен виклик — окреме виконання, тож ліміт 6 хвилин не заважає), а
 *  правки роблять уже в Презентаціях руками.
 *
 *  Застосунок виконується від імені власника (як карта мережі), тому
 *  доступ до файлів форми, шаблону й презентацій потрібен лише йому. Коло
 *  користувачів звужує CFG.ALLOWED_EMAILS.
 ***********************************************************************/

function doGet(e) {
  var email = userEmail_();
  var param = (e && e.parameter) || {};
  if (!allowed_(email)) {
    return HtmlService.createHtmlOutput(
      '<p style="font:15px Arial;padding:24px">Доступ до слайдів локацій не надано для <b>' + esc_(email || 'невідомого акаунта') +
      '</b>. Зверніться до адміністратора.</p>').setTitle('Слайди локацій — доступ').setFaviconUrl(CFG.FAVICON_URL);
  }
  var t = HtmlService.createTemplateFromFile('Wizard');
  t.boot = JSON.stringify({
    email: email,
    mapUrl: cfg_('MAP_WEB_APP_URL'),
    key: String(param.key || ''),
    shotZoom: CFG.SHOT_ZOOM,
    photoMax: CFG.PHOTO_MAX,
    version: CODE_VERSION
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

/* ── API (google.script.run) ── */

function apiListRows(limit) {
  requireAccess_();
  return { ok: true, rows: readRecent_(Number(limit) || CFG.ROWS_LIMIT), sheet: responsesSheet_().getName() };
}

function apiListDecks() {
  requireAccess_();
  return { ok: true, decks: listDecks_() };
}

function apiCreateDeck(name) {
  var email = requireAccess_();
  return { ok: true, deck: createDeck_(name, email) };
}

/* Один слайд за заявкою: { key, row, deckId, replace }. */
function apiBuildSlide(payload) {
  var email = requireAccess_();
  return buildSlide_(payload, email);
}

function apiColumnReport() {
  requireAccess_();
  return { ok: true, lines: columnReport_() };
}

/* Перевірка з редактора: таблиця, колонки, папка карт, шаблон, витяг мережі. */
function checkSetup() {
  var out = [];
  try { out.push('✅ Таблиця відповідей: ' + responsesSs_().getName() + ' / аркуш «' + responsesSheet_().getName() + '»'); }
  catch (e) { out.push('❌ ' + e.message); }
  try { columnReport_().forEach(function (l) { out.push('   ' + l); }); } catch (e1) { out.push('❌ колонки: ' + e1.message); }
  try { var fo = shotsFolder_(); out.push(fo ? '✅ Папка карт: ' + fo.getName() : '⚠️ MAP_SHOTS_FOLDER_ID порожній — знімки з карти мережі (💾) не підхоплюватимуться'); }
  catch (e2) { out.push('❌ папка карт: ' + e2.message); }
  try { var t = cfg_('TEMPLATE_DECK_ID'); out.push(t ? '✅ Шаблон: ' + SlidesApp.openById(t).getName() : '❌ Не задано TEMPLATE_DECK_ID'); }
  catch (e3) { out.push('❌ шаблон: ' + e3.message); }
  try { out.push('✅ Презентацій у реєстрі: ' + listDecks_().length); } catch (e4) { out.push('❌ реєстр презентацій: ' + e4.message); }
  try { out.push(checkNetwork()); } catch (e5) { out.push('❌ витяг мережі: ' + e5.message); }
  out.push(cfg_('MAP_WEB_APP_URL') ? '✅ URL карти мережі задано' : '⚠️ MAP_WEB_APP_URL порожній — посилань «карта ↗» не буде');
  out.push('ℹ️ Фото на слайд: ' + (Number(CFG.IMAGE_MAX_PX) ? 'мініатюри до ' + CFG.IMAGE_MAX_PX + ' px' : 'оригінали без втрати якості'));
  out.push('ℹ️ Версія коду: ' + CODE_VERSION);
  out.forEach(function (l) { Logger.log(l); });
  return out;
}

/* Пробний слайд з редактора — виконує ПОТОЧНИЙ код, а не розгорнуту версію,
   тож ним видно, чи помилка вже виправлена, ще до нового розгортання.
   TEST_KEY порожній — береться перша заявка без слайда; впишіть ключ
   заявки (як у посиланні «карта ↗»: slide=20260910-112335), щоб зібрати
   саме її. Презентація — перша в реєстрі, слайд замінюється. */
var TEST_KEY = '';
function testBuildOnce() {
  var decks = listDecks_();
  if (!decks.length) { Logger.log('Немає жодної презентації — створіть у застосунку.'); return; }
  var rows = readRecent_(200);
  var row = TEST_KEY ? rows.filter(function (r) { return r.key === TEST_KEY; })[0]
                     : rows.filter(function (r) { return !r.slideUrl && !r.rejected; })[0];
  if (!row) { Logger.log(TEST_KEY ? 'Заявку з ключем ' + TEST_KEY + ' не знайдено серед останніх 200.' : 'Немає заявок без слайда.'); return; }
  Logger.log('Збираю: ' + row.city + ', ' + row.address + ' (фото: ' + row.photoIds.length + ') → ' + decks[0].name);
  var res = buildSlide_({ key: row.key, row: row.row, deckId: decks[0].id, replace: true }, userEmail_());
  Logger.log(JSON.stringify(res, null, 2));
}

/* Версія коду — щоб звірити, чи розгорнуто саме її: checkSetup() її друкує,
   а в застосунку вона в підвалі сторінки. */
var CODE_VERSION = '2026-09-14.6';
