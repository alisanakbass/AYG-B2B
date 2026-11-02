import { state } from '../state.js';
import { parsePrice, parsePackQuantityFromName, extractVatRate } from '../utils.js';
import { fetchHtmlSite } from './base.js';

export const siteI = {
  key: 'SITE_I',
  name: "Tok Ticaret",
  badgeClass: "site_i",
  rowSelector: 'tr[id]',

  parseRow: (row, domain) => {
    const tds = row.querySelectorAll('td');
    if (tds.length < 7) return null;

    const code = tds[1]?.textContent?.trim() || '';
    const name = tds[2]?.textContent?.trim() || 'Bilinmeyen Ürün';
    if (!name || name === 'Bilinmeyen Ürün') return null;

    // İnd. Fiyat/Ad. sütunu (tds[6]) net alış fiyatıdır
    const priceText = tds[6]?.textContent || '';
    let basePrice = parsePrice(priceText);
    if (isNaN(basePrice) || basePrice <= 0) return null;

    let currency = 'TRY';
    if (priceText.includes('$') || priceText.includes('USD') || priceText.includes('USDB')) {
      currency = 'USD';
    } else if (priceText.includes('€') || priceText.includes('EUR') || priceText.includes('EURO') || priceText.includes('EUROB')) {
      currency = 'EUR';
    }

    if (currency === 'USD') {
      basePrice = basePrice * state.exchangeRates.USD;
    } else if (currency === 'EUR') {
      basePrice = basePrice * state.exchangeRates.EUR;
    }

    const codeId = row.id || code.replace(/[^\w]/g, '_') || '';
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
    const key = `b2b_${domain.replace(/\./g, '_')}_${codeId || cleanName}`;

    let imgUrl = '';
    const imgEl = row.querySelector('td a.lightbox-item img, td img.urun-kucuk-resim, img');
    if (imgEl) {
      imgUrl = imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '';
    }

    const unitEl = row.querySelector('#basic-addon1') || tds[9]?.querySelector('.input-group-text');
    let unit = unitEl ? unitEl.textContent.trim().toUpperCase() : 'ADET';
    if (!unit) unit = 'ADET';

    let packQuantity = parsePackQuantityFromName(name);
    const vatRate = extractVatRate(tds[7]?.textContent) || 20;

    return { key, name, basePrice, domain, imgUrl, unit, packQuantity: packQuantity || 1, vatRate };
  },

  search: async function (query, isRetry = false) {
    return fetchHtmlSite('SITE_I', query, siteI, isRetry);
  }
};

