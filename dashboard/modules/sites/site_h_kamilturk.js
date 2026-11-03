import { parsePrice, parsePackQuantityFromName } from '../utils.js';
import { fetchHtmlSite } from './base.js';

export const siteH = {
  key: 'SITE_H',
  name: "Kamil Türk B2B",
  badgeClass: "site_h",
  rowSelector: '.prbx-item',

  parseRow: (row, domain) => {
    const nameEl = row.querySelector('.prbx-ad');
    if (!nameEl) return null;
    const name = nameEl.textContent.trim();

    const priceBox = Array.from(row.querySelectorAll('.fiyat-box-item')).find(el => el.textContent.includes('Net Fiyat'));
    if (!priceBox) return null;
    
    const spans = priceBox.querySelectorAll('span');
    if (spans.length < 3) return null;
    const basePrice = parsePrice(spans[2].textContent);

    let purchaseWithVat = 0;
    let vatRate = 20;
    const altBox = priceBox.querySelector('.fiyat-box-item-alt');
    if (altBox) {
      const altSpans = altBox.querySelectorAll('span');
      const withVatParsed = parsePrice(altSpans[2]?.textContent);
      if (withVatParsed > 0) {
        purchaseWithVat = withVatParsed;
        if (basePrice > 0) {
          const ratio = purchaseWithVat / basePrice;
          if (ratio >= 1.05 && ratio < 1.15) vatRate = 10;
          else if (ratio >= 1.15 && ratio < 1.26) vatRate = 20;
          else if (ratio >= 1.005 && ratio < 1.03) vatRate = 1;
          else {
            const calc = Math.round((ratio - 1) * 100);
            if (calc > 0 && calc <= 100) vatRate = calc;
          }
        }
      }
    }
    if (!purchaseWithVat && basePrice > 0) {
      purchaseWithVat = basePrice * (1 + (vatRate / 100));
    }

    const codeId = nameEl.getAttribute('id') || '';
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
    const key = `b2b_${domain.replace(/\./g, '_')}_${codeId || cleanName}`;

    let imgUrl = '';
    const imgEl = row.querySelector('.prbx-image img');
    if (imgEl) {
      imgUrl = imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '';
    }
    if (imgUrl && !imgUrl.startsWith('http')) {
      imgUrl = 'https://b2b.kamilturk.com' + (imgUrl.startsWith('/') ? '' : '/') + imgUrl;
    }

    let packQuantity = parsePackQuantityFromName(name);
    if (!packQuantity) {
      const carpanEl = row.querySelector('.prbx-carpan');
      if (carpanEl) {
        const match = carpanEl.textContent.match(/Koli İçi Adet\s*:\s*([\d\.]+)/i);
        if (match) {
          const parsed = parseInt(match[1].replace(/\./g, ''), 10);
          if (!isNaN(parsed) && parsed > 1) packQuantity = parsed;
        }
      }
    }

    const detailLink = row.querySelector('.prbx-ad a, a.prbx-ad, .prbx-image a, a[href*="/Urun/"], a[href*="/Detay/"]') || row.querySelector('a');
    let productUrl = '';
    if (detailLink && detailLink.getAttribute('href')) {
      const href = detailLink.getAttribute('href');
      productUrl = href.startsWith('http') ? href : ('https://b2b.kamilturk.com' + (href.startsWith('/') ? '' : '/') + href);
    } else {
      productUrl = `https://b2b.kamilturk.com/Arama/_Prbx?q=${encodeURIComponent(name)}`;
    }

    return { key, name, basePrice, purchaseWithVat, domain, imgUrl, productUrl, unit: 'ADET', packQuantity: packQuantity || 1, vatRate };
  },

  search: async function (query, isRetry = false) {
    return fetchHtmlSite('SITE_H', query, siteH, isRetry);
  }
};

