// content_token.js — ISOLATED world'de çalışır (chrome.storage VAR, window.fetch YOK)
// MAIN world'den postMessage ile gelen token'ı alır ve chrome.storage.local'e kaydeder.

window.addEventListener('message', (event) => {
  if (
    event.source !== window ||
    !event.data ||
    event.data.type !== '__B2B_TOKEN__' ||
    !event.data.token
  ) return;

  const token = event.data.token;
  if (typeof token !== 'string' || token.length < 20) return;

  const isAkyuz = window.location.hostname.includes('akyuztools.com');
  const storageKey = isAkyuz ? 'akyuz_token' : 'enderyapi_token';

  chrome.storage.local.get(storageKey, (result) => {
    if (result[storageKey] !== token) {
      chrome.storage.local.set({ [storageKey]: token });
    }
  });
});
