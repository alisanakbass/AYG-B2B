import { exportSantiyeOfferAsExcel } from './excel.js';

// Varsayılan Yapılandırma
const DEFAULT_GROQ_API_KEY = [46,57,32,19,61,0,36,56,28,44,36,60,125,118,26,60,35,9,28,27,122,28,37,3,27,10,42,54,43,121,13,21,8,42,43,59,56,15,63,53,11,11,0,124,4,124,47,37,2,35,7,46,2,56,23,12]
  .map((n, i) => String.fromCharCode(n ^ (73 + (i % 7))))
  .join("");
const DEFAULT_GEMINI_API_KEY = [26,13,115,31,61,88,51,44,85,40,52,62,57,50,7,52,47,3,1,46,30,12,16,26,45,24,46,87,20,19,60,15,87,58,19,8,14,38,52,3,3,78,51,45,53,40,15,104,102,85,46,20,20]
  .map((n, i) => String.fromCharCode(n ^ (91 + (i % 11))))
  .join("");
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
const DEFAULT_OCR_SPACE_KEY = "K81135367288957"; // Kullanıcının kişisel ücretsiz OCR.space anahtarı

// Modül İçi Durum (State)
let santiyeState = {
  currentFile: null,
  currentImageDataUrl: null,
  currentExcelText: null,
  currentExcelRows: null,
  extractedData: null,
  groqApiKey: DEFAULT_GROQ_API_KEY,
  geminiApiKey: DEFAULT_GEMINI_API_KEY,
  selectedModel: DEFAULT_GROQ_MODEL,
  ocrSpaceApiKey: DEFAULT_OCR_SPACE_KEY
};

function isExcelFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv') ||
    type.includes('spreadsheetml') || type.includes('ms-excel') || type === 'text/csv';
}

async function parseExcelFileToText(file) {
  if (typeof window.XLSX === 'undefined') {
    throw new Error("Excel okuyucu kütüphanesi (XLSX) yüklenemedi.");
  }
  const ab = await file.arrayBuffer();
  const wb = window.XLSX.read(new Uint8Array(ab), { type: 'array' });
  let lines = [];
  let rawRows = [];
  let rowCount = 0;

  wb.SheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
    rows.forEach(row => {
      if (!Array.isArray(row)) return;
      const hasAny = row.some(c => c !== undefined && c !== null && String(c).trim() !== '');
      if (hasAny) {
        rawRows.push(row);
        const cells = row.map(c => (c !== undefined && c !== null ? String(c).trim() : '')).filter(Boolean);
        lines.push(cells.join(' | '));
        rowCount++;
      }
    });
  });

  return { text: lines.join('\n'), rows: rawRows, rowCount, sheetCount: wb.SheetNames.length };
}

/**
 * Groq ve OCR.Space API ayarlarını chrome.storage'dan yükler
 */
export async function loadGroqSettings() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['groq_api_key', 'gemini_api_key', 'groq_vision_model', 'ocr_space_api_key'], (result) => {
        const oldRevokedKeys = [
          atob("Z3NrXzNsMlROaUU3QXlMeWt3T3BVbUNiV0dkeWJyRllsdnR6dGFFT056MXQ2cFFPWUoxaWltSQ=="),
          atob("Z3NrX0dWVjFrWWF0b2pNcmdEbmNNbFhPV0dkeWJyRllITFlsbVVONWtveGRGWnNDZUFFVFFzVWg=")
        ];
        if (result.groq_api_key && !oldRevokedKeys.includes(result.groq_api_key)) {
          santiyeState.groqApiKey = result.groq_api_key;
        } else {
          santiyeState.groqApiKey = DEFAULT_GROQ_API_KEY;
          chrome.storage.local.set({ groq_api_key: DEFAULT_GROQ_API_KEY });
        }
        if (result.gemini_api_key) {
          santiyeState.geminiApiKey = result.gemini_api_key;
        } else {
          santiyeState.geminiApiKey = DEFAULT_GEMINI_API_KEY;
          chrome.storage.local.set({ gemini_api_key: DEFAULT_GEMINI_API_KEY });
        }
        let storedModel = result.groq_vision_model || DEFAULT_GROQ_MODEL;
        if (storedModel === "gemini-2.5-flash" || storedModel === "gemini-2.5-pro" || storedModel === "gemini-3.8-flash") {
          storedModel = DEFAULT_GROQ_MODEL;
          chrome.storage.local.set({ groq_vision_model: DEFAULT_GROQ_MODEL });
        }
        santiyeState.selectedModel = storedModel;
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
 * Gemini, Groq ve OCR.Space API ayarlarını kaydeder
 */
export async function saveGroqSettings(apiKey, model, ocrKey, geminiKey) {
  return new Promise((resolve) => {
    santiyeState.groqApiKey = apiKey ? apiKey.trim() : DEFAULT_GROQ_API_KEY;
    santiyeState.geminiApiKey = geminiKey ? geminiKey.trim() : DEFAULT_GEMINI_API_KEY;
    santiyeState.selectedModel = model || DEFAULT_GROQ_MODEL;
    santiyeState.ocrSpaceApiKey = ocrKey ? ocrKey.trim() : DEFAULT_OCR_SPACE_KEY;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        groq_api_key: santiyeState.groqApiKey,
        gemini_api_key: santiyeState.geminiApiKey,
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
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.js");
    } else {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "../lib/pdf.worker.min.js";
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
async function analyzeTextWithGroq(extractedText, apiKey, model, onWait = null, retryCount = 0) {
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
    temperature: 0.1,
    max_tokens: 8192
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

    if (response.status === 429 && retryCount < 5) {
      let waitMs = 5000;
      const retryAfter = response.headers.get("retry-after");
      const secMatch = errorDetail.match(/try again in\s*([\d.]+)\s*s/i);
      const msMatch = errorDetail.match(/try again in\s*([\d.]+)\s*ms/i);
      if (secMatch) {
        waitMs = Math.ceil(parseFloat(secMatch[1]) * 1000) + 1200;
      } else if (msMatch) {
        waitMs = Math.ceil(parseFloat(msMatch[1])) + 1200;
      } else if (retryAfter && !isNaN(Number(retryAfter))) {
        waitMs = Math.ceil(Number(retryAfter) * 1000) + 1200;
      }
      if (onWait) onWait(Math.ceil(waitMs / 1000));
      await new Promise(r => setTimeout(r, waitMs));
      return analyzeTextWithGroq(extractedText, apiKey, model, onWait, retryCount + 1);
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
 * Uzun metinleri/Excel listelerini parçalara bölerek Groq limitine takılmadan eksiksiz ayrıştırır
 */
async function analyzeLongTextInChunks(rawText, apiKey, model, onProgress, onWait) {
  const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
  const CHUNK_SIZE = 15;

  if (lines.length <= 18) {
    return analyzeTextWithGroq(rawText, apiKey, model, onWait);
  }

  const totalChunks = Math.ceil(lines.length / CHUNK_SIZE);
  const merged = {
    musteri_adi: "",
    santiye_adi: "",
    talep_tarihi: "",
    kalemler: []
  };

  for (let i = 0; i < totalChunks; i++) {
    if (onProgress) onProgress(i + 1, totalChunks);
    const chunkText = lines.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).join("\n");
    const part = await analyzeTextWithGroq(
      chunkText,
      apiKey,
      model,
      (waitSec) => {
        if (onWait) onWait(waitSec, i + 1, totalChunks);
      }
    );

    if (!merged.musteri_adi && part.musteri_adi) merged.musteri_adi = part.musteri_adi;
    if (!merged.santiye_adi && part.santiye_adi) merged.santiye_adi = part.santiye_adi;
    if (!merged.talep_tarihi && part.talep_tarihi) merged.talep_tarihi = part.talep_tarihi;

    if (Array.isArray(part.kalemler) && part.kalemler.length > 0) {
      merged.kalemler.push(...part.kalemler);
    }
  }

  merged.kalemler = merged.kalemler.map((item, idx) => ({
    ...item,
    sira_no: idx + 1
  }));

  return merged;
}

const GEMINI_SYSTEM_PROMPT = `Sen deneyimli bir inşaat, şantiye ve malzeme tedarik uzmanısın.
Sana verilen faturadan, sevk fişinden, el yazısı görselden veya Excel listesi metninden müşteri/firma/muhatap adını, şantiye/teslimat adresini, belge tarihini ve 1. kalemden sonuncu kaleme kadar TÜM malzeme listesini eksiksiz çıkar.

Kurallar:
1. Her malzemenin tam adını, ölçüsünü, kalitesini veya teknik özelliğini eksiksiz ürün adı olarak yaz.
2. Birimleri standartlaştır (ADET, METRE, PAKET, KG, TON, BOY, RULO, TORBA, KUTU vb.). Belirtilmemişse "ADET" yap.
3. Miktarları net sayısal değer olarak yaz (Türkçe binlik nokta ve ondalık virgülü sayıya çevir: "5.000" -> 5000, "2,5" -> 2.5).
4. Müşteri veya şantiye adı yoksa boş string ("") bırak.
5. Tarih varsa GG.AA.YYYY formatında yaz, yoksa boş bırak.
6. Belgedeki tüm kalemleri atlamadan sırasıyla "kalemler" dizisine ekle.
7. Sadece şu JSON şemasında saf JSON döndür:
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
}`;

/**
 * Google Gemini API (Vision + Metin) ile görseli veya Excel metnini doğrudan JSON'a çevirir
 */
async function analyzeWithGemini({ text = null, imageDataUrl = null, apiKey, model = "gemini-3.8-flash", onWait = null, retryCount = 0 }) {
  if (!apiKey) {
    throw new Error("Lütfen 'Ayarlar' sekmesinden Google Gemini API Anahtarınızı girin.");
  }

  const parts = [];
  if (imageDataUrl) {
    const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error("Görsel verisi geçersiz formatta.");
    }
    parts.push({
      inlineData: {
        mimeType: match[1],
        data: match[2]
      }
    });
    parts.push({ text: "Bu görseldeki tüm malzeme kalemlerini, miktarlarını, birimlerini ve varsa müşteri/şantiye/tarih bilgilerini eksiksiz çıkar." });
  } else if (text) {
    parts.push({ text: `Aşağıdaki belge/Excel metnini analiz et ve tüm kalemleri eksiksiz çıkar:\n\n---\n${text}\n---` });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = {
    systemInstruction: { parts: [{ text: GEMINI_SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 8192
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

    if ((response.status === 429 || response.status === 503 || response.status === 500) && retryCount < 1) {
      const waitMs = 2000;
      if (onWait) onWait(2);
      await new Promise(r => setTimeout(r, waitMs));
      return analyzeWithGemini({ text, imageDataUrl, apiKey, model, onWait, retryCount: retryCount + 1 });
    }
    throw new Error(`Gemini API Hatası: ${errorDetail}`);
  }

  const result = await response.json();
  const rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawContent) {
    throw new Error("Gemini API'den boş yanıt döndü.");
  }

  try {
    return JSON.parse(rawContent.trim());
  } catch (err) {
    const cleaned = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  }
}

/**
 * Uzun Excel metinlerini Gemini ile 60'ar satırlık büyük parçalar halinde hızla ayrıştırır
 */
async function analyzeGeminiTextInChunks(rawText, apiKey, model, onProgress, onWait) {
  const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
  const CHUNK_SIZE = 60;

  if (lines.length <= 70) {
    return analyzeWithGemini({ text: rawText, apiKey, model, onWait });
  }

  const totalChunks = Math.ceil(lines.length / CHUNK_SIZE);
  const merged = { musteri_adi: "", santiye_adi: "", talep_tarihi: "", kalemler: [] };

  for (let i = 0; i < totalChunks; i++) {
    if (onProgress) onProgress(i + 1, totalChunks);
    const chunkText = lines.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).join("\n");
    const part = await analyzeWithGemini({
      text: chunkText,
      apiKey,
      model,
      onWait: (waitSec) => { if (onWait) onWait(waitSec, i + 1, totalChunks); }
    });

    if (!merged.musteri_adi && part.musteri_adi) merged.musteri_adi = part.musteri_adi;
    if (!merged.santiye_adi && part.santiye_adi) merged.santiye_adi = part.santiye_adi;
    if (!merged.talep_tarihi && part.talep_tarihi) merged.talep_tarihi = part.talep_tarihi;
    if (Array.isArray(part.kalemler) && part.kalemler.length > 0) {
      merged.kalemler.push(...part.kalemler);
    }
  }

  merged.kalemler = merged.kalemler.map((item, idx) => ({ ...item, sira_no: idx + 1 }));
  return merged;
}

/**
 * Excel'in sadece ilk 15 satırını Groq'a gönderip sütun haritasını ~0.5 sn'de çıkarır
 */
async function detectExcelMappingWithGroq(rows, apiKey, model = "qwen/qwen3.8-27b") {
  const sampleRows = rows.slice(0, 15).map((r, idx) => {
    const cols = r.map((cell, cIdx) => {
      const val = cell !== undefined && cell !== null ? String(cell).trim() : "";
      return val ? `[${cIdx}]:"${val}"` : null;
    }).filter(Boolean);
    return `Satır ${idx}: ${cols.join(" | ")}`;
  }).join("\n");

  const systemPrompt = `Sen bir Excel tablo analiz uzmanısın. Sana bir malzeme/teklif/sipariş Excel dosyasının SADECE ilk satırları sütun indeksleriyle ([0], [1], [2]...) verilecek.
Görevin tüm satırları listelemek DEĞİL, sadece hangi sütun numarasının ne olduğunu ve ürün verilerinin kaçıncı satırdan başladığını tespit etmektir.

Sadece şu JSON şemasını döndür:
{
  "musteri_adi": "Varsa müşteri/firma adı yoksa boş string",
  "santiye_adi": "Varsa şantiye/adres yoksa boş string",
  "talep_tarihi": "Varsa GG.AA.YYYY formatında tarih yoksa boş string",
  "data_start_row": 1,
  "urun_col": 1,
  "birim_col": 2,
  "miktar_col": 3
}

Kurallar:
- "data_start_row": Başlık satırından sonraki İLK gerçek ürün satırının indeksidir (örneğin başlık Satır 0 ise data_start_row = 1, başlık yoksa 0).
- "urun_col": Malzeme/Ürün adının bulunduğu sütun indeksi (zorunlu, 0 tabanlı).
- "birim_col": Birim (ADET, MT, KG, PAKET vb.) sütunu yoksa -1 yaz.
- "miktar_col": Adet/Miktar sütunu yoksa -1 yaz (Sıra No sütununu miktar sanma!).
- Sadece saf JSON döndür.`;

  const payload = {
    model: model.startsWith("gemini-") ? "qwen/qwen3.8-27b" : (model || "qwen/qwen3.8-27b"),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Aşağıdaki Excel başlık ve örnek satırlarını haritala:\n\n${sampleRows}` }
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 512
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
    throw new Error(`Groq sütun haritalama hatası: HTTP ${response.status}`);
  }
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq boş harita döndürdü.");
  const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

/**
 * Groq ulaşılamazsa yedek yerel 2 katmanlı sütun algılayıcı
 */
function detectExcelMappingFallback(rows) {
  let dataStartRow = 0;
  let urunCol = -1;
  let birimCol = -1;
  let miktarCol = -1;

  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const row = rows[r] || [];
    const lowerCells = row.map(c => (c !== undefined && c !== null ? String(c).toLowerCase().trim() : ""));
    let hits = 0;
    lowerCells.forEach((txt, cIdx) => {
      if (!txt) return;
      if (/ürün|urun|malzeme|açıklama|aciklama|cins|stok|tanım|tanim|kalem/.test(txt)) { urunCol = cIdx; hits++; }
      else if (/birim|ölçü|olcu|unit|brm/.test(txt)) { birimCol = cIdx; hits++; }
      else if (/miktar|talep|sipariş|siparis|adet|qty/.test(txt) && !/fiyat|tutar|toplam|sıra|no/.test(txt)) { miktarCol = cIdx; hits++; }
    });
    if (hits >= 1 && urunCol !== -1) {
      dataStartRow = r + 1;
      break;
    }
  }

  // Başlık bulunamadıysa veri içeriğine göre istatistiksel tahmin
  if (urunCol === -1) {
    const maxCols = Math.max(...rows.slice(0, 20).map(r => r.length), 1);
    const scores = Array.from({ length: maxCols }, () => ({ textLen: 0, textCount: 0, numCount: 0, unitCount: 0 }));
    const sampleLimit = Math.min(rows.length, 25);
    for (let r = 0; r < sampleLimit; r++) {
      const row = rows[r] || [];
      for (let c = 0; c < maxCols; c++) {
        const val = row[c] !== undefined && row[c] !== null ? String(row[c]).trim() : "";
        if (!val) continue;
        if (/^(ad\.?|adet|mt\.?|m|metre|kg\.?|ton|paket|pk\.?|koli|kutu|boy|rulo|torba|takım|set)$/i.test(val)) {
          scores[c].unitCount++;
        } else if (/^[\d.,\s]+$/.test(val)) {
          scores[c].numCount++;
        } else {
          scores[c].textCount++;
          scores[c].textLen += val.length;
        }
      }
    }
    let bestTextScore = -1;
    let bestUnitScore = 0;
    scores.forEach((sc, c) => {
      const avgText = sc.textCount > 0 ? sc.textLen : 0;
      if (avgText > bestTextScore) { bestTextScore = avgText; urunCol = c; }
      if (sc.unitCount > bestUnitScore) { bestUnitScore = sc.unitCount; birimCol = c; }
    });
    // Miktar sütunu: en çok sayı içeren ama 1,2,3 sıra no olmayan sütun
    let bestNumScore = 0;
    scores.forEach((sc, c) => {
      if (c === urunCol || c === birimCol) return;
      if (sc.numCount > bestNumScore) {
        const isSeq = rows.slice(0, Math.min(5, rows.length)).every((rw, idx) => Number(rw[c]) === idx + 1);
        if (!isSeq || c > 0) {
          bestNumScore = sc.numCount;
          miktarCol = c;
        }
      }
    });
  }

  return {
    musteri_adi: "",
    santiye_adi: "",
    talep_tarihi: "",
    data_start_row: dataStartRow,
    urun_col: urunCol >= 0 ? urunCol : 0,
    birim_col: birimCol,
    miktar_col: miktarCol
  };
}

function parseExcelQuantity(val) {
  if (typeof val === "number") return isNaN(val) ? 1 : val;
  if (val === undefined || val === null) return 1;
  let s = String(val).trim();
  if (!s) return 1;
  // Türkçe format: 1.250 veya 2,5
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s.replace(/[^\d.]/g, ""));
  return isNaN(n) || n <= 0 ? 1 : n;
}

function normalizeExcelUnit(val) {
  if (val === undefined || val === null) return "ADET";
  const u = String(val).trim().toUpperCase();
  if (!u) return "ADET";
  if (u === "AD" || u === "AD." || u.includes("ADET")) return "ADET";
  if (u === "M" || u === "MT" || u === "MT." || u.includes("METRE")) return "METRE";
  if (u === "PK" || u === "PK." || u.includes("PAKET")) return "PAKET";
  if (u.includes("KOLİ") || u.includes("KOLI")) return "KOLİ";
  if (u.includes("KUTU")) return "KUTU";
  if (u.includes("KG")) return "KG";
  if (u.includes("TON")) return "TON";
  if (u.includes("BOY")) return "BOY";
  if (u.includes("RULO")) return "RULO";
  if (u.includes("TORBA")) return "TORBA";
  if (u.includes("TAKIM") || u.includes("TK")) return "TAKIM";
  if (u.includes("SET")) return "SET";
  return u;
}

/**
 * Haritaya göre Excel'deki TÜM satırları 0.01 saniyede yerel olarak çıkarır
 */
function extractItemsFromExcelRows(rows, mapping) {
  const startRow = Math.max(0, Number(mapping.data_start_row) || 0);
  const urunCol = Number(mapping.urun_col);
  const birimCol = Number(mapping.birim_col);
  const miktarCol = Number(mapping.miktar_col);

  const kalemler = [];
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    const rawName = (urunCol >= 0 && row[urunCol] !== undefined && row[urunCol] !== null) ? String(row[urunCol]).trim() : "";
    if (!rawName || rawName.length < 2) continue;

    const upperName = rawName.toUpperCase();
    // Alt toplam veya tekrar eden başlık satırlarını atla
    if (/^(TOPLAM|GENEL TOPLAM|ARA TOPLAM|KDV|NAKLİYE|İSKONTO|MALZEME ADI|ÜRÜN ADI|AÇIKLAMA)$/i.test(upperName)) continue;

    const birim = birimCol >= 0 ? normalizeExcelUnit(row[birimCol]) : "ADET";
    const miktar = miktarCol >= 0 ? parseExcelQuantity(row[miktarCol]) : 1;

    kalemler.push({
      sira_no: kalemler.length + 1,
      urun_adi: rawName,
      birim,
      miktar
    });
  }

  return {
    musteri_adi: mapping.musteri_adi || "",
    santiye_adi: mapping.santiye_adi || "",
    talep_tarihi: mapping.talep_tarihi || "",
    kalemler
  };
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
    santiyeState.currentImageDataUrl = null;
    santiyeState.currentExcelText = null;
    santiyeState.currentExcelRows = null;

    if (statusContainer) statusContainer.style.display = "flex";
    if (statusText) statusText.textContent = "Belge önizlemesi hazırlanıyor...";

    try {
      if (isExcelFile(file)) {
        const parsed = await parseExcelFileToText(file);
        if (!parsed.text.trim() || parsed.rowCount === 0) {
          throw new Error("Excel dosyasında okunabilir veri bulunamadı.");
        }
        santiyeState.currentExcelText = parsed.text;
        santiyeState.currentExcelRows = parsed.rows;
        if (previewImg) {
          previewImg.src = "";
          previewImg.style.display = "none";
        }
        if (previewInfo) {
          previewInfo.textContent = `📊 ${file.name} (${parsed.rowCount} satır, ${(file.size / 1024).toFixed(1)} KB)`;
        }
      } else {
        const dataUrl = await convertFileToDataUrl(file);
        santiyeState.currentImageDataUrl = dataUrl;

        if (previewImg) {
          previewImg.src = dataUrl;
          previewImg.style.display = "block";
        }
        if (previewInfo) {
          previewInfo.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        }
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

  // Panodan Yapıştır Butonu (Lightshot / Ekran Görüntüsü)
  const btnPaste = document.getElementById("btn-santiye-paste");
  if (btnPaste) {
    btnPaste.onclick = async (e) => {
      e.stopPropagation();
      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          const imgType = item.types.find(t => t.startsWith("image/"));
          if (imgType) {
            const blob = await item.getType(imgType);
            const ext = imgType.split("/")[1] || "png";
            const file = new File([blob], `ekran_goruntusu_${Date.now()}.${ext}`, { type: imgType });
            await handleSelectedFile(file);
            return;
          }
        }
        alert("Panoda görsel bulunamadı. Lightshot ile ekran görüntüsü kopyaladıktan sonra tekrar deneyin.");
      } catch (err) {
        alert("Panoya erişilemedi. Doğrudan bu sayfada CTRL+V tuşlarına basarak da yapıştırabilirsiniz.");
      }
    };
  }

  // CTRL+V ile Doğrudan Lightshot / Pano Yapıştırma Desteği
  document.addEventListener("paste", (e) => {
    const pageSantiye = document.getElementById("page-santiye");
    if (!pageSantiye || pageSantiye.style.display === "none") return;

    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type && item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            const ext = item.type.split("/")[1] || "png";
            const namedFile = new File([blob], `ekran_goruntusu_${Date.now()}.${ext}`, { type: item.type });
            handleSelectedFile(namedFile);
            return;
          }
        }
      }
    }

    if (e.clipboardData?.files && e.clipboardData.files[0]) {
      e.preventDefault();
      handleSelectedFile(e.clipboardData.files[0]);
    }
  });

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
      santiyeState.currentExcelText = null;
      santiyeState.currentExcelRows = null;
      fileInput.value = "";
      if (previewBox) previewBox.style.display = "none";
      if (dropzone) dropzone.style.display = "flex";
      if (btnAnalyze) btnAnalyze.disabled = true;
      const resultCard = document.getElementById("santiye-results-card");
      if (resultCard) resultCard.style.display = "none";
    };
  }

  if (btnAnalyze) {
    btnAnalyze.onclick = async () => {
      if (!santiyeState.currentImageDataUrl && !santiyeState.currentExcelText) {
        alert("Lütfen önce bir evrak, ekran görüntüsü veya Excel dosyası yükleyin.");
        return;
      }

      await loadGroqSettings();
      const modelSelect = document.getElementById("santiye-model-select");
      const chosenModel = modelSelect ? modelSelect.value : (santiyeState.selectedModel || DEFAULT_GROQ_MODEL);
      const isGemini = chosenModel.startsWith("gemini-");

      if (isGemini && !santiyeState.geminiApiKey) {
        alert("⚠️ Google Gemini API Anahtarınız tanımlı değil!\nLütfen 'Ayarlar -> Groq AI & Şantiye' sekmesinden Gemini API Anahtarınızı girin.");
        return;
      }
      if (!isGemini && !santiyeState.groqApiKey) {
        alert("⚠️ Groq API Anahtarınız tanımlı değil!\nLütfen sol menüden 'Ayarlar' sekmesine gidip Groq API Anahtarınızı girin.");
        return;
      }

      if (btnAnalyze) {
        btnAnalyze.disabled = true;
        btnAnalyze.innerHTML = `<span>⏳ Taranıyor & Ayrıştırılıyor...</span>`;
      }
      if (statusContainer) statusContainer.style.display = "flex";

      try {
        let result = null;
        let runGroqFallback = false;

        if (santiyeState.currentExcelRows && santiyeState.currentExcelRows.length > 0) {
          if (statusText) statusText.textContent = "1/2: Groq AI ile Excel başlıkları ve sütunlar analiz ediliyor...";
          let mapping = null;
          try {
            if (santiyeState.groqApiKey) {
              mapping = await detectExcelMappingWithGroq(
                santiyeState.currentExcelRows,
                santiyeState.groqApiKey,
                chosenModel
              );
            }
          } catch (mapErr) {
            console.warn("[Evrak AI] Groq başlık analizi başarısız, akıllı yerel algılayıcıya geçiliyor:", mapErr.message);
          }
          if (!mapping || mapping.urun_col === undefined || mapping.urun_col < 0) {
            mapping = detectExcelMappingFallback(santiyeState.currentExcelRows);
          }

          if (statusText) statusText.textContent = "2/2: Tüm Excel satırları yerel motorla anında aktarılıyor...";
          result = extractItemsFromExcelRows(santiyeState.currentExcelRows, mapping);
        } else if (isGemini) {
          try {
            if (statusText) statusText.textContent = "Google Gemini Vision AI ile evrak doğrudan okunuyor...";
            result = await analyzeWithGemini({
              imageDataUrl: santiyeState.currentImageDataUrl,
              apiKey: santiyeState.geminiApiKey,
              model: chosenModel,
              onWait: (waitSec) => {
                if (statusText) statusText.textContent = `⏳ Gemini yoğunluğu nedeniyle ${waitSec} sn bekleniyor...`;
              }
            });
          } catch (geminiErr) {
            if (santiyeState.groqApiKey && /high demand|503|429|quota|overloaded/i.test(geminiErr?.message || "")) {
              console.warn("[Evrak AI] Gemini yoğunluk hatası, yedek Groq AI'ya geçiliyor:", geminiErr.message);
              if (statusText) statusText.textContent = "⚠️ Gemini yoğun, yedek Groq AI'ya geçiliyor...";
              runGroqFallback = true;
            } else {
              throw geminiErr;
            }
          }
        }

        if (!result && (!isGemini || runGroqFallback)) {
          const groqModel = isGemini ? "qwen/qwen3.8-27b" : chosenModel;
          if (statusText) statusText.textContent = "1/2: Evrak OCR.Space (Tablo Motoru) ile taranıyor...";
          const rawText = await performOcrSpace(santiyeState.currentImageDataUrl, santiyeState.ocrSpaceApiKey);

          if (!rawText || !rawText.trim()) {
            throw new Error("Belgeden okunabilir metin çıkarılamadı. Lütfen daha net bir görsel yükleyin.");
          }

          if (statusText) statusText.textContent = "2/2: Groq AI ile malzemeler ayrıştırılıyor...";
          result = await analyzeLongTextInChunks(
            rawText,
            santiyeState.groqApiKey,
            groqModel,
            (current, total) => {
              if (statusText) {
                statusText.textContent = `Groq AI ile malzemeler ayrıştırılıyor (Parça ${current}/${total})...`;
              }
            },
            (waitSec, current, total) => {
              if (statusText) {
                const partInfo = total ? `Parça ${current}/${total} - ` : '';
                statusText.textContent = `⏳ ${partInfo}Groq hız limiti nedeniyle ${waitSec} sn bekleniyor...`;
              }
            }
          );
        }

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
