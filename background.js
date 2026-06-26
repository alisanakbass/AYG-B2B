// B2B Karşılaştırma Portalı Arka Plan Servis Scripti (Service Worker)

const DEFAULT_URLS = {
  SITE_A: "https://b4b.ozkaradenizinsaat.com/search/product/{query}",
  SITE_B: "https://b2b.enderyapi.com.tr/tr/urunler-s-{query}?page=1",
  SITE_C: "https://bayi.yasarteknik.com.tr/YeniSiparisGir.asp?F=Ara&FAdi={query}",
  SITE_D: "https://yenibayi.polisankansai.com/order/makeordernew?search={query}",
  SITE_E: "https://bayi.akyuztools.com/Search/SearchProduct"
};

// Eklenti yüklendiğinde alarmı kur (Her 20 dakikada bir)
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("b2b_keepalive", { periodInMinutes: 20 });
});

// Zamanlayıcı tetiklendiğinde
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "b2b_keepalive") {
    performBackgroundLoginForAll();
  }
});

// Arayüzden gelen mesajları dinleme
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "manual_login") {
    performLoginForSite(message.siteKey).then((result) => {
      sendResponse(result);
    });
    return true; // Asenkron yanıt göndermek için true döner
  } else if (message.action === "login_all") {
    performBackgroundLoginForAll().then((results) => {
      sendResponse(results);
    });
    return true;
  }
});

// Tüm aktif (işaretli) siteler için otomatik giriş yap
async function performBackgroundLoginForAll() {
  // Arayüzdeki checkbox durumlarını öğrenmek için storage'dan okuyoruz.
  // Varsayılan olarak hepsi aktif/true kabul edilir.
  const storage = await new Promise(r => chrome.storage.sync.get({
    'site-a-check': true,
    'site-b-check': true,
    'site-c-check': true,
    'site-d-check': true,
    'site-e-check': true
  }, r));

  const results = {};
  if (storage['site-a-check']) {
    results.SITE_A = await performLoginForSite('SITE_A');
  }
  if (storage['site-b-check']) {
    results.SITE_B = await performLoginForSite('SITE_B');
  }
  if (storage['site-c-check']) {
    results.SITE_C = await performLoginForSite('SITE_C');
  }
  if (storage['site-d-check']) {
    results.SITE_D = await performLoginForSite('SITE_D');
  }
  if (storage['site-e-check']) {
    results.SITE_E = await performLoginForSite('SITE_E');
  }
  return results;
}

// Belirli bir site için giriş işlemini gerçekleştir
async function performLoginForSite(siteKey) {
  if (siteKey === 'SITE_E') {
    // Akyüzler B2B sistemi masaüstü uygulaması ile giriş gerektirdiğinden otomatik giriş yapılmaz.
    // Doğrudan başarılı dönerek eklentide "Bağlantı Hazır" (Hazır) durumunu gösteriyoruz.
    await updateStorageSession('SITE_E', true);
    return { success: true, message: "Masaüstü ile Açılır" };
  }

  let loginUrl = "";
  try {
    // Özelleştirilmiş URL şablonunu al
    const syncKey = `url_${siteKey.toLowerCase()}`;
    const syncData = await new Promise(r => chrome.storage.sync.get(syncKey, r));
    const urlTemplate = syncData[syncKey] || DEFAULT_URLS[siteKey];
    loginUrl = new URL(urlTemplate).origin;
  } catch (e) {
    // Hata durumunda varsayılan domain köküne yönel
    const def = DEFAULT_URLS[siteKey];
    loginUrl = def.split('/search')[0].split('/tr/')[0].split('/YeniSiparis')[0];
  }

  // Giriş bilgilerini sync storage'dan oku
  const creds = await new Promise(r => chrome.storage.sync.get({
    cred_user_site_a: "info@aygunleryapi.com",
    cred_pass_site_a: "FZ0DT1YL*0OE",
    cred_user_site_b: "120 08 1401",
    cred_pass_site_b: "1401",
    cred_company_site_c: "12001451",
    cred_user_site_c: "1",
    cred_pass_site_c: "AYGUNLER",
    cred_user_site_d: "17183",
    cred_pass_site_d: "27f4e5d"
  }, r));

  // Eğer sync storage'da boş string olarak kayıtlıysa varsayılan değerleri atayalım
  if (!creds.cred_user_site_a) creds.cred_user_site_a = "info@aygunleryapi.com";
  if (!creds.cred_pass_site_a) creds.cred_pass_site_a = "FZ0DT1YL*0OE";
  if (!creds.cred_user_site_b) creds.cred_user_site_b = "120 08 1401";
  if (!creds.cred_pass_site_b) creds.cred_pass_site_b = "1401";
  if (!creds.cred_company_site_c) creds.cred_company_site_c = "12001451";
  if (!creds.cred_user_site_c) creds.cred_user_site_c = "1";
  if (!creds.cred_pass_site_c) creds.cred_pass_site_c = "AYGUNLER";
  if (!creds.cred_user_site_d) creds.cred_user_site_d = "17183";
  if (!creds.cred_pass_site_d) creds.cred_pass_site_d = "27f4e5d";

  let tab = null;
  try {
    // Sekmeyi arka planda aç (active: false)
    tab = await chrome.tabs.create({ url: loginUrl, active: false });
    
    // Sayfanın yüklenmesini bekle (en fazla 15 saniye)
    await waitForTabComplete(tab.id);
    
    // Giriş betiğini enjekte et ve çalıştır
    const loginResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: autoLoginScriptInPage,
      args: [siteKey, creds]
    });
    
    const res = loginResult[0]?.result || { success: false, reason: "Bilinmeyen betik hatası" };
    
    if (res.success) {
      if (res.alreadyLoggedIn) {
        await updateStorageSession(siteKey, true);
        chrome.tabs.remove(tab.id);
        return { success: true, message: "Zaten Giriş Yapılmış" };
      } else {
        // Giriş butonuna tıklandıysa, yönlendirme ve giriş yapılması için 4 saniye bekle
        await new Promise(r => setTimeout(r, 4000));
        
        // Girişin başarılı olup olmadığını doğrulamak için tekrar kontrol et
        const verifyResult = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const hasPassword = !!document.querySelector('input[type="password"]');
            return { loggedIn: !hasPassword };
          }
        });
        
        const loggedIn = verifyResult[0]?.result?.loggedIn || false;
        await updateStorageSession(siteKey, loggedIn);
        
        chrome.tabs.remove(tab.id);
        return { success: loggedIn, message: loggedIn ? "Giriş Başarılı" : "Şifre/Giriş Hatası veya Doldurma Yapılamadı" };
      }
    } else {
      await updateStorageSession(siteKey, false);
      chrome.tabs.remove(tab.id);
      return { success: false, message: res.reason || "Giriş başarısız oldu." };
    }
  } catch (error) {
    console.error(`[B2B Background] ${siteKey} giriş akışı sırasında hata oluştu:`, error);
    if (tab && tab.id) {
      try { chrome.tabs.remove(tab.id); } catch(e) {}
    }
    await updateStorageSession(siteKey, false);
    return { success: false, message: `Bağlantı Hatası: ${error.message}` };
  }
}

// Sekmenin yüklenmesini bekleme yardımcısı
function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    
    // Güvenlik zaman aşımı (15 saniye)
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}

// Storage üzerindeki durumları güncelleme
async function updateStorageSession(siteKey, isActive) {
  if (siteKey === 'SITE_B') {
    // SITE_B (Ender Yapı) aktif değilse token'ı silebiliriz, aktifse dokunmuyoruz (token zaten content script ile yakalanacak)
    if (!isActive) {
      await new Promise(r => chrome.storage.local.remove('enderyapi_token', r));
    }
  } else {
    // SITE_A ve SITE_C için doğrudan session durumunu yazıyoruz
    await new Promise(r => chrome.storage.local.set({ [`session_${siteKey}`]: isActive }, r));
  }
}

// --- SAYFAYA ENJEKTE EDİLEN OTOMATİK GİRİŞ BETİĞİ ---
function autoLoginScriptInPage(siteKey, creds) {
  return new Promise((resolve) => {
    // Sayfanın yüklenmesi ve betiklerin oturması için 1.5 saniye bekle
    setTimeout(() => {
      const passwordInput = document.querySelector('input[type="password"]');
      
      // 1. Şifre alanı yoksa, zaten oturum açılmış veya dashboard ekranındayız demektir.
      if (!passwordInput) {
        resolve({ success: true, alreadyLoggedIn: true });
        return;
      }

      // 2. Giriş bilgilerini ayrıştır
      let username = "";
      let password = "";
      let companyCode = ""; // Yaşar Teknik için cari kod

      if (siteKey === 'SITE_A') {
        username = creds.cred_user_site_a;
        password = creds.cred_pass_site_a;
      } else if (siteKey === 'SITE_B') {
        username = creds.cred_user_site_b;
        password = creds.cred_pass_site_b;
      } else if (siteKey === 'SITE_C') {
        companyCode = creds.cred_company_site_c;
        username = creds.cred_user_site_c;
        password = creds.cred_pass_site_c;
      } else if (siteKey === 'SITE_D') {
        username = creds.cred_user_site_d;
        password = creds.cred_pass_site_d;
      }

      if (!password) {
        resolve({ success: false, reason: "Eklenti ayarlarında bu B2B sitesi için şifre tanımlanmamış." });
        return;
      }

      // 3. Giriş alanlarını doldur ve tetikle
      passwordInput.value = password;
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));

      let usernameInput = null;
      if (siteKey === 'SITE_C') {
        // Yaşar Teknik özel input ID'leri
        usernameInput = document.getElementById('KullaniciKodu');
        const companyInput = document.getElementById('KullaniciAdiForm') || document.getElementById('KullaniciAdi');
        
        if (companyInput && companyCode) {
          companyInput.value = companyCode;
          companyInput.dispatchEvent(new Event('input', { bubbles: true }));
          companyInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        // Şifre alanından önceki ilk text/email alanı kullanıcı adıdır
        const inputs = Array.from(document.querySelectorAll('input'));
        const passIdx = inputs.indexOf(passwordInput);
        for (let i = passIdx - 1; i >= 0; i--) {
          if (inputs[i].type === 'text' || inputs[i].type === 'email') {
            usernameInput = inputs[i];
            break;
          }
        }
      }

      if (usernameInput && username) {
        usernameInput.value = username;
        usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
        usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Değerlerin sayfaya yerleşmesi için yarım saniye bekleyip tıkla
      setTimeout(() => {
        let loginButton = null;

        // Siteye özgü buton eşlemeleri
        if (siteKey === 'SITE_A') {
          loginButton = document.getElementById('login-btn') || document.querySelector('.submit_button_blue') || document.querySelector('.orange-btn');
        } else if (siteKey === 'SITE_C') {
          loginButton = document.querySelector('.btnGonder') || document.querySelector('button.btnGonder');
        }

        // Genel olarak form içindeki submit butonlarını ara
        if (!loginButton) {
          const form = passwordInput.closest('form');
          if (form) {
            loginButton = form.querySelector('button[type="submit"]') || form.querySelector('input[type="submit"]');
          }
        }

        // Metin eşleşmesine göre buton ara (Giriş Yap, Oturum Aç, Login vb.)
        if (!loginButton) {
          const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn'));
          loginButton = buttons.find(btn => {
            const val = (btn.textContent || btn.value || '').toLowerCase().trim();
            return val.includes('giriş') || val.includes('oturum') || val.includes('login') || val.includes('gönder') || val.includes('gonder');
          });
        }

        // Eğer buton bulunduysa tıkla
        if (loginButton) {
          loginButton.click();
          resolve({ success: true, clicked: true });
        } else {
          // Buton bulunamadıysa formu doğrudan göndermeyi dene
          const form = passwordInput.closest('form');
          if (form) {
            form.submit();
            resolve({ success: true, submittedForm: true });
          } else {
            resolve({ success: false, reason: "Giriş yap butonu veya formu bulunamadı." });
          }
        }
      }, 500);
    }, 1500);
  });
}
