import { updateStatusIndicator } from './base.js';

export const siteF = {
  key: 'SITE_F',
  name: "Fırat Boru",
  badgeClass: "site_f",
  rowSelector: null,
  parseRow: null,

  search: async function (query, isRetry = false) {
    const siteKey = 'SITE_F';
    updateStatusIndicator(siteKey, 'loading', isRetry ? 'Yeniden Deneniyor...' : 'Aranıyor...');
    const { fetchFromLocalFirat } = await import('../excel.js');
    return fetchFromLocalFirat(query);
  }
};

