import { state } from '../state.js';
import { parsePrice, parsePackQuantityFromName, extractVatRate, extractImageUrl } from '../utils.js';
import { updateStatusIndicator, updateSessionActive, getSearchUrl } from './base.js';

export const siteD = {
  key: 'SITE_D',
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

    const vatEl = row.querySelector('.taxprice-id, [data-title="KDV"], [data-title*="KDV"]');
    const vatRate = extractVatRate(vatEl?.textContent) || 20;

    return { key, name, basePrice, domain, imgUrl, unit, packQuantity, vatRate };
  },

  search: async function (query, isRetry = false) {
    const siteKey = 'SITE_D';
    updateStatusIndicator(siteKey, 'loading', isRetry ? 'Yeniden Deneniyor...' : 'Aranıyor...');

    const searchUrl = await getSearchUrl(siteKey, query);
    const domain = new URL(searchUrl).hostname;
    const origin = new URL(searchUrl).origin;
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

        let vatRate = extractVatRate(item.taxRate) ||
                      extractVatRate(item.vatRate) ||
                      extractVatRate(item.tax) ||
                      extractVatRate(item.kdv) || 20;

        if (!isNaN(basePrice) && basePrice > 0) {
          state.currentResults.push({
            key,
            name,
            basePrice,
            purchaseWithVat: basePrice * (1 + (vatRate / 100)),
            domain,
            imgUrl,
            sourceKey: siteKey,
            sourceName: siteD.name,
            badgeClass: siteD.badgeClass,
            unit,
            packQuantity,
            vatRate: vatRate || 20
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
      const rows = doc.querySelectorAll(siteD.rowSelector);

      rows.forEach(row => {
        try {
          const item = siteD.parseRow(row, domain);
          if (item && !isNaN(item.basePrice) && item.basePrice > 0) {
            state.currentResults.push({
              ...item,
              sourceKey: siteKey,
              sourceName: siteD.name,
              badgeClass: siteD.badgeClass
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
  }
};

