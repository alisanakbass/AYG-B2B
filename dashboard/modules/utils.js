import { FIRAT_IMAGES } from './state.js';

// Fiyat Ayrıştırma
export function parsePrice(priceStr) {
  if (!priceStr) return 0;
  let cleanStr = priceStr.replace(/[^0-9,.-]/g, '');
  if (cleanStr.includes('.') && cleanStr.includes(',')) {
    cleanStr = cleanStr.replace(/\./g, '').replace(/,/g, '.');
  } else if (cleanStr.includes(',')) {
    cleanStr = cleanStr.replace(/,/g, '.');
  }
  const val = parseFloat(cleanStr);
  return isNaN(val) ? 0 : val;
}

// Fiyat Biçimlendirme
export function formatPrice(value) {
  if (isNaN(value)) return "0,00 TL";
  return value.toFixed(2).replace('.', ',') + ' TL';
}

// Ürün Adından Paket İçi Adet Çözümleme
export function parsePackQuantityFromName(name) {
  if (!name) return null;
  // Özel parantez içi örüntüleri: (PK:100 AD), (PK:75 AD), (PK:100), (KUTU:50 AD), (KOLİ:12), vb.
  const regexParentheses = /\((?:PK|KUTU|KOLİ|KOLI|DZ|DÜZİNE|ADET|AD)\s*[:/]\s*(\d+)\s*(?:AD|ADET)?\)/i;
  let match = name.match(regexParentheses);
  if (match) {
    const val = parseInt(match[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }

  // Alternatif parantez içi örüntüsü: (100 AD), (50 ADET), (12 AD.)
  const regexQtyAdet = /\((\d+)\s*(?:AD|ADET|AD\.)\)/i;
  match = name.match(regexQtyAdet);
  if (match) {
    const val = parseInt(match[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }

  // Parantez olmadan da olabilir: PK:100 AD, PK: 100, DZ:50
  const regexNoParentheses = /\b(?:PK|KUTU|KOLİ|KOLI|DZ|DÜZİNE)\s*[:/]\s*(\d+)\b/i;
  match = name.match(regexNoParentheses);
  if (match) {
    const val = parseInt(match[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }

  return null;
}

// Satış Fiyatı Hesaplama
export function calculateSellingPrice(basePrice, margin, includeVat) {
  const withMargin = basePrice * (1 + (margin / 100));
  const finalPrice = includeVat ? withMargin * 1.20 : withMargin;
  return parseFloat(finalPrice.toFixed(2));
}

// Görsel URL Ayıklama Yardımcısı
export function extractImageUrl(row, selector, domain) {
  const imgEl = selector ? row.querySelector(selector) : row.querySelector('img');
  if (!imgEl) return '';

  let src = imgEl.getAttribute('data-src') ||
    imgEl.getAttribute('data-original') ||
    imgEl.getAttribute('src') ||
    imgEl.getAttribute('ng-src') || '';

  src = src.trim();
  if (!src) return '';

  // Base64 doğrudan geçerlidir
  if (src.startsWith('data:')) return src;

  if (!src.startsWith('http')) {
    if (src.startsWith('//')) {
      src = 'https:' + src;
    } else {
      src = `https://${domain}/${src.startsWith('/') ? src.substring(1) : src}`;
    }
  }
  return src;
}

// Domain üzerinden site anahtarını çözme yardımcısı (geriye dönük uyumluluk için)
export function getSourceKeyFromDomain(domain) {
  if (!domain) return '';
  if (domain.includes('ozkaradeniz')) return 'SITE_A';
  if (domain.includes('enderyapi')) return 'SITE_B';
  if (domain.includes('yasarteknik') || domain.includes('yansis')) return 'SITE_C';
  if (domain.includes('polisankansai') || domain.includes('polisan')) return 'SITE_D';
  if (domain.includes('akyuztools') || domain.includes('akyuz')) return 'SITE_E';
  if (domain.includes('firat') || domain.includes('excel')) return 'SITE_F';
  if (domain.includes('kamilturk')) return 'SITE_H';
  return '';
}

// Yardımcı HTML Escape Fonksiyonu
export function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Türkçe aramalarda büyük/küçük harf ve karakter eşleşme sorunlarını çözen normalizasyon fonksiyonu
export function cleanTurkishForSearch(str) {
  if (!str) return '';
  return str
    .replace(/İ/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/I/g, 'i')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .toLowerCase()
    .trim();
}

// Türkçe karakterleri İngilizceye çeviren ve güvenli dosya adı oluşturan yardımcı fonksiyon
export function getSafeFilename(name) {
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
export function getProductTypeName(name) {
  if (!name) return '';
  let clean = name.replace(/\d+[\/\d+]*/g, '');
  clean = clean.replace(/\d+([.,]\d+)?\s*mm/gi, ''); // Virgüllü ölçüleri temizle
  clean = clean.replace(/mm/gi, '');
  clean = clean.replace(/\(.*?\)/g, '');
  clean = clean.replace(/[^a-zA-ZçğıöşüÇĞIÖŞÜ\s]/g, ' '); // Noktalama işaretlerini boşluğa çevir
  clean = clean.replace(/\s+/g, ' ').trim().toLowerCase();
  return clean;
}

// O(1) Hızlı arama için Görsel Haritasını önceden oluştur
const firatExactMap = new Map();
FIRAT_IMAGES.forEach(filename => {
  const dotIndex = filename.indexOf('.');
  if (dotIndex !== -1) {
    firatExactMap.set(filename.substring(0, dotIndex), filename);
  }
});

// En yakın görseli arayan algoritma (O(1) Önbellekli)
export function getFiratProductImage(code) {
  if (!code) return '../logo.png';
  const cleanCode = code.toString().trim();
  const IMAGE_BASE_URL = 'https://cdn.jsdelivr.net/gh/alisanakbass/AYG-B2B@main/images/';

  // 1. Tam eşleşme (Exact Match - O(1))
  const exact = firatExactMap.get(cleanCode);
  if (exact) return IMAGE_BASE_URL + exact;

  // 2. Ölçü farkından dolayı en yakın grup görselini bul (En uzun ortak önek)
  for (let len = cleanCode.length - 1; len >= 4; len--) {
    const prefix = cleanCode.substring(0, len);
    // Önceden haritalanmış görsel var mı?
    for (const [imgCode, filename] of firatExactMap.entries()) {
      if (imgCode.startsWith(prefix)) {
        return IMAGE_BASE_URL + filename;
      }
    }
  }

  // 3. Fallback
  return '../logo.png';
}
