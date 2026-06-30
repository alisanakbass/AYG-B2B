import { state } from './state.js';
import { getSourceKeyFromDomain, calculateSellingPrice, formatPrice, escapeHtml } from './utils.js';
import { calculateTotalDiscountForProduct } from './discounts.js';

// Ortak Sepete Ürün Ekleme
export function addToSharedCart(product, addedQty, buttonEl) {
  chrome.storage.local.get({ cart: {} }, (result) => {
    const cart = result.cart;
    const newQty = (cart[product.key]?.qty || 0) + addedQty;

    cart[product.key] = {
      key: product.key,
      name: product.name,
      basePrice: product.basePrice,
      qty: newQty,
      domain: product.domain,
      sourceKey: product.sourceKey,
      unit: product.unit || 'ADET',
      packQuantity: product.packQuantity || 1,
      imgUrl: product.imgUrl || '../logo.png'
    };

    chrome.storage.local.set({ cart: cart }, () => {
      state.currentCart = cart;
      renderCart();

      // Görsel Başarı Bildirimi
      if (buttonEl) {
        buttonEl.textContent = "Eklendi! ✓";
        buttonEl.classList.add('success');
        setTimeout(() => {
          buttonEl.textContent = "Ekle";
          buttonEl.classList.remove('success');
        }, 1200);
      }
    });
  });
}

// Sepeti Çekmeceye Çizme
export function renderCart() {
  const container = document.getElementById('sidebar-cart-items');
  if (!container) return;

  const items = Object.values(state.currentCart);

  // Miktar sayacı
  const totalItemsCount = items.reduce((sum, item) => sum + item.qty, 0);
  const cartCountEl = document.getElementById('cart-count');
  const drawerCartCountEl = document.getElementById('drawer-cart-count');
  if (cartCountEl) cartCountEl.textContent = totalItemsCount;
  if (drawerCartCountEl) drawerCartCountEl.textContent = totalItemsCount;

  if (items.length === 0) {
    container.innerHTML = '<div class="cart-empty">Sepetiniz boş.</div>';
    const noVatEl = document.getElementById('cart-grand-total-no-vat');
    const withVatEl = document.getElementById('cart-grand-total-with-vat');
    const profitValEl = document.getElementById('cart-total-profit-with-vat');
    if (noVatEl) noVatEl.textContent = "0,00 TL";
    if (withVatEl) withVatEl.textContent = "0,00 TL";
    if (profitValEl) profitValEl.textContent = "0,00 TL";

    // Sidebar Sepet Toplamları (Sol alt)
    const sidebarSection = document.getElementById('sidebar-cart-totals-section');
    if (sidebarSection) sidebarSection.style.display = 'none';
    return;
  }

  let grandTotalNoVat = 0;
  let grandTotalWithVat = 0;
  let grandTotalPurchaseWithVat = 0;
  let totalProfitWithVat = 0;
  container.innerHTML = '';

  items.forEach(item => {
    const purchaseNoVat = item.basePrice;
    const purchaseWithVat = item.basePrice * 1.20;

    const sourceKey = item.sourceKey || getSourceKeyFromDomain(item.domain);
    const discInfo = calculateTotalDiscountForProduct(item.name, item.key, sourceKey);

    const margin = state.siteMargins[sourceKey] !== undefined ? state.siteMargins[sourceKey] : state.currentMargin;
    const rawUnitPriceNoVat = calculateSellingPrice(item.basePrice, margin, false);
    const rawUnitPriceWithVat = calculateSellingPrice(item.basePrice, margin, true);

    const unitPriceNoVat = rawUnitPriceNoVat * (1 - discInfo.discount / 100);
    const unitPriceWithVat = rawUnitPriceWithVat * (1 - discInfo.discount / 100);

    const itemUnit = (item.unit || 'ADET').toUpperCase();
    const itemPackQty = item.packQuantity || 1;
    const multiplier = itemUnit === 'ADET' ? 1 : itemPackQty;

    const itemTotalNoVat = unitPriceNoVat * item.qty * multiplier;
    const itemTotalWithVat = unitPriceWithVat * item.qty * multiplier;

    const netPurchaseWithVat = purchaseWithVat * (1 - discInfo.discount / 100);
    const itemTotalPurchaseWithVat = netPurchaseWithVat * item.qty * multiplier;

    grandTotalNoVat += itemTotalNoVat;
    grandTotalWithVat += itemTotalWithVat;
    grandTotalPurchaseWithVat += itemTotalPurchaseWithVat;

    const itemProfitWithVat = (unitPriceWithVat - netPurchaseWithVat) * item.qty * multiplier;
    totalProfitWithVat += itemProfitWithVat;

    let packInfo = '';
    if (itemPackQty > 1) {
      packInfo = `(${item.qty * itemPackQty} adet)`;
    }

    const div = document.createElement('div');
    div.className = 'cart-item-card';

    div.innerHTML = `
      <div class="cart-card-header" style="display: flex; gap: 10px; align-items: center;">
        <div class="cart-product-img-wrapper" style="width: 42px; height: 42px; background: var(--bg-input); border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(0,0,0,0.04); flex-shrink: 0;">
          <img src="${item.imgUrl || '../logo.png'}" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.src='../logo.png'">
        </div>
        <div class="cart-card-title-group" style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;">
          <h4 class="cart-card-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h4>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="cart-card-domain-badge">${escapeHtml(item.domain.replace('www.', ''))}</span>
            ${packInfo ? `<span style="font-size: 9.5px; color: var(--text-muted); font-weight: 600;">${packInfo}</span>` : ''}
          </div>
        </div>
        <button class="cart-card-delete-btn" title="Ürünü Sil">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      
      <div class="cart-card-details-grid" style="grid-template-columns: repeat(3, 1fr);">
        <div class="cart-detail-col">
          <span class="cart-detail-label">Toplam Alış (KDV'li)</span>
          <span class="cart-detail-value">${formatPrice(itemTotalPurchaseWithVat)}</span>
          ${item.qty * multiplier > 1 ? `<span style="font-size: 10px; color: var(--text-muted); font-weight: 600; margin-top: 1px;">Birim: ${formatPrice(netPurchaseWithVat)}</span>` : ''}
        </div>
        <div class="cart-detail-col">
          <span class="cart-detail-label">Toplam Satış (KDV'li)</span>
          <span class="cart-detail-value" style="color: var(--primary); font-weight: 750;">${formatPrice(itemTotalWithVat)}</span>
          ${item.qty * multiplier > 1 ? `<span style="font-size: 10px; color: var(--text-muted); font-weight: 600; margin-top: 1px;">Birim: ${formatPrice(unitPriceWithVat)}</span>` : ''}
        </div>
        <div class="cart-detail-col">
          <span class="cart-detail-label">Toplam Kâr (KDV'li)</span>
          <span class="cart-detail-value" style="color: #059669; font-weight: 750;">+${formatPrice(itemProfitWithVat)}</span>
          ${item.qty * multiplier > 1 ? `<span style="font-size: 10px; color: #059669; font-weight: 600; margin-top: 1px;">Birim: +${formatPrice(unitPriceWithVat - netPurchaseWithVat)}</span>` : ''}
        </div>
      </div>
      
      <div class="cart-card-footer" style="padding-top: 8px; border-top: none;">
        <div class="cart-card-qty-wrapper">
          <button class="cart-qty-btn cart-qty-dec-btn">-</button>
          <span class="cart-qty-val">${item.qty}</span>
          <button class="cart-qty-btn cart-qty-inc-btn">+</button>
          <span class="unit-badge-cart" style="font-size: 9.5px; padding: 2px 6px; border-radius: 4px; background: rgba(239, 68, 68, 0.06); color: var(--primary); font-weight: 600;">${itemUnit}</span>
        </div>
      </div>
    `;

    // Miktar Azaltma Dinleyicisi
    div.querySelector('.cart-qty-dec-btn').addEventListener('click', () => {
      updateCartItemQty(item.key, -1);
    });

    // Miktar Arttırma Dinleyicisi
    div.querySelector('.cart-qty-inc-btn').addEventListener('click', () => {
      updateCartItemQty(item.key, 1);
    });

    // Tekil Ürün Silme Dinleyicisi
    div.querySelector('.cart-card-delete-btn').addEventListener('click', () => {
      deleteCartItem(item.key);
    });

    container.appendChild(div);
  });

  const noVatEl = document.getElementById('cart-grand-total-no-vat');
  const withVatEl = document.getElementById('cart-grand-total-with-vat');
  const profitValEl = document.getElementById('cart-total-profit-with-vat');
  if (noVatEl) noVatEl.textContent = formatPrice(grandTotalNoVat);
  if (withVatEl) withVatEl.textContent = formatPrice(grandTotalWithVat);
  if (profitValEl) profitValEl.textContent = formatPrice(totalProfitWithVat);

  // Sidebar Sepet Toplamları (Sol alt)
  const sidebarSection = document.getElementById('sidebar-cart-totals-section');
  if (sidebarSection) {
    sidebarSection.style.display = 'block';
    const sidebarPurchase = document.getElementById('sidebar-total-purchase');
    const sidebarSales = document.getElementById('sidebar-total-sales');
    const sidebarProfit = document.getElementById('sidebar-total-profit');

    if (sidebarPurchase) sidebarPurchase.textContent = formatPrice(grandTotalPurchaseWithVat);
    if (sidebarSales) sidebarSales.textContent = formatPrice(grandTotalWithVat);
    if (sidebarProfit) sidebarProfit.textContent = formatPrice(totalProfitWithVat);
  }
}

// Sepetten Tekil Ürün Silme
export function deleteCartItem(key) {
  chrome.storage.local.get({ cart: {} }, (result) => {
    const cart = result.cart;
    delete cart[key];
    chrome.storage.local.set({ cart: cart }, () => {
      state.currentCart = cart;
      renderCart();
    });
  });
}

// Sepetteki Ürün Miktarını Güncelleme (+/-)
export function updateCartItemQty(key, change) {
  chrome.storage.local.get({ cart: {} }, (result) => {
    const cart = result.cart;
    if (!cart[key]) return;

    const newQty = cart[key].qty + change;
    if (newQty <= 0) {
      delete cart[key];
    } else {
      cart[key].qty = newQty;
    }

    chrome.storage.local.set({ cart: cart }, () => {
      state.currentCart = cart;
      renderCart();
    });
  });
}

// Sepeti Onaylama Modalı Görünümü
export function confirmCart() {
  const items = Object.values(state.currentCart);
  if (items.length === 0) {
    alert("Onaylanacak sepetinizde ürün bulunmamaktadır.");
    return;
  }

  const tbody = document.getElementById('confirm-modal-items-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  let grandTotalNoVat = 0;
  let grandTotalWithVat = 0;
  let totalProfitWithVat = 0;

  items.forEach(item => {
    const purchaseNoVat = item.basePrice;
    const purchaseWithVat = item.basePrice * 1.20;

    const sourceKey = item.sourceKey || getSourceKeyFromDomain(item.domain);
    const discInfo = calculateTotalDiscountForProduct(item.name, item.key, sourceKey);

    const margin = state.siteMargins[sourceKey] !== undefined ? state.siteMargins[sourceKey] : state.currentMargin;
    const rawUnitPriceNoVat = calculateSellingPrice(item.basePrice, margin, false);
    const rawUnitPriceWithVat = calculateSellingPrice(item.basePrice, margin, true);

    const unitPriceNoVat = rawUnitPriceNoVat * (1 - discInfo.discount / 100);
    const unitPriceWithVat = rawUnitPriceWithVat * (1 - discInfo.discount / 100);

    const itemUnit = (item.unit || 'ADET').toUpperCase();
    const itemPackQty = item.packQuantity || 1;
    const multiplier = itemUnit === 'ADET' ? 1 : itemPackQty;

    const itemTotalNoVat = unitPriceNoVat * item.qty * multiplier;
    const itemTotalWithVat = unitPriceWithVat * item.qty * multiplier;

    grandTotalNoVat += itemTotalNoVat;
    grandTotalWithVat += itemTotalWithVat;

    const netPurchaseNoVat = purchaseNoVat * (1 - discInfo.discount / 100);
    const netPurchaseWithVat = purchaseWithVat * (1 - discInfo.discount / 100);

    const itemProfitWithVat = (unitPriceWithVat - netPurchaseWithVat) * item.qty * multiplier;
    totalProfitWithVat += itemProfitWithVat;

    let qtyDisplay = `${item.qty}`;
    if (itemUnit !== 'ADET' && itemPackQty > 1) {
      qtyDisplay = `${item.qty} ${itemUnit.toLowerCase()} <br><span style="font-size:9px; color:var(--text-muted); font-weight:normal;">(${item.qty * itemPackQty} ad)</span>`;
    } else if (itemUnit === 'ADET' && itemPackQty > 1) {
      qtyDisplay = `${item.qty} ad <br><span style="font-size:9px; color:var(--text-muted); font-weight:normal;">(Pkt: ${itemPackQty})</span>`;
    } else if (itemUnit !== 'ADET') {
      qtyDisplay = `${item.qty} ${itemUnit.toLowerCase()}`;
    }

    const singleSellingWithVat = unitPriceWithVat;
    const singleSellingNoVat = unitPriceNoVat;
    const singlePurchaseWithVat = netPurchaseWithVat;
    const singlePurchaseNoVat = netPurchaseNoVat;
    const singleProfitWithVat = unitPriceWithVat - netPurchaseWithVat;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 10px; text-align: left; font-weight: 500; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</td>
      <td style="padding: 10px; text-align: left; color: var(--text-muted); font-size: 11px;">
        ${escapeHtml(item.domain.replace('www.', ''))}
        <span style="font-size: 9px; display: block; padding: 1px 3px; border-radius: 3px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; font-weight: 600; width: fit-content; margin-top: 2px;">${itemUnit} (x${itemPackQty})</span>
      </td>
      <td style="padding: 10px; text-align: center; font-weight: 600; line-height: 1.2;">${qtyDisplay}</td>
      <td style="padding: 10px; text-align: right; font-size: 11px;">
        <div style="font-weight: 600;">KDV'li: ${formatPrice(singlePurchaseWithVat)}</div>
        <div style="color: var(--text-muted); font-size: 10px;">KDV'siz: ${formatPrice(singlePurchaseNoVat)}</div>
      </td>
      <td style="padding: 10px; text-align: right; font-size: 11px;">
        <div style="font-weight: 700; color: #ef4444;">KDV'li: ${formatPrice(singleSellingWithVat)}</div>
        <div style="color: var(--text-muted); font-size: 10px;">KDV'siz: ${formatPrice(singleSellingNoVat)}</div>
      </td>
      <td style="padding: 10px; text-align: right; font-weight: 600; font-size: 11px;">
        <div>${formatPrice(itemTotalWithVat)}</div>
        <span style="font-size: 9px; color: var(--text-muted); display: block; font-weight: normal;">KDV'siz: ${formatPrice(itemTotalNoVat)}</span>
      </td>
      <td style="padding: 10px; text-align: right; font-weight: 600; color: #059669; font-size: 11px;">
        <div>${formatPrice(itemProfitWithVat)}</div>
        <span style="font-size: 9px; color: var(--text-muted); display: block; font-weight: normal;">Adet Kâr: ${formatPrice(singleProfitWithVat)}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Toplamları modalda göster
  document.getElementById('confirm-modal-sales-no-vat').textContent = formatPrice(grandTotalNoVat);
  document.getElementById('confirm-modal-sales-with-vat').textContent = formatPrice(grandTotalWithVat);
  document.getElementById('confirm-modal-profit-with-vat').textContent = formatPrice(totalProfitWithVat);

  // Modalı aç
  const confirmModal = document.getElementById('cart-confirm-modal');
  if (confirmModal) {
    confirmModal.classList.add('open');
  }
}

// Nihai Satış Kaydetme İşlemi
export function submitCart(onSuccess) {
  const items = Object.values(state.currentCart);
  if (items.length === 0) return;

  let grandTotalNoVat = 0;
  let grandTotalWithVat = 0;
  let totalProfitNoVat = 0;
  let totalProfitWithVat = 0;

  items.forEach(item => {
    const purchaseNoVat = item.basePrice;
    const purchaseWithVat = item.basePrice * 1.20;

    const sourceKey = item.sourceKey || getSourceKeyFromDomain(item.domain);
    const discInfo = calculateTotalDiscountForProduct(item.name, item.key, sourceKey);

    const margin = state.siteMargins[sourceKey] !== undefined ? state.siteMargins[sourceKey] : state.currentMargin;
    const rawUnitPriceNoVat = calculateSellingPrice(item.basePrice, margin, false);
    const rawUnitPriceWithVat = calculateSellingPrice(item.basePrice, margin, true);

    const unitPriceNoVat = rawUnitPriceNoVat * (1 - discInfo.discount / 100);
    const unitPriceWithVat = rawUnitPriceWithVat * (1 - discInfo.discount / 100);

    const itemUnit = (item.unit || 'ADET').toUpperCase();
    const itemPackQty = item.packQuantity || 1;
    const multiplier = itemUnit === 'ADET' ? 1 : itemPackQty;

    grandTotalNoVat += unitPriceNoVat * item.qty * multiplier;
    grandTotalWithVat += unitPriceWithVat * item.qty * multiplier;

    const netPurchaseNoVat = purchaseNoVat * (1 - discInfo.discount / 100);
    const netPurchaseWithVat = purchaseWithVat * (1 - discInfo.discount / 100);

    totalProfitNoVat += (unitPriceNoVat - netPurchaseNoVat) * item.qty * multiplier;
    totalProfitWithVat += (unitPriceWithVat - netPurchaseWithVat) * item.qty * multiplier;
  });

  const newSale = {
    id: 'sale_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    timestamp: Date.now(),
    totalSalesNoVat: grandTotalNoVat,
    totalSalesWithVat: grandTotalWithVat,
    totalProfitNoVat: totalProfitNoVat,
    totalProfitWithVat: totalProfitWithVat,
    items: items.map(i => ({ name: i.name, qty: i.qty, basePrice: i.basePrice, domain: i.domain }))
  };

  state.salesHistory.unshift(newSale);

  chrome.storage.local.set({ salesHistory: state.salesHistory, cart: {} }, () => {
    state.currentCart = {};
    renderCart();
    renderReports();
    if (onSuccess) onSuccess();
    alert("Satış başarıyla onaylandı ve raporlara kaydedildi!");
  });
}

// Raporları & Geçmişi Çiz
export function renderReports() {
  const statsDailyProfitWithVatEl = document.getElementById('stats-daily-profit-with-vat');
  const statsMonthlyProfitWithVatEl = document.getElementById('stats-monthly-profit-with-vat');
  const statsTotalSalesWithVatEl = document.getElementById('stats-total-sales-with-vat');
  const statsTotalSalesNoVatEl = document.getElementById('stats-total-sales-no-vat');
  const salesHistoryRows = document.getElementById('sales-history-rows');

  if (!salesHistoryRows) return;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let todayProfitWithVat = 0;
  let monthlyProfitWithVat = 0;
  let totalSalesNoVat = 0;
  let totalSalesWithVat = 0;

  state.salesHistory.forEach(sale => {
    const saleSalesNoVat = sale.totalSalesNoVat !== undefined ? sale.totalSalesNoVat : sale.totalSales / 1.20;
    const saleSalesWithVat = sale.totalSalesWithVat !== undefined ? sale.totalSalesWithVat : sale.totalSales;
    const saleProfitWithVat = sale.totalProfitWithVat !== undefined ? sale.totalProfitWithVat : sale.totalProfit;

    totalSalesNoVat += saleSalesNoVat;
    totalSalesWithVat += saleSalesWithVat;

    if (sale.timestamp >= todayStart) {
      todayProfitWithVat += saleProfitWithVat;
    }
    if (sale.timestamp >= thisMonthStart) {
      monthlyProfitWithVat += saleProfitWithVat;
    }
  });

  if (statsDailyProfitWithVatEl) statsDailyProfitWithVatEl.textContent = formatPrice(todayProfitWithVat);
  if (statsMonthlyProfitWithVatEl) statsMonthlyProfitWithVatEl.textContent = formatPrice(monthlyProfitWithVat);
  if (statsTotalSalesWithVatEl) statsTotalSalesWithVatEl.textContent = "KDV'li: " + formatPrice(totalSalesWithVat);
  if (statsTotalSalesNoVatEl) statsTotalSalesNoVatEl.textContent = "KDV'siz: " + formatPrice(totalSalesNoVat);

  if (state.salesHistory.length === 0) {
    salesHistoryRows.innerHTML = `
      <tr>
        <td colspan="4" class="empty-history" style="text-align: center; color: var(--text-muted); padding: 15px; font-size: 13px;">Onaylanmış satış bulunmamaktadır.</td>
      </tr>
    `;
    return;
  }

  salesHistoryRows.innerHTML = '';
  state.salesHistory.forEach(sale => {
    const tr = document.createElement('tr');
    const dateStr = new Date(sale.timestamp).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const saleSalesNoVat = sale.totalSalesNoVat !== undefined ? sale.totalSalesNoVat : sale.totalSales / 1.20;
    const saleSalesWithVat = sale.totalSalesWithVat !== undefined ? sale.totalSalesWithVat : sale.totalSales;
    const saleProfitWithVat = sale.totalProfitWithVat !== undefined ? sale.totalProfitWithVat : sale.totalProfit;

    tr.innerHTML = `
      <td>${dateStr}</td>
      <td>
        <div>${formatPrice(saleSalesWithVat)}</div>
        <span class="history-sale-vat-detail">KDV'siz: ${formatPrice(saleSalesNoVat)}</span>
      </td>
      <td class="history-profit">
        <div>${formatPrice(saleProfitWithVat)}</div>
      </td>
      <td>
        <button class="delete-sale-btn" data-id="${sale.id}">Sil</button>
      </td>
    `;

    tr.querySelector('.delete-sale-btn').addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      deleteSaleRecord(id);
    });

    salesHistoryRows.appendChild(tr);
  });
}

// Tekil Satış Kaydını Sil
export function deleteSaleRecord(saleId) {
  if (confirm("Bu satış kaydını silmek istediğinize emin misiniz?")) {
    state.salesHistory = state.salesHistory.filter(sale => sale.id !== saleId);
    chrome.storage.local.set({ salesHistory: state.salesHistory }, () => {
      renderReports();
    });
  }
}

// Tüm Satış Geçmişini Temizle
export function clearSalesHistory() {
  if (confirm("Tüm satış geçmişini tamamen temizlemek istediğinize emin misiniz? Bu işlem geri alınamaz!")) {
    state.salesHistory = [];
    chrome.storage.local.set({ salesHistory: [] }, () => {
      renderReports();
      alert("Tüm satış geçmişi başarıyla temizlendi.");
    });
  }
}
