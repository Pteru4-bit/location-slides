/***********************************************************************
 *  Nearby — карта «що поруч» без участі людини.
 *
 *  Джерело точок — витяг мережі, який карта мережі (Network-Map) тримає
 *  на Диску власника як map-network-payload.json: {gz: base64(gzip(JSON))}
 *  із масивом points [lat, lng, тип, підтип, …] і словником subs. Обидва
 *  застосунки виконуються від одного власника, тож файл читається напряму;
 *  оновлює його карта своїм тригером прогріву кеша.
 *
 *  Картинка — статична карта Google (Maps.newStaticMap, без ключа й
 *  білінгу, квота спільна з геокодером): центр — локація, масштаб за типом
 *  обʼєкта, маркери — найближчі точки мережі в кадрі, кольори ті самі, що
 *  на карті мережі. Стеля 640×480 — обмеження сервісу.
 ***********************************************************************/

/* Кольори категорій — як CAT у карті мережі (Map_js.html). */
var CAT_COLOR = {
  post: '0xD6202B', cargo: '0x7B3294', newfmt: '0xE8820C', mobile: '0x8C6D31',
  pickup: '0x1B9E77', boxOpen: '0x2D6FE0', boxHome: '0x56B4E9', infra: '0x3F4A56'
};
/* Тип підрозділу (індекс у payload.types) → категорія; підтип уточнює. */
var TYPE_CAT = ['post', 'post', 'pickup', 'boxOpen', 'pickup', 'infra', 'infra'];
var SUB_CAT = {
  'Поштове до 10 кг': 'post', 'Поштове до 30 кг': 'post',
  'Вантажне до 200 кг': 'cargo', 'Вантажне до 1 100 кг': 'cargo',
  'Поштові нового формату до 10кг': 'newfmt',
  'Мобільне на базі BDF(до 10 кг)': 'mobile', 'Мобільне на базі BDF(до 30 кг)': 'mobile',
  'Мобільне на базі авто': 'pickup',
  'Пункт нац. мережа': 'pickup', 'Пункт парт. мережа': 'pickup',
  'Пункт парт. мережа (з РРО)': 'pickup', 'Пункт парт. мережа (без РРО)': 'pickup',
  'Поштомат загальнодоступний': 'boxOpen', "Поштомат Під'їзд/ЖК": 'boxHome'
};
var LOCATION_COLOR = '0xE91E63';   /* мітка самої локації — колір, якого немає серед категорій */

var NET_CACHE_ = null;   /* витяг на час виконання: false = недоступний */

function networkFile_() {
  var id = cfg_('NET_PAYLOAD_FILE_ID');
  if (id) return DriveApp.getFileById(id);
  var it = DriveApp.getFilesByName(CFG.NET_PAYLOAD_NAME);
  return it.hasNext() ? it.next() : null;
}

function loadNetwork_() {
  if (NET_CACHE_ !== null) return NET_CACHE_;
  NET_CACHE_ = false;
  try {
    var f = networkFile_();
    if (!f) return false;
    var o = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
    if (!o || !o.gz) return false;
    var json = Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(o.gz), 'application/x-gzip')).getDataAsString('UTF-8');
    var p = JSON.parse(json);
    if (!p || !p.points || !p.points.length) return false;
    NET_CACHE_ = { points: p.points, subs: p.subs || [], types: p.types || [], updated: o.updated || p.updated || '' };
  } catch (e) {
    NET_CACHE_ = false;
  }
  return NET_CACHE_;
}

function catOf_(net, t, si) {
  var nm = (si >= 0 && net.subs) ? net.subs[si] : '';
  return (nm && SUB_CAT[nm]) || TYPE_CAT[t] || 'post';
}

/* Найближчі точки мережі, які потрапляють у кадр. */
function pointsNear_(net, lat, lng, zoom) {
  var bb = mercatorBbox(lat, lng, zoom, CFG.MAP.width, CFG.MAP.height);
  var out = [];
  var pts = net.points;
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    if (p[0] < bb.latMin || p[0] > bb.latMax || p[1] < bb.lngMin || p[1] > bb.lngMax) continue;
    var dx = (p[1] - lng) * Math.cos(lat * Math.PI / 180), dy = p[0] - lat;
    out.push({ lat: p[0], lng: p[1], cat: catOf_(net, p[2], p[3]), d: dx * dx + dy * dy });
  }
  out.sort(function (a, b) { return a.d - b.d; });
  return out.slice(0, CFG.MAP.maxPoints);
}

function staticMapBlob_(lat, lng, zoom, pts) {
  var m = Maps.newStaticMap()
    .setSize(CFG.MAP.width, CFG.MAP.height)
    .setZoom(zoom)
    .setCenter(lat, lng)
    .setMapType(Maps.StaticMap.Type.ROADMAP)
    .setLanguage('uk')
    .setFormat(Maps.StaticMap.Format.PNG);
  var byCat = {};
  (pts || []).forEach(function (p) { (byCat[p.cat] = byCat[p.cat] || []).push(p); });
  /* Підпис маркера в Apps Script обовʼязковий (порожній рядок → «Недійсний
     аргумент: label»); на малих маркерах він не малюється, тож для точок
     мережі це формальність, а на мітці локації — літера A. */
  Object.keys(byCat).forEach(function (cat) {
    m.setMarkerStyle(Maps.StaticMap.MarkerSize.SMALL, CAT_COLOR[cat] || '0x555555', 'A');
    byCat[cat].forEach(function (p) { m.addMarker(p.lat, p.lng); });
  });
  /* Локація — останньою, щоб її мітка була зверху. */
  m.setMarkerStyle(Maps.StaticMap.MarkerSize.MID, LOCATION_COLOR, 'A');
  m.addMarker(lat, lng);
  return m.getBlob().setName('map.png');
}

/* Карта для слайда: знімок із карти мережі (кнопка 💾), інакше статична.
   Повертає { blob|null, kind: 'shot'|'static'|'none', note, points }. */
function mapForLocation_(rec, coords) {
  var shot = null;
  try { shot = latestMapShot_(rec.key); } catch (e0) {}
  if (shot) return { blob: shot.blob, kind: 'shot', note: 'знімок із карти мережі ' + shot.name, points: 0 };

  if (!coords || coords.lat == null) return { blob: null, kind: 'none', note: 'координат немає: ' + (coords && coords.note || 'адресу не знайдено'), points: 0 };
  var zoom = zoomForType(rec.objType, CFG.MAP.zoomByType, CFG.MAP.zoomDefault);
  var net = loadNetwork_();
  var pts = net ? pointsNear_(net, coords.lat, coords.lng, zoom) : [];
  try {
    return { blob: staticMapBlob_(coords.lat, coords.lng, zoom, pts), kind: 'static', points: pts.length,
             note: 'статична карта, z' + zoom + (net ? ', точок мережі в кадрі: ' + pts.length : ', без точок мережі: витяг карти не знайдено') };
  } catch (e1) {
    /* Найчастіша причина — задовгий URL або квота. Пробуємо без точок. */
    try {
      return { blob: staticMapBlob_(coords.lat, coords.lng, zoom, []), kind: 'static', points: 0,
               note: 'статична карта без точок мережі (' + ((e1 && e1.message) || e1) + ')' };
    } catch (e2) {
      return { blob: null, kind: 'none', note: 'карту не побудовано: ' + ((e2 && e2.message) || e2), points: 0 };
    }
  }
}

/* Перевірка з редактора: чи бачить проєкт витяг мережі. */
function checkNetwork() {
  var net = loadNetwork_();
  var msg = net ? ('✅ Витяг мережі: ' + net.points.length + ' точок, оновлено ' + net.updated)
                : '⚠️ Витяг мережі не знайдено (map-network-payload.json на Диску власника карти) — карти будуть без точок';
  Logger.log(msg);
  return msg;
}
