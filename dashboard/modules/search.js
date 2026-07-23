import { state, DEFAULT_URLS } from './state.js';
import { parsePrice, formatPrice, parsePackQuantityFromName, calculateSellingPrice, getEffectiveMargin, extractImageUrl, getSourceKeyFromDomain, escapeHtml } from './utils.js';
import { calculateTotalDiscountForProduct } from './discounts.js';
import { addToSharedCart } from './cart.js';

let imageFetchQueue = [];

// --- DYNAMIC SELECTORS ---
export const PARSERS = {
  SITE_G: {
    name: "Nalburdayım",
    badgeClass: "site_g",
    rowSelector: null,
    parseRow: null
  },
  SITE_F: {
    name: "Fırat Boru",
    badgeClass: "site_f",
    rowSelector: null,
    parseRow: null
  },
  SITE_H: {
    name: "Kamil Türk B2B",
    badgeClass: "site_h",
    rowSelector: '.prbx-item',
    parseRow: (row, domain) => {
      const nameEl = row.querySelector('.prbx-ad');
      if (!nameEl) return null;
      const name = nameEl.textContent.trim();

      const priceBox = Array.from(row.querySelectorAll('.fiyat-box-item')).find(el => el.textContent.includes('Net Fiyat'));
      if (!priceBox) return null;
      
      const spans = priceBox.querySelectorAll('span');
      if (spans.length < 3) return null;
      const basePrice = parsePrice(spans[2].textContent);

      const codeId = nameEl.getAttribute('id') || '';
      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
      const key = `b2b_${domain.replace(/\./g, '_')}_${codeId || cleanName}`;

      let imgUrl = '';
      const imgEl = row.querySelector('.prbx-image img');
      if (imgEl) {
        imgUrl = imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '';
      }
      if (imgUrl && !imgUrl.startsWith('http')) {
        imgUrl = 'https://b2b.kamilturk.com' + (imgUrl.startsWith('/') ? '' : '/') + imgUrl;
      }

      return { key, name, basePrice, domain, imgUrl, unit: 'ADET', packQuantity: 1 };
    }
  },
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

      let basePrice = NaN;
      const uls = row.querySelectorAll('td ul');
      for (const ul of uls) {
        const lis = ul.querySelectorAll('li');
        for (const li of lis) {
          if (li.textContent.includes('KDV Hariç')) {
            const span = li.querySelector('span');
            const priceText = span ? span.textContent : li.textContent.replace('KDV Hariç:', '');
            basePrice = parsePrice(priceText);

            let currency = 'TRY';
            if (priceText.includes('$') || priceText.includes('USD') || priceText.includes('fa-usd') || priceText.includes('fa-dollar')) {
              currency = 'USD';
            } else if (priceText.includes('€') || priceText.includes('EUR') || priceText.includes('fa-eur') || priceText.includes('fa-euro')) {
              currency = 'EUR';
            }

            if (currency === 'USD') {
              basePrice = basePrice * state.exchangeRates.USD;
            } else if (currency === 'EUR') {
              basePrice = basePrice * state.exchangeRates.EUR;
            }
            break;
          }
        }
      }

      const inputEl = row.querySelector('input[type="number"]');
      let modelId = '';
      if (inputEl) {
        const modelAttr = inputEl.getAttribute('ng-model') || '';
        const match = modelAttr.match(/\[([^\]]+)\]/);
        modelId = match ? match[1].replace(/[^\w]/g, '_') : modelAttr.replace(/[^\w]/g, '_');
      }
      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
      const key = `b2b_${domain.replace(/\./g, '_')}_${modelId || cleanName}`;

      const imgUrl = extractImageUrl(row, 'img', domain);

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
          basePrice = basePrice * state.exchangeRates.USD;
        } else if (currency === 'EUR') {
          basePrice = basePrice * state.exchangeRates.EUR;
        }
      }

      const codeEl = row.querySelector('.code-id span');
      const codeId = codeEl ? codeEl.textContent.trim().replace(/\s+/g, '_') : '';
      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
      const key = `b2b_${domain.replace(/\./g, '_')}_${codeId || cleanName}`;

      const imgUrl = extractImageUrl(row, '.img-id img, img', domain);

      const unitEl = row.querySelector('.unit-id, .measure-unit, [data-title="Birim"], [data-title="Birim"] span');
      let unit = unitEl ? unitEl.textContent.trim().toUpperCase() : 'ADET';
      if (unit.includes('PAKET') || unit.includes('KOLİ') || unit.includes('KUTU') || unit.includes('DZ') || unit.includes('DÜZİNE') || unit.includes('SET') || unit.includes('TAKIM')) {
        unit = (unit.includes('DZ') || unit.includes('DÜZİNE')) ? 'DÜZİNE' :
          (unit.includes('KOLİ') ? 'KOLİ' :
            (unit.includes('KUTU') ? 'KUTU' : 'PAKET'));
      } else {
        unit = 'ADET';
      }

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
          basePrice = basePrice * state.exchangeRates.USD;
        } else if (currency === 'EUR') {
          basePrice = basePrice * state.exchangeRates.EUR;
        }
      }

      const codeId = row.id || '';
      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
      const key = `b2b_${domain.replace(/\./g, '_')}_${codeId || cleanName}`;

      const imgUrl = extractImageUrl(row, 'td img, img', domain);

      return { key, name, basePrice, domain, imgUrl, unit: 'ADET', packQuantity: 1 };
    }
  },
  SITE_D: {
    name: "Polisan Bayi",
    badgeClass: "site_d",
    rowSelector: 'div.col-md-3.col-sm-4',
    parseRow: (row, domain) => {
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
          basePrice = basePrice * state.exchangeRates.USD;
        } else if (currency === 'EUR') {
          basePrice = basePrice * state.exchangeRates.EUR;
        }
      }

      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
      const key = `b2b_${domain.replace(/\./g, '_')}_${codeId || cleanName}`;

      const imgUrl = extractImageUrl(row, 'img[data-bind*="pictureUrl"], img', domain);

      const unitEl = row.querySelector('[data-bind*="unit"], [data-bind*="unitName"]');
      let unit = unitEl ? unitEl.textContent.trim().toUpperCase() : 'ADET';

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
export async function checkAllSessions() {
  let storageData = {};
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      storageData = await new Promise(r =>
        chrome.storage.local.get(['enderyapi_token', 'akyuz_token', 'session_SITE_A', 'session_SITE_C', 'session_SITE_D', 'session_SITE_E', 'session_SITE_H'], r)
      ) || {};
    }
  } catch (err) {
    console.warn("[AYG B2B] chrome.storage erişilemedi, varsayılan kontrol uygulanıyor:", err);
  }

  updateStatusIndicator('SITE_A',
    storageData.session_SITE_A ? 'success' : 'idle',
    storageData.session_SITE_A ? 'Aktif' : 'Pasif'
  );

  updateStatusIndicator('SITE_B',
    storageData.enderyapi_token ? 'success' : 'idle',
    storageData.enderyapi_token ? 'Aktif' : 'Pasif'
  );

  updateStatusIndicator('SITE_C',
    storageData.session_SITE_C ? 'success' : 'idle',
    storageData.session_SITE_C ? 'Aktif' : 'Pasif'
  );

  updateStatusIndicator('SITE_D',
    storageData.session_SITE_D ? 'success' : 'idle',
    storageData.session_SITE_D ? 'Aktif' : 'Pasif'
  );

  const isAkyuzActive = !!(storageData.akyuz_token || storageData.session_SITE_E);
  updateStatusIndicator('SITE_E',
    isAkyuzActive ? 'success' : 'idle',
    isAkyuzActive ? 'Aktif' : 'Pasif'
  );

  updateStatusIndicator('SITE_G', 'success', 'Aktif');

  updateStatusIndicator('SITE_H',
    storageData.session_SITE_H ? 'success' : 'idle',
    storageData.session_SITE_H ? 'Aktif' : 'Pasif'
  );
}

// --- UZAKTAN GÜNCELLEME KONTROLÜ ---
export async function checkUpdates() {
  try {
    const CURRENT_VERSION = chrome.runtime.getManifest().version;
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

export function compareVersions(v1, v2) {
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

// Status Güncelleme
export function updateStatusIndicator(siteKey, stateName, text) {
  const letter = siteKey.replace('SITE_', '').toLowerCase();
  const el = document.getElementById(`site-${letter}-status`);
  if (el) {
    el.className = `status-indicator ${stateName}`;
    el.textContent = text;
  }
}

// Arama başarılı olduğunda site durumunu Aktif olarak kaydet
export function updateSessionActive(siteKey) {
  chrome.storage.local.set({ [`session_${siteKey}`]: true });
}

// --- ARAMA MOTORU MEKANİZMASI ---
export async function executeSearch() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) {
    alert("Lütfen aramak istediğiniz ürünün adını veya kodunu girin.");
    return;
  }

  state.currentResults = [];
  state.selectedFilterSite = 'ALL';
  imageFetchQueue = [];
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

  if (document.getElementById('site-g-check').checked) activeSites.push('SITE_G');
  else updateStatusIndicator('SITE_G', 'idle', 'Devre Dışı');

  if (document.getElementById('site-h-check').checked) activeSites.push('SITE_H');
  else updateStatusIndicator('SITE_H', 'idle', 'Devre Dışı');

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

  activeSites.forEach(siteKey => {
    fetchFromB2B(siteKey, query)
      .catch(err => {
        console.error(`[B2B Portal] ${siteKey} arama hatası:`, err);
      })
      .finally(() => {
        renderResults();
      });
  });
}

// Tek Bir B2B Sitesinden Veri Çekme
export async function fetchFromB2B(siteKey, query) {
  updateStatusIndicator(siteKey, 'loading', 'Aranıyor...');

  if (siteKey === 'SITE_F') {
    const { fetchFromLocalFirat } = await import('./excel.js');
    return fetchFromLocalFirat(query);
  }

  const storageKey = `url_${siteKey.toLowerCase()}`;
  const settings = await new Promise(r => chrome.storage.sync.get(storageKey, r));
  const urlTemplate = settings[storageKey] || DEFAULT_URLS[storageKey];

  let encodedQuery = encodeURIComponent(query);
  if (siteKey === 'SITE_G') {
    // Nalburdayım boşlukların '+' olarak kodlanmasını bekler
    encodedQuery = encodedQuery.replace(/%20/g, '+');
  }

  const searchUrl = urlTemplate.replace('{query}', encodedQuery);
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

            let baseUrl = 'https://d1y8qveuwztoxr.cloudfront.net/b2b_ozkaradeniz/';
            if (imgType == 3) {
              baseUrl = 'https://b4b.ozkaradenizinsaat.com/upload/ext_image/';
            } else if (imgType == 2) {
              baseUrl = 'https://d1y8qveuwztoxr.cloudfront.net/_NAT/';
            }

            imgUrl = `${baseUrl}${imgPath}`;
          }

          if (!isNaN(basePrice) && basePrice > 0) {
            const parsedPackQty = parsePackQuantityFromName(name);
            state.currentResults.push({
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

          let rawPrice = 0;

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

          if (!rawPrice) {
            rawPrice = jsonRow.DiscountPrice || jsonRow.NetPrice || jsonRow.Price || jsonRow.B2BPrice ||
              details.DiscountPrice || details.NetPrice || details.Price || details.B2BPrice || 0;
          }

          let basePrice = typeof rawPrice === 'number' ? rawPrice : parsePrice(rawPrice.toString());
          const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
          const key = `b2b_${domain.replace(/\./g, '_')}_${id || code || cleanName}`;

          let imgPath = (details.ImageUrl || jsonRow.DefaultImage || jsonRow.Image || jsonRow.ImageUrl || '').trim();
          let imgUrl = '';
          if (imgPath) {
            imgUrl = imgPath.split(' ').join('%20');
            if (!imgUrl.startsWith('http')) {
              imgUrl = `https://b2b.enderyapi.com.tr/${imgUrl.startsWith('/') ? imgUrl.substring(1) : imgUrl}`;
            }
          }

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
                if (val >= 1) {
                  packQuantity = val;
                  break;
                }
              }
            }

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
            state.currentResults.push({
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

  // --- POLİSAN BAYİ (SITE_D) ENTEGRASYONU ---
  if (siteKey === 'SITE_D') {
    const origin = new URL(searchUrl).origin;
    const config = PARSERS[siteKey];
    let itemsFoundCount = 0;

    try {
      let activeCampaignCode = '';
      const storedData = await chrome.storage.local.get('polisanCampaignCode');
      if (storedData && storedData.polisanCampaignCode) {
        activeCampaignCode = storedData.polisanCampaignCode;
      }

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
              if (typeof mbis !== 'undefined' && mbis.requestVerificationToken) {
                token = mbis.requestVerificationToken;
              }
              if (!token) {
                const input = document.querySelector('input[name="__RequestVerificationToken"]');
                if (input) token = input.value;
              }

              const htmlContent = document.documentElement.innerHTML;
              const kMatches = htmlContent.match(/\b(K\d{7})\b/g);
              if (kMatches && kMatches.length > 0) {
                campaign = kMatches[0];
              }

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
              // Yoksay
            }

            return { token, campaign };
          }
        });

        const res = results[0]?.result;
        if (res) {
          verificationToken = res.token;
          if (res.campaign) {
            activeCampaignCode = res.campaign;
            chrome.storage.local.set({ polisanCampaignCode: activeCampaignCode });
          }
        }
      }

      if (!verificationToken) {
        const pageRes = await fetch(`${origin}/order/makeordernew`, { credentials: 'include' });
        if (pageRes.ok) {
          const pageHtml = await pageRes.text();
          const tokenMatch = pageHtml.match(/mbis\.requestVerificationToken\s*=\s*["']([^"']+)["']/i);
          if (tokenMatch) verificationToken = tokenMatch[1];

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

      const apiUrl = `${origin}/api/Orders/SearchProductElastic`;
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
          state.currentResults.push({
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
            state.currentResults.push({
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
    const origin = new URL(searchUrl).origin;
    const config = PARSERS[siteKey];
    let itemsFoundCount = 0;

    try {
      const storageData = await new Promise(r => chrome.storage.local.get('akyuz_token', r));
      const token = storageData.akyuz_token;

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

      const apiRes = await fetch(apiUrl, {
        method: 'POST',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify(searchPayload)
      });

      if (!apiRes.ok) {
        throw new Error(`API Hatası: ${apiRes.status}`);
      }

      const responseText = await apiRes.text();
      let list = [];
      try {
        list = JSON.parse(responseText) || [];
      } catch (jsonError) {
        throw new Error('Oturumunuz Kapanmış Olabilir. Lütfen B2B Portalına Giriş Yapın.');
      }

      list.forEach((item, index) => {
        try {
          const name = item.Name || 'Bilinmeyen Ürün';
          const code = item.Code || '';

          const rawPriceStr = (item.PriceNetWithVatCustomerStr || '').replace(/<[^>]*>/g, '').trim();
          const rawPrice = parsePrice(rawPriceStr);
          const vatRate = typeof item.VatRate === 'number' ? item.VatRate : 20;
          const basePrice = rawPrice / (1 + vatRate / 100);

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

          let unit = (item.Unit || 'ADET').trim().toUpperCase();
          if (unit.includes('PAKET') || unit.includes('KOLİ') || unit.includes('KUTU')) {
            unit = unit.includes('PAKET') ? 'PAKET' : (unit.includes('KOLİ') ? 'KOLİ' : 'KUTU');
          } else {
            unit = 'ADET';
          }

          let packQuantity = parsePackQuantityFromName(name);
          if (!packQuantity) {
            packQuantity = typeof item.QuantityInPackage === 'number' ? item.QuantityInPackage : 1;
          }

          if (!isNaN(basePrice) && basePrice > 0) {
            state.currentResults.push({
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

      updateStatusIndicator(siteKey, 'success', `${itemsFoundCount} Ürün`);
      if (itemsFoundCount > 0) updateSessionActive(siteKey);
      return;
    } catch (apiError) {
      console.error(`[B2B Portal] Akyüzler API entegrasyon hatası:`, apiError);
      updateStatusIndicator(siteKey, 'error', 'Hata Oluştu');
      return;
    }
  }

  // --- NALBURDAYIM (SITE_G) API ENTEGRASYONU ---
  if (siteKey === 'SITE_G') {
    const config = PARSERS[siteKey];
    let itemsFoundCount = 0;
    try {
      const apiUrl = `https://api.aisearch.app/sites/2816/v1/search/query?query=${encodeURIComponent(query)}&expand=product%2Cfilter%2CpopularCategories%2Crecommendation&limit=30&attributes=&sort=&user_id=Nph4shd9r1RiNdAg&page=1&client-token=J4vJKeKUKIaNeLskrrFXXwnvqwk74QEp&lang=tr&d=www.nalburdayim.com`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*'
        }
      });

      if (!response.ok) throw new Error(`HTTP Hata: ${response.status}`);

      const data = await response.json();
      const products = data.products || [];

      products.forEach(p => {
        try {
          const name = p.name || 'Bilinmeyen Ürün';
          const rawPrice = parseFloat(p.price) || parseFloat(p.buying_price) || 0;
          const basePrice = rawPrice / 1.20; // KDV hariç taban fiyatı hesaplayalım.

          const codeId = p.id || p.sku || '';
          const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
          const key = `b2b_${domain.replace(/\./g, '_')}_${codeId || cleanName}`;

          let imgUrl = '';
          if (p.images && p.images.length > 0) {
            imgUrl = p.images[0];
          }

          if (basePrice > 0) {
            const parsedPackQty = parsePackQuantityFromName(name);
            state.currentResults.push({
              key,
              name,
              basePrice,
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
          console.error(`[B2B Nalburdayım] Satır işleme hatası:`, err);
        }
      });

      updateStatusIndicator(siteKey, 'success', `${itemsFoundCount} Ürün`);
      if (itemsFoundCount > 0) updateSessionActive(siteKey);
      return;
    } catch (apiError) {
      console.error(`[B2B Portal] Nalburdayım API entegrasyon hatası:`, apiError);
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

    console.log(`[B2B Fetch Debug] Site: ${siteKey}, URL: ${searchUrl}`);
    console.log(`[B2B Fetch Debug] HTML Uzunluğu: ${htmlText.length} karakter`);
    console.log(`[B2B Fetch Debug] Giriş formu şifre alanı var mı: ${!!doc.querySelector('input[type="password"]')}`);
    console.log(`[B2B Fetch Debug] Arama kutusu (#aranan) var mı: ${!!doc.getElementById('aranan')}`);
    console.log(`[B2B Fetch Debug] Sayfada 'prbx-item' sayısı: ${doc.querySelectorAll('.prbx-item').length}`);
    console.log(`[B2B Fetch Debug] Sayfada 'fiyat-box-item' sayısı: ${doc.querySelectorAll('.fiyat-box-item').length}`);
    console.log(`[B2B Fetch Debug] Sayfadaki tüm HTML içinde 'prbx' kelimesi geçiyor mu: ${htmlText.includes('prbx')}`);

    const config = PARSERS[siteKey];
    const rows = doc.querySelectorAll(config.rowSelector);

    let itemsFoundCount = 0;

    rows.forEach(row => {
      try {
        const item = config.parseRow(row, domain);
        if (item && !isNaN(item.basePrice) && item.basePrice > 0) {
          const parsedPackQty = parsePackQuantityFromName(item.name);
          state.currentResults.push({
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

// Dinamik filtre butonlarını çizen fonksiyon
export function renderFilterButtons() {
  const container = document.getElementById('site-filters-container');
  if (!container) return;

  if (state.currentResults.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  // Benzersiz kaynakları ve ürün adetlerini sayalım
  const counts = {};
  state.currentResults.forEach(p => {
    if (p.sourceKey) {
      counts[p.sourceKey] = (counts[p.sourceKey] || 0) + 1;
    }
  });

  const activeSourceKeys = Object.keys(counts);

  container.innerHTML = '';
  container.style.display = 'flex';

  // "Hepsi" butonu
  const allBtn = document.createElement('button');
  const isAllActive = !state.selectedFilterSite || state.selectedFilterSite === 'ALL';
  allBtn.className = `filter-btn ${isAllActive ? 'active' : ''}`;
  allBtn.innerHTML = `
    <span class="site-dot site_all"></span>
    Hepsi
    <span class="filter-count">${state.currentResults.length}</span>
  `;
  allBtn.addEventListener('click', () => {
    state.selectedFilterSite = 'ALL';
    renderResults();
  });
  container.appendChild(allBtn);

  // Her bir site için filtre butonu
  activeSourceKeys.forEach(siteKey => {
    const siteName = PARSERS[siteKey]?.name || siteKey;
    const isSiteActive = state.selectedFilterSite === siteKey;
    const btn = document.createElement('button');
    btn.className = `filter-btn ${isSiteActive ? 'active' : ''}`;
    const letter = siteKey.replace('SITE_', '').toLowerCase();
    btn.innerHTML = `
      <span class="site-dot site_${letter}"></span>
      ${siteName}
      <span class="filter-count">${counts[siteKey]}</span>
    `;
    btn.addEventListener('click', () => {
      state.selectedFilterSite = siteKey;
      renderResults();
    });
    container.appendChild(btn);
  });
}

// Sonuçları Ekrana Çizme
export function renderResults() {
  const container = document.getElementById('comparison-results');
  if (!container) return;

  // Dinamik filtre butonlarını çizelim
  renderFilterButtons();

  if (state.currentResults.length === 0) {
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

  // Filtreleme mantığı
  let filtered = state.currentResults;
  if (state.selectedFilterSite && state.selectedFilterSite !== 'ALL') {
    filtered = state.currentResults.filter(p => p.sourceKey === state.selectedFilterSite);
  }

  // Listelenen adet yazısı
  if (state.selectedFilterSite && state.selectedFilterSite !== 'ALL') {
    const siteName = PARSERS[state.selectedFilterSite]?.name || state.selectedFilterSite;
    document.getElementById('results-count').textContent = `${filtered.length} / ${state.currentResults.length} ürün listelendi (${siteName})`;
  } else {
    document.getElementById('results-count').textContent = `${state.currentResults.length} adet ürün listelendi.`;
  }

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <div class="empty-state-content">
            <p>Bu siteye ait filtrelenmiş ürün bulunamadı.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

// Sonuçlar Tablosu Olay Görevlendirmesi (Event Delegation - Bellek ve Performans İyileştirmesi)
let isResultsTableEventsBound = false;
function setupResultsTableDelegation(container) {
  if (isResultsTableEventsBound) return;
  isResultsTableEventsBound = true;

  container.addEventListener('change', (e) => {
    if (e.target.classList.contains('select-product-check')) {
      updateBulkDiscountBarVisibility();
    }
  });

  container.addEventListener('focusin', (e) => {
    if (e.target.classList.contains('qty-input-table')) {
      e.target.select();
    }
  });

  container.addEventListener('click', (e) => {
    const incBtn = e.target.closest('.inc-btn');
    if (incBtn) {
      const key = incBtn.getAttribute('data-key');
      const qtyInput = document.getElementById(`qty-${key}`);
      if (qtyInput) {
        let val = parseInt(qtyInput.value, 10);
        if (isNaN(val)) val = 1;
        qtyInput.value = val + 1;
      }
      return;
    }

    const decBtn = e.target.closest('.dec-btn');
    if (decBtn) {
      const key = decBtn.getAttribute('data-key');
      const qtyInput = document.getElementById(`qty-${key}`);
      if (qtyInput) {
        let val = parseInt(qtyInput.value, 10);
        if (isNaN(val)) val = 1;
        if (val > 1) qtyInput.value = val - 1;
      }
      return;
    }

    const addCartBtn = e.target.closest('.add-cart-btn-table');
    if (addCartBtn) {
      const key = addCartBtn.getAttribute('data-key');
      const product = state.currentResults.find(p => p.key === key);
      if (product) {
        const qtyInput = document.getElementById(`qty-${key}`);
        const qty = qtyInput ? parseInt(qtyInput.value, 10) : 1;
        if (!isNaN(qty) && qty > 0) {
          addToSharedCart(product, qty, addCartBtn);
        }
      }
      return;
    }
  });
}

  setupResultsTableDelegation(container);
  container.innerHTML = '';
  const fragment = document.createDocumentFragment();

  filtered.forEach((product) => {
    const discInfo = calculateTotalDiscountForProduct(product.name, product.key, product.sourceKey, product.basePrice);

    const purchaseNoVat = product.basePrice;
    const purchaseWithVat = product.basePrice * 1.20;

    const margin = getEffectiveMargin(product.basePrice, product.sourceKey);
    const rawSellingNoVat = calculateSellingPrice(product.basePrice, margin, false);
    const rawSellingWithVat = calculateSellingPrice(product.basePrice, margin, true);

    const sellingNoVat = rawSellingNoVat * (1 - discInfo.discount / 100);
    const sellingWithVat = rawSellingWithVat * (1 - discInfo.discount / 100);

    const profitWithVat = sellingWithVat - purchaseWithVat;

    const discBadgeHtml = discInfo.discount > 0 ?
      `<div class="discount-badge-value">%${discInfo.discount}</div>
       <div class="discount-badge-type">${escapeHtml(discInfo.type)}</div>` :
      `<span style="color: var(--text-muted);">-</span>`;

    const unit = (product.unit || 'ADET').toUpperCase();
    const packQuantity = product.packQuantity || 1;

    let unitBadgeHtml = '';
    if (packQuantity > 1) {
      unitBadgeHtml = `<span class="unit-badge-result" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; font-weight: 600; display: inline-block; margin-top: 4px;">${unit} (Pkt: ${packQuantity})</span>`;
    } else {
      unitBadgeHtml = `<span class="unit-badge-result" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(107, 114, 128, 0.1); color: #6b7280; font-weight: 500; display: inline-block; margin-top: 4px;">${unit}</span>`;
    }

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
        `<img src="${product.imgUrl}" class="product-img" data-code="${product.itemCode || ''}">
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
          <div class="stepper-container">
            <button class="stepper-btn dec-btn" data-key="${product.key}">−</button>
            <input type="number" class="qty-input-table" id="qty-${product.key}" value="1" min="1">
            <button class="stepper-btn inc-btn" data-key="${product.key}">+</button>
          </div>
          <button class="add-cart-btn-table primary-btn" data-key="${product.key}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            Ekle
          </button>
        </div>
      </td>
    `;

    fragment.appendChild(tr);
  });

  container.appendChild(fragment);
  updateBulkDiscountBarVisibility();
}

// Hafızadaki Sonuçları Yeniden Hesaplama
export function recalculateAllResults() {
  if (state.currentResults.length === 0) return;

  state.currentResults.forEach((product) => {
    const discInfo = calculateTotalDiscountForProduct(product.name, product.key, product.sourceKey);

    const purchaseNoVat = product.basePrice;
    const purchaseWithVat = product.basePrice * 1.20;

    const margin = getEffectiveMargin(product.basePrice, product.sourceKey);
    const rawSellingNoVat = calculateSellingPrice(product.basePrice, margin, false);
    const rawSellingWithVat = calculateSellingPrice(product.basePrice, margin, true);

    const sellingNoVat = rawSellingNoVat * (1 - discInfo.discount / 100);
    const sellingWithVat = rawSellingWithVat * (1 - discInfo.discount / 100);

    const profitWithVat = sellingWithVat - purchaseWithVat;

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
export function applySorting() {
  const criteria = document.getElementById('sort-select').value;
  if (state.currentResults.length === 0) return;

  if (criteria === 'price-asc') {
    state.currentResults.sort((a, b) => a.basePrice - b.basePrice);
  } else if (criteria === 'price-desc') {
    state.currentResults.sort((a, b) => b.basePrice - a.basePrice);
  } else if (criteria === 'name-asc') {
    state.currentResults.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  } else if (criteria === 'source') {
    state.currentResults.sort((a, b) => a.sourceName.localeCompare(b.sourceName, 'tr'));
  }

  renderResults();
}

// Toplu iskonto barı görünürlüğü
export function updateBulkDiscountBarVisibility() {
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
