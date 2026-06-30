const fs = require('fs');
const path = require('path');
const https = require('https');

// Local XLSX kütüphanesini require ediyoruz (Zero-dependency için)
const XLSX = require('../xlsx.full.min.js');

const EXCEL_PATH = path.join(__dirname, '..', 'ADANA 20 HAZİRAN 2026 BORU FİYAT LİSTESİ.xlsx');
const TEMP_EXCEL_PATH = path.join(__dirname, '..', 'temp_excel_copy.xlsx');
const IMAGES_DIR = path.join(__dirname, '..', 'images');

// Klasör yoksa oluştur
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR);
}

// Yardımcı bekleme fonksiyonu
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Türkçe karakterleri İngilizceye çeviren ve güvenli dosya adı oluşturan fonksiyon
function getSafeFilename(name) {
  if (!name) return '';
  let clean = name.toLowerCase();
  
  const map = {
    'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'â': 'a', 'î': 'i', 'û': 'u'
  };
  for (const char in map) {
    clean = clean.split(char).join(map[char]);
  }
  
  clean = clean.replace(/[^a-z0-9\s]/g, '');
  clean = clean.replace(/\s+/g, '_');
  return clean.trim();
}

// Ürün adından ölçüleri temizleyerek jenerik ürün tipini bulan fonksiyon
function getProductTypeName(name) {
  if (!name) return '';
  let clean = name.replace(/\d+[\/\d+]*/g, '');
  clean = clean.replace(/\d+([.,]\d+)?\s*mm/gi, ''); // Virgüllü ölçüleri temizle
  clean = clean.replace(/mm/gi, '');
  clean = clean.replace(/\(.*?\)/g, '');
  clean = clean.replace(/[^a-zA-ZçğıöşüÇĞIÖŞÜ\s]/g, ' '); // Noktalama işaretlerini boşluğa çevir
  clean = clean.replace(/\s+/g, ' ').trim().toLowerCase();
  return clean;
}

// HTTP/HTTPS Get yardımcı fonksiyonu
function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const requestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.bing.com/',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        ...options.headers
      },
      timeout: 10000
    };

    https.get(url, requestOptions, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location, options).then(resolve).catch(reject);
      }

      if (options.binary) {
        const data = [];
        res.on('data', chunk => data.push(chunk));
        res.on('end', () => resolve(Buffer.concat(data)));
      } else {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }
    }).on('error', reject);
  });
}

// Bing Async endpoint'i kullanarak doğrudan arama sonuçlarını çekme
async function findImageUrlByTypeName(typeName) {
  try {
    let cleanQuery = `firat boru ${typeName}`;
    cleanQuery = cleanQuery.replace(/[^a-zA-Z0-9çğıöşüÇĞIÖŞÜ\s]/g, ' ');
    cleanQuery = cleanQuery.replace(/\s+/g, ' ').trim();

    const query = encodeURIComponent(cleanQuery);
    const searchUrl = `https://www.bing.com/images/async?q=${query}&first=0&count=35&relp=35&lostate=r&mmasync=1`;
    const html = await fetchUrl(searchUrl);

    const regex = /class="iusc"[^>]*?murl&quot;:&quot;(http[^&]+?)&quot;/i;
    const match = html.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  } catch (err) {
    console.error(`  [Arama Hatası] "${typeName}" için arama başarısız:`, err.message);
  }
  return null;
}

// Görseli indirip kaydetme
async function downloadImage(url, destPath) {
  try {
    const buffer = await fetchUrl(url, { binary: true });
    if (buffer.length > 1024) {
      fs.writeFileSync(destPath, buffer);
      return true;
    }
  } catch (err) {
    console.error(`  [İndirme Hatası] Görsel indirilemedi:`, err.message);
  }
  return false;
}

async function start() {
  console.log(`=== FIRAT BORU IMAGES GÖRSEL İNDİRME İŞLEMİ (TÜM LİSTE) ===\n`);

  // 1. Excel'i oku
  let workbook;
  let excelSourcePath = EXCEL_PATH;

  if (fs.existsSync(TEMP_EXCEL_PATH)) {
    excelSourcePath = TEMP_EXCEL_PATH;
  } else {
    try {
      fs.copyFileSync(EXCEL_PATH, TEMP_EXCEL_PATH);
      excelSourcePath = TEMP_EXCEL_PATH;
    } catch (copyErr) {
      console.error('\n⚠️ HATA: Excel dosyası kilitli! Lütfen Excel programını kapatın.\n');
      return;
    }
  }

  try {
    const fileBuffer = fs.readFileSync(excelSourcePath);
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    if (fs.existsSync(TEMP_EXCEL_PATH)) {
      fs.unlinkSync(TEMP_EXCEL_PATH);
    }
  } catch (readErr) {
    console.error('Excel okuma hatası:', readErr.message);
    return;
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  // 2. Benzersiz ürün tiplerini topla
  const uniqueTypes = new Set();
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 6) continue;

    const name = row[3] ? row[3].toString().trim() : '';
    if (!name) continue;

    const typeName = getProductTypeName(name);
    if (typeName) {
      uniqueTypes.add(typeName);
    }
  }

  const typeList = Array.from(uniqueTypes);
  console.log(`Excel'deki Toplam Benzersiz Ürün Grubu Sayısı: ${typeList.length}`);

  // 3. Mevcut images klasöründeki dosyaları kontrol et (Zaten indirilenleri indirme)
  const existingFiles = fs.readdirSync(IMAGES_DIR);
  const existingNames = new Set(existingFiles.map(file => path.basename(file, path.extname(file))));
  console.log(`images Klasöründeki Mevcut Görsel Sayısı: ${existingNames.size}\n`);

  // 4. Her bir benzersiz grup için arama yap ve kaydet
  let successCount = 0;
  for (let i = 0; i < typeList.length; i++) {
    const typeName = typeList[i];
    const safeFilename = getSafeFilename(typeName);
    
    if (!safeFilename) continue;

    // Eğer bu ürün grubunun resmi zaten images klasöründe varsa atla
    if (existingNames.has(safeFilename)) {
      continue;
    }

    console.log(`[${successCount + 1}] 🌐 "${typeName}" için Bing (Async) araması yapılıyor...`);
    const imgUrl = await findImageUrlByTypeName(typeName);
    if (imgUrl) {
      console.log(`    Bulunan Görsel: ${imgUrl}`);
      const destPath = path.join(IMAGES_DIR, `${safeFilename}.jpeg`);

      const success = await downloadImage(imgUrl, destPath);
      if (success) {
        console.log(`    ✔ Başarıyla kaydedildi: ${safeFilename}.jpeg\n`);
        successCount++;
      } else {
        console.log(`    ❌ Kaydedilemedi.\n`);
      }
    } else {
      console.log(`    ❌ İnternette görsel bulunamadı.\n`);
    }

    // Rate limit yememek için bekle
    await sleep(1500);
  }

  console.log(`\n=== İŞLEM TAMAMLANDI ===`);
  console.log(`Bu Çalıştırmada Yeni İndirilen: ${successCount}`);
  console.log(`images Klasöründeki Toplam Görsel Sayısı: ${fs.readdirSync(IMAGES_DIR).length}`);
}

start().catch(err => console.error('Genel Hata:', err));
