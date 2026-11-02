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
      const searchUrl = await getSearchUrl(siteKey, query);
      const domain = new URL(searchUrl).hostname;
      const origin = new URL(searchUrl).origin;
      const apiUrl = `${origin}/search/get_product_list`;

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

          let vatRate = extractVatRate(jsonRow.i);
          let purchaseWithVat = 0;
          if (jsonRow.a1 && jsonRow.a1.TL) {
            const tl = jsonRow.a1.TL;
            vatRate = vatRate || extractVatRate(tl.tax_rate) || extractVatRate(tl.vat_rate) || extractVatRate(tl.kdv);
            if (tl.purchase_price_raw && Number(tl.purchase_price_raw) > 0) {
              purchaseWithVat = Number(tl.purchase_price_raw);
            }
            if (!vatRate && tl.purchase_price_raw && tl.net_price_raw && tl.net_price_raw > 0) {
              const calc = Math.round(((tl.purchase_price_raw / tl.net_price_raw) - 1) * 100);
              if (calc > 0 && calc <= 100) vatRate = calc;
            }
          }
          vatRate = vatRate || 20;
          if (!purchaseWithVat && basePrice > 0) {
            purchaseWithVat = basePrice * (1 + (vatRate / 100));
          }

          let productUrl = '';
          if (jsonRow.url) {
            productUrl = jsonRow.url.startsWith('http') ? jsonRow.url : `${origin}${jsonRow.url.startsWith('/') ? '' : '/'}${jsonRow.url}`;
          } else if (jsonRow.link) {
            productUrl = jsonRow.link.startsWith('http') ? jsonRow.link : `${origin}${jsonRow.link.startsWith('/') ? '' : '/'}${jsonRow.link}`;
          } else if (code) {
            productUrl = `${origin}/search/product/${encodeURIComponent(code)}`;
          } else if (name && name !== 'Bilinmeyen Ürün') {
            productUrl = `${origin}/search/product/${encodeURIComponent(name)}`;
          }

          if (!isNaN(basePrice) && basePrice > 0) {
            const parsedPackQty = parsePackQuantityFromName(name);
            state.currentResults.push({
              key,
              name,
              itemCode: code,
              basePrice: basePrice,
              purchaseWithVat,
              domain,
              imgUrl,
              productUrl,
              sourceKey: siteKey,
              sourceName: siteA.name,
              badgeClass: siteA.badgeClass,
              unit: parsedPackQty ? 'PAKET' : 'ADET',
              packQuantity: parsedPackQty || 1,
              vatRate: vatRate || 20
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

