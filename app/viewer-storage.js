const libraryKey = 'inntake-local-library-v1';
const libraryId = 'inntake-browser-library';
const backupFormat = 'inntake-local-library';
const categories = new Set(['', 'idea', 'consideration', 'question', 'todo', 'resource', 'reference', 'bookmark', 'project-log']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const entryPath = /^entries\/([0-9a-f-]{36})\.md$/;
const appBase = new URL('./', import.meta.url);
const has = (record, key) => Object.hasOwn(record, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const dictionary = value => Object.assign(Object.create(null), value);
const unique = values => [...new Set(values)];

class LocalError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function field(value, max, message) {
  if (typeof value !== 'string' || value.length > max) throw new LocalError(message);
  return value;
}

function name(value) {
  const text = field(value, 100, 'Use a collection name up to 100 characters.').trim();
  if (!text || /[\u0000-\u001f\u007f]/.test(text)) throw new LocalError('Choose a valid collection name.');
  return text;
}

function names(values) {
  if (!Array.isArray(values)) throw new LocalError('Choose valid collection names.');
  return unique(values.map(name));
}

function address(value) {
  const text = field(value, 8192, 'Enter a valid HTTP or HTTPS link.').trim();
  let url;
  try { url = new URL(text); } catch {}
  if (!/^https?:\/\//i.test(text) || /[\s\x00-\x1f\x7f<>\\]/.test(text) || !url?.hostname || url.username || url.password) {
    throw new LocalError('Enter a valid HTTP or HTTPS link without credentials.');
  }
  return url.href;
}

function youtubeId(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  let id;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  if (['youtube.com', 'youtube-nocookie.com'].includes(host)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1];
  }
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

function metadataText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
}

function fallbackTitle(value) {
  const url = new URL(value);
  if (youtubeId(value)) return url.hostname;
  const reddit = url.hostname === 'reddit.com' || url.hostname.endsWith('.reddit.com');
  const post = reddit && /^\/(?:r\/[A-Za-z0-9_]+\/)?comments\/[A-Za-z0-9]+\/([^/]+)/.exec(url.pathname);
  const tail = post ? post[1] : url.pathname.split('/').filter(Boolean).at(-1) || '';
  let title = '';
  try { title = metadataText(decodeURIComponent(tail).replace(/\.html?$/i, '').replace(/[-_]+/g, ' ')); } catch {}
  return title && (post || (title.includes(' ') && /\p{L}{3}/u.test(title))) ? title[0].toUpperCase() + title.slice(1) : url.hostname;
}

function category(value) {
  if (!categories.has(value)) throw new LocalError('Choose a valid category.');
  return value;
}

function sectionSpan(body, heading) {
  const current = new RegExp(`^##[ \\t]+${heading}[ \\t]*\\r?\\n`, 'im').exec(body);
  if (!current) return null;
  const start = current.index + current[0].length;
  const next = body.slice(start).search(/^##[ \t]+/m);
  return [start, next < 0 ? body.length : start + next];
}

function section(body, heading) {
  const span = sectionSpan(body, heading);
  return span ? body.slice(...span).trim() : '';
}

function withSection(body, heading, contents) {
  const span = sectionSpan(body, heading);
  const text = contents.trim();
  if (span) return body.slice(0, span[0]) + text + '\n\n' + body.slice(span[1]);
  return text ? `${body.trimEnd()}\n\n## ${heading}\n${text}\n` : body;
}

function newBody(title, note, url) {
  return `${withSection(`# ${title}\n`, 'User notes', note).trimEnd()}\n\n## Sources and provenance\n${url ? '<'+url+'>' : 'Image saved from browser'}\n`;
}

function validatedAppearance(value) {
  if (!object(value) || !['auto', 'moss', 'ocean', 'ember', 'violet', 'graphite'].includes(value.theme) || typeof value.motion !== 'boolean') throw new LocalError('Choose a collection theme and animation preference.');
  const result = {theme: value.theme, motion: value.motion};
  if (has(value, 'motionOverride')) {
    if (typeof value.motionOverride !== 'boolean') throw new LocalError('Invalid background motion preference.');
    result.motionOverride = value.motionOverride;
  }
  if (has(value, 'colors')) {
    if (!Array.isArray(value.colors) || value.colors.length !== 3 || value.colors.some(color => typeof color !== 'string' || !/^#[a-f0-9]{6}$/i.test(color))) throw new LocalError('Choose three valid background colours.');
    result.colors = value.colors;
  }
  return result;
}

function validatedIcon(value) {
  const icon = field(value, 90, 'Choose an icon or a short symbol.').trim();
  if (!icon || /[\u0000-\u001f\u007f]/.test(icon) || (icon.startsWith('lucide:') ? !/^lucide:[a-z0-9-]{1,80}$/.test(icon) : icon.length > 32)) throw new LocalError('Choose an icon or a short symbol.');
  return icon;
}

function assertHierarchy(parents) {
  for (const start of Object.keys(parents)) {
    const seen = new Set();
    for (let next = start; next !== null; next = parents[next]) {
      if (seen.has(next) || !has(parents, next)) throw new LocalError('Choose a parent outside this collection and its subcollections.');
      seen.add(next);
    }
  }
}

function imageData(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 16800000 || !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) throw new LocalError('Invalid image data.');
  return value;
}
const imagePaths = new Map();

function normalizeRecord(value) {
  if (!object(value) || typeof value.id !== 'string' || !uuid.test(value.id)) throw new LocalError('The browser library has an invalid item.');
  const image = imageData(value.image);
  const url = image ? '' : address(value.url);
  const title = field(value.title, 200, 'An item title is invalid.').trim() || (image ? 'Saved image' : new URL(url).hostname);
  const primary = value.collection || '';
  const collections = names(value.collections ?? (primary ? [primary] : []));
  const createdAt = value.createdAt;
  if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) throw new LocalError('An item has an invalid date.');
  const body = has(value, 'body') ? field(value.body, 100000, 'An item note is too long.') : newBody(title, field(value.note || '', 20000, 'An item note is too long.'), url);
  const impact = value.impact ?? null;
  if (impact !== null && (!Number.isInteger(impact) || impact < 0 || impact > 7)) throw new LocalError('An item has an invalid impact score.');
  const record = {id: value.id, url, title, note: section(body, 'User notes'), collection: collections[0] || '', collections, createdAt,
    updatedAt: typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt)) ? value.updatedAt : createdAt,
    body, category: category(value.category ?? ''), impact, core: value.core === true, archived: value.archived === true, trashed: value.trashed === true,
    revision: typeof value.revision === 'string' ? value.revision : `legacy-${value.id}`};
  if (image) record.image = image;
  if (typeof value.captureHash === 'string') record.captureHash = value.captureHash;
  if (metadataText(value.youtubeAuthor)) record.youtubeAuthor = metadataText(value.youtubeAuthor);
  return record;
}

function normalizeLibrary(value, backup = false) {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.items) || (backup && value.format !== backupFormat)) {
    throw new LocalError('Choose a JSON backup exported from the browser library.');
  }
  const items = value.items.map(normalizeRecord);
  if (new Set(items.map(item => item.id)).size !== items.length) throw new LocalError('The browser library contains duplicate item IDs.');
  const collections = unique([...names(value.collections), ...items.flatMap(item => item.collections)]);
  const settings = object(value.settings) ? value.settings : {};
  const parents = dictionary(Object.fromEntries(collections.map(collection => [collection, null])));
  const icons = dictionary(), appearance = dictionary();
  for (const collection of collections) {
    if (object(settings.parents) && has(settings.parents, collection)) {
      const parent = settings.parents[collection];
      parents[collection] = parent === null ? null : name(parent);
    }
    if (object(settings.icons) && has(settings.icons, collection)) icons[collection] = validatedIcon(settings.icons[collection]);
    if (object(settings.appearance) && has(settings.appearance, collection)) appearance[collection] = validatedAppearance(settings.appearance[collection]);
  }
  assertHierarchy(parents);
  const pinned = names(settings.pinned ?? []).filter(collection => has(parents, collection));
  const order = names(settings.order ?? []).filter(collection => has(parents, collection));
  return {version: 1, collections, items, settings: {version: 1, parents, icons, appearance, pinned, order},
    revision: typeof value.revision === 'string' ? value.revision : 'legacy',
    settingsRevision: typeof value.settingsRevision === 'string' ? value.settingsRevision : null};
}

// Serialize read-modify-write operations across tabs sharing this library.
function writeLibrary(operation) {
  const locks = globalThis.navigator?.locks;
  return locks ? locks.request(libraryKey, operation) : operation();
}

function load(storage) {
  const raw = storage.getItem(libraryKey);
  if (raw === null) return normalizeLibrary({version: 1, collections: [], items: []});
  try { return normalizeLibrary(JSON.parse(raw)); }
  catch { throw new LocalError('Could not read this browser’s saved library.', 500); }
}

function save(storage, data, settingsChanged = false) {
  data.revision = crypto.randomUUID();
  if (settingsChanged) data.settingsRevision = crypto.randomUUID();
  storage.setItem(libraryKey, JSON.stringify(data));
}

function display(record) {
  const item = {category: record.category, collection: record.collection, collections: record.collections, body: record.body, notes: record.note,
    strengths: section(record.body, 'Strengths'), limitations: section(record.body, 'Limitations'), archived: record.archived, trashed: record.trashed,
    core: record.core, impact: record.impact, revision: record.revision};
  const source = {id: record.id, title: record.title, summary: section(record.body, 'Summary') || record.youtubeAuthor || '', category: record.category, collection: record.collection,
    collections: record.collections, tags: [], addedAt: record.createdAt, updatedAt: record.updatedAt, url: record.url, urls: [record.url],
    path: `entries/${record.id}.md`, sourceType: 'note', images: [], attachments: [], fullText: record.body, relatedIds: []};
  if (record.image) {
    const path = 'sources/' + record.id + '/image.' + record.image.slice(11,record.image.indexOf(';'));
    imagePaths.set(path, record.image);
    source.images = [{path, title:record.title}]; source.sourceType = 'image'; source.urls = [];
  }
  return {item, source, warning: null};
}

function catalog(data) {
  const records = data.items.map(display);
  return {sources: records.map(record => record.source), items: Object.fromEntries(records.map(record => [record.source.id, record.item])),
    errors: [], version: data.revision, libraryId, collectionIcons: data.settings.icons, collectionIconsRevision: data.settingsRevision,
    collectionParents: data.settings.parents, pinnedCollections: data.settings.pinned, collectionAppearance: data.settings.appearance, collectionOrder: data.settings.order, youtubePlaylists: []};
}

async function capture(storage, input) {
  if (typeof input.id !== 'string' || !uuid.test(input.id)) throw new LocalError('A valid capture ID is required.');
  const image = imageData(input.image);
  const url = image ? '' : address(input.url);
  const enteredTitle = field(input.title ?? '', 200, 'Use a shorter title.').trim();
  const title = enteredTitle || (image ? 'Saved image' : fallbackTitle(url));
  const note = field(input.note ?? '', 20000, 'Use a shorter note.').trim();
  const collection = field(input.collection ?? '', 100, 'Choose an existing collection.').trim();
  const kind = category(input.category ?? '');
  const bytes = new TextEncoder().encode(JSON.stringify([image || url, enteredTitle || (image ? title : new URL(url).hostname), note, collection, kind]));
  const captureHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  const data = load(storage);
  const previous = data.items.find(item => item.id === input.id);
  if (previous) {
    if (previous.captureHash !== captureHash) throw new LocalError('That capture ID is already in use.', 409);
    return {created: false, ...display(previous)};
  }
  if (collection && !data.collections.includes(collection)) throw new LocalError('Choose an existing collection or leave it blank.');
  const createdAt = new Date().toISOString();
  const record = normalizeRecord({id: input.id, image, url, title, note, collection, category: kind, createdAt, revision: crypto.randomUUID(), captureHash});
  data.items.push(record);
  save(storage, data);
  return {created: true, ...display(record)};
}

async function enrichYouTubeTitle(storage, nativeFetch, source) {
  const video = youtubeId(source.url);
  if (!video) return;
  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', `https://www.youtube.com/watch?v=${video}`);
  endpoint.searchParams.set('format', 'json');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await nativeFetch(endpoint, {mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal});
    if (!response.ok) return;
    const result = await response.json();
    const title = metadataText(result.title);
    if (!title) return;
    await writeLibrary(() => {
      const data = load(storage);
      const current = data.items.find(item => item.id === source.id);
      if (!current || current.trashed || current.url !== source.url || current.title !== source.title) return;
      current.title = title;
      const author = metadataText(result.author_name);
      if (author) current.youtubeAuthor = author;
      // The display title can arrive while the user edits the note. Leave its revision and body alone.
      save(storage, data);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('inntake-metadata-saved'));
    });
  } catch {
    // The URL and user's note are already saved if YouTube is unavailable.
  } finally { clearTimeout(timer); }
}

function edit(storage, id, input) {
  const data = load(storage);
  const record = data.items.find(item => item.id === id);
  if (!record) throw new LocalError('Entry no longer exists. Your draft is preserved.', 404);
  if (input.revision !== record.revision) throw new LocalError('This entry changed elsewhere. Load the latest entry before saving.', 409);
  if (record.trashed && !has(input, 'trashed')) throw new LocalError('Restore this item from Trash before editing it.', 409);
  for (const key of ['core', 'archived', 'trashed']) {
    if (!has(input, key)) continue;
    if (typeof input[key] !== 'boolean') throw new LocalError(`Invalid ${key} value.`);
    record[key] = input[key];
  }
  if (has(input, 'category')) record.category = category(input.category);
  if (has(input, 'impact')) record.impact = input.impact;
  if (has(input, 'collections')) record.collections = names(input.collections);
  else if (has(input, 'collection')) {
    const primary = field(input.collection, 100, 'Choose a valid collection name.').trim();
    record.collections = unique([primary, ...record.collections.filter(value => value !== record.collection)].filter(Boolean));
  }
  record.collection = record.collections[0] || '';
  if (has(input, 'body')) record.body = field(input.body, 100000, 'The note exceeds 100,000 characters.');
  else {
    for (const [key, heading, max] of [['notes', 'User notes', 20000], ['strengths', 'Strengths', 5000], ['limitations', 'Limitations', 5000]]) {
      if (has(input, key)) record.body = withSection(record.body, heading, field(input[key], max, `${heading} is too long.`));
    }
  }
  record.revision = crypto.randomUUID();
  record.updatedAt = new Date().toISOString();
  const edited = normalizeRecord(record);
  data.items[data.items.indexOf(record)] = edited;
  const added = edited.collections.filter(collection => !data.collections.includes(collection));
  for (const collection of added) { data.collections.push(collection); data.settings.parents[collection] = null; }
  save(storage, data, added.length > 0);
  return display(edited);
}

function saveCollection(storage, input, iconOnly) {
  const data = load(storage);
  if (input.revision !== data.settingsRevision) throw new LocalError('Collections changed elsewhere. Refresh and try again.', 409);
  const collection = name(iconOnly ? input.collection : input.name);
  const settings = data.settings;
  const exists = data.collections.includes(collection);
  if (iconOnly) {
    if (!exists) throw new LocalError('Unknown collection.');
  } else {
    if (typeof input.create !== 'boolean' || typeof input.pinned !== 'boolean') throw new LocalError('Choose valid collection settings.');
    if (input.create === exists) throw new LocalError(exists ? 'A collection with that name already exists.' : 'Unknown collection.');
    const parent = input.parent === null ? null : name(input.parent);
    if (parent !== null && !has(settings.parents, parent)) throw new LocalError('Unknown parent collection.');
    if (!exists) data.collections.push(collection);
    settings.parents[collection] = parent;
    assertHierarchy(settings.parents);
    settings.pinned = settings.pinned.filter(value => value !== collection);
    if (input.pinned) settings.pinned.push(collection);
    if (has(input, 'appearance')) {
      if (input.appearance === null) delete settings.appearance[collection];
      else settings.appearance[collection] = validatedAppearance(input.appearance);
    }
    if (has(input, 'order')) {
      const order = names(input.order);
      if (order.length !== data.collections.length || order.length !== input.order.length || order.some(value => !has(settings.parents, value))) throw new LocalError('Collection order must include each collection once.');
      settings.order = order;
    }
  }
  if (has(input, 'icon')) {
    if (input.icon === null) delete settings.icons[collection];
    else settings.icons[collection] = validatedIcon(input.icon);
  }
  save(storage, data, true);
  return iconOnly ? {icons: settings.icons, revision: data.settingsRevision} : {settings, revision: data.settingsRevision};
}

function restore(storage, raw) {
  const backup = normalizeLibrary(JSON.parse(raw), true);
  const data = load(storage);
  const ids = new Set(data.items.map(item => item.id));
  const added = backup.items.filter(item => !ids.has(item.id));
  const newCollections = backup.collections.filter(collection => !data.collections.includes(collection));
  for (const collection of newCollections) {
    data.collections.push(collection);
    data.settings.parents[collection] = backup.settings.parents[collection];
    if (has(backup.settings.icons, collection)) data.settings.icons[collection] = backup.settings.icons[collection];
    if (has(backup.settings.appearance, collection)) data.settings.appearance[collection] = backup.settings.appearance[collection];
    if (backup.settings.pinned.includes(collection)) data.settings.pinned.push(collection);
  }
  data.settings.order.push(...backup.settings.order.filter(collection => newCollections.includes(collection)));
  assertHierarchy(data.settings.parents);
  if (added.length || newCollections.length) {
    data.items.push(...added);
    save(storage, data, newCollections.length > 0);
  }
  return {added: added.length};
}

const json = (value, status = 200, headers = {}) => Response.json(value, {status, headers});

export function createLocalFetch(storage, nativeFetch, base = appBase) {
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, base);
    if (url.origin !== base.origin) return nativeFetch(input, init);
    if (url.pathname === '/lucide-icons.json') return nativeFetch(new URL('./lucide-icons.json', base), init);
    const method = (init.method ?? input.method ?? 'GET').toUpperCase();
    const route = url.pathname;
    if (!route.startsWith('/api/') && !route.startsWith('/files/')) return nativeFetch(input, init);
    try {
      if (method === 'GET' && route === '/api/health') return json({app: 'personal-reference-library', libraryId});
      if (method === 'GET' && route === '/api/catalog') return json(catalog(load(storage)));
      if (method === 'GET' && route === '/api/backup') return json({format: backupFormat, ...load(storage)}, 200, {'Content-Disposition': 'attachment; filename="inntake-library.json"'});
      if (method === 'GET' && route.startsWith('/files/')) {
        const body = markdown(storage, route.slice('/files/'.length));
        if (body !== null) return new Response(body, {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
      }
      if (route.startsWith('/api/youtube-')) return json({error: 'Playlist syncing requires the connected library.'}, 501);
      if (method !== 'POST') return json({error: 'This feature is unavailable in the browser library.'}, 404);
      const raw = init.body ?? (input instanceof Request ? await input.text() : '');
      if (route === '/api/restore') {
        if (typeof raw !== 'string' || raw.length > 8_000_000) throw new LocalError('Choose a smaller browser-library backup.');
        return json(await writeLibrary(() => restore(storage, raw)));
      }
      const data = JSON.parse(raw);
      if (!object(data)) throw new LocalError('Expected a JSON object.');
      if (route === '/api/items') {
        const result = await writeLibrary(() => capture(storage, data));
        if (result.created && !data.image && !data.title?.trim()) void enrichYouTubeTitle(storage, nativeFetch, result.source);
        return json(result, result.created ? 201 : 200);
      }
      if (route === '/api/collections' || route === '/api/collection-icon') return json(await writeLibrary(() => saveCollection(storage, data, route.endsWith('icon'))));
      const itemRoute = /^\/api\/items\/([0-9a-f-]{36})$/.exec(route);
      if (itemRoute) return json(await writeLibrary(() => edit(storage, itemRoute[1], data)));
      return json({error: 'This feature is unavailable in the browser library.'}, 404);
    } catch (error) {
      if (error instanceof LocalError) return json({error: error.message}, error.status);
      if (error instanceof SyntaxError) return json({error: 'Could not read the JSON data.'}, 400);
      if (error.name === 'QuotaExceededError') return json({error: 'Browser storage is full. Export a JSON backup first.'}, 507);
      return json({error: 'This browser could not access the saved library.'}, 500);
    }
  };
}

function markdown(storage, path) {
  const id = entryPath.exec(path)?.[1];
  if (!id) return null;
  const record = load(storage).items.find(item => item.id === id);
  return record ? record.body : null;
}

if (typeof window !== 'undefined') {
  // Access the browser storage only when requested, so permission errors reach the viewer.
  const storage = {getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value)};
  window.inntakeLocalFetch = createLocalFetch(storage, window.fetch.bind(window));
  const documents = new Map();
  window.inntakeLocalMarkdownUrl = path => {
    try {
      if (imagePaths.has(path)) {
        const cached = documents.get(path);
        if (cached) return cached.url;
        const [header, base64] = imagePaths.get(path).split(',');
        const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
        const blob = new Blob([bytes], {type:header.slice(5,-7)});
        const url = URL.createObjectURL(blob);
        documents.set(path,{url});
        return url;
      }
      const body = markdown(storage, path);
      if (body === null) return null;
      const cached = documents.get(path);
      if (cached?.body === body) return cached.url;
      if (cached) URL.revokeObjectURL(cached.url);
      const url = URL.createObjectURL(new Blob([body], {type: 'text/plain;charset=utf-8'}));
      documents.set(path, {body, url});
      return url;
    } catch { return null; }
  };
  window.addEventListener('pagehide', () => {
    for (const document of documents.values()) URL.revokeObjectURL(document.url);
    documents.clear();
  });
}
