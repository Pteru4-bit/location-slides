/***********************************************************************
 *  Photos — файли з Диска для слайда.
 *
 *  На слайд ідуть ОРИГІНАЛИ (CFG.IMAGE_MAX_PX = 0): мініатюра на слайді —
 *  це те саме фото, лише зменшене; розтягнув — маєш повну якість. Винятки,
 *  які Google Slides не приймає: WebP і HEIC (форма їх пропускає), фото
 *  понад 25 Мпкс і файли понад 45 МБ — для них береться велика
 *  JPEG-мініатюра Диска: посилання thumbnailLink закінчується на «=s220»,
 *  і розмір можна попросити інший. Не-зображення (PDF, документи)
 *  пропускаються з поясненням.
 ***********************************************************************/

function driveFile_(id) {
  return Drive.Files.get(id, {
    fields: 'id,name,mimeType,size,createdTime,thumbnailLink,webViewLink,imageMediaMetadata(width,height)',
    supportsAllDrives: true
  });
}

function thumbLinkSized_(link, px) {
  return String(link).replace(/=s\d+(-[a-z]+)?$/, '=s' + px);
}

function fetchAuthed_(url) {
  return UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true, followRedirects: true
  });
}

/* Мініатюра Диска шириною px як blob (JPEG/PNG). null — ще не згенерована. */
function thumbBlob_(file, px) {
  if (!file.thumbnailLink) return null;
  var r = fetchAuthed_(thumbLinkSized_(file.thumbnailLink, px));
  if (r.getResponseCode() !== 200) return null;
  var ct = String(r.getHeaders()['Content-Type'] || r.getHeaders()['content-type'] || '');
  if (ct.indexOf('image/') !== 0) return null;
  return r.getBlob().setName((file.name || file.id) + '.jpg');
}

var SLIDES_NATIVE_MIME = { 'image/png': 1, 'image/jpeg': 1, 'image/gif': 1 };
var SLIDES_MAX_BYTES = 45 * 1024 * 1024;
var SLIDES_MAX_PIXELS = 24.5e6;
var THUMB_FALLBACK_PX = 4096;

/* Картинка для слайда: { blob, name, mode } або кидає помилку з причиною. */
function slideImage_(id) {
  var f = driveFile_(id);
  var mime = String(f.mimeType || ''), name = f.name || id;
  if (mime.indexOf('image/') !== 0) throw new Error(name + ': не зображення (' + (mime || 'невідомий тип') + ')');
  var meta = f.imageMediaMetadata || {};
  var tooBig = Number(f.size || 0) > SLIDES_MAX_BYTES ||
               (Number(meta.width) * Number(meta.height)) > SLIDES_MAX_PIXELS;
  var maxPx = Number(CFG.IMAGE_MAX_PX) || 0;

  if (!maxPx && SLIDES_NATIVE_MIME[mime] && !tooBig) {
    return { blob: DriveApp.getFileById(id).getBlob(), name: name, mode: 'оригінал' };
  }
  var px = maxPx || THUMB_FALLBACK_PX;
  var b = thumbBlob_(f, px);
  if (b) return { blob: b, name: name, mode: 'мініатюра ' + px };
  if (SLIDES_NATIVE_MIME[mime] && !tooBig) {
    return { blob: DriveApp.getFileById(id).getBlob(), name: name, mode: 'оригінал' };
  }
  throw new Error(name + ': Диск ще не створив мініатюру (' + mime + ') — спробуйте за хвилину');
}

/* ── Знімки, збережені кнопкою 💾 у карті мережі ── */

function shotsFolder_() {
  var id = cfg_('MAP_SHOTS_FOLDER_ID');
  if (!id) return null;
  return DriveApp.getFolderById(id);
}

/* Найновіший slide-<ключ>-*.png або null. */
function latestMapShot_(key) {
  var folder = shotsFolder_();
  if (!folder || !/^[\w-]{1,40}$/.test(key)) return null;
  var it = folder.searchFiles("title contains 'slide-" + key + "-' and trashed = false");
  var best = null;
  while (it.hasNext()) {
    var f = it.next();
    if (!best || f.getDateCreated() > best.getDateCreated()) best = f;
  }
  if (!best) return null;
  return { id: best.getId(), name: best.getName(), blob: best.getBlob() };
}
