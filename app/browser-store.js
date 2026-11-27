// Each mounted repository has its own records, Git blobs and sync history.
export const mounted = typeof location === 'undefined' ? null : new URL(location.href).searchParams.get('library');
export const namespace = mounted === null ? 'personal' : 'mount:' + mounted.toLowerCase();
const legacyKey = 'inntake-local-library-v1';
let opening;
const changes = typeof window !== 'undefined' && 'BroadcastChannel' in window ? new BroadcastChannel('inntake:' + namespace) : null;
if (changes) changes.onmessage = event => {
  window.dispatchEvent(new Event('inntake-metadata-saved'));
  if (event.data === 'sync') window.dispatchEvent(new Event('inntake-other-tab-synced'));
  if (event.data === 'edit') window.dispatchEvent(new Event('inntake-local-edit'));
  if (event.data === 'options') window.dispatchEvent(new Event('inntake-sync-options'));
  if (event.data === 'connection') window.dispatchEvent(new Event('inntake-connection-changed'));
};

export function notifyConnectionChange() { changes?.postMessage('connection'); }
export function notifySyncOptions() { changes?.postMessage('options'); }

function db() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const req = indexedDB.open('inntake-viewer:' + namespace, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('state');
      req.result.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { opening = null; reject(req.error); };
  });
  return opening;
}

export async function readValue(store, key) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const req = database.transaction(store).objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function writeValues(store, entries, blobs) {
  const database = await db();
  await new Promise((resolve, reject) => {
    const tx = database.transaction(blobs ? [store, 'blobs'] : store, 'readwrite');
    if (blobs) for (const [key,value] of blobs) tx.objectStore('blobs').put(value,key);
    for (const [key, value] of entries) tx.objectStore(store).put(value, key);
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || new Error('Browser storage could not save these changes.'));
  });
}

export async function libraryView() {
  const view = {
    raw: null, changed: false,
    archiveIndex: () => readValue('state','assets'),
    getBlob: id => readValue('blobs', id),
    stageArchive(index, blobs) { this.archive = {index, blobs}; },
    async refresh() {
      this.archive = null;
      const saved = await readValue('state', 'library');
      this.raw = saved ?? (mounted === null ? localStorage.getItem(legacyKey) : null);
      this.changed = false;
    },
    getItem() { return this.raw; },
    setItem(key, value) { this.raw = value; this.changed = true; },
    async flush(more = [], syncWrite = false) {
      if (this.changed && !syncWrite) more = [...more, ['syncDirty', true]];
      if (this.archive) more = [...more, ['assets',this.archive.index]];
      if (this.changed || more.length) await writeValues('state', [...more, ['library', this.raw]],this.archive?.blobs);
      this.archive=null;
      if (this.changed) {
        changes?.postMessage(syncWrite ? 'sync' : 'edit');
        if (!syncWrite) window.dispatchEvent(new Event('inntake-local-edit'));
      }
      this.changed = false;
    }
  };
  await view.refresh();
  return view;
}

export function exclusive(fn) {
  if (!globalThis.navigator?.locks) throw new Error('Open this library in a current browser over HTTPS to save changes.');
  return navigator.locks.request('inntake-library:' + namespace, fn);
}
