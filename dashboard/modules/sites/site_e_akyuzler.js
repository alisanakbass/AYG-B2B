import { state } from '../state.js';
import { parsePrice, parsePackQuantityFromName, extractVatRate } from '../utils.js';
import { updateStatusIndicator, updateSessionActive, getSearchUrl } from './base.js';

export const siteE = {
  key: 'SITE_E',
  name: "Akyüzler B2B",
  badgeClass: "site_e",
  rowSelector: null,
  parseRow: null,

  search: async function (query, isRetry = false) {
    const siteKey = 'SITE_E';
    updateStatusIndicator(siteKey, 'loading', isRetry ? 'Yeniden Deneniyor...' : 'Aranıyor...');

    let itemsFoundCount = 0;

    try {
      const searchUrl = await getSearchUrl(siteKey, query);
      const origin = new URL(searchUrl).origin;
      const domain = new URL(searchUrl).hostname;

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
          const vatRate = extractVatRate(item.VatRate) || extractVatRate(item.Vat) || 20;
          const purchaseWithVat = rawPrice > 0 ? rawPrice : 0;
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
              purchaseWithVat: purchaseWithVat || (basePrice * (1 + vatRate / 100)),
              domain,
              imgUrl,
              sourceKey: siteKey,
              sourceName: siteE.name,
              badgeClass: siteE.badgeClass,
              unit,
              packQuantity,
              vatRate: vatRate || 20
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
      console.warn(`[B2B Portal] Akyüzler API entegrasyon durumu (oturum kapalı olabilir):`, apiError.message || apiError);
      updateStatusIndicator(siteKey, 'error', 'Oturum Gerekli');
      return;
    }
  }
};

