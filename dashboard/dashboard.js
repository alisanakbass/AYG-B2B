import { state, DEFAULT_URLS } from './modules/state.js';
import { formatPrice, getSourceKeyFromDomain, calculateSellingPrice } from './modules/utils.js';
import { initDiscounts, calculateTotalDiscountForProduct, renderKeywordDiscountRules, renderProductDiscountRules, reapplyAllDiscounts } from './modules/discounts.js';
import { renderCart, renderReports, confirmCart, submitCart, salesHistoryPageIndex, setSalesHistoryPageIndex, salesFilters } from './modules/cart.js';
import { loadFiratStats, loadDefaultExcelIfEmpty, setupExcelListeners } from './modules/excel.js';
import { checkUpdates, checkAllSessions, executeSearch, recalculateAllResults, applySorting, renderResults, updateBulkDiscountBarVisibility } from './modules/search.js';

// Döviz kurlarını güncelleyen fonksiyon
async function fetchExchangeRates() {
  try {
    const resUSD = await fetch('https://open.er-api.com/v6/latest/USD');
    if (resUSD.ok) {
      const dataUSD = await resUSD.json();
      if (dataUSD && dataUSD.rates && dataUSD.rates.TRY) {
        state.exchangeRates.USD = parseFloat(dataUSD.rates.TRY);
      }
    }
  } catch (err) {
    console.error('[B2B Portal] USD kuru çekilemedi, fallback kullanılıyor:', err);
  }

  try {
    const resEUR = await fetch('https://open.er-api.com/v6/latest/EUR');
    if (resEUR.ok) {
      const dataEUR = await resEUR.json();
      if (dataEUR && dataEUR.rates && dataEUR.rates.TRY) {
        state.exchangeRates.EUR = parseFloat(dataEUR.rates.TRY);
      }
    }
  } catch (err) {
    console.error('[B2B Portal] EUR kuru çekilemedi, fallback kullanılıyor:', err);
  }

  updateExchangeRatesUI();
}

// Döviz kuru arayüzünü güncelleyen fonksiyon
function updateExchangeRatesUI() {
  const panel = document.getElementById('exchange-rates-panel');
  const usdVal = document.getElementById('usd-rate-val');
  const eurVal = document.getElementById('eur-rate-val');

  // Sol üst köşedeki mini kur alanları
  const miniPanel = document.getElementById('header-exchange-rates');
  const usdValMini = document.getElementById('usd-rate-val-mini');
  const eurValMini = document.getElementById('eur-rate-val-mini');

  if (panel && usdVal && eurVal) {
    usdVal.textContent = state.exchangeRates.USD.toFixed(2) + ' TL';
    eurVal.textContent = state.exchangeRates.EUR.toFixed(2) + ' TL';
    panel.style.display = 'block';
  }

  if (miniPanel && usdValMini && eurValMini) {
    usdValMini.textContent = state.exchangeRates.USD.toFixed(2);
    eurValMini.textContent = state.exchangeRates.EUR.toFixed(2);
    miniPanel.style.display = 'flex';
  }
}

// Ayarları Yükle
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({
      margin: 40,
      margin_site_a: 40,
      margin_site_b: 40,
      margin_site_c: 40,
      margin_site_d: 40,
      margin_site_e: 40,
      margin_site_f: 40,
      margin_site_g: 40,
      margin_site_h: 40,
      discount_site_a: 0,
      discount_site_b: 0,
      discount_site_c: 0,
      discount_site_d: 0,
      discount_site_e: 0,
      discount_site_f: 0,
      discount_site_g: 0,
      discount_site_h: 0,
      url_site_a: DEFAULT_URLS.url_site_a,
      url_site_b: DEFAULT_URLS.url_site_b,
      url_site_c: DEFAULT_URLS.url_site_c,
      url_site_d: DEFAULT_URLS.url_site_d,
      url_site_e: DEFAULT_URLS.url_site_e,
      url_site_g: DEFAULT_URLS.url_site_g,
      url_site_h: DEFAULT_URLS.url_site_h,
      productDiscounts: {},
      keywordDiscounts: [],
      cred_user_site_a: "info@aygunleryapi.com",
      cred_pass_site_a: "FZ0DT1YL*0OE",
      cred_user_site_b: "120 08 1401",
      cred_pass_site_b: "1401",
      cred_company_site_c: "12001451",
      cred_user_site_c: "1",
      cred_pass_site_c: "AYGUNLER",
      cred_user_site_d: "17183",
      cred_pass_site_d: "27f4e5d",
      cred_user_site_g: "",
      cred_pass_site_g: "",
      cred_user_site_h: "1340631",
      cred_pass_site_h: "662732"
    }, (items) => {
      // Eğer kullanıcıda eski/yanlış arama şablonu kayıtlıysa otomatik olarak AJAX (API) adresi ile değiştirelim
      if (items.url_site_h === "https://b2b.kamilturk.com/Arama/Arama?q={query}" || !items.url_site_h) {
        items.url_site_h = DEFAULT_URLS.url_site_h;
        chrome.storage.sync.set({ url_site_h: DEFAULT_URLS.url_site_h });
      }

      state.currentMargin = items.margin;
      state.siteMargins = {
        SITE_A: items.margin_site_a,
        SITE_B: items.margin_site_b,
        SITE_C: items.margin_site_c,
        SITE_D: items.margin_site_d,
        SITE_E: items.margin_site_e,
        SITE_F: items.margin_site_f,
        SITE_G: items.margin_site_g,
        SITE_H: items.margin_site_h
      };
      state.siteDiscounts = {
        SITE_A: items.discount_site_a,
        SITE_B: items.discount_site_b,
        SITE_C: items.discount_site_c,
        SITE_D: items.discount_site_d,
        SITE_E: items.discount_site_e,
        SITE_F: items.discount_site_f,
        SITE_G: items.discount_site_g,
        SITE_H: items.discount_site_h
      };
      state.currentProductDiscounts = items.productDiscounts || {};
      state.keywordDiscounts = items.keywordDiscounts || [];

      const modalMargin = document.getElementById('modal-margin');
      if (modalMargin) modalMargin.value = items.margin;

      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach(letter => {
        const key = `SITE_${letter.toUpperCase()}`;
        const mInput = document.getElementById(`margin-site-${letter}`);
        const dInput = document.getElementById(`discount-site-${letter}`);
        if (mInput) mInput.value = state.siteMargins[key];
        if (dInput) dInput.value = state.siteDiscounts[key];
      });

      const modalUrlA = document.getElementById('modal-url-site-a');
      const modalUrlB = document.getElementById('modal-url-site-b');
      const modalUrlC = document.getElementById('modal-url-site-c');
      const modalUrlD = document.getElementById('modal-url-site-d');
      const modalUrlE = document.getElementById('modal-url-site-e');
      const modalUrlG = document.getElementById('modal-url-site-g');
      const modalUrlH = document.getElementById('modal-url-site-h');
      if (modalUrlA) modalUrlA.value = items.url_site_a;
      if (modalUrlB) modalUrlB.value = items.url_site_b;
      if (modalUrlC) modalUrlC.value = items.url_site_c;
      if (modalUrlD) modalUrlD.value = items.url_site_d;
      if (modalUrlE) modalUrlE.value = items.url_site_e;
      if (modalUrlG) modalUrlG.value = items.url_site_g;
      if (modalUrlH) modalUrlH.value = items.url_site_h;

      // Giriş Bilgilerini Doldur
      const cUserA = document.getElementById('cred-user-site-a');
      const cPassA = document.getElementById('cred-pass-site-a');
      const cUserB = document.getElementById('cred-user-site-b');
      const cPassB = document.getElementById('cred-pass-site-b');
      const cCompC = document.getElementById('cred-company-site-c');
      const cUserC = document.getElementById('cred-user-site-c');
      const cPassC = document.getElementById('cred-pass-site-c');
      const cUserD = document.getElementById('cred-user-site-d');
      const cPassD = document.getElementById('cred-pass-site-d');
      const cUserG = document.getElementById('cred-user-site-g');
      const cPassG = document.getElementById('cred-pass-site-g');
      const cUserH = document.getElementById('cred-user-site-h');
      const cPassH = document.getElementById('cred-pass-site-h');

      if (cUserA) cUserA.value = items.cred_user_site_a || "info@aygunleryapi.com";
      if (cPassA) cPassA.value = items.cred_pass_site_a || "FZ0DT1YL*0OE";
      if (cUserB) cUserB.value = items.cred_user_site_b || "120 08 1401";
      if (cPassB) cPassB.value = items.cred_pass_site_b || "1401";
      if (cCompC) cCompC.value = items.cred_company_site_c || "12001451";
      if (cUserC) cUserC.value = items.cred_user_site_c || "1";
      if (cPassC) cPassC.value = items.cred_pass_site_c || "AYGUNLER";
      if (cUserD) cUserD.value = items.cred_user_site_d || "17183";
      if (cPassD) cPassD.value = items.cred_pass_site_d || "27f4e5d";
      if (cUserG) cUserG.value = items.cred_user_site_g || "";
      if (cPassG) cPassG.value = items.cred_pass_site_g || "";
      if (cUserH) cUserH.value = items.cred_user_site_h || "1340631";
      if (cPassH) cPassH.value = items.cred_pass_site_h || "662732";

      renderKeywordDiscountRules();
      renderProductDiscountRules();

      resolve();
    });
  });
}

// Sepeti Yükle
async function loadCart() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ cart: {} }, (items) => {
      state.currentCart = items.cart;
      resolve();
    });
  });
}

// Satış Geçmişini Yükle
async function loadSalesHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ salesHistory: [] }, (items) => {
      state.salesHistory = items.salesHistory || [];
      resolve();
    });
  });
}

// Sepet Çekmecesi (Drawer) Açma/Kapama Fonksiyonları
function openCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (drawer) drawer.classList.add('open');
  if (overlay) overlay.classList.add('open');
}

function closeCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (drawer) drawer.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

// UI Event Listeners Tanımlama
function setupUIEventListeners() {
  // Arama Tetikleyicileri
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');

  searchBtn.addEventListener('click', executeSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeSearch();
  });

  // Fiyat Hesaplama Anlık Güncelleme (Yedek)
  document.getElementById('modal-margin').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
      state.currentMargin = val;
      chrome.storage.sync.set({ margin: state.currentMargin });
    }
  });

  // Site Bazlı Kâr Marjı ve Genel İskonto Dinleyicileri
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach(letter => {
    const key = `SITE_${letter.toUpperCase()}`;
    const mInput = document.getElementById(`margin-site-${letter}`);
    const dInput = document.getElementById(`discount-site-${letter}`);

    if (mInput) {
      mInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val >= 0) {
          state.siteMargins[key] = val;
          chrome.storage.sync.set({ [`margin_site_${letter}`]: val });
        }
      });
    }

    if (dInput) {
      dInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val >= 0 && val <= 100) {
          state.siteDiscounts[key] = val;
          chrome.storage.sync.set({ [`discount_site_${letter}`]: val });
        }
      });
    }
  });

  // URL Şablonlarını Kaydet
  document.getElementById('modal-save-urls-btn').addEventListener('click', () => {
    const urlA = document.getElementById('modal-url-site-a').value.trim();
    const urlB = document.getElementById('modal-url-site-b').value.trim();
    const urlC = document.getElementById('modal-url-site-c').value.trim();
    const urlD = document.getElementById('modal-url-site-d').value.trim();
    const urlE = document.getElementById('modal-url-site-e').value.trim();
    const urlG = document.getElementById('modal-url-site-g').value.trim();
    const urlH = document.getElementById('modal-url-site-h').value.trim();

    chrome.storage.sync.set({
      url_site_a: urlA,
      url_site_b: urlB,
      url_site_c: urlC,
      url_site_d: urlD,
      url_site_e: urlE,
      url_site_g: urlG,
      url_site_h: urlH
    }, () => {
      alert("URL şablonları başarıyla kaydedildi!");
      checkAllSessions();
    });
  });

  // URL Ayarlarını Sıfırla
  document.getElementById('modal-reset-urls-btn').addEventListener('click', () => {
    if (confirm("URL şablonlarını varsayılan B2B adreslerine sıfırlamak istiyor musunuz?")) {
      chrome.storage.sync.set(DEFAULT_URLS, () => {
        loadSettings();
        alert("URL şablonları başarıyla sıfırlandı!");
      });
    }
  });

  // Sıralama Değişimi
  document.getElementById('sort-select').addEventListener('change', applySorting);

  // Sepet Temizleme
  document.getElementById('clear-cart-btn').addEventListener('click', () => {
    if (confirm("Ortak sepetinizdeki tüm ürünleri temizlemek istiyor musunuz?")) {
      chrome.storage.local.set({ cart: {} }, () => {
        state.currentCart = {};
        renderCart();
      });
    }
  });

  // Sidebar Sepet Temizleme (Sol alt)
  const sidebarClearCartBtn = document.getElementById('sidebar-clear-cart-btn');
  if (sidebarClearCartBtn) {
    sidebarClearCartBtn.addEventListener('click', () => {
      if (confirm("Ortak sepetinizdeki tüm ürünleri temizlemek istiyor musunuz?")) {
        chrome.storage.local.set({ cart: {} }, () => {
          state.currentCart = {};
          renderCart();
        });
      }
    });
  }

  // Teklif Ön İzleme ve İndirme Yönetimi
  let activeTeklifNo = "";
  let activeOfferItems = null;
  let activeSaleForOffer = null;
  const sidebarExportOfferBtn = document.getElementById('sidebar-export-offer-btn');
  const offerPreviewModal = document.getElementById('offer-preview-modal');
  const offerPreviewCloseBtn = document.getElementById('offer-preview-close-btn');
  const offerPreviewCancelBtn = document.getElementById('offer-preview-cancel-btn');
  const offerPreviewDownloadBtn = document.getElementById('offer-preview-download-btn');
  const previewTbody = document.getElementById('preview-offer-items-tbody');

  console.log("[B2B Teklif] DOM Başlatıldı. Element Kontrolleri:", {
    sidebarExportOfferBtn: !!sidebarExportOfferBtn,
    offerPreviewModal: !!offerPreviewModal,
    offerPreviewCloseBtn: !!offerPreviewCloseBtn,
    offerPreviewCancelBtn: !!offerPreviewCancelBtn,
    offerPreviewDownloadBtn: !!offerPreviewDownloadBtn,
    previewTbody: !!previewTbody
  });

  // Genel Teklif Ön İzleme Açma Fonksiyonu
  function openOfferPreview(items) {
    try {
      console.log("[B2B Teklif] Teklif önizleme açılıyor. Öğe sayısı:", items.length);
      
      if (items.length === 0) {
        alert("Teklif oluşturabilmek için sepetinizde ürün bulunmalıdır.");
        return;
      }
      
      if (items.length > 100) {
        alert("Teklif şablonu en fazla 100 ürün desteklemektedir. Lütfen sepetinizdeki ürün sayısını 100 veya daha az yapın.");
        return;
      }

      // Tarih ve Teklif No üret
      const bugun = new Date().toLocaleDateString('tr-TR');
      activeTeklifNo = "AYG-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + Math.floor(1000 + Math.random() * 9000);
      console.log("[B2B Teklif] Üretilen Teklif No:", activeTeklifNo, "Tarih:", bugun);
      
      const previewNoEl = document.getElementById('preview-teklif-no');
      const previewTarihEl = document.getElementById('preview-tarih');
      
      if (previewNoEl) previewNoEl.textContent = activeTeklifNo;
      if (previewTarihEl) previewTarihEl.textContent = bugun;

      // Düzenlenebilir alanları sıfırla
      const editableIds = ['input-sayin', 'input-adres', 'input-sevk-adresi', 'input-telefon', 'input-fax', 'input-vergi-dairesi', 'input-vergi-no', 'input-sayin-sag'];
      editableIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = "";
      });

      // Tabloyu temizle ve doldur
      if (previewTbody) {
        previewTbody.innerHTML = "";
      } else {
        throw new Error("preview-offer-items-tbody elementi bulunamadı!");
      }
      
      let grandTotalNoVat = 0;
      const totalRowsToRender = Math.max(22, items.length);

      // Sepetteki veya verilen ürünleri ekle
      for (let i = 0; i < totalRowsToRender; i++) {
        const item = items[i];
        
        if (item) {
          console.log(`[B2B Teklif] İşleniyor Satır ${i+1}:`, item.name);
          const sourceKey = item.sourceKey || getSourceKeyFromDomain(item.domain);
          const discInfo = calculateTotalDiscountForProduct(item.name, item.key, sourceKey);
          const margin = state.siteMargins[sourceKey] !== undefined ? state.siteMargins[sourceKey] : state.currentMargin;
          
          const rawUnitPriceNoVat = calculateSellingPrice(item.basePrice, margin, false);
          const unitPriceNoVat = rawUnitPriceNoVat * (1 - discInfo.discount / 100);
          
          const itemUnit = (item.unit || 'ADET').toUpperCase();
          const itemPackQty = item.packQuantity || 1;
          const multiplier = itemUnit === 'ADET' ? 1 : itemPackQty;
          
          const finalUnitPrice = unitPriceNoVat * multiplier;
          const totalNoVat = finalUnitPrice * item.qty;
          grandTotalNoVat += totalNoVat;

          const tr = document.createElement('tr');
          tr.style.borderBottom = "1px solid #000";
          tr.innerHTML = `
            <td style="border-right: 1px solid #000; padding: 6px; text-align: center;">${i + 1}</td>
            <td style="border-right: 1px solid #000; padding: 6px; text-align: left; font-weight: 500;">${item.name}</td>
            <td style="border-right: 1px solid #000; padding: 6px; text-align: center;">${itemUnit}</td>
            <td style="border-right: 1px solid #000; padding: 6px; text-align: center;">${item.qty}</td>
            <td style="border-right: 1px solid #000; padding: 6px; text-align: right;">${formatPrice(finalUnitPrice).replace(" TL", "")}</td>
            <td style="padding: 6px; text-align: right;">${formatPrice(totalNoVat).replace(" TL", "")}</td>
          `;
          previewTbody.appendChild(tr);
        } else {
          // Boş satır ekle
          const tr = document.createElement('tr');
          tr.style.borderBottom = "1px solid #000";
          tr.style.height = "25px";
          tr.innerHTML = `
            <td style="border-right: 1px solid #000; padding: 6px; text-align: center;">${i + 1}</td>
            <td style="border-right: 1px solid #000; padding: 6px;"></td>
            <td style="border-right: 1px solid #000; padding: 6px;"></td>
            <td style="border-right: 1px solid #000; padding: 6px;"></td>
            <td style="border-right: 1px solid #000; padding: 6px;"></td>
            <td style="padding: 6px;"></td>
          `;
          previewTbody.appendChild(tr);
        }
      }

      // Toplam değeri yaz
      const totalValEl = document.getElementById('preview-offer-total-val');
      if (totalValEl) totalValEl.textContent = formatPrice(grandTotalNoVat);

      // Aktif ihraç edilecek listeyi kaydet
      activeOfferItems = items;

      // Modalı aç
      offerPreviewModal.classList.add('open');
      console.log("[B2B Teklif] Modal başarıyla açıldı.");
    } catch (err) {
      console.error("[B2B Teklif] Önizleme yüklenirken hata:", err);
      alert("Ön izleme yüklenirken hata oluştu: " + err.message);
    }
  }

  // Sidebar Teklif Buton Tıklaması
  if (sidebarExportOfferBtn && offerPreviewModal) {
    sidebarExportOfferBtn.addEventListener('click', () => {
      openOfferPreview(Object.values(state.currentCart));
    });
  } else {
    console.error("[B2B Teklif] sidebarExportOfferBtn veya offerPreviewModal DOM'da bulunamadı!");
  }

  // Modalı Kapatma Dinleyicileri
  const closeOfferModal = () => {
    if (offerPreviewModal) offerPreviewModal.classList.remove('open');
  };

  if (offerPreviewCloseBtn) offerPreviewCloseBtn.addEventListener('click', closeOfferModal);
  if (offerPreviewCancelBtn) offerPreviewCancelBtn.addEventListener('click', closeOfferModal);
  if (offerPreviewModal) {
    offerPreviewModal.addEventListener('click', (e) => {
      if (e.target === offerPreviewModal) closeOfferModal();
    });
  }

  // Modaldan Excel İndirme
  if (offerPreviewDownloadBtn) {
    offerPreviewDownloadBtn.addEventListener('click', async () => {
      try {
        offerPreviewDownloadBtn.disabled = true;
        const originalText = offerPreviewDownloadBtn.innerHTML;
        offerPreviewDownloadBtn.innerHTML = "İndiriliyor...";

        const getVal = (id) => {
          const el = document.getElementById(id);
          return el ? el.textContent.trim() : "";
        };

        const metadata = {
          sayin: getVal('input-sayin'),
          adres: getVal('input-adres'),
          sevkAdresi: getVal('input-sevk-adresi'),
          telefon: getVal('input-telefon'),
          fax: getVal('input-fax'),
          vergiDairesi: getVal('input-vergi-dairesi'),
          vergiNo: getVal('input-vergi-no'),
          sayinSag: getVal('input-sayin-sag')
        };

        const { exportCartAsExcelOffer } = await import('./modules/excel.js');
        await exportCartAsExcelOffer(activeTeklifNo, metadata, activeOfferItems);

        offerPreviewDownloadBtn.innerHTML = originalText;
        offerPreviewDownloadBtn.disabled = false;
        closeOfferModal();
      } catch (err) {
        console.error(err);
        alert("Excel oluşturulurken bir hata oluştu: " + err.message);
        offerPreviewDownloadBtn.innerHTML = "Excel Olarak İndir";
        offerPreviewDownloadBtn.disabled = false;
      }
    });
  }

  // --- SATIŞ SEPETİ DETAY VE TEKLİF DÖNÜŞÜM MODALI ---
  const saleDetailModal = document.getElementById('sale-detail-modal');
  const closeSaleDetailModalBtn = document.getElementById('close-sale-detail-modal-btn');
  const saleDetailCancelBtn = document.getElementById('sale-detail-cancel-btn');
  const saleDetailToOfferBtn = document.getElementById('sale-detail-to-offer-btn');
  const salesHistoryRows = document.getElementById('sales-history-rows');

  // Satış Detaylarını Gösteren Fonksiyon
  function showSaleDetails(saleId) {
    const sale = state.salesHistory.find(s => s.id === saleId);
    if (!sale) {
      alert("Satış kaydı bulunamadı!");
      return;
    }

    const dateStr = new Date(sale.timestamp).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const detailDateEl = document.getElementById('sale-detail-date');
    const detailIdEl = document.getElementById('sale-detail-id');
    if (detailDateEl) detailDateEl.textContent = dateStr;
    if (detailIdEl) detailIdEl.textContent = sale.id;

    const tbody = document.getElementById('sale-detail-modal-items-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      sale.items.forEach(item => {
        const sourceKey = item.sourceKey || getSourceKeyFromDomain(item.domain);
        const discInfo = calculateTotalDiscountForProduct(item.name, item.key, sourceKey);
        const margin = state.siteMargins[sourceKey] !== undefined ? state.siteMargins[sourceKey] : state.currentMargin;
        
        const rawUnitPriceNoVat = calculateSellingPrice(item.basePrice, margin, false);
        const unitPriceNoVat = rawUnitPriceNoVat * (1 - discInfo.discount / 100);
        
        const rawUnitPriceWithVat = calculateSellingPrice(item.basePrice, margin, true);
        const unitPriceWithVat = rawUnitPriceWithVat * (1 - discInfo.discount / 100);

        const itemUnit = (item.unit || 'ADET').toUpperCase();
        const itemPackQty = item.packQuantity || 1;
        const multiplier = itemUnit === 'ADET' ? 1 : itemPackQty;

        const finalUnitPriceNoVat = unitPriceNoVat * multiplier;
        const finalUnitPriceWithVat = unitPriceWithVat * multiplier;
        const totalNoVat = finalUnitPriceNoVat * item.qty;
        const totalWithVat = finalUnitPriceWithVat * item.qty;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="padding: 10px; text-align: left; font-weight: 500;">${item.name}</td>
          <td style="padding: 10px; text-align: left;">${item.domain.replace('www.', '')}</td>
          <td style="padding: 10px; text-align: center;">${item.qty} ${itemUnit}</td>
          <td style="padding: 10px; text-align: right;">
            <div>${formatPrice(finalUnitPriceWithVat)}</div>
            <span style="font-size: 10px; color: var(--text-muted);">KDV'siz: ${formatPrice(finalUnitPriceNoVat)}</span>
          </td>
          <td style="padding: 10px; text-align: right; font-weight: 600;">
            <div>${formatPrice(totalWithVat)}</div>
            <span style="font-size: 10px; color: var(--text-muted);">KDV'siz: ${formatPrice(totalNoVat)}</span>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    const saleSalesNoVat = sale.totalSalesNoVat !== undefined ? sale.totalSalesNoVat : sale.totalSales / 1.20;
    const saleSalesWithVat = sale.totalSalesWithVat !== undefined ? sale.totalSalesWithVat : sale.totalSales;
    const saleProfitWithVat = sale.totalProfitWithVat !== undefined ? sale.totalProfitWithVat : sale.totalProfit;

    const noVatEl = document.getElementById('sale-detail-sales-no-vat');
    const withVatEl = document.getElementById('sale-detail-sales-with-vat');
    const profitEl = document.getElementById('sale-detail-profit-with-vat');

    if (noVatEl) noVatEl.textContent = formatPrice(saleSalesNoVat);
    if (withVatEl) withVatEl.textContent = formatPrice(saleSalesWithVat);
    if (profitEl) profitEl.textContent = formatPrice(saleProfitWithVat);

    activeSaleForOffer = sale;

    if (saleDetailModal) saleDetailModal.classList.add('open');
  }

  // Satış Detay Modalı Kapatma
  const closeSaleDetailModal = () => {
    if (saleDetailModal) saleDetailModal.classList.remove('open');
  };

  if (closeSaleDetailModalBtn) closeSaleDetailModalBtn.addEventListener('click', closeSaleDetailModal);
  if (saleDetailCancelBtn) saleDetailCancelBtn.addEventListener('click', closeSaleDetailModal);
  if (saleDetailModal) {
    saleDetailModal.addEventListener('click', (e) => {
      if (e.target === saleDetailModal) closeSaleDetailModal();
    });
  }

  // Satış Detayından Teklife Dönüştürme Tıklaması
  if (saleDetailToOfferBtn) {
    saleDetailToOfferBtn.addEventListener('click', () => {
      if (activeSaleForOffer) {
        closeSaleDetailModal();
        openOfferPreview(activeSaleForOffer.items);
      }
    });
  }

  // Satış Geçmişi Tablosundan "Detay" Butonu Delegasyonu
  if (salesHistoryRows) {
    salesHistoryRows.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('.view-sale-btn');
      if (viewBtn) {
        const id = viewBtn.getAttribute('data-id');
        showSaleDetails(id);
      }
    });
  }

  // Sepeti Onayla
  const confirmCartBtn = document.getElementById('confirm-cart-btn');
  if (confirmCartBtn) {
    confirmCartBtn.addEventListener('click', confirmCart);
  }

  // Sepet Çekmecesi (Drawer) Dinleyicileri
  const headerCartBtn = document.getElementById('header-cart-btn');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');
  const drawerOverlay = document.getElementById('drawer-overlay');

  if (headerCartBtn) {
    headerCartBtn.addEventListener('click', openCartDrawer);
  }
  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', closeCartDrawer);
  }
  if (drawerOverlay) {
    drawerOverlay.addEventListener('click', closeCartDrawer);
  }

  // Sepet Ön İzleme Modalı Kapatma ve İptal Butonları
  const closeConfirmModalBtn = document.getElementById('close-confirm-modal-btn');
  const confirmModalCancelBtn = document.getElementById('confirm-modal-cancel-btn');
  const confirmModal = document.getElementById('cart-confirm-modal');

  const closeConfirmModal = () => {
    if (confirmModal) confirmModal.classList.remove('open');
  };

  if (closeConfirmModalBtn) closeConfirmModalBtn.addEventListener('click', closeConfirmModal);
  if (confirmModalCancelBtn) confirmModalCancelBtn.addEventListener('click', closeConfirmModal);
  if (confirmModal) {
    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) closeConfirmModal();
    });
  }

  // Nihai Satış Kaydetme Butonu (Modal İçi)
  const confirmModalSubmitBtn = document.getElementById('confirm-modal-submit-btn');
  if (confirmModalSubmitBtn) {
    confirmModalSubmitBtn.addEventListener('click', () => {
      submitCart(() => {
        closeConfirmModal();
      });
    });
  }

  // --- SAYFA GEÇİŞ KONTROLLERİ ---
  const navSearchBtn = document.getElementById('nav-search-btn');
  const navSettingsBtn = document.getElementById('nav-settings-btn');
  const pageSearch = document.getElementById('page-search');
  const pageSettings = document.getElementById('page-settings');

  if (navSearchBtn && navSettingsBtn && pageSearch && pageSettings) {
    navSearchBtn.addEventListener('click', () => {
      navSearchBtn.classList.add('active');
      navSettingsBtn.classList.remove('active');
      pageSearch.classList.add('active');
      pageSettings.classList.remove('active');
    });

    navSettingsBtn.addEventListener('click', () => {
      navSettingsBtn.classList.add('active');
      navSearchBtn.classList.remove('active');
      pageSearch.classList.remove('active');
      pageSettings.classList.add('active');
      renderReports();
      renderKeywordDiscountRules();
      renderProductDiscountRules();
    });
  }

  // --- TOPLU İSKONTO VE CHECKBOX GEÇİŞLERİ ---
  const selectAllCheckbox = document.getElementById('select-all-results');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const rowChecks = document.querySelectorAll('.select-product-check');
      rowChecks.forEach(cb => {
        cb.checked = isChecked;
      });
      updateBulkDiscountBarVisibility();
    });
  }

  const applyBulkDiscountBtn = document.getElementById('apply-bulk-discount-btn');
  if (applyBulkDiscountBtn) {
    applyBulkDiscountBtn.addEventListener('click', () => {
      const discountVal = parseFloat(document.getElementById('bulk-discount-val').value);
      if (isNaN(discountVal) || discountVal < 0 || discountVal > 100) {
        alert("Lütfen 0 ile 100 arasında geçerli bir iskonto oranı girin.");
        return;
      }

      const selectedChecks = document.querySelectorAll('.select-product-check:checked');
      if (selectedChecks.length === 0) {
        alert("Lütfen iskonto uygulamak istediğiniz ürünleri seçin.");
        return;
      }

      selectedChecks.forEach(cb => {
        const key = cb.getAttribute('data-key');
        const product = state.currentResults.find(p => p.key === key);
        if (product) {
          state.currentProductDiscounts[key] = {
            name: product.name,
            discount: discountVal,
            domain: product.domain
          };
        }
      });

      chrome.storage.sync.set({ productDiscounts: state.currentProductDiscounts }, () => {
        alert("Seçilen ürünlere kalıcı özel iskonto başarıyla uygulandı!");
        document.getElementById('bulk-discount-val').value = '';
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        reapplyAllDiscounts();
        renderProductDiscountRules();
      });
    });
  }

  // Tab Değişimi Kontrolleri (Settings Sayfası İçi)
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tabId = btn.getAttribute('data-tab');
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === tabId) {
          content.classList.add('active');
        }
      });
    });
  });

  // Yeni Kelime Bazlı İskonto Kuralı Ekle
  const addKeywordRuleBtn = document.getElementById('add-keyword-rule-btn');
  if (addKeywordRuleBtn) {
    addKeywordRuleBtn.addEventListener('click', () => {
      const kwInput = document.getElementById('new-keyword-rule');
      const discInput = document.getElementById('new-keyword-discount');
      const keyword = kwInput.value.trim();
      const discount = parseFloat(discInput.value);

      if (!keyword) {
        alert("Lütfen geçerli bir kelime girin (örn. BOSCH).");
        return;
      }
      if (isNaN(discount) || discount < 0 || discount > 100) {
        alert("Lütfen 0 ile 100 arasında geçerli bir iskonto oranı girin.");
        return;
      }

      const newRule = {
        id: 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        keyword: keyword,
        discount: discount
      };

      state.keywordDiscounts.push(newRule);
      chrome.storage.sync.set({ keywordDiscounts: state.keywordDiscounts }, () => {
        kwInput.value = '';
        discInput.value = '';
        renderKeywordDiscountRules();
        reapplyAllDiscounts();
        alert(`"${keyword}" kelimesi için %${discount} iskonto kuralı başarıyla eklendi!`);
      });
    });
  }

  // Satış Geçmişi Filtreleri
  const salesFilterSearch = document.getElementById('sales-filter-search');
  const salesFilterStartDate = document.getElementById('sales-filter-start-date');
  const salesFilterEndDate = document.getElementById('sales-filter-end-date');

  const onSalesFilterChange = () => {
    salesFilters.search = salesFilterSearch ? salesFilterSearch.value : '';
    salesFilters.startDate = salesFilterStartDate ? salesFilterStartDate.value : '';
    salesFilters.endDate = salesFilterEndDate ? salesFilterEndDate.value : '';
    setSalesHistoryPageIndex(0); // Reset page to newest
    renderReports();
  };

  if (salesFilterSearch) salesFilterSearch.addEventListener('input', onSalesFilterChange);
  if (salesFilterStartDate) salesFilterStartDate.addEventListener('change', onSalesFilterChange);
  if (salesFilterEndDate) salesFilterEndDate.addEventListener('change', onSalesFilterChange);

  // Satış Geçmişi Sayfalama
  const salesHistoryPrevDayBtn = document.getElementById('sales-history-prev-day-btn');
  const salesHistoryNextDayBtn = document.getElementById('sales-history-next-day-btn');

  if (salesHistoryPrevDayBtn) {
    salesHistoryPrevDayBtn.addEventListener('click', () => {
      if (salesHistoryPageIndex > 0) {
        setSalesHistoryPageIndex(salesHistoryPageIndex - 1);
        renderReports();
      }
    });
  }

  if (salesHistoryNextDayBtn) {
    salesHistoryNextDayBtn.addEventListener('click', () => {
      setSalesHistoryPageIndex(salesHistoryPageIndex + 1);
      renderReports();
    });
  }

  // Manuel "Bağlan" butonları dinleyicileri
  const connectBtns = document.querySelectorAll('.connect-btn');
  connectBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const siteKey = btn.getAttribute('data-site');

      btn.classList.add('connecting');
      const btnText = btn.querySelector('span');
      if (btnText) btnText.textContent = "Bağlanıyor...";

      const { updateStatusIndicator } = await import('./modules/search.js');
      updateStatusIndicator(siteKey, 'loading', 'Bağlanıyor...');

      chrome.runtime.sendMessage({ action: "manual_login", siteKey: siteKey }, () => {
        btn.classList.remove('connecting');
        if (btnText) btnText.textContent = "Bağlan";
        checkAllSessions();
      });
    });
  });

  // Giriş Bilgilerini Kaydetme Dinleyicisi
  const saveCredsBtn = document.getElementById('modal-save-creds-btn');
  if (saveCredsBtn) {
    saveCredsBtn.addEventListener('click', () => {
      const userA = document.getElementById('cred-user-site-a').value.trim();
      const passA = document.getElementById('cred-pass-site-a').value.trim();
      const userB = document.getElementById('cred-user-site-b').value.trim();
      const passB = document.getElementById('cred-pass-site-b').value.trim();
      const compC = document.getElementById('cred-company-site-c').value.trim();
      const userC = document.getElementById('cred-user-site-c').value.trim();
      const passC = document.getElementById('cred-pass-site-c').value.trim();
      const userD = document.getElementById('cred-user-site-d').value.trim();
      const passD = document.getElementById('cred-pass-site-d').value.trim();
      const userG = document.getElementById('cred-user-site-g').value.trim();
      const passG = document.getElementById('cred-pass-site-g').value.trim();
      const userH = document.getElementById('cred-user-site-h').value.trim();
      const passH = document.getElementById('cred-pass-site-h').value.trim();

      chrome.storage.sync.set({
        cred_user_site_a: userA,
        cred_pass_site_a: passA,
        cred_user_site_b: userB,
        cred_pass_site_b: passB,
        cred_company_site_c: compC,
        cred_user_site_c: userC,
        cred_pass_site_c: passC,
        cred_user_site_d: userD,
        cred_pass_site_d: passD,
        cred_user_site_g: userG,
        cred_pass_site_g: passG,
        cred_user_site_h: userH,
        cred_pass_site_h: passH
      }, () => {
        alert("B2B giriş bilgileri başarıyla kaydedildi!");
      });
    });
  }

  // Çekmeceleri (Collapsible) Açma/Kapama İşlemi
  const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
  collapsibleHeaders.forEach(header => {
    header.addEventListener('click', () => {
      // Tıklanan başlığın hemen altındaki içeriği bul
      const content = header.nextElementSibling;
      // Başlığın içindeki ok (chevron) ikonunu bul
      const chevron = header.querySelector('.chevron');

      if (content) {
        content.classList.toggle('open');
      }
      if (chevron) {
        chevron.classList.toggle('open');
      }
    });
  });
}

// --- INITIALIZE ---
document.addEventListener('DOMContentLoaded', async () => {
  // İskonto işlemlerine, arama sonuçlarını yeniden tetikleyen callback'i bağla
  initDiscounts(renderResults);

  // Sürüm güncelleme kontrolünü çalıştır
  checkUpdates();

  // Döviz kurlarını güncel olarak çek
  await fetchExchangeRates();

  await loadSettings();
  await loadCart();
  await loadSalesHistory();
  setupUIEventListeners();
  setupExcelListeners();
  await loadDefaultExcelIfEmpty();
  loadFiratStats();
  renderCart();
  renderReports();

  // Oturum durumlarını kontrol et
  checkAllSessions();

  // Eklenti açılır açılmaz ekli/işaretli siteleri açıp otomatik giriş yapacak
  chrome.runtime.sendMessage({ action: "login_all" }, () => {
    checkAllSessions();
  });

  // --- Resim Büyütme Önizleme Popup'ı ---
  const previewPopup = document.createElement('div');
  previewPopup.className = 'img-preview-popup';
  const previewImg = document.createElement('img');
  previewPopup.appendChild(previewImg);
  document.body.appendChild(previewPopup);

  let popupTimer = null;

  document.addEventListener('mouseover', (e) => {
    const wrapper = e.target.closest('.product-img-wrapper');
    if (!wrapper) return;
    const img = wrapper.querySelector('.product-img');
    if (!img || !img.src || img.style.display === 'none') return;

    clearTimeout(popupTimer);
    previewImg.src = img.src;

    const rect = wrapper.getBoundingClientRect();
    const popupW = 240;
    const popupH = 240;
    const margin = 10;

    let left = rect.right + margin;
    let top = rect.top + (rect.height / 2) - (popupH / 2);

    if (left + popupW > window.innerWidth - margin) {
      left = rect.left - popupW - margin;
    }
    if (top + popupH > window.innerHeight - margin) {
      top = window.innerHeight - popupH - margin;
    }
    if (top < margin) top = margin;

    previewPopup.style.left = `${left}px`;
    previewPopup.style.top = `${top}px`;
    previewPopup.style.display = 'block';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => previewPopup.classList.add('visible'));
    });
  });

  document.addEventListener('mouseout', (e) => {
    const wrapper = e.target.closest('.product-img-wrapper');
    if (!wrapper) return;
    previewPopup.classList.remove('visible');
    popupTimer = setTimeout(() => {
      previewPopup.style.display = 'none';
    }, 200);
  });

  // Görsel yükleme hatalarını CSP uyumlu yakalayıp yer tutucu (placeholder) gösterme
  const resultsTable = document.getElementById('comparison-results');
  if (resultsTable) {
    resultsTable.addEventListener('error', (e) => {
      if (e.target && e.target.tagName === 'IMG' && e.target.classList.contains('product-img')) {
        e.target.style.display = 'none';
        const placeholder = e.target.nextElementSibling;
        if (placeholder) {
          placeholder.style.display = 'block';
        }
      }
    }, true);
  }

  // Storage değişikliklerini izle
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      const keys = Object.keys(changes);
      const isPricingChange = keys.some(k => k.startsWith('margin_site_') || k.startsWith('discount_site_') || k === 'margin' || k === 'keywordDiscounts' || k === 'productDiscounts');
      if (isPricingChange) {
        loadSettings().then(() => {
          recalculateAllResults();
          renderCart();
        });
      }
    }
    if (area === 'local') {
      if (changes.cart) {
        state.currentCart = changes.cart.newValue || {};
        renderCart();
      }
      if (changes.enderyapi_token || changes.session_SITE_A || changes.session_SITE_C) {
        checkAllSessions();
      }
    }
  });
});

// Görsel yüklenemediğinde çalışan merkezi hata yakalayıcı (CSP Uyumlu)
document.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG' && e.target.classList.contains('product-img')) {
    const img = e.target;
    const src = img.src;
    const code = img.getAttribute('data-code');

    const filename = src.substring(src.lastIndexOf('/') + 1);
    const isNameBased = /[a-zA-Z]/.test(filename);

    if (isNameBased && src.includes('images/')) {
      if (code) {
        img.src = 'https://cdn.jsdelivr.net/gh/alisanakbass/AYG-B2B@main/images/' + code + '.png';
      } else {
        img.src = '../logo.png';
      }
    }
    else if (src.includes('images/')) {
      if (src.endsWith('.png')) {
        img.src = src.replace('.png', '.jpeg');
      } else if (src.endsWith('.jpeg')) {
        img.src = src.replace('.jpeg', '.jpg');
      } else {
        img.src = '../logo.png';
      }
    } else {
      img.src = '../logo.png';
    }
  }
}, true);
