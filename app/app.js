// Browser-only entry point. The adapter is evaluated before the shared viewer.
import './viewer-storage.js';
import './viewer.js';

const backup = document.querySelector('#backup-download');
const restore = document.querySelector('#backup-restore');
const status = document.querySelector('#backup-status');

backup.addEventListener('click', async event => {
  event.preventDefault();
  try {
    const response = await window.inntakeLocalFetch('/api/backup');
    if (!response.ok) throw new Error((await response.json()).error || 'Could not export this library.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'inntake-library-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    status.textContent = 'JSON backup downloaded.';
  } catch (error) {
    status.textContent = error.message;
  }
});

restore.addEventListener('change', async () => {
  const file = restore.files[0];
  if (!file) return;
  restore.disabled = true;
  try {
    const response = await window.inntakeLocalFetch('/api/restore', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: await file.text()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not restore this backup.');
    window.dispatchEvent(new Event('inntake-library-imported'));
    status.textContent = result.added ? 'Restored ' + result.added + (result.added === 1 ? ' item.' : ' items.') : 'Your library is up to date.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    restore.disabled = false;
    restore.value = '';
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
