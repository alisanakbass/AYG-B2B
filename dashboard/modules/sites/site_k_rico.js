import { state } from '../state.js';
import { parsePrice, parsePackQuantityFromName } from '../utils.js';
import { fetchHtmlSite } from './base.js';

export const siteK = {
  key: 'SITE_K',
  name: "Rico B2B",
  badgeClass: "site_k",
  rowSelector: '.search-table .tbody .tr, .tbody .tr, .tr[class*="kampanya-"]',

  parseRow: (row, domain) => {
    const tds = row.querySelectorAll('.td');
    if (tds.length < 7) return null;

    const code = tds[2]?.querySelector('.prbx2-text')?.textContent?.trim() || tds[2]?.textContent?.trim() || '';
    const nameEl = tds[3]?.querySelector('.font-weight-bold') || tds[3]?.querySelector('.prbx2-text') || tds[3];
    const name = nameEl?.textContent?.trim() || '';
    if (!name) return null;

    // tds[6]: Net Fiyat, tds[5]: Liste Fiyatı
    const priceText = tds[6]?.textContent || tds[5]?.textContent || '';
    let rawPrice = parsePrice(priceText);
    if (isNaN(rawPrice) || rawPrice <= 0) return null;

    let currency = 'TRY';
    if (priceText.includes('$') || priceText.includes('USD')) {
      currency = 'USD';
    } else if (priceText.includes('€') || priceText.includes('EUR')) {
      currency = 'EUR';
    }

    if (currency === 'USD') {
      rawPrice = rawPrice * state.exchangeRates.USD;
    } else if (currency === 'EUR') {
      rawPrice = rawPrice * state.exchangeRates.EUR;
    }

    // Rico B2B carisi için iskonto sitede tanımlı olmadığından ayardaki iskonto (varsayılan %35) düşülerek net alış maliyeti hesaplanır
    const discountRate = (state.siteDiscounts && state.siteDiscounts.SITE_K !== undefined) ? state.siteDiscounts.SITE_K : 35;
    const basePrice = rawPrice * (1 - discountRate / 100);

    const id = nameEl?.getAttribute('id') || '';
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
    const key = `b2b_${domain.replace(/\./g, '_')}_${id || code.replace(/[^\w]/g, '_') || cleanName}`;

    let imgUrl = '';
    const imgLink = row.querySelector('a.zoom');
    const imgEl = row.querySelector('.prbx2-stok-resim img, img.lazy, img');
    if (imgLink && imgLink.getAttribute('href')) {
      imgUrl = imgLink.getAttribute('href');
    } else if (imgEl) {
      imgUrl = imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '';
    }
    if (imgUrl.includes('/0.png')) {
      imgUrl = '';
    } else if (imgUrl && !imgUrl.startsWith('http')) {
      imgUrl = 'https://b2b.rico.com.tr' + (imgUrl.startsWith('/') ? '' : '/') + imgUrl;
    }

    const detailLink = row.querySelector('.list-dty-btn a, a[href*="/Stok/StokDetay/"]');
    const productUrl = detailLink ? ('https://b2b.rico.com.tr' + detailLink.getAttribute('href')) : '';

    let packQuantity = parsePackQuantityFromName(name);

    let vatRate = 20;
    const netText = tds[6]?.textContent || '';
    const vatText = tds[7]?.textContent || '';
    const parsedNet = parsePrice(netText);
    const parsedVatPrice = parsePrice(vatText);

    if (parsedNet > 0 && parsedVatPrice > 0) {
      const calc = Math.round(((parsedVatPrice / parsedNet) - 1) * 100);
      if (calc === 10 || calc === 20 || calc === 1 || calc === 8) {
        vatRate = calc;
      }
    }

    let rawVatPrice = parsedVatPrice > 0 ? parsedVatPrice : 0;
    if (rawVatPrice > 0) {
      if (currency === 'USD') {
        rawVatPrice = rawVatPrice * state.exchangeRates.USD;
      } else if (currency === 'EUR') {
        rawVatPrice = rawVatPrice * state.exchangeRates.EUR;
      }
    } else if (rawPrice > 0) {
      rawVatPrice = rawPrice * (1 + (vatRate / 100));
    }

    const purchaseWithVat = rawVatPrice * (1 - discountRate / 100);

    return { key, name, itemCode: code, rawPrice, rawVatPrice, basePrice, purchaseWithVat, domain, imgUrl, productUrl, unit: 'ADET', packQuantity: packQuantity || 1, vatRate };
  },

  search: async function (query, isRetry = false) {
    return fetchHtmlSite('SITE_K', query, siteK, isRetry);
  }
};

