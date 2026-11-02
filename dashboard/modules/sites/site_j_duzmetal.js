import { state } from '../state.js';
import { parsePrice, parsePackQuantityFromName, extractVatRate } from '../utils.js';
import { updateStatusIndicator, updateSessionActive } from './base.js';

export const siteJ = {
  key: 'SITE_J',
  name: "Düz Metal",
  badgeClass: "site_j",
  rowSelector: null,
  parseRow: null,

  search: async function (query, isRetry = false) {
    const siteKey = 'SITE_J';
    updateStatusIndicator(siteKey, 'loading', isRetry ? 'Yeniden Deneniyor...' : 'Aranıyor...');

    const domain = 'b2b.duzmetal.com';
    let storageData = await new Promise(r => chrome.storage.local.get('duzmetal_token', r));
    let token = storageData.duzmetal_token;

    async function loginDuzMetal() {
      const syncData = await new Promise(r => chrome.storage.sync.get(['cred_company_site_j', 'cred_user_site_j', 'cred_pass_site_j'], r));
      const payload = {
        bayiKod: (syncData.cred_company_site_j || 'MA301').trim(),
        kullaniciAdi: (syncData.cred_user_site_j || 'AYGUNLER').trim(),
        sifre: (syncData.cred_pass_site_j || 'MA301').trim()
      };
      const res = await fetch('https://api.duzmetal.com/auth/giris', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data && data.status && data.data && data.data.Token) {
        await new Promise(r => chrome.storage.local.set({ duzmetal_token: data.data.Token, session_SITE_J: true }, r));
        return data.data.Token;
      }
      throw new Error(data.messages || 'Düz Metal giriş başarısız');
    }

    if (!token) {
      try {
        token = await loginDuzMetal();
      } catch (err) {
        console.warn('[B2B Portal] Düz Metal token alınamadı (oturum kapalı olabilir):', err.message || err);
        updateStatusIndicator(siteKey, 'error', 'Oturum Gerekli');
        return;
      }
    }

    const apiUrl = 'https://api.duzmetal.com/urun';
    const postBody = {
      kelime: query,
      sayfa: 1,
      isSayfa: false
    };

    try {
      let response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(postBody)
      });

      if (response.status === 401) {
        // Token süresi dolmuş olabilir, tekrar giriş yapıp dene
        token = await loginDuzMetal();
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(postBody)
        });
      }

      if (response.status === 404) {
        updateStatusIndicator(siteKey, 'idle', '0 Ürün');
        return;
      }

      if (!response.ok) throw new Error(`HTTP Hata: ${response.status}`);

      const data = await response.json();
      if (!data || !data.data) {
        updateStatusIndicator(siteKey, 'idle', '0 Ürün');
        return;
      }

      const list = data.data.veri || data.data.list || (Array.isArray(data.data) ? data.data : []);
      let itemsFoundCount = 0;

      list.forEach(item => {
        try {
          let name = 'Bilinmeyen Ürün';
          if (typeof item.o_baslik === 'string') {
            try {
              const bObj = JSON.parse(item.o_baslik);
              name = bObj.baslik || (bObj.dil_ceviri && bObj.dil_ceviri.tr) || item.o_baslik;
            } catch {
              name = item.o_baslik;
            }
          } else if (item.o_baslik && typeof item.o_baslik === 'object') {
            name = item.o_baslik.baslik || name;
          }

          const code = item.o_kod || '';
          const id = item.o_id || '';

          let rawPrice = 0;
          let currency = 'TRY';
          if (item.o_fiyat) {
            let fObj = item.o_fiyat;
            if (typeof fObj === 'string') {
              try { fObj = JSON.parse(fObj); } catch { fObj = {}; }
            }
            rawPrice = fObj.o_fiyat_birim_kdvsiz || fObj.o_fiyat_birim_yerel || fObj.o_fiyat_birim || 0;
            const curStr = fObj.o_fiyat_birim_kdvsiz_doviz || fObj.o_fiyat_birim_doviz || '';
            if (curStr.includes('$') || curStr.toUpperCase().includes('USD')) currency = 'USD';
            else if (curStr.includes('€') || curStr.toUpperCase().includes('EUR')) currency = 'EUR';
          }

          let vatRate = extractVatRate(item.o_kdv) || extractVatRate(item.o_kdv_oran);
          if (!vatRate && item.o_fiyat) {
            let fObj = item.o_fiyat;
            if (typeof fObj === 'string') {
              try { fObj = JSON.parse(fObj); } catch { fObj = {}; }
            }
            vatRate = extractVatRate(fObj.o_kdv) || extractVatRate(fObj.o_kdv_oran) || extractVatRate(fObj.kdv);
          }
          vatRate = vatRate || 20;

          let basePrice = typeof rawPrice === 'number' ? rawPrice : parsePrice(rawPrice.toString());
          let purchaseWithVat = 0;
          if (item.o_fiyat) {
            let fObj = item.o_fiyat;
            if (typeof fObj === 'string') {
              try { fObj = JSON.parse(fObj); } catch { fObj = {}; }
            }
            if (fObj.o_fiyat_birim && fObj.o_fiyat_birim > 0 && fObj.o_fiyat_birim_kdvsiz) {
              purchaseWithVat = fObj.o_fiyat_birim_yerel || fObj.o_fiyat_birim;
            }
          }

          if (currency === 'USD') {
            basePrice = basePrice * state.exchangeRates.USD;
            if (purchaseWithVat > 0) purchaseWithVat = purchaseWithVat * state.exchangeRates.USD;
          } else if (currency === 'EUR') {
            basePrice = basePrice * state.exchangeRates.EUR;
            if (purchaseWithVat > 0) purchaseWithVat = purchaseWithVat * state.exchangeRates.EUR;
          }
          if (!purchaseWithVat && basePrice > 0) {
            purchaseWithVat = basePrice * (1 + (vatRate / 100));
          }

          let imgUrl = '';
          if (item.o_resim_list) {
            let rList = item.o_resim_list;
            if (typeof rList === 'string') {
              try { rList = JSON.parse(rList); } catch { rList = []; }
            }
            if (Array.isArray(rList) && rList.length > 0) {
              imgUrl = rList[0].url || '';
            }
          }

          let unit = 'ADET';
          if (item.o_birim) {
            let birimObj = item.o_birim;
            if (typeof birimObj === 'string') {
              try { birimObj = JSON.parse(birimObj); } catch { birimObj = {}; }
            }
            if (birimObj.baslik) unit = birimObj.baslik.toUpperCase();
          }

          let packQuantity = item.o_koli_ici || parsePackQuantityFromName(name) || 1;

          const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
          const key = `b2b_duzmetal_${id || code || cleanName}`;

          if (!isNaN(basePrice) && basePrice > 0) {
            state.currentResults.push({
              key,
              name,
              basePrice,
              purchaseWithVat,
              domain,
              imgUrl,
              sourceKey: siteKey,
              sourceName: siteJ.name,
              badgeClass: siteJ.badgeClass,
              unit,
              packQuantity,
              vatRate: vatRate || 20
            });
            itemsFoundCount++;
          }
        } catch (itemErr) {
          console.error('[Düz Metal] Ürün satırı çözme hatası:', itemErr);
        }
      });

      updateStatusIndicator(siteKey, 'success', `${itemsFoundCount} Ürün`);
      if (itemsFoundCount > 0) updateSessionActive(siteKey);
    } catch (error) {
      console.error(`[B2B Portal] Düz Metal arama hatası:`, error);
      if (error.message && error.message.includes('401')) {
        updateStatusIndicator(siteKey, 'error', 'Pasif');
      } else {
        updateStatusIndicator(siteKey, 'error', 'Hata Oluştu');
      }
    }
  }
};

