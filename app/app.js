// Browser-only entry point. The adapter is evaluated before the shared viewer.
import './viewer-storage.js';
import './viewer.js';
import './github-ui.js';
import './github-mounts.js';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
