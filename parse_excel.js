const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('==========================================');
console.log('    FIRAT BORU EXCEL PARSER & INTEGRATOR  ');
console.log('==========================================\n');

// 1. xlsx (SheetJS) Kütüphane Kontrolü ve Kurulumu
try {
  require.resolve('xlsx');
} catch (e) {
  console.log('xlsx kütüphanesi bulunamadı. Kuruluyor, lütfen bekleyin...');
  try {
    execSync('npm install xlsx --no-save', { stdio: 'inherit' });
    console.log('xlsx başarıyla kuruldu.\n');
  } catch (err) {
    console.error('Kütüphane kurulumu başarısız oldu!', err);
    process.exit(1);
  }
}

const XLSX = require('xlsx');

const excelPath = path.join(__dirname, 'firatboru_fiyat_listesi.xlsx');
const tempDir = path.join(__dirname, 'temp_xlsx');
const imagesOutputDir = path.join(__dirname, 'images');

if (!fs.existsSync(excelPath)) {
  console.error('HATA: firatboru_fiyat_listesi.xlsx dosyası bulunamadı!');
  process.exit(1);
}

if (!fs.existsSync(tempDir)) {
  console.error('HATA: temp_xlsx klasörü bulunamadı! Lütfen bat dosyasını çalıştırın.');
  process.exit(1);
}

// Görsel çıktı klasörünü oluştur
if (!fs.existsSync(imagesOutputDir)) {
  fs.mkdirSync(imagesOutputDir, { recursive: true });
}

console.log('Excel dosyası yükleniyor...');
const workbook = XLSX.readFile(excelPath);

const products = [];
let totalImagesSaved = 0;

// Sayfaları teker teker işle
workbook.SheetNames.forEach((sheetName, sheetIdx) => {
  const sheet = workbook.Sheets[sheetName];
  // Satırları 2D Array olarak oku
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  if (data.length === 0) return;
  
  console.log(`[${sheetName}] işleniyor (${data.length} satır)...`);
  
  // O Sayfaya Ait Çizim/Resim Dosyasını ve İlişkilerini Çöz
  const sheetRelsPath = path.join(tempDir, 'xl', 'worksheets', '_rels', `sheet${sheetIdx + 1}.xml.rels`);
  let drawingFileName = '';
  const relsMap = {}; // rId -> resim_dosya_adi
  const imageRowMap = {}; // row_index -> resim_dosya_adi

  if (fs.existsSync(sheetRelsPath)) {
    const relsContent = fs.readFileSync(sheetRelsPath, 'utf8');
    const drawingMatch = relsContent.match(/Target="([^"]+drawing\d+\.xml)"/);
    if (drawingMatch) {
      drawingFileName = path.basename(drawingMatch[1]);
    }
  }

  // Eğer sayfanın çizim dosyası varsa resim ilişkilerini oku
  if (drawingFileName) {
    const drawingRelsPath = path.join(tempDir, 'xl', 'drawings', '_rels', `${drawingFileName}.rels`);
    if (fs.existsSync(drawingRelsPath)) {
      const relsContent = fs.readFileSync(drawingRelsPath, 'utf8');
      const relMatches = relsContent.matchAll(/Id="([^"]+)"[^>]+Target="([^"]+)"/g);
      for (const match of relMatches) {
        relsMap[match[1]] = path.basename(match[2]); // örn: rId1 -> image1.png
      }
    }

    // Çizim koordinatlarını (hangi hücrede hangi resim var) oku
    const drawingXmlPath = path.join(tempDir, 'xl', 'drawings', drawingFileName);
    if (fs.existsSync(drawingXmlPath)) {
      const drawingContent = fs.readFileSync(drawingXmlPath, 'utf8');
      const anchorMatches = drawingContent.matchAll(/<xdr:twoCellAnchor[^>]*>([\s\S]*?)<\/xdr:twoCellAnchor>/g);
      for (const anchor of anchorMatches) {
        const body = anchor[1];
        const colMatch = body.match(/<xdr:col>(\d+)<\/xdr:col>/);
        const rowMatch = body.match(/<xdr:row>(\d+)<\/xdr:row>/);
        const blipMatch = body.match(/r:embed="([^"]+)"/);
        
        if (colMatch && rowMatch && blipMatch) {
          const col = parseInt(colMatch[1], 10);
          const row = parseInt(rowMatch[1], 10);
          const rId = blipMatch[1];
          const imgFileName = relsMap[rId];
          if (imgFileName) {
            // Resmi satır indeksiyle eşleştir
            imageRowMap[row] = imgFileName;
          }
        }
      }
    }
  }

  // Dinamik sütun ve başlık durum değişkenleri (satır bazlı güncellenecektir)
  let currentTitle = '';
  let activeGroupImage = ''; // Bu ürün grubunda bulduğumuz son resim
  let codeIdx = -1;
  let priceIdx = -1;
  let ambalajIdx = -1;
  let unitIdx = -1;
  let capIdx = -1;
  let cikisIdx = -1;
  let stokNameIdx = -1;
  let etKalinligiIdx = -1;

  // Satırları tara
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!row || row.length === 0) continue;

    // 1. Title Row Kontrolü (Sayfa içi yeni bir ürün grubuna girdiğimizi saptar)
    let nonEmtpyCount = 0;
    let containsHeaderKeyword = false;
    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] || '').trim();
      if (cellVal) {
        nonEmtpyCount++;
        const upperVal = cellVal.toUpperCase();
        if (upperVal === 'KODU' || upperVal === 'KOD' || upperVal.includes('AMBALAJ') || upperVal.includes('FİYAT') || upperVal.includes('F‹YAT') || upperVal.includes('ÇAP')) {
          containsHeaderKeyword = true;
        }
      }
    }

    if (nonEmtpyCount >= 1 && nonEmtpyCount <= 2 && !containsHeaderKeyword) {
      let longestCell = '';
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        if (val.length > longestCell.length) {
          longestCell = val;
        }
      }
      // Geçerli bir başlık metni olmalı (sayısal veya ufak açıklamalar hariç)
      if (longestCell.length >= 5 && !/^\d+$/.test(longestCell) && !longestCell.includes(' montajlıdır') && !longestCell.toUpperCase().includes('KDV DAHIL')) {
        currentTitle = longestCell;
        activeGroupImage = ''; // Yeni grup başladığı için görseli sıfırla
      }
    }

    // 2. Header Row Kontrolü (Hizalaması değişen yeni bir tablonun sütun indekslerini çözer)
    let isHeader = false;
    let tempCodeIdx = -1, tempPriceIdx = -1, tempAmbalajIdx = -1, tempUnitIdx = -1, tempCapIdx = -1, tempCikisIdx = -1, tempStokNameIdx = -1, tempEtKalinligiIdx = -1;
    
    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] || '').trim().toUpperCase();
      if (cellVal === 'KODU' || cellVal === 'KOD') {
        tempCodeIdx = c;
        isHeader = true;
      } else if (cellVal.includes('AMBALAJ')) {
        tempAmbalajIdx = c;
      } else if (cellVal.includes('FİYAT') || cellVal.includes('F‹YAT') || cellVal.includes('TL') || cellVal === 'NET') {
        // TL içeren sütun en öncelikli fiyat sütunudur (Örn: "TL /ADET" boş "F‹YAT" sütununu ezer)
        if (cellVal.includes('TL')) {
          tempPriceIdx = c;
        } else if (tempPriceIdx === -1) {
          tempPriceIdx = c;
        }
      } else if (cellVal.includes('BİRİM') || cellVal.includes('BIRIM')) {
        tempUnitIdx = c;
      } else if (cellVal === 'ÇAP' || cellVal === 'EBAT' || cellVal === 'ÖLÇÜ' || cellVal === 'ÇAPI' || cellVal.includes('G”') || cellVal.includes('G"')) {
        tempCapIdx = c;
      } else if (cellVal.includes('ÇIKIŞ') || cellVal.includes('CIKIS')) {
        tempCikisIdx = c;
      } else if (cellVal.includes('STOK ADI') || cellVal === 'ADI' || cellVal === 'TANIM') {
        tempStokNameIdx = c;
      } else if (cellVal.includes('ET KALIN') || cellVal.includes('ET KALN') || cellVal.includes('KALINL')) {
        tempEtKalinligiIdx = c;
      }
    }

    if (isHeader) {
      codeIdx = tempCodeIdx;
      priceIdx = tempPriceIdx;
      ambalajIdx = tempAmbalajIdx;
      unitIdx = tempUnitIdx;
      capIdx = tempCapIdx;
      cikisIdx = tempCikisIdx;
      stokNameIdx = tempStokNameIdx;
      etKalinligiIdx = tempEtKalinligiIdx;
      continue; // Başlık satırını veri olarak ekleme, sonraki satıra geç
    }

    // 3. Data Row Kontrolü (Ürün verisi ayrıştırma ve görsel eşleştirme)
    if (codeIdx !== -1) {
      const cellStr = String(row[codeIdx] || '').trim();
      if (!cellStr) continue;

      // Kod hücresinde kodun yanındaki ek açıklamayı ayır (Örn: "7800111100K Kırmızı")
      const tokens = cellStr.split(/\s+/);
      const rawCode = tokens[0];
      const extraDesc = tokens.slice(1).join(' ');

      if (!/^[0-9A-Z_.-]{6,15}$/i.test(rawCode)) continue;

      const rawPrice = row[priceIdx];
      let price = 0;
      if (typeof rawPrice === 'number') {
        price = rawPrice;
      } else if (typeof rawPrice === 'string') {
        const cleanPriceStr = rawPrice.trim().replace(/\./g, '').replace(/,/g, '.');
        price = parseFloat(cleanPriceStr);
      }
      if (isNaN(price) || price <= 0) continue;

      // Tam ismi birleştir
      let displayName = currentTitle;
      if (extraDesc) displayName += ' ' + extraDesc;
      
      if (stokNameIdx !== -1 && row[stokNameIdx]) {
        const stokNameVal = String(row[stokNameIdx]).trim();
        if (stokNameVal && !stokNameVal.toUpperCase().includes('KOD') && stokNameVal !== rawCode) {
          if (!displayName.toLowerCase().includes(stokNameVal.toLowerCase())) {
            displayName += ' - ' + stokNameVal;
          }
        }
      }

      if (cikisIdx !== -1 && row[cikisIdx]) {
        const cikisVal = String(row[cikisIdx]).trim();
        if (cikisVal && !cikisVal.toUpperCase().includes('KOD') && cikisVal !== rawCode) {
          if (!displayName.toLowerCase().includes(cikisVal.toLowerCase())) {
            displayName += ' ' + cikisVal;
          }
        }
      }

      if (capIdx !== -1 && row[capIdx]) {
        const capVal = String(row[capIdx]).trim();
        if (capVal && !capVal.toUpperCase().includes('KOD') && capVal !== rawCode) {
          displayName += ' ' + capVal;
        }
      }

      if (etKalinligiIdx !== -1 && row[etKalinligiIdx]) {
        let etVal = String(row[etKalinligiIdx]).trim();
        etVal = etVal.replace(/\./g, ','); // Noktayı virgüle çevir (Örn: 3.4 -> 3,4)
        if (etVal && !etVal.toUpperCase().includes('KOD') && etVal !== rawCode) {
          displayName += ' ' + etVal;
        }
      }

      const ambalaj = ambalajIdx !== -1 ? String(row[ambalajIdx] || '').trim() : '';
      const unit = unitIdx !== -1 ? String(row[unitIdx] || 'Ad.').trim() : 'Ad.';

      // Ambalaj miktar ve birim tespiti
      let packQuantity = 1;
      let packUnit = 'ADET';
      if (ambalaj) {
        const match = ambalaj.match(/^(\d+)\s*(.*)$/);
        if (match) {
          packQuantity = parseInt(match[1], 10);
          packUnit = match[2].trim().toUpperCase() || 'ADET';
        }
      }

      // Görsel Eşleştirme ve Grup Bazlı Yayma Mantığı
      let imgUrl = '';
      
      // Bu satırda veya hemen yakınında bir görsel tanımlanmış mı kontrol et
      const matchedImgName = imageRowMap[r] || imageRowMap[r - 1] || imageRowMap[r + 1] || imageRowMap[r - 2] || imageRowMap[r + 2];
      
      if (matchedImgName) {
        const srcImgPath = path.join(tempDir, 'xl', 'media', matchedImgName);
        if (fs.existsSync(srcImgPath)) {
          const ext = path.extname(matchedImgName) || '.png';
          const destImgName = `${rawCode}${ext}`;
          const destImgPath = path.join(imagesOutputDir, destImgName);
          
          fs.copyFileSync(srcImgPath, destImgPath);
          activeGroupImage = `images/${destImgName}`; // Gruba bu görseli ata
          totalImagesSaved++;
        }
      }

      // Eğer satırda resim yoksa ama bu grupta daha önce resim bulduysak, o resmi kullan!
      imgUrl = activeGroupImage || 'logo.png';

      products.push({
        code: rawCode,
        name: displayName,
        ambalaj,
        packQuantity,
        unit: packUnit === 'ADET' ? 'ADET' : packUnit,
        price,
        imgUrl
      });
    }
  }
});

if (products.length === 0) {
  console.error('\nHATA: Excel dosyasından hiçbir ürün ayrıştırılamadı!');
  process.exit(1);
}

// Veritabanı Dosyasını Yaz
const lastUpdateStr = new Date().toLocaleString('tr-TR');
const databaseContent = `// Fırat Boru Excel Veritabanı
// Bu dosya otomatik olarak oluşturulmuştur. Manuel olarak düzenlemeyin.
// Son Güncelleme: ${lastUpdateStr}

window.firatLastUpdate = "${lastUpdateStr}";
window.firatBoruList = ${JSON.stringify(products, null, 2)};
`;

const outputPath = path.join(__dirname, 'firat_boru_database.js');
fs.writeFileSync(outputPath, databaseContent, 'utf8');

console.log('\n==========================================');
console.log('   ISLEM BASARIYLA TAMAMLANDI!            ');
console.log('==========================================');
console.log(`Toplam Aktarılan Ürün   : ${products.length}`);
console.log(`Kopyalanan Görsel Sayısı: ${totalImagesSaved}`);
console.log(`Son Güncelleme          : ${lastUpdateStr}`);
console.log(`Oluşturulan Veritabanı   : firat_boru_database.js`);
console.log('==========================================\n');
console.log('Lütfen Karşılaştırma Portalı sekmesini yenileyin.');
