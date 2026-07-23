import { state } from './state.js';
import { escapeHtml } from './utils.js';

let onDiscountsReapplied = null;

export function initDiscounts(reapplyCallback) {
  onDiscountsReapplied = reapplyCallback;
}

// Kelime, Fiyat Aralığı ve site bazlı toplam iskontoyu hesapla
export function calculateTotalDiscountForProduct(name, productKey, sourceKey, basePrice) {
  let product = null;
  if (state.currentResults) {
    product = state.currentResults.find(p => p.key === productKey);
  }

  // Eşleşen bir site anahtarı yoksa domain'den bul
  if (!sourceKey && product) {
    sourceKey = product.sourceKey;
  }

  if (basePrice === undefined || basePrice === null) {
    if (product && product.basePrice !== undefined) {
      basePrice = product.basePrice;
    } else if (state.currentCart && state.currentCart[productKey]) {
      basePrice = state.currentCart[productKey].basePrice;
    }
  }

  // 1. Ürün bazlı özel iskonto (Kalıcı)
  if (state.currentProductDiscounts && state.currentProductDiscounts[productKey]) {
    return {
      discount: state.currentProductDiscounts[productKey].discount,
      type: 'Özel'
    };
  }

  // 2. Kelime bazlı kalıcı iskonto
  let kwDiscount = 0;
  let matchedKeyword = '';
  if (state.keywordDiscounts) {
    state.keywordDiscounts.forEach(rule => {
      if (name && name.toLowerCase().includes(rule.keyword.toLowerCase())) {
        if (rule.discount > kwDiscount) {
          kwDiscount = rule.discount;
          matchedKeyword = rule.keyword;
        }
      }
    });
  }

  if (kwDiscount > 0) {
    return {
      discount: kwDiscount,
      type: `Kural (${matchedKeyword})`
    };
  }

  // 3. Fiyat aralığına göre iskonto
  let rangeDiscount = 0;
  let matchedRangeText = '';
  if (basePrice !== undefined && basePrice !== null && !isNaN(basePrice) && state.priceRangeDiscounts) {
    const numPrice = parseFloat(basePrice);
    state.priceRangeDiscounts.forEach(rule => {
      const min = rule.min !== undefined && rule.min !== null && rule.min !== '' ? parseFloat(rule.min) : 0;
      const max = rule.max !== undefined && rule.max !== null && rule.max !== '' ? parseFloat(rule.max) : Infinity;

      if (numPrice >= min && numPrice <= max) {
        if (rule.discount > rangeDiscount) {
          rangeDiscount = rule.discount;
          if (max === Infinity) {
            matchedRangeText = `>= ${min} TL`;
          } else if (min === 0) {
            matchedRangeText = `<= ${max} TL`;
          } else {
            matchedRangeText = `${min}-${max} TL`;
          }
        }
      }
    });
  }

  if (rangeDiscount > 0) {
    return {
      discount: rangeDiscount,
      type: `Fiyat Aralığı (${matchedRangeText})`
    };
  }

  // 4. Siteye özel genel iskonto (Fallback)
  const baseSiteDiscount = state.siteDiscounts ? (state.siteDiscounts[sourceKey] || 0) : 0;
  if (baseSiteDiscount > 0) {
    return {
      discount: baseSiteDiscount,
      type: 'Site Geneli'
    };
  }

  return {
    discount: 0,
    type: ''
  };
}

// İskontoları Yeniden Uygula (Filtrelenmiş Ürünlere)
export function reapplyAllDiscounts() {
  if (onDiscountsReapplied) {
    onDiscountsReapplied();
  }
}

// Kelime Bazlı İskonto Kurallarını Tabloya Çiz
export function renderKeywordDiscountRules() {
  const rowsContainer = document.getElementById('keyword-discount-rules-rows');
  if (!rowsContainer) return;

  if (state.keywordDiscounts.length === 0) {
    rowsContainer.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 8px;">Kayıtlı kelime bazlı iskonto bulunmuyor.</td>
      </tr>
    `;
    return;
  }

  rowsContainer.innerHTML = '';
  state.keywordDiscounts.forEach(rule => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600; text-align: left; padding: 8px 12px;">${escapeHtml(rule.keyword)}</td>
      <td style="color: var(--primary); font-weight: 700; text-align: left; padding: 8px 12px;">%${rule.discount}</td>
      <td style="text-align: left; padding: 8px 12px;">
        <button class="delete-rule-btn delete-sale-btn" data-id="${rule.id}">Sil</button>
      </td>
    `;

    tr.querySelector('.delete-rule-btn').addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      deleteKeywordDiscountRule(id);
    });

    rowsContainer.appendChild(tr);
  });
}

// Kelime Bazlı İskonto Kuralını Sil
export function deleteKeywordDiscountRule(ruleId) {
  if (confirm("Bu kelime bazlı iskonto kuralını silmek istediğinize emin misiniz?")) {
    state.keywordDiscounts = state.keywordDiscounts.filter(rule => rule.id !== ruleId);
    const updateCb = () => {
      renderKeywordDiscountRules();
      reapplyAllDiscounts();
    };

    if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
      chrome.storage.sync.set({ keywordDiscounts: state.keywordDiscounts }, updateCb);
    } else {
      updateCb();
    }
  }
}

// Fiyat Aralığı İskonto Kurallarını Tabloya Çiz
export function renderRangeDiscountRules() {
  const rowsContainer = document.getElementById('range-discount-rules-rows');
  if (!rowsContainer) return;

  if (!state.priceRangeDiscounts || state.priceRangeDiscounts.length === 0) {
    rowsContainer.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 8px;">Kayıtlı fiyat aralığına göre iskonto bulunmuyor.</td>
      </tr>
    `;
    return;
  }

  rowsContainer.innerHTML = '';
  state.priceRangeDiscounts.forEach(rule => {
    const tr = document.createElement('tr');
    const minText = rule.min !== undefined && rule.min !== null && rule.min !== '' ? `${rule.min} TL` : '0 TL';
    const maxText = rule.max !== undefined && rule.max !== null && rule.max !== '' ? `${rule.max} TL` : 'Sınırsız';

    tr.innerHTML = `
      <td style="font-weight: 600; text-align: left; padding: 8px 12px;">${escapeHtml(minText)}</td>
      <td style="font-weight: 600; text-align: left; padding: 8px 12px;">${escapeHtml(maxText)}</td>
      <td style="color: var(--primary); font-weight: 700; text-align: left; padding: 8px 12px;">%${rule.discount}</td>
      <td style="text-align: left; padding: 8px 12px;">
        <button class="delete-range-rule-btn delete-sale-btn" data-id="${rule.id}">Sil</button>
      </td>
    `;

    tr.querySelector('.delete-range-rule-btn').addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      deleteRangeDiscountRule(id);
    });

    rowsContainer.appendChild(tr);
  });
}

// Fiyat Aralığı İskonto Kuralını Sil
export function deleteRangeDiscountRule(ruleId) {
  if (confirm("Bu fiyat aralığı iskonto kuralını silmek istediğinize emin misiniz?")) {
    state.priceRangeDiscounts = (state.priceRangeDiscounts || []).filter(rule => rule.id !== ruleId);
    const updateCb = () => {
      renderRangeDiscountRules();
      reapplyAllDiscounts();
    };

    if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
      chrome.storage.sync.set({ priceRangeDiscounts: state.priceRangeDiscounts }, updateCb);
    } else {
      updateCb();
    }
  }
}

// Ürün Bazlı Kalıcı İskonto Kurallarını Tabloya Çiz
export function renderProductDiscountRules() {
  const rowsContainer = document.getElementById('product-discount-rules-rows');
  if (!rowsContainer) return;

  const items = Object.entries(state.currentProductDiscounts);
  if (items.length === 0) {
    rowsContainer.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 12px;">Özel tanımlanmış ürün iskontosu bulunmamaktadır.</td>
      </tr>
    `;
    return;
  }

  rowsContainer.innerHTML = '';
  items.forEach(([key, rule]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 500; text-align: left; padding: 8px 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;" title="${escapeHtml(rule.name)}">${escapeHtml(rule.name)}</td>
      <td style="color: var(--text-muted); text-align: left; padding: 8px 12px;">${escapeHtml(rule.domain || '')}</td>
      <td style="color: var(--primary); font-weight: 700; text-align: left; padding: 8px 12px;">%${rule.discount}</td>
      <td style="text-align: left; padding: 8px 12px;">
        <button class="delete-prod-rule-btn delete-sale-btn" data-key="${escapeHtml(key)}">Sil</button>
      </td>
    `;

    tr.querySelector('.delete-prod-rule-btn').addEventListener('click', (e) => {
      const pKey = e.target.getAttribute('data-key');
      deleteProductDiscountRule(pKey);
    });

    rowsContainer.appendChild(tr);
  });
}

// Ürün Bazlı Kalıcı İskonto Kuralını Sil
export function deleteProductDiscountRule(productKey) {
  if (confirm("Bu ürüne özel tanımlanmış kalıcı iskontoyu silmek istediğinize emin misiniz?")) {
    delete state.currentProductDiscounts[productKey];
    const updateCb = () => {
      renderProductDiscountRules();
      reapplyAllDiscounts();
    };

    if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
      chrome.storage.sync.set({ productDiscounts: state.currentProductDiscounts }, updateCb);
    } else {
      updateCb();
    }
  }
}
