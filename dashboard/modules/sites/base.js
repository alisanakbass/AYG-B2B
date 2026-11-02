import { state, DEFAULT_URLS } from '../state.js';
import { parsePackQuantityFromName } from '../utils.js';

export function updateStatusIndicator(siteKey, stateName, text) {
  const letter = siteKey.replace('SITE_', '').toLowerCase();
  const el = document.getElementById(`site-${letter}-status`);
  if (el) {
    el.className = `status-indicator ${stateName}`;
    el.textContent = text;
  }
}

export function updateSessionActive(siteKey) {
  const obj = {};
  obj[`session_${siteKey}`] = true;
  if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
    chrome.storage.local.set(obj);
  }
}

export async function getSearchUrl(siteKey, query) {
  const storageKey = `url_${siteKey.toLowerCase()}`;
  let urlTemplate = DEFAULT_URLS[storageKey];
  if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
    const settings = await new Promise(r => chrome.storage.sync.get(storageKey, r));
    if (settings && settings[storageKey]) {
      urlTemplate = settings[storageKey];
    }
  }
  const encodedQuery = encodeURIComponent(query);
  return urlTemplate.replace('{query}', encodedQuery);
}

export async function fetchHtmlSite(siteKey, query, config, isRetry = false) {
  updateStatusIndicator(siteKey, 'loading', isRetry ? 'Yeniden Deneniyor...' : 'Aranıyor...');
  try {
    const searchUrl = await getSearchUrl(siteKey, query);
    const domain = new URL(searchUrl).hostname;

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

    // Oturum Kapalı / Giriş Sayfası Tespiti (Tok Ticaret, Yaşar Teknik & Rico B2B)
    const isLoginPage = htmlText.includes('frmLogin') || 
                        htmlText.includes('Login.asp') || 
                        htmlText.includes('LoginForm') ||
                        htmlText.includes('Kullanici_Adi') ||
                        htmlText.includes('KullaniciAdiForm') || 
                        htmlText.includes('KullaniciKodu') ||
                        !!doc.querySelector('input[type="password"]');

    if (isLoginPage && (siteKey === 'SITE_I' || siteKey === 'SITE_C' || siteKey === 'SITE_K') && !isRetry) {
      console.log(`[B2B Portal] ${siteKey} (${config.name}) oturumu kapalı tespit edildi! Otomatik arka plan girişi yapılıyor...`);
      updateStatusIndicator(siteKey, 'loading', 'Giriş Yapılıyor...');

      if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
        await new Promise(resolve => {
          chrome.runtime.sendMessage({ action: "manual_login", siteKey: siteKey }, (res) => {
            resolve(res);
          });
        });
      }

      console.log(`[B2B Portal] ${siteKey} otomatik giriş tamamlandı, arama yeniden tetikleniyor...`);
      return fetchHtmlSite(siteKey, query, config, true);
    }

    const rows = doc.querySelectorAll(config.rowSelector);
    let itemsFoundCount = 0;

    rows.forEach(row => {
      try {
        const item = config.parseRow(row, domain);
        if (item && !isNaN(item.basePrice) && item.basePrice > 0) {
          const parsedPackQty = parsePackQuantityFromName(item.name);
          const finalPackQty = parsedPackQty || item.packQuantity || 1;
          const vatRate = item.vatRate || 20;
          const purchaseWithVat = item.purchaseWithVat || (item.basePrice * (1 + (vatRate / 100)));

          state.currentResults.push({
            ...item,
            unit: parsedPackQty ? 'PAKET' : (item.unit || 'ADET'),
            packQuantity: finalPackQty,
            basePrice: item.basePrice,
            purchaseWithVat,
            sourceKey: siteKey,
            sourceName: config.name,
            badgeClass: config.badgeClass,
            vatRate
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
    console.error(`${config.name} veri çekme hatası:`, error);
    if (error.message && (error.message.includes('401') || error.message.includes('403') || error.message.includes('Login'))) {
      updateStatusIndicator(siteKey, 'error', 'Pasif');
    } else {
      updateStatusIndicator(siteKey, 'error', 'Hata Oluştu');
    }
  }
}
