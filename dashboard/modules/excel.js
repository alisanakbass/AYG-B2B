import { state } from './state.js';
import { parsePrice, cleanTurkishForSearch, getProductTypeName, getSafeFilename } from './utils.js';
import { updateStatusIndicator } from './search.js';

// Fırat Boru istatistiklerini yükleyen fonksiyon
export async function loadFiratStats() {
  chrome.storage.local.get(['firatBoruList', 'firatLastUpdate'], (res) => {
    const list = res.firatBoruList || [];
    const lastUpdate = res.firatLastUpdate || 'Veri Yok';

    const countEl = document.getElementById('firat-db-count');
    const dateEl = document.getElementById('firat-db-date');
    const statusEl = document.getElementById('site-f-status');

    if (countEl) countEl.textContent = list.length;
    if (dateEl) dateEl.textContent = lastUpdate;

    if (statusEl) {
      if (list.length > 0) {
        statusEl.className = 'status-indicator success';
        statusEl.textContent = `${list.length} Ürün`;
      } else {
        statusEl.className = 'status-indicator error';
        statusEl.textContent = 'Veri Yok';
      }
    }
  });
}

// Yerel Fırat Boru verilerinde arama yapan fonksiyon
export async function fetchFromLocalFirat(query) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['firatBoruList'], (res) => {
      const list = res.firatBoruList || [];

      if (list.length === 0) {
        updateStatusIndicator('SITE_F', 'error', 'Veri Yok');
        resolve();
        return;
      }

      const queryClean = cleanTurkishForSearch(query);
      const matches = list.filter(item => {
        const nameClean = item.name ? cleanTurkishForSearch(item.name) : '';
        const codeClean = item.code ? item.code.toLowerCase().trim() : '';
        return nameClean.includes(queryClean) || codeClean.includes(queryClean);
      });

      const siteKey = 'SITE_F';
      const sourceName = 'Fırat Boru';
      const badgeClass = 'site_f';
      const domain = 'firatboru_excel';

      for (const item of matches) {
        const key = `b2b_local_firat_${item.code}`;

        const typeName = getProductTypeName(item.name);
        const safeFilename = getSafeFilename(typeName);
        const finalImg = safeFilename ? `images/${safeFilename}.jpeg` : '../logo.png';

        state.currentResults.push({
          key,
          name: item.name,
          basePrice: item.price,
          domain,
          imgUrl: finalImg,
          sourceKey: siteKey,
          sourceName,
          badgeClass,
          unit: item.unit || 'ADET',
          packQuantity: item.packQuantity || 1,
          itemCode: item.code
        });
      }

      updateStatusIndicator('SITE_F', 'success', `${matches.length} Ürün`);
      resolve();
    });
  });
}

// Eklenti dizinindeki varsayılan Excel dosyasını otomatik yükleyen fonksiyon
export async function loadDefaultExcelIfEmpty() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['firatBoruList'], async (res) => {
      if (res.firatBoruList && res.firatBoruList.length > 0) {
        resolve();
        return;
      }

      console.log("[B2B Fırat] Yerel veritabanı boş, varsayılan Excel yükleniyor...");
      try {
        const fileUrl = chrome.runtime.getURL("ADANA 20 HAZİRAN 2026 BORU FİYAT LİSTESİ.xlsx");
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Varsayılan Excel dosyası yüklenemedi: ${response.status}`);

        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const parsedProducts = [];

        for (let i = 4; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 6) continue;

          const code = row[1] ? row[1].toString().trim() : '';
          const packaging = row[2] ? row[2].toString().trim() : '';
          const name = row[3] ? row[3].toString().trim() : '';
          const unitRaw = row[4] ? row[4].toString().trim() : 'Ad.';
          const priceRaw = row[5];

          if (!code || !name) continue;

          let price = 0;
          if (typeof priceRaw === 'number') {
            price = priceRaw;
          } else if (priceRaw) {
            price = parsePrice(priceRaw.toString());
          }

          let unit = 'ADET';
          let packQuantity = 1;

          if (unitRaw) {
            const uUpper = unitRaw.toUpperCase();
            if (uUpper.includes('PAKET') || uUpper.includes('PK') || uUpper.includes('BAG') || uUpper.includes('BAĞ')) {
              unit = 'PAKET';
            } else if (uUpper.includes('KOLİ') || uUpper.includes('KOLI')) {
              unit = 'KOLİ';
            } else if (uUpper.includes('KUTU')) {
              unit = 'KUTU';
            }
          }

          if (packaging) {
            const qtyMatch = packaging.match(/^(\d+)/);
            if (qtyMatch) {
              packQuantity = parseInt(qtyMatch[1], 10);
            }
          }

          parsedProducts.push({
            code,
            name: `${name} (${packaging || 'Adet'})`,
            price,
            unit,
            packQuantity,
            imgUrl: '../logo.png'
          });
        }

        if (parsedProducts.length > 0) {
          chrome.storage.local.set({
            firatBoruList: parsedProducts,
            firatLastUpdate: "20 HAZİRAN 2026 (Varsayılan)"
          }, () => {
            console.log(`[B2B Fırat] Varsayılan Excel başarıyla yüklendi: ${parsedProducts.length} ürün.`);
            resolve();
          });
        } else {
          resolve();
        }
      } catch (err) {
        console.error("[B2B Fırat] Varsayılan Excel yükleme hatası:", err);
        resolve();
      }
    });
  });
}

// Excel Dosyası Yükleyici Event Listener Tanımlayıcısı
export function setupExcelListeners() {
  const excelInput = document.getElementById('firat-excel-input');
  const uploadBtn = document.getElementById('upload-excel-btn');
  const uploadStatus = document.getElementById('excel-upload-status');

  if (uploadBtn && excelInput) {
    uploadBtn.addEventListener('click', () => {
      excelInput.click();
    });
  }

  if (excelInput) {
    excelInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (uploadStatus) {
        uploadStatus.style.display = 'block';
        uploadStatus.style.background = 'rgba(59, 130, 246, 0.1)';
        uploadStatus.style.color = '#3b82f6';
        uploadStatus.textContent = 'Dosya okunuyor, lütfen bekleyin...';
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          const parsedProducts = [];

          for (let i = 4; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 6) continue;

            const code = row[1] ? row[1].toString().trim() : '';
            const packaging = row[2] ? row[2].toString().trim() : '';
            const name = row[3] ? row[3].toString().trim() : '';
            const unitRaw = row[4] ? row[4].toString().trim() : 'Ad.';
            const priceRaw = row[5];

            if (!code || !name) continue;

            let price = 0;
            if (typeof priceRaw === 'number') {
              price = priceRaw;
            } else if (priceRaw) {
              price = parsePrice(priceRaw.toString());
            }

            let unit = 'ADET';
            let packQuantity = 1;

            if (unitRaw) {
              const uUpper = unitRaw.toUpperCase();
              if (uUpper.includes('PAKET') || uUpper.includes('PK') || uUpper.includes('BAG') || uUpper.includes('BAĞ')) {
                unit = 'PAKET';
              } else if (uUpper.includes('KOLİ') || uUpper.includes('KOLI')) {
                unit = 'KOLİ';
              } else if (uUpper.includes('KUTU')) {
                unit = 'KUTU';
              }
            }

            parsedProducts.push({
              code,
              name: `${name} (${packaging || 'Adet'})`,
              price,
              unit,
              packQuantity,
              imgUrl: '../logo.png'
            });
          }

          if (parsedProducts.length === 0) {
            throw new Error("Excel dosyasından geçerli bir ürün okunamadı. Lütfen formatı kontrol edin.");
          }

          const dateStr = new Date().toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          chrome.storage.local.set({
            firatBoruList: parsedProducts,
            firatLastUpdate: dateStr
          }, () => {
            if (uploadStatus) {
              uploadStatus.style.background = 'rgba(16, 185, 129, 0.1)';
              uploadStatus.style.color = '#10b981';
              uploadStatus.textContent = `Başarılı! ${parsedProducts.length} ürün yüklendi.`;
            }
            loadFiratStats();
            alert(`Excel veritabanı başarıyla güncellendi!\nToplam ${parsedProducts.length} ürün sisteme yüklendi.`);
          });

        } catch (err) {
          console.error('[B2B Excel] Yükleme hatası:', err);
          if (uploadStatus) {
            uploadStatus.style.background = 'rgba(239, 68, 68, 0.1)';
            uploadStatus.style.color = '#ef4444';
            uploadStatus.textContent = `Hata: ${err.message}`;
          }
        }
      };

      reader.readAsArrayBuffer(file);
    });
  }
}
