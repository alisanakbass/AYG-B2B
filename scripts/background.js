// B2B Karşılaştırma Portalı Arka Plan Servis Scripti (Service Worker)

const DEFAULT_URLS = {
  SITE_A: "https://b4b.ozkaradenizinsaat.com/search/product/{query}",
  SITE_B: "https://b2b.enderyapi.com.tr/tr/urunler-s-{query}?page=1",
  SITE_C: "https://bayi.yasarteknik.com.tr/YeniSiparisGir.asp?F=Ara&FAdi={query}",
  SITE_D: "https://yenibayi.polisankansai.com/order/makeordernew?search={query}",
  SITE_E: "https://bayi.akyuztools.com/Search/SearchProduct",
  SITE_G: "https://www.nalburdayim.com/?search_provider=aisearch&query={query}&page=1",
  SITE_H: "https://b2b.kamilturk.com/Arama/_Prbx?q={query}"
};

// Eklenti yüklendiğinde veya güncellendiğinde alarmı kur ve kuralları ayarla
chrome.runtime.onInstalled.addListener(() => {
  // Sadece Yaşar Teknik oturumunu 3 dakikada bir yenilemek için alarmı ayarla
  chrome.alarms.create("b2b_keepalive", { periodInMinutes: 3 });
  setupDeclarativeRules();
});

// Servis çalıştırıcı her uyandığında kuralları doğrula/tanımla ve alarmın kurulu olduğundan emin ol
setupDeclarativeRules();
chrome.alarms.create("b2b_keepalive", { periodInMinutes: 3 });

// Akyüzler için Origin ve Referer başlıklarını manipüle etme kuralları
async function setupDeclarativeRules() {
  const rules = [
    {
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "origin", operation: "set", value: "https://bayi.akyuztools.com" },
          { header: "referer", operation: "set", value: "https://bayi.akyuztools.com/" }
        ]
      },
      condition: {
        urlFilter: "||bayi.akyuztools.com/*",
        resourceTypes: ["xmlhttprequest"]
      }
    },
    {
      id: 2,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "origin", operation: "set", value: "https://b2b.kamilturk.com" },
          { header: "referer", operation: "set", value: "https://b2b.kamilturk.com/" }
        ]
      },
      condition: {
        urlFilter: "||b2b.kamilturk.com/*",
        resourceTypes: ["xmlhttprequest"]
      }
    }
  ];

  try {
    // Eski kuralları temizle ve yenilerini ekle
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1, 2],
      addRules: rules
    });
    console.log("[B2B Background] Declarative Net Request kuralları başarıyla tanımlandı.");
  } catch (err) {
    console.error("[B2B Background] Kurallar tanımlanırken hata oluştu:", err);
  }
}

// Arayüzün (dashboard.html) açık olup olmadığını kontrol eden yardımcı
async function isDashboardOpen() {
  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
  return tabs.length > 0;
}

// Zamanlayıcı tetiklendiğinde
chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Bu alarm artık sadece Yaşar Teknik oturumunu canlı tutmak için kullanılıyor.
  if (alarm.name === "b2b_keepalive") {
    const open = await isDashboardOpen();
    if (open) {
      await keepYasarTeknikAlive();
    }
  }
});

// Yaşar Teknik oturumunu sessizce canlı tutan fonksiyon
async function keepYasarTeknikAlive() {
  try {
    const response = await fetch("https://bayi.yasarteknik.com.tr/Default.asp", {
      method: "GET",
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error(`HTTP Hata: ${response.status}`);
    }
    const htmlText = await response.text();
    // Oturumun açık olup olmadığını kontrol edelim.
    // Eğer sayfada şifre girişi veya login-form varsa ya da Default.asp yerine Login.asp yönlendirmesi olmuşsa oturum kapalı demektir.
    const isLoginPage = htmlText.includes('login-form') || htmlText.includes('KullaniciAdiForm') || htmlText.includes('KullaniciKodu');

    if (isLoginPage) {
      console.log("[B2B KeepAlive] Yaşar Teknik oturumu kapalı, otomatik giriş yapılıyor...");
      await performLoginForSite('SITE_C');
    } else {
      console.log("[B2B KeepAlive] Yaşar Teknik oturumu aktif, ping başarılı.");
      await updateStorageSession('SITE_C', true);
    }
  } catch (error) {
    console.error("[B2B KeepAlive] Yaşar Teknik ping hatası:", error);
  }
}

// Arayüzden gelen mesajları dinleme
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "manual_login") {
    performLoginForSite(message.siteKey, true).then((result) => {
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
    'site-e-check': true,
    'site-g-check': false,
    'site-h-check': true
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
  if (storage['site-g-check']) {
    results.SITE_G = await performLoginForSite('SITE_G');
  }
  if (storage['site-h-check']) {
    results.SITE_H = await performLoginForSite('SITE_H');
  }
  return results;
}

// Belirli bir site için giriş işlemini gerçekleştir
async function performLoginForSite(siteKey, isManual = false) {
  if (siteKey === 'SITE_G') {
    if (isManual) {
      const loginUrl = "https://www.nalburdayim.com/login/";
      try {
        await chrome.tabs.create({ url: loginUrl, active: true });
        return { success: true, message: "Giriş Sayfası Açıldı" };
      } catch (e) {
        return { success: false, message: e.message };
      }
    }
    await updateStorageSession('SITE_G', true);
    return { success: true, message: "Aktif" };
  }

  if (siteKey === 'SITE_C') {
    // Yaşar Teknik için sekme açmak yerine önce sessizce arka planda AJAX POST giriş deniyoruz.
    const creds = await new Promise(r => chrome.storage.sync.get({
      cred_company_site_c: "12001451",
      cred_user_site_c: "1",
      cred_pass_site_c: "AYGUNLER"
    }, r));
    
    const companyCode = creds.cred_company_site_c || "12001451";
    const username = creds.cred_user_site_c || "1";
    const password = creds.cred_pass_site_c || "AYGUNLER";

    try {
      const loginRes = await fetch("https://bayi.yasarteknik.com.tr/ajax/Login.asp", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: `KullaniciAdiForm=${encodeURIComponent(companyCode)}&KullaniciKodu=${encodeURIComponent(username)}&Sifre=${encodeURIComponent(password)}`
      });

      if (loginRes.ok) {
        const text = await loginRes.text();
        if (text.trim() === "1" || text.trim() === "0") {
          console.log("[B2B Background] Yaşar Teknik sessiz giriş başarılı.");
          await updateStorageSession('SITE_C', true);
          return { success: true, message: "Oturum Sessizce Açıldı" };
        }
      }
    } catch (err) {
      console.error("[B2B Background] Yaşar Teknik sessiz giriş hatası:", err);
    }
    console.log("[B2B Background] Yaşar Teknik sessiz giriş başarısız oldu, sekmeli yönteme geçiliyor.");
  }

  if (siteKey === 'SITE_E') {
    // Akyüzler için eğer manuel tıklama yapıldıysa giriş sayfasını yeni sekmede açıyoruz.
    // Arka plan otomatik tetiklemelerinde ise sadece token kontrolü yapıyoruz.
    const storageData = await new Promise(r => chrome.storage.local.get('akyuz_token', r));
    const hasToken = !!storageData.akyuz_token;

    if (isManual && !hasToken) {
      const loginUrl = "https://bayi.akyuztools.com/";
      try {
        await chrome.tabs.create({ url: loginUrl, active: true });
        return { success: true, message: "Giriş Sayfası Açıldı" };
      } catch (e) {
        return { success: false, message: e.message };
      }
    }

    // Durumu storage'da da güncelleyelim
    await updateStorageSession('SITE_E', hasToken);
    return { success: hasToken, message: hasToken ? "Giriş Başarılı" : "Giriş Gerekli" };
  }

  let loginUrl = "";
  if (siteKey === 'SITE_H') {
    loginUrl = "https://b2b.kamilturk.com/Login/Login";
  } else {
    try {
      // Özelleştirilmiş URL şablonunu al
      const syncKey = `url_${siteKey.toLowerCase()}`;
      const syncData = await new Promise(r => chrome.storage.sync.get(syncKey, r));
      const urlTemplate = syncData[syncKey] || DEFAULT_URLS[siteKey];
      loginUrl = new URL(urlTemplate).origin;
    } catch (e) {
      // Hata durumunda varsayılan domain köküne yönel
      const def = DEFAULT_URLS[siteKey];
      if (def) {
        loginUrl = def.split('/search')[0].split('/tr/')[0].split('/YeniSiparis')[0].split('/Arama')[0];
      } else {
        loginUrl = "https://b2b.kamilturk.com";
      }
    }
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
    cred_pass_site_d: "27f4e5d",
    cred_user_site_h: "1340631",
    cred_pass_site_h: "662732"
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
  if (!creds.cred_user_site_h) creds.cred_user_site_h = "1340631";
  if (!creds.cred_pass_site_h) creds.cred_pass_site_h = "662732";

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
        try { chrome.tabs.remove(tab.id); } catch (e) { }
        return { success: true, message: "Zaten Giriş Yapılmış" };
      } else {
        // Giriş butonuna tıklandıysa, yönlendirme ve giriş yapılması için 4 saniye bekle
        await new Promise(r => setTimeout(r, 4000));

        let loggedIn = false;
        try {
          // Girişin başarılı olup olmadığını doğrulamak için tekrar kontrol et
          const verifyResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const hasPassword = !!document.querySelector('input[type="password"]');
              return { loggedIn: !hasPassword };
            }
          });
          loggedIn = verifyResult[0]?.result?.loggedIn || false;
        } catch (verifyErr) {
          // Yönlendirme bittiyse ve sekme kapandıysa veya erişilemez olduysa, giriş başarılı varsayılabilir
          console.warn(`[B2B Background] ${siteKey} doğrulama sekmesi okunamadı, başarılı varsayılıyor.`, verifyErr);
          loggedIn = true;
        }

        await updateStorageSession(siteKey, loggedIn);

        try { chrome.tabs.remove(tab.id); } catch (e) { }
        return { success: loggedIn, message: loggedIn ? "Giriş Başarılı" : "Şifre/Giriş Hatası veya Doldurma Yapılamadı" };
      }
    } else {
      await updateStorageSession(siteKey, false);
      try { chrome.tabs.remove(tab.id); } catch (e) { }
      return { success: false, message: res.reason || "Giriş başarısız oldu." };
    }
  } catch (error) {
    console.error(`[B2B Background] ${siteKey} giriş akışı sırasında hata oluştu:`, error);
    if (tab && tab.id) {
      try { chrome.tabs.remove(tab.id); } catch (e) { }
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
      } else if (siteKey === 'SITE_H') {
        username = creds.cred_user_site_h;
        password = creds.cred_pass_site_h;
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
