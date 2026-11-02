import { state } from '../state.js';
import { parsePrice, parsePackQuantityFromName, extractVatRate, extractImageUrl } from '../utils.js';
import { updateStatusIndicator, updateSessionActive } from './base.js';

export const siteB = {
  key: 'SITE_B',
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

    const vatEl = row.querySelector('.taxprice-id, [data-title="KDV"], [data-title*="KDV"]');
    const vatRate = extractVatRate(vatEl?.textContent) || 20;

    return { key, name, basePrice, domain, imgUrl, unit, packQuantity, vatRate };
  },

  search: async function (query, isRetry = false) {
    const siteKey = 'SITE_B';
    updateStatusIndicator(siteKey, 'loading', isRetry ? 'Yeniden Deneniyor...' : 'Aranıyor...');

    const storageData = await new Promise(r => chrome.storage.local.get('enderyapi_token', r));
    const token = storageData.enderyapi_token;

    if (!token) {
      updateStatusIndicator(siteKey, 'error', 'Giriş Gerekli');
      return;
    }

    const apiUrl = `https://b2bstore.com.tr:14500/services/product/get-product-search`;
    const domain = 'b2b.enderyapi.com.tr';

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
        throw new Error("Yetkilendirme Hatası (Oturum Kapatılmış)");
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
      let itemsFoundCount = 0;

      list.forEach(jsonRow => {
        try {
          const details = jsonRow.ProductDetails || {};
          const name = details.ProductName || jsonRow.ProductName || jsonRow.Title || jsonRow.Name || 'Bilinmeyen Ürün';
          const code = details.ProductCode || jsonRow.ProductCode || jsonRow.Code || '';
          const id = jsonRow.ProductID || details.ProductID || jsonRow.Id || '';

          let rawPrice = 0;
          let vatRate = extractVatRate(details.TaxRatio) ||
                        extractVatRate(jsonRow.TaxRatio) ||
                        extractVatRate(details.Tax) ||
                        extractVatRate(jsonRow.Tax) || 20;

          if (jsonRow.ProductPrices) {
            let pObj = {};
            if (Array.isArray(jsonRow.ProductPrices)) {
              pObj = jsonRow.ProductPrices[0] || {};
              rawPrice = pObj.Price || pObj.Value || pObj.NetPrice || 0;
            } else if (jsonRow.ProductPrices.$values && Array.isArray(jsonRow.ProductPrices.$values)) {
              pObj = jsonRow.ProductPrices.$values[0] || {};
              rawPrice = pObj.Price || pObj.Value || pObj.NetPrice || 0;
            } else if (jsonRow.ProductPrices.Values && Array.isArray(jsonRow.ProductPrices.Values)) {
              pObj = jsonRow.ProductPrices.Values[0] || {};
              rawPrice = pObj.Price || pObj.Value || pObj.NetPrice || 0;
            } else {
              rawPrice = jsonRow.ProductPrices.Price || jsonRow.ProductPrices.NetPrice || jsonRow.ProductPrices.PriceWithOrWithoutTax || 0;
              pObj = jsonRow.ProductPrices;
            }
            if (pObj) {
              const pTax = extractVatRate(pObj.TaxRatio) || extractVatRate(pObj.Tax);
              if (pTax) vatRate = pTax;
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
              purchaseWithVat: basePrice * (1 + (vatRate / 100)),
              domain,
              imgUrl,
              sourceKey: siteKey,
              sourceName: siteB.name,
              badgeClass: siteB.badgeClass,
              unit,
              packQuantity,
              vatRate: vatRate || 20
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
  }
};

