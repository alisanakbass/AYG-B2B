# AYG B2B Karşılaştırma Portalı - Repo & Mimari Haritası (Repo-Map)

Bu belge, projedeki dosyaların görev dağılımını, sembollerini ve modül mimarisini özetler. Kod aramalarında gereksiz token tüketimini önlemek için rehber niteliğindedir.

---

## 1. Mimari Genel Bakış
* **Platform:** Chrome Extension (Manifest V3) + Yerel Native Host Updater.
* **Ana Görünüm:** `dashboard/dashboard.html` (ES Modules tabanlı mimari).
* **Veri Akışı:** Kullanıcı arama yapar -> `search.js` orkestrasyonu -> `sites/` adapter'ları paralel veri çeker -> Sonuçlar `state.currentResults` içine aktarılır -> Tablo `renderResults()` ile çizilir -> `cart.js` ile sepete / siparişe aktarılır.

---

## 2. Modül Haritası & Sorumluluklar

### A. Çekirdek UI & Orkestrasyon (`dashboard/modules/`)
* **[`search.js`](file:///c:/AYG_Prices/dashboard/modules/search.js) (~500 satır):**
  * `executeSearch()`: Aktif siteleri belirler ve paralel arama döngüsünü başlatır.
  * `fetchFromB2B(siteKey, query)`: `SITE_ADAPTERS[siteKey].search()` adaptörüne yönlendirir.
  * `renderResults()` & `renderFilterButtons()`: Karşılaştırma tablosunu çizer, filtreleme butonlarını yönetir.
  * `recalculateAllResults()` & `applySorting()`: İskonto/KDV/Kâr değişimlerinde tabloyu anlık günceller, sıralar.
  * `checkAllSessions()` & `checkUpdates()`: Site oturum kontrolleri ve versiyon güncelleme bildirimi.

* **[`state.js`](file:///c:/AYG_Prices/dashboard/modules/state.js):**
  * `state`: `currentResults`, `cart`, `salesHistory`, `exchangeRates` (USD/EUR), `siteDiscounts` global durum objesi.
  * `DEFAULT_URLS`: B2B sitelerinin varsayılan arama URL şablonları.

* **[`utils.js`](file:///c:/AYG_Prices/dashboard/modules/utils.js):**
  * `parsePrice(str)`: Türkçe/uluslararası para formatlarını (`1.250,50 TL`, `$50.2`) sayıya çevirir.
  * `formatPrice(num)`: Sayıyı `1.250,50 ₺` formatına dönüştürür.
  * `extractVatRate(val)`: `%10`, `%20`, `0.20`, `10` gibi değerlerden sayısal KDV oranını (1, 8, 10, 20) ayıklar.
  * `calculateSellingPrice(base, margin, withVat, vatRate)`: Dinamik KDV ve kâr marjı ile satış fiyatı hesaplar.
  * `parsePackQuantityFromName(name)`: Ürün adındaki paket/koli içi adedini Regex ile bulur.

* **[`cart.js`](file:///c:/AYG_Prices/dashboard/modules/cart.js):**
  * `addToSharedCart()`, `renderCart()`, `confirmCart()`, `submitCart()`: Sepet yönetimi, modal onayları, stok düşümü ve satış kaydı.
  * `transferCartToAygOrder()`: Sepetteki ürünleri AYG Sipariş formatına aktarır.

* **[`discounts.js`](file:///c:/AYG_Prices/dashboard/modules/discounts.js):**
  * Kademe kâr marjları, kelime bazlı iskonto kuralları, ürün bazlı özel iskontolar.

* **[`excel.js`](file:///c:/AYG_Prices/dashboard/modules/excel.js):**
  * Fırat Boru Excel listesi entegrasyonu (`fetchFromLocalFirat`), teklif Excel çıktısı ve şablon indirme.

* **[`santiye.js`](file:///c:/AYG_Prices/dashboard/modules/santiye.js):**
  * Evrak AI / Groq Vision ile fatura, irsaliye ve PDF/görsel OCR analizi.

---

### B. B2B Firma Adaptörleri (`dashboard/modules/sites/`)
Her firma kendi dosyasında izoledir. Standart arayüz: `{ key, name, badgeClass, search(query, isRetry), parseRow? }`

| Site Kodu | Dosya | Firma Adı | Tip / Yöntem |
| :--- | :--- | :--- | :--- |
| `SITE_A` | [`site_a_ozkaradeniz.js`](file:///c:/AYG_Prices/dashboard/modules/sites/site_a_ozkaradeniz.js) | Özkaradeniz İnşaat | Sessiz AJAX Login (`/login/login_request`) & POST `/search/get_product_list` API |
| `SITE_B` | [`site_b_enderyapi.js`](file:///c:/AYG_Prices/dashboard/modules/sites/site_b_enderyapi.js) | Ender Yapı | Bearer Token ile `services/product/get-product-search` API |
| `SITE_C` | [`site_c_yasarteknik.js`](file:///c:/AYG_Prices/dashboard/modules/sites/site_c_yasarteknik.js) | Yaşar Teknik B2B | HTML Arama & Tablo Kazıma |
| `SITE_D` | [`site_d_polisan.js`](file:///c:/AYG_Prices/dashboard/modules/sites/site_d_polisan.js) | Polisan Bayi | Elastic Search API + HTML Fallback |
| `SITE_E` | [`site_e_akyuzler.js`](file:///c:/AYG_Prices/dashboard/modules/sites/site_e_akyuzler.js) | Akyüzler B2B | `/Search/SearchProduct` API |
| `SITE_F` | [`site_f_firatboru.js`](file:///c:/AYG_Prices/dashboard/modules/sites/site_f_firatboru.js) | Fırat Boru | Yerel Excel Listesi (`state.firatItems`) |
| `SITE_H` | [`site_h_kamilturk.js`](file:///c:/AYG_Prices/dashboard/modules/sites/site_h_kamilturk.js) | Kamil Türk B2B | HTML Arama (`.prbx-item`, Net + Kdv Dahil) |
| `SITE_I` | [`site_i_tokticaret.js`](file:///c:/AYG_Prices/dashboard/modules/sites/site_i_tokticaret.js) | Tok Ticaret B2B | HTML Arama (`tr[id]`, çoklu döviz desteği) |
| `SITE_J` | [`site_j_duzmetal.js`](file:///c:/AYG_Prices/dashboard/modules/sites/site_j_duzmetal.js) | Düz Metal B2B | Token ile `https://api.duzmetal.com/urun` API |
| `SITE_K` | [`site_k_rico.js`](file:///c:/AYG_Prices/dashboard/modules/sites/site_k_rico.js) | Rico B2B | HTML Arama (Net + Kdvli Fiyat, dinamik iskonto) |
| Ortak | [`base.js`](file:///c:/AYG_Prices/dashboard/modules/sites/base.js) | Ortak Altyapı | `updateStatusIndicator`, `updateSessionActive`, `fetchHtmlSite` |
| Kayıtçı | [`index.js`](file:///c:/AYG_Prices/dashboard/modules/sites/index.js) | Registry | `SITE_ADAPTERS` ve `PARSERS` nesnelerini dışa aktarır |

---

### C. Proje Dizin Yapısı
* `lib/`: 3. parti harici kütüphaneler (`xlsx.full.min.js`, `jszip.min.js`, `pdf.min.js`, `pdf.worker.min.js`).
* `data/`: Fiyat listeleri (`ADANA 20 HAZİRAN 2026 BORU FİYAT LİSTESİ.xlsx`).
* `templates/`: Teklif şablonları (`AYG_TEKLİF.xlsx`).
* `tools/`: Windows otomatik güncelleme ve native host araçları (`oto_guncelle.vbs`, `oto_guncelle_islem.bat`, `servis_kaldir.bat`, `native_host.*`).
* `dashboard/`: Arayüz HTML/CSS ve ES Modülleri (`dashboard.js`, `modules/`).
* `scripts/`: Service worker (`background.js`) ve content scriptler.
* `images/`: Logo ve ürün önbellek görselleri.
* Kök Dizin (`/`): Sadece `manifest.json`, `version.json`, `logo.png`, `guncelle.bat`, `README.md`, `REPO_MAP.md`.

---

### D. Ürün Veri Modeli (`currentResults` Elemanı)
```javascript
{
  key: "b2b_domain_urunid",     // Benzersiz ürün anahtarı
  name: "Ürün Adı",             // Standart temizlenmiş isim
  basePrice: 100.50,            // KDV Hariç Alış Fiyatı (TL cinsine çevrilmiş)
  purchaseWithVat: 110.55,      // Tedarikçinin gerçek KDV Dahil Alış Fiyatı
  vatRate: 10,                  // %1, %10, %20 sayısal KDV oranı
  unit: "ADET",                 // ADET, PAKET, KOLİ vb.
  packQuantity: 1,              // Paket içi ürün adedi
  domain: "b2b.kamilturk.com",  // Kaynak site alan adı
  sourceKey: "SITE_H",          // Site kodu
  sourceName: "Kamil Türk B2B", // Site görünen adı
  badgeClass: "site_h",         // CSS rozet sınıfı
  imgUrl: "https://...",        // Ürün görsel bağlantısı
  productUrl: "https://..."     // (Opsiyonel) Ürünün doğrudan web sayfası
}
```

---

## 3. Hızlı Müdahale Rehberi (Hangi İşlem İçin Hangi Dosyaya Gidilmeli?)
* **Bir toptancının fiyatı veya KDV'si hatalı çekiliyorsa:** Doğrudan `dashboard/modules/sites/site_X_*.js` dosyasını açın. Diğer dosyalara bakmanıza gerek yoktur.
* **Yeni bir toptancı eklenecekse:** `dashboard/modules/sites/` içine yeni dosya açıp `index.js` ve `dashboard/dashboard.html`'e ekleyin.
* **Satış fiyatı, kâr marjı veya döviz kuru formülü değişecekse:** [`utils.js`](file:///c:/AYG_Prices/dashboard/modules/utils.js).
* **Sepet veya satış geçmişi mantığı değişecekse:** [`cart.js`](file:///c:/AYG_Prices/dashboard/modules/cart.js).
* **Arama sonuç tablosunun görsel tasarımı değişecekse:** [`search.js`](file:///c:/AYG_Prices/dashboard/modules/search.js) içindeki `renderResults()` fonksiyonu.

