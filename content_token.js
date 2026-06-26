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

  chrome.storage.local.get('enderyapi_token', (result) => {
    if (result.enderyapi_token !== token) {
      chrome.storage.local.set({ enderyapi_token: token });
    }
  });
});
