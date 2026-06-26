document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('open-dashboard-btn');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });
  }
});
