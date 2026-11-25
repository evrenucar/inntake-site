export const libraryKey = 'inntake-local-library-v1';
const backupFormat = 'inntake-local-library';

export function emptyLibrary() {
  return {version: 1, collections: [], items: []};
}

export function cleanUrl(value) {
  if (typeof value !== 'string') throw new Error('Enter one HTTP or HTTPS link.');
  const text = value.trim();
  let address;
  try { address = new URL(text); } catch {}
  if (!/^https?:\/\//i.test(text) || /[\s<>\\]/.test(text) || !address?.hostname || address.username || address.password || address.href.length > 3000) {
    throw new Error('Enter one HTTP or HTTPS link.');
  }
  return address.href;
}

export function normalizeItem(item) {
  if (!item || typeof item.id !== 'string' || !/^[0-9a-f-]{36}$/.test(item.id) || typeof item.collection !== 'string' || item.collection.length > 80 || typeof item.title !== 'string' || item.title.length > 200 || typeof item.note !== 'string' || item.note.length > 5000 || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))) {
    throw new Error('The backup contains an invalid link record.');
  }
  const url = cleanUrl(item.url);
  return {id: item.id, url, title: item.title.trim() || new URL(url).hostname, note: item.note.trim(), collection: item.collection, createdAt: item.createdAt};
}

function parseLibrary(raw, isBackup = false) {
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !Array.isArray(data.collections) || !Array.isArray(data.items) || (isBackup && data.format !== backupFormat)) {
    throw new Error('Choose a JSON backup exported from this Inntake Library.');
  }
  const names = new Set(data.collections);
  if (names.size !== data.collections.length || data.collections.some(name => typeof name !== 'string' || !name.trim() || name !== name.trim() || name.length > 80)) {
    throw new Error('The backup contains an invalid collection.');
  }
  const items = data.items.map(normalizeItem);
  if (new Set(items.map(item => item.id)).size !== items.length || items.some(item => item.collection && !names.has(item.collection))) {
    throw new Error('The backup contains duplicate IDs or missing collections.');
  }
  return {version: 1, collections: data.collections, items};
}

export function readLibrary(storage = localStorage) {
  const raw = storage.getItem(libraryKey);
  return raw === null ? emptyLibrary() : parseLibrary(raw);
}

export function writeLibrary(library, storage = localStorage) {
  storage.setItem(libraryKey, JSON.stringify(library));
}

export function exportLibrary(library) {
  return JSON.stringify({format: backupFormat, ...library}, null, 2);
}

export function mergeBackup(library, raw) {
  const backup = parseLibrary(raw, true);
  const ids = new Set(library.items.map(item => item.id));
  const urls = new Set(library.items.map(item => item.url));
  const additions = [];
  for (const item of backup.items) {
    if (ids.has(item.id) || urls.has(item.url)) continue;
    additions.push(item);
    ids.add(item.id);
    urls.add(item.url);
  }
  return {library: {...library, collections: [...new Set([...library.collections, ...backup.collections])], items: [...library.items, ...additions]}, count: additions.length};
}
