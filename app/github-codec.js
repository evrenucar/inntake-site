// The private repository uses the same Markdown and attachment paths as the Mac library.
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});
const entryPath = /^entries\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.md$/;
const fallbackDate = '1970-01-01T00:00:00Z';
const has = (value, key) => Object.hasOwn(value, key);

function scalar(value) {
  try { return JSON.parse(value); } catch {}
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  if (/^["\[{]/.test(value)) throw new Error('Invalid Markdown metadata.');
  return value;
}

function parse(bytes) {
  const raw = decoder.decode(bytes);
  const match = /^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m.exec(raw);
  if (!match || match.index !== 0) throw new Error('Missing Markdown front matter.');
  const meta = Object.create(null);
  let list = null;
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const key = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(line);
    if (key) {
      if (has(meta, key[1])) throw new Error('Duplicate Markdown metadata field.');
      const value = key[2].trim();
      list = value ? null : key[1];
      meta[key[1]] = value ? scalar(value) : null;
    } else if (list && /^\s+-\s+/.test(line)) {
      (meta[list] ??= []).push(scalar(line.replace(/^\s+-\s+/, '').trim()));
    } else throw new Error('Unsupported Markdown metadata.');
  }
  return {meta, body: raw.slice(match[0].length)};
}

function serialize(meta, body) {
  return encoder.encode('---\n' + Object.entries(meta).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\n') + '\n---\n' + body);
}

function webUrl(value) {
  try {
    const u = new URL(value);
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password;
  } catch { return false; }
}

function safeSource(path) {
  return typeof path === 'string' && path.startsWith('sources/') && !path.toLowerCase().startsWith('sources/migrations/')
    && !/[\\\x00-\x1f]/.test(path) && path.split('/').every(p => p && !p.startsWith('.'));
}

function base64(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 16384) parts.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
  return btoa(parts.join(''));
}

function itemFrom(path, files) {
  const {meta, body} = parse(files.get(path));
  if (entryPath.exec(path)?.[1] !== meta.id || typeof meta.title !== 'string' || !meta.title.trim()) throw new Error('Invalid Markdown entry at ' + path);
  const collections = [...new Set(meta.collections ?? (meta.collection ? [meta.collection] : []))];
  if (meta.queue === 'watch-later' && !collections.includes('Watch later')) collections.push('Watch later');
  const urls = (meta.source_urls ?? []).filter(webUrl);
  const sourcePaths = (meta.source_paths ?? []).filter(safeSource);
  const item = {
    canonical: true, id: meta.id, title: meta.title, url: urls[0] || '', urls, sourcePaths,
    tags: meta.tags || [], relatedIds: meta.related_ids || [], collections, collection: collections[0] || '',
    createdAt: meta.created_at || fallbackDate, updatedAt: meta.updated_at || meta.created_at || fallbackDate,
    category: meta.category ?? 'reference', impact: meta.impact ?? null, core: meta.core === true,
    archived: meta.status === 'archived', trashed: meta.trashed === true, body,
  };
  const prefix = 'sources/' + meta.id + '/image.';
  const pathToImage = sourcePaths.find(p => p.startsWith(prefix) && /\.(jpe?g|png|webp|gif)$/i.test(p));
  if (!urls.length && pathToImage && files.has(pathToImage)) {
    const type = pathToImage.slice(prefix.length).replace(/^jpg$/, 'jpeg');
    item.image = 'data:image/' + type + ';base64,' + base64(files.get(pathToImage));
  }
  if (meta.browser_capture_hash) item.captureHash = meta.browser_capture_hash;
  if (meta.youtube_author) item.youtubeAuthor = meta.youtube_author;
  return {meta, item};
}

function readSettings(files) {
  const settings = files.has('collections.json') ? JSON.parse(decoder.decode(files.get('collections.json'))) : {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid collection settings.');
  return {version: 1, parents: {}, icons: {}, appearance: {}, pinned: [], order: [], ...settings};
}

export function decodeWorkspace(files) {
  const settings = readSettings(files);
  const items = [...files.keys()].filter(path => entryPath.test(path)).sort().map(path => itemFrom(path, files).item);
  const collections = [...new Set([...Object.keys(settings.parents), ...Object.values(settings.parents).filter(Boolean),
    ...Object.keys(settings.icons), ...Object.keys(settings.appearance), ...settings.order, ...settings.pinned,
    ...items.flatMap(item => item.collections)])];
  settings.parents = Object.assign(Object.create(null), Object.fromEntries(collections.map(name => [name, null])), settings.parents);
  return {version: 1, collections, settings, items};
}

function equal(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => has(b, key) && equal(a[key], b[key]));
}

// Encode only edits. Untouched entries (including hand formatting) and assets keep their original Git blobs.
export function encodeWorkspace(library, files) {
  const changes = new Map();
  const original = decodeWorkspace(files);
  const previous = new Map(original.items.map(item => [item.id, item]));
  for (const item of library.items) {
    const path = 'entries/' + item.id + '.md';
    if (!entryPath.test(path)) throw new Error('Invalid item ID.');
    const before = previous.get(item.id);
    const meta = before ? parse(files.get(path)).meta : Object.assign(Object.create(null), {
      id: item.id, tags: [], related_ids: [], source_urls: [], source_paths: [],
    });
    let changed = !before || before.body !== item.body;
    function set(field, key, value = item[field]) {
      if (!before || !equal(before[field], item[field])) {
        meta[key] = value;
        changed = true;
        return true;
      }
      return false;
    }
    set('title', 'title');
    set('category', 'category');
    set('createdAt', 'created_at');
    set('updatedAt', 'updated_at');
    set('archived', 'status', item.archived ? 'archived' : 'active');
    set('trashed', 'trashed', !!item.trashed);
    set('core', 'core', !!item.core);
    set('impact', 'impact', item.impact ?? null);
    if (set('collections', 'collections', item.collections || [])) {
      meta.collection = (item.collections || [])[0] || '';
      if (meta.queue === 'watch-later') delete meta.queue;
    }
    // The viewer normalizes simple HTTP addresses. Keep existing provenance URLs verbatim.
    if (!before && item.url) meta.source_urls = [item.url];
    if (item.captureHash && before?.captureHash !== item.captureHash) { meta.browser_capture_hash = item.captureHash; changed = true; }
    if (item.youtubeAuthor && before?.youtubeAuthor !== item.youtubeAuthor) { meta.youtube_author = item.youtubeAuthor; changed = true; }
    if (item.image && item.image !== before?.image) {
      const image = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(item.image);
      if (!image) throw new Error('Invalid captured image.');
      const asset = 'sources/' + item.id + '/image.' + (image[1] === 'jpeg' ? 'jpg' : image[1]);
      changes.set(asset, Uint8Array.from(atob(image[2]), c => c.charCodeAt(0)));
      meta.source_paths = [...new Set([...(meta.source_paths || []), asset])];
      changed = true;
    }
    if (changed) changes.set(path, serialize(meta, item.body));
  }
  const settings = readSettings(files);
  let changed = false;
  for (const key of ['parents', 'icons', 'appearance', 'pinned', 'order']) {
    if (!equal(original.settings[key], library.settings[key])) {
      settings[key] = library.settings[key];
      changed = true;
    }
  }
  for (const key of ['youtubeRequests', 'youtubePlaylists']) {
    if (!equal(original.settings[key] || [], library.settings[key] || [])) {
      settings[key] = library.settings[key] || [];
      changed = true;
    }
  }
  if (changed || !files.has('collections.json')) changes.set('collections.json', encoder.encode(JSON.stringify(settings, null, 2) + '\n'));
  return changes;
}
