import { exportSantiyeOfferAsExcel } from './excel.js';

// Varsayılan Yapılandırma
const DEFAULT_GROQ_API_KEY = atob("Z3NrX0dWVjFrWWF0b2pNcmdEbmNNbFhPV0dkeWJyRllITFlsbVVONWtveGRGWnNDZUFFVFFzVWg=");
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
const DEFAULT_OCR_SPACE_KEY = "K81135367288957"; // Kullanıcının kişisel ücretsiz OCR.space anahtarı

// Modül İçi Durum (State)
let santiyeState = {
  currentFile: null,
  currentImageDataUrl: null,
  extractedData: null,
  groqApiKey: DEFAULT_GROQ_API_KEY,
  selectedModel: DEFAULT_GROQ_MODEL,
  ocrSpaceApiKey: DEFAULT_OCR_SPACE_KEY
};

/**
 * Groq ve OCR.Space API ayarlarını chrome.storage'dan yükler
 */
export async function loadGroqSettings() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['groq_api_key', 'groq_vision_model', 'ocr_space_api_key'], (result) => {
        const oldRevokedKey = atob("Z3NrXzNsMlROaUU3QXlMeWt3T3BVbUNiV0dkeWJyRllsdnR6dGFFT056MXQ2cFFPWUoxaWltSQ==");
        if (result.groq_api_key && result.groq_api_key !== oldRevokedKey) {
          santiyeState.groqApiKey = result.groq_api_key;
        } else {
          santiyeState.groqApiKey = DEFAULT_GROQ_API_KEY;
          chrome.storage.local.set({ groq_api_key: DEFAULT_GROQ_API_KEY });
        }
        santiyeState.selectedModel = result.groq_vision_model || DEFAULT_GROQ_MODEL;
        if (result.ocr_space_api_key && result.ocr_space_api_key !== "K87899142388957") {
          santiyeState.ocrSpaceApiKey = result.ocr_space_api_key;
        } else {
          santiyeState.ocrSpaceApiKey = DEFAULT_OCR_SPACE_KEY;
        }
        resolve(santiyeState);
      });
    } else {
      resolve(santiyeState);
    }
  });
}

/**
 * Groq ve OCR.Space API ayarlarını kaydeder
 */
export async function saveGroqSettings(apiKey, model, ocrKey) {
  return new Promise((resolve) => {
    santiyeState.groqApiKey = apiKey ? apiKey.trim() : DEFAULT_GROQ_API_KEY;
    santiyeState.selectedModel = model || DEFAULT_GROQ_MODEL;
    santiyeState.ocrSpaceApiKey = ocrKey ? ocrKey.trim() : DEFAULT_OCR_SPACE_KEY;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        groq_api_key: santiyeState.groqApiKey,
        groq_vision_model: santiyeState.selectedModel,
        ocr_space_api_key: santiyeState.ocrSpaceApiKey
      }, () => {
        resolve(true);
      });
    } else {
      resolve(true);
    }
  });
}

/**
 * PDF dosyasını Canvas aracılığıyla JPEG DataURL'e çevirir
 */
async function renderPdfToDataUrl(file) {
  if (typeof window.pdfjsLib === 'undefined') {
    throw new Error("PDF.js kütüphanesi yüklenemedi. Lütfen görsel (JPG, PNG) formatı yüklemeyi deneyin.");
  }

  if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.min.js");
    } else {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "../pdf.worker.min.js";
    }
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport: viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Dosyayı DataURL'e çevirir (Görsel veya PDF)
 */
async function convertFileToDataUrl(file) {
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();

  if (fileType.includes("pdf") || fileName.endsWith(".pdf")) {
    return await renderPdfToDataUrl(file);
  } else {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Dosya okunamadı."));
      reader.readAsDataURL(file);
    });
  }
}

/**
 * OCR.Space API (Table Engine 2) ile görselden yüksek doğruluklu metin çıkarır
 */
async function performOcrSpace(imageDataUrl, apiKey, retryCount = 0) {
  const finalApiKey = apiKey || DEFAULT_OCR_SPACE_KEY;

  const formData = new URLSearchParams();
  formData.append("base64Image", imageDataUrl);
  formData.append("language", "tur");
  formData.append("isTable", "true");
  formData.append("OCREngine", "2"); // Tablolar ve sayılar için optimize edilmiş motor
  formData.append("scale", "true");
  formData.append("apikey", finalApiKey);

  let response;
  try {
    response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formData.toString()
    });
  } catch (netErr) {
    if (retryCount < 2) {
      await new Promise(r => setTimeout(r, 1500));
      return performOcrSpace(imageDataUrl, apiKey, retryCount + 1);
    }
    throw netErr;
  }

  if (response.status === 429 && retryCount < 2) {
    await new Promise(r => setTimeout(r, 2500));
    return performOcrSpace(imageDataUrl, apiKey, retryCount + 1);
  }

  if (!response.ok) {
    throw new Error(`OCR.Space API Bağlantı Hatası: HTTP ${response.status}`);
  }

  const result = await response.json();
  if (result.IsErroredOnProcessing) {
    const errMsg = result.ErrorMessage ? result.ErrorMessage.join(", ") : "Bilinmeyen OCR hatası";
    throw new Error(`OCR.Space İşleme Hatası: ${errMsg}`);
  }

  const parsedResults = result.ParsedResults || [];
  if (parsedResults.length === 0) {
    throw new Error("OCR.Space belgeden hiçbir metin okuyamadı.");
  }

  const combinedText = parsedResults.map(p => p.ParsedText || "").join("\n");
  return combinedText.trim();
}

/**
 * Groq Qwen Metin Modeli üzerinden çıkarılan ham metni yapılandırılmış JSON'a dönüştürür
 */
async function analyzeTextWithGroq(extractedText, apiKey, model) {
  if (!apiKey) {
    throw new Error("Lütfen önce 'Ayarlar' sekmesinden GROQ API Anahtarınızı kaydedin.");
  }

  const systemPrompt = `Sen deneyimli bir inşaat, şantiye ve malzeme tedarik uzmanısın.
Sana bir faturadan, sevk fişinden veya satınalma talep formundan OCR ile okunmuş ham metin verilecek.
Bu metni titizlikle inceleyerek müşteri/firma/muhatap adını, şantiye/teslimat adresini, belge tarihini ve 1. kalemden sonuncu kaleme kadar TÜM malzeme listesini eksiksiz çıkar.

Kurallar:
1. Her malzemenin tam adını, ölçüsünü, kalitesini veya teknik özelliğini eksiksiz ürün adı olarak yaz (örn: "AYAKKABI NO.38", "MANTOLAMA DUBEL ÇELIK ÇIVILI 9,5MM", "MATKAP UCU 7 LIK", "KESME TAŞI 115x1,0x22.23").
2. Birimleri standartlaştır (ADET, METRE, PAKET, KG, TON, BOY, RULO, TORBA, KUTU vb.). Belirtilmemişse "ADET" yap.
3. Miktarları net sayısal değer olarak yaz. Türkçe binlik nokta ve ondalık virgül formatlarını doğru anla (örn: "5.000" -> 5000, "1.250" -> 1250, "2,5" -> 2.5).
4. Eğer müşteri veya şantiye adı açıkça belirtilmemişse boş string ("") bırak.
5. Tarih varsa GG.AA.YYYY (DD.MM.YYYY) formatında yaz, yoksa boş bırak.
6. Belgedeki tüm kalemleri atlamadan, sırasıyla "kalemler" dizisine ekle.
7. Çıktıyı kesinlikle ve sadece şu JSON şemasına uygun tek bir JSON objesi olarak üret:
{
  "musteri_adi": "Firma veya Kişi Adı",
  "santiye_adi": "Şantiye veya Teslimat Adresi",
  "talep_tarihi": "DD.MM.YYYY",
  "kalemler": [
    {
      "sira_no": 1,
      "urun_adi": "Malzemenin Tam Adı",
      "birim": "ADET",
      "miktar": 10
    }
  ]
}
Markdown (\`\`\`json) veya fazladan açıklama metni ekleme, sadece saf JSON döndür.`;

  const tamPrompt = `Aşağıdaki OCR ile taranmış belge metnini analiz et ve JSON verisini üret:\n\n---\n${extractedText}\n---`;

  const payload = {
    model: model || DEFAULT_GROQ_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: tamPrompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1
  };

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || JSON.stringify(errJson);
    } catch (_) {
      errorDetail = `HTTP ${response.status} ${response.statusText}`;
    }
    throw new Error(`Groq API Hatası: ${errorDetail}`);
  }

  const result = await response.json();
  const rawContent = result.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("Groq API'den boş yanıt döndü.");
  }

  try {
    const parsedData = JSON.parse(rawContent.trim());
    return parsedData;
  } catch (err) {
    const cleaned = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  }
}

/**
 * Çıkarılan veriyi ekrandaki interaktif tabloya basar
 */
function renderSantiyeResultsTable(data) {
  const resultCard = document.getElementById("santiye-results-card");
  const tableBody = document.getElementById("santiye-table-body");
  const musteriInput = document.getElementById("santiye-musteri-adi");
  const santiyeInput = document.getElementById("santiye-adresi");
  const tarihInput = document.getElementById("santiye-tarih");
  const countBadge = document.getElementById("santiye-item-count-badge");

  if (!resultCard || !tableBody) return;

  resultCard.style.display = "block";

  if (musteriInput) musteriInput.value = data.musteri_adi || "";
  if (santiyeInput) santiyeInput.value = data.santiye_adi || "";
  if (tarihInput) tarihInput.value = data.talep_tarihi || new Date().toLocaleDateString('tr-TR');

  tableBody.innerHTML = "";
  const kalemler = data.kalemler || [];
  if (countBadge) countBadge.textContent = `${kalemler.length} Kalem Bulundu`;

  kalemler.forEach((kalem, index) => {
    const tr = document.createElement("tr");
    tr.dataset.index = index;

    tr.innerHTML = `
      <td style="text-align: center; width: 50px;">
        <span class="row-sira">${index + 1}</span>
      </td>
      <td>
        <input type="text" class="santiye-row-input santiye-urun-adi" value="${escapeHtml(kalem.urun_adi || '')}" placeholder="Ürün adı..." />
      </td>
      <td style="width: 110px;">
        <select class="santiye-row-input santiye-birim">
          <option value="ADET" ${kalem.birim === 'ADET' ? 'selected' : ''}>ADET</option>
          <option value="METRE" ${kalem.birim === 'METRE' ? 'selected' : ''}>METRE</option>
          <option value="BOY" ${kalem.birim === 'BOY' ? 'selected' : ''}>BOY</option>
          <option value="PAKET" ${kalem.birim === 'PAKET' ? 'selected' : ''}>PAKET</option>
          <option value="KG" ${kalem.birim === 'KG' ? 'selected' : ''}>KG</option>
          <option value="TON" ${kalem.birim === 'TON' ? 'selected' : ''}>TON</option>
          <option value="RULO" ${kalem.birim === 'RULO' ? 'selected' : ''}>RULO</option>
          <option value="TORBA" ${kalem.birim === 'TORBA' ? 'selected' : ''}>TORBA</option>
          <option value="KUTU" ${kalem.birim === 'KUTU' ? 'selected' : ''}>KUTU</option>
          <option value="DİĞER" ${!['ADET','METRE','BOY','PAKET','KG','TON','RULO','TORBA','KUTU'].includes(kalem.birim) ? 'selected' : ''}>DİĞER</option>
        </select>
      </td>
      <td style="width: 100px;">
        <input type="number" step="any" class="santiye-row-input santiye-miktar" value="${kalem.miktar || 1}" style="text-align: right;" />
      </td>
      <td style="text-align: center; width: 140px;">
        <div style="display: flex; gap: 6px; justify-content: center;">
          <button class="btn-santiye-search-row" title="Bu Ürünü B2B'de Ara" data-index="${index}">
            🔍 B2B'de Ara
          </button>
          <button class="btn-santiye-delete-row" title="Kalemi Sil" data-index="${index}">
            🗑️
          </button>
        </div>
      </td>
    `;

    tableBody.appendChild(tr);
  });

  attachTableEventListeners();
}

/**
 * Tablodaki verileri okuyup güncel nesneye dönüştürür
 */
export function getUpdatedSantiyeDataFromUI() {
  const musteriAdi = document.getElementById("santiye-musteri-adi")?.value || "";
  const santiyeAdi = document.getElementById("santiye-adresi")?.value || "";
  const tarih = document.getElementById("santiye-tarih")?.value || "";

  const rows = document.querySelectorAll("#santiye-table-body tr");
  const kalemler = [];

  rows.forEach((tr, idx) => {
    const urunAdi = tr.querySelector(".santiye-urun-adi")?.value.trim() || "";
    const birim = tr.querySelector(".santiye-birim")?.value || "ADET";
    const miktarStr = tr.querySelector(".santiye-miktar")?.value || "1";
    const miktar = parseFloat(miktarStr) || 1;

    if (urunAdi) {
      kalemler.push({
        sira_no: idx + 1,
        urun_adi: urunAdi,
        birim: birim,
        miktar: miktar
      });
    }
  });

  return {
    musteri_adi: musteriAdi,
    santiye_adi: santiyeAdi,
    talep_tarihi: tarih,
    kalemler: kalemler
  };
}

/**
 * Tablodaki silme ve arama butonlarını dinler
 */
function attachTableEventListeners() {
  document.querySelectorAll(".btn-santiye-delete-row").forEach(btn => {
    btn.onclick = (e) => {
      const tr = e.target.closest("tr");
      if (tr) {
        tr.remove();
        document.querySelectorAll("#santiye-table-body tr").forEach((row, i) => {
          const siraSpan = row.querySelector(".row-sira");
          if (siraSpan) siraSpan.textContent = i + 1;
        });
        const countBadge = document.getElementById("santiye-item-count-badge");
        const remaining = document.querySelectorAll("#santiye-table-body tr").length;
        if (countBadge) countBadge.textContent = `${remaining} Kalem Bulundu`;
      }
    };
  });

  document.querySelectorAll(".btn-santiye-search-row").forEach(btn => {
    btn.onclick = (e) => {
      const tr = e.target.closest("tr");
      const urunAdi = tr?.querySelector(".santiye-urun-adi")?.value.trim();
      if (urunAdi) {
        triggerB2BSearchForProduct(urunAdi);
      }
    };
  });
}

/**
 * Verilen ürün adını B2B arama çubuğuna yazıp aramayı başlatır
 */
function triggerB2BSearchForProduct(urunAdi) {
  const navSearchBtn = document.getElementById("nav-search-btn");
  const navSantiyeBtn = document.getElementById("nav-santiye-btn");
  const pageSearch = document.getElementById("page-search");
  const pageSantiye = document.getElementById("page-santiye");
  const searchInput = document.getElementById("search-input");
  const searchBtn = document.getElementById("search-btn");

  if (navSearchBtn && pageSearch) {
    navSearchBtn.classList.add("active");
    if (navSantiyeBtn) navSantiyeBtn.classList.remove("active");
    pageSearch.classList.add("active");
    if (pageSantiye) pageSantiye.classList.remove("active");
  }

  if (searchInput) {
    searchInput.value = urunAdi;
    if (searchBtn) {
      setTimeout(() => {
        searchBtn.click();
      }, 150);
    }
  }
}

/**
 * HTML karakter kaçışı
 */
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Şantiye modülü başlatıcı
 */
export function initSantiyeModule() {
  loadGroqSettings();

  const dropzone = document.getElementById("santiye-dropzone");
  const fileInput = document.getElementById("santiye-file-input");
  const previewBox = document.getElementById("santiye-preview-box");
  const previewImg = document.getElementById("santiye-preview-img");
  const previewInfo = document.getElementById("santiye-preview-info");
  const btnRemoveFile = document.getElementById("btn-santiye-remove-file");
  const btnAnalyze = document.getElementById("btn-santiye-analiz-et");
  const statusContainer = document.getElementById("santiye-status-container");
  const statusText = document.getElementById("santiye-status-text");
  const btnExportBlank = document.getElementById("btn-santiye-export-excel");
  const btnAddRow = document.getElementById("btn-santiye-add-row");

  if (!dropzone || !fileInput) return;

  async function handleSelectedFile(file) {
    if (!file) return;
    santiyeState.currentFile = file;

    if (statusContainer) statusContainer.style.display = "flex";
    if (statusText) statusText.textContent = "Belge önizlemesi hazırlanıyor...";

    try {
      const dataUrl = await convertFileToDataUrl(file);
      santiyeState.currentImageDataUrl = dataUrl;

      if (previewImg) {
        previewImg.src = dataUrl;
        previewImg.style.display = "block";
      }
      if (previewInfo) {
        previewInfo.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      }
      if (previewBox) previewBox.style.display = "block";
      if (dropzone) dropzone.style.display = "none";
      if (btnAnalyze) btnAnalyze.disabled = false;
      if (statusContainer) statusContainer.style.display = "none";
    } catch (err) {
      alert("Dosya önizleme hatası: " + (err?.message || err));
      if (statusContainer) statusContainer.style.display = "none";
    }
  }

  dropzone.onclick = () => fileInput.click();
  fileInput.onchange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0]);
    }
  };

  dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-hover");
  };
  dropzone.ondragleave = () => {
    dropzone.classList.remove("drag-hover");
  };
  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-hover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  };

  if (btnRemoveFile) {
    btnRemoveFile.onclick = () => {
      santiyeState.currentFile = null;
      santiyeState.currentImageDataUrl = null;
      fileInput.value = "";
      if (previewBox) previewBox.style.display = "none";
      if (dropzone) dropzone.style.display = "block";
      if (btnAnalyze) btnAnalyze.disabled = true;
      const resultCard = document.getElementById("santiye-results-card");
      if (resultCard) resultCard.style.display = "none";
    };
  }

  if (btnAnalyze) {
    btnAnalyze.onclick = async () => {
      if (!santiyeState.currentImageDataUrl) {
        alert("Lütfen önce bir evrak veya fotoğraf yükleyin.");
        return;
      }

      await loadGroqSettings();
      if (!santiyeState.groqApiKey) {
        alert("⚠️ Groq API Anahtarınız tanımlı değil!\nLütfen sol menüden 'Ayarlar' sekmesine gidip Groq API Anahtarınızı girin.");
        return;
      }

      if (btnAnalyze) {
        btnAnalyze.disabled = true;
        btnAnalyze.innerHTML = `<span>⏳ Taranıyor & Ayrıştırılıyor...</span>`;
      }
      if (statusContainer) statusContainer.style.display = "flex";
      if (statusText) statusText.textContent = "1/2: Evrak OCR.Space (Tablo Motoru) ile taranıyor...";

      try {
        const modelSelect = document.getElementById("santiye-model-select");
        const chosenModel = modelSelect ? modelSelect.value : (santiyeState.selectedModel || DEFAULT_GROQ_MODEL);

        // 1. Adım: OCR.Space API (Table Engine 2) ile Türkçe Tablo OCR yap
        const rawText = await performOcrSpace(santiyeState.currentImageDataUrl, santiyeState.ocrSpaceApiKey);

        if (!rawText || !rawText.trim()) {
          throw new Error("Belgeden okunabilir metin çıkarılamadı. Lütfen daha net bir görsel yükleyin.");
        }

        // 2. Adım: Groq Qwen ile JSON'a dönüştür
        if (statusText) statusText.textContent = "2/2: Groq Qwen AI ile malzemeler ayrıştırılıyor...";

        const result = await analyzeTextWithGroq(
          rawText,
          santiyeState.groqApiKey,
          chosenModel
        );

        santiyeState.extractedData = result;
        renderSantiyeResultsTable(result);

        if (statusContainer) statusContainer.style.display = "none";
      } catch (err) {
        console.error("[Santiye Analiz Hatası]", err);
        const errStr = err?.message || (typeof err === "object" ? JSON.stringify(err) : String(err));
        alert("Evrak Analiz Hatası:\n" + errStr);
        if (statusContainer) statusContainer.style.display = "none";
      } finally {
        if (btnAnalyze) {
          btnAnalyze.disabled = false;
          btnAnalyze.innerHTML = `<span>🚀 Belgeyi Oku ve Malzemeleri Çıkar</span>`;
        }
      }
    };
  }

  if (btnAddRow) {
    btnAddRow.onclick = () => {
      const tableBody = document.getElementById("santiye-table-body");
      if (!tableBody) return;
      const nextIndex = tableBody.children.length;

      const tr = document.createElement("tr");
      tr.dataset.index = nextIndex;
      tr.innerHTML = `
        <td style="text-align: center; width: 50px;">
          <span class="row-sira">${nextIndex + 1}</span>
        </td>
        <td>
          <input type="text" class="santiye-row-input santiye-urun-adi" value="" placeholder="Yeni malzeme adı..." />
        </td>
        <td style="width: 110px;">
          <select class="santiye-row-input santiye-birim">
            <option value="ADET" selected>ADET</option>
            <option value="METRE">METRE</option>
            <option value="BOY">BOY</option>
            <option value="PAKET">PAKET</option>
            <option value="KG">KG</option>
            <option value="TON">TON</option>
            <option value="RULO">RULO</option>
            <option value="TORBA">TORBA</option>
            <option value="KUTU">KUTU</option>
          </select>
        </td>
        <td style="width: 100px;">
          <input type="number" step="any" class="santiye-row-input santiye-miktar" value="1" style="text-align: right;" />
        </td>
        <td style="text-align: center; width: 140px;">
          <div style="display: flex; gap: 6px; justify-content: center;">
            <button class="btn-santiye-search-row" title="Bu Ürünü B2B'de Ara">
              🔍 B2B'de Ara
            </button>
            <button class="btn-santiye-delete-row" title="Kalemi Sil">
              🗑️
            </button>
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
      attachTableEventListeners();
      const countBadge = document.getElementById("santiye-item-count-badge");
      if (countBadge) countBadge.textContent = `${tableBody.children.length} Kalem Bulundu`;
    };
  }

  if (btnExportBlank) {
    btnExportBlank.onclick = async () => {
      const currentData = getUpdatedSantiyeDataFromUI();
      if (!currentData.kalemler || currentData.kalemler.length === 0) {
        alert("Teklif oluşturmak için en az 1 malzeme kalemi gereklidir.");
        return;
      }
      btnExportBlank.disabled = true;
      btnExportBlank.innerHTML = `<span>⏳ Excel Hazırlanıyor...</span>`;
      try {
        await exportSantiyeOfferAsExcel(currentData);
      } finally {
        btnExportBlank.disabled = false;
        btnExportBlank.innerHTML = `<span>📄 Boş Fiyatlı Teklif Excel'i İndir</span>`;
      }
    };
  }
}
