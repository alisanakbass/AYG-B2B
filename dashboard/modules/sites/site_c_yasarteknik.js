import { state } from '../state.js';
import { parsePrice, extractImageUrl } from '../utils.js';
import { fetchHtmlSite } from './base.js';

export const siteC = {
  key: 'SITE_C',
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

    return { key, name, basePrice, domain, imgUrl, unit: 'ADET', packQuantity: 1, vatRate: 20 };
  },

  search: async function (query, isRetry = false) {
    return fetchHtmlSite('SITE_C', query, siteC, isRetry);
  }
};

