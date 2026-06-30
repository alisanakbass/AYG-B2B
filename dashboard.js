// B2B Karşılaştırma Portalı Ana JS

let currentMargin = 40;
let siteMargins = { SITE_A: 40, SITE_B: 40, SITE_C: 40, SITE_D: 40, SITE_E: 40 };
let siteDiscounts = { SITE_A: 0, SITE_B: 0, SITE_C: 0, SITE_D: 0, SITE_E: 0 };
let currentCart = {};
let currentResults = []; // Arama sonuçlarını hafızada tutar (anlık fiyat değişimi için)
let currentProductDiscounts = {}; // Ürün bazlı özel kalıcı iskontolar {productKey: {name, discount, domain}}
let keywordDiscounts = []; // Kelime bazlı otomatik iskontolar [{id, keyword, discount}]
let salesHistory = []; // Satış geçmişi

// Döviz Kurları
let exchangeRates = {
  USD: 33.00,
  EUR: 36.00,
  TRY: 1.00
};

// Döviz kurlarını güncelleyen fonksiyon
async function fetchExchangeRates() {
  try {
    const resUSD = await fetch('https://open.er-api.com/v6/latest/USD');
    if (resUSD.ok) {
      const dataUSD = await resUSD.json();
      if (dataUSD && dataUSD.rates && dataUSD.rates.TRY) {
        exchangeRates.USD = parseFloat(dataUSD.rates.TRY);
      }
    }
  } catch (err) {
    console.error('[B2B Portal] USD kuru çekilemedi, fallback kullanılıyor:', err);
  }

  try {
    const resEUR = await fetch('https://open.er-api.com/v6/latest/EUR');
    if (resEUR.ok) {
      const dataEUR = await resEUR.json();
      if (dataEUR && dataEUR.rates && dataEUR.rates.TRY) {
        exchangeRates.EUR = parseFloat(dataEUR.rates.TRY);
      }
    }
  } catch (err) {
    console.error('[B2B Portal] EUR kuru çekilemedi, fallback kullanılıyor:', err);
  }

  updateExchangeRatesUI();
}

// Döviz kuru arayüzünü güncelleyen fonksiyon
function updateExchangeRatesUI() {
  const panel = document.getElementById('exchange-rates-panel');
  const usdVal = document.getElementById('usd-rate-val');
  const eurVal = document.getElementById('eur-rate-val');

  // Sol üst köşedeki mini kur alanları
  const miniPanel = document.getElementById('header-exchange-rates');
  const usdValMini = document.getElementById('usd-rate-val-mini');
  const eurValMini = document.getElementById('eur-rate-val-mini');

  if (panel && usdVal && eurVal) {
    usdVal.textContent = exchangeRates.USD.toFixed(2) + ' TL';
    eurVal.textContent = exchangeRates.EUR.toFixed(2) + ' TL';
    panel.style.display = 'block';
  }

  if (miniPanel && usdValMini && eurValMini) {
    usdValMini.textContent = exchangeRates.USD.toFixed(2);
    eurValMini.textContent = exchangeRates.EUR.toFixed(2);
    miniPanel.style.display = 'flex';
  }
}

// Varsayılan B2B Arama Şablonları
const DEFAULT_URLS = {
  url_site_a: "https://b4b.ozkaradenizinsaat.com/search/product/{query}",
  url_site_b: "https://b2b.enderyapi.com.tr/tr/urunler-s-{query}?page=1",
  url_site_c: "https://bayi.yasarteknik.com.tr/YeniSiparisGir.asp?F=Ara&FAdi={query}",
  url_site_d: "https://yenibayi.polisankansai.com/order/makeordernew?search={query}",
  url_site_e: "https://bayi.akyuztools.com/Search/SearchProduct"
};


// Fiyat Ayrıştırma
function parsePrice(priceStr) {
  if (!priceStr) return 0;
  let cleanStr = priceStr.replace(/[^0-9,.-]/g, '');
  if (cleanStr.includes('.') && cleanStr.includes(',')) {
    cleanStr = cleanStr.replace(/\./g, '').replace(/,/g, '.');
  } else if (cleanStr.includes(',')) {
    cleanStr = cleanStr.replace(/,/g, '.');
  }
  const val = parseFloat(cleanStr);
  return isNaN(val) ? 0 : val;
}

// Fiyat Biçimlendirme
function formatPrice(value) {
  if (isNaN(value)) return "0,00 TL";
  return value.toFixed(2).replace('.', ',') + ' TL';
}

// Ürün Adından Paket İçi Adet Çözümleme
function parsePackQuantityFromName(name) {
  if (!name) return null;
  // Özel parantez içi örüntüleri: (PK:100 AD), (PK:75 AD), (PK:100), (KUTU:50 AD), (KOLİ:12), vb.
  const regexParentheses = /\((?:PK|KUTU|KOLİ|KOLI|DZ|DÜZİNE|ADET|AD)\s*[:/]\s*(\d+)\s*(?:AD|ADET)?\)/i;
  let match = name.match(regexParentheses);
  if (match) {
    const val = parseInt(match[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }

  // Alternatif parantez içi örüntüsü: (100 AD), (50 ADET), (12 AD.)
  const regexQtyAdet = /\((\d+)\s*(?:AD|ADET|AD\.)\)/i;
  match = name.match(regexQtyAdet);
  if (match) {
    const val = parseInt(match[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }

  // Parantez olmadan da olabilir: PK:100 AD, PK: 100, DZ:50
  const regexNoParentheses = /\b(?:PK|KUTU|KOLİ|KOLI|DZ|DÜZİNE)\s*[:/]\s*(\d+)\b/i;
  match = name.match(regexNoParentheses);
  if (match) {
    const val = parseInt(match[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }

  return null;
}


// Satış Fiyatı Hesaplama
function calculateSellingPrice(basePrice, margin, includeVat) {
  const withMargin = basePrice * (1 + (margin / 100));
  const finalPrice = includeVat ? withMargin * 1.20 : withMargin;
  return parseFloat(finalPrice.toFixed(2));
}

// Görsel URL Ayıklama Yardımcısı
function extractImageUrl(row, selector, domain) {
  const imgEl = selector ? row.querySelector(selector) : row.querySelector('img');
  if (!imgEl) return '';

  let src = imgEl.getAttribute('data-src') ||
    imgEl.getAttribute('data-original') ||
    imgEl.getAttribute('src') ||
    imgEl.getAttribute('ng-src') || '';

  src = src.trim();
  if (!src) return '';

  // Base64 doğrudan geçerlidir
  if (src.startsWith('data:')) return src;

  if (!src.startsWith('http')) {
    if (src.startsWith('//')) {
      src = 'https:' + src;
    } else {
      src = `https://${domain}/${src.startsWith('/') ? src.substring(1) : src}`;
    }
  }
  return src;
}

// --- DYNAMIC SELECTORS (content.js'ten uyarlanmış) ---
const PARSERS = {
  SITE_E: {
    name: "Akyüzler",
    badgeClass: "site_e",
    rowSelector: null,
    parseRow: null
  },
  SITE_A: {
    name: "Özkaradeniz İnşaat",
    badgeClass: "site_a",

    rowSelector: 'tr[ng-repeat*="product_list"]',
    parseRow: (row, domain) => {
      // Ürün Adı Ayıklama
      let name = 'Bilinmeyen Ürün';
      const tds = row.querySelectorAll('td');
      for (const td of tds) {
        if (td.classList.contains('actions') || td.querySelector('input')) continue;
        const clone = td.cloneNode(true);
        const uls = clone.querySelectorAll('ul');
        uls.forEach(ul => ul.remove());
        const txt = clone.textContent.trim();
        if (txt) {
          name = txt.replace(/\s+/g, ' ');
          break;
        }
      }

      // Fiyat Ayıklama
      let basePrice = NaN;
      const uls = row.querySelectorAll('td ul');
      for (const ul of uls) {
        const lis = ul.querySelectorAll('li');
        for (const li of lis) {
          if (li.textContent.includes('KDV Hariç')) {
            const span = li.querySelector('span');
            const priceText = span ? span.textContent : li.textContent.replace('KDV Hariç:', '');
            basePrice = parsePrice(priceText);

            // Döviz Birimi Çevrimi
            let currency = 'TRY';
            if (priceText.includes('$') || priceText.includes('USD') || priceText.includes('fa-usd') || priceText.includes('fa-dollar')) {
              currency = 'USD';
            } else if (priceText.includes('€') || priceText.includes('EUR') || priceText.includes('fa-eur') || priceText.includes('fa-euro')) {
              currency = 'EUR';
            }

            if (currency === 'USD') {
              basePrice = basePrice * exchangeRates.USD;
            } else if (currency === 'EUR') {
              basePrice = basePrice * exchangeRates.EUR;
            }
            break;
          }
        }
      }

      // Benzersiz ID/Key
      const inputEl = row.querySelector('input[type="number"]');
      let modelId = '';
      if (inputEl) {
        const modelAttr = inputEl.getAttribute('ng-model') || '';
        const match = modelAttr.match(/\[([^\]]+)\]/);
        modelId = match ? match[1].replace(/[^\w]/g, '_') : modelAttr.replace(/[^\w]/g, '_');
      }
      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
      const key = `b2b_${domain.replace(/\./g, '_')}_${modelId || cleanName}`;

      // Görsel Ayıklama
      const imgUrl = extractImageUrl(row, 'img', domain);

      // Özkaradeniz için varsayılan birimler
      return { key, name, basePrice, domain, imgUrl, unit: 'ADET', packQuantity: 1 };
    }
  },
  SITE_B: {
    name: "Ender Yapı",
    badgeClass: "site_b",
    rowSelector: 'a.row-id, a[id^="ProductID_"]',
    parseRow: (row, domain) => {
      const nameEl = row.querySelector('.name-id-link, [data-title="Ürün"] .name-id-link');
      const name = nameEl ? nameEl.textContent.trim() : 'Bilinmeyen Ürün';

      const priceEl = row.querySelector('[data-title="KDV’siz Net Fiyat"], .price-id');
      let basePrice = NaN;
      if (priceEl) {
        const clone = priceEl.cloneNode(true);
        const priceText = priceEl.innerHTML;

        let currency = 'TRY';
        if (priceText.includes('fa-usd') || priceText.includes('fa-dollar') || priceText.includes('$') || priceText.includes('USD')) {
          currency = 'USD';
        } else if (priceText.includes('fa-eur') || priceText.includes('fa-euro') || priceText.includes('€') || priceText.includes('EUR')) {
          currency = 'EUR';
        }

        const iTag = clone.querySelector('i');
        if (iTag) iTag.remove();
        basePrice = parsePrice(clone.textContent);

        if (currency === 'USD') {
          basePrice = basePrice * exchangeRates.USD;
        } else if (currency === 'EUR') {
          basePrice = basePrice * exchangeRates.EUR;
        }
      }

      const codeEl = row.querySelector('.code-id span');
      const codeId = codeEl ? codeEl.textContent.trim().replace(/\s+/g, '_') : '';
      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
      const key = `b2b_${domain.replace(/\./g, '_')}_${codeId || cleanName}`;

      // Görsel Ayıklama
      const imgUrl = extractImageUrl(row, '.img-id img, img', domain);

      // HTML fallback için birim ve paket miktarı okumaya çalış
      const unitEl = row.querySelector('.unit-id, .measure-unit, [data-title="Birim"], [data-title="Birim"] span');
      let unit = unitEl ? unitEl.textContent.trim().toUpperCase() : 'ADET';
      if (unit.includes('PAKET') || unit.includes('KOLİ') || unit.includes('KUTU') || unit.includes('DZ') || unit.includes('DÜZİNE') || unit.includes('SET') || unit.includes('TAKIM')) {
        unit = (unit.includes('DZ') || unit.includes('DÜZİNE')) ? 'DÜZİNE' :
          (unit.includes('KOLİ') ? 'KOLİ' :
            (unit.includes('KUTU') ? 'KUTU' : 'PAKET'));
      } else {
        unit = 'ADET';
      }

      // Önce ürün adından paket miktarını çözmeyi deneyelim (Ender Yapı tutarsızlıkları için öncelikli)
      let packQuantity = parsePackQuantityFromName(name);

      if (!packQuantity) {
        const boxQtyEl = row.querySelector('[data-title="Kutu / Koli"], [data-title="Kutu / Koli"] span, .fieldone-id, .fieldone-id span, .multiplier-id, .order-multiplier, [data-title="Çarpan"]');
        packQuantity = 1;
        if (boxQtyEl) {
          const text = boxQtyEl.textContent.trim();
          const match = text.match(/(\d+)/);
          if (match) {
            const parsed = parseInt(match[1], 10);
            if (!isNaN(parsed) && parsed > 0) packQuantity = parsed;
          }
        }
      }

      return { key, name, basePrice, domain, imgUrl, unit, packQuantity };
    }
  },
  SITE_C: {
    name: "Yaşar Teknik",
    badgeClass: "site_c",
    rowSelector: 'tr[id]',
    parseRow: (row, domain) => {
      // Yalnızca sepet ekleme butonu olan veya modal gösteren satırlar
      if (!row.querySelector('.btnSepeteEkle') && !row.querySelector('td[onclick*="UrunModalGoster"]')) return null;

      const nameEl = row.querySelector('td[onclick*="UrunModalGoster"]');
      const name = nameEl ? nameEl.textContent.trim() : 'Bilinmeyen Ürün';

      const tds = row.querySelectorAll('td');
      let basePrice = NaN;
      if (tds.length >= 5) {
        const priceText = tds[4].textContent;
        basePrice = parsePrice(priceText);

        let currency = 'TRY';
        if (priceText.includes('$') || priceText.includes('USD') || priceText.includes('fa-usd') || priceText.includes('fa-dollar')) {
          currency = 'USD';
        } else if (priceText.includes('€') || priceText.includes('EUR') || priceText.includes('fa-eur') || priceText.includes('fa-euro')) {
          currency = 'EUR';
        }

        if (currency === 'USD') {
          basePrice = basePrice * exchangeRates.USD;
        } else if (currency === 'EUR') {
          basePrice = basePrice * exchangeRates.EUR;
        }
      }

      const codeId = row.id || '';
      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
      const key = `b2b_${domain.replace(/\./g, '_')}_${codeId || cleanName}`;

      // Görsel Ayıklama
      const imgUrl = extractImageUrl(row, 'td img, img', domain);

      return { key, name, basePrice, domain, imgUrl, unit: 'ADET', packQuantity: 1 };
    }
  },
  SITE_D: {
    name: "Polisan Bayi",
    badgeClass: "site_d",
    rowSelector: 'div.col-md-3.col-sm-4',
    parseRow: (row, domain) => {
      // Satırda 'sku' barındıran Knockout binding var mı veya ad var mı?
      if (!row.querySelector('h4[data-bind="text:sku"]') && !row.querySelector('h4[data-bind="text:name"]')) return null;

      const nameEl = row.querySelector('h4[data-bind="text:name"]');
      const name = nameEl ? nameEl.textContent.trim() : 'Bilinmeyen Ürün';

      const codeEl = row.querySelector('h4[data-bind="text:sku"]');
      const codeId = codeEl ? codeEl.textContent.trim() : '';

      const priceEl = row.querySelector('span[data-bind="text:price"]');
      let basePrice = NaN;
      if (priceEl) {
        const priceText = priceEl.textContent;
        basePrice = parsePrice(priceText);

        let currency = 'TRY';
        if (priceText.includes('$') || priceText.includes('USD') || priceText.includes('fa-usd') || priceText.includes('fa-dollar')) {
          currency = 'USD';
        } else if (priceText.includes('€') || priceText.includes('EUR') || priceText.includes('fa-eur') || priceText.includes('fa-euro')) {
          currency = 'EUR';
        }

        if (currency === 'USD') {
          basePrice = basePrice * exchangeRates.USD;
        } else if (currency === 'EUR') {
          basePrice = basePrice * exchangeRates.EUR;
        }
      }

      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
      const key = `b2b_${domain.replace(/\./g, '_')}_${codeId || cleanName}`;

      // Görsel Ayıklama
      const imgUrl = extractImageUrl(row, 'img[data-bind*="pictureUrl"], img', domain);

      // HTML'den birim ve paket adedini çekmeye çalışalım
      const unitEl = row.querySelector('[data-bind*="unit"], [data-bind*="unitName"]');
      let unit = unitEl ? unitEl.textContent.trim().toUpperCase() : 'ADET';

      // Önce ürün adından paket miktarını çözmeyi çalışalım
      let packQuantity = parsePackQuantityFromName(name);

      if (!packQuantity) {
        const boxQtyEl = row.querySelector('[data-bind*="boxQty"], [data-bind*="boxQuantity"], [data-bind*="multiplier"]');
        packQuantity = 1;
        if (boxQtyEl) {
          const parsedQty = parseInt(boxQtyEl.textContent.trim(), 10);
          if (!isNaN(parsedQty) && parsedQty > 0) {
            packQuantity = parsedQty;
          }
        }
      }

      return { key, name, basePrice, domain, imgUrl, unit, packQuantity };
    }
  }
};

// --- SESSION CHECKERS (Oturum Durum Kontrolleri) ---
// --- SESSION CHECKERS ---
// Ağ isteği YAPMAZ — storage'daki son bilinen durumu okur.
// Gerçek Aktif/Pasif bilgisi aramadan gelir (fetchFromB2B → updateSessionActive).
async function checkAllSessions() {
  const storageData = await new Promise(r =>
    chrome.storage.local.get(['enderyapi_token', 'akyuz_token', 'session_SITE_A', 'session_SITE_C', 'session_SITE_D', 'session_SITE_E'], r)
  );

  // SITE_A: Önceki aramada veri geldiyse Aktif, yoksa Pasif
  updateStatusIndicator('SITE_A',
    storageData.session_SITE_A ? 'success' : 'idle',
    storageData.session_SITE_A ? 'Aktif' : 'Pasif'
  );

  // SITE_B: Ender Yapı token'ı varsa Aktif
  updateStatusIndicator('SITE_B',
    storageData.enderyapi_token ? 'success' : 'idle',
    storageData.enderyapi_token ? 'Aktif' : 'Pasif'
  );

  // SITE_C: Önceki aramada veri geldiyse Aktif, yoksa Pasif
  updateStatusIndicator('SITE_C',
    storageData.session_SITE_C ? 'success' : 'idle',
    storageData.session_SITE_C ? 'Aktif' : 'Pasif'
  );

  // SITE_D: Önceki aramada veri geldiyse Aktif, yoksa Pasif
  updateStatusIndicator('SITE_D',
    storageData.session_SITE_D ? 'success' : 'idle',
    storageData.session_SITE_D ? 'Aktif' : 'Pasif'
  );

  // SITE_E: Akyüzler token'ı varsa veya önceki aramada veri geldiyse Aktif
  const isAkyuzActive = !!(storageData.akyuz_token || storageData.session_SITE_E);
  updateStatusIndicator('SITE_E',
    isAkyuzActive ? 'success' : 'idle',
    isAkyuzActive ? 'Aktif' : 'Pasif'
  );
}

// --- UZAKTAN GÜNCELLEME KONTROLÜ ---
async function checkUpdates() {
  try {
    const CURRENT_VERSION = chrome.runtime.getManifest().version;
    // Varsayılan update kontrol linki
    const updateCheckUrl = "https://raw.githubusercontent.com/alisanakbass/AYG-B2B/main/version.json";

    const response = await fetch(updateCheckUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP Hata: ${response.status}`);

    const data = await response.json();
    if (data && data.version) {
      if (compareVersions(CURRENT_VERSION, data.version) < 0) {
        const banner = document.getElementById('update-notification');
        if (banner) {
          banner.style.display = 'block';
        }
      }
    }
  } catch (error) {
    // Güncelleme kontrolü sırasında hata oluştu, sessizce geç
  }
}

function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const n1 = parts1[i] || 0;
    const n2 = parts2[i] || 0;
    if (n1 < n2) return -1;
    if (n1 > n2) return 1;
  }
  return 0;
}


// --- INITIALIZE ---
document.addEventListener('DOMContentLoaded', async () => {
  // Sürüm güncelleme kontrolünü çalıştır
  checkUpdates();

  // Döviz kurlarını güncel olarak çek
  await fetchExchangeRates();

  await loadSettings();
  await loadCart();
  await loadSalesHistory();
  setupUIEventListeners();
  await loadDefaultExcelIfEmpty();
  loadFiratStats();
  renderCart();
  renderReports();

  // Oturum durumlarını kontrol et
  checkAllSessions();

  // Eklenti açılır açılmaz ekli/işaretli siteleri açıp otomatik giriş yapacak
  chrome.runtime.sendMessage({ action: "login_all" }, () => {
    checkAllSessions();
  });

  // --- Resim Büyütme Önizleme Popup'ı ---
  const previewPopup = document.createElement('div');
  previewPopup.className = 'img-preview-popup';
  const previewImg = document.createElement('img');
  previewPopup.appendChild(previewImg);
  document.body.appendChild(previewPopup);

  let popupTimer = null;

  document.addEventListener('mouseover', (e) => {
    const wrapper = e.target.closest('.product-img-wrapper');
    if (!wrapper) return;
    const img = wrapper.querySelector('.product-img');
    if (!img || !img.src || img.style.display === 'none') return;

    clearTimeout(popupTimer);
    previewImg.src = img.src;

    const rect = wrapper.getBoundingClientRect();
    const popupW = 240;
    const popupH = 240;
    const margin = 10;

    let left = rect.right + margin;
    let top = rect.top + (rect.height / 2) - (popupH / 2);

    // Sağ kenara taşarsa sola aç
    if (left + popupW > window.innerWidth - margin) {
      left = rect.left - popupW - margin;
    }
    // Alt kenara taşarsa yukarı kaydır
    if (top + popupH > window.innerHeight - margin) {
      top = window.innerHeight - popupH - margin;
    }
    if (top < margin) top = margin;

    previewPopup.style.left = `${left}px`;
    previewPopup.style.top = `${top}px`;
    previewPopup.style.display = 'block';

    // Animasyon için 1 frame sonra visible class ekle
    requestAnimationFrame(() => {
      requestAnimationFrame(() => previewPopup.classList.add('visible'));
    });
  });

  document.addEventListener('mouseout', (e) => {
    const wrapper = e.target.closest('.product-img-wrapper');
    if (!wrapper) return;
    previewPopup.classList.remove('visible');
    popupTimer = setTimeout(() => {
      previewPopup.style.display = 'none';
    }, 200);
  });

  // Görsel yükleme hatalarını CSP uyumlu yakalayıp yer tutucu (placeholder) gösterme
  const resultsTable = document.getElementById('comparison-results');
  if (resultsTable) {
    resultsTable.addEventListener('error', (e) => {
      if (e.target && e.target.tagName === 'IMG' && e.target.classList.contains('product-img')) {
        e.target.style.display = 'none';
        const placeholder = e.target.nextElementSibling;
        if (placeholder) {
          placeholder.style.display = 'block';
        }
      }
    }, true); // capturing event listener
  }

  // Storage değişikliklerini izle
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      const keys = Object.keys(changes);
      const isPricingChange = keys.some(k => k.startsWith('margin_site_') || k.startsWith('discount_site_') || k === 'margin' || k === 'keywordDiscounts' || k === 'productDiscounts');
      if (isPricingChange) {
        loadSettings().then(() => {
          recalculateAllResults();
          renderCart();
        });
      }
    }
    if (area === 'local') {
      if (changes.cart) {
        currentCart = changes.cart.newValue || {};
        renderCart();
      }
      if (changes.enderyapi_token || changes.session_SITE_A || changes.session_SITE_C) {
        // Oturum durumları veya token değiştiğinde arayüzü güncelle
        checkAllSessions();
      }
    }
  });
});


// Ayarları Yükle
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({
      margin: 40,
      margin_site_a: 40,
      margin_site_a: 40,
      margin_site_b: 40,
      margin_site_c: 40,
      margin_site_d: 40,
      margin_site_e: 40,
      margin_site_f: 40,
      discount_site_a: 0,
      discount_site_b: 0,
      discount_site_c: 0,
      discount_site_d: 0,
      discount_site_e: 0,
      discount_site_f: 0,
      url_site_a: DEFAULT_URLS.url_site_a,
      url_site_b: DEFAULT_URLS.url_site_b,
      url_site_c: DEFAULT_URLS.url_site_c,
      url_site_d: DEFAULT_URLS.url_site_d,
      url_site_e: DEFAULT_URLS.url_site_e,
      productDiscounts: {},
      keywordDiscounts: [],
      cred_user_site_a: "info@aygunleryapi.com",
      cred_pass_site_a: "FZ0DT1YL*0OE",
      cred_user_site_b: "120 08 1401",
      cred_pass_site_b: "1401",
      cred_company_site_c: "12001451",
      cred_user_site_c: "1",
      cred_pass_site_c: "AYGUNLER",
      cred_user_site_d: "17183",
      cred_pass_site_d: "27f4e5d"
    }, (items) => {
      currentMargin = items.margin;
      siteMargins = {
        SITE_A: items.margin_site_a,
        SITE_B: items.margin_site_b,
        SITE_C: items.margin_site_c,
        SITE_D: items.margin_site_d,
        SITE_E: items.margin_site_e,
        SITE_F: items.margin_site_f
      };
      siteDiscounts = {
        SITE_A: items.discount_site_a,
        SITE_B: items.discount_site_b,
        SITE_C: items.discount_site_c,
        SITE_D: items.discount_site_d,
        SITE_E: items.discount_site_e,
        SITE_F: items.discount_site_f
      };
      currentProductDiscounts = items.productDiscounts || {};
      keywordDiscounts = items.keywordDiscounts || [];

      const modalMargin = document.getElementById('modal-margin');
      if (modalMargin) modalMargin.value = items.margin;

      ['a', 'b', 'c', 'd', 'e', 'f'].forEach(letter => {
        const key = `SITE_${letter.toUpperCase()}`;
        const mInput = document.getElementById(`margin-site-${letter}`);
        const dInput = document.getElementById(`discount-site-${letter}`);
        if (mInput) mInput.value = siteMargins[key];
        if (dInput) dInput.value = siteDiscounts[key];
      });

      const modalUrlA = document.getElementById('modal-url-site-a');
      const modalUrlB = document.getElementById('modal-url-site-b');
      const modalUrlC = document.getElementById('modal-url-site-c');
      const modalUrlD = document.getElementById('modal-url-site-d');
      const modalUrlE = document.getElementById('modal-url-site-e');
      if (modalUrlA) modalUrlA.value = items.url_site_a;
      if (modalUrlB) modalUrlB.value = items.url_site_b;
      if (modalUrlC) modalUrlC.value = items.url_site_c;
      if (modalUrlD) modalUrlD.value = items.url_site_d;
      if (modalUrlE) modalUrlE.value = items.url_site_e;

      // Giriş Bilgilerini Doldur
      const cUserA = document.getElementById('cred-user-site-a');
      const cPassA = document.getElementById('cred-pass-site-a');
      const cUserB = document.getElementById('cred-user-site-b');
      const cPassB = document.getElementById('cred-pass-site-b');
      const cCompC = document.getElementById('cred-company-site-c');
      const cUserC = document.getElementById('cred-user-site-c');
      const cPassC = document.getElementById('cred-pass-site-c');
      const cUserD = document.getElementById('cred-user-site-d');
      const cPassD = document.getElementById('cred-pass-site-d');

      if (cUserA) cUserA.value = items.cred_user_site_a || "info@aygunleryapi.com";
      if (cPassA) cPassA.value = items.cred_pass_site_a || "FZ0DT1YL*0OE";
      if (cUserB) cUserB.value = items.cred_user_site_b || "120 08 1401";
      if (cPassB) cPassB.value = items.cred_pass_site_b || "1401";
      if (cCompC) cCompC.value = items.cred_company_site_c || "12001451";
      if (cUserC) cUserC.value = items.cred_user_site_c || "1";
      if (cPassC) cPassC.value = items.cred_pass_site_c || "AYGUNLER";
      if (cUserD) cUserD.value = items.cred_user_site_d || "17183";
      if (cPassD) cPassD.value = items.cred_pass_site_d || "27f4e5d";

      renderKeywordDiscountRules();
      renderProductDiscountRules();

      resolve();
    });
  });
}

// Sepeti Yükle
async function loadCart() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ cart: {} }, (items) => {
      currentCart = items.cart;
      resolve();
    });
  });
}

// Satış Geçmişini Yükle
async function loadSalesHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ salesHistory: [] }, (items) => {
      salesHistory = items.salesHistory || [];
      resolve();
    });
  });
}

// UI Event Listeners Tanımlama
function setupUIEventListeners() {
  // Arama Tetikleyicileri
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');

  searchBtn.addEventListener('click', executeSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeSearch();
  });

  // Fiyat Hesaplama Anlık Güncelleme (Yedek)
  document.getElementById('modal-margin').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
      currentMargin = val;
      chrome.storage.sync.set({ margin: currentMargin });
    }
  });

  // Site Bazlı Kâr Marjı ve Genel İskonto Dinleyicileri
  ['a', 'b', 'c', 'd', 'e', 'f'].forEach(letter => {
    const key = `SITE_${letter.toUpperCase()}`;
    const mInput = document.getElementById(`margin-site-${letter}`);
    const dInput = document.getElementById(`discount-site-${letter}`);

    if (mInput) {
      mInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val >= 0) {
          siteMargins[key] = val;
          chrome.storage.sync.set({ [`margin_site_${letter}`]: val });
        }
      });
    }

    if (dInput) {
      dInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val >= 0 && val <= 100) {
          siteDiscounts[key] = val;
          chrome.storage.sync.set({ [`discount_site_${letter}`]: val });
        }
      });
    }
  });

  // URL Şablonlarını Kaydet
  document.getElementById('modal-save-urls-btn').addEventListener('click', () => {
    const urlA = document.getElementById('modal-url-site-a').value.trim();
    const urlB = document.getElementById('modal-url-site-b').value.trim();
    const urlC = document.getElementById('modal-url-site-c').value.trim();
    const urlD = document.getElementById('modal-url-site-d').value.trim();
    const urlE = document.getElementById('modal-url-site-e').value.trim();

    chrome.storage.sync.set({
      url_site_a: urlA,
      url_site_b: urlB,
      url_site_c: urlC,
      url_site_d: urlD,
      url_site_e: urlE
    }, () => {
      alert("URL şablonları başarıyla kaydedildi!");
      checkAllSessions();
    });
  });

  // URL Ayarlarını Sıfırla
  document.getElementById('modal-reset-urls-btn').addEventListener('click', () => {
    if (confirm("URL şablonlarını varsayılan B2B adreslerine sıfırlamak istiyor musunuz?")) {
      chrome.storage.sync.set(DEFAULT_URLS, () => {
        loadSettings();
        alert("URL şablonları başarıyla sıfırlandı!");
      });
    }
  });

  // Sıralama Değişimi
  document.getElementById('sort-select').addEventListener('change', applySorting);

  // Sepet Temizleme
  document.getElementById('clear-cart-btn').addEventListener('click', () => {
    if (confirm("Ortak sepetinizdeki tüm ürünleri temizlemek istiyor musunuz?")) {
      chrome.storage.local.set({ cart: {} }, () => {
        renderCart();
      });
    }
  });

  // Sepeti Onayla
  const confirmCartBtn = document.getElementById('confirm-cart-btn');
  if (confirmCartBtn) {
    confirmCartBtn.addEventListener('click', confirmCart);
  }

  // Sepet Ön İzleme Modalı Kapatma ve İptal Butonları
  const closeConfirmModalBtn = document.getElementById('close-confirm-modal-btn');
  const confirmModalCancelBtn = document.getElementById('confirm-modal-cancel-btn');
  const confirmModal = document.getElementById('cart-confirm-modal');

  const closeConfirmModal = () => {
    if (confirmModal) confirmModal.classList.remove('open');
  };

  if (closeConfirmModalBtn) closeConfirmModalBtn.addEventListener('click', closeConfirmModal);
  if (confirmModalCancelBtn) confirmModalCancelBtn.addEventListener('click', closeConfirmModal);
  if (confirmModal) {
    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) closeConfirmModal();
    });
  }

  // Nihai Satış Kaydetme Butonu (Modal İçi)
  const confirmModalSubmitBtn = document.getElementById('confirm-modal-submit-btn');
  if (confirmModalSubmitBtn) {
    confirmModalSubmitBtn.addEventListener('click', () => {
      const items = Object.values(currentCart);
      if (items.length === 0) return;

      let grandTotalNoVat = 0;
      let grandTotalWithVat = 0;
      let totalProfitNoVat = 0;
      let totalProfitWithVat = 0;

      items.forEach(item => {
        const purchaseNoVat = item.basePrice;
        const purchaseWithVat = item.basePrice * 1.20;

        const sourceKey = item.sourceKey || getSourceKeyFromDomain(item.domain);
        const discInfo = calculateTotalDiscountForProduct(item.name, item.key, sourceKey);

        const margin = siteMargins[sourceKey] !== undefined ? siteMargins[sourceKey] : currentMargin;
        const rawUnitPriceNoVat = calculateSellingPrice(item.basePrice, margin, false);
        const rawUnitPriceWithVat = calculateSellingPrice(item.basePrice, margin, true);

        const unitPriceNoVat = rawUnitPriceNoVat * (1 - discInfo.discount / 100);
        const unitPriceWithVat = rawUnitPriceWithVat * (1 - discInfo.discount / 100);

        const itemPackQty = item.packQuantity || 1;
        grandTotalNoVat += unitPriceNoVat * item.qty * itemPackQty;
        grandTotalWithVat += unitPriceWithVat * item.qty * itemPackQty;

        totalProfitNoVat += (unitPriceNoVat - purchaseNoVat) * item.qty * itemPackQty;
        totalProfitWithVat += (unitPriceWithVat - purchaseWithVat) * item.qty * itemPackQty;
      });

      const newSale = {
        id: 'sale_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        timestamp: Date.now(),
        totalSalesNoVat: grandTotalNoVat,
        totalSalesWithVat: grandTotalWithVat,
        totalProfitNoVat: totalProfitNoVat,
        totalProfitWithVat: totalProfitWithVat,
        items: items.map(i => ({ name: i.name, qty: i.qty, basePrice: i.basePrice, domain: i.domain }))
      };

      salesHistory.unshift(newSale);

      chrome.storage.local.set({ salesHistory: salesHistory, cart: {} }, () => {
        currentCart = {};
        renderCart();
        renderReports();
        closeConfirmModal();
        alert("Satış başarıyla onaylandı ve raporlara kaydedildi!");
      });
    });
  }

  // --- SAYFA GEÇİŞ KONTROLLERİ ---
  const navSearchBtn = document.getElementById('nav-search-btn');
  const navSettingsBtn = document.getElementById('nav-settings-btn');
  const pageSearch = document.getElementById('page-search');
  const pageSettings = document.getElementById('page-settings');

  if (navSearchBtn && navSettingsBtn && pageSearch && pageSettings) {
    navSearchBtn.addEventListener('click', () => {
      navSearchBtn.classList.add('active');
      navSettingsBtn.classList.remove('active');
      pageSearch.classList.add('active');
      pageSettings.classList.remove('active');
    });

    navSettingsBtn.addEventListener('click', () => {
      navSettingsBtn.classList.add('active');
      navSearchBtn.classList.remove('active');
      pageSearch.classList.remove('active');
      pageSettings.classList.add('active');
      renderReports();
      renderKeywordDiscountRules();
      renderProductDiscountRules();
    });
  }

  // --- TOPLU İSKONTO VE CHECKBOX GEÇİŞLERİ ---
  const selectAllCheckbox = document.getElementById('select-all-results');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const rowChecks = document.querySelectorAll('.select-product-check');
      rowChecks.forEach(cb => {
        cb.checked = isChecked;
      });
      updateBulkDiscountBarVisibility();
    });
  }

  const applyBulkDiscountBtn = document.getElementById('apply-bulk-discount-btn');
  if (applyBulkDiscountBtn) {
    applyBulkDiscountBtn.addEventListener('click', () => {
      const discountVal = parseFloat(document.getElementById('bulk-discount-val').value);
      if (isNaN(discountVal) || discountVal < 0 || discountVal > 100) {
        alert("Lütfen 0 ile 100 arasında geçerli bir iskonto oranı girin.");
        return;
      }

      const selectedChecks = document.querySelectorAll('.select-product-check:checked');
      if (selectedChecks.length === 0) {
        alert("Lütfen iskonto uygulamak istediğiniz ürünleri seçin.");
        return;
      }

      selectedChecks.forEach(cb => {
        const key = cb.getAttribute('data-key');
        const product = currentResults.find(p => p.key === key);
        if (product) {
          currentProductDiscounts[key] = {
            name: product.name,
            discount: discountVal,
            domain: product.domain
          };
        }
      });

      chrome.storage.sync.set({ productDiscounts: currentProductDiscounts }, () => {
        alert("Seçilen ürünlere kalıcı özel iskonto başarıyla uygulandı!");
        document.getElementById('bulk-discount-val').value = '';
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        reapplyAllDiscounts();
        renderProductDiscountRules();
      });
    });
  }

  // Tab Değişimi Kontrolleri (Settings Sayfası İçi)
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tabId = btn.getAttribute('data-tab');
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === tabId) {
          content.classList.add('active');
        }
      });
    });
  });



  // Yeni Kelime Bazlı İskonto Kuralı Ekle
  const addKeywordRuleBtn = document.getElementById('add-keyword-rule-btn');
  if (addKeywordRuleBtn) {
    addKeywordRuleBtn.addEventListener('click', () => {
      const kwInput = document.getElementById('new-keyword-rule');
      const discInput = document.getElementById('new-keyword-discount');
      const keyword = kwInput.value.trim();
      const discount = parseFloat(discInput.value);

      if (!keyword) {
        alert("Lütfen geçerli bir kelime girin (örn. BOSCH).");
        return;
      }
      if (isNaN(discount) || discount < 0 || discount > 100) {
        alert("Lütfen 0 ile 100 arasında geçerli bir iskonto oranı girin.");
        return;
      }

      const newRule = {
        id: 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        keyword: keyword,
        discount: discount
      };

      keywordDiscounts.push(newRule);
      chrome.storage.sync.set({ keywordDiscounts: keywordDiscounts }, () => {
        kwInput.value = '';
        discInput.value = '';
        renderKeywordDiscountRules();
        reapplyAllDiscounts();
        alert(`"${keyword}" kelimesi için %${discount} iskonto kuralı başarıyla eklendi!`);
      });
    });
  }

  // Rapor geçmişini temizle
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearSalesHistory);
  }

  // Manuel "Bağlan" butonları dinleyicileri
  const connectBtns = document.querySelectorAll('.connect-btn');
  connectBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const siteKey = btn.getAttribute('data-site');

      // Butonu yükleniyor durumuna getir
      btn.classList.add('connecting');
      const btnText = btn.querySelector('span');
      if (btnText) btnText.textContent = "Bağlanıyor...";

      updateStatusIndicator(siteKey, 'loading', 'Bağlanıyor...');

      // Arka plana giriş talebi gönder
      chrome.runtime.sendMessage({ action: "manual_login", siteKey: siteKey }, (response) => {
        // Butonu eski haline getir
        btn.classList.remove('connecting');
        if (btnText) btnText.textContent = "Bağlan";
        checkAllSessions();
      });
    });
  });

  // Giriş Bilgilerini Kaydetme Dinleyicisi
  const saveCredsBtn = document.getElementById('modal-save-creds-btn');
  if (saveCredsBtn) {
    saveCredsBtn.addEventListener('click', () => {
      const userA = document.getElementById('cred-user-site-a').value.trim();
      const passA = document.getElementById('cred-pass-site-a').value.trim();
      const userB = document.getElementById('cred-user-site-b').value.trim();
      const passB = document.getElementById('cred-pass-site-b').value.trim();
      const compC = document.getElementById('cred-company-site-c').value.trim();
      const userC = document.getElementById('cred-user-site-c').value.trim();
      const passC = document.getElementById('cred-pass-site-c').value.trim();
      const userD = document.getElementById('cred-user-site-d').value.trim();
      const passD = document.getElementById('cred-pass-site-d').value.trim();

      chrome.storage.sync.set({
        cred_user_site_a: userA,
        cred_pass_site_a: passA,
        cred_user_site_b: userB,
        cred_pass_site_b: passB,
        cred_company_site_c: compC,
        cred_user_site_c: userC,
        cred_pass_site_c: passC,
        cred_user_site_d: userD,
        cred_pass_site_d: passD
      }, () => {
        alert("B2B giriş bilgileri başarıyla kaydedildi!");
      });
    });
  }
}

// Domain üzerinden site anahtarını çözme yardımcısı (geriye dönük uyumluluk için)
function getSourceKeyFromDomain(domain) {
  if (!domain) return '';
  if (domain.includes('ozkaradeniz')) return 'SITE_A';
  if (domain.includes('enderyapi')) return 'SITE_B';
  if (domain.includes('yasarteknik') || domain.includes('yansis')) return 'SITE_C';
  if (domain.includes('polisankansai') || domain.includes('polisan')) return 'SITE_D';
  if (domain.includes('akyuztools') || domain.includes('akyuz')) return 'SITE_E';
  return '';
}

// Kelime ve site bazlı toplam iskontoyu hesapla
function calculateTotalDiscountForProduct(name, productKey, sourceKey) {
  // Eşleşen bir site anahtarı yoksa domain'den bul
  if (!sourceKey && currentResults) {
    const product = currentResults.find(p => p.key === productKey);
    if (product) {
      sourceKey = product.sourceKey;
    }
  }

  // 1. Ürün bazlı özel iskonto (Kalıcı)
  if (currentProductDiscounts && currentProductDiscounts[productKey]) {
    return {
      discount: currentProductDiscounts[productKey].discount,
      type: 'Özel'
    };
  }

  // 2. Kelime bazlı kalıcı iskonto
  let kwDiscount = 0;
  let matchedKeyword = '';
  keywordDiscounts.forEach(rule => {
    if (name.toLowerCase().includes(rule.keyword.toLowerCase())) {
      if (rule.discount > kwDiscount) {
        kwDiscount = rule.discount;
        matchedKeyword = rule.keyword;
      }
    }
  });

  if (kwDiscount > 0) {
    return {
      discount: kwDiscount,
      type: `Kural (${matchedKeyword})`
    };
  }

  // 3. Siteye özel genel iskonto (Fallback)
  const baseSiteDiscount = siteDiscounts[sourceKey] || 0;
  if (baseSiteDiscount > 0) {
    return {
      discount: baseSiteDiscount,
      type: 'Site Geneli'
    };
  }

  return {
    discount: 0,
    type: ''
  };
}

// --- ARAMA MOTORU MEKANİZMASI ---
async function executeSearch() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) {
    alert("Lütfen aramak istediğiniz ürünün adını veya kodunu girin.");
    return;
  }

  // Arama sıfırlama
  currentResults = [];
  imageFetchQueue = []; // Eski görsel arama kuyruğunu temizle
  const resultsContainer = document.getElementById('comparison-results');
  resultsContainer.innerHTML = `
    <tr>
      <td colspan="7" class="empty-state">
        <div class="empty-state-content">
          <div class="status-indicator loading">Veriler B2B Sitelerinden Çekiliyor...</div>
        </div>
      </td>
    </tr>
  `;
  document.getElementById('results-count').textContent = "Arama yapılıyor...";

  const activeSites = [];
  if (document.getElementById('site-a-check').checked) activeSites.push('SITE_A');
  else updateStatusIndicator('SITE_A', 'idle', 'Devre Dışı');

  if (document.getElementById('site-b-check').checked) activeSites.push('SITE_B');
  else updateStatusIndicator('SITE_B', 'idle', 'Devre Dışı');

  if (document.getElementById('site-c-check').checked) activeSites.push('SITE_C');
  else updateStatusIndicator('SITE_C', 'idle', 'Devre Dışı');

  if (document.getElementById('site-d-check').checked) activeSites.push('SITE_D');
  else updateStatusIndicator('SITE_D', 'idle', 'Devre Dışı');

  if (document.getElementById('site-e-check').checked) activeSites.push('SITE_E');
  else updateStatusIndicator('SITE_E', 'idle', 'Devre Dışı');

  if (document.getElementById('site-f-check').checked) activeSites.push('SITE_F');
  else updateStatusIndicator('SITE_F', 'idle', 'Devre Dışı');

  if (activeSites.length === 0) {
    resultsContainer.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <div class="empty-state-content">
            <p>Lütfen arama yapmak için en az bir B2B sitesi seçin.</p>
          </div>
        </td>
      </tr>
    `;
    document.getElementById('results-count').textContent = "Site seçilmedi.";
    return;
  }

  // Her sitenin aramasını başlat ve bitince anında sonuçları ekrana çiz
  activeSites.forEach(siteKey => {
    fetchFromB2B(siteKey, query)
      .catch(err => {
        console.error(`[B2B Portal] ${siteKey} arama hatası:`, err);
      })
      .finally(() => {
        // Hangi site biterse bitsin, o anki sonuçları ekrana çiz
        renderResults();
      });
  });
}

// Tek Bir B2B Sitesinden Veri Çekme
async function fetchFromB2B(siteKey, query) {
  updateStatusIndicator(siteKey, 'loading', 'Aranıyor...');

  if (siteKey === 'SITE_F') {
    return fetchFromLocalFirat(query);
  }

  // Şablon URL'i al
  const storageKey = `url_${siteKey.toLowerCase()}`;
  const settings = await new Promise(r => chrome.storage.sync.get(storageKey, r));
  const urlTemplate = settings[storageKey] || DEFAULT_URLS[storageKey];

  const searchUrl = urlTemplate.replace('{query}', encodeURIComponent(query));
  const domain = new URL(searchUrl).hostname;

  // --- ÖZKARADENİZ İNŞAAT (SITE_A) API SORGU YÖNTEMİ ---
  if (siteKey === 'SITE_A') {
    const origin = new URL(searchUrl).origin;
    const apiUrl = `${origin}/search/get_product_list`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json, text/plain, */*'
        },
        body: `type=product&parameter=${encodeURIComponent(query)}&search=&query_string=`
      });

      if (!response.ok) throw new Error(`HTTP Hata: ${response.status}`);

      const responseText = await response.text();

      let data = {};
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error("API yanıtı JSON formatında değil.");
      }

      const list = (data.data && data.data.list) || data.list || [];

      const config = PARSERS[siteKey];
      let itemsFoundCount = 0;

      list.forEach(jsonRow => {
        try {
          const name = jsonRow.c || 'Bilinmeyen Ürün';
          const code = jsonRow.b || jsonRow.b0 || '';

          let basePrice = NaN;
          if (jsonRow.j) {
            basePrice = parsePrice(jsonRow.j.toString());
          } else if (jsonRow.a1 && jsonRow.a1.TL && jsonRow.a1.TL.net_price_raw) {
            basePrice = jsonRow.a1.TL.net_price_raw;
          } else if (jsonRow.g) {
            basePrice = parsePrice(jsonRow.g.toString());
          }

          const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
          const key = `b2b_${domain.replace(/\./g, '_')}_${jsonRow.a || cleanName}`;

          let imgUrl = '';
          if (jsonRow.o && jsonRow.o.length > 0) {
            const val = jsonRow.o[0];
            const imgPath = val.a || '';
            const imgType = val.b;

            let baseUrl = 'https://d1y8qveuwztoxr.cloudfront.net/b2b_ozkaradeniz/'; // varsayılan (b == 1)
            if (imgType == 3) {
              baseUrl = 'https://b4b.ozkaradenizinsaat.com/upload/ext_image/';
            } else if (imgType == 2) {
              baseUrl = 'https://d1y8qveuwztoxr.cloudfront.net/_NAT/';
            }

            imgUrl = `${baseUrl}${imgPath}`;
          }

          if (!isNaN(basePrice) && basePrice > 0) {
            const parsedPackQty = parsePackQuantityFromName(name);
            currentResults.push({
              key,
              name,
              basePrice: basePrice,
              domain,
              imgUrl,
              sourceKey: siteKey,
              sourceName: config.name,
              badgeClass: config.badgeClass,
              unit: parsedPackQty ? 'PAKET' : 'ADET',
              packQuantity: parsedPackQty || 1
            });
            itemsFoundCount++;
          }
        } catch (err) {
          console.error(`Özkaradeniz satır çözme hatası:`, err);
        }
      });

      updateStatusIndicator(siteKey, 'success', `${itemsFoundCount} Ürün`);
      // Arama başarılı = site aktif
      if (itemsFoundCount > 0) updateSessionActive(siteKey);
    } catch (error) {
      console.error(`Özkaradeniz veri çekme hatası:`, error);
      if (error.message && error.message.includes('401')) {
        updateStatusIndicator(siteKey, 'error', 'Pasif');
      } else {
        updateStatusIndicator(siteKey, 'error', 'Hata Oluştu');
      }
    }
    return;
  }

  // --- ENDER YAPI (SITE_B) API SORGU YÖNTEMİ ---
  if (siteKey === 'SITE_B') {
    const storageData = await new Promise(r => chrome.storage.local.get('enderyapi_token', r));
    const token = storageData.enderyapi_token;

    if (!token) {
      updateStatusIndicator(siteKey, 'error', 'Giriş Gerekli');
      return;
    }

    const apiUrl = `https://b2bstore.com.tr:14500/services/product/get-product-search`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${token}`,
          'Browser-Web-Url': 'b2b.enderyapi.com.tr',
          'Languagecode': 'TR'
        },
        body: JSON.stringify({
          ConsumerPrice: false,
          DiscountSale: 0,
          MostSaled: 0,
          MostViewed: 0,
          NewProduct: 0,
          Pg: 1,
          ProductOfTheDay: 0,
          ProductOfTheWeek: 0,
          RunFlat: 0,
          Stock: 0,
          filterModel: { Filter: [], CategoryID: null, BrandID: null, SeasonID: null },
          keyword: query
        })
      });

      if (response.status === 401) {
        throw new Error("Yetkisendirme Hatası (Oturum Kapatılmış)");
      }
      if (!response.ok) throw new Error(`HTTP Hata: ${response.status}`);

      const responseText = await response.text();

      let data = {};
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error(`[B2B Portal] Ender Yapı API yanıtı JSON değil:`, responseText.substring(0, 200));
        throw new Error("API yanıtı JSON formatında değil.");
      }

      // Derinlemesine dizi arama fonksiyonu
      function findArrayDeep(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 3) return null;
        if (Array.isArray(obj)) return obj;
        for (const key of Object.keys(obj)) {
          if (Array.isArray(obj[key])) {
            return obj[key];
          }
        }
        for (const key of Object.keys(obj)) {
          if (obj[key] && typeof obj[key] === 'object') {
            const found = findArrayDeep(obj[key], depth + 1);
            if (found) return found;
          }
        }
        return null;
      }

      // Ender Yapı B2BStore list yapısı: data.Data.Hits.$values
      let list = [];
      if (data.Data && data.Data.Hits && data.Data.Hits.$values) {
        list = data.Data.Hits.$values;
      } else {
        list = findArrayDeep(data.Data) || findArrayDeep(data.data) || findArrayDeep(data) || [];
      }
      const config = PARSERS[siteKey];
      let itemsFoundCount = 0;

      list.forEach(jsonRow => {
        try {
          const details = jsonRow.ProductDetails || {};
          const name = details.ProductName || jsonRow.ProductName || jsonRow.Title || jsonRow.Name || 'Bilinmeyen Ürün';
          const code = details.ProductCode || jsonRow.ProductCode || jsonRow.Code || '';
          const id = jsonRow.ProductID || details.ProductID || jsonRow.Id || '';

          // Fiyat ayrıştırma
          let rawPrice = 0;

          // 1. ProductPrices içindeki fiyatları tara
          if (jsonRow.ProductPrices) {
            if (Array.isArray(jsonRow.ProductPrices)) {
              const pObj = jsonRow.ProductPrices[0] || {};
              rawPrice = pObj.Price || pObj.Value || pObj.NetPrice || 0;
            } else if (jsonRow.ProductPrices.$values && Array.isArray(jsonRow.ProductPrices.$values)) {
              const pObj = jsonRow.ProductPrices.$values[0] || {};
              rawPrice = pObj.Price || pObj.Value || pObj.NetPrice || 0;
            } else if (jsonRow.ProductPrices.Values && Array.isArray(jsonRow.ProductPrices.Values)) {
              const pObj = jsonRow.ProductPrices.Values[0] || {};
              rawPrice = pObj.Price || pObj.Value || pObj.NetPrice || 0;
            } else {
              rawPrice = jsonRow.ProductPrices.Price || jsonRow.ProductPrices.NetPrice || jsonRow.ProductPrices.PriceWithOrWithoutTax || 0;
            }
          }

          // 2. Doğrudan veya details altındaki fiyatları tara (Fallback)
          if (!rawPrice) {
            rawPrice = jsonRow.DiscountPrice || jsonRow.NetPrice || jsonRow.Price || jsonRow.B2BPrice ||
              details.DiscountPrice || details.NetPrice || details.Price || details.B2BPrice || 0;
          }

          let basePrice = typeof rawPrice === 'number' ? rawPrice : parsePrice(rawPrice.toString());
          const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
          const key = `b2b_${domain.replace(/\./g, '_')}_${id || code || cleanName}`;

          // Resim URL'i — boşlukları encode et
          let imgPath = (details.ImageUrl || jsonRow.DefaultImage || jsonRow.Image || jsonRow.ImageUrl || '').trim();
          let imgUrl = '';
          if (imgPath) {
            // Boşlukları %20 ile değiştir
            imgUrl = imgPath.split(' ').join('%20');
            if (!imgUrl.startsWith('http')) {
              imgUrl = `https://b2b.enderyapi.com.tr/${imgUrl.startsWith('/') ? imgUrl.substring(1) : imgUrl}`;
            }
          }

          // Birim Tespiti (Zenginleştirilmiş)
          let unit = '';
          const possibleUnits = [
            details.StockTypeName,
            jsonRow.StockTypeName,
            jsonRow.Unit,
            details.Unit,
            jsonRow.UnitName,
            details.UnitName,
            jsonRow.StockUnit,
            details.StockUnit,
            jsonRow.StockUnitName,
            details.StockUnitName
          ];

          // ProductPrices içindeki UnitName değerini de kontrol edelim
          if (jsonRow.ProductPrices) {
            let pricesList = [];
            if (Array.isArray(jsonRow.ProductPrices)) pricesList = jsonRow.ProductPrices;
            else if (jsonRow.ProductPrices.$values && Array.isArray(jsonRow.ProductPrices.$values)) pricesList = jsonRow.ProductPrices.$values;
            if (pricesList.length > 0 && pricesList[0].UnitName) {
              possibleUnits.push(pricesList[0].UnitName);
            }
          }

          for (const u of possibleUnits) {
            if (u && typeof u === 'string' && u.trim()) {
              unit = u.trim().toUpperCase();
              break;
            }
          }

          if (unit.includes('PAKET') || unit.includes('KOLİ') || unit.includes('KUTU') || unit.includes('DZ') || unit.includes('DÜZİNE') || unit.includes('SET') || unit.includes('TAKIM')) {
            unit = (unit.includes('DZ') || unit.includes('DÜZİNE')) ? 'DÜZİNE' :
              (unit.includes('KOLİ') ? 'KOLİ' :
                (unit.includes('KUTU') ? 'KUTU' : 'PAKET'));
          } else {
            unit = 'ADET';
          }

          // Paket İçi Adet Tespiti (Zenginleştirilmiş)
          let packQuantity = parsePackQuantityFromName(name);

          if (!packQuantity) {
            const possibleMultipliers = [
              details.Field1,
              jsonRow.Field1,
              jsonRow.SubUnitMultiplier,
              details.SubUnitMultiplier,
              jsonRow.BoxQuantity,
              details.BoxQuantity,
              jsonRow.PackQuantity,
              details.PackQuantity,
              jsonRow.Multiplier,
              details.Multiplier,
              jsonRow.OrderMultiplier,
              details.OrderMultiplier
            ];

            packQuantity = 1;
            for (const m of possibleMultipliers) {
              if (m !== undefined && m !== null) {
                const val = parseInt(m.toString().trim(), 10);
                if (!isNaN(val) && val >= 1) { // 1 ve üzeri kabul edilsin (özellikle 10 gibi değerler için)
                  packQuantity = val;
                  break;
                }
              }
            }

            // BoxInfo string parse fallback
            let boxInfo = (jsonRow.BoxInfo || details.BoxInfo || '').trim();
            if (boxInfo && packQuantity === 1) {
              const match = boxInfo.match(/(?:KOLİ|KOLI|PAKET|KUTU|DZ|DÜZİNE)\s*:\s*(\d+)/i);
              if (match) {
                packQuantity = parseInt(match[1], 10);
              } else {
                const numMatch = boxInfo.match(/(\d+)/);
                if (numMatch) packQuantity = parseInt(numMatch[1], 10);
              }
            }
          }

          if (!isNaN(basePrice) && basePrice > 0) {
            currentResults.push({
              key,
              name,
              basePrice: basePrice,
              domain,
              imgUrl,
              sourceKey: siteKey,
              sourceName: config.name,
              badgeClass: config.badgeClass,
              unit,
              packQuantity
            });
            itemsFoundCount++;
          }
        } catch (err) {
          console.error(`Ender Yapı satır çözme hatası:`, err);
        }
      });

      updateStatusIndicator(siteKey, 'success', `${itemsFoundCount} Ürün`);
      if (itemsFoundCount > 0) updateSessionActive(siteKey);
    } catch (error) {
      console.error(`Ender Yapı veri çekme hatası:`, error);
      if (error.message && (error.message.includes('Oturum') || error.message.includes('401'))) {
        updateStatusIndicator(siteKey, 'error', 'Pasif');
      } else {
        updateStatusIndicator(siteKey, 'error', 'Hata Oluştu');
      }
    }
    return;
  }

  // --- POLİSAN BAYİ (SITE_D) ENTEGRASYONU (API + FALLBACK HTML PARSER) ---
  if (siteKey === 'SITE_D') {
    const origin = new URL(searchUrl).origin;
    const config = PARSERS[siteKey];
    let itemsFoundCount = 0;

    try {
      // 1. Yerel hafızadan (cache) son başarılı kampanya kodunu yükle
      let activeCampaignCode = '';
      const storedData = await chrome.storage.local.get('polisanCampaignCode');
      if (storedData && storedData.polisanCampaignCode) {
        activeCampaignCode = storedData.polisanCampaignCode;
      }

      // 2. Açık olan Polisan sekmesini bulup içinden canlı verileri (token ve kampanya kodu) alıyoruz
      const allTabs = await new Promise((resolve) => {
        chrome.tabs.query({}, resolve);
      });
      const polisanTabs = allTabs.filter(t => t.url && t.url.includes('polisankansai.com'));

      let verificationToken = '';

      if (polisanTabs.length > 0) {
        const targetTab = polisanTabs[0];
        
        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          world: "MAIN",
          func: () => {
            let token = '';
            let campaign = '';

            try {
              // Token bul
              if (typeof mbis !== 'undefined' && mbis.requestVerificationToken) {
                token = mbis.requestVerificationToken;
              }
              if (!token) {
                const input = document.querySelector('input[name="__RequestVerificationToken"]');
                if (input) token = input.value;
              }

              // Kampanya kodunu bul (Tüm HTML'i tara)
              const htmlContent = document.documentElement.innerHTML;
              const kMatches = htmlContent.match(/\b(K\d{7})\b/g);
              if (kMatches && kMatches.length > 0) {
                campaign = kMatches[0];
              }

              // Knockout modelini kontrol et
              if (!campaign && typeof ko !== 'undefined') {
                const bindEl = document.querySelector('[data-bind*="campaign"]') || document.querySelector('[data-bind]');
                if (bindEl) {
                  const vm = ko.dataFor(bindEl);
                  if (vm) {
                    if (vm.campaignCode) campaign = ko.unwrap(vm.campaignCode);
                    else if (vm.activeCampaignCode) campaign = ko.unwrap(vm.activeCampaignCode);
                  }
                }
              }
            } catch (err) {
              // Hata durumunda sessizce yoksay
            }

            return { token, campaign };
          }
        });

        const res = results[0]?.result;
        if (res) {
          verificationToken = res.token;
          if (res.campaign) {
            activeCampaignCode = res.campaign;
            // Yeni bulunan kampanya kodunu hafızaya kaydet
            chrome.storage.local.set({ polisanCampaignCode: activeCampaignCode });
          }
        }
      }

      // 3. Eğer açık sekme yoksa veya veriler alınamadıysa, arka planda fetch ile almayı dene (Fallback)
      if (!verificationToken) {
        const pageRes = await fetch(`${origin}/order/makeordernew`, { credentials: 'include' });
        if (pageRes.ok) {
          const pageHtml = await pageRes.text();
          const tokenMatch = pageHtml.match(/mbis\.requestVerificationToken\s*=\s*["']([^"']+)["']/i);
          if (tokenMatch) verificationToken = tokenMatch[1];
          
          // Eğer hafızada da kod yoksa, html'den bulmaya çalış
          if (!activeCampaignCode) {
            const kMatch = pageHtml.match(/\b(K\d{7})\b/) || pageHtml.match(/value=["'](K\d{7})["']/i);
            if (kMatch) {
              activeCampaignCode = kMatch[1];
              chrome.storage.local.set({ polisanCampaignCode: activeCampaignCode });
            }
          }
        }
      }

      if (!verificationToken) throw new Error("Verification token bulunamadı (Oturum kapalı olabilir)");

      // 4. İsteği DOĞRUDAN PANELDEN (Sekme Açmadan) gönderiyoruz
      const apiUrl = `${origin}/api/Orders/SearchProductElastic`;

      // Kullanıcının belirttiği gibi payload yapısını kuruyoruz
      const searchPayload = {
        options: [],
        categoryCode: 0,
        prefix: query,
        hasStock: false,
        size: 100,
        pageIndex: 0,
        campaignCode: activeCampaignCode
      };

      const apiRes = await fetch(apiUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'requestVerificationToken': verificationToken,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(searchPayload)
      });

      if (!apiRes.ok) throw new Error(`API Hatası: ${apiRes.status}`);

      const data = await apiRes.json();
      const list = data.list || [];

      list.forEach(item => {
        const name = item.name || 'Bilinmeyen Ürün';
        const sku = item.sku || '';
        const basePrice = typeof item.price === 'number' ? item.price : parsePrice(item.price ? item.price.toString() : '');

        const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
        const key = `b2b_${domain.replace(/\./g, '_')}_${sku || cleanName}`;

        let imgUrl = item.pictureUrl || '';
        if (imgUrl && !imgUrl.startsWith('http')) {
          imgUrl = imgUrl.startsWith('/') ? `${origin}${imgUrl}` : `${origin}/${imgUrl}`;
        }

        let unit = (item.unit || item.unitName || item.measurementUnit || 'ADET').trim().toUpperCase();
        if (unit.includes('PAKET') || unit.includes('KOLİ') || unit.includes('KUTU')) {
          unit = unit.includes('PAKET') ? 'PAKET' : (unit.includes('KOLİ') ? 'KOLİ' : 'KUTU');
        } else {
          unit = 'ADET';
        }

        let packQuantity = parsePackQuantityFromName(name);
        if (!packQuantity) {
          packQuantity = 1;
          if (item.boxQty && item.boxQty > 1) {
            packQuantity = item.boxQty;
          } else if (item.boxQuantity && item.boxQuantity > 1) {
            packQuantity = item.boxQuantity;
          } else if (item.packQty && item.packQty > 1) {
            packQuantity = item.packQty;
          } else if (item.multiplier && item.multiplier > 1) {
            packQuantity = item.multiplier;
          }
        }

        if (!isNaN(basePrice) && basePrice > 0) {
          currentResults.push({
            key,
            name,
            basePrice,
            domain,
            imgUrl,
            sourceKey: siteKey,
            sourceName: config.name,
            badgeClass: config.badgeClass,
            unit,
            packQuantity
          });
          itemsFoundCount++;
        }
      });

      updateStatusIndicator(siteKey, 'success', `${itemsFoundCount} Ürün`);
      if (itemsFoundCount > 0) updateSessionActive(siteKey);
      return;

    } catch (apiError) {
      console.error(`[B2B Polisan] API Hatası nedeniyle HTML Fallback moduna geçiliyor:`, apiError);
    }

    // --- FALLBACK HTML PARSER YÖNTEMİ ---
    try {
      const response = await fetch(searchUrl, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) throw new Error(`HTTP Hata: ${response.status}`);
      const htmlText = await response.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');
      const rows = doc.querySelectorAll(config.rowSelector);

      rows.forEach(row => {
        try {
          const item = config.parseRow(row, domain);
          if (item && !isNaN(item.basePrice) && item.basePrice > 0) {
            currentResults.push({
              ...item,
              sourceKey: siteKey,
              sourceName: config.name,
              badgeClass: config.badgeClass
            });
            itemsFoundCount++;
          }
        } catch (err) {
          console.error(`Polisan Fallback satır okuma hatası:`, err);
        }
      });

      updateStatusIndicator(siteKey, 'success', `${itemsFoundCount} Ürün (HTML)`);
      if (itemsFoundCount > 0) updateSessionActive(siteKey);
    } catch (htmlError) {
      console.error(`Polisan Fallback veri çekme hatası:`, htmlError);
      updateStatusIndicator(siteKey, 'error', 'Hata Oluştu');
    }
    return;
  }

  // --- AKYÜZLER (SITE_E) API ENTEGRASYONU ---
  if (siteKey === 'SITE_E') {
    console.log("[B2B Akyüzler] Arama başlatıldı. Query:", query);
    const origin = new URL(searchUrl).origin;
    const config = PARSERS[siteKey];
    let itemsFoundCount = 0;

    try {
      const storageData = await new Promise(r => chrome.storage.local.get('akyuz_token', r));
      const token = storageData.akyuz_token;
      console.log("[B2B Akyüzler] Local storage'dan okunan token:", token ? "Mevcut (uzunluk: " + token.length + ")" : "Yok");

      const apiUrl = `${origin}/Search/SearchProduct`;
      const searchPayload = {
        dataCount: 0,
        manufacturer: null,
        vehicleBrand: null,
        vehicleModel: null,
        productGroup1: null,
        productGroup2: null,
        productGroup3: null,
        t9Text: query,
        campaign: false,
        newArrival: false,
        newProduct: false,
        comparsionProduct: false,
        onQuantity: false,
        onWay: false,
        image: false,
        isNewSearch: true
      };

      const headers = {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json, text/plain, */*'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      console.log("[B2B Akyüzler] Fetch isteği gönderiliyor...", { apiUrl, headers, searchPayload });

      const apiRes = await fetch(apiUrl, {
        method: 'POST',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify(searchPayload)
      });

      console.log("[B2B Akyüzler] Sunucudan yanıt geldi. Status:", apiRes.status, "OK:", apiRes.ok);

      if (!apiRes.ok) {
        const errText = await apiRes.text().catch(() => "");
        console.error("[B2B Akyüzler] Sunucu hata yanıtı içeriği:", errText);
        throw new Error(`API Hatası: ${apiRes.status}`);
      }

      const responseText = await apiRes.text();
      let list = [];
      try {
        list = JSON.parse(responseText) || [];
        console.log("[B2B Akyüzler] Gelen ürün adedi (JSON başarıyla ayrıştırıldı):", list.length);
      } catch (jsonError) {
        console.warn("[B2B Akyüzler] Yanıt JSON olarak ayrıştırılamadı. Oturum kapalı veya geçersiz veri olabilir. Yanıtın ilk 500 karakteri:", responseText.substring(0, 500));
        throw new Error('Oturumunuz Kapanmış Olabilir. Lütfen B2B Portalına Giriş Yapın.');
      }

      list.forEach((item, index) => {
        try {
          const name = item.Name || 'Bilinmeyen Ürün';
          const code = item.Code || '';

          // Akyüzler nihai müşteri fiyatını KDV dahil TL olarak PriceNetWithVatCustomerStr içinde gönderir.
          const rawPriceStr = (item.PriceNetWithVatCustomerStr || '').replace(/<[^>]*>/g, '').trim();
          const rawPrice = parsePrice(rawPriceStr);

          // VatRate (Akyüzler'den gelen KDV oranı, yoksa varsayılan 20)
          const vatRate = typeof item.VatRate === 'number' ? item.VatRate : 20;

          // KDV'siz net alış fiyatı
          const basePrice = rawPrice / (1 + vatRate / 100);

          if (index < 3) {
            console.log(`[B2B Akyüzler] Örnek Ürün #${index + 1}:`, { name, code, rawPriceStr, rawPrice, basePrice });
          }

          const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
          const key = `b2b_${domain.replace(/\./g, '_')}_${item.Id || code || cleanName}`;

          let imgUrl = item.PicturePath || '';
          if (imgUrl && !imgUrl.startsWith('http')) {
            if (imgUrl.includes('nophoto.png')) {
              imgUrl = '';
            } else {
              imgUrl = imgUrl.startsWith('/') ? `${origin}${imgUrl}` : `${origin}/${imgUrl}`;
            }
          }

          // Birim tespiti
          let unit = (item.Unit || 'ADET').trim().toUpperCase();
          if (unit.includes('PAKET') || unit.includes('KOLİ') || unit.includes('KUTU')) {
            unit = unit.includes('PAKET') ? 'PAKET' : (unit.includes('KOLİ') ? 'KOLİ' : 'KUTU');
          } else {
            unit = 'ADET';
          }

          // Paket içi adet
          let packQuantity = parsePackQuantityFromName(name);
          if (!packQuantity) {
            packQuantity = typeof item.QuantityInPackage === 'number' ? item.QuantityInPackage : 1;
          }

          if (!isNaN(basePrice) && basePrice > 0) {
            currentResults.push({
              key,
              name,
              basePrice,
              domain,
              imgUrl,
              sourceKey: siteKey,
              sourceName: config.name,
              badgeClass: config.badgeClass,
              unit,
              packQuantity
            });
            itemsFoundCount++;
          }
        } catch (err) {
          console.error(`[B2B Akyüzler] Satır işleme hatası (İndeks: ${index}):`, err);
        }
      });

      console.log("[B2B Akyüzler] Başarıyla sonuçlara eklenen ürün adedi:", itemsFoundCount);
      updateStatusIndicator(siteKey, 'success', `${itemsFoundCount} Ürün`);
      if (itemsFoundCount > 0) updateSessionActive(siteKey);
      return;
    } catch (apiError) {
      console.error(`[B2B Portal] Akyüzler API entegrasyon hatası:`, apiError);
      updateStatusIndicator(siteKey, 'error', 'Hata Oluştu');
      return;
    }
  }

  // --- YAŞAR TEKNİK (SITE_C) HTML YÖNTEMİ ---
  try {
    const response = await fetch(searchUrl, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    if (!response.ok) throw new Error(`HTTP Hata: ${response.status}`);

    const htmlText = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    const config = PARSERS[siteKey];
    const rows = doc.querySelectorAll(config.rowSelector);

    let itemsFoundCount = 0;

    rows.forEach(row => {
      try {
        const item = config.parseRow(row, domain);
        if (item && !isNaN(item.basePrice) && item.basePrice > 0) {
          const parsedPackQty = parsePackQuantityFromName(item.name);
          // Sonuçlara ekle
          currentResults.push({
            ...item,
            unit: parsedPackQty ? 'PAKET' : item.unit,
            packQuantity: parsedPackQty || item.packQuantity,
            basePrice: item.basePrice,
            sourceKey: siteKey,
            sourceName: config.name,
            badgeClass: config.badgeClass
          });
          itemsFoundCount++;
        }
      } catch (err) {
        console.error(`${config.name} satır okuma hatası:`, err);
      }
    });

    updateStatusIndicator(siteKey, 'success', `${itemsFoundCount} Ürün`);
    if (itemsFoundCount > 0) updateSessionActive(siteKey);
  } catch (error) {
    console.error(`${PARSERS[siteKey].name} veri çekme hatası:`, error);
    if (error.message && (error.message.includes('401') || error.message.includes('403') || error.message.includes('Login'))) {
      updateStatusIndicator(siteKey, 'error', 'Pasif');
    } else {
      updateStatusIndicator(siteKey, 'error', 'Hata Oluştu');
    }
  }
}


// Status Güncelleme
function updateStatusIndicator(siteKey, state, text) {
  // 'SITE_A' → 'a', 'SITE_B' → 'b', 'SITE_C' → 'c'
  const letter = siteKey.replace('SITE_', '').toLowerCase();
  const el = document.getElementById(`site-${letter}-status`);
  if (el) {
    el.className = `status-indicator ${state}`;
    el.textContent = text;
  }
}

// Arama başarılı olduğunda site durumunu Aktif olarak kaydet
function updateSessionActive(siteKey) {
  chrome.storage.local.set({ [`session_${siteKey}`]: true });
}

// Sonuçları Ekrana Çizme
function renderResults() {
  const container = document.getElementById('comparison-results');

  if (currentResults.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <div class="empty-state-content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <p>Aradığınız kriterlere uygun hiçbir ürün bulunamadı. Lütfen B2B sitelerine giriş yaptığınızdan emin olun.</p>
          </div>
        </td>
      </tr>
    `;
    document.getElementById('results-count').textContent = "Ürün bulunamadı.";
    return;
  }

  document.getElementById('results-count').textContent = `${currentResults.length} adet ürün listelendi.`;
  container.innerHTML = '';

  currentResults.forEach((product) => {
    // İskonto Oranı ve Kaynağı
    const discInfo = calculateTotalDiscountForProduct(product.name, product.key, product.sourceKey);

    // Alış Fiyatları (İskontosuz)
    const purchaseNoVat = product.basePrice;
    const purchaseWithVat = product.basePrice * 1.20;

    // Satış Fiyatları (Kâr marjı eklendikten sonra iskonto uygulanır)
    const margin = siteMargins[product.sourceKey] !== undefined ? siteMargins[product.sourceKey] : currentMargin;
    const rawSellingNoVat = calculateSellingPrice(product.basePrice, margin, false);
    const rawSellingWithVat = calculateSellingPrice(product.basePrice, margin, true);

    const sellingNoVat = rawSellingNoVat * (1 - discInfo.discount / 100);
    const sellingWithVat = rawSellingWithVat * (1 - discInfo.discount / 100);

    // Net Kâr
    const profitWithVat = sellingWithVat - purchaseWithVat;

    const discBadgeHtml = discInfo.discount > 0 ?
      `<div class="discount-badge-value">%${discInfo.discount}</div>
       <div class="discount-badge-type">${escapeHtml(discInfo.type)}</div>` :
      `<span style="color: var(--text-muted);">-</span>`;

    // Birim ve Paket Kırılımları
    const unit = (product.unit || 'ADET').toUpperCase();
    const packQuantity = product.packQuantity || 1;

    let unitBadgeHtml = '';
    if (packQuantity > 1) {
      unitBadgeHtml = `<span class="unit-badge-result" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; font-weight: 600; display: inline-block; margin-top: 4px;">${unit} (Pkt: ${packQuantity})</span>`;
    } else {
      unitBadgeHtml = `<span class="unit-badge-result" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(107, 114, 128, 0.1); color: #6b7280; font-weight: 500; display: inline-block; margin-top: 4px;">${unit}</span>`;
    }

    // Alış fiyatları HTML oluşturma
    let purchasePricesHtml = `
      <div class="price-main">
        <span class="price-label" style="font-weight: 600;">Adet KDV'li Alış:</span>
        <span style="font-weight: 700; color: var(--text);">${formatPrice(purchaseWithVat)}</span>
      </div>
      <div class="price-sub" style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
        <span class="price-label">Adet KDV'siz Alış:</span>
        <span>${formatPrice(purchaseNoVat)}</span>
      </div>
    `;

    // Satış fiyatları HTML oluşturma
    let sellingPricesHtml = `
      <div class="price-main" id="sell-price-with-vat-${product.key}">
        <span class="price-label" style="font-size: 11px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 2px;">Adet KDV'li Satış:</span>
        <span style="font-size: 16px; font-weight: 850; color: #ffffff; background: #ef4444; padding: 4px 8px; border-radius: 6px; display: inline-block; box-shadow: 0 2px 6px rgba(239, 68, 68, 0.3); font-family: 'Outfit', sans-serif;">${formatPrice(sellingWithVat)}</span>
      </div>
      <div class="price-sub" style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
        <span class="price-label">Adet KDV'siz Satış:</span>
        <span id="sell-price-no-vat-${product.key}" style="font-weight: 600; color: var(--text);">${formatPrice(sellingNoVat)}</span>
      </div>
      <div class="profit-group" style="margin-top: 4px; border-top: 1px dashed rgba(0,0,0,0.06); padding-top: 4px;">
        <div class="profit-main" style="font-size: 11px; color: #059669; font-weight: 700;">
          <span class="profit-label">Adet Kârı:</span>
          <span id="profit-with-vat-${product.key}">${formatPrice(profitWithVat)}</span>
        </div>
      </div>
    `;

    const tr = document.createElement('tr');
    tr.setAttribute('data-key', product.key);

    tr.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="select-product-check" data-key="${product.key}">
      </td>
      <td>
        <span class="source-badge ${product.badgeClass}">${product.sourceName}</span>
      </td>
      <td>
        <div class="product-cell-main">
          <div class="product-img-wrapper">
            ${product.imgUrl ?
        `<img src="${product.imgUrl}" class="product-img">
               <div class="product-img-placeholder" style="display:none;">📦</div>` :
        `<div class="product-img-placeholder">📦</div>`
      }
          </div>
          <div class="product-info-wrapper">
            <div class="product-name-cell">${escapeHtml(product.name)}</div>
            <span class="product-code">${product.domain}</span>
            <div>${unitBadgeHtml}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="price-vat-group" style="align-items: center; justify-content: center; text-align: center;">
          ${discBadgeHtml}
        </div>
      </td>
      <td>
        <div class="price-vat-group">
          ${purchasePricesHtml}
        </div>
      </td>
      <td>
        <div class="price-vat-group">
          ${sellingPricesHtml}
        </div>
      </td>
      <td>
        <div class="qty-action-wrapper">
          <input type="number" class="qty-input-table" id="qty-${product.key}" value="1" min="1">
          <button class="add-cart-btn-table primary-btn" data-key="${product.key}">Ekle</button>
        </div>
      </td>
    `;

    // Checkbox Değişim Dinleyicisi
    tr.querySelector('.select-product-check').addEventListener('change', updateBulkDiscountBarVisibility);

    // Sepete Ekle Butonu Dinleyicisi
    tr.querySelector('.add-cart-btn-table').addEventListener('click', (e) => {
      const key = e.target.getAttribute('data-key');
      const qtyInput = document.getElementById(`qty-${key}`);
      const qty = parseInt(qtyInput.value, 10);
      if (isNaN(qty) || qty <= 0) return;

      addToSharedCart(product, qty, e.target);
    });

    container.appendChild(tr);
  });

  // Seçim çubuğunu sıfırla/güncelle
  updateBulkDiscountBarVisibility();
}

// Hafızadaki Sonuçları Yeniden Hesaplama (Kâr Marjı / İskonto Değiştiğinde)
function recalculateAllResults() {
  if (currentResults.length === 0) return;

  currentResults.forEach((product) => {
    const discInfo = calculateTotalDiscountForProduct(product.name, product.key, product.sourceKey);

    const purchaseNoVat = product.basePrice;
    const purchaseWithVat = product.basePrice * 1.20;

    const margin = siteMargins[product.sourceKey] !== undefined ? siteMargins[product.sourceKey] : currentMargin;
    const rawSellingNoVat = calculateSellingPrice(product.basePrice, margin, false);
    const rawSellingWithVat = calculateSellingPrice(product.basePrice, margin, true);

    const sellingNoVat = rawSellingNoVat * (1 - discInfo.discount / 100);
    const sellingWithVat = rawSellingWithVat * (1 - discInfo.discount / 100);

    const profitWithVat = sellingWithVat - purchaseWithVat;

    const unit = (product.unit || 'ADET').toUpperCase();
    const packQuantity = product.packQuantity || 1;

    const sellPriceWithVatEl = document.getElementById(`sell-price-with-vat-${product.key}`);
    const sellPriceNoVatEl = document.getElementById(`sell-price-no-vat-${product.key}`);
    const profitWithVatEl = document.getElementById(`profit-with-vat-${product.key}`);

    if (sellPriceWithVatEl) {
      sellPriceWithVatEl.innerHTML = `
        <span class="price-label" style="font-size: 11px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 2px;">Adet KDV'li Satış:</span>
        <span style="font-size: 16px; font-weight: 850; color: #ffffff; background: #ef4444; padding: 4px 8px; border-radius: 6px; display: inline-block; box-shadow: 0 2px 6px rgba(239, 68, 68, 0.3); font-family: 'Outfit', sans-serif;">${formatPrice(sellingWithVat)}</span>
      `;
    }
    if (sellPriceNoVatEl) {
      sellPriceNoVatEl.textContent = formatPrice(sellingNoVat);
    }
    if (profitWithVatEl) {
      profitWithVatEl.textContent = formatPrice(profitWithVat);
    }
  });
}

// Sıralama ve Gruplama Uygulama
function applySorting() {
  const criteria = document.getElementById('sort-select').value;
  if (currentResults.length === 0) return;

  if (criteria === 'price-asc') {
    currentResults.sort((a, b) => a.basePrice - b.basePrice);
  } else if (criteria === 'price-desc') {
    currentResults.sort((a, b) => b.basePrice - a.basePrice);
  } else if (criteria === 'name-asc') {
    currentResults.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  } else if (criteria === 'source') {
    currentResults.sort((a, b) => a.sourceName.localeCompare(b.sourceName, 'tr'));
  }

  renderResults();
}

// --- ORTAK SEPET MEKANİZMASI ---
function addToSharedCart(product, addedQty, buttonEl) {
  chrome.storage.local.get({ cart: {} }, (result) => {
    const cart = result.cart;
    const newQty = (cart[product.key]?.qty || 0) + addedQty;

    cart[product.key] = {
      key: product.key,
      name: product.name,
      basePrice: product.basePrice,
      qty: newQty,
      domain: product.domain,
      sourceKey: product.sourceKey,
      unit: product.unit || 'ADET',
      packQuantity: product.packQuantity || 1
    };

    chrome.storage.local.set({ cart: cart }, () => {
      // Görsel Başarı Bildirimi
      if (buttonEl) {
        buttonEl.textContent = "Eklendi! ✓";
        buttonEl.classList.add('success');
        setTimeout(() => {
          buttonEl.textContent = "Ekle";
          buttonEl.classList.remove('success');
        }, 1200);
      }
    });
  });
}

// Sepeti Sidebar'a Çizme
function renderCart() {
  const container = document.getElementById('sidebar-cart-items');
  const items = Object.values(currentCart);

  // Miktar sayacı
  const totalItemsCount = items.reduce((sum, item) => sum + item.qty, 0);
  document.getElementById('cart-count').textContent = totalItemsCount;

  if (items.length === 0) {
    container.innerHTML = '<div class="cart-empty">Sepetiniz boş.</div>';
    document.getElementById('cart-grand-total-no-vat').textContent = "0,00 TL";
    document.getElementById('cart-grand-total-with-vat').textContent = "0,00 TL";
    document.getElementById('cart-total-profit-with-vat').textContent = "0,00 TL";
    return;
  }

  let grandTotalNoVat = 0;
  let grandTotalWithVat = 0;
  let totalProfitWithVat = 0;
  container.innerHTML = '';

  items.forEach(item => {
    const purchaseNoVat = item.basePrice;
    const purchaseWithVat = item.basePrice * 1.20;

    const sourceKey = item.sourceKey || getSourceKeyFromDomain(item.domain);
    // Ürünün güncel iskontosunu bul
    const discInfo = calculateTotalDiscountForProduct(item.name, item.key, sourceKey);

    const margin = siteMargins[sourceKey] !== undefined ? siteMargins[sourceKey] : currentMargin;
    const rawUnitPriceNoVat = calculateSellingPrice(item.basePrice, margin, false);
    const rawUnitPriceWithVat = calculateSellingPrice(item.basePrice, margin, true);

    const unitPriceNoVat = rawUnitPriceNoVat * (1 - discInfo.discount / 100);
    const unitPriceWithVat = rawUnitPriceWithVat * (1 - discInfo.discount / 100);

    const itemUnit = (item.unit || 'ADET').toUpperCase();
    const itemPackQty = item.packQuantity || 1;

    const itemTotalNoVat = unitPriceNoVat * item.qty * itemPackQty;
    const itemTotalWithVat = unitPriceWithVat * item.qty * itemPackQty;

    grandTotalNoVat += itemTotalNoVat;
    grandTotalWithVat += itemTotalWithVat;

    const itemProfitWithVat = (unitPriceWithVat - purchaseWithVat) * item.qty * itemPackQty;
    totalProfitWithVat += itemProfitWithVat;

    let qtyDisplay = `${item.qty} adet`;
    if (itemUnit !== 'ADET' && itemPackQty > 1) {
      qtyDisplay = `${item.qty} ${itemUnit.toLowerCase()} (${item.qty * itemPackQty} adet)`;
    } else if (itemUnit === 'ADET' && itemPackQty > 1) {
      qtyDisplay = `${item.qty} adet (Pkt: ${itemPackQty})`;
    } else if (itemUnit !== 'ADET') {
      qtyDisplay = `${item.qty} ${itemUnit.toLowerCase()}`;
    }

    const div = document.createElement('div');
    div.className = 'cart-item-row';

    const singleSellingWithVat = unitPriceWithVat;
    const singleSellingNoVat = unitPriceNoVat;
    const singlePurchaseWithVat = purchaseWithVat;
    const singlePurchaseNoVat = purchaseNoVat;
    const singleProfitWithVat = unitPriceWithVat - purchaseWithVat;

    div.innerHTML = `
      <div class="cart-item-info">
        <div class="cart-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <div class="cart-item-meta">
          <span class="cart-item-domain">${escapeHtml(item.domain.replace('www.', ''))}</span>
          <span class="unit-badge-cart" style="font-size: 9px; padding: 1px 4px; border-radius: 3px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; font-weight: 600;">${itemUnit}</span>
          <span style="font-weight: 500;">${qtyDisplay}</span>
        </div>
        <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 2px; font-size: 10px;">
          <div><span style="color: var(--text-muted);">Adet KDV'li Alış:</span> <span style="font-weight: 600;">${formatPrice(singlePurchaseWithVat)}</span></div>
          <div><span style="color: var(--text-muted);">Adet KDV'li Satış:</span> <span style="font-weight: 700; color: #ef4444; background: rgba(239, 68, 68, 0.05); padding: 1px 4px; border-radius: 3px;">${formatPrice(singleSellingWithVat)}</span></div>
          <div><span style="color: var(--text-muted);">Adet Kâr:</span> <span style="font-weight: 600; color: #059669;">${formatPrice(singleProfitWithVat)}</span></div>
        </div>
      </div>
      <div class="cart-item-right">
        <div class="price-vat-group">
          <div class="price-main" style="font-size: 12px; color: var(--text-muted);">Toplam KDV'li: <br><span style="font-size: 14px; font-weight: 700; color: var(--text);">${formatPrice(itemTotalWithVat)}</span></div>
          <div class="price-sub" style="font-size: 10px;">KDV'siz: ${formatPrice(itemTotalNoVat)}</div>
          <div class="profit-group">
            <div class="profit-main" style="font-size: 10px; color: #059669; font-weight: 600;">Toplam Kâr: ${formatPrice(itemProfitWithVat)}</div>
          </div>
        </div>
      </div>
      <button class="cart-item-delete" data-key="${item.key}">×</button>
    `;

    // Tekil Ürün Silme Dinleyicisi
    div.querySelector('.cart-item-delete').addEventListener('click', () => {
      deleteCartItem(item.key);
    });

    container.appendChild(div);
  });

  document.getElementById('cart-grand-total-no-vat').textContent = formatPrice(grandTotalNoVat);
  document.getElementById('cart-grand-total-with-vat').textContent = formatPrice(grandTotalWithVat);
  document.getElementById('cart-total-profit-with-vat').textContent = formatPrice(totalProfitWithVat);
}

// Sepetten Tekil Ürün Silme
function deleteCartItem(key) {
  chrome.storage.local.get({ cart: {} }, (result) => {
    const cart = result.cart;
    delete cart[key];
    chrome.storage.local.set({ cart: cart });
  });
}

// --- SEPET ONAYLAMA & RAPORLAMA MEKANİZMALARI ---

// Sepeti Onayla
function confirmCart() {
  const items = Object.values(currentCart);
  if (items.length === 0) {
    alert("Onaylanacak sepetinizde ürün bulunmamaktadır.");
    return;
  }

  const tbody = document.getElementById('confirm-modal-items-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  let grandTotalNoVat = 0;
  let grandTotalWithVat = 0;
  let totalProfitWithVat = 0;

  items.forEach(item => {
    const purchaseNoVat = item.basePrice;
    const purchaseWithVat = item.basePrice * 1.20;

    const sourceKey = item.sourceKey || getSourceKeyFromDomain(item.domain);
    const discInfo = calculateTotalDiscountForProduct(item.name, item.key, sourceKey);

    const margin = siteMargins[sourceKey] !== undefined ? siteMargins[sourceKey] : currentMargin;
    const rawUnitPriceNoVat = calculateSellingPrice(item.basePrice, margin, false);
    const rawUnitPriceWithVat = calculateSellingPrice(item.basePrice, margin, true);

    const unitPriceNoVat = rawUnitPriceNoVat * (1 - discInfo.discount / 100);
    const unitPriceWithVat = rawUnitPriceWithVat * (1 - discInfo.discount / 100);

    const itemUnit = (item.unit || 'ADET').toUpperCase();
    const itemPackQty = item.packQuantity || 1;

    const itemTotalNoVat = unitPriceNoVat * item.qty * itemPackQty;
    const itemTotalWithVat = unitPriceWithVat * item.qty * itemPackQty;

    grandTotalNoVat += itemTotalNoVat;
    grandTotalWithVat += itemTotalWithVat;

    const itemProfitWithVat = (unitPriceWithVat - purchaseWithVat) * item.qty * itemPackQty;
    totalProfitWithVat += itemProfitWithVat;

    let qtyDisplay = `${item.qty}`;
    if (itemUnit !== 'ADET' && itemPackQty > 1) {
      qtyDisplay = `${item.qty} ${itemUnit.toLowerCase()} <br><span style="font-size:9px; color:var(--text-muted); font-weight:normal;">(${item.qty * itemPackQty} ad)</span>`;
    } else if (itemUnit === 'ADET' && itemPackQty > 1) {
      qtyDisplay = `${item.qty} ad <br><span style="font-size:9px; color:var(--text-muted); font-weight:normal;">(Pkt: ${itemPackQty})</span>`;
    } else if (itemUnit !== 'ADET') {
      qtyDisplay = `${item.qty} ${itemUnit.toLowerCase()}`;
    }

    const singleSellingWithVat = unitPriceWithVat;
    const singleSellingNoVat = unitPriceNoVat;
    const singlePurchaseWithVat = purchaseWithVat;
    const singlePurchaseNoVat = purchaseNoVat;
    const singleProfitWithVat = unitPriceWithVat - purchaseWithVat;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 10px; text-align: left; font-weight: 500; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</td>
      <td style="padding: 10px; text-align: left; color: var(--text-muted); font-size: 11px;">
        ${escapeHtml(item.domain.replace('www.', ''))}
        <span style="font-size: 9px; display: block; padding: 1px 3px; border-radius: 3px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; font-weight: 600; width: fit-content; margin-top: 2px;">${itemUnit} (x${itemPackQty})</span>
      </td>
      <td style="padding: 10px; text-align: center; font-weight: 600; line-height: 1.2;">${qtyDisplay}</td>
      <td style="padding: 10px; text-align: right; font-size: 11px;">
        <div style="font-weight: 600;">KDV'li: ${formatPrice(singlePurchaseWithVat)}</div>
        <div style="color: var(--text-muted); font-size: 10px;">KDV'siz: ${formatPrice(singlePurchaseNoVat)}</div>
      </td>
      <td style="padding: 10px; text-align: right; font-size: 11px;">
        <div style="font-weight: 700; color: #ef4444;">KDV'li: ${formatPrice(singleSellingWithVat)}</div>
        <div style="color: var(--text-muted); font-size: 10px;">KDV'siz: ${formatPrice(singleSellingNoVat)}</div>
      </td>
      <td style="padding: 10px; text-align: right; font-weight: 600; font-size: 11px;">
        <div>${formatPrice(itemTotalWithVat)}</div>
        <span style="font-size: 9px; color: var(--text-muted); display: block; font-weight: normal;">KDV'siz: ${formatPrice(itemTotalNoVat)}</span>
      </td>
      <td style="padding: 10px; text-align: right; font-weight: 600; color: #059669; font-size: 11px;">
        <div>${formatPrice(itemProfitWithVat)}</div>
        <span style="font-size: 9px; color: var(--text-muted); display: block; font-weight: normal;">Adet Kâr: ${formatPrice(singleProfitWithVat)}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Toplamları modalda göster
  document.getElementById('confirm-modal-sales-no-vat').textContent = formatPrice(grandTotalNoVat);
  document.getElementById('confirm-modal-sales-with-vat').textContent = formatPrice(grandTotalWithVat);
  document.getElementById('confirm-modal-profit-with-vat').textContent = formatPrice(totalProfitWithVat);

  // Modalı aç
  const confirmModal = document.getElementById('cart-confirm-modal');
  if (confirmModal) {
    confirmModal.classList.add('open');
  }
}

// Raporları & Geçmişi Çiz
function renderReports() {
  const statsDailyProfitWithVatEl = document.getElementById('stats-daily-profit-with-vat');
  const statsMonthlyProfitWithVatEl = document.getElementById('stats-monthly-profit-with-vat');
  const statsTotalSalesWithVatEl = document.getElementById('stats-total-sales-with-vat');
  const statsTotalSalesNoVatEl = document.getElementById('stats-total-sales-no-vat');
  const salesHistoryRows = document.getElementById('sales-history-rows');

  if (!salesHistoryRows) return;

  const now = new Date();

  // Bugünün başlangıcı (Gece yarısı 00:00)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // Bu ayın başlangıcı (Ayın 1'i Gece yarısı 00:00)
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let todayProfitWithVat = 0;
  let monthlyProfitWithVat = 0;
  let totalSalesNoVat = 0;
  let totalSalesWithVat = 0;

  salesHistory.forEach(sale => {
    // Eski kayıtlar için fallback
    const saleSalesNoVat = sale.totalSalesNoVat !== undefined ? sale.totalSalesNoVat : sale.totalSales / 1.20;
    const saleSalesWithVat = sale.totalSalesWithVat !== undefined ? sale.totalSalesWithVat : sale.totalSales;
    const saleProfitWithVat = sale.totalProfitWithVat !== undefined ? sale.totalProfitWithVat : sale.totalProfit;

    totalSalesNoVat += saleSalesNoVat;
    totalSalesWithVat += saleSalesWithVat;

    if (sale.timestamp >= todayStart) {
      todayProfitWithVat += saleProfitWithVat;
    }
    if (sale.timestamp >= thisMonthStart) {
      monthlyProfitWithVat += saleProfitWithVat;
    }
  });

  if (statsDailyProfitWithVatEl) statsDailyProfitWithVatEl.textContent = formatPrice(todayProfitWithVat);
  if (statsMonthlyProfitWithVatEl) statsMonthlyProfitWithVatEl.textContent = formatPrice(monthlyProfitWithVat);
  if (statsTotalSalesWithVatEl) statsTotalSalesWithVatEl.textContent = "KDV'li: " + formatPrice(totalSalesWithVat);
  if (statsTotalSalesNoVatEl) statsTotalSalesNoVatEl.textContent = "KDV'siz: " + formatPrice(totalSalesNoVat);

  if (salesHistory.length === 0) {
    salesHistoryRows.innerHTML = `
      <tr>
        <td colspan="4" class="empty-history" style="text-align: center; color: var(--text-muted); padding: 15px; font-size: 13px;">Onaylanmış satış bulunmamaktadır.</td>
      </tr>
    `;
    return;
  }

  salesHistoryRows.innerHTML = '';
  salesHistory.forEach(sale => {
    const tr = document.createElement('tr');
    const dateStr = new Date(sale.timestamp).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const saleSalesNoVat = sale.totalSalesNoVat !== undefined ? sale.totalSalesNoVat : sale.totalSales / 1.20;
    const saleSalesWithVat = sale.totalSalesWithVat !== undefined ? sale.totalSalesWithVat : sale.totalSales;
    const saleProfitWithVat = sale.totalProfitWithVat !== undefined ? sale.totalProfitWithVat : sale.totalProfit;

    tr.innerHTML = `
      <td>${dateStr}</td>
      <td>
        <div>${formatPrice(saleSalesWithVat)}</div>
        <span class="history-sale-vat-detail">KDV'siz: ${formatPrice(saleSalesNoVat)}</span>
      </td>
      <td class="history-profit">
        <div>${formatPrice(saleProfitWithVat)}</div>
      </td>
      <td>
        <button class="delete-sale-btn" data-id="${sale.id}">Sil</button>
      </td>
    `;

    tr.querySelector('.delete-sale-btn').addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      deleteSaleRecord(id);
    });

    salesHistoryRows.appendChild(tr);
  });
}

// Tekil Satış Kaydını Sil
function deleteSaleRecord(saleId) {
  if (confirm("Bu satış kaydını silmek istediğinize emin misiniz?")) {
    salesHistory = salesHistory.filter(sale => sale.id !== saleId);
    chrome.storage.local.set({ salesHistory: salesHistory }, () => {
      renderReports();
    });
  }
}

// Tüm Satış Geçmişini Temizle
function clearSalesHistory() {
  if (confirm("Tüm satış geçmişini tamamen temizlemek istediğinize emin misiniz? Bu işlem geri alınamaz!")) {
    salesHistory = [];
    chrome.storage.local.set({ salesHistory: [] }, () => {
      renderReports();
      alert("Tüm satış geçmişi başarıyla temizlendi.");
    });
  }
}

// İskontoları Yeniden Uygula (Filtrelenmiş Ürünlere)
function reapplyAllDiscounts() {
  renderResults();
}

// Kelime Bazlı İskonto Kurallarını Tabloya Çiz
function renderKeywordDiscountRules() {
  const rowsContainer = document.getElementById('keyword-discount-rules-rows');
  if (!rowsContainer) return;

  if (keywordDiscounts.length === 0) {
    rowsContainer.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 8px;">Kayıtlı kelime bazlı iskonto bulunmuyor.</td>
      </tr>
    `;
    return;
  }

  rowsContainer.innerHTML = '';
  keywordDiscounts.forEach(rule => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600; text-align: left; padding: 8px 12px;">${escapeHtml(rule.keyword)}</td>
      <td style="color: var(--primary); font-weight: 700; text-align: left; padding: 8px 12px;">%${rule.discount}</td>
      <td style="text-align: left; padding: 8px 12px;">
        <button class="delete-rule-btn delete-sale-btn" data-id="${rule.id}">Sil</button>
      </td>
    `;

    tr.querySelector('.delete-rule-btn').addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      deleteKeywordDiscountRule(id);
    });

    rowsContainer.appendChild(tr);
  });
}

// Kelime Bazlı İskonto Kuralını Sil
function deleteKeywordDiscountRule(ruleId) {
  if (confirm("Bu kelime bazlı iskonto kuralını silmek istediğinize emin misiniz?")) {
    keywordDiscounts = keywordDiscounts.filter(rule => rule.id !== ruleId);
    chrome.storage.sync.set({ keywordDiscounts: keywordDiscounts }, () => {
      renderKeywordDiscountRules();
      reapplyAllDiscounts();
    });
  }
}

// Yardımcı HTML Escape Fonksiyonu
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Seçili ürünlere göre toplu iskonto barını gizle/göster
function updateBulkDiscountBarVisibility() {
  const selectedCount = document.querySelectorAll('.select-product-check:checked').length;
  const bulkBar = document.getElementById('bulk-discount-container');
  const countEl = document.getElementById('bulk-selected-count');

  if (bulkBar && countEl) {
    if (selectedCount > 0) {
      countEl.textContent = `${selectedCount} ürün seçildi`;
      bulkBar.style.display = 'block';
    } else {
      bulkBar.style.display = 'none';
      const selectAllCheckbox = document.getElementById('select-all-results');
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
    }
  }
}

// Ürün Bazlı Kalıcı İskonto Kurallarını Tabloya Çiz
function renderProductDiscountRules() {
  const rowsContainer = document.getElementById('product-discount-rules-rows');
  if (!rowsContainer) return;

  const items = Object.entries(currentProductDiscounts);
  if (items.length === 0) {
    rowsContainer.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 12px;">Özel tanımlanmış ürün iskontosu bulunmamaktadır.</td>
      </tr>
    `;
    return;
  }

  rowsContainer.innerHTML = '';
  items.forEach(([key, rule]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 500; text-align: left; padding: 8px 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;" title="${escapeHtml(rule.name)}">${escapeHtml(rule.name)}</td>
      <td style="color: var(--text-muted); text-align: left; padding: 8px 12px;">${escapeHtml(rule.domain || '')}</td>
      <td style="color: var(--primary); font-weight: 700; text-align: left; padding: 8px 12px;">%${rule.discount}</td>
      <td style="text-align: left; padding: 8px 12px;">
        <button class="delete-prod-rule-btn delete-sale-btn" data-key="${escapeHtml(key)}">Sil</button>
      </td>
    `;

    tr.querySelector('.delete-prod-rule-btn').addEventListener('click', (e) => {
      const pKey = e.target.getAttribute('data-key');
      deleteProductDiscountRule(pKey);
    });

    rowsContainer.appendChild(tr);
  });
}

// Ürün Bazlı Kalıcı İskonto Kuralını Sil
function deleteProductDiscountRule(productKey) {
  if (confirm("Bu ürüne özel tanımlanmış kalıcı iskontoyu silmek istediğinize emin misiniz?")) {
    delete currentProductDiscounts[productKey];
    chrome.storage.sync.set({ productDiscounts: currentProductDiscounts }, () => {
      renderProductDiscountRules();
      reapplyAllDiscounts();
    });
  }
}

// --- FIRAT BORU LOCAL DATABASE METHODS ---

// Fırat Boru istatistiklerini yükleyen fonksiyon
async function loadFiratStats() {
  chrome.storage.local.get(['firatBoruList', 'firatLastUpdate'], (res) => {
    const list = res.firatBoruList || [];
    const lastUpdate = res.firatLastUpdate || 'Veri Yok';

    const countEl = document.getElementById('firat-db-count');
    const dateEl = document.getElementById('firat-db-date');
    const statusEl = document.getElementById('site-f-status');

    if (countEl) countEl.textContent = list.length;
    if (dateEl) dateEl.textContent = lastUpdate;

    if (statusEl) {
      if (list.length > 0) {
        statusEl.className = 'status-indicator success';
        statusEl.textContent = `${list.length} Ürün`;
      } else {
        statusEl.className = 'status-indicator error';
        statusEl.textContent = 'Veri Yok';
      }
    }
  });
}

// Yerel Fırat Boru verilerinde arama yapan fonksiyon
async function fetchFromLocalFirat(query) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['firatBoruList'], (res) => {
      const list = res.firatBoruList || [];

      if (list.length === 0) {
        updateStatusIndicator('SITE_F', 'error', 'Veri Yok');
        resolve();
        return;
      }

      const queryLower = query.toLowerCase();
      const matches = list.filter(item => {
        const nameMatch = item.name && item.name.toLowerCase().includes(queryLower);
        const codeMatch = item.code && item.code.toLowerCase().includes(queryLower);
        return nameMatch || codeMatch;
      });

      const siteKey = 'SITE_F';
      const sourceName = 'Fırat Boru';
      const badgeClass = 'site_f';
      const domain = 'firatboru_excel';

      for (const item of matches) {
        const key = `b2b_local_firat_${item.code}`;

        // Arama sonuçlarına ekle
        currentResults.push({
          key,
          name: item.name,
          basePrice: item.price,
          domain,
          imgUrl: item.imgUrl || 'logo.png',
          sourceKey: siteKey,
          sourceName,
          badgeClass,
          unit: item.unit || 'ADET',
          packQuantity: item.packQuantity || 1,
          itemCode: item.code
        });
      }

      updateStatusIndicator('SITE_F', 'success', `${matches.length} Ürün`);
      resolve();
    });
  });
}

// --- EXCEL FILE UPLOADER FOR FIRAT BORU ---
document.addEventListener('DOMContentLoaded', () => {
  const excelInput = document.getElementById('firat-excel-input');
  const uploadBtn = document.getElementById('upload-excel-btn');
  const uploadStatus = document.getElementById('excel-upload-status');

  if (uploadBtn && excelInput) {
    uploadBtn.addEventListener('click', () => {
      excelInput.click();
    });
  }

  if (excelInput) {
    excelInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (uploadStatus) {
        uploadStatus.style.display = 'block';
        uploadStatus.style.background = 'rgba(59, 130, 246, 0.1)';
        uploadStatus.style.color = '#3b82f6';
        uploadStatus.textContent = 'Dosya okunuyor, lütfen bekleyin...';
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });

          // İlk sayfayı al
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          // Sayfayı JSON'a dönüştür
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          const parsedProducts = [];
          
          // Veriler 5. satırdan başlıyor (indeks 4)
          for (let i = 4; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 6) continue;

            // B sütunu: Mamul Kodu (index 1)
            // C sütunu: Ambalaj Türü (index 2)
            // D sütunu: Mamul Adı (index 3)
            // E sütunu: Birim (index 4)
            // F sütunu: Birim Fiyatı (index 5)
            const code = row[1] ? row[1].toString().trim() : '';
            const packaging = row[2] ? row[2].toString().trim() : '';
            const name = row[3] ? row[3].toString().trim() : '';
            const unitRaw = row[4] ? row[4].toString().trim() : 'Ad.';
            const priceRaw = row[5];

            // Kod veya isim yoksa boş satırdır, atla
            if (!code || !name) continue;

            // Fiyatı sayıya dönüştür
            let price = 0;
            if (typeof priceRaw === 'number') {
              price = priceRaw;
            } else if (priceRaw) {
              price = parsePrice(priceRaw.toString());
            }

            // Birim ve paket içi miktar tespiti
            let unit = 'ADET';
            let packQuantity = 1;

            if (unitRaw) {
              const uUpper = unitRaw.toUpperCase();
              if (uUpper.includes('PAKET') || uUpper.includes('PK') || uUpper.includes('BAG') || uUpper.includes('BAĞ')) {
                unit = 'PAKET';
              } else if (uUpper.includes('KOLİ') || uUpper.includes('KOLI')) {
                unit = 'KOLİ';
              } else if (uUpper.includes('KUTU')) {
                unit = 'KUTU';
              }
            }

            // Ambalaj türünden paket miktarını bulmaya çalış (Örn: "100 Çuval", "20 Bağ", "1 Adet")
            if (packaging) {
              const qtyMatch = packaging.match(/^(\d+)/);
              if (qtyMatch) {
                packQuantity = parseInt(qtyMatch[1], 10);
              }
            }

            parsedProducts.push({
              code,
              name: `${name} (${packaging || 'Adet'})`,
              price,
              unit,
              packQuantity,
              imgUrl: 'logo.png' // Varsayılan resim
            });
          }

          if (parsedProducts.length === 0) {
            throw new Error("Excel dosyasından geçerli bir ürün okunamadı. Lütfen formatı kontrol edin.");
          }

          // Tarih bilgisi oluştur
          const dateStr = new Date().toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          // chrome.storage.local'e kaydet
          chrome.storage.local.set({
            firatBoruList: parsedProducts,
            firatLastUpdate: dateStr
          }, () => {
            if (uploadStatus) {
              uploadStatus.style.background = 'rgba(16, 185, 129, 0.1)';
              uploadStatus.style.color = '#10b981';
              uploadStatus.textContent = `Başarılı! ${parsedProducts.length} ürün yüklendi.`;
            }
            loadFiratStats();
            alert(`Excel veritabanı başarıyla güncellendi!\nToplam ${parsedProducts.length} ürün sisteme yüklendi.`);
          });

        } catch (err) {
          console.error('[B2B Excel] Yükleme hatası:', err);
          if (uploadStatus) {
            uploadStatus.style.background = 'rgba(239, 68, 68, 0.1)';
            uploadStatus.style.color = '#ef4444';
            uploadStatus.textContent = `Hata: ${err.message}`;
          }
        }
      };

      reader.readAsArrayBuffer(file);
    });
  }
});

// Eklenti dizinindeki varsayılan Excel dosyasını otomatik yükleyen fonksiyon
async function loadDefaultExcelIfEmpty() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['firatBoruList'], async (res) => {
      if (res.firatBoruList && res.firatBoruList.length > 0) {
        // Zaten veri var, hiçbir şey yapma
        resolve();
        return;
      }

      console.log("[B2B Fırat] Yerel veritabanı boş, varsayılan Excel yükleniyor...");
      try {
        const fileUrl = chrome.runtime.getURL("ADANA 20 HAZİRAN 2026 BORU FİYAT LİSTESİ.xlsx");
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Varsayılan Excel dosyası yüklenemedi: ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const parsedProducts = [];

        // Veriler 5. satırdan başlıyor (indeks 4)
        for (let i = 4; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 6) continue;

          const code = row[1] ? row[1].toString().trim() : '';
          const packaging = row[2] ? row[2].toString().trim() : '';
          const name = row[3] ? row[3].toString().trim() : '';
          const unitRaw = row[4] ? row[4].toString().trim() : 'Ad.';
          const priceRaw = row[5];

          if (!code || !name) continue;

          let price = 0;
          if (typeof priceRaw === 'number') {
            price = priceRaw;
          } else if (priceRaw) {
            price = parsePrice(priceRaw.toString());
          }

          let unit = 'ADET';
          let packQuantity = 1;

          if (unitRaw) {
            const uUpper = unitRaw.toUpperCase();
            if (uUpper.includes('PAKET') || uUpper.includes('PK') || uUpper.includes('BAG') || uUpper.includes('BAĞ')) {
              unit = 'PAKET';
            } else if (uUpper.includes('KOLİ') || uUpper.includes('KOLI')) {
              unit = 'KOLİ';
            } else if (uUpper.includes('KUTU')) {
              unit = 'KUTU';
            }
          }

          if (packaging) {
            const qtyMatch = packaging.match(/^(\d+)/);
            if (qtyMatch) {
              packQuantity = parseInt(qtyMatch[1], 10);
            }
          }

          parsedProducts.push({
            code,
            name: `${name} (${packaging || 'Adet'})`,
            price,
            unit,
            packQuantity,
            imgUrl: 'logo.png'
          });
        }

        if (parsedProducts.length > 0) {
          chrome.storage.local.set({
            firatBoruList: parsedProducts,
            firatLastUpdate: "20 HAZİRAN 2026 (Varsayılan)"
          }, () => {
            console.log(`[B2B Fırat] Varsayılan Excel başarıyla yüklendi: ${parsedProducts.length} ürün.`);
            resolve();
          });
        } else {
          resolve();
        }
      } catch (err) {
        console.error("[B2B Fırat] Varsayılan Excel yükleme hatası:", err);
        resolve();
      }
    });
  });
}
