// content_token_main.js — MAIN world'de çalışır (chrome.storage YOK, window.fetch/XHR var)
(() => {

  function relayToken(rawValue) {
    if (!rawValue || typeof rawValue !== 'string') return;
    const clean = rawValue.replace(/^Bearer\s+/i, '').trim();
    if (clean.length < 20) return;
    // ISOLATED world'deki dinleyiciye ilet
    window.postMessage({ type: '__B2B_TOKEN__', token: clean }, '*');
  }

  // XHR Authorization header yakalama
  const OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OrigXHR();
    const origSet = xhr.setRequestHeader.bind(xhr);
    xhr.setRequestHeader = function(name, value) {
      if (name && name.toLowerCase() === 'authorization' && value) {
        relayToken(value);
      }
      return origSet(name, value);
    };
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

  // fetch() Authorization header yakalama
  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    if (init && init.headers) {
      let auth = null;
      if (init.headers instanceof Headers) {
        auth = init.headers.get('Authorization') || init.headers.get('authorization');
      } else if (typeof init.headers === 'object') {
        auth = init.headers['Authorization'] || init.headers['authorization'];
      }
      if (auth) relayToken(auth);
    }
    return origFetch.apply(this, arguments);
  };

  // localStorage/sessionStorage JWT taraması (fallback)
  function scanStorage() {
    try {
      for (const storage of [localStorage, sessionStorage]) {
        for (const key of Object.keys(storage)) {
          const val = storage.getItem(key);
          if (!val || typeof val !== 'string') continue;
          // JWT: üç parça base64url
          if (/^[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}$/.test(val.trim())) {
            relayToken(val.trim());
            return;
          }
          if (val.startsWith('Bearer ') && val.length > 30) {
            relayToken(val);
            return;
          }
        }
      }
    } catch (e) {}
  }

  ['localStorage', 'sessionStorage'].forEach(name => {
    try {
      const orig = window[name].setItem;
      window[name].setItem = function(key, value) {
        orig.apply(this, arguments);
        scanStorage();
      };
    } catch (e) {}
  });

  scanStorage();
  window.addEventListener('load', scanStorage);
  document.addEventListener('DOMContentLoaded', scanStorage);
})();
