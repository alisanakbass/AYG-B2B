import { state } from '../state.js';
import { parsePrice, parsePackQuantityFromName, extractVatRate, extractImageUrl } from '../utils.js';
import { updateStatusIndicator, updateSessionActive, getSearchUrl } from './base.js';

export const siteA = {
  key: 'SITE_A',
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
    const detailLink = row.querySelector('a[href*="/product/"], a[href*="/urun/"], a[href]');
    const productUrl = detailLink ? (detailLink.getAttribute('href').startsWith('http') ? detailLink.getAttribute('href') : `https://${domain}${detailLink.getAttribute('href')}`) : '';

    return { key, name, basePrice, domain, imgUrl, productUrl, unit: 'ADET', packQuantity: 1 };
  },

  search: async function (query, isRetry = false) {
    const siteKey = 'SITE_A';
    updateStatusIndicator(siteKey, 'loading', isRetry ? 'Yeniden Deneniyor...' : 'Aranıyor...');

    try {
      let searchUrl = await getSearchUrl(siteKey, query);
      if (searchUrl.includes('b4b.ozkaradenizinsaat.com')) {
        searchUrl = `https://b2b.ozkaradeniz.tr/products?q=${encodeURIComponent(query)}`;
      }
      const urlObj = new URL(searchUrl);
      const domain = urlObj.hostname;
      const origin = urlObj.origin;
      const apiUrl = `${origin}/api/v1/products/search?q=${encodeURIComponent(query)}`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json, text/plain, */*'
        }
      });

      if (response.status === 401 && !isRetry) {
        // Önce 30 günlük refresh token ile sessizce token yenile (rate-limit'e takılmaz)
        let refreshed = false;
        try {
          const refreshRes = await fetch(`${origin}/api/v1/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
          });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json().catch(() => ({}));
            if (refreshData && refreshData.success) refreshed = true;
          }
        } catch (e) { /* ignore */ }

        if (!refreshed && typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
          updateStatusIndicator(siteKey, 'loading', 'Giriş Yapılıyor...');
          await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: "manual_login", siteKey: siteKey }, resolve);
          });
        }
        return siteA.search(query, true);
      }

      if (!response.ok) throw new Error(`HTTP Hata: ${response.status}`);

      const responseText = await response.text();
      let data = {};
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error("API yanıtı JSON formatında değil.");
      }

      const list = Array.isArray(data.data) ? data.data : (data.list || []);
      let itemsFoundCount = 0;

      list.forEach(jsonRow => {
        try {
          const name = jsonRow.name || 'Bilinmeyen Ürün';
          const code = jsonRow.sku || jsonRow.id || '';
          const pricing = jsonRow.pricing || {};
          const vatRate = extractVatRate(pricing.vatRate ?? jsonRow.vatRate) || 20;

          let basePrice = NaN;
          let purchaseWithVat = 0;

          if (pricing.tl && pricing.tl.netPrice != null) {
            basePrice = Number(pricing.tl.netPrice);
            if (pricing.tl.netPriceWithVat != null) {
              purchaseWithVat = Number(pricing.tl.netPriceWithVat);
            }
          } else if (pricing.netPrice != null) {
            basePrice = Number(pricing.netPrice);
            if (pricing.netPriceWithVat != null) {
              purchaseWithVat = Number(pricing.netPriceWithVat);
            }
            const curr = (jsonRow.currency || 'TRY').toUpperCase();
            if (curr === 'USD' && state.exchangeRates.USD) {
              basePrice *= state.exchangeRates.USD;
              purchaseWithVat *= state.exchangeRates.USD;
            } else if (curr === 'EUR' && state.exchangeRates.EUR) {
              basePrice *= state.exchangeRates.EUR;
              purchaseWithVat *= state.exchangeRates.EUR;
            }
          } else if (jsonRow.price != null) {
            basePrice = Number(jsonRow.price);
          }

          if (!purchaseWithVat && basePrice > 0) {
            purchaseWithVat = basePrice * (1 + (vatRate / 100));
          }

          const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
          const key = `b2b_${domain.replace(/\./g, '_')}_${jsonRow.id || code || cleanName}`;

          const imgUrl = (jsonRow.image && (jsonRow.image.thumbUrl || jsonRow.image.detailUrl)) || '';
          const productUrl = code
            ? `${origin}/products/${encodeURIComponent(code)}`
            : `${origin}/products?q=${encodeURIComponent(name)}`;

          if (!isNaN(basePrice) && basePrice > 0) {
            const parsedPackQty = parsePackQuantityFromName(name);
            state.currentResults.push({
              key,
              name,
              itemCode: code,
              basePrice,
              purchaseWithVat,
              domain,
              imgUrl,
              productUrl,
              sourceKey: siteKey,
              sourceName: siteA.name,
              badgeClass: siteA.badgeClass,
              unit: parsedPackQty ? 'PAKET' : (jsonRow.unit ? jsonRow.unit.toUpperCase() : 'ADET'),
              packQuantity: parsedPackQty || 1,
              vatRate
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
  }
};

