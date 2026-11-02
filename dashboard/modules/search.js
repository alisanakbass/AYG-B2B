import { state, DEFAULT_URLS } from './state.js';
import { parsePrice, formatPrice, parsePackQuantityFromName, calculateSellingPrice, getEffectiveMargin, extractImageUrl, getSourceKeyFromDomain, escapeHtml, extractVatRate } from './utils.js';
import { calculateTotalDiscountForProduct } from './discounts.js';
import { addToSharedCart } from './cart.js';
import { SITE_ADAPTERS, PARSERS } from './sites/index.js';
import { updateStatusIndicator, updateSessionActive } from './sites/base.js';

export { SITE_ADAPTERS, PARSERS, updateStatusIndicator, updateSessionActive };

let imageFetchQueue = [];

// --- SESSION CHECKERS (Oturum Durum Kontrolleri) ---
export async function checkAllSessions() {
  let storageData = {};
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      storageData = await new Promise(r =>
        chrome.storage.local.get(['enderyapi_token', 'akyuz_token', 'duzmetal_token', 'session_SITE_A', 'session_SITE_C', 'session_SITE_D', 'session_SITE_E', 'session_SITE_H', 'session_SITE_I', 'session_SITE_J', 'session_SITE_K'], r)
      ) || {};
    }
  } catch (err) {
    console.warn("[AYG B2B] chrome.storage erişilemedi, varsayılan kontrol uygulanıyor:", err);
  }

  updateStatusIndicator('SITE_A',
    storageData.session_SITE_A ? 'success' : 'idle',
    storageData.session_SITE_A ? 'Aktif' : 'Pasif'
  );

  updateStatusIndicator('SITE_B',
    storageData.enderyapi_token ? 'success' : 'idle',
    storageData.enderyapi_token ? 'Aktif' : 'Pasif'
  );

  const isSiteCChecked = document.getElementById('site-c-check')?.checked;
  if (!isSiteCChecked) {
    updateStatusIndicator('SITE_C', 'idle', 'Devre Dışı');
  } else {
    updateStatusIndicator('SITE_C',
      storageData.session_SITE_C ? 'success' : 'idle',
      storageData.session_SITE_C ? 'Aktif' : 'Pasif'
    );
  }

  const isSiteDChecked = document.getElementById('site-d-check')?.checked;
  if (!isSiteDChecked) {
    updateStatusIndicator('SITE_D', 'idle', 'Devre Dışı');
  } else {
    updateStatusIndicator('SITE_D',
      storageData.session_SITE_D ? 'success' : 'idle',
      storageData.session_SITE_D ? 'Aktif' : 'Pasif'
    );
  }

  const isAkyuzActive = !!(storageData.akyuz_token || storageData.session_SITE_E);
  updateStatusIndicator('SITE_E',
    isAkyuzActive ? 'success' : 'idle',
    isAkyuzActive ? 'Aktif' : 'Pasif'
  );

  updateStatusIndicator('SITE_H',
    storageData.session_SITE_H ? 'success' : 'idle',
    storageData.session_SITE_H ? 'Aktif' : 'Pasif'
  );

  updateStatusIndicator('SITE_I',
    storageData.session_SITE_I ? 'success' : 'idle',
    storageData.session_SITE_I ? 'Aktif' : 'Pasif'
  );

  const isDuzmetalActive = !!(storageData.duzmetal_token || storageData.session_SITE_J);
  updateStatusIndicator('SITE_J',
    isDuzmetalActive ? 'success' : 'idle',
    isDuzmetalActive ? 'Aktif' : 'Pasif'
  );

  updateStatusIndicator('SITE_K',
    storageData.session_SITE_K ? 'success' : 'idle',
    storageData.session_SITE_K ? 'Aktif' : 'Pasif'
  );
}

// --- UZAKTAN GÜNCELLEME KONTROLÜ ---
export async function checkUpdates() {
  try {
    const CURRENT_VERSION = chrome.runtime.getManifest().version;
    const updateCheckUrl = "https://raw.githubusercontent.com/alisanakbass/AYG-B2B/main/version.json";

    const response = await fetch(updateCheckUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP Hata: ${response.status}`);

    const data = await response.json();
    if (data && data.version) {
      if (compareVersions(CURRENT_VERSION, data.version) < 0) {
        const banner = document.getElementById('update-notification');
        if (banner) {
          banner.style.display = 'block';
        }
      }
    }
  } catch (error) {
    // Güncelleme kontrolü sırasında hata oluştu, sessizce geç
  }
}

export function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const n1 = parts1[i] || 0;
    const n2 = parts2[i] || 0;
    if (n1 < n2) return -1;
    if (n1 > n2) return 1;
  }
  return 0;
}

// --- ARAMA MOTORU MEKANİZMASI ---
export async function executeSearch() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) {
    alert("Lütfen aramak istediğiniz ürünün adını veya kodunu girin.");
    return;
  }

  state.currentResults = [];
  state.selectedFilterSite = 'ALL';
  imageFetchQueue = [];
  const resultsContainer = document.getElementById('comparison-results');
  resultsContainer.innerHTML = `
    <tr>
      <td colspan="7" class="empty-state">
        <div class="empty-state-content">
          <div class="status-indicator loading">Veriler B2B Sitelerinden Çekiliyor...</div>
        </div>
      </td>
    </tr>
  `;
  document.getElementById('results-count').textContent = "Arama yapılıyor...";

  const activeSites = [];
  if (document.getElementById('site-a-check').checked) activeSites.push('SITE_A');
  else updateStatusIndicator('SITE_A', 'idle', 'Devre Dışı');

  if (document.getElementById('site-b-check').checked) activeSites.push('SITE_B');
  else updateStatusIndicator('SITE_B', 'idle', 'Devre Dışı');

  if (document.getElementById('site-c-check').checked) activeSites.push('SITE_C');
  else updateStatusIndicator('SITE_C', 'idle', 'Devre Dışı');

  if (document.getElementById('site-d-check').checked) activeSites.push('SITE_D');
  else updateStatusIndicator('SITE_D', 'idle', 'Devre Dışı');

  if (document.getElementById('site-e-check').checked) activeSites.push('SITE_E');
  else updateStatusIndicator('SITE_E', 'idle', 'Devre Dışı');

  if (document.getElementById('site-f-check').checked) activeSites.push('SITE_F');
  else updateStatusIndicator('SITE_F', 'idle', 'Devre Dışı');

  if (document.getElementById('site-h-check').checked) activeSites.push('SITE_H');
  else updateStatusIndicator('SITE_H', 'idle', 'Devre Dışı');

  if (document.getElementById('site-i-check') && document.getElementById('site-i-check').checked) activeSites.push('SITE_I');
  else updateStatusIndicator('SITE_I', 'idle', 'Devre Dışı');

  if (document.getElementById('site-j-check') && document.getElementById('site-j-check').checked) activeSites.push('SITE_J');
  else updateStatusIndicator('SITE_J', 'idle', 'Devre Dışı');

  if (document.getElementById('site-k-check') && document.getElementById('site-k-check').checked) activeSites.push('SITE_K');
  else updateStatusIndicator('SITE_K', 'idle', 'Devre Dışı');

  if (activeSites.length === 0) {
    resultsContainer.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <div class="empty-state-content">
            <p>Lütfen arama yapmak için en az bir B2B sitesi seçin.</p>
          </div>
        </td>
      </tr>
    `;
    document.getElementById('results-count').textContent = "Site seçilmedi.";
    return;
  }

  activeSites.forEach(siteKey => {
    fetchFromB2B(siteKey, query)
      .catch(err => {
        console.error(`[B2B Portal] ${siteKey} arama hatası:`, err);
      })
      .finally(() => {
        renderResults();
      });
  });
}

// Tek Bir B2B Sitesinden Veri Çekme (Site Adapter Mimarisi)
export async function fetchFromB2B(siteKey, query, isRetry = false) {
  const adapter = SITE_ADAPTERS[siteKey];
  if (!adapter || !adapter.search) {
    console.warn(`[B2B Portal] ${siteKey} için adapter bulunamadı.`);
    return;
  }
  return adapter.search(query, isRetry);
}

// Dinamik filtre butonlarını çizen fonksiyon
export function renderFilterButtons() {
  const container = document.getElementById('site-filters-container');
  if (!container) return;

  if (state.currentResults.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  // Benzersiz kaynakları ve ürün adetlerini sayalım
  const counts = {};
  state.currentResults.forEach(p => {
    if (p.sourceKey) {
      counts[p.sourceKey] = (counts[p.sourceKey] || 0) + 1;
    }
  });

  const activeSourceKeys = Object.keys(counts);

  container.innerHTML = '';
  container.style.display = 'flex';

  // "Hepsi" butonu
  const allBtn = document.createElement('button');
  const isAllActive = !state.selectedFilterSite || state.selectedFilterSite === 'ALL';
  allBtn.className = `filter-btn ${isAllActive ? 'active' : ''}`;
  allBtn.innerHTML = `
    <span class="site-dot site_all"></span>
    Hepsi
    <span class="filter-count">${state.currentResults.length}</span>
  `;
  allBtn.addEventListener('click', () => {
    state.selectedFilterSite = 'ALL';
    renderResults();
  });
  container.appendChild(allBtn);

  // Her bir site için filtre butonu
  activeSourceKeys.forEach(siteKey => {
    const siteName = PARSERS[siteKey]?.name || siteKey;
    const isSiteActive = state.selectedFilterSite === siteKey;
    const btn = document.createElement('button');
    btn.className = `filter-btn ${isSiteActive ? 'active' : ''}`;
    const letter = siteKey.replace('SITE_', '').toLowerCase();
    btn.innerHTML = `
      <span class="site-dot site_${letter}"></span>
      ${siteName}
      <span class="filter-count">${counts[siteKey]}</span>
    `;
    btn.addEventListener('click', () => {
      state.selectedFilterSite = siteKey;
      renderResults();
    });
    container.appendChild(btn);
  });
}

// Sonuçlar Tablosu Olay Görevlendirmesi (Event Delegation - Bellek ve Performans İyileştirmesi)
let isResultsTableEventsBound = false;
function setupResultsTableDelegation(container) {
  if (isResultsTableEventsBound) return;
  isResultsTableEventsBound = true;

  container.addEventListener('change', (e) => {
    if (e.target.classList.contains('select-product-check')) {
      updateBulkDiscountBarVisibility();
    }
  });

  container.addEventListener('focusin', (e) => {
    if (e.target.classList.contains('qty-input-table')) {
      e.target.select();
    }
  });

  container.addEventListener('click', (e) => {
    const incBtn = e.target.closest('.inc-btn');
    if (incBtn) {
      const key = incBtn.getAttribute('data-key');
      const qtyInput = document.getElementById(`qty-${key}`);
      if (qtyInput) {
        let val = parseInt(qtyInput.value, 10);
        if (isNaN(val)) val = 1;
        qtyInput.value = val + 1;
      }
      return;
    }

    const decBtn = e.target.closest('.dec-btn');
    if (decBtn) {
      const key = decBtn.getAttribute('data-key');
      const qtyInput = document.getElementById(`qty-${key}`);
      if (qtyInput) {
        let val = parseInt(qtyInput.value, 10);
        if (isNaN(val)) val = 1;
        if (val > 1) qtyInput.value = val - 1;
      }
      return;
    }

    const addCartBtn = e.target.closest('.add-cart-btn-table');
    if (addCartBtn) {
      const key = addCartBtn.getAttribute('data-key');
      const product = state.currentResults.find(p => p.key === key);
      if (product) {
        const qtyInput = document.getElementById(`qty-${key}`);
        const qty = qtyInput ? parseInt(qtyInput.value, 10) : 1;
        if (!isNaN(qty) && qty > 0) {
          addToSharedCart(product, qty, addCartBtn);
        }
      }
      return;
    }
  });
}

// Sonuçları Ekrana Çizme
export function renderResults() {
  const container = document.getElementById('comparison-results');
  if (!container) return;

  // Dinamik filtre butonlarını çizelim
  renderFilterButtons();

  if (state.currentResults.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <div class="empty-state-content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <p>Aradığınız kriterlere uygun hiçbir ürün bulunamadı. Lütfen B2B sitelerine giriş yaptığınızdan emin olun.</p>
          </div>
        </td>
      </tr>
    `;
    document.getElementById('results-count').textContent = "Ürün bulunamadı.";
    return;
  }

  // Filtreleme mantığı
  let filtered = state.currentResults;
  if (state.selectedFilterSite && state.selectedFilterSite !== 'ALL') {
    filtered = state.currentResults.filter(p => p.sourceKey === state.selectedFilterSite);
  }

  // Listelenen adet yazısı
  if (state.selectedFilterSite && state.selectedFilterSite !== 'ALL') {
    const siteName = PARSERS[state.selectedFilterSite]?.name || state.selectedFilterSite;
    document.getElementById('results-count').textContent = `${filtered.length} / ${state.currentResults.length} ürün listelendi (${siteName})`;
  } else {
    document.getElementById('results-count').textContent = `${state.currentResults.length} adet ürün listelendi.`;
  }

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <div class="empty-state-content">
            <p>Bu siteye ait filtrelenmiş ürün bulunamadı.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  setupResultsTableDelegation(container);
  container.innerHTML = '';
  const fragment = document.createDocumentFragment();

  filtered.forEach((product) => {
    const discInfo = calculateTotalDiscountForProduct(product.name, product.key, product.sourceKey, product.basePrice);

    const vatRate = product.vatRate || 20;
    const vatMultiplier = 1 + (vatRate / 100);
    const purchaseNoVat = product.basePrice;
    const purchaseWithVat = (product.purchaseWithVat !== undefined && product.purchaseWithVat > 0)
      ? product.purchaseWithVat
      : product.basePrice * vatMultiplier;

    const margin = getEffectiveMargin(product.basePrice, product.sourceKey);
    const rawSellingNoVat = calculateSellingPrice(product.basePrice, margin, false, vatRate);
    const rawSellingWithVat = calculateSellingPrice(product.basePrice, margin, true, vatRate);

    const sellingNoVat = rawSellingNoVat * (1 - discInfo.discount / 100);
    const sellingWithVat = rawSellingWithVat * (1 - discInfo.discount / 100);

    const profitWithVat = sellingWithVat - purchaseWithVat;

    const siteDiscountRate = (product.sourceKey === 'SITE_K') ? ((state.siteDiscounts && state.siteDiscounts.SITE_K !== undefined) ? state.siteDiscounts.SITE_K : 35) : 0;

    const discBadgeHtml = discInfo.discount > 0 ?
      `<div class="discount-badge-value">%${discInfo.discount}</div>
       <div class="discount-badge-type">${escapeHtml(discInfo.type)}</div>` :
      (siteDiscountRate > 0 ?
        `<div class="discount-badge-value" style="color: #ea580c;">%${siteDiscountRate}</div>
         <div class="discount-badge-type" style="color: #c2410c;">Alış İsk.</div>` :
        `<span style="color: var(--text-muted);">-</span>`);

    const unit = (product.unit || 'ADET').toUpperCase();
    const packQuantity = product.packQuantity || 1;

    let unitBadgeHtml = '';
    if (packQuantity > 1) {
      unitBadgeHtml = `<span class="unit-badge-result" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; font-weight: 600; display: inline-block; margin-top: 4px;">${unit} (Pkt: ${packQuantity})</span>`;
    } else {
      unitBadgeHtml = `<span class="unit-badge-result" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(107, 114, 128, 0.1); color: #6b7280; font-weight: 500; display: inline-block; margin-top: 4px;">${unit}</span>`;
    }

    let purchasePricesHtml = `
      <div class="price-main">
        <span class="price-label" style="font-weight: 600;">Adet KDV'li (%${vatRate}) Alış:</span>
        <span id="purchase-price-with-vat-${product.key}" style="font-weight: 700; color: var(--text);">${formatPrice(purchaseWithVat)}</span>
      </div>
      <div class="price-sub" style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
        <span class="price-label">Adet KDV'siz Alış:</span>
        <span id="purchase-price-no-vat-${product.key}">${formatPrice(purchaseNoVat)}</span>
      </div>
    `;

    let sellingPricesHtml = `
      <div class="price-main" id="sell-price-with-vat-${product.key}">
        <span class="price-label" style="font-size: 11px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 2px;">Adet KDV'li (%${vatRate}) Satış:</span>
        <span style="font-size: 16px; font-weight: 850; color: #ffffff; background: #ef4444; padding: 4px 8px; border-radius: 6px; display: inline-block; box-shadow: 0 2px 6px rgba(239, 68, 68, 0.3); font-family: 'Outfit', sans-serif;">${formatPrice(sellingWithVat)}</span>
      </div>
      <div class="price-sub" style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
        <span class="price-label">Adet KDV'siz Satış:</span>
        <span id="sell-price-no-vat-${product.key}" style="font-weight: 600; color: var(--text);">${formatPrice(sellingNoVat)}</span>
      </div>
      <div class="profit-group" style="margin-top: 4px; border-top: 1px dashed rgba(0,0,0,0.06); padding-top: 4px;">
        <div class="profit-main" style="font-size: 11px; color: #059669; font-weight: 700;">
          <span class="profit-label">Adet Kârı:</span>
          <span id="profit-with-vat-${product.key}">${formatPrice(profitWithVat)}</span>
        </div>
      </div>
    `;

    const tr = document.createElement('tr');
    tr.setAttribute('data-key', product.key);

    tr.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="select-product-check" data-key="${product.key}">
      </td>
      <td>
        <span class="source-badge ${product.badgeClass}">${product.sourceName}</span>
      </td>
      <td>
        <div class="product-cell-main">
          <div class="product-img-wrapper">
            ${product.imgUrl ?
        `<img src="${product.imgUrl}" class="product-img" data-code="${product.itemCode || ''}">
               <div class="product-img-placeholder" style="display:none;">📦</div>` :
        `<div class="product-img-placeholder">📦</div>`
      }
          </div>
          <div class="product-info-wrapper">
            ${product.productUrl ?
              `<a href="${product.productUrl}" target="_blank" style="text-decoration: none; color: inherit;"><div class="product-name-cell">${escapeHtml(product.name)}</div></a>` :
              `<div class="product-name-cell">${escapeHtml(product.name)}</div>`
            }
            <span class="product-code">${product.itemCode ? `<span style="font-weight: 650; color: #1e293b;">${escapeHtml(product.itemCode)}</span> • ` : ''}${product.domain}</span>
            <div>${unitBadgeHtml}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="price-vat-group" style="align-items: center; justify-content: center; text-align: center;">
          ${discBadgeHtml}
        </div>
      </td>
      <td>
        <div class="price-vat-group">
          ${purchasePricesHtml}
        </div>
      </td>
      <td>
        <div class="price-vat-group">
          ${sellingPricesHtml}
        </div>
      </td>
      <td>
        <div class="qty-action-wrapper">
          <div class="stepper-container">
            <button class="stepper-btn dec-btn" data-key="${product.key}">−</button>
            <input type="number" class="qty-input-table" id="qty-${product.key}" value="1" min="1">
            <button class="stepper-btn inc-btn" data-key="${product.key}">+</button>
          </div>
          <button class="add-cart-btn-table primary-btn" data-key="${product.key}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            Ekle
          </button>
        </div>
      </td>
    `;

    fragment.appendChild(tr);
  });

  container.appendChild(fragment);
  updateBulkDiscountBarVisibility();
}

// Hafızadaki Sonuçları Yeniden Hesaplama
export function recalculateAllResults() {
  if (state.currentResults.length === 0) return;

  state.currentResults.forEach((product) => {
    const vatRate = product.vatRate || 20;
    const vatMultiplier = 1 + (vatRate / 100);

    // Rico B2B gibi siteler için ayardaki iskonto değişimini ham fiyata ve KDV'li alışa yansıt
    if (product.sourceKey === 'SITE_K' && product.rawPrice) {
      const discountRate = (state.siteDiscounts && state.siteDiscounts.SITE_K !== undefined) ? state.siteDiscounts.SITE_K : 35;
      product.basePrice = product.rawPrice * (1 - discountRate / 100);
      const rawVat = product.rawVatPrice || (product.rawPrice * vatMultiplier);
      product.purchaseWithVat = rawVat * (1 - discountRate / 100);
    }

    const discInfo = calculateTotalDiscountForProduct(product.name, product.key, product.sourceKey, product.basePrice);

    const purchaseNoVat = product.basePrice;
    const purchaseWithVat = (product.purchaseWithVat !== undefined && product.purchaseWithVat > 0)
      ? product.purchaseWithVat
      : product.basePrice * vatMultiplier;

    const margin = getEffectiveMargin(product.basePrice, product.sourceKey);
    const rawSellingNoVat = calculateSellingPrice(product.basePrice, margin, false, vatRate);
    const rawSellingWithVat = calculateSellingPrice(product.basePrice, margin, true, vatRate);

    const sellingNoVat = rawSellingNoVat * (1 - discInfo.discount / 100);
    const sellingWithVat = rawSellingWithVat * (1 - discInfo.discount / 100);

    const profitWithVat = sellingWithVat - purchaseWithVat;

    const purchaseWithVatEl = document.getElementById(`purchase-price-with-vat-${product.key}`);
    const purchaseNoVatEl = document.getElementById(`purchase-price-no-vat-${product.key}`);
    if (purchaseWithVatEl) purchaseWithVatEl.textContent = formatPrice(purchaseWithVat);
    if (purchaseNoVatEl) purchaseNoVatEl.textContent = formatPrice(purchaseNoVat);

    const sellPriceWithVatEl = document.getElementById(`sell-price-with-vat-${product.key}`);
    const sellPriceNoVatEl = document.getElementById(`sell-price-no-vat-${product.key}`);
    const profitWithVatEl = document.getElementById(`profit-with-vat-${product.key}`);

    if (sellPriceWithVatEl) {
      sellPriceWithVatEl.innerHTML = `
        <span class="price-label" style="font-size: 11px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 2px;">Adet KDV'li (%${vatRate}) Satış:</span>
        <span style="font-size: 16px; font-weight: 850; color: #ffffff; background: #ef4444; padding: 4px 8px; border-radius: 6px; display: inline-block; box-shadow: 0 2px 6px rgba(239, 68, 68, 0.3); font-family: 'Outfit', sans-serif;">${formatPrice(sellingWithVat)}</span>
      `;
    }
    if (sellPriceNoVatEl) {
      sellPriceNoVatEl.textContent = formatPrice(sellingNoVat);
    }
    if (profitWithVatEl) {
      profitWithVatEl.textContent = formatPrice(profitWithVat);
    }
  });
}

// Sıralama ve Gruplama Uygulama
export function applySorting() {
  const criteria = document.getElementById('sort-select').value;
  if (state.currentResults.length === 0) return;

  if (criteria === 'price-asc') {
    state.currentResults.sort((a, b) => a.basePrice - b.basePrice);
  } else if (criteria === 'price-desc') {
    state.currentResults.sort((a, b) => b.basePrice - a.basePrice);
  } else if (criteria === 'name-asc') {
    state.currentResults.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  } else if (criteria === 'source') {
    state.currentResults.sort((a, b) => a.sourceName.localeCompare(b.sourceName, 'tr'));
  }

  renderResults();
}

// Toplu iskonto barı görünürlüğü
export function updateBulkDiscountBarVisibility() {
  const selectedCount = document.querySelectorAll('.select-product-check:checked').length;
  const bulkBar = document.getElementById('bulk-discount-container');
  const countEl = document.getElementById('bulk-selected-count');

  if (bulkBar && countEl) {
    if (selectedCount > 0) {
      countEl.textContent = `${selectedCount} ürün seçildi`;
      bulkBar.style.display = 'block';
    } else {
      bulkBar.style.display = 'none';
      const selectAllCheckbox = document.getElementById('select-all-results');
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
    }
  }
}
