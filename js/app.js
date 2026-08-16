// ============================================================
// APP — bootstrap
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();
});

// Hide day drawer when clicking outside
document.getElementById('dayDetail').addEventListener('click', e => {
  if (e.target === document.getElementById('dayDetail')) closeDayDetail();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeDayDetail(); closeSidebar(); }
});
// Populate dynamic filters after first data load
setInterval(() => {
  if (State.ready) {
    if (!document.getElementById('salesCatFilter').dataset.loaded) {
      populateSalesCatFilter(); populateExpCatFilter(); populateInvCatFilter();
      document.getElementById('salesCatFilter').dataset.loaded = '1';
    }
  }
}, 300);
