import { state } from './state.js';
import { parsePrice, cleanTurkishForSearch, getProductTypeName, getSafeFilename, getSourceKeyFromDomain, calculateSellingPrice, getEffectiveMargin } from './utils.js';
import { updateStatusIndicator } from './search.js';
import { calculateTotalDiscountForProduct } from './discounts.js';

// Fırat Boru istatistiklerini yükleyen fonksiyon
export async function loadFiratStats() {
  const getFiratStorage = (cb) => {
    try {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        chrome.storage.local.get(['firatBoruList', 'firatLastUpdate'], cb);
      } else {
        const rawList = localStorage.getItem('firatBoruList');
        const lastUpd = localStorage.getItem('firatLastUpdate');
        cb({ firatBoruList: rawList ? JSON.parse(rawList) : [], firatLastUpdate: lastUpd || 'Veri Yok' });
      }
    } catch(e) {
      cb({ firatBoruList: [], firatLastUpdate: 'Veri Yok' });
    }
  };

  getFiratStorage((res) => {
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
    const getList = (cb) => {
      try {
        if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
          chrome.storage.local.get(['firatBoruList'], cb);
        } else {
          const raw = localStorage.getItem('firatBoruList');
          cb({ firatBoruList: raw ? JSON.parse(raw) : [] });
        }
      } catch(e) {
        cb({ firatBoruList: [] });
      }
    };

    getList((res) => {
      const list = res.firatBoruList || [];

      if (list.length === 0) {
        updateStatusIndicator('SITE_F', 'error', 'Veri Yok');
        resolve();
        return;
      }

      const queryClean = cleanTurkishForSearch(query);
      const queryWords = queryClean.split(/\s+/).filter(w => w.length > 0);

      const matches = list.filter(item => {
        if (queryWords.length === 0) return false;
        const nameClean = item.name ? cleanTurkishForSearch(item.name) : '';
        const codeClean = item.code ? item.code.toLowerCase().trim() : '';
        return queryWords.every(word => nameClean.includes(word) || codeClean.includes(word));
      });

      const siteKey = 'SITE_F';
      const sourceName = 'Fırat Boru';
      const badgeClass = 'site_f';
      const domain = 'firatboru_excel';

      for (const item of matches) {
        const key = `b2b_local_firat_${item.code}`;

        const typeName = getProductTypeName(item.name);
        const safeFilename = getSafeFilename(typeName);
        // Görselleri yerel dizin yerine doğrudan CDN üzerinden çekiyoruz
        const IMAGE_BASE_URL = 'https://cdn.jsdelivr.net/gh/alisanakbass/AYG-B2B@main/';
        const finalImg = safeFilename ? `${IMAGE_BASE_URL}images/${safeFilename}.jpeg` : '../logo.png';

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

// Sepetteki veya verilen ürünleri teklif şablonuna yazıp indiren fonksiyon
export async function exportCartAsExcelOffer(presetTeklifNo, metadata, customItems, includeVat = true) {
  const items = customItems || Object.values(state.currentCart);
  if (items.length === 0) {
    alert("Teklif oluşturabilmek için sepetinizde ürün bulunmalıdır.");
    return;
  }
  
  if (items.length > 100) {
    alert("Teklif şablonu en fazla 100 ürün desteklemektedir. Lütfen sepetinizdeki ürün sayısını 100 veya daha az yapın.");
    return;
  }

let cachedTemplateArrayBuffer = null;
async function getTeklifTemplateArrayBuffer() {
  if (cachedTemplateArrayBuffer) {
    return cachedTemplateArrayBuffer.slice(0);
  }
  const fileUrl = chrome.runtime.getURL("AYG_TEKLİF.xlsx");
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Teklif şablonu (AYG_TEKLİF.xlsx) yüklenemedi: ${response.status}`);
  }
  cachedTemplateArrayBuffer = await response.arrayBuffer();
  return cachedTemplateArrayBuffer.slice(0);
}

  const arrayBuffer = await getTeklifTemplateArrayBuffer();
  
  // JSZip ile zip dosyasını yükle
  const zip = new JSZip();
  await zip.loadAsync(arrayBuffer);
  
  // sheet1.xml ve styles.xml dosyalarını string olarak oku
  const sheetXmlText = await zip.file("xl/worksheets/sheet1.xml").async("string");
  const stylesXmlText = await zip.file("xl/styles.xml").async("string");
  
  // XML DOM ağaçlarına dönüştür
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(sheetXmlText, "application/xml");
  const stylesDoc = parser.parseFromString(stylesXmlText, "application/xml");

  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

  // Sütun harfini sayısal indekse çevir (OpenXML sıralaması için)
  function colToNumber(col) {
    let num = 0;
    for (let i = 0; i < col.length; i++) {
      num = num * 26 + (col.charCodeAt(i) - 64);
    }
    return num;
  }

  // Yardımcı fonksiyonlar: Namespace'den bağımsız eleman bulma
  function findRow(r) {
    const rows = xmlDoc.getElementsByTagNameNS(ns, "row");
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute("r") === String(r)) {
        return rows[i];
      }
    }
    return null;
  }

  function findCell(rowNode, addr) {
    const cells = rowNode.getElementsByTagNameNS(ns, "c");
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].getAttribute("r") === addr) {
        return cells[i];
      }
    }
    return null;
  }

  // Hücre değerlerini ve formüllerini stili bozmadan XML düzeyinde güncellemek için yardımcı fonksiyon
  function setCell(r, c, val, type, formula, styleId) {
    const addr = `${c}${r}`;
    
    // Satırı bul veya oluştur
    let rowNode = findRow(r);
    if (!rowNode) {
      rowNode = xmlDoc.createElementNS(ns, "row");
      rowNode.setAttribute("r", String(r));
      
      const sheetData = xmlDoc.getElementsByTagNameNS(ns, "sheetData")[0];
      if (sheetData) {
        // Satırı numara sırasına göre doğru konuma yerleştir
        const siblingRows = sheetData.getElementsByTagNameNS(ns, "row");
        let inserted = false;
        for (let i = 0; i < siblingRows.length; i++) {
          const siblingR = parseInt(siblingRows[i].getAttribute("r"), 10);
          if (siblingR > r) {
            sheetData.insertBefore(rowNode, siblingRows[i]);
            inserted = true;
            break;
          }
        }
        if (!inserted) {
          sheetData.appendChild(rowNode);
        }
      } else {
        return;
      }
    }

    // Hücreyi bul veya oluştur
    let cellNode = findCell(rowNode, addr);
    if (!cellNode) {
      cellNode = xmlDoc.createElementNS(ns, "c");
      cellNode.setAttribute("r", addr);
      if (styleId) {
        cellNode.setAttribute("s", String(styleId));
      }
      
      // Hücreyi sütun sırasına göre doğru konuma yerleştir
      const newColNum = colToNumber(c);
      const siblingCells = rowNode.getElementsByTagNameNS(ns, "c");
      let inserted = false;
      for (let i = 0; i < siblingCells.length; i++) {
        const siblingAddr = siblingCells[i].getAttribute("r");
        const siblingCol = siblingAddr.replace(/[0-9]/g, "");
        if (colToNumber(siblingCol) > newColNum) {
          rowNode.insertBefore(cellNode, siblingCells[i]);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        rowNode.appendChild(cellNode);
      }
    } else {
      if (styleId) {
        cellNode.setAttribute("s", String(styleId));
      }
    }

    // Eğer değer null, undefined veya boş ise hücreyi temizle ve t özniteliğini kaldır
    if (val === null || val === undefined || val === "") {
      if (!formula) {
        cellNode.removeAttribute("t");
        cellNode.innerHTML = "";
        return;
      }
    }

    // Hücre değerini ata
    if (type === 's') {
      cellNode.setAttribute("t", "inlineStr");
      cellNode.innerHTML = "";
      
      const isNode = xmlDoc.createElementNS(ns, "is");
      const tNode = xmlDoc.createElementNS(ns, "t");
      tNode.textContent = val;
      isNode.appendChild(tNode);
      cellNode.appendChild(isNode);
    } else if (type === 'n') {
      cellNode.setAttribute("t", "n");
      cellNode.innerHTML = "";
      
      if (formula) {
        const fNode = xmlDoc.createElementNS(ns, "f");
        fNode.textContent = formula;
        cellNode.appendChild(fNode);
      }
      
      if (val !== undefined && val !== null && val !== "") {
        const vNode = xmlDoc.createElementNS(ns, "v");
        vNode.textContent = val;
        cellNode.appendChild(vNode);
      }
    }
  }

  // Ürünlerin doldurulacağı başlangıç satırı (Excel'de 18. satır)
  const startRow = 18;

  // Eğer ürün sayısı 22'den fazlaysa alt satırları (KDV, İmza vb.) XML düzeyinde kaydır
  if (items.length > 22) {
    const diff = items.length - 22;
    
    // Yardımcı hücre kaydırma fonksiyonu
    function shiftCellAddr(addr, rowDiff) {
      const match = addr.match(/^([A-Z]+)([0-9]+)$/);
      if (!match) return addr;
      const col = match[1];
      const row = parseInt(match[2], 10);
      return `${col}${row + rowDiff}`;
    }

    // 1. Satırları kaydır (40. satırdan büyük veya eşit olanları)
    const rows = Array.from(xmlDoc.getElementsByTagNameNS(ns, "row"));
    rows.sort((a, b) => parseInt(b.getAttribute("r"), 10) - parseInt(a.getAttribute("r"), 10));

    rows.forEach(rowNode => {
      const r = parseInt(rowNode.getAttribute("r"), 10);
      if (r >= 40) {
        const newR = r + diff;
        rowNode.setAttribute("r", String(newR));
        
        // Bu satırın altındaki c elementlerini de güncelle
        const cells = Array.from(rowNode.getElementsByTagNameNS(ns, "c"));
        cells.forEach(cellNode => {
          const addr = cellNode.getAttribute("r");
          cellNode.setAttribute("r", shiftCellAddr(addr, diff));
        });
      }
    });

    // 2. mergeCells düğümündeki birleştirilmiş hücreleri kaydır ve yeni ürün satırları için çoğalt
    const mergeCellsEl = xmlDoc.getElementsByTagNameNS(ns, "mergeCells")[0];
    if (mergeCellsEl) {
      const mergeCellsList = Array.from(mergeCellsEl.getElementsByTagNameNS(ns, "mergeCell"));
      
      mergeCellsList.forEach(mc => {
        const ref = mc.getAttribute("ref");
        const parts = ref.split(":");
        if (parts.length === 2) {
          const startMatch = parts[0].match(/^([A-Z]+)([0-9]+)$/);
          const endMatch = parts[1].match(/^([A-Z]+)([0-9]+)$/);
          
          if (startMatch && endMatch) {
            const startCol = startMatch[1];
            const startRowVal = parseInt(startMatch[2], 10);
            const endCol = endMatch[1];
            const endRowVal = parseInt(endMatch[2], 10);
            
            if (startRowVal >= 40) {
              mc.setAttribute("ref", `${startCol}${startRowVal + diff}:${endCol}${endRowVal + diff}`);
            }
          }
        }
      });

      // Yeni eklenen satırlar için (40'tan başlayıp startRow + items.length - 1'e kadar) mergeCell oluştur
      for (let r = 40; r < startRow + items.length; r++) {
        const newRanges = [
          `B${r}:C${r}`,
          `D${r}:H${r}`,
          `J${r}:K${r}`
        ];
        newRanges.forEach(ref => {
          const newMc = xmlDoc.createElementNS(ns, "mergeCell");
          newMc.setAttribute("ref", ref);
          mergeCellsEl.appendChild(newMc);
        });
      }
      
      const finalCells = mergeCellsEl.getElementsByTagNameNS(ns, "mergeCell");
      mergeCellsEl.setAttribute("count", String(finalCells.length));
    }
  }

  // Ürünleri tek tek yerleştir
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const r = startRow + i;

    // Fiyat ve indirim hesaplamaları
    const sourceKey = item.sourceKey || getSourceKeyFromDomain(item.domain);
    const discInfo = calculateTotalDiscountForProduct(item.name, item.key, sourceKey);
    const margin = getEffectiveMargin(item.basePrice, sourceKey);
    
    // KDV'li veya KDV'siz (karsız alış) birim satış fiyatı
    const rawUnitPriceNoVat = includeVat 
      ? calculateSellingPrice(item.basePrice, margin, true) 
      : calculateSellingPrice(item.basePrice, 0, false);
    const unitPriceNoVat = rawUnitPriceNoVat * (1 - discInfo.discount / 100);
    
    // Paket/Adet çarpanı
    const itemUnit = (item.unit || 'ADET').toUpperCase();
    const itemPackQty = item.packQuantity || 1;
    const multiplier = itemUnit === 'ADET' ? 1 : itemPackQty;
    
    const finalUnitPrice = unitPriceNoVat * multiplier;

    // Hücreleri XML düzeyinde güncelle (stilleri bozmadan)
    // Yeni eklenen satırların kenarlıkları düzgün görünsün diye stilleri (styleId) atıyoruz
    setCell(r, 'D', item.name, 's', undefined, 59);
    setCell(r, 'I', itemUnit, 's', undefined, 39);
    setCell(r, 'J', item.qty, 'n', undefined, 51);
    setCell(r, 'L', Number(finalUnitPrice.toFixed(2)), 'n', undefined, 37);
    setCell(r, 'M', undefined, 'n', `J${r}*L${r}`, 38);
    
    // Çizgilerin kaybolmaması için boş hücrelere de stillerini verelim
    setCell(r, 'B', "", 's', undefined, 57);
    setCell(r, 'C', "", 's', undefined, 58);
    setCell(r, 'E', "", 's', undefined, 60);
    setCell(r, 'F', "", 's', undefined, 60);
    setCell(r, 'G', "", 's', undefined, 60);
    setCell(r, 'H', "", 's', undefined, 61);
    setCell(r, 'K', "", 's', undefined, 52);
  }

  // Eğer sepetimizdeki ürün sayısı 22'den azsa, şablonun orijinal 22 satırlık tablosunu temizleyelim (alt kısım kaymadı)
  if (items.length < 22) {
    for (let i = items.length; i < 22; i++) {
      const r = startRow + i;
      setCell(r, 'D', "", 's');
      setCell(r, 'I', "", 's');
      setCell(r, 'J', null, 'n');
      setCell(r, 'L', null, 'n');
      setCell(r, 'M', null, 'n');
    }
  }

  // Toplam satırını bulalım (normalde 40. satırdı, kaydırıldıysa 40 + diff. satır)
  const totalRow = 40 + (items.length > 22 ? (items.length - 22) : 0);
  setCell(totalRow, 'B', includeVat ? "KDV DAHİL" : "KDV HARİÇ", 's');
  setCell(totalRow, 'M', undefined, 'n', `SUM(M18:M${18 + items.length - 1})`, 35);

  // Tarih ve Teklif No güncelle (K11 ve K12 orijinal etiketleri korunur, L11 ve L12 hücrelerine değerler yazılır)
  const bugun = new Date().toLocaleDateString('tr-TR');
  const teklifNo = presetTeklifNo || ("AYG-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + Math.floor(1000 + Math.random() * 9000));

  setCell(11, 'L', teklifNo, 's');
  setCell(12, 'L', bugun, 's');

  // Müşteri bilgilerini Excel'e yaz (B sütunu hücreleri hedef alınarak başlık etiketleriyle yazılır)
  if (metadata) {
    setCell(10, 'B', `SAYIN: ${metadata.sayin || ""}`, 's');
    setCell(11, 'B', `Adres  : ${metadata.adres || ""}`, 's');
    setCell(13, 'B', `SEVK ADRESİ: ${metadata.sevkAdresi || ""}`, 's');
    setCell(14, 'B', `   Telefon: ${metadata.telefon || ""}`, 's');
    setCell(14, 'F', `Fax : ${metadata.fax || ""}`, 's');
    setCell(14, 'L', metadata.sayinSag || "", 's');
    setCell(15, 'B', `   Vergi Dairesi: ${metadata.vergiDairesi || ""}`, 's');
    setCell(15, 'F', `Vergi No : ${metadata.vergiNo || ""}`, 's');
  }

  // mergeCells düğümünü dinamik olarak güncelle
  const mergeCellsEl = xmlDoc.getElementsByTagNameNS(ns, "mergeCells")[0];
  if (mergeCellsEl) {
    const mergeCellsList = Array.from(mergeCellsEl.getElementsByTagNameNS(ns, "mergeCell"));
    
    // Çakışan eski birleştirmeleri temizle
    const rangesToRemove = [
      "C10:F10", "C11:F11", "B14:C14", "B15:C15",
      "D14:E14", "D15:E15", "G14:H14", "G15:H15"
    ];
    
    mergeCellsList.forEach(mc => {
      const ref = mc.getAttribute("ref");
      if (rangesToRemove.includes(ref)) {
        mergeCellsEl.removeChild(mc);
      }
    });
    
    // Kullanıcının istediği yeni birleştirme aralıklarını ekle
    const newRanges = [
      "B10:D10",
      "B11:D11",
      "B13:D13",
      "B14:D14",
      "B15:D15",
      "F14:H14",
      "F15:H15"
    ];
    
    newRanges.forEach(ref => {
      let exists = false;
      const currentCells = mergeCellsEl.getElementsByTagNameNS(ns, "mergeCell");
      for (let i = 0; i < currentCells.length; i++) {
        if (currentCells[i].getAttribute("ref") === ref) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        const newMc = xmlDoc.createElementNS(ns, "mergeCell");
        newMc.setAttribute("ref", ref);
        mergeCellsEl.appendChild(newMc);
      }
    });
    
    // Count özniteliğini güncelle
    const finalCells = mergeCellsEl.getElementsByTagNameNS(ns, "mergeCell");
    mergeCellsEl.setAttribute("count", String(finalCells.length));
  }

  // J5 hücresinin stili (s="28") için dikey hizalamayı "top" (üst) olarak güncelle
  if (stylesDoc) {
    const cellXfs = stylesDoc.getElementsByTagName("cellXfs")[0];
    if (cellXfs) {
      const xfs = cellXfs.getElementsByTagName("xf");
      const xf28 = xfs[28];
      if (xf28) {
        let alignment = xf28.getElementsByTagName("alignment")[0];
        if (!alignment) {
          alignment = stylesDoc.createElementNS(ns, "alignment");
          xf28.appendChild(alignment);
        }
        alignment.setAttribute("vertical", "top");
        xf28.setAttribute("applyAlignment", "1");
      }
    }
  }

  // XML belgelerini geri string'e dönüştür
  const serializer = new XMLSerializer();
  const newSheetXmlText = serializer.serializeToString(xmlDoc);
  const newStylesXmlText = serializer.serializeToString(stylesDoc);
  
  // ZIP dosyasına güncel dosyaları yaz
  zip.file("xl/worksheets/sheet1.xml", newSheetXmlText);
  zip.file("xl/styles.xml", newStylesXmlText);
  
  // ZIP dosyasını oluştur ve indir
  const zipContent = await zip.generateAsync({ type: "blob" });
  
  const url = URL.createObjectURL(zipContent);
  const a = document.createElement("a");
  a.href = url;
  const vatSuffix = includeVat ? "KDV_DAHIL" : "KDV_HARIC";
  a.download = `AYG_TEKLIF_${teklifNo}_${vatSuffix}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Boş Şablon Teklif Excel Dosyasını İndiren Fonksiyon
export async function downloadBlankTeklifExcel(customFilename) {
  try {
    let templateUrl = "../AYG_TEKLİF.xlsx";
    if (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) {
      templateUrl = chrome.runtime.getURL("AYG_TEKLİF.xlsx");
    }

    const response = await fetch(templateUrl);
    if (!response.ok) {
      throw new Error(`Teklif şablonu yüklenemedi (HTTP ${response.status})`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    let filename = (customFilename || "AYG_TEKLIF_BOS.xlsx").trim();
    if (!filename.toLowerCase().endsWith(".xlsx")) {
      filename += ".xlsx";
    }

    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("[B2B Excel] Boş teklif indirme hatası:", err);
    alert("Boş teklif Excel dosyası indirilirken bir hata oluştu: " + err.message);
  }
}

// Şantiye Evrak Analizinden Gelen Verileri Şablona Yazıp İndiren Fonksiyon
export async function exportSantiyeOfferAsExcel(santiyeData) {
  try {
    const kalemler = santiyeData?.kalemler || [];
    if (kalemler.length === 0) {
      alert("Dışa aktarılacak malzeme kalemi bulunamadı.");
      return;
    }

    let templateUrl = "../AYG_TEKLİF.xlsx";
    if (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) {
      templateUrl = chrome.runtime.getURL("AYG_TEKLİF.xlsx");
    }

    const response = await fetch(templateUrl);
    if (!response.ok) {
      throw new Error(`Teklif şablonu yüklenemedi: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();

    if (typeof JSZip === 'undefined') {
      throw new Error("JSZip kütüphanesi yüklenemedi. Lütfen sayfayı yenileyin.");
    }

    const zip = new JSZip();
    await zip.loadAsync(arrayBuffer);

    const sheetXmlText = await zip.file("xl/worksheets/sheet1.xml").async("string");
    const stylesXmlText = await zip.file("xl/styles.xml").async("string");

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(sheetXmlText, "application/xml");
    const stylesDoc = parser.parseFromString(stylesXmlText, "application/xml");
    const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

    function colToNumber(col) {
      let num = 0;
      for (let i = 0; i < col.length; i++) {
        num = num * 26 + (col.charCodeAt(i) - 64);
      }
      return num;
    }

    function findRow(r) {
      const rows = xmlDoc.getElementsByTagNameNS(ns, "row");
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute("r") === String(r)) return rows[i];
      }
      return null;
    }

    function findCell(rowNode, addr) {
      const cells = rowNode.getElementsByTagNameNS(ns, "c");
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].getAttribute("r") === addr) return cells[i];
      }
      return null;
    }

    function setCell(r, c, val, type, formula, styleId) {
      const addr = `${c}${r}`;
      let rowNode = findRow(r);
      if (!rowNode) {
        rowNode = xmlDoc.createElementNS(ns, "row");
        rowNode.setAttribute("r", String(r));
        const sheetData = xmlDoc.getElementsByTagNameNS(ns, "sheetData")[0];
        if (sheetData) {
          const siblingRows = sheetData.getElementsByTagNameNS(ns, "row");
          let inserted = false;
          for (let i = 0; i < siblingRows.length; i++) {
            const siblingR = parseInt(siblingRows[i].getAttribute("r"), 10);
            if (siblingR > r) {
              sheetData.insertBefore(rowNode, siblingRows[i]);
              inserted = true;
              break;
            }
          }
          if (!inserted) sheetData.appendChild(rowNode);
        } else {
          return;
        }
      }

      let cell = findCell(rowNode, addr);
      if (!cell) {
        cell = xmlDoc.createElementNS(ns, "c");
        cell.setAttribute("r", addr);
        const colNum = colToNumber(c);
        const cells = rowNode.getElementsByTagNameNS(ns, "c");
        let inserted = false;
        for (let i = 0; i < cells.length; i++) {
          const cAddr = cells[i].getAttribute("r");
          const cCol = cAddr.replace(/[0-9]/g, "");
          if (colToNumber(cCol) > colNum) {
            rowNode.insertBefore(cell, cells[i]);
            inserted = true;
            break;
          }
        }
        if (!inserted) rowNode.appendChild(cell);
      }

      if (styleId !== undefined) {
        cell.setAttribute("s", String(styleId));
      }

      if (formula) {
        let fNode = cell.getElementsByTagNameNS(ns, "f")[0];
        if (!fNode) {
          fNode = xmlDoc.createElementNS(ns, "f");
          cell.appendChild(fNode);
        }
        fNode.textContent = formula;
      } else {
        const fNode = cell.getElementsByTagNameNS(ns, "f")[0];
        if (fNode) cell.removeChild(fNode);
      }

      if (val !== undefined && val !== null && val !== "") {
        if (type === "s") {
          cell.setAttribute("t", "inlineStr");
          let isNode = cell.getElementsByTagNameNS(ns, "is")[0];
          if (!isNode) {
            isNode = xmlDoc.createElementNS(ns, "is");
            cell.appendChild(isNode);
          }
          let tNode = isNode.getElementsByTagNameNS(ns, "t")[0];
          if (!tNode) {
            tNode = xmlDoc.createElementNS(ns, "t");
            isNode.appendChild(tNode);
          }
          tNode.textContent = String(val);
          const vNode = cell.getElementsByTagNameNS(ns, "v")[0];
          if (vNode) cell.removeChild(vNode);
        } else {
          cell.removeAttribute("t");
          let vNode = cell.getElementsByTagNameNS(ns, "v")[0];
          if (!vNode) {
            vNode = xmlDoc.createElementNS(ns, "v");
            cell.appendChild(vNode);
          }
          vNode.textContent = String(val);
        }
      } else if (!formula) {
        const vNode = cell.getElementsByTagNameNS(ns, "v")[0];
        if (vNode) cell.removeChild(vNode);
        const isNode = cell.getElementsByTagNameNS(ns, "is")[0];
        if (isNode) cell.removeChild(isNode);
      }
    }

    // Tarih ve Teklif No
    const bugunTarih = new Date().toLocaleDateString('tr-TR');
    const belgeTarihi = santiyeData?.talep_tarihi || bugunTarih;
    const teklifNo = "AYG-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + Math.floor(1000 + Math.random() * 9000);

    setCell(11, 'L', teklifNo, 's');
    setCell(12, 'L', belgeTarihi, 's');

    // Müşteri ve Şantiye Bilgileri
    const musteriAdi = santiyeData?.musteri_adi || "";
    const santiyeAdi = santiyeData?.santiye_adi || "";

    // B10'da sabit "SAYIN:" başlığı vardır; müşteri adı C10:F10 geniş birleşik alanına yazılır.
    setCell(10, 'C', musteriAdi, 's');
    // B13'te sabit "SEVK ADRESİ:" başlığı vardır; şantiye adı C13 alanına yazılır.
    setCell(13, 'C', santiyeAdi, 's');

    // Dinamik Tablo Genişletme (Şablon 18..39 arası 22 satır kapasitelidir)
    const startRow = 18;
    const defaultCapacity = 22; // 18..39 arası
    const splitRow = 40; // Sarı TOPLAM ve altbilgilerin başladığı satır

    if (kalemler.length > defaultCapacity) {
      const shiftCount = kalemler.length - defaultCapacity;
      const sheetData = xmlDoc.getElementsByTagNameNS(ns, "sheetData")[0];
      const allRows = Array.from(sheetData.getElementsByTagNameNS(ns, "row"));

      // 1. 40 ve sonraki tüm satırları aşağı ötele (tersten dolaşarak çakışmayı önle)
      for (let i = allRows.length - 1; i >= 0; i--) {
        const rowNode = allRows[i];
        const oldR = parseInt(rowNode.getAttribute("r"), 10);
        if (oldR >= splitRow) {
          const newR = oldR + shiftCount;
          rowNode.setAttribute("r", String(newR));
          const cells = Array.from(rowNode.getElementsByTagNameNS(ns, "c"));
          for (const cell of cells) {
            const oldAddr = cell.getAttribute("r");
            const colLetters = oldAddr.replace(/[0-9]/g, "");
            cell.setAttribute("r", `${colLetters}${newR}`);
          }
        }
      }

      // 2. 39. satırın şablon stillerini referans al
      const refRow = findRow(39);

      // 3. Araya 40'tan 40+shiftCount-1'e kadar yeni ürün satırları ekle
      const firstShiftedRow = findRow(splitRow + shiftCount);
      for (let r = splitRow; r < splitRow + shiftCount; r++) {
        const newRow = xmlDoc.createElementNS(ns, "row");
        newRow.setAttribute("r", String(r));
        if (refRow) {
          if (refRow.getAttribute("ht")) newRow.setAttribute("ht", refRow.getAttribute("ht"));
          if (refRow.getAttribute("customHeight")) newRow.setAttribute("customHeight", refRow.getAttribute("customHeight"));

          const refCells = Array.from(refRow.getElementsByTagNameNS(ns, "c"));
          for (const refCell of refCells) {
            const refAddr = refCell.getAttribute("r");
            const colLetters = refAddr.replace(/[0-9]/g, "");
            const newCell = xmlDoc.createElementNS(ns, "c");
            newCell.setAttribute("r", `${colLetters}${r}`);
            if (refCell.getAttribute("s")) {
              newCell.setAttribute("s", refCell.getAttribute("s"));
            }
            newRow.appendChild(newCell);
          }
        }

        if (firstShiftedRow) {
          sheetData.insertBefore(newRow, firstShiftedRow);
        } else {
          sheetData.appendChild(newRow);
        }
      }

      // 4. MergeCells (Birleşik Hücreler) koordinatlarını güncelle
      const mergeCellsNodes = xmlDoc.getElementsByTagNameNS(ns, "mergeCells");
      if (mergeCellsNodes && mergeCellsNodes.length > 0) {
        const mergeCells = mergeCellsNodes[0];
        const mergeList = Array.from(mergeCells.getElementsByTagNameNS(ns, "mergeCell"));

        for (const mc of mergeList) {
          const ref = mc.getAttribute("ref") || "";
          const parts = ref.split(":");
          if (parts.length === 2) {
            const startCol = parts[0].replace(/[0-9]/g, "");
            const startR = parseInt(parts[0].replace(/[^0-9]/g, ""), 10);
            const endCol = parts[1].replace(/[0-9]/g, "");
            const endR = parseInt(parts[1].replace(/[^0-9]/g, ""), 10);

            if (startR >= splitRow) {
              const newStartR = startR + shiftCount;
              const newEndR = endR + shiftCount;
              mc.setAttribute("ref", `${startCol}${newStartR}:${endCol}${newEndR}`);
            }
          }
        }

        // Yeni satırlar için ürün birleştirmelerini ekle (B:C, D:H, J:K)
        for (let r = splitRow; r < splitRow + shiftCount; r++) {
          const m1 = xmlDoc.createElementNS(ns, "mergeCell");
          m1.setAttribute("ref", `B${r}:C${r}`);
          mergeCells.appendChild(m1);

          const m2 = xmlDoc.createElementNS(ns, "mergeCell");
          m2.setAttribute("ref", `D${r}:H${r}`);
          mergeCells.appendChild(m2);

          const m3 = xmlDoc.createElementNS(ns, "mergeCell");
          m3.setAttribute("ref", `J${r}:K${r}`);
          mergeCells.appendChild(m3);
        }

        const currentCount = parseInt(mergeCells.getAttribute("count") || "0", 10);
        mergeCells.setAttribute("count", String(currentCount + shiftCount * 3));
      }
    }

    // Kalemleri doldur (Fiyat ve Tutar boş kalır)
    for (let i = 0; i < kalemler.length; i++) {
      const r = startRow + i;
      const kalem = kalemler[i];
      const sira = kalem.sira_no || (i + 1);
      const urunAdi = kalem.urun_adi || "";
      const birim = (kalem.birim || "ADET").toUpperCase();
      const miktar = typeof kalem.miktar === "number" ? kalem.miktar : (parseFloat(String(kalem.miktar).replace(",", ".")) || 0);

      setCell(r, 'B', sira, 'n');
      setCell(r, 'D', urunAdi, 's');
      setCell(r, 'I', birim, 's');
      setCell(r, 'J', miktar, 'n');
      // L (Birim Fiyat) ve M (Tutar) sütunları BOŞ bırakılır
      setCell(r, 'L', '', 's');
      setCell(r, 'M', '', 's');
    }

    // Toplam satırını belirle (40 veya ötelenmiş satır)
    const totalRow = splitRow + (kalemler.length > defaultCapacity ? (kalemler.length - defaultCapacity) : 0);
    setCell(totalRow, 'B', "KDV HARİÇ", 's');
    setCell(totalRow, 'L', "TOPLAM", 's');
    setCell(totalRow, 'M', '', 's'); // Tutar boş

    const serializer = new XMLSerializer();
    const newSheetXmlText = serializer.serializeToString(xmlDoc);
    const newStylesXmlText = serializer.serializeToString(stylesDoc);

    zip.file("xl/worksheets/sheet1.xml", newSheetXmlText);
    zip.file("xl/styles.xml", newStylesXmlText);

    // calcChain.xml eski formül kaydını temizle (Excel'in onarım uyarısı vermesini önler)
    zip.remove("xl/calcChain.xml");
    try {
      const ctFile = zip.file("[Content_Types].xml");
      if (ctFile) {
        const ctText = await ctFile.async("string");
        zip.file("[Content_Types].xml", ctText.replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/g, ""));
      }
      const relsFile = zip.file("xl/_rels/workbook.xml.rels");
      if (relsFile) {
        const relsText = await relsFile.async("string");
        zip.file("xl/_rels/workbook.xml.rels", relsText.replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/g, ""));
      }
    } catch (cleanErr) {
      console.warn("[B2B Excel] calcChain temizleme uyarısı:", cleanErr);
    }

    const zipContent = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipContent);
    const a = document.createElement("a");
    a.href = url;

    // Temiz dosya ismi
    const cleanMusteri = (musteriAdi || "Musteri").replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]/g, "_").substring(0, 30);
    const cleanTarih = belgeTarihi.replace(/[\.\/\\:]/g, "_");
    a.download = `Teklif_${cleanMusteri}_${cleanTarih}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("[B2B Excel] Şantiye teklifi indirme hatası:", err);
    alert("Teklif Excel dosyası oluşturulurken hata oluştu: " + err.message);
  }
}

