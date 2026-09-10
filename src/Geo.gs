/***********************************************************************
 *  Geo — координати локації для карти.
 *
 *  Пріоритет джерел, від найточнішого:
 *    1. колонка «Координати» — те, що вже перевірила людина або зберіг
 *       попередній запуск;
 *    2. посилання Google Maps із форми (МРМ ставив мітку сам);
 *    3. геокодування «адреса, місто, область» вбудованим Maps.newGeocoder()
 *       — без ключа й білінгу, квота спільна з картою мережі (~10 000/добу
 *       на Workspace). Результат без номера будинку геокодер дає
 *       приблизно — про це майстер попереджає окремо.
 ***********************************************************************/

function resolveShortLink_(url) {
  var u = String(url);
  for (var i = 0; i < 4; i++) {
    var r = UrlFetchApp.fetch(u, { followRedirects: false, muteHttpExceptions: true });
    var code = r.getResponseCode();
    if (code < 300 || code >= 400) break;
    var h = r.getHeaders();
    var loc = h['Location'] || h['location'];
    if (!loc) break;
    u = loc;
  }
  return u;
}

function coordsFromLink_(link) {
  var s = normText(link);
  if (!s) return null;
  var c = coordsFromText(s);
  if (c) return c;
  if (isShortMapLink(s)) {
    try { return coordsFromText(resolveShortLink_(s)); } catch (e) { return null; }
  }
  return null;
}

var GEO_MEM_TTL = 21600;

function geocode_(query) {
  var q = normText(query);
  if (q.length < 4) return { ok: false, reason: 'Замало тексту для пошуку адреси.' };
  var cache = CacheService.getScriptCache();
  var memKey = 'geo:' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, q.toLowerCase(), Utilities.Charset.UTF_8));
  var hit = cache.get(memKey);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var res;
  try {
    res = Maps.newGeocoder().setLanguage('uk').setRegion('ua').geocode(q);
  } catch (e) {
    return { ok: false, reason: 'Геокодер недоступний: ' + (e && e.message) };
  }
  var out = { ok: false, reason: 'За цією адресою нічого не знайдено в межах України.' };
  if (res && res.status === 'OK' && res.results) {
    for (var i = 0; i < res.results.length; i++) {
      var r = res.results[i];
      var loc = r.geometry && r.geometry.location;
      if (!loc) continue;
      var lat = Number(loc.lat), lng = Number(loc.lng);
      if (!isFinite(lat) || !isFinite(lng) || !inUkraine(lat, lng)) continue;
      var t = String(r.geometry.location_type || '').toUpperCase();
      var types = (r.types || []).join(',');
      var precision = (t === 'ROOFTOP' || types.indexOf('street_address') !== -1 || types.indexOf('premise') !== -1)
        ? 'building' : (types.indexOf('route') !== -1 ? 'street' : 'area');
      out = { ok: true, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6,
              label: String(r.formatted_address || q), precision: precision };
      break;
    }
  }
  try { cache.put(memKey, JSON.stringify(out), GEO_MEM_TTL); } catch (e2) {}
  return out;
}

var GEO_PRECISION_NOTE = {
  building: '',
  street: 'знайдено вулицю цілком, без конкретного будинку',
  area: 'знайдено приблизно — район або населений пункт'
};

function resolveCoords_(rec) {
  var c = coordsFromText(rec.coordsSaved);
  if (c) return { lat: c.lat, lng: c.lng, source: 'saved', precision: 'building', note: '' };
  c = coordsFromLink_(rec.mapLink);
  if (c) return { lat: c.lat, lng: c.lng, source: 'link', precision: 'building', note: '' };
  var q = [rec.address, rec.city, rec.region].filter(Boolean).join(', ');
  var g = geocode_(q);
  if (g.ok) return { lat: g.lat, lng: g.lng, source: 'geocode', precision: g.precision,
                     note: GEO_PRECISION_NOTE[g.precision] || '', label: g.label, query: q };
  return { lat: null, lng: null, source: 'none', note: g.reason || 'координат немає', query: q };
}
