/***********************************************************************
 *  Photos — файли з Диска: мініатюри для майстра і картинки для слайда.
 *
 *  Чому не оригінали. Форма приймає що завгодно: JPEG із телефону на 8 МБ,
 *  WebP з оголошення, HEIC з айфона. Google Slides вставляє лише PNG, JPEG
 *  і GIF, а дека з тридцятьма оригіналами важить сотні мегабайт. Тому на
 *  слайд іде JPEG-мініатюра, яку Диск генерує сам для будь-якого формату:
 *  посилання thumbnailLink закінчується на «=s220», і цей розмір можна
 *  попросити інший. Виняток — PNG-скріншоти карти: вони невеликі, а текст
 *  на карті в JPEG розмивається, тож їх вставляємо як є.
 ***********************************************************************/

function driveFile_(id) {
  return Drive.Files.get(id, {
    fields: 'id,name,mimeType,size,createdTime,thumbnailLink,webViewLink',
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

/* Картинка для слайда: PNG як є, решта — мініатюра IMAGE_PX. */
function slideImageBlob_(id) {
  var f = driveFile_(id);
  var mime = String(f.mimeType || '');
  if (mime === 'image/png' && Number(f.size || 0) < 12 * 1024 * 1024) {
    return DriveApp.getFileById(id).getBlob();
  }
  var b = thumbBlob_(f, CFG.IMAGE_PX);
  if (b) return b;
  if (SLIDES_NATIVE_MIME[mime] && Number(f.size || 0) < 20 * 1024 * 1024) return DriveApp.getFileById(id).getBlob();
  throw new Error('Диск ще не створив мініатюру для «' + (f.name || id) + '» (' + mime + '). Спробуйте за хвилину або замініть файл на JPEG/PNG.');
}

function dataUrl_(blob) {
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

/* Записи для майстра: мініатюра THUMB_PX як data URL. Помилка одного файлу
   не ламає решту — людина побачить, який саме файл не відкрився. */
function photoEntries_(ids) {
  return (ids || []).map(function (id) {
    try {
      var f = driveFile_(id);
      var b = thumbBlob_(f, CFG.THUMB_PX);
      if (!b && SLIDES_NATIVE_MIME[f.mimeType] && Number(f.size || 0) < 4 * 1024 * 1024) {
        b = DriveApp.getFileById(id).getBlob();
      }
      return { id: id, ok: true, name: f.name || id, mime: f.mimeType || '', url: f.webViewLink || ('https://drive.google.com/open?id=' + id),
               thumb: b ? dataUrl_(b) : '' };
    } catch (e) {
      return { id: id, ok: false, name: id, error: (e && e.message) || String(e), thumb: '' };
    }
  });
}

/* ── Карти, збережені картою мережі ── */

function shotsFolder_() {
  var id = cfg_('MAP_SHOTS_FOLDER_ID');
  if (!id) throw new Error('Не задано MAP_SHOTS_FOLDER_ID — папку, куди карта мережі зберігає PNG (initMapShotsFolder()).');
  return DriveApp.getFolderById(id);
}

/* Файли slide-<ключ>-*.png, найновіші першими, з мініатюрами. */
function listMapShots_(key) {
  var folder = shotsFolder_();
  var it = folder.searchFiles("title contains 'slide-" + key + "-' and trashed = false");
  var files = [];
  while (it.hasNext() && files.length < 12) {
    var f = it.next();
    files.push({ id: f.getId(), name: f.getName(), created: f.getDateCreated(), url: f.getUrl() });
  }
  files.sort(function (a, b) { return b.created - a.created; });
  return files.slice(0, 6).map(function (f) {
    var e = photoEntries_([f.id])[0];
    e.name = f.name; e.created = Utilities.formatDate(f.created, tz_(), 'dd.MM HH:mm'); e.url = f.url;
    return e;
  });
}

/* Ручне завантаження з майстра (запасний шлях, коли кнопки на карті немає). */
function uploadMapShot_(key, dataUrl, email) {
  if (!/^[\w-]{1,40}$/.test(key)) throw new Error('Некоректний ключ заявки.');
  var m = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
  if (!m) throw new Error('Очікується PNG або JPEG.');
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1]);
  var name = 'slide-' + key + '-manual-' + Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd-HHmmss') + (m[1] === 'image/png' ? '.png' : '.jpg');
  var f = shotsFolder_().createFile(blob.setName(name));
  logEvent_(email, 'карта вручну', name);
  return photoEntries_([f.getId()])[0];
}
