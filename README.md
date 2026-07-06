# AYG B2B - Fiyat Karşılaştırma ve Ürün Arama Portalı

AYG B2B, birden fazla B2B (Business-to-Business) bayi portalında eşzamanlı olarak ürün arayan, fiyatları karşılaştıran ve tüm verileri tek bir ekranda (Dashboard) birleştiren güçlü bir Chrome / Edge tarayıcı eklentisidir.

Eklenti ayrıca yerel bir Excel dosyasını (örneğin Fırat Boru fiyat listesi) veritabanı olarak hafızasına yükleyebilir ve bu verilerle entegre arama yapabilir.

---

## 🌟 Öne Çıkan Özellikler

*   **Eşzamanlı Arama:** Ender Yapı (`b2b.enderyapi.com.tr`), Akyüz Tools (`bayi.akyuztools.com`) gibi popüler B2B sitelerinde ve diğer tanımlı portallarda aynı anda arama yapar.
*   **Fiyat ve İskonto Karşılaştırma:** Farklı bayilerin iskonto oranlarını ve net fiyatlarını tek bir tabloda karşılaştırarak en uygun fiyatı hızlıca tespit etmenizi sağlar.
*   **Excel Veritabanı Entegrasyonu:** `ADANA 20 HAZİRAN 2026 BORU FİYAT LİSTESİ.xlsx` gibi yerel Excel listelerini doğrudan tarayıcı hafızasına aktarabilir ve yerel veri tabanından anında arama sonuçları getirebilir.
*   **Akıllı Sepet Sistemi:** Farklı bayilerden seçilen ürünleri sepete ekleyerek toplam maliyet ve adet hesaplaması yapabilir.
*   **Gelişmiş Görsel Eşleştirme:** Ürün kodlarına ve tiplerine göre CDN üzerinden dinamik olarak ürün görsellerini çeker ve listeler.
*   **Otomatik Güncelleme Servisi:** Windows Görev Zamanlayıcısı ile entegre çalışan `guncelle.bat` ve `oto_guncelle.vbs` sayesinde eklenti dosyalarını her 15 dakikada bir arka planda otomatik olarak güncel tutar.

---

## 📂 Proje Yapısı

```
b2b_karsilastirma/
├── dashboard/                 # Karşılaştırma ekranı arayüzü ve modülleri
│   ├── modules/
│   │   ├── cart.js            # Sepet işlemleri ve hesaplamaları
│   │   ├── discounts.js       # Bayi bazlı iskonto tanımları ve yönetimi
│   │   ├── excel.js           # Excel yükleme, okuma ve yerel arama işlemleri
│   │   ├── search.js          # Eşzamanlı arama motoru ve durum göstergeleri
│   │   ├── state.js           # Uygulama durumu (state) yönetimi
│   │   └── utils.js           # Türkçe karakter temizleme, fiyat ayrıştırma vb. yardımcı araçlar
│   ├── dashboard.css          # Modern, şık ve responsive tasarım dosyası
│   ├── dashboard.html         # Portal ana arayüz dosyası
│   └── dashboard.js           # Dashboard ana giriş ve olay dinleyicileri
├── scripts/                   # Chrome uzantısı arka plan ve içerik betikleri
│   ├── background.js          # Arka plan servis çalışanı (Service Worker) ve API yönetimi
│   ├── content_token.js       # B2B sayfalarında token/veri yakalama betiği
│   └── content_token_main.js  # Sayfa context'inde çalışan token enjeksiyon betiği
├── tools/                     # Yardımcı araçlar ve betikler
│   ├── download_missing_images.js
│   ├── yasar_check.js
│   └── yasar_scripts.txt
├── images/                    # Yerel ürün veya kategori görselleri
├── popup/                     # Eklenti popup (küçük pencere) dosyaları
├── manifest.json              # Chrome Uzantısı yapılandırma dosyası (Manifest v3)
├── guncelle.bat               # Manuel ve otomatik güncelleme kurulum betiği
├── oto_guncelle.vbs           # Arka planda penceresiz çalışan güncelleme tetikleyicisi
├── oto_guncelle_islem.bat     # Güncelleme işlemini gerçekleştiren arka plan betiği
├── servis_kaldir.bat          # Kurulan otomatik güncelleme servisini kaldıran betik
└── ADANA 20 HAZİRAN 2026 BORU FİYAT LİSTESİ.xlsx  # Varsayılan Excel veritabanı dosyası
```

---

## 🔧 Kurulum Adımları

Eklentiyi Google Chrome veya Microsoft Edge tarayıcınıza yüklemek için aşağıdaki adımları takip edin:

1.  **Tarayıcınızın Eklentiler Sayfasını Açın:**
    *   Chrome kullanıyorsanız adres satırına `chrome://extensions` yazın ve Enter'a basın.
2.  **Geliştirici Modunu Aktif Edin:**
    *   Sayfanın sağ üst köşesinde yer alan **"Geliştirici modu" (Developer mode)** anahtarını açık konuma getirin.
3.  **Klasörü Yükleyin:**
    *   Sol üstte beliren **"Paketlenmemiş eklenti yükle" (Load unpacked)** butonuna tıklayın.
    *   Açılan klasör seçme penceresinde bu `b2b_karsilastirma` klasörünü seçip **Klasör Seç** deyin.
4.  **Eklenti Hazır:**
    *   Eklenti tarayıcınıza yüklendiğinde araç çubuğundaki eklentiler ikonuna tıklayarak **AYG B2B** ikonunu sabitleyebilir ve tıklayarak Dashboard ekranını açabilirsiniz.

---

## 🔄 Otomatik ve Manuel Güncelleme

Eklentinin en güncel dosyalara sahip olması ve yeni eklenen özellikleri alabilmesi için otomatik güncelleme mekanizması kurulabilir:

### 1. Manuel Güncelleme ve Servis Kurulumu
*   Klasör içindeki `guncelle.bat` dosyasına sağ tıklayıp **"Yönetici Olarak Çalıştır"** deyin.
*   Betik, en güncel dosyaları GitHub repository'sinden indirecek ve mevcut dosyalarla değiştirecektir.
*   İşlem sonunda size *"Her 15 dakikada bir otomatik güncelleme yapacak Windows Servisini kurmak ister misiniz? [E/H]"* sorusu sorulacaktır. **E** tuşuna basarak onaylarsanız arka plan güncelleme servisi Windows Görev Zamanlayıcısına eklenir.

### 2. Otomatik Güncelleme Servisini Kaldırma
*   Eğer otomatik güncellemeyi kapatmak isterseniz, klasördeki `servis_kaldir.bat` dosyasına sağ tıklayıp **"Yönetici Olarak Çalıştır"** diyerek servisi kolayca kaldırabilirsiniz.

> [!NOTE]
> Eklenti dosyaları güncellendikten sonra tarayıcınızın `chrome://extensions` sayfasına gidip AYG B2B kartındaki **Yenile (Refresh)** düğmesine tıklamanız gerekir.

---

## 💻 Kullanım Kılavuzu

### Ürün Arama ve Karşılaştırma
1.  Dashboard ekranındaki sol menüden arama yapmak istediğiniz B2B portallarını seçin (örneğin Özkaradeniz, Ender Yapı).
2.  Üst kısımda bulunan arama çubuğuna aramak istediğiniz ürünün adını veya kodunu yazıp **Ara** butonuna basın.
3.  Uzantı, arka planda tüm sitelere sorgu gönderir ve gelen sonuçları temiz bir karşılaştırma tablosunda alt alta listeler.

### Excel Fiyat Listesi Entegrasyonu
1.  Eklenti ilk yüklendiğinde, klasördeki varsayılan `ADANA 20 HAZİRAN 2026 BORU FİYAT LİSTESİ.xlsx` dosyasını otomatik olarak tarayıcı hafızasına yükler (Fırat Boru verisi olarak).
2.  Yeni bir fiyat listesi yüklemek isterseniz, Ayarlar veya Excel yükleme alanından kendi Excel dosyanızı seçerek veritabanını güncelleyebilirsiniz.
3.  Yapılan aramalarda bu Excel dosyasındaki ürün kodları ve isimleri de taranarak sonuçlarda anında gösterilir.

---

## 🛡️ Lisans ve Kullanım

Bu proje özel olarak geliştirilmiş olup ticari veya kişisel kullanım hakları saklıdır.
