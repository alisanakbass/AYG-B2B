const http = require('http');
const fs = require('fs');
const path = require('path');
const XLSX = require('../lib/xlsx.full.min.js');

const PORT = Number(process.env.PORT) || 3456;
const HOST = '0.0.0.0';

// Döviz Kurları (Başlangıç varsayılanı, canlı güncellenir)
const exchangeRates = { USD: 34.50, EUR: 37.50, TRY: 1.0 };

async function refreshExchangeRates() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      if (data?.rates?.TRY) {
        exchangeRates.USD = Number(data.rates.TRY);
        if (data.rates.EUR) {
          exchangeRates.EUR = Number(data.rates.TRY) / Number(data.rates.EUR);
        }
      }
    }
  } catch (_) {}
}

// Yardımcı Fonksiyonlar
function decodeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html) {
  return decodeHtml((html || '').replace(/<[^>]*>/g, ' '));
}

function parsePrice(str) {
  if (typeof str === 'number') return str;
  if (!str) return NaN;
  const cleaned = String(str).replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return NaN;
  if (cleaned.includes('.') && cleaned.includes(',')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.'));
  }
  if ((cleaned.match(/\./g) || []).length > 1) {
    return parseFloat(cleaned.replace(/\./g, ''));
  }
  return parseFloat(cleaned);
}

function cleanTurkish(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .trim();
}

function parsePackQty(name) {
  if (!name) return 0;
  const m = String(name).match(/(\d+)\s*(?:['’]L[İI]|['’]LU|['’]LÜ|ADET|AD\.?|PK\.?|PAKET|KOL[İI])\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n > 1 && n <= 1000) return n;
  }
  return 0;
}

function extractCookies(res) {
  const arr = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return arr.map(c => c.split(';')[0]).join('; ');
}

function mergeCookies(oldCookie, newCookie) {
  const map = new Map();
  [oldCookie, newCookie].forEach(str => {
    if (!str) return;
    str.split(';').forEach(pair => {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const k = pair.slice(0, idx).trim();
        const v = pair.slice(idx + 1).trim();
        if (k) map.set(k, v);
      }
    });
  });
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

// --- FIRAT BORU YEREL EXCEL VERİTABANI ---
let firatList = [];
function loadFiratExcel() {
  try {
    const excelPath = path.join(__dirname, '..', 'data', 'ADANA 20 HAZİRAN 2026 BORU FİYAT LİSTESİ.xlsx');
    if (!fs.existsSync(excelPath)) return;
    const wb = XLSX.read(fs.readFileSync(excelPath), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const list = [];
    for (let i = 4; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 6) continue;
      const code = r[1] ? String(r[1]).trim() : '';
      const pkg = r[2] ? String(r[2]).trim() : '';
      const name = r[3] ? String(r[3]).trim() : '';
      const price = typeof r[5] === 'number' ? r[5] : parsePrice(r[5]);
      if (!code || !name || isNaN(price) || price <= 0) continue;
      list.push({
        code,
        name: `${name} (${pkg || 'Adet'})`,
        netPrice: price,
        vatRate: 20,
        vatPrice: price * 1.2,
        unit: 'ADET',
        packQuantity: 1
      });
    }
    firatList = list;
    console.log(`[Fırat Boru] ${firatList.length} ürün belleğe yüklendi.`);
  } catch (e) {
    console.error('[Fırat Boru] Yükleme hatası:', e.message);
  }
}

function searchFirat(query) {
  const words = cleanTurkish(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const results = [];
  for (const item of firatList) {
    const n = cleanTurkish(item.name);
    const c = item.code.toLowerCase();
    if (words.every(w => n.includes(w) || c.includes(w))) {
      results.push({
        sourceKey: 'SITE_F',
        sourceName: 'Fırat Boru',
        code: item.code,
        name: item.name,
        netPrice: item.netPrice,
        vatPrice: item.vatPrice,
        vatRate: item.vatRate,
        unit: item.unit,
        packQuantity: item.packQuantity,
        imgUrl: '',
        productUrl: ''
      });
    }
  }
  return results;
}

// --- OTURUM ÖNBELLEĞİ ---
const sessions = {
  ozkCookie: '',
  enderToken: '',
  ktCookie: '',
  ricoCookie: '',
  yasarCookie: ''
};

// 1. ÖZKARADENİZ (SITE_A)
async function loginOzkaradeniz() {
  if (sessions.ozkCookie) {
    try {
      const rf = await fetch('https://b2b.ozkaradeniz.tr/api/v1/auth/refresh', {
        method: 'POST',
        headers: { Cookie: sessions.ozkCookie, Accept: 'application/json' }
      });
      if (rf.ok) {
        const sc = extractCookies(rf);
        if (sc) sessions.ozkCookie = mergeCookies(sessions.ozkCookie, sc);
        return true;
      }
    } catch (_) {}
  }
  const r = await fetch('https://b2b.ozkaradeniz.tr/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      email: process.env.OZK_USER || 'info@aygunleryapi.com',
      pass: process.env.OZK_PASS || 'Aygün123',
      portal: 'customer'
    })
  });
  if (!r.ok) return false;
  sessions.ozkCookie = extractCookies(r);
  return !!sessions.ozkCookie;
}

async function searchOzkaradeniz(query, isRetry = false) {
  if (!sessions.ozkCookie) await loginOzkaradeniz();
  const res = await fetch(`https://b2b.ozkaradeniz.tr/api/v1/products/search?q=${encodeURIComponent(query)}`, {
    headers: { Cookie: sessions.ozkCookie, Accept: 'application/json' }
  });
  if (res.status === 401 && !isRetry) {
    if (await loginOzkaradeniz()) return searchOzkaradeniz(query, true);
    return [];
  }
  if (!res.ok) return [];
  const data = await res.json();
  const list = Array.isArray(data.data) ? data.data : [];
  return list.map(row => {
    const p = row.pricing || {};
    const vatRate = Number(p.vatRate ?? row.vatRate) || 20;
    let netPrice = p.tl?.netPrice != null ? Number(p.tl.netPrice) : Number(p.netPrice ?? row.price ?? 0);
    let vatPrice = p.tl?.netPriceWithVat != null ? Number(p.tl.netPriceWithVat) : Number(p.netPriceWithVat ?? 0);
    if (!p.tl && row.currency && row.currency !== 'TRY' && exchangeRates[row.currency]) {
      netPrice *= exchangeRates[row.currency];
      vatPrice *= exchangeRates[row.currency];
    }
    if (!vatPrice && netPrice > 0) vatPrice = netPrice * (1 + vatRate / 100);
    const code = row.sku || row.id || '';
    const packQty = parsePackQty(row.name) || 1;
    return {
      sourceKey: 'SITE_A',
      sourceName: 'Özkaradeniz',
      code,
      name: row.name || '',
      netPrice,
      vatPrice,
      vatRate,
      unit: packQty > 1 ? 'PAKET' : (row.unit || 'ADET'),
      packQuantity: packQty,
      imgUrl: row.image?.thumbUrl || '',
      productUrl: code ? `https://b2b.ozkaradeniz.tr/products/${encodeURIComponent(code)}` : ''
    };
  }).filter(x => x.netPrice > 0);
}

// 2. ENDER YAPI (SITE_B)
async function loginEnder() {
  const r1 = await fetch('https://b2bstore.com.tr:14501/api/auth/get-tokenbyclient', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Browser-Web-Url': 'b2b.enderyapi.com.tr', LanguageCode: 'TR' },
    body: JSON.stringify({ weburl: 'b2b.enderyapi.com.tr', clientsecret: 'myclientsecret' })
  });
  const d1 = await r1.json();
  const ct = d1?.Data?.AccessToken || d1?.AccessToken;
  if (!ct) return false;
  const r2 = await fetch('https://b2bstore.com.tr:14501/api/auth/get-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ct}`, 'Browser-Web-Url': 'b2b.enderyapi.com.tr', LanguageCode: 'TR' },
    body: JSON.stringify({ Email: process.env.ENDER_USER || '120 08 1401', Password: process.env.ENDER_PASS || '1401' })
  });
  const d2 = await r2.json();
  const ut = d2?.Data?.token?.AccessToken || d2?.token?.AccessToken;
  if (ut) {
    sessions.enderToken = ut;
    return true;
  }
  return false;
}

async function searchEnder(query, isRetry = false) {
  if (!sessions.enderToken) await loginEnder();
  if (!sessions.enderToken) return [];
  const res = await fetch('https://b2bstore.com.tr:14500/services/product/get-product-search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessions.enderToken}`,
      'Browser-Web-Url': 'b2b.enderyapi.com.tr',
      Languagecode: 'TR'
    },
    body: JSON.stringify({
      ConsumerPrice: false, DiscountSale: 0, MostSaled: 0, MostViewed: 0, NewProduct: 0, Pg: 1,
      ProductOfTheDay: 0, ProductOfTheWeek: 0, RunFlat: 0, Stock: 0,
      filterModel: { Filter: [], CategoryID: null, BrandID: null, SeasonID: null },
      keyword: query
    })
  });
  if (res.status === 401 && !isRetry) {
    if (await loginEnder()) return searchEnder(query, true);
    return [];
  }
  if (!res.ok) return [];
  const data = await res.json();
  const hits = data?.Data?.Hits?.$values || [];
  return hits.map(row => {
    const det = row.ProductDetails || {};
    const name = det.ProductName || row.ProductName || row.Title || row.Name || 'Bilinmeyen Ürün';
    const code = det.ProductCode || row.ProductCode || row.Code || '';
    let pObj = {};
    let rawPrice = 0;
    if (row.ProductPrices) {
      if (Array.isArray(row.ProductPrices)) {
        pObj = row.ProductPrices[0] || {};
        rawPrice = pObj.Price || pObj.Value || pObj.NetPrice || 0;
      } else if (Array.isArray(row.ProductPrices.$values)) {
        pObj = row.ProductPrices.$values[0] || {};
        rawPrice = pObj.Price || pObj.Value || pObj.NetPrice || 0;
      } else if (Array.isArray(row.ProductPrices.Values)) {
        pObj = row.ProductPrices.Values[0] || {};
        rawPrice = pObj.Price || pObj.Value || pObj.NetPrice || 0;
      } else {
        pObj = row.ProductPrices;
        rawPrice = pObj.Price || pObj.NetPrice || pObj.PriceWithOrWithoutTax || 0;
      }
    }
    if (!rawPrice) {
      rawPrice = row.DiscountPrice || row.NetPrice || row.Price || row.B2BPrice ||
        det.DiscountPrice || det.NetPrice || det.Price || det.B2BPrice || 0;
    }
    const netPrice = typeof rawPrice === 'number' ? rawPrice : parsePrice(String(rawPrice));
    const vatRate = Number(pObj.TaxRatio || pObj.Tax || det.TaxRatio || row.TaxRatio || det.Tax || row.Tax) || 20;
    const vatPrice = netPrice * (1 + vatRate / 100);
    let imgUrl = (det.ImageUrl || row.DefaultImage || row.Image || row.ImageUrl || '').trim().split(' ').join('%20');
    if (imgUrl && !imgUrl.startsWith('http')) imgUrl = `https://b2b.enderyapi.com.tr/${imgUrl.replace(/^\//, '')}`;
    const packQty = parsePackQty(name) || 1;
    return {
      sourceKey: 'SITE_B',
      sourceName: 'Ender Yapı',
      code,
      name,
      netPrice,
      vatPrice,
      vatRate,
      unit: packQty > 1 ? 'PAKET' : 'ADET',
      packQuantity: packQty,
      imgUrl,
      productUrl: code ? `https://b2b.enderyapi.com.tr/tr/urunler-s-${encodeURIComponent(code)}?page=1` : ''
    };
  }).filter(x => !isNaN(x.netPrice) && x.netPrice > 0);
}

// 3. KAMİL TÜRK (SITE_H)
async function loginKamilTurk() {
  const res = await fetch('https://b2b.kamilturk.com/Giris', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `adi=${encodeURIComponent(process.env.KT_USER || '1340631')}&Sifre=${encodeURIComponent(process.env.KT_PASS || '662732')}&SmsSifre=&BeniHatirla=true`
  });
  if (!res.ok) return false;
  sessions.ktCookie = extractCookies(res);
  return !!sessions.ktCookie;
}

async function searchKamilTurk(query, isRetry = false) {
  if (!sessions.ktCookie) await loginKamilTurk();
  const res = await fetch(`https://b2b.kamilturk.com/Arama/_Prbx?q=${encodeURIComponent(query)}`, {
    headers: { Cookie: sessions.ktCookie }
  });
  const html = await res.text();
  if ((html.includes('Kullanici_Adi') || html.includes('LoginForm')) && !isRetry) {
    if (await loginKamilTurk()) return searchKamilTurk(query, true);
    return [];
  }
  const blocks = html.split('<div class="prbx-item"').slice(1);
  const results = [];
  for (const b of blocks) {
    const nameMatch = b.match(/class="prbx-ad[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const name = nameMatch ? stripTags(nameMatch[1]) : '';
    if (!name) continue;
    const netMatch = b.match(/<span>Net Fiyat<\/span>[\s\S]*?<span>([^<]+)<\/span>/i);
    const vatMatch = b.match(/<span>Kdv Dahil Fiyat<\/span>[\s\S]*?<span>([^<]+)<\/span>/i);
    const netPrice = netMatch ? parsePrice(netMatch[1]) : NaN;
    if (isNaN(netPrice) || netPrice <= 0) continue;
    const vatPrice = vatMatch ? parsePrice(vatMatch[1]) : netPrice * 1.2;
    const hrefMatch = b.match(/href="([^"]*\/Stok\/StokDetay\/[^"]+)"/);
    const imgMatch = b.match(/data-src="([^"]+)"/);
    const packQty = parsePackQty(name) || 1;
    results.push({
      sourceKey: 'SITE_H',
      sourceName: 'Kamil Türk',
      code: '',
      name,
      netPrice,
      vatPrice: isNaN(vatPrice) ? netPrice * 1.2 : vatPrice,
      vatRate: netPrice > 0 && vatPrice > 0 ? Math.round((vatPrice / netPrice - 1) * 100) : 20,
      unit: packQty > 1 ? 'PAKET' : 'ADET',
      packQuantity: packQty,
      imgUrl: imgMatch ? `https://b2b.kamilturk.com${imgMatch[1]}` : '',
      productUrl: hrefMatch ? `https://b2b.kamilturk.com${hrefMatch[1]}` : ''
    });
  }
  return results;
}

// 4. RİCO B2B (SITE_K)
async function loginRico() {
  const res = await fetch('https://b2b.rico.com.tr/Giris', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `adi=${encodeURIComponent(process.env.RICO_USER || 'AYG121')}&Sifre=${encodeURIComponent(process.env.RICO_PASS || '25060')}&SmsSifre=&BeniHatirla=true`
  });
  if (!res.ok) return false;
  sessions.ricoCookie = extractCookies(res);
  return !!sessions.ricoCookie;
}

async function searchRico(query, isRetry = false) {
  if (!sessions.ricoCookie) await loginRico();
  const res = await fetch(`https://b2b.rico.com.tr/Arama/_Prbx?q=${encodeURIComponent(query)}`, {
    headers: { Cookie: sessions.ricoCookie }
  });
  const html = await res.text();
  if ((html.includes('Kullanici_Adi') || html.includes('LoginForm')) && !isRetry) {
    if (await loginRico()) return searchRico(query, true);
    return [];
  }
  const rows = html.split(/<div class="tr\b[^>]*>/).slice(1);
  const results = [];
  const discountRate = 35; // Rico %35 alış iskontosu
  for (const r of rows) {
    const tds = [...r.matchAll(/<div class="td[^"]*">([\s\S]*?)<\/div>\s*(?=<div class="td|<\/div>)/g)];
    // Fallback: doğrudan alan bazlı çıkar
    const codeMatch = r.match(/<div class="prbx2-text text-left">([\s\S]*?)<\/div>/);
    const nameMatch = r.match(/<div class="font-weight-bold text-left"[^>]*>([\s\S]*?)<\/div>/);
    const name = nameMatch ? stripTags(nameMatch[1]) : '';
    if (!name) continue;
    const priceMatches = [...r.matchAll(/<div class="td liste-fiyat">[\s\S]*?<span>([^<]+)<\/span>/g)];
    if (priceMatches.length === 0) continue;
    const netText = priceMatches[priceMatches.length >= 2 ? 1 : 0][1];
    const vatText = priceMatches.length >= 3 ? priceMatches[2][1] : '';
    let rawNet = parsePrice(netText);
    if (isNaN(rawNet) || rawNet <= 0) continue;
    if (netText.includes('$') || netText.includes('USD')) rawNet *= exchangeRates.USD;
    else if (netText.includes('€') || netText.includes('EUR')) rawNet *= exchangeRates.EUR;
    const netPrice = rawNet * (1 - discountRate / 100);
    let rawVat = vatText ? parsePrice(vatText) : rawNet * 1.2;
    if (vatText && (vatText.includes('$') || vatText.includes('USD'))) rawVat *= exchangeRates.USD;
    else if (vatText && (vatText.includes('€') || vatText.includes('EUR'))) rawVat *= exchangeRates.EUR;
    const vatPrice = rawVat * (1 - discountRate / 100);
    const hrefMatch = r.match(/href="([^"]*\/Stok\/StokDetay\/[^"]+)"/);
    const packQty = parsePackQty(name) || 1;
    results.push({
      sourceKey: 'SITE_K',
      sourceName: 'Rico B2B',
      code: codeMatch ? stripTags(codeMatch[1]) : '',
      name,
      netPrice,
      vatPrice,
      vatRate: 20,
      unit: packQty > 1 ? 'PAKET' : 'ADET',
      packQuantity: packQty,
      imgUrl: '',
      productUrl: hrefMatch ? `https://b2b.rico.com.tr${hrefMatch[1]}` : ''
    });
  }
  return results;
}

// 5. YAŞAR TEKNİK (SITE_C)
async function loginYasar() {
  const res = await fetch('https://bayi.yasarteknik.com.tr/ajax/Login.asp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `KullaniciAdi=12001451&KullaniciKodu=1&Sifre=AYGUNLER`
  });
  const txt = (await res.text()).trim();
  if (txt === '1') {
    sessions.yasarCookie = extractCookies(res);
    return true;
  }
  return false;
}

async function searchYasar(query, isRetry = false) {
  if (!sessions.yasarCookie) await loginYasar();
  if (!sessions.yasarCookie) return [];
  const res = await fetch(`https://bayi.yasarteknik.com.tr/YeniSiparisGir.asp?F=Ara&FAdi=${encodeURIComponent(query)}`, {
    headers: { Cookie: sessions.yasarCookie }
  });
  const html = await res.text();
  if (html.includes('KullaniciAdi') && !isRetry) {
    if (await loginYasar()) return searchYasar(query, true);
    return [];
  }
  const trMatches = [...html.matchAll(/<tr[^>]*id="[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)];
  const results = [];
  for (const m of trMatches) {
    const tr = m[1];
    if (!tr.includes('UrunModalGoster')) continue;
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => stripTags(x[1]));
    const nameMatch = tr.match(/<td[^>]*onclick="[^"]*UrunModalGoster[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const name = nameMatch ? stripTags(nameMatch[1]) : '';
    if (!name || tds.length < 5) continue;
    let netPrice = parsePrice(tds[4]);
    if (isNaN(netPrice) || netPrice <= 0) continue;
    if (tds[4].includes('$') || tds[4].includes('USD')) netPrice *= exchangeRates.USD;
    else if (tds[4].includes('€') || tds[4].includes('EUR')) netPrice *= exchangeRates.EUR;
    const packQty = parsePackQty(name) || 1;
    results.push({
      sourceKey: 'SITE_C',
      sourceName: 'Yaşar Teknik',
      code: '',
      name,
      netPrice,
      vatPrice: netPrice * 1.2,
      vatRate: 20,
      unit: packQty > 1 ? 'PAKET' : 'ADET',
      packQuantity: packQty,
      imgUrl: '',
      productUrl: ''
    });
  }
  return results;
}

// 6. TOK TİCARET (SITE_I)
async function loginTokTicaret() {
  const res = await fetch('https://bayi.tokticaret.com.tr/ajax/Login.asp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'KullaniciAdi=M01A02&KullaniciKodu=1&Sifre=AYGUNLER01'
  });
  const txt = (await res.text()).trim();
  if (txt === '1') {
    sessions.tokCookie = extractCookies(res);
    return true;
  }
  return false;
}

async function searchTokTicaret(query, isRetry = false) {
  if (!sessions.tokCookie) await loginTokTicaret();
  if (!sessions.tokCookie) return [];
  const res = await fetch(`https://bayi.tokticaret.com.tr/SiparisGir.asp?sayfa=&FAdi=${encodeURIComponent(query)}&F=Ara&Sirala=varsayilan`, {
    headers: { Cookie: sessions.tokCookie }
  });
  const html = await res.text();
  if ((html.includes('frmLogin') || html.includes('KullaniciAdi')) && !isRetry) {
    if (await loginTokTicaret()) return searchTokTicaret(query, true);
    return [];
  }
  const trMatches = [...html.matchAll(/<tr[^>]*id="[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)];
  const results = [];
  for (const m of trMatches) {
    const tr = m[1];
    const tdRaw = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => x[1]);
    if (tdRaw.length < 7) continue;
    const code = stripTags(tdRaw[1]);
    const name = stripTags(tdRaw[2]);
    if (!name) continue;
    const priceRaw = stripTags(tdRaw[6]);
    let netPrice = parsePrice(priceRaw);
    if (isNaN(netPrice) || netPrice <= 0) continue;
    if (priceRaw.includes('$') || priceRaw.includes('USD')) netPrice *= exchangeRates.USD;
    else if (priceRaw.includes('€') || priceRaw.includes('EUR')) netPrice *= exchangeRates.EUR;
    const vatMatch = stripTags(tdRaw[7] || '').match(/(\d+)/);
    const vatRate = vatMatch ? parseInt(vatMatch[1], 10) : 20;
    const imgMatch = tdRaw[0].match(/(?:data-src|src)="([^"]+)"/i);
    let imgUrl = imgMatch ? imgMatch[1].trim() : '';
    if (imgUrl && !imgUrl.startsWith('http')) imgUrl = `https://bayi.tokticaret.com.tr/${imgUrl.replace(/^\//, '')}`;
    const unitRaw = stripTags(tdRaw[9] || '').toUpperCase() || 'ADET';
    const packQty = parsePackQty(name) || 1;
    results.push({
      sourceKey: 'SITE_I',
      sourceName: 'Tok Ticaret',
      code,
      name,
      netPrice,
      vatPrice: netPrice * (1 + vatRate / 100),
      vatRate,
      unit: unitRaw,
      packQuantity: packQty,
      imgUrl,
      productUrl: ''
    });
  }
  return results;
}

// --- HTTP SUNUCU ---
const mobileHtmlPath = path.join(__dirname, 'mobile.html');

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (urlObj.pathname === '/' || urlObj.pathname === '/index.html') {
    const html = fs.readFileSync(mobileHtmlPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (urlObj.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      firatCount: firatList.length,
      exchangeRates
    }));
    return;
  }

  if (urlObj.pathname === '/api/search') {
    const q = (urlObj.searchParams.get('q') || '').trim();
    if (!q) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Arama kelimesi boş olamaz.' }));
      return;
    }

    const startTime = Date.now();
    const tasks = [
      { key: 'SITE_F', fn: () => Promise.resolve(searchFirat(q)) },
      { key: 'SITE_A', fn: () => searchOzkaradeniz(q) },
      { key: 'SITE_B', fn: () => searchEnder(q) },
      { key: 'SITE_H', fn: () => searchKamilTurk(q) },
      { key: 'SITE_K', fn: () => searchRico(q) },
      { key: 'SITE_C', fn: () => searchYasar(q) },
      { key: 'SITE_I', fn: () => searchTokTicaret(q) }
    ];

    const settled = await Promise.allSettled(tasks.map(t => t.fn()));
    const items = [];
    const siteCounts = {};

    settled.forEach((r, idx) => {
      const k = tasks[idx].key;
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        siteCounts[k] = r.value.length;
        items.push(...r.value);
      } else {
        siteCounts[k] = 0;
        if (r.status === 'rejected') console.warn(`[${k}] Arama hatası:`, r.reason?.message);
      }
    });

    // Birim net alış fiyatına göre sırala (en ucuz en üstte)
    items.forEach(it => {
      it.unitNetPrice = it.packQuantity > 1 ? (it.netPrice / it.packQuantity) : it.netPrice;
    });
    items.sort((a, b) => a.unitNetPrice - b.unitNetPrice);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      query: q,
      elapsedMs: Date.now() - startTime,
      total: items.length,
      siteCounts,
      items
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

loadFiratExcel();
refreshExchangeRates();
setInterval(refreshExchangeRates, 30 * 60 * 1000);

server.listen(PORT, HOST, () => {
  console.log(`\n================================================`);
  console.log(`  AYG B2B Mobil Sunucu Çalışıyor!`);
  console.log(`  Yerel Adres   : http://localhost:${PORT}`);
  console.log(`  Tailscale'den : http://<TAILSCALE_IP>:${PORT}`);
  console.log(`================================================\n`);
});
