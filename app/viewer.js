const browserLocalViewer = document.documentElement.hasAttribute('data-browser-local');
const libraryFetch = browserLocalViewer ? window.inntakeLocalFetch : window.fetch.bind(window);
const categories = [
  ['idea', 'Ideas', 'Ideas'],
  ['consideration', 'Important', 'Important notes / considerations'],
  ['question', 'Questions', 'Questions'],
  ['todo', 'Todos', 'Todos'],
  ['resource', 'Resources', 'Resources'],
  ['reference', 'References', 'References'],
  ['bookmark', 'Bookmarks', 'Bookmarks'],
  ['project-log', 'Project logs', 'Project logs']
];
const $ = selector => document.querySelector(selector);
const cards = $('#cards');
// Size grid spans to each card so sorted items flow across the top, then down.
// Observe natural card heights to also handle image loads and editor resizing.
const cardLayoutObserver = new ResizeObserver(entries => {
  for (const { target } of entries) {
    if (target.getBoundingClientRect().height === 0) continue;
    const span = `span ${Math.ceil(target.getBoundingClientRect().height) + 16}`;
    if (target.style.gridRowEnd !== span) target.style.gridRowEnd = span;
  }
});
const rows = $('#rows');
const search = $('#search');
const count = $('#count');
const empty = $('#empty');
const editor = $('#editor');
const fields = Object.fromEntries(['category', 'collections', 'body', 'core'].map(key => [key, $(`#edit-${key}`)]));
let sources = [];
let annotations = {};
let activeCategory = '';
let view = 'cards';
let cardSize = window.matchMedia('(max-width: 700px)').matches ? 'compact' : 'medium';
let preferenceCollection = null;
let editing = null;
let activeVideo = null;
let editorRevision = null;
let saving = false;
let autosaveTimer;
let saveInFlight = null;
let editorTransition = 0;
let catalogVersion = null;
let libraryId = null;
let collectionSelectionLoaded = false;
let loading = false;
let draftsLoaded = false;
let actionStatusTimer;
const drafts = new Map();
const pendingArchives = new Set();
const pendingImpacts = new Set();
const impactColors = ['#fffbdc', '#fff1ad', '#ffe16a', '#ffc13d', '#ff9c35', '#ff7634', '#f35032', '#e34536'];
const titleOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function localPath(path) {
  if (typeof path !== 'string' || !/^(entries|sources)\//.test(path)) return null;
  if (path.split('/').some(part => !part || part === '.' || part === '..') || /[\\?#:]/.test(path)) return null;
  if (browserLocalViewer) return window.inntakeLocalMarkdownUrl(path);
  return '/files/' + path.split('/').map(encodeURIComponent).join('/');
}

function webLink(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url : null;
  } catch { return null; }
}

function youtubeVideoId(value) {
  const url = webLink(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  let id;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1];
  }
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

function itemData(source) {
  return { body: source.fullText || '', category: source.category ?? 'reference', collection: source.collection || '', notes: '', strengths: '', limitations: '', archived: false, trashed: false, core: false, impact: null, revision: null, ...annotations[source.id] };
}

function matchesArchive(source) {
  const mode = $('#archive-filter').value;
  const item = itemData(source);
  if (item.trashed || mode === 'trash') return Boolean(item.trashed) && mode === 'trash';
  return mode === 'all' || Boolean(item.archived) === (mode === 'archived');
}

function compareSources(a, b) {
  const mode = $('#sort-by').value;
  const id = titleOrder.compare(a.id, b.id);
  const date = (Date.parse(a.addedAt) || 0) - (Date.parse(b.addedAt) || 0);
  if (mode === 'core' && itemData(a).core !== itemData(b).core) return itemData(a).core ? -1 : 1;
  if (mode === 'updated') return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || id;
  if (mode === 'oldest') return date || id;
  if (mode === 'az') return titleOrder.compare(a.title, b.title) || id;
  if (mode === 'za') return titleOrder.compare(b.title, a.title) || id;
  if (mode === 'category') return titleOrder.compare(itemData(a).category, itemData(b).category) || titleOrder.compare(a.title, b.title) || id;
  if (mode === 'impact-high' || mode === 'impact-low') {
    const first = itemData(a).impact ?? null;
    const second = itemData(b).impact ?? null;
    if (first === null && second !== null) return 1;
    if (second === null && first !== null) return -1;
    if (first !== second) return mode === 'impact-high' ? second - first : first - second;
  }
  return -date || -id;
}

function impactControl(source) {
  const current = itemData(source).impact ?? null;
  const select = element('select', 'impact-score');
  select.title = 'Impact: NA or 0–7';
  select.setAttribute('aria-label', `Impact for ${source.id}`);
  select.style.backgroundColor = current === null ? '#ffffff' : impactColors[current];
  select.disabled = pendingImpacts.has(source.id);
  for (const value of [null, 0, 1, 2, 3, 4, 5, 6, 7]) {
    const option = element('option', '', value === null ? 'NA' : String(value));
    option.value = value === null ? '' : String(value);
    option.style.backgroundColor = value === null ? '#ffffff' : impactColors[value];
    option.style.color = '#171717';
    select.append(option);
  }
  select.value = current === null ? '' : String(current);
  select.addEventListener('change', async () => {
    if (drafts.has(source.id)) {
      if (!await saveDraft(source)) {
        select.value = current === null ? '' : String(current);
        await openEditor(source);
        $('#save-status').textContent = 'Notes could not be saved. Retry Save now before changing impact.';
        return;
      }
    }
    const impact = select.value === '' ? null : Number(select.value);
    pendingImpacts.add(source.id);
    select.disabled = true;
    actionStatus('');
    try {
      const response = await libraryFetch(`/api/items/${source.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: itemData(source).revision, impact }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save impact.');
      if (result.item.impact !== impact) throw new Error('Restart the library launcher to enable impact scores, then refresh.');
      annotations[source.id] = result.item;
      if (result.source) sources = sources.map(value => value.id === source.id ? result.source : value);
      pendingImpacts.delete(source.id);
      render();
      successStatus(`Impact saved: ${impact === null ? 'NA' : impact}.`);
    } catch (error) {
      select.value = current === null ? '' : String(current);
      actionStatus(error.message);
    } finally {
      pendingImpacts.delete(source.id);
      select.disabled = false;
    }
  });
  return select;
}

function actionStatus(text, timeout = 0) {
  clearTimeout(actionStatusTimer);
  const status = $('#action-status');
  status.textContent = text;
  status.hidden = !text;
  if (text && timeout) actionStatusTimer = setTimeout(() => actionStatus(''), timeout);
}
function successStatus(text) { actionStatus(text, 2000); }

function archiveButton(source) {
  const archived = itemData(source).archived;
  const button = element('button', 'edit-button', archived ? 'Restore' : 'Archive');
  button.setAttribute('aria-label', `${archived ? 'Restore' : 'Archive'} ${source.id}`);
  button.disabled = pendingArchives.has(source.id);
  button.addEventListener('click', async () => {
    if (drafts.has(source.id)) {
      if (!await saveDraft(source)) {
        await openEditor(source);
        $('#save-status').textContent = 'Notes could not be saved. Retry Save now before archiving or restoring.';
        return;
      }
    }
    pendingArchives.add(source.id);
    button.disabled = true;
    actionStatus('');
    try {
      const response = await libraryFetch(`/api/items/${source.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: itemData(source).revision, archived: !archived }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update this item.');
      if (result.item.archived !== !archived) throw new Error('Restart the library launcher to enable archiving, then refresh this page.');
      annotations[source.id] = result.item;
      if (result.source) sources = sources.map(value => value.id === source.id ? result.source : value);
      pendingArchives.delete(source.id);
      updateFilters();
      render();
      successStatus(`“${source.title}” ${archived ? 'restored' : 'archived'}.`);
    } catch (error) {
      actionStatus(error.message);
    } finally {
      pendingArchives.delete(source.id);
      button.disabled = false;
    }
  });
  return button;
}

function dot(category) {
  const node = element('span', 'dot');
  node.style.backgroundColor = `var(--${categories.some(([key]) => key === category) ? category : 'reference'})`;
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function sourceLink(source, text) {
  const url = webLink(source.url);
  const path = localPath(source.path);
  const link = element(url || path ? 'a' : 'span', '', text);
  if (url || path) {
    link.href = url ? url.href : path;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  return link;
}

function editButton(source) {
  const button = element('button', 'edit-button', 'Notes / edit');
  button.setAttribute('aria-label', `Edit ${source.id}`);
  button.addEventListener('click', () => openEditor(source, 'edit'));
  return button;
}

const iconPaths = {
  grid: ['All items', 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z'],
  folder: ['Folder', 'M3 7V5h6l2 2h10v13H3Z'],
  cpu: ['Electronics', 'M7 7h10v10H7Z M10 10h4v4h-4Z M9 3v4m6-4v4m-6 10v4m6-4v4M3 9h4m-4 6h4m10-6h4m-4 6h4'],
  bolt: ['Energy', 'm13 2-9 12h7l-1 8 10-13h-8Z'],
  code: ['Programming', 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18'],
  book: ['Reading', 'M12 5v15M3 4c3-1 6-1 9 1 3-2 6-2 9-1v15c-3-1-6-1-9 1-3-2-6-2-9-1Z'],
  bulb: ['Ideas', 'M9 18h6m-6 3h6M8 14a7 7 0 1 1 8 0l-1 3H9Z'],
  film: ['Video', 'M3 3h18v18H3Zm0 6h18M3 15h18M8 3v18m8-18v18'],
  tool: ['Making', 'M14 6a5 5 0 0 0-6 6L2 18l4 4 6-6a5 5 0 0 0 6-6l-4 2-2-2Z'],
  leaf: ['Nature', 'M20 3C8 2 2 8 5 16c8 5 16-1 15-13ZM4 21l11-11'],
  heart: ['Personal', 'M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-5 5 1 10 8 16C19 15 25 10 20 5Z'],
  briefcase: ['Work', 'M3 7h18v14H3ZM8 7V3h8v4M3 12c6 3 12 3 18 0m-9 0v4'],
  compass: ['Exploration', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-6-3-2 5-4 1 2-5Z'],
  globe: ['Web', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z'],
  note: ['Notes', 'M5 3h11l4 4v14H5Zm10 0v5h5M8 12h8m-8 4h6'],
  image: ['Images', 'M3 3h18v18H3Zm0 14 6-7 5 5 3-3 4 5M16 7h1'],
  music: ['Music', 'M9 18V5l12-2v13M9 8l12-2M9 18c0 4-7 4-7 0s7-4 7 0Zm12-2c0 4-7 4-7 0s7-4 7 0Z'],
  home: ['Home', 'm2 11 10-9 10 9M5 9v12h14V9m-10 12v-8h6v8'],
  star: ['Favorites', 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z'],
};
let lucideIcons = {}, lucideTags = {};
let iconLibraryLoaded = false;
let iconResultLimit = 80;
let collectionIcons = {};
let collectionIconRevision = null;
let pickerIcon = null;
let iconSaving = false;

function suggestedIcon(name) {
  const rules = [
    [/plc|electro|elektr|automation|otomasyon|arduino|circuit|devre/i, 'cpu'],
    [/program|code|software|yazılım|yazilim|app\b/i, 'code'],
    [/video|youtube|watch|izle/i, 'film'], [/read|book|kitap|oku/i, 'book'],
    [/idea|fikir/i, 'bulb'], [/music|müzik|muzik|mp3|audio|dac|sound/i, 'music'],
    [/design|tasarım|tasarim|image|photo|foto/i, 'image'],
    [/garden|nature|bahçe|bahce|plant/i, 'leaf'], [/home|ev\b/i, 'home'],
    [/work|business|iş\b/i, 'briefcase'], [/research|explor|araştır|tactical|map|harita|travel/i, 'compass'],
    [/note|notlar/i, 'note'], [/tool|diy|maker|repair/i, 'tool'],
  ];
  return 'icon:' + (rules.find(([test]) => test.test(name))?.[1] || 'folder');
}

function collectionIconNode(name, override = undefined) {
  const value = override === undefined ? collectionIcons[name] || suggestedIcon(name) : override || suggestedIcon(name);
  const lucide = value.startsWith('lucide:') ? lucideIcons[value.slice(7)] : null;
  const spec = value.startsWith('icon:') ? iconPaths[value.slice(5)] : value.startsWith('lucide:') && !lucide ? iconPaths.folder : null;
  if (!spec && !lucide) { const node = element('span', 'collection-icon', value); node.setAttribute('aria-hidden', 'true'); return node; }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.dataset.icon = value;
  if (name && override === undefined) {
    const color = paletteFor(name)[3];
    svg.dataset.collectionColor = '';
    svg.style.setProperty('--icon-color', accentOn(color, '#49443f'));
    svg.style.setProperty('--paper-icon-color', accentOn(color, '#d7c4a6'));
  }
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'collection-icon');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  const nodes = lucide || [['path', {d: spec[1]}]];
  for (const [tag, attributes] of nodes) {
    if (!['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse'].includes(tag)) continue;
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) if (['d', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'transform'].includes(key)) node.setAttribute(key, value);
    svg.append(node);
  }
  return svg;
}

function itemCollections(source) {
  const data = itemData(source);
  return data.collections || (data.collection ? [data.collection] : []);
}
function collectionCount(name) {
  return sources.filter(source => matchesArchive(source) && itemCollections(source).some(member => inCollection(member, name))).length;
}
function renderCollectionChecks(names) {
  const box = $('#edit-collections'); box.replaceChildren();
  for (const name of [...new Set([...sortedCollections(), ...names])]) {
    const label = element('label', 'check');
    const check = element('input'); check.type = 'checkbox'; check.value = name; check.checked = names.includes(name);
    label.append(check, collectionIconNode(name), document.createTextNode(collectionPath(name).join(' / '))); box.append(label);
  }
  $('#edit-collection').value = '';
}
function checkedCollections() {
  return [...new Set([...$('#edit-collections').querySelectorAll('input:checked')].map(input => input.value).concat($('#edit-collection').value.trim() || []))];
}
function collectionNames() { return [...new Set([...sources.flatMap(source => itemCollections(source)), ...Object.keys(collectionParents), ...Object.values(collectionParents), ...Object.keys(collectionIcons)].filter(Boolean))].sort(); }

function drawCollectionShortcuts() {
  drawTreeContext();
}

let collectionParents = {};
let pinnedCollections = [];
let organizing = false;
let draggingItem = null;
let movingSource = null;
let treeRevision = null;
let collectionAppearance = {};
let collectionOrder = [];
let linkedPlaylists = [];
let trashReturn = null;
let draggingCollection = null;
let lastNavigatedCollection = null;
let collapsedCollections = new Set();
let collapsedLibrary = null;
function loadCollapsedCollections() {
  if (!libraryId || collapsedLibrary === libraryId) return;
  collapsedLibrary = libraryId; collapsedCollections = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(`personal-library-collapsed-${libraryId}`) || '[]');
    if (Array.isArray(saved)) collapsedCollections = new Set(saved.filter(name => typeof name === 'string'));
  } catch {}
  // A restored selection should always be reachable in its parent branches.
  for (const ancestor of collectionPath($('#collection-filter').value).slice(0, -1)) collapsedCollections.delete(ancestor);
}
function persistCollapsedCollections() {
  if (!libraryId) return;
  try { localStorage.setItem(`personal-library-collapsed-${libraryId}`, JSON.stringify([...collapsedCollections])); } catch {}
}
function toggleCollectionBranch(name) {
  if (collapsedCollections.has(name)) collapsedCollections.delete(name); else collapsedCollections.add(name);
  persistCollapsedCollections(); drawTreeContext();
}
const palettes = {
  moss: ['#141b18', '#202723', '#b9cfaa', '#345540', '#656038', '#33474c'],
  ocean: ['#131b22', '#1e2831', '#a4ccd6', '#285e72', '#354c78', '#33574e'],
  ember: ['#211917', '#2c2320', '#e0b18f', '#79442c', '#685326', '#593e55'],
  violet: ['#1a1723', '#27222e', '#c4b2e2', '#5c3d7b', '#354c73', '#68424f'],
  graphite: ['#191b1c', '#242728', '#c1c9cc', '#41484d', '#444b43', '#4a4149']
};
// Add a style here and its scoped paint rules in index.html. Palette slots are
// background, card, accent, then three ambient colours. Stored collection icons
// and colour choices stay independent of the browser's interface preference.
const libraryStyles = {
  original: {label: 'Original'},
  simple: {label: 'Pixelated Simple', palette: ['#1e2c25','#2a382f','#edb27e','#4b5b38','#5c5235','#31493d']},
  inn: {label: 'Pixelated Inn', palette: ['#231b17','#342924','#efbe76','#66472b','#3f4c33','#50343b']},
  phosphor: {label: 'Phosphor Terminal', palette: ['#0b1511','#11221b','#98efa4','#204836','#273c26','#17403a']}
};
const styleKey = 'inntake-library-style';
const stylePicker = $('#library-style');
let currentStyle = 'original';
for (const [value, style] of Object.entries(libraryStyles)) {
  const choice = element('label', 'style-choice');
  const radio = element('input');
  radio.type = 'radio'; radio.name = 'library-style'; radio.value = value;
  const sample = element('span', 'style-sample');
  sample.dataset.sample = value;
  sample.setAttribute('aria-hidden', 'true');
  choice.append(radio, sample, element('span', '', style.label));
  stylePicker.append(choice);
}
function selectLibraryStyle(value) {
  currentStyle = Object.hasOwn(libraryStyles, value) ? value : 'original';
  document.documentElement.dataset.libraryStyle = currentStyle;
  stylePicker.querySelector(`input[value="${currentStyle}"]`).checked = true;
  applyAppearance();
  scheduleTitleFit();
}
stylePicker.addEventListener('change', event => {
  selectLibraryStyle(event.target.value);
  try { localStorage.setItem(styleKey, currentStyle); } catch {}
});
window.addEventListener('storage', event => {
  if (event.key === styleKey || event.key === null) selectLibraryStyle(event.newValue);
});
function appearanceFor(name) {
  const path = collectionPath(name);
  for (const ancestor of [...path].reverse()) {
    if (collectionAppearance[ancestor]) return {...collectionAppearance[ancestor], seed: ancestor};
  }
  return {theme: name ? 'auto' : 'moss', motion: true, motionOverride: true, seed: path[0] || ''};
}
function paletteFor(name, appearance = appearanceFor(name)) {
  const index = [...(appearance.seed || name)].reduce((value, char) => ((value * 31 + char.codePointAt(0)) >>> 0), 0) % 4;
  const palette = [...(palettes[appearance.theme === 'auto' ? ['moss', 'ocean', 'ember', 'violet'][index] : appearance.theme] || palettes.moss)];
  const style = libraryStyles[currentStyle];
  if (style?.palette) {
    // Keep named collections recognisable within each style. Explicit custom
    // glows below remain exact hex colours for the collection colour picker.
    for (let i = 0; i < palette.length; i++) {
      const base = style.palette[i];
      if (!name) { palette[i] = base; continue; }
      if (i === 3) continue; // The collection colour stays consistent across library styles.
      const weight = i < 2 ? .18 : .40;
      palette[i] = '#' + [1,3,5].map(start => {
        const channel = hex => parseInt(hex.slice(start, start+2),16);
        return Math.round(channel(base)*(1-weight) + channel(palette[i])*weight).toString(16).padStart(2,'0');
      }).join('');
    }
  }
  if (appearance.colors) palette.splice(3, 3, ...appearance.colors);
  return palette;
}
// Rasterize the inn light on a small, nearest-neighbour canvas. The view's
// own glow colours supply both the window light and the softer floor patches.
function paintInnLight(canvas, colors, time) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width, height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const drift = Math.sin(time*.19)*.055 + Math.sin(time*.09)*.025;
  const lean = .31 + Math.sin(time*.15)*.085;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = colors[i];
    const x = width*(.05 + i*.25 + drift);
    const spread = width*(.075 + i*.012);
    // Overlapping stepped wedges make a bright core with softer pixel edges.
    for (let band = 0; band < 4; band++) {
      const half = spread*(1-band*.18);
      ctx.globalAlpha = .055 + .013*band;
      ctx.beginPath();
      ctx.moveTo(x-half,0); ctx.lineTo(x+half,0);
      ctx.lineTo(x+(lean+.10)*width+half*1.5,height);
      ctx.lineTo(x+lean*width-half*1.5,height);
      ctx.fill();
    }
    // A thin warm shaft and a wider reflection at the foot of each beam.
    const foot = x + lean*width;
    ctx.fillStyle = '#ffe6ac';
    ctx.globalAlpha = .048;
    ctx.beginPath();
    ctx.moveTo(x-spread*.23,0); ctx.lineTo(x+spread*.13,0);
    ctx.lineTo(foot+spread*.32,height); ctx.lineTo(foot-spread*.22,height); ctx.fill();
    ctx.fillStyle = colors[i];
    ctx.globalAlpha = .15;
    ctx.beginPath();
    ctx.moveTo(foot-width*.04,height*.85); ctx.lineTo(foot+spread,height*.85);
    ctx.lineTo(foot+spread*2.9,height); ctx.lineTo(foot-spread*.6,height); ctx.fill();
    for (let n = 0; n < 11; n++) {
      const y = (n*.618 + i*.29 + time*(.003 + n%4*.001))%1;
      const offset = Math.sin(n*9.1 + time*.33 + i)*spread*.8;
      ctx.globalAlpha = .33 + .22*Math.sin(n+time*.6);
      ctx.fillStyle = n%3 ? colors[i] : '#ffe8a6';
      ctx.fillRect(Math.floor(x+y*lean*width+offset),Math.floor(y*height),1,1);
    }
  }
  ctx.globalAlpha = 1;
}
const innLightCanvas = $('body > .ambient .inn-rays');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let innLightTimer, innLightKey = '';
function updateInnLight() {
  const active = currentStyle === 'inn' && !document.hidden;
  const root = document.documentElement.style;
  const colors = ['--glow-a','--glow-b','--glow-c'].map(key => root.getPropertyValue(key));
  const moving = !document.body.classList.contains('still-background') &&
    (!motionPreference.matches || document.body.classList.contains('motion-explicit'));
  const width = Math.max(1,Math.ceil(innerWidth / Math.max(4,innerWidth/360)));
  const height = Math.max(1,Math.round(innerHeight*width/Math.max(innerWidth,1)));
  const key = JSON.stringify([active, moving, colors, width, height]);
  if (key === innLightKey) return;
  innLightKey = key;
  clearTimeout(innLightTimer);
  if (!active) return;
  innLightCanvas.width = width; innLightCanvas.height = height;
  function draw() {
    paintInnLight(innLightCanvas, colors, moving ? performance.now()/1000 : 0);
    if (moving) innLightTimer = setTimeout(draw,100);
  }
  draw();
}
window.addEventListener('resize', updateInnLight);
document.addEventListener('visibilitychange', updateInnLight);
motionPreference.addEventListener('change', updateInnLight);

function glowSurface(base, color, amount) {
  return `color-mix(in srgb, ${base} ${100-amount}%, ${color})`;
}
// Keep the chosen colour when it reads clearly; otherwise move toward the
// higher-contrast endpoint just far enough for small labels on this surface.
function accentOn(hex, surface) {
  const rgb = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
  const luminance = values => values.reduce((sum, byte, i) => {
    const n = byte / 255;
    return sum + [0.2126, 0.7152, 0.0722][i] * (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
  }, 0);
  const bg = luminance(rgb(surface)), source = rgb(hex);
  const end = bg < 0.179 ? 255 : 0;
  for (let step = 0; step <= 20; step++) {
    const channels = source.map(byte => Math.round(byte + (end - byte) * step / 20));
    const fg = luminance(channels);
    if ((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) >= 4.5)
      return '#' + channels.map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return end ? '#ffffff' : '#000000';
}
function applyAppearance() {
  const name = $('#collection-filter').value;
  const appearance = appearanceFor(name), palette = paletteFor(name, appearance);
  document.documentElement.toggleAttribute('data-collection-active', Boolean(name));
  if (name) {
    palette[2] = accentOn(palette[3], '#49443f');
    document.documentElement.style.setProperty('--paper-accent', accentOn(palette[3], '#d7c4a6'));
  }
  for (const [index, variable] of ['--background', '--card', '--accent', '--glow-a', '--glow-b', '--glow-c'].entries()) document.documentElement.style.setProperty(variable, palette[index]);
  document.documentElement.style.setProperty('--capture-ink', accentOn('#171a18', palette[2]));
  if (name && (appearance.colors || currentStyle === 'inn')) {
    const root = document.documentElement.style;
    root.setProperty('--background', glowSurface(glowSurface(palette[0], palette[3], 22), palette[4], 9));
    root.setProperty('--card', glowSurface(palette[1], palette[3], 15));
  }
  document.body.classList.toggle('still-background', !appearance.motion);
  document.body.classList.toggle('motion-explicit', Boolean(appearance.motionOverride));
  updateInnLight();
}

function collectionPath(name) {
  const path = [], seen = new Set();
  while (name && !seen.has(name)) { path.unshift(name); seen.add(name); name = collectionParents[name]; }
  return path;
}
function inCollection(name, parent) { return !parent || collectionPath(name).includes(parent); }
function sortedCollections() {
  return collectionNames().sort((a, b) => titleOrder.compare(collectionPath(a).join(' / '), collectionPath(b).join(' / ')));
}
function collectionSelect(select, selected, topLabel = null, exclude = null) {
  select.replaceChildren();
  if (topLabel !== null) { const option = element('option', '', topLabel); option.value = ''; select.append(option); }
  for (const name of sortedCollections()) {
    if (exclude && inCollection(name, exclude)) continue;
    const option = element('option', '', collectionPath(name).join(' / ')); option.value = name; select.append(option);
  }
  select.value = selected || '';
}
function chooseCollection(name) {
  loadCollapsedCollections();
  for (const ancestor of collectionPath(name).slice(0, -1)) collapsedCollections.delete(ancestor);
  persistCollapsedCollections();
  $('#collection-filter').value = name;
  if ($('#archive-filter').value === 'trash') {
    $('#archive-filter').value = 'active';
    trashReturn = null;
  }
  document.querySelectorAll('.collection-menu[open]').forEach(menu => menu.open = false);
  render();
}
function setupDropTarget(node, destination) {
  node.dataset.dropCollection = destination;
  node.addEventListener('dragover', event => {
    if (!draggingItem) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move'; node.classList.add('drop-target');
  });
  node.addEventListener('dragleave', event => { if (!node.contains(event.relatedTarget)) node.classList.remove('drop-target'); });
  node.addEventListener('drop', async event => {
    if (!draggingItem) return;
    event.preventDefault(); node.classList.remove('drop-target');
    const source = sources.find(s => s.id === draggingItem);
    draggingItem = null; document.body.classList.remove('dragging-card');
    if (source) await changeItem(source, movePatch(source, destination));
  });
}
// Keep the held item's identity under the pointer, with drop targets reachable underneath.
function liftDragPreview(node, name, visual, grip) {
  const preview = $('#drag-feedback');
  const label = element('strong', '', name), destination = element('small');
  const caption = element('span', 'drag-caption');
  caption.append(label, destination);
  preview.replaceChildren();
  if (visual) preview.append(visual.cloneNode(true));
  preview.append(caption);
  preview.hidden = false;
  node.classList.add('drag-source');
  const bounds = node.getBoundingClientRect();
  const offsetX = (grip.x - bounds.left) / Math.max(1, bounds.width) * preview.offsetWidth;
  const offsetY = (grip.y - bounds.top) / Math.max(1, bounds.height) * preview.offsetHeight;
  return {
    move(event, hint) {
      preview.style.transform = `translate3d(${event.clientX - offsetX}px,${event.clientY - offsetY}px,0)`;
      if (destination.textContent !== hint) destination.textContent = hint;
    },
    close() {
      node.classList.remove('drag-source');
      node.dataset.skipClick = 'true';
      setTimeout(() => delete node.dataset.skipClick, 300);
      preview.hidden = true;
      preview.replaceChildren();
    }
  };
}
function setupCardDrag(card, source) {
  let start = null, target = null;
  let preview = null, lastPoint = null, scrollFrame = 0;
  const targetAt = event => document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop-collection], [data-drop-remove]');
  function updateTarget(point) {
    const next = targetAt(point);
    if (target !== next) { target?.classList.remove('drop-target'); target = next; target?.classList.add('drop-target'); }
    preview.move(point, next?.dataset.dropRemove ? 'Remove from this collection' : next ? `${point.altKey || !$('#collection-filter').value ? 'Add' : 'Move'} to ${next.dataset.dropCollection}` : '');
  }
  function scrollWhileHeld() {
    scrollFrame = 0;
    const scroller = navigationScrollerAt(lastPoint) || document.scrollingElement;
    const bounds = scroller === document.scrollingElement ? {top: 0, bottom: window.innerHeight} : scroller.getBoundingClientRect();
    const delta = lastPoint.clientY < bounds.top + 30 ? -7 : lastPoint.clientY > bounds.bottom - 30 ? 7 : 0;
    const before = scroller.scrollTop;
    if (delta) scroller.scrollTop += delta;
    if (before !== scroller.scrollTop) {
      updateTarget(lastPoint);
      scrollFrame = requestAnimationFrame(scrollWhileHeld);
    }
  }
  const clear = () => {
    cancelAnimationFrame(scrollFrame); scrollFrame = 0; lastPoint = null;
    document.body.classList.remove('dragging-card');
    document.querySelectorAll('.drop-target').forEach(node => node.classList.remove('drop-target'));
    preview?.close(); preview = null; $('#remove-drop').hidden = true;
    if (start?.capture.hasPointerCapture(start.pointerId)) start.capture.releasePointerCapture(start.pointerId);
    start = target = null; draggingItem = null;
    cancelCurrentDrag = null;
  };
  card.addEventListener('dragstart', event => event.preventDefault());
  card.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('a, input, textarea, select, iframe, summary, details') || (event.target.closest('button') && !event.target.closest('.drag-handle, .card-title'))) return;
    if (event.pointerType === 'touch' && !event.target.closest('.drag-handle')) return;
    const capture = event.target.closest('button') || card;
    start = {x: event.clientX, y: event.clientY, pointerId: event.pointerId, capture};
    cancelCurrentDrag = clear;
    capture.setPointerCapture(event.pointerId);
  });
  card.addEventListener('pointermove', event => {
    if (!start || event.pointerId !== start.pointerId) return;
    if (!draggingItem && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) return;
    if (!preview) {
      draggingItem = source.id; document.body.classList.add('dragging-card');
      preview = liftDragPreview(card, source.title || card.querySelector('.card-title')?.textContent || 'Untitled', card.querySelector('.card-media img:not([hidden])'), start);
    }
    $('#remove-drop').hidden = !$('#collection-filter').value;
    lastPoint = event; updateTarget(event);
    if (!scrollFrame) scrollFrame = requestAnimationFrame(scrollWhileHeld);
    event.preventDefault();
  });
  card.addEventListener('pointerup', async event => {
    if (!start || event.pointerId !== start.pointerId) return;
    const wasDragging = draggingItem === source.id;
    const destination = wasDragging ? targetAt(event) : null;
    const patch = destination ? (destination.dataset.dropRemove ? removeFromViewPatch(source) : movePatch(source, destination.dataset.dropCollection, event.altKey)) : null;
    clear();
    if (patch) await changeItem(source, patch);
  });
  for (const type of ['pointercancel', 'lostpointercapture']) card.addEventListener(type, event => {
    if (start?.pointerId === event.pointerId) clear();
  });
}
let cancelCurrentDrag = null;
const openActionMenus = '.collection-menu[open], .card-actions-menu[open]';
const openBrowseMenus = openActionMenus + ', #browse-options[open]';
const actionMenuLayouts = new WeakMap();
// The native toggle event is deferred. Observe open before the next paint so
// a freshly opened menu cannot show at its unpositioned fallback coordinates.
new MutationObserver(changes => {
  for (const menu of new Set(changes.map(change => change.target))) {
    if (menu.isConnected) actionMenuLayouts.get(menu)?.();
  }
}).observe($('.library-layout'), {subtree: true, attributes: true, attributeFilter: ['open']});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    cancelCurrentDrag?.();
    const cardMenu = $('.card-actions-menu[open]');
    if (cardMenu && !document.querySelector('dialog[open]')) {
      const restoreFocus = cardMenu.contains(document.activeElement);
      cardMenu.open = false;
      if (restoreFocus) cardMenu.querySelector('summary').focus({preventScroll: true});
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    document.querySelectorAll(openBrowseMenus).forEach(menu => menu.open = false);
  }
});
function collectionButton(name, label = name) {
  const button = element('button', 'collection-chip');
  const labelBox = element('span', 'collection-label');
  labelBox.append(element('span', 'collection-name', label));
  const children = orderedChildren(name).length;
  if (children) labelBox.append(element('span', 'collection-children', `${children} subcollection${children === 1 ? '' : 's'}`));
  button.append(collectionIconNode(name), labelBox);
  if (pinnedCollections.includes(name)) { const pin = element('span', 'collection-pin', '★'); pin.title = 'Pinned'; button.append(pin); }
  button.append(element('span', 'collection-count', String(collectionCount(name)))); button.dataset.collection = name;
  button.title = collectionPath(name).join(' / ');
  button.setAttribute('aria-description', 'Drag to reorder or nest. Alt with Up or Down reorders; Left moves out; Right nests under the previous sibling.');
  button.setAttribute('aria-pressed', String($('#collection-filter').value === name));
  button.addEventListener('click', () => {
    if (children && $('#collection-filter').value === name) toggleCollectionBranch(name);
    else { if (children) collapsedCollections.delete(name); chooseCollection(name); }
  });
  setupDropTarget(button, name);
  return button;
}
function attachMenu(menu, summary, options, above = false) {
  menu.append(summary, options);
  actionMenuLayouts.set(menu, () => {
    delete options.dataset.menuPositioned;
    if (!menu.open) return;
    document.querySelectorAll(openActionMenus).forEach(other => { if (other !== menu) other.open = false; });

    const inset = 8, gap = 5;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    let right = left + (viewport?.width ?? window.innerWidth);
    const bottom = top + (viewport?.height ?? window.innerHeight);
    if (!editor.hidden && window.innerWidth > 700) right = Math.min(right, editor.getBoundingClientRect().left);
    const width = right - left - 2 * inset;
    if (width <= 0) {
      menu.open = false;
      return;
    }
    const box = summary.getBoundingClientRect();
    options.style.setProperty('--action-menu-space', width + 'px');
    options.style.maxHeight = '';
    const height = options.offsetHeight;
    const roomAbove = box.top - top - inset - gap, roomBelow = bottom - box.bottom - inset - gap;
    const preferredRoom = above ? roomAbove : roomBelow;
    const otherRoom = above ? roomBelow : roomAbove;
    const placeAbove = preferredRoom >= height || preferredRoom >= otherRoom ? above : !above;
    options.style.maxHeight = Math.max(0, placeAbove ? roomAbove : roomBelow) + 'px';

    const anchorX = above ? box.right - options.offsetWidth : box.left;
    const anchorY = placeAbove ? box.top - gap - options.offsetHeight : box.bottom + gap;
    options.style.left = Math.max(left + inset, Math.min(anchorX, right - options.offsetWidth - inset)) + 'px';
    options.style.top = Math.max(top + inset, Math.min(anchorY, bottom - options.offsetHeight - inset)) + 'px';
    options.dataset.menuPositioned = '';
  });
}

function collectionMenu(name, inHeader = false) {
  const menu = element('details', 'collection-menu');
  const summary = element('summary', '', '⋯'); summary.setAttribute('aria-label', name ? `Collection actions for ${name}` : 'Library actions');
  const options = element('div', 'collection-menu-options');
  const actions = name ? [
    ['New subcollection', () => openCollectionDialog(true, name)],
    ['Edit collection', () => openCollectionDialog(false, null, name)]
  ] : [];
  if (name) actions.push(['Link playlist…', () => openPlaylistLink(name)]);
  if (inHeader) {
    const show = $('#archive-filter').value !== 'trash';
    actions.push([show ? 'Trash' : 'Back to items', () => showTrash(show)]);
  }
  for (const [label, action] of actions) {
    const button = element('button', '', label);
    button.addEventListener('click', () => { menu.open = false; action(); });
    options.append(button);
  }
  attachMenu(menu, summary, options);
  return menu;
}
function orderedChildren(parent) {
  const rank = name => { const index = collectionOrder.indexOf(name); return index < 0 ? Infinity : index; };
  return collectionNames().filter(name => (collectionParents[name] || null) === parent).sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) < rank(b) ? -1 : 1;
    return Number(pinnedCollections.includes(b)) - Number(pinnedCollections.includes(a)) || titleOrder.compare(a, b);
  });
}
function flattenedCollections(parent = null) {
  return orderedChildren(parent).flatMap(name => [name, ...flattenedCollections(name)]);
}
function placedOrder(name, target, position) {
  const order = flattenedCollections().filter(n => n !== name);
  const parent = position === 'inside' ? target || null : collectionParents[target] || null;
  const siblings = orderedChildren(parent).filter(n => n !== name);
  const anchor = position === 'before' ? target : position === 'after' ? siblings[siblings.indexOf(target) + 1] : null;
  const index = anchor ? order.indexOf(anchor) : order.length;
  order.splice(index < 0 ? order.length : index, 0, name);
  return {parent, order};
}
function applyCollectionSettings(result) {
  collectionParents = result.settings.parents; pinnedCollections = result.settings.pinned;
  collectionAppearance = result.settings.appearance || {}; collectionOrder = result.settings.order || [];
  collectionIcons = result.settings.icons; collectionIconRevision = result.revision;
  updateFilters(); render();
}
async function moveCollection(name, target, position, restore = null) {
  if (organizing || name === target || (target && inCollection(target, name))) return;
  const before = {parent: collectionParents[name] || null, order: flattenedCollections()};
  const placement = restore || placedOrder(name, target, position);
  organizing = true; actionStatus('Moving collection…');
  try {
    const response = await libraryFetch('/api/collections', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, parent: placement.parent, order: placement.order, pinned: pinnedCollections.includes(name), create: false, revision: collectionIconRevision})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not move this collection.');
    if (target && position === 'inside') { collapsedCollections.delete(target); persistCollapsedCollections(); }
    applyCollectionSettings(result);
    actionStatus('Collection moved.');
    const undo = element('button', 'secondary-action', 'Undo');
    undo.addEventListener('click', () => moveCollection(name, null, 'inside', before));
    $('#action-status').append(document.createTextNode(' '), undo);
  } catch (error) { actionStatus(error.message); }
  finally { organizing = false; }
}
function setupCollectionDrag(row, name) {
  let start = null, destination = null, scrollFrame = null, lastPoint = null;
  let preview = null;
  function targetAt(event) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-folder], [data-folder-root]');
    if (!target) return null;
    if (target.dataset.folderRoot) return {row: target, name: null, position: 'inside'};
    const targetName = target.dataset.folder;
    if (name === targetName || inCollection(targetName, name)) return null;
    const rect = target.getBoundingClientRect(), ratio = (event.clientY - rect.top) / rect.height;
    return {row: target, name: targetName, position: ratio < .25 ? 'before' : ratio > .75 ? 'after' : 'inside'};
  }
  function clear() {
    if (start?.capture.hasPointerCapture(start.id)) start.capture.releasePointerCapture(start.id);
    start = null; draggingCollection = null; lastPoint = null;
    cancelAnimationFrame(scrollFrame); scrollFrame = null;
    preview?.close(); preview = null; document.body.classList.remove('dragging-collection');
    document.querySelectorAll('.folder-before, .folder-after, .folder-inside').forEach(node => node.classList.remove('folder-before', 'folder-after', 'folder-inside'));
    destination = null; cancelCurrentDrag = null;
  }
  function updateTarget(event) {
    document.querySelectorAll('.folder-before, .folder-after, .folder-inside').forEach(node => node.classList.remove('folder-before', 'folder-after', 'folder-inside'));
    destination = targetAt(event); destination?.row.classList.add('folder-' + destination.position);
    preview.move(event, !destination ? '' : !destination.name ? 'Move to top level' : `${destination.position === 'inside' ? 'Nest inside' : destination.position === 'before' ? 'Place before' : 'Place after'} ${destination.name}`);
  }
  function autoscroll() {
    if (!draggingCollection || !lastPoint) return;
    const p = lastPoint, scroller = navigationScrollerAt(p), bounds = scroller?.getBoundingClientRect();
    if (scroller && p.clientX >= bounds.left && p.clientX <= bounds.right && p.clientY >= bounds.top && p.clientY <= bounds.bottom) {
      const delta = p.clientY < bounds.top + 28 ? -7 : p.clientY > bounds.bottom - 28 ? 7 : 0;
      if (delta) { scroller.scrollTop += delta; updateTarget(p); }
    }
    scrollFrame = requestAnimationFrame(autoscroll);
  }
  row.addEventListener('dragstart', event => event.preventDefault());
  row.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || organizing || event.target.closest('.collection-menu, .collection-toggle')) return;
    if (event.pointerType === 'touch' && !event.target.closest('.collection-icon')) return;
    const capture = event.target.closest('.collection-chip') || row;
    start = {x: event.clientX, y: event.clientY, id: event.pointerId, capture};
    capture.setPointerCapture(event.pointerId); cancelCurrentDrag = clear;
  });
  row.addEventListener('pointermove', event => {
    if (!start || event.pointerId !== start.id) return;
    if (!draggingCollection && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) return;
    if (!draggingCollection) {
      draggingCollection = name; document.body.classList.add('dragging-collection');
      preview = liftDragPreview(row, name, row.querySelector('.collection-icon'), start);
      document.querySelectorAll('.collection-menu[open]').forEach(menu => menu.open = false);
      scrollFrame = requestAnimationFrame(autoscroll);
    }
    lastPoint = {clientX: event.clientX, clientY: event.clientY}; updateTarget(event); event.preventDefault();
  });
  row.addEventListener('pointerup', async event => {
    if (!start || event.pointerId !== start.id) return;
    const wasDragging = draggingCollection === name, drop = wasDragging ? targetAt(event) : null;
    clear();
    if (drop) await moveCollection(name, drop.name, drop.position);
  });
  row.addEventListener('click', event => {
    if (row.dataset.skipClick) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  for (const type of ['pointercancel', 'lostpointercapture']) row.addEventListener(type, event => {
    if (start?.id === event.pointerId) clear();
  });
  row.addEventListener('keydown', event => {
    if (!event.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || event.target.closest('.collection-menu, .collection-toggle')) return;
    event.preventDefault();
    const parent = collectionParents[name] || null, siblings = orderedChildren(parent), index = siblings.indexOf(name);
    if (event.key === 'ArrowUp' && index > 0) moveCollection(name, siblings[index - 1], 'before');
    if (event.key === 'ArrowDown' && index < siblings.length - 1) moveCollection(name, siblings[index + 1], 'after');
    if (event.key === 'ArrowLeft' && parent) moveCollection(name, parent, 'after');
    if (event.key === 'ArrowRight' && index > 0) moveCollection(name, siblings[index - 1], 'inside');
  });
}

let navigationColumnScroll = [0, 0];
function rememberNavigationScroll() {
  for (const [index, column] of [...$('#collection-tree').querySelectorAll(':scope > .collection-column')].entries()) navigationColumnScroll[index] = column.scrollTop;
}
function arrangeCollectionColumns() {
  const tree = $('#collection-tree');
  const directList = tree.querySelector(':scope > ul');
  const items = directList ? [...directList.children] : [...tree.querySelectorAll(':scope > .collection-column > ul > li')];
  if (!items.length) return false;
  const count = document.body.classList.contains('compact-navigation') && items.length > 1 ? 2 : 1;
  if (!directList && tree.children.length === count) return false;
  if (!directList) rememberNavigationScroll();
  let split = items.length;
  if (count === 2) {
    // Keep every parent branch together. Use all descendants so folding a branch
    // does not move unrelated collections between the two columns.
    const names = collectionNames();
    const weights = items.map(item => names.filter(name => inCollection(name, item.querySelector(':scope > .collection-row').dataset.folder)).length);
    const half = weights.reduce((sum, weight) => sum + weight, 0) / 2;
    let sum = 0, difference = Infinity;
    for (let i = 1; i < items.length; i++) {
      sum += weights[i - 1];
      if (Math.abs(sum - half) < difference) { difference = Math.abs(sum - half); split = i; }
    }
  }
  const columns = [];
  for (let index = 0; index < count; index++) {
    const column = element('div', 'collection-column'), list = element('ul');
    column.dataset.column = index; column.setAttribute('role', 'group'); column.setAttribute('aria-label', count === 1 ? 'Collection list' : `Collections column ${index + 1}`);
    if (count === 2) column.tabIndex = 0;
    list.append(...(index === 0 ? items.slice(0, split) : items.slice(split))); column.append(list); columns.push(column);
  }
  tree.style.setProperty('--navigation-columns', String(count)); tree.replaceChildren(...columns);
  columns.forEach((column, index) => { column.scrollTop = navigationColumnScroll[index] || 0; });
  return true;
}
function revealSelectedCollection() {
  const row = $('#collection-tree .selected'), column = row?.closest('.collection-column');
  if (!column) return;
  const bounds = column.getBoundingClientRect(), active = row.getBoundingClientRect();
  if (active.bottom > bounds.bottom) column.scrollTop += active.bottom - bounds.bottom + 8;
  else if (active.top < bounds.top) column.scrollTop -= bounds.top - active.top + 8;
}
function navigationScrollerAt(point) {
  return document.elementFromPoint(point.clientX, point.clientY)?.closest('#collection-tree .collection-column') || null;
}

let titleFitFrame = 0;
function scheduleTitleFit() {
  if (titleFitFrame) return;
  titleFitFrame = requestAnimationFrame(() => {
    titleFitFrame = 0;
    const name = $('#view-title .view-name');
    if (!name) return;
    name.style.fontSize = '';
    if (name.closest('main').classList.contains('narrow-content')) return;

    const available = name.getBoundingClientRect().width;
    const range = document.createRange();
    range.selectNodeContents(name);
    const required = range.getBoundingClientRect().width;
    if (!available || required <= available) return;

    const minimumSize = 18;
    const baseSize = parseFloat(getComputedStyle(name).fontSize);
    let size = Math.max(minimumSize, Math.floor(baseSize * available / required * 4) / 4);
    name.style.fontSize = `${size}px`;
    // Fixed letter spacing can keep a label slightly wider than the estimated size.
    while (size > minimumSize && range.getBoundingClientRect().width > available) {
      size = Math.max(minimumSize, size - .5);
      name.style.fontSize = `${size}px`;
    }
  });
}
document.fonts?.addEventListener('loadingdone', scheduleTitleFit);

function drawTreeContext() {
  loadCollapsedCollections();
  const selected = $('#collection-filter').value;
  const tree = $('#collection-tree');
  rememberNavigationScroll();
  const focusedName = tree.contains(document.activeElement) ? document.activeElement.dataset.collection ?? null : null;
  const focusedBranch = tree.contains(document.activeElement) ? document.activeElement.dataset.branch ?? null : null;
  tree.replaceChildren();
  const allContainer = $('#collection-all'); allContainer.replaceChildren();
  const allRow = element('div', 'collection-row all-items-row' + (!selected ? ' selected' : ''));
  const all = element('button', 'collection-chip');
  all.append(collectionIconNode('', 'icon:grid'), element('span', 'collection-name', 'All items'), element('span', 'collection-count', String(sources.filter(matchesArchive).length)));
  all.dataset.collection = ''; all.setAttribute('aria-pressed', String(!selected)); all.addEventListener('click', () => chooseCollection(''));
  if (selected) { all.dataset.dropRemove = 'true'; all.title = 'Drop here to remove from this collection. The item stays saved.'; }
  allRow.append(all); allRow.dataset.folderRoot = 'true'; allContainer.append(allRow);
  const names = collectionNames();
  $('#collection-list-title').textContent = `Collections · ${names.length}`;
  function childrenOf(parent, container, seen = new Set()) {
    const list = element('ul');
    const children = orderedChildren(parent);
    for (const name of children) {
      if (seen.has(name)) continue;
      seen.add(name);
      const item = element('li'), row = element('div', 'collection-row' + (name === selected ? ' selected' : ''));
      row.dataset.folder = name;
      const childCount = orderedChildren(name).length;
      if (childCount) {
        row.classList.add('has-children');
        const toggle = element('button', 'collection-toggle');
        toggle.dataset.branch = name;
        toggle.setAttribute('aria-label', `${collapsedCollections.has(name) ? 'Expand' : 'Collapse'} ${name} (${childCount} subcollection${childCount === 1 ? '' : 's'})`);
        toggle.setAttribute('aria-expanded', String(!collapsedCollections.has(name)));
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 12 12'); icon.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'm4 2 4 4-4 4'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.5'); path.setAttribute('fill', 'none');
        icon.append(path); toggle.append(icon); toggle.addEventListener('click', () => toggleCollectionBranch(name)); row.append(toggle);
      } else row.append(element('span', 'collection-spacer'));
      row.append(collectionButton(name), collectionMenu(name)); setupCollectionDrag(row, name); item.append(row); list.append(item);
      if (!collapsedCollections.has(name)) childrenOf(name, item, seen);
    }
    if (children.length) container.append(list);
  }
  childrenOf(null, tree); arrangeCollectionColumns();
  if (selected !== lastNavigatedCollection) {
    revealSelectedCollection();
    lastNavigatedCollection = selected;
  }
  if (focusedName !== null) [...tree.querySelectorAll('[data-collection]')].find(button => button.dataset.collection === focusedName)?.focus({preventScroll: true});
  else if (focusedBranch !== null) [...tree.querySelectorAll('[data-branch]')].find(button => button.dataset.branch === focusedBranch)?.focus({preventScroll: true});
  const crumbs = $('#collection-breadcrumbs'); crumbs.replaceChildren();
  for (const name of collectionPath(selected).slice(0, -1)) {
    if (crumbs.childElementCount) crumbs.append(element('span', '', '/'));
    const button = element('button', '', name);
    button.addEventListener('click', () => chooseCollection(name));
    crumbs.append(button);
  }
  const title = $('#view-title');
  const trash = $('#archive-filter').value === 'trash';
  const label = selected || (trash ? 'Trash' : 'All items');
  const previousName = title.querySelector('.view-name');
  const viewName = previousName?.textContent === label ? previousName : element('span', 'view-name', label);
  const trashBack = $('#trash-back');
  const titleWidthChanged = viewName !== previousName
    || Boolean(title.querySelector('.collection-icon')) !== Boolean(selected)
    || trashBack.hidden !== !trash;
  viewName.title = selected;
  title.replaceChildren(...(selected ? [collectionIconNode(selected), viewName] : [viewName]));
  $('#current-collection-menu').replaceChildren(collectionMenu(selected, true));
  trashBack.hidden = !trash;
  const returnTo = trashReturn?.collection || 'All items';
  trashBack.setAttribute('aria-label', `Back to ${returnTo}`);
  trashBack.title = `Back to ${returnTo}`;
  renderLinkedPlaylists(trash ? '' : selected);
  applyAppearance();
  if (titleWidthChanged) scheduleTitleFit();
}
document.addEventListener('click', event => {
  document.querySelectorAll(openBrowseMenus).forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
});
$('#collection-tree').addEventListener('scroll', () => { rememberNavigationScroll(); document.querySelectorAll('.collection-menu[open]').forEach(menu => menu.open = false); }, true);
window.addEventListener('resize', () => document.querySelectorAll(openBrowseMenus).forEach(menu => menu.open = false));
const closeCardMenu = () => { const menu = $('.card-actions-menu[open]'); if (menu) menu.open = false; };
window.addEventListener('scroll', closeCardMenu, {passive: true});
window.visualViewport?.addEventListener('resize', closeCardMenu);
window.visualViewport?.addEventListener('scroll', closeCardMenu, {passive: true});
$('#browse-options').addEventListener('toggle', () => {
  if (!$('#browse-options').open) return;
  const panel = $('#browse-options .filter-panel'), summary = $('#filter-summary').getBoundingClientRect();
  panel.style.left = Math.max(12, Math.min(summary.left, window.innerWidth - panel.offsetWidth - 12)) + 'px';
  panel.style.top = Math.max(12, Math.min(summary.bottom + 8, window.innerHeight - panel.offsetHeight - 12)) + 'px';
});

function membershipInView(source) {
  const selected = $('#collection-filter').value;
  return itemCollections(source).find(name => selected && inCollection(name, selected)) || itemCollections(source)[0];
}
function movePatch(source, collection, add = false) {
  const selected = $('#collection-filter').value;
  const remaining = add ? itemCollections(source) : selected ? itemCollections(source).filter(name => !inCollection(name, selected)) : collection ? itemCollections(source) : [];
  return {collections: [...new Set([...remaining, ...(collection ? [collection] : [])])]};
}
function removeFromViewPatch(source) {
  const selected = $('#collection-filter').value;
  return {collections: itemCollections(source).filter(name => !selected || !inCollection(name, selected))};
}

async function changeItem(source, patch) {
  if (organizing) return false;
  if (drafts.has(source.id) && !await saveDraft(source)) return false;
  organizing = true;
  const before = Object.fromEntries(Object.keys(patch).map(key => [key, itemData(source)[key] ?? null]));
  try {
    const response = await libraryFetch(`/api/items/${source.id}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({revision: itemData(source).revision, ...patch})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not update this item.');
    annotations[source.id] = result.item;
    sources = sources.map(s => s.id === source.id ? result.source : s);
    if (editing?.id === source.id && result.item.trashed) await closeEditor();
    else if (editing?.id === source.id) {
      editing = result.source; editorRevision = result.item.revision;
      renderCollectionChecks(result.item.collections);
      updatePanelCollection(editing);
    }
    updateFilters(); render();
    const message = 'trashed' in patch ? (patch.trashed ? 'Moved to Trash.' : 'Item restored.') :
      (patch.collections?.length ? 'Collections updated.' : 'Removed from collections. This item stays saved in All items.');
    actionStatus(result.warning || message, 'trashed' in patch && !result.warning ? 4000 : 0);
    const undo = element('button', 'secondary-action', 'Undo');
    undo.addEventListener('click', () => changeItem(sources.find(s => s.id === source.id) || source, before));
    $('#action-status').append(document.createTextNode(' '), undo);
    return true;
  } catch (error) { actionStatus(error.message); return false; }
  finally { organizing = false; }
}
function trashButton(source, menu) {
  const trashed = itemData(source).trashed;
  const button = element('button', trashed ? 'edit-button' : 'delete-action', trashed ? 'Restore' : 'Delete');
  button.addEventListener('click', () => {
    if (menu) menu.open = false;
    changeItem(source, {trashed: !trashed});
  });
  return button;
}
function openMoveDialog(source) {
  movingSource = source; $('#move-item-title').textContent = source.title; $('#move-status').textContent = '';
  collectionSelect($('#move-collection'), itemData(source).collection, 'No collection');
  $('#move-dialog').showModal();
}
$('#move-dialog-close').addEventListener('click', () => { if (!organizing) $('#move-dialog').close(); });
$('#move-save').addEventListener('click', async () => {
  if (!movingSource) return;
  $('#move-save').disabled = true;
  const result = await changeItem(movingSource, movePatch(movingSource, $('#move-collection').value));
  $('#move-save').disabled = false;
  if (result) $('#move-dialog').close();
  else $('#move-status').textContent = $('#action-status').textContent;
});
$('#move-dialog').addEventListener('cancel', event => { if (organizing) event.preventDefault(); });
function openCollectionDialog(create = false, parent = null, selectedName = null) {
  const select = $('#organize-collection'); select.replaceChildren();
  const option = element('option', '', '+ New collection'); option.value = ''; select.append(option);
  for (const name of sortedCollections()) { const option = element('option', '', collectionPath(name).join(' / ')); option.value = name; select.append(option); }
  select.value = create ? '' : selectedName || $('#collection-filter').value || '';
  treeRevision = collectionIconRevision;
  $('#new-collection-name').value = ''; $('#collection-save-status').textContent = '';
  $('#collection-dialog-title').textContent = create ? (parent ? 'New subcollection' : 'New collection') : 'Edit collection';
  loadCollectionForm(parent);
  $('#collection-dialog').showModal();
}
function loadCollectionForm(parent = null) {
  const name = $('#organize-collection').value;
  $('#new-collection-label').hidden = Boolean(name);
  collectionSelect($('#collection-parent'), name ? collectionParents[name] : parent, 'Top level', name);
  $('#collection-pinned').checked = name ? pinnedCollections.includes(name) : false;
  const appearance = collectionAppearance[name];
  $('#collection-theme').value = appearance?.theme || '';
  $('#collection-motion').value = appearance ? !appearance.motion ? 'off' : appearance.motionOverride ? 'on' : 'system' : 'on';
  pickerIcon = collectionIcons[name] || null;
  $('#icon-custom').value = pickerIcon && !pickerIcon.startsWith('icon:') && !pickerIcon.startsWith('lucide:') ? pickerIcon : '';
  $('#icon-search').value = ''; iconResultLimit = 80; renderIconPicker();
  refreshIconPreview();
  refreshThemePreview(true);
}
$('#collection-new').addEventListener('click', () => openCollectionDialog(true));
let glowEdited = false;
function refreshThemePreview(resetColors = false) {
  const name = $('#organize-collection').value || $('#new-collection-name').value;
  const theme = $('#collection-theme').value;
  const parent = $('#collection-parent').value;
  const inherited = parent ? appearanceFor(parent) : {theme: name ? 'auto' : 'moss', motion: true, motionOverride: true, seed: name};
  const saved = collectionAppearance[name];
  const appearance = theme ? {theme, seed: name} : inherited;
  const palette = paletteFor(name, appearance);
  if (resetColors) {
    const colors = theme && saved?.theme === theme && saved.colors ? saved.colors : palette.slice(3);
    glowEdited = false;
    colors.forEach((color, i) => {
      $('#theme-color-' + i).value = color;
      $('#glow-hex-' + i).value = color;
    });
  }
  for (let i = 0; i < 3; i++) {
    palette[3 + i] = $('#theme-color-' + i).value;
  }
  $('#collection-motion').disabled = !theme;
  const preview = $('#theme-preview'); preview.style.background = glowSurface(glowSurface(palette[0],palette[3],22),palette[4],9);
  ['--glow-a', '--glow-b', '--glow-c'].forEach((key, i) => preview.style.setProperty(key, palette[i + 3]));
  const sample = $('#theme-preview-name');
  sample.textContent = name || 'Collection';
  sample.style.color = accentOn(palette[3], '#49443f');
  if (currentStyle === 'inn') {
    paintInnLight(preview.querySelector('.inn-rays'), palette.slice(3), 0);
  }
  const motion = theme ? $('#collection-motion').value !== 'off' : inherited.motion;
  const explicit = theme ? $('#collection-motion').value === 'on' : inherited.motionOverride;
  preview.classList.toggle('motion-explicit', Boolean(explicit));
  for (const blob of preview.querySelectorAll('.ambient div')) blob.style.animationPlayState = motion ? 'running' : 'paused';
  $('#motion-note').textContent = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Reduce Motion is enabled on this device. Choose Animated to allow motion here.' : 'Preview updates as you choose. Save to apply to this collection.';
}
$('#collection-theme').addEventListener('change', () => refreshThemePreview(true));
$('#collection-parent').addEventListener('change', () => refreshThemePreview(!glowEdited));
$('#collection-motion').addEventListener('change', () => refreshThemePreview());
function editGlow(index, hex) {
  const theme = $('#collection-theme');
  if (!theme.value) {
    const parent = $('#collection-parent').value;
    const inherited = appearanceFor(parent);
    theme.value = parent ? inherited.theme : 'auto';
    $('#collection-motion').value = !inherited.motion ? 'off' : inherited.motionOverride ? 'on' : 'system';
  }
  glowEdited = true;
  $('#theme-color-' + index).value = hex;
  refreshThemePreview();
}
for (let i = 0; i < 3; i++) {
  const swatch = $('#theme-color-' + i), hex = $('#glow-hex-' + i);
  const fromSwatch = () => {
    hex.value = swatch.value;
    editGlow(i, swatch.value);
  };
  swatch.addEventListener('input', fromSwatch);
  swatch.addEventListener('change', fromSwatch);
  hex.addEventListener('input', () => {
    if (/^#?[0-9a-f]{6}$/i.test(hex.value)) editGlow(i, '#' + hex.value.replace('#',''));
  });
}
$('#new-collection-name').addEventListener('input', () => refreshThemePreview(!glowEdited));
$('#organize-collection').addEventListener('change', () => loadCollectionForm());
$('#collection-dialog-close').addEventListener('click', () => { if (!organizing) $('#collection-dialog').close(); });
$('#collection-dialog').addEventListener('cancel', event => { if (organizing) event.preventDefault(); });
$('#collection-save').addEventListener('click', async () => {
  if (organizing) return;
  const selected = $('#organize-collection').value;
  const name = selected || $('#new-collection-name').value.trim();
  if (!name) { $('#collection-save-status').textContent = 'Enter a collection name.'; return; }
  for (const field of document.querySelectorAll('.theme-colors input[type=text]')) {
    if (!/^#?[0-9a-f]{6}$/i.test(field.value)) {
      $('#collection-save-status').textContent = 'Enter a six-digit hex colour.';
      field.focus();
      return;
    }
  }
  organizing = true; $('#collection-save').disabled = true;
  try {
    const appearance = $('#collection-theme').value ? {theme: $('#collection-theme').value, motion: $('#collection-motion').value !== 'off', motionOverride: $('#collection-motion').value === 'on', colors: [0, 1, 2].map(i => $('#theme-color-' + i).value)} : null;
    const response = await libraryFetch('/api/collections', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name, parent: $('#collection-parent').value || null, pinned: $('#collection-pinned').checked, appearance, icon: pickerIcon, create: !selected, revision: treeRevision })});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save this collection.');
    collectionParents = result.settings.parents; pinnedCollections = result.settings.pinned;
    collectionAppearance = result.settings.appearance || {};
    collectionOrder = result.settings.order || [];
    collectionIcons = result.settings.icons; collectionIconRevision = result.revision;
    updateFilters(); $('#collection-filter').value = name; render(); $('#collection-dialog').close();
    successStatus('Collection saved.');
  } catch (error) { $('#collection-save-status').textContent = error.message; }
  finally { organizing = false; $('#collection-save').disabled = false; }
});

function refreshIconPreview() {
  const name = $('#organize-collection').value || $('#new-collection-name').value;
  $('#icon-preview').replaceChildren(collectionIconNode(name, pickerIcon));
  for (const button of $('#icon-options').children) button.setAttribute('aria-pressed', String(button.dataset.icon === (pickerIcon || suggestedIcon(name))));
}
const popularIconNames = ['folder', 'lightbulb', 'bookmark', 'book-open', 'wrench', 'cpu', 'circuit-board', 'bot', 'code', 'terminal', 'database', 'server', 'house', 'camera', 'image', 'video', 'youtube', 'music', 'headphones', 'coffee', 'sprout', 'microscope', 'flask-conical', 'atom', 'rocket', 'plane', 'bike', 'car', 'map', 'compass', 'palette', 'brush', 'pencil', 'notebook', 'list-todo', 'calendar', 'heart', 'star', 'archive', 'package', 'layers', 'network', 'shield', 'key', 'gamepad-2', 'lamp', 'sun', 'moon'];
function renderIconPicker() {
  const words = $('#icon-search').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const legacy = Object.entries(iconPaths).map(([name, [label]]) => ({value: 'icon:' + name, label, search: `${name} ${label}`.toLowerCase()}));
  const names = [...new Set([...popularIconNames.filter(name => lucideIcons[name]), ...Object.keys(lucideIcons).sort()])];
  const all = [...legacy, ...names.map(name => ({value: 'lucide:' + name, label: name.replace(/-/g, ' '), search: `${name.replace(/-/g, ' ')} ${(lucideTags[name] || []).join(' ')}`}))];
  const matches = all.filter(icon => words.every(word => icon.search.includes(word)));
  if (words.length) matches.sort((a, b) => Number(b.label.toLowerCase() === words.join(' ')) - Number(a.label.toLowerCase() === words.join(' ')));
  const box = $('#icon-options'), scroll = box.scrollTop; box.replaceChildren();
  for (const item of matches.slice(0, iconResultLimit)) {
    const button = element('button'); button.type = 'button'; button.dataset.icon = item.value; button.title = item.label;
    button.setAttribute('aria-label', item.label + ' icon'); button.append(collectionIconNode('', item.value), element('span', 'icon-label', item.label));
    button.addEventListener('click', () => { pickerIcon = item.value; $('#icon-custom').value = ''; refreshIconPreview(); }); box.append(button);
  }
  box.scrollTop = scroll;
  $('#icon-more').hidden = matches.length <= iconResultLimit;
  $('#icon-results').textContent = iconLibraryLoaded ? `${matches.length.toLocaleString()} ${words.length ? 'matching icons' : 'icons'}${matches.length > iconResultLimit ? ` · showing ${iconResultLimit}` : ''}` : 'Built-in icons · loading Lucide…';
  refreshIconPreview();
}
$('#icon-search').addEventListener('input', () => { iconResultLimit = 80; $('#icon-options').scrollTop = 0; renderIconPicker(); });
$('#icon-more').addEventListener('click', () => { iconResultLimit += 80; renderIconPicker(); });
async function loadIconLibrary() {
  try {
    const response = await fetch(browserLocalViewer ? './lucide-icons.json' : '/lucide-icons.json'); if (!response.ok) throw new Error('Icon library unavailable');
    const data = await response.json(); lucideIcons = data.icons; lucideTags = data.tags || {}; iconLibraryLoaded = true;
    renderIconPicker();
    const refresh = () => {
      if (organizing || draggingItem || draggingCollection) { setTimeout(refresh, 150); return; }
      if (sources.length) render(); if (editing) updatePanelCollection(editing);
    }; refresh();
  } catch { $('#icon-results').textContent = 'Built-in icons available. Reload this page to retry loading Lucide.'; }
}
renderIconPicker();
$('#icon-custom').addEventListener('input', () => { pickerIcon = $('#icon-custom').value.trim() || null; refreshIconPreview(); });
$('#icon-reset').addEventListener('click', () => { pickerIcon = null; $('#icon-custom').value = ''; refreshIconPreview(); });
function updatePanelCollection(source) {
  const label = $('#entry-collection-label'); label.replaceChildren();
  for (const name of itemCollections(source)) { const tag = element('span', 'collection-tag', collectionPath(name).join(' / ')); tag.prepend(collectionIconNode(name)); label.append(tag); }
}

function renderSharedRepositories(repositories) {
  const nav = $('#shared-collections');
  nav.replaceChildren();
  const here = browserLocalViewer && new URL(location.href).searchParams.get('library')?.toLowerCase();
  if (here) {
    const home = element('a', '', '← My library');
    home.href = new URL(location.pathname, location.origin).href;
    nav.append(home);
  }
  for (const [name, repo] of Object.entries(repositories || {})) {
    if (typeof repo !== 'string' || !/^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/i.test(repo) || repo.split('/')[1].match(/^\.{1,2}$/) || repo.toLowerCase() === here) continue;
    const url = browserLocalViewer ? new URL(location.pathname, location.origin) : new URL('https://inntake.app/app/');
    url.searchParams.set('library', repo.toLowerCase());
    url.searchParams.set('collection', name);
    const link = element('a', '', name);
    link.href = url.href;
    link.title = 'Shared collection · ' + repo;
    const marker = element('span', '', '↗');
    marker.setAttribute('aria-hidden', 'true');
    link.prepend(marker);
    nav.append(link);
  }
  nav.hidden = !nav.childElementCount;
}
let requestedCollection = browserLocalViewer && new URLSearchParams(location.search).get('library')
  ? new URLSearchParams(location.search).get('collection') : null;
function updateFilters() {
  const nav = $('#categories');
  nav.replaceChildren();
  for (const [key, label] of [['', 'All'], ...categories]) {
    const button = element('button');
    button.append(element('span', '', label), element('span', 'category-count'));
    button.dataset.category = key;
    if (key) button.prepend(dot(key));
    button.setAttribute('aria-pressed', String(key === activeCategory));
    button.addEventListener('click', () => { activeCategory = key; render(); });
    nav.append(button);
  }
  const select = $('#collection-filter');
  let previous = select.value;
  if (libraryId && !collectionSelectionLoaded) {
    collectionSelectionLoaded = true;
    try { previous = localStorage.getItem(`personal-library-collection-${libraryId}`) ?? previous; } catch {}
  }
  const collections = sortedCollections();
  if (requestedCollection && collections.includes(requestedCollection)) {
    previous = requestedCollection;
    requestedCollection = null;
  }
  select.replaceChildren(element('option', '', 'All items'));
  select.firstChild.value = '';
  for (const name of collections) {
    const option = element('option', '', collectionPath(name).join(' / ') + ' (' + collectionCount(name) + ')');
    option.value = name;
    select.append(option);
  }
  select.value = collections.includes(previous) ? previous : '';
  drawCollectionShortcuts();
  const suggestions = $('#collections');
  suggestions.replaceChildren();
  for (const name of new Set(['Apps', 'Programming languages', ...collections])) {
    const option = element('option');
    option.value = name;
    suggestions.append(option);
  }
}

function videoStart(value) {
  const url = webLink(value);
  if (!url) return 0;
  const raw = url.searchParams.get('t') || url.searchParams.get('start') || new URLSearchParams(url.hash.slice(1)).get('t') || '';
  if (/^\d+$/.test(raw)) return Math.min(Number(raw), 2147483647);
  const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (units && raw) return Math.min(Number(units[1] || 0) * 3600 + Number(units[2] || 0) * 60 + Number(units[3] || 0), 2147483647);
  const clock = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(raw);
  return clock ? Number(clock[1]) * (clock[3] ? 3600 : 60) + Number(clock[2]) * (clock[3] ? 60 : 1) + Number(clock[3] || 0) : 0;
}

function timeLabel(seconds) {
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .slice(seconds >= 3600 ? 0 : 1).map((value, index) => index ? String(value).padStart(2, '0') : String(value)).join(':');
}

function externalButton(source, className = '') {
  const link = sourceLink(source, '↗');
  link.className = 'external-link ' + className;
  link.setAttribute('aria-label', `Open original: ${source.title}`);
  link.title = 'Open original in a new tab';
  return link;
}

function setPanelMode(mode) {
  $('#entry-overview').hidden = mode !== 'overview';
  $('#edit-form').hidden = mode !== 'edit';
  $('#overview-tab').setAttribute('aria-pressed', String(mode === 'overview'));
  $('#edit-tab').setAttribute('aria-pressed', String(mode === 'edit'));
}

function appendInline(node, text, source) {
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    node.append(document.createTextNode(text.slice(last, match.index)));
    if (match[1]) {
      const target = match[2];
      const related = sources.find(s => target === s.id + '.md' || target === 'entries/' + s.id + '.md');
      if (related) {
        const link = element('button', 'inline-entry-link', match[1]);
        link.addEventListener('click', () => openEditor(related));
        node.append(link);
      } else {
        try {
          const url = webLink(target) || new URL(target, location.origin + localPath(source.path));
          if (['http:', 'https:'].includes(url.protocol) && (url.origin !== location.origin || url.pathname.startsWith('/files/'))) node.append(sourceLink({ url: url.href }, match[1]));
          else node.append(document.createTextNode(match[1]));
        } catch { node.append(document.createTextNode(match[1])); }
      }
    } else node.append(element(match[3] ? 'strong' : 'code', '', match[3] || match[4]));
    last = match.index + match[0].length;
  }
  node.append(document.createTextNode(text.slice(last)));
}

function renderFullNote(source, overview) {
  const body = (source.fullText || source.summary || '').trim().replace(/^# [^\n]*\n?/, '').trim();
  let paragraph = null, list = null;
  for (const line of body.split('\n')) {
    if (/^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(line)) continue;
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (heading) {
      paragraph = list = null;
      const node = element('h3'); appendInline(node, heading[2], source); overview.append(node);
    } else if (bullet) {
      paragraph = null;
      if (!list) { list = element('ul'); overview.append(list); }
      const node = element('li'); appendInline(node, bullet[1], source); list.append(node);
    } else if (!line.trim()) paragraph = list = null;
    else {
      list = null;
      if (!paragraph) { paragraph = element('p'); overview.append(paragraph); }
      else paragraph.append(document.createTextNode('\n'));
      appendInline(paragraph, line, source);
    }
  }
  const links = element('section', 'source-links');
  links.append(element('h3', '', 'Originals & attachments'));
  links.append(sourceLink({path: source.path}, 'Open Markdown entry ↗'));
  const copy = contextCopyButton({...source, url: null, images: []}); copy.textContent = 'Copy full note'; links.append(copy);
  for (const url of source.urls || []) links.append(sourceLink({ url }, url));
  for (const attachment of [...source.images || [], ...source.attachments || []]) links.append(sourceLink(attachment, attachment.title));
  overview.append(links);
}

function genericLinkPreview(source) {
  const preview = source.linkPreview;
  if (!preview || !webLink(source.url) || youtubeVideoId(source.url) || source.images?.length) return null;
  const path = typeof preview.image === 'string' ? preview.image.replace(/^\/files\//, '') : '';
  return {
    title: typeof preview.title === 'string' ? preview.title.trim() : '',
    description: typeof preview.description === 'string' ? preview.description.trim() : '',
    image: path.startsWith('sources/') ? localPath(path) : null
  };
}

function linkPreviewImage(url) {
  const image = element('img', 'link-preview-image');
  image.alt = '';
  image.loading = 'lazy';
  image.addEventListener('error', () => image.hidden = true, { once: true });
  image.src = url;
  return image;
}

function showOverview(source) {
  const overview = $('#entry-overview'); overview.replaceChildren();
  const images = source.images || [];
  const linkPreview = genericLinkPreview(source);
  if (images.length) {
    const preview = element('div', 'image-preview');
    const open = element('button'), image = element('img');
    let selected = 0;
    image.src = localPath(images[0].path); image.alt = source.title;
    open.setAttribute('aria-label', `View image: ${source.title}`);
    open.append(image); open.addEventListener('click', () => openImageViewer(source, selected));
    const caption = element('div', 'preview-caption'); caption.append(element('span', '', 'Click to zoom & pan'));
    const expand = element('button', '', '⛶'); expand.title = 'Open image viewer'; expand.setAttribute('aria-label', 'Open image viewer'); expand.addEventListener('click', () => openImageViewer(source, selected));
    caption.append(expand); preview.append(open, caption); overview.append(preview);
    const actions = element('div', 'panel-actions');
    const original = sourceLink(images[0], 'Open image ↗');
    const copySlot = element('span');
    function updateImageActions() {
      const copy = contextCopyButton({...source, url: null, images: [images[selected]]}); copy.textContent = 'Copy image'; copySlot.replaceChildren(copy);
      original.href = localPath(images[selected].path);
    }
    updateImageActions(); actions.append(original, copySlot); overview.append(actions);
    if (images.length > 1) {
      const thumbnails = element('div', 'preview-thumbnails');
      images.forEach((attachment, index) => {
        const button = element('button'), thumb = element('img'); thumb.src = localPath(attachment.path); thumb.alt = `Image ${index + 1}`;
        button.setAttribute('aria-label', `Preview image ${index + 1} of ${images.length}`); button.setAttribute('aria-pressed', String(index === selected));
        button.append(thumb); button.addEventListener('click', () => {
          selected = index; image.src = localPath(attachment.path); updateImageActions();
          for (const [i, sibling] of [...thumbnails.children].entries()) sibling.setAttribute('aria-pressed', String(i === selected));
        }); thumbnails.append(button);
      }); overview.append(thumbnails);
    }
  } else {
    if (linkPreview?.image) overview.append(linkPreviewImage(linkPreview.image));
    const actions = element('div', 'panel-actions');
    if (webLink(source.url)) actions.append(sourceLink(source, 'Open source ↗'));
    const copy = contextCopyButton(source); copy.textContent = copyKind(source) === 'link' ? 'Copy link' : 'Copy text'; actions.append(copy); overview.append(actions);
  }
  const summary = (source.summary || '').replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
  const notes = itemData(source).notes?.trim();
  if (summary && (!linkPreview || summary !== notes)) { const text = element('p', 'preview-summary'); appendInline(text, summary.length > 550 ? summary.slice(0, 547) + '…' : summary, source); overview.append(text); }
  if (linkPreview) {
    const title = linkPreview.title !== source.title ? linkPreview.title : '';
    const description = linkPreview.description !== summary && linkPreview.description !== notes ? linkPreview.description : '';
    if (title || description) {
      const details = element('div', 'entry-link-preview');
      if (title) details.append(element('p', 'entry-link-preview-title', title));
      if (description) details.append(element('p', 'preview-summary', description));
      overview.append(details);
    }
  }
  if (!images.length && notes && (linkPreview || (notes !== summary && !summary.includes(notes)))) overview.append(element('div', 'preview-note', notes.length > 650 ? notes.slice(0, 647) + '…' : notes));
  const fullNote = element('details', 'full-note');
  fullNote.append(element('summary', '', 'Full note & sources'));
  const content = element('div', 'full-note-body'); renderFullNote(source, content); fullNote.append(content); overview.append(fullNote);
}

function clearPlayer() {
  if (!activeVideo) return;
  activeVideo.exitViewport(false);
  activeVideo.media.replaceChildren();
  activeVideo = null;
}

function stopVideo() {
  clearPlayer();
  render();
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && activeVideo?.media.classList.contains('viewport-player')) {
    event.stopImmediatePropagation();
    activeVideo.exitViewport(true);
  }
}, true);
document.addEventListener('fullscreenchange', () => activeVideo?.updateFullscreen());

function playVideo(source, media, card) {
  const id = youtubeVideoId(source.url);
  if (!id) return;
  clearPlayer();
  const frame = element('iframe', 'inline-video');
  const url = new URL(`https://www.youtube.com/embed/${id}`);
  url.searchParams.set('autoplay', '1');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('fs', '1');
  url.searchParams.set('start', String(videoStart(source.url)));
  frame.src = url.href;
  frame.title = `Play ${source.title}`;
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  const stop = element('button', 'player-stop', '×');
  stop.setAttribute('aria-label', `Stop ${source.title}`);
  stop.title = 'Stop video'; stop.addEventListener('click', stopVideo);
  const fullscreen = element('button', 'player-fullscreen', '⛶');
  let placeholder, previousScroll;
  function updateFullscreen() {
    const expanded = !!placeholder || document.fullscreenElement === media;
    fullscreen.setAttribute('aria-label', expanded ? 'Exit fullscreen' : `Fullscreen ${source.title}`);
    fullscreen.title = expanded ? 'Exit fullscreen' : 'Fullscreen';
    fullscreen.textContent = placeholder ? 'Done' : '⛶';
  }
  function exitViewport(restoreFocus) {
    if (!placeholder) return;
    if (media.hasAttribute('popover')) {
      media.hidePopover();
      media.removeAttribute('popover');
    }
    media.classList.remove('viewport-player');
    document.documentElement.classList.remove('video-expanded');
    placeholder.remove();
    placeholder = null;
    updateFullscreen();
    window.scrollTo(previousScroll.x, previousScroll.y);
    if (restoreFocus) fullscreen.focus({preventScroll:true});
  }
  function enterViewport() {
    previousScroll = {x:window.scrollX, y:window.scrollY};
    placeholder = element('div');
    placeholder.style.height = media.getBoundingClientRect().height + 'px';
    placeholder.style.marginBottom = getComputedStyle(media).marginBottom;
    media.before(placeholder);
    media.classList.add('viewport-player');
    document.documentElement.classList.add('video-expanded');
    // Promote the existing iframe to the top layer without restarting playback.
    if (typeof media.showPopover === 'function') {
      media.setAttribute('popover', 'manual');
      try { media.showPopover(); } catch { media.removeAttribute('popover'); }
    }
    updateFullscreen();
    fullscreen.focus({preventScroll:true});
  }
  updateFullscreen();
  fullscreen.addEventListener('click', async () => {
    if (placeholder) return exitViewport(true);
    if (document.fullscreenElement === media) return document.exitFullscreen();
    if (document.fullscreenEnabled && typeof media.requestFullscreen === 'function') {
      try { await media.requestFullscreen(); return; } catch { /* Embedded browsers may deny fullscreen. */ }
    }
    if (activeVideo?.media === media && !placeholder) enterViewport();
  });
  media.classList.add('playing');
  media.replaceChildren(frame, externalButton(source, 'media-external'), stop, fullscreen);
  activeVideo = { id: source.id, media, card, exitViewport, updateFullscreen };
  // Keep the playing card connected during catalog refreshes and note saves.
  render();
}

function copyKind(source) {
  if (youtubeVideoId(source.url)) return 'link';
  if (source.images?.length) return 'image';
  return webLink(source.url) ? 'link' : 'text';
}

function contextCopyButton(source, className = '') {
  const kind = copyKind(source);
  const button = element('button', 'context-copy ' + className, '⧉');
  button.type = 'button';
  button.title = `Copy ${kind}`;
  button.setAttribute('aria-label', `Copy ${kind} for ${source.title}`);
  button.addEventListener('click', async () => {
    try {
      if (kind === 'image') {
        const path = localPath(source.images[0].path);
        if (!path || typeof ClipboardItem === 'undefined') throw new Error('Image clipboard unavailable');
        // Supply the promise immediately so clipboard permission retains the click gesture.
        const png = (async () => {
          const response = await fetch(path);
          if (!response.ok) throw new Error('Image unavailable');
          const blob = await response.blob();
          if (blob.type === 'image/png') return blob;
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
          canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
          return new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Image conversion failed')), 'image/png'));
        })();
        await navigator.clipboard.write([new ClipboardItem({'image/png': png})]);
      } else await navigator.clipboard.writeText(kind === 'link' ? source.url : source.fullText || itemData(source).notes || source.summary || source.title);
      const previousLabel = button.textContent;
      button.textContent = previousLabel.length > 2 ? 'Copied' : '✓';
      button.title = `${kind[0].toUpperCase() + kind.slice(1)} copied`;
      successStatus(`${kind[0].toUpperCase() + kind.slice(1)} copied.`);
      setTimeout(() => { button.textContent = previousLabel; button.title = `Copy ${kind}`; }, 1500);
    } catch { actionStatus(`Could not copy this ${kind}. Check browser clipboard access and try again.`); }
  });
  return button;
}

function renderCard(source) {
  const item = itemData(source);
  const videoId = youtubeVideoId(source.url);
  const linkPreview = genericLinkPreview(source);
  const card = element('article', 'card');
  card.dataset.sourceId = source.id;
  card.dataset.keepsake = ({idea:'vial', consideration:'jar', question:'jar', todo:'box',
    resource:'book', reference:'book', bookmark:'canister', 'project-log':'journal'})[item.category] || 'journal';
  if (item.trashed) {
    card.append(element('h2', '', source.title), trashButton(source));
    return card;
  }
  setupCardDrag(card, source);
  const open = () => openEditor(source);
  card.addEventListener('click', event => {
    if (card.dataset.skipClick) return;
    if (!event.target.closest('button, a, select, input, textarea, iframe, summary, details')) open();
  });
  if (videoId || source.images?.length) {
    const media = element('div', 'card-media');
    const image = element('img', 'photo' + (videoId ? ' video-thumbnail' : ''));
    image.src = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : localPath(source.images[0].path);
    image.alt = videoId ? `YouTube video: ${source.title}` : source.images[0].title;
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.hidden = true, { once: true });
    media.append(image, externalButton(videoId ? source : source.images[0], 'media-external'), contextCopyButton(source, 'media-copy'));
    if (videoId) {
      const start = videoStart(source.url);
      const play = element('button', 'media-play', '▶' + (start ? ' ' + timeLabel(start) : ' Play'));
      play.setAttribute('aria-label', `Play ${source.title}${start ? ' from ' + timeLabel(start) : ''}`);
      play.addEventListener('click', () => playVideo(source, media, card));
      media.append(play);
    }
    card.append(media);
  } else if (linkPreview?.image) {
    const media = element('div', 'card-media link-preview-media');
    media.append(linkPreviewImage(linkPreview.image));
    card.append(media);
  }
  const meta = element('div', 'source');
  const host = webLink(source.url)?.hostname.replace(/^www\./, '');
  const drag = element('button', 'drag-handle', '⠿'); drag.setAttribute('aria-label', `Drag ${source.title}`); drag.title = 'Drag to a collection';
  meta.append(drag, element('span', 'source-label', videoId ? 'YouTube' : host || (source.images?.length ? 'Image' : 'Note')));
  if (item.core) meta.append(element('span', 'core-badge', 'Core'));
  if (!videoId && !source.images?.length) meta.append(externalButton(source));
  const heading = element('h2');
  const title = element('button', 'card-title', source.title || linkPreview?.title);
  title.addEventListener('click', () => { if (!card.dataset.skipClick) open(); });
  heading.append(title);
  const summary = source.summary?.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim() || linkPreview?.description;
  card.append(meta, heading);
  if (summary && (!linkPreview || summary !== item.notes?.trim())) card.append(element('p', 'summary', summary));
  if (item.notes && (linkPreview || item.notes.trim() !== source.summary?.trim())) {
    const note = element('p', 'attached-note compact-note');
    note.append(element('span', 'note-label', 'Your notes'), document.createTextNode(item.notes));
    card.append(note);
  }
  const tags = element('div', 'tags');
  for (const tag of (source.tags || []).filter(tag => !itemCollections(source).includes(tag)).slice(0, 3)) tags.append(element('span', 'tag', tag));
  if (tags.childElementCount) card.append(tags);
  const footer = element('div', 'card-footer');
  const categoryName = categories.find(([key]) => key === item.category)?.[1] || 'No category';
  const label = element('span', 'category-label'); label.title = categoryName;
  label.append(dot(item.category), element('span', 'category-name', categoryName));
  const footerStart = element('div', 'card-footer-start');
  const collections = element('div', 'card-collections');
  for (const name of itemCollections(source)) {
    const tag = element('button', 'collection-tag'); tag.title = `Open ${collectionPath(name).join(' / ')}`;
    tag.append(collectionIconNode(name), element('span', 'collection-tag-name', name));
    tag.addEventListener('click', () => chooseCollection(name)); collections.append(tag);
  }
  if (collections.childElementCount) footerStart.append(collections);
  footerStart.append(label);
  if (!videoId && !source.images?.length) card.append(contextCopyButton(source, 'card-copy'));
  const actions = element('span', 'item-actions');
  const menu = element('details', 'card-actions-menu'); const more = element('summary', '', '⋯'); more.setAttribute('aria-label', `Actions for ${source.title}`);
  const options = element('div');
  const edit = editButton(source); edit.className = ''; edit.textContent = 'Edit note'; options.append(edit);
  edit.addEventListener('click', () => { menu.open = false; });
  const move = element('button', '', 'Move to collection…'); move.addEventListener('click', () => { menu.open = false; openMoveDialog(source); }); options.append(move);
  const membership = membershipInView(source);
  if (membership) {
    const remove = element('button', '', `Remove from ${membership}`);
    remove.addEventListener('click', () => { menu.open = false; changeItem(source, {collections: itemCollections(source).filter(name => name !== membership)}); }); options.append(remove);
  }

  options.append(archiveButton(source), trashButton(source, menu));
  attachMenu(menu, more, options, true);
  actions.append(menu, impactControl(source));
  footer.append(footerStart, actions);
  card.append(footer);
  return card;
}

function copyLinkButton(source) {
  const button = element('button', 'copy-link-button');
  button.type = 'button';
  button.title = 'Copy link';
  button.setAttribute('aria-label', `Copy link for ${source.title}`);
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M10 13a5 5 0 0 0 7.07 0l3-3A5 5 0 0 0 13 2.93l-1.72 1.72m2.72 6.35a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21.07l1.72-1.72');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  icon.append(path);
  button.append(icon);
  const url = webLink(source.url);
  const pathValue = localPath(source.path);
  const target = url?.href || (pathValue ? new URL(pathValue, location.href).href : null);
  button.disabled = !target;
  button.addEventListener('click', async () => {
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target);
      button.title = 'Link copied';
      button.setAttribute('aria-label', `Link copied for ${source.title}`);
      setTimeout(() => {
        button.title = 'Copy link';
        button.setAttribute('aria-label', `Copy link for ${source.title}`);
      }, 1200);
    } catch {
      actionStatus('Could not copy this link. Check clipboard access and try again.');
    }
  });
  return button;
}

function renderRow(source) {
  const item = itemData(source);
  const row = element('tr');
  const name = element('td');
  if (item.trashed) {
    name.colSpan = 5;
    const meta = element('div', 'row-meta');
    meta.append(element('span', '', source.title), trashButton(source));
    name.append(meta); row.append(name);
    return row;
  }
  name.append(sourceLink(source, source.title));
  const meta = element('div', 'row-meta');
  meta.append(dot(item.category), element('span', '', source.id.slice(0, 8)), editButton(source), archiveButton(source), trashButton(source), impactControl(source));
  name.append(meta);
  const link = element('td');
  link.dataset.label = 'Link';
  if (source.sourceType === 'image' && source.attachments?.length) {
    for (const [index, attachment] of source.attachments.entries()) {
      if (index) link.append(element('br'));
      link.append(sourceLink(attachment, attachment.title || `Part ${index + 1}`));
    }
  } else {
    link.append(sourceLink(source, webLink(source.url)?.hostname.replace(/^www\./, '') || 'Open file'));
    for (const attachment of source.attachments || []) {
      link.append(element('br'), sourceLink(attachment, attachment.title || 'Read notes'));
    }
  }
  const originalNotes = (source.userNotes || []).map(note => note.text).join('\n');
  row.append(name, link);
  for (const [label, value] of [['Notes', [originalNotes, item.notes].filter(Boolean).join('\n\n')], ['Strengths', item.strengths], ['Limitations', item.limitations]]) {
    const cell = element('td', '', value || '—');
    cell.dataset.label = label;
    if (!value) cell.dataset.empty = '';
    row.append(cell);
  }
  return row;
}

function viewPreferenceKey() { return `personal-library-view-${libraryId}-${JSON.stringify($('#collection-filter').value)}`; }
function saveViewPreference() {
  if (!libraryId) return;
  try { localStorage.setItem(viewPreferenceKey(), JSON.stringify({view, size: cardSize})); } catch {}
}
function restoreViewPreference() {
  const collection = $('#collection-filter').value;
  if (!libraryId || preferenceCollection === collection) return;
  preferenceCollection = collection;
  view = 'cards'; cardSize = window.matchMedia('(max-width: 700px)').matches ? 'compact' : 'medium';
  try {
    const pref = JSON.parse(localStorage.getItem(viewPreferenceKey()) || '{}');
    if (['cards', 'table'].includes(pref.view)) view = pref.view;
    if (['compact', 'medium', 'large'].includes(pref.size)) cardSize = pref.size;
  } catch {}
}
function render() {
  restoreViewPreference();
  document.body.dataset.cardSize = cardSize;
  $('#card-size').value = cardSize; $('#card-size').disabled = view === 'table';
  drawTreeContext();
  const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const collection = $('#collection-filter').value;
  const archiveFilter = $('#archive-filter').value;
  if (libraryId && archiveFilter !== 'trash') {
    try { localStorage.setItem(`personal-library-collection-${libraryId}`, collection); } catch {}
  }
  for (const button of $('#categories').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.category === activeCategory));
    button.querySelector('.category-count').textContent = sources.filter(source => matchesArchive(source) && (!collection || itemCollections(source).some(name => inCollection(name, collection))) && (!button.dataset.category || itemData(source).category === button.dataset.category)).length;
  }
  const filterCount = Number(Boolean(activeCategory)) + Number($('#core-only').checked) + Number(archiveFilter !== 'active');
  $('#filter-summary').textContent = 'Filters' + (filterCount ? ` · ${filterCount}` : '');
  const visible = sources.filter(source => {
    const item = itemData(source);
    const text = [source.id, source.title, source.summary, source.linkPreview?.title, source.linkPreview?.description, source.url, ...source.tags || [], ...(source.userNotes || []).map(note => note.text), item.notes, item.collection, item.strengths, item.limitations, source.fullText, ...source.urls || []].join(' ').toLowerCase();
    return matchesArchive(source) && (!$('#core-only').checked || item.core) && (!activeCategory || item.category === activeCategory) && (!collection || itemCollections(source).some(name => inCollection(name, collection))) && words.every(word => text.includes(word));
  }).sort(compareSources);
  cardLayoutObserver.disconnect();
  if (activeVideo && (view !== 'cards' || !visible.some(source => source.id === activeVideo.id))) clearPlayer();
  // Remove only non-playing cards; removing/reparenting an iframe restarts it.
  for (const child of [...cards.children]) if (child !== activeVideo?.card) child.remove();
  rows.replaceChildren();
  const total = sources.filter(source => matchesArchive(source) && (!collection || itemCollections(source).some(name => inCollection(name, collection)))).length;
  count.textContent = `${visible.length}${visible.length !== total ? ` of ${total}` : ''} ${archiveFilter === 'archived' ? 'archived ' : archiveFilter === 'trash' ? 'deleted ' : ''}${total === 1 ? 'item' : 'items'}`;
  empty.hidden = visible.length > 0;
  const emptyCollection = collection && !sources.some(s => itemCollections(s).some(name => inCollection(name, collection)));
  empty.replaceChildren(
    element('h2', '', archiveFilter === 'trash' && !total ? 'Trash is empty.' : emptyCollection ? 'This collection is ready.' : sources.length ? 'Nothing here matches yet.' : 'A little room for your next big idea.')
  );
  if (archiveFilter !== 'trash') {
    let hint = browserLocalViewer ? 'Paste a URL in the search field and choose Add link.' : 'Drop a note, link, or photo in Intake. Your saved ideas and references will appear here automatically.';
    if (sources.length) hint = 'Try another search or change the filters.';
    if (emptyCollection) hint = browserLocalViewer ? 'Add a link here or move a card into this collection.' : 'Drag cards here, use Move in a card’s menu, or save something here with Intake.';
    empty.append(element('p', '', hint));
  }
  if (sources.length && (search.value || activeCategory || $('#core-only').checked || $('#archive-filter').value !== 'active')) {
    const reset = element('button', 'secondary-action', 'Clear search and filters');
    reset.addEventListener('click', () => { search.value = ''; resetBrowseFilters(); }); empty.append(reset);
  }
  cards.hidden = view !== 'cards';
  $('#table-wrap').hidden = view !== 'table';
  $('#cards-view').setAttribute('aria-pressed', String(view === 'cards'));
  $('#table-view').setAttribute('aria-pressed', String(view === 'table'));
  for (const [index, source] of visible.entries()) {
    if (view === 'table') rows.append(renderRow(source));
    else {
      const card = activeVideo?.id === source.id ? activeVideo.card : renderCard(source);
      if (cards.children[index] !== card) cards.insertBefore(card, cards.children[index] || null);
    }
  }
  if (view === 'cards') for (const card of cards.children) cardLayoutObserver.observe(card);
}

const imageDialog = $('#image-viewer');
const imageStage = $('#image-stage');
const viewerImage = $('#viewer-image');
let viewerSource = null, viewerIndex = 0, imageScale = 1, imageOffset = {x: 0, y: 0}, imageFits = true;
const imagePointers = new Map();
let imageGesture = null;
function imageFitScale() {
  if (!viewerImage.naturalWidth) return 1;
  return Math.min(1, Math.max(1, imageStage.clientWidth - 36) / viewerImage.naturalWidth, Math.max(1, imageStage.clientHeight - 36) / viewerImage.naturalHeight);
}
function clampImageOffset() {
  const maxX = Math.max(0, (viewerImage.naturalWidth * imageScale - imageStage.clientWidth) / 2 + 18);
  const maxY = Math.max(0, (viewerImage.naturalHeight * imageScale - imageStage.clientHeight) / 2 + 18);
  imageOffset.x = Math.max(-maxX, Math.min(maxX, imageOffset.x)); imageOffset.y = Math.max(-maxY, Math.min(maxY, imageOffset.y));
}
function drawViewerImage() {
  clampImageOffset();
  viewerImage.style.width = viewerImage.naturalWidth + 'px'; viewerImage.style.height = viewerImage.naturalHeight + 'px';
  viewerImage.style.marginLeft = -viewerImage.naturalWidth / 2 + 'px'; viewerImage.style.marginTop = -viewerImage.naturalHeight / 2 + 'px';
  viewerImage.style.transform = `translate(${imageOffset.x}px, ${imageOffset.y}px) scale(${imageScale})`;
  $('#viewer-scale').textContent = Math.round(imageScale * 100) + '%';
}
function fitViewerImage() { imageScale = imageFitScale(); imageOffset = {x: 0, y: 0}; imageFits = true; drawViewerImage(); }
function zoomViewerImage(scale, clientX = null, clientY = null) {
  if (!viewerImage.naturalWidth) return;
  const bounds = imageStage.getBoundingClientRect();
  const point = {x: clientX === null ? 0 : clientX - bounds.left - bounds.width / 2, y: clientY === null ? 0 : clientY - bounds.top - bounds.height / 2};
  const next = Math.max(Math.min(.05, imageFitScale() / 2), Math.min(8, scale)), ratio = next / imageScale;
  imageOffset = {x: point.x - (point.x - imageOffset.x) * ratio, y: point.y - (point.y - imageOffset.y) * ratio};
  imageScale = next; imageFits = false; drawViewerImage();
}
function showViewerImage(index) {
  viewerIndex = index; imagePointers.clear(); imageGesture = null; imageStage.classList.remove('panning');
  const attachment = viewerSource.images[index];
  viewerImage.hidden = true; viewerImage.alt = viewerSource.title;
  $('#viewer-caption').textContent = `${viewerSource.images.length > 1 ? `${index + 1} / ${viewerSource.images.length} · ` : ''}${viewerSource.title}`;
  $('#viewer-original').href = localPath(attachment.path);
  const copy = contextCopyButton({...viewerSource, url: null, images: [attachment]}); copy.textContent = 'Copy image'; $('#viewer-copy-slot').replaceChildren(copy);
  $('#viewer-previous').hidden = $('#viewer-next').hidden = viewerSource.images.length < 2;
  $('#viewer-previous').disabled = index === 0; $('#viewer-next').disabled = index === viewerSource.images.length - 1;
  viewerImage.onload = () => { viewerImage.hidden = false; fitViewerImage(); };
  viewerImage.onerror = () => { $('#viewer-caption').textContent = 'This image could not be loaded. Open the original file to check it.'; };
  viewerImage.src = localPath(attachment.path);
}
function openImageViewer(source, index = 0) {
  if (!source.images?.length) return;
  viewerSource = source;
  if (!imageDialog.open) imageDialog.showModal();
  showViewerImage(index); imageStage.focus({preventScroll: true});
}
$('#viewer-close').addEventListener('click', () => imageDialog.close());
imageDialog.addEventListener('close', () => { imagePointers.clear(); imageGesture = null; viewerSource = null; viewerImage.onload = null; viewerImage.removeAttribute('src'); imageStage.classList.remove('panning'); });
$('#viewer-zoom-in').addEventListener('click', () => zoomViewerImage(imageScale * 1.35));
$('#viewer-zoom-out').addEventListener('click', () => zoomViewerImage(imageScale / 1.35));
$('#viewer-fit').addEventListener('click', fitViewerImage);
$('#viewer-actual').addEventListener('click', () => zoomViewerImage(1));
$('#viewer-previous').addEventListener('click', () => { if (viewerSource && viewerIndex > 0) showViewerImage(viewerIndex - 1); });
$('#viewer-next').addEventListener('click', () => { if (viewerSource && viewerIndex < viewerSource.images.length - 1) showViewerImage(viewerIndex + 1); });
imageStage.addEventListener('wheel', event => { event.preventDefault(); zoomViewerImage(imageScale * Math.exp(-event.deltaY * .002), event.clientX, event.clientY); }, {passive: false});
imageStage.addEventListener('dblclick', event => { if (imageFits) zoomViewerImage(Math.max(1, imageScale * 2), event.clientX, event.clientY); else fitViewerImage(); });
function startImageGesture() {
  const points = [...imagePointers.values()];
  if (points.length === 1) imageGesture = {kind: 'pan', point: points[0], offset: {...imageOffset}};
  else if (points.length >= 2) imageGesture = {kind: 'pinch', distance: Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)), midpoint: {x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2}, offset: {...imageOffset}, scale: imageScale};
  else imageGesture = null;
}
imageStage.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !viewerImage.naturalWidth) return;
  imagePointers.set(event.pointerId, {x: event.clientX, y: event.clientY}); imageStage.setPointerCapture(event.pointerId); imageStage.classList.add('panning'); startImageGesture(); event.preventDefault();
});
imageStage.addEventListener('pointermove', event => {
  if (!imagePointers.has(event.pointerId) || !imageGesture) return;
  imagePointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
  const points = [...imagePointers.values()];
  if (imageGesture.kind === 'pinch' && points.length >= 2) {
    const bounds = imageStage.getBoundingClientRect(), center = {x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2};
    const mid = {x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2};
    imageScale = Math.max(Math.min(.05, imageFitScale() / 2), Math.min(8, imageGesture.scale * Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) / imageGesture.distance));
    const ratio = imageScale / imageGesture.scale;
    imageOffset = {x: mid.x - center.x - (imageGesture.midpoint.x - center.x - imageGesture.offset.x) * ratio, y: mid.y - center.y - (imageGesture.midpoint.y - center.y - imageGesture.offset.y) * ratio};
  } else imageOffset = {x: imageGesture.offset.x + event.clientX - imageGesture.point.x, y: imageGesture.offset.y + event.clientY - imageGesture.point.y};
  imageFits = false; drawViewerImage();
});
function finishImagePointer(event) {
  imagePointers.delete(event.pointerId);
  if (imageStage.hasPointerCapture(event.pointerId)) imageStage.releasePointerCapture(event.pointerId);
  if (!imagePointers.size) imageStage.classList.remove('panning'); startImageGesture();
}
imageStage.addEventListener('pointerup', finishImagePointer); imageStage.addEventListener('pointercancel', finishImagePointer);
imageStage.addEventListener('keydown', event => {
  if (['+', '='].includes(event.key)) zoomViewerImage(imageScale * 1.35);
  else if (event.key === '-') zoomViewerImage(imageScale / 1.35);
  else if (event.key === '0' || event.key.toLowerCase() === 'f') fitViewerImage();
  else if (event.key.startsWith('Arrow')) {
    const move = event.shiftKey ? 100 : 40;
    if (event.key === 'ArrowLeft') imageOffset.x += move;
    if (event.key === 'ArrowRight') imageOffset.x -= move;
    if (event.key === 'ArrowUp') imageOffset.y += move;
    if (event.key === 'ArrowDown') imageOffset.y -= move;
    imageFits = false; drawViewerImage();
  } else return;
  event.preventDefault();
});
const viewerLayoutObserver = new ResizeObserver(() => { if (imageDialog.open && viewerImage.naturalWidth) { if (imageFits) fitViewerImage(); else drawViewerImage(); } }); viewerLayoutObserver.observe(imageStage);
const viewerToolbarObserver = new ResizeObserver(() => { imageStage.style.top = $('#image-viewer .viewer-toolbar').offsetHeight + 32 + 'px'; }); viewerToolbarObserver.observe($('#image-viewer .viewer-toolbar'));

async function openEditor(source, mode = 'overview') {
  const transition = ++editorTransition;
  if (editing && editing.id !== source.id && !await saveDraft(editing)) return false;
  if (transition !== editorTransition) return false;
  if (editing?.id !== source.id) { editor.scrollTop = 0; $('#entry-media').replaceChildren(); $('#entry-media').hidden = true; }
  editing = source;
  showOverview(source);
  setPanelMode(mode);
  const data = drafts.get(source.id) || itemData(source);
  if (data.body === undefined) data.body = (source.fullText || '') + (data.notes ? '\n\n## Recovered unsaved notes\n' + data.notes : '');
  editorRevision = data.revision;
  for (const [key, input] of Object.entries(fields)) {
    if (key === 'collections') renderCollectionChecks(data.collections || itemCollections(source));
    else if (key === 'core') input.checked = Boolean(data[key]);
    else input.value = data[key] || '';
  }
  $('#entry-link').href = localPath(source.path);
  $('#editor-title').textContent = source.title;
  updatePanelCollection(source);
  $('#save-status').textContent = drafts.has(source.id) ? 'Unsaved changes' : 'Autosave on';
  editor.hidden = false;
  document.body.classList.add('editor-open');
  syncWorkspaceLayout();
  return true;
}

function captureDraft() {
  if (!editing) return;
  const data = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, key === 'core' ? input.checked : key === 'collections' ? checkedCollections() : input.value]));
  data.revision = drafts.get(editing.id)?.revision ?? editorRevision;
  drafts.set(editing.id, data);
  persistDrafts();
  $('#save-status').textContent = 'Waiting to save…';
  clearTimeout(autosaveTimer);
  const source = editing;
  autosaveTimer = setTimeout(() => saveDraft(source), 500);
}

async function saveDraft(source) {
  clearTimeout(autosaveTimer);
  while (saveInFlight) {
    if (!await saveInFlight) return false;
  }
  const draft = drafts.get(source.id);
  if (!draft) return true;
  saving = true;
  $('#save-item').disabled = true;
  if (editing?.id === source.id) $('#save-status').textContent = 'Saving…';
  const request = (async () => {
    try {
      const response = await libraryFetch(`/api/items/${source.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save. Your draft is still here.');
      annotations[source.id] = result.item;
      if (result.source) sources = sources.map(value => value.id === source.id ? result.source : value);
      if (drafts.get(source.id) === draft) drafts.delete(source.id);
      else drafts.get(source.id).revision = result.item.revision;
      if (editing?.id === source.id) editorRevision = result.item.revision;
      persistDrafts();
      if (editing?.id === source.id) $('#save-status').textContent = drafts.has(source.id) ? 'Waiting to save…' : 'Saved';
      actionStatus(result.warning || '');
      updateFilters();
      render();
      return true;
    } catch (error) {
      if (editing?.id === source.id) $('#save-status').textContent = `${error.message} Copy your draft before loading the latest entry, or retry Save now.`;
      actionStatus('Changes are not saved yet. Your draft is retained; use Copy draft if you need to merge changes.');
      return false;
    }
  })();
  saveInFlight = request;
  const success = await request;
  if (saveInFlight === request) {
    saveInFlight = null;
    saving = false;
    $('#save-item').disabled = false;
  }
  if (!success) return false;
  return drafts.has(source.id) ? saveDraft(source) : true;
}

async function closeEditor() {
  const transition = ++editorTransition;
  if (editing && !await saveDraft(editing)) return false;
  if (transition !== editorTransition) return false;
  editor.hidden = true;
  document.body.classList.remove('editor-open');
  syncWorkspaceLayout();
  editing = null;
  $('#entry-media').replaceChildren();
  $('#entry-media').hidden = true;
  return true;
}

for (const [key, , label] of categories) {
  const option = element('option', '', label);
  option.value = key;
  fields.category.append(option);
  $('#capture-category').append(option.cloneNode(true));
}
for (const input of Object.values(fields)) input.addEventListener('input', captureDraft);
$('#edit-collection').addEventListener('input', captureDraft);
$('#close-editor').addEventListener('click', closeEditor);
$('#overview-tab').addEventListener('click', () => { if (editing) { showOverview(sources.find(s => s.id === editing.id) || editing); setPanelMode('overview'); } });
$('#edit-tab').addEventListener('click', () => setPanelMode('edit'));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !editor.hidden && !document.querySelector('dialog[open]')) closeEditor(); });
$('#edit-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!editing) return;
  captureDraft();
  await saveDraft(editing);
});

const divider = $('#editor-divider');
let preferredEditorWidth = 400;
try { preferredEditorWidth = Number(localStorage.getItem('personal-library-editor-width')) || 400; } catch {}
function setEditorWidth(width, persist = true) {
  if (persist) {
    preferredEditorWidth = width;
    try { localStorage.setItem('personal-library-editor-width', String(width)); } catch {}
  }
  const maximum = window.innerWidth <= 700 ? window.innerWidth : Math.max(320, window.innerWidth - 440);
  const value = Math.min(maximum, Math.max(300, width));
  document.documentElement.style.setProperty('--editor-width', `${value}px`);
  divider.setAttribute('aria-valuenow', String(Math.round(value))); divider.setAttribute('aria-valuemin', String(Math.min(300, maximum))); divider.setAttribute('aria-valuemax', String(maximum));
  syncWorkspaceLayout();
}
let preferredNavigationWidth = 280;
try { preferredNavigationWidth = Number(localStorage.getItem('personal-library-navigation-width')) || 280; } catch {}
const navigationDivider = $('#navigation-divider');
const landscapePhone = window.matchMedia('(orientation: landscape) and (max-height: 520px) and (max-width: 1024px)');
function syncWorkspaceLayout() {
  const available = document.querySelector('.library-layout').getBoundingClientRect().width;
  document.body.classList.toggle('landscape-navigation', landscapePhone.matches);
  document.body.classList.toggle('compact-navigation', !landscapePhone.matches && available <= 760);
  const maximum = Math.max(220, Math.min(600, available - 400));
  const actual = Math.max(220, Math.min(maximum, preferredNavigationWidth));
  document.documentElement.style.setProperty('--navigation-width', `${actual}px`);
  if (arrangeCollectionColumns()) revealSelectedCollection();
  navigationDivider.setAttribute('aria-valuenow', String(Math.round(actual))); navigationDivider.setAttribute('aria-valuemin', '220'); navigationDivider.setAttribute('aria-valuemax', String(Math.round(maximum)));
}
function setupMobileNavigation({sidebar, toggle, isCompact, isOpen, open, close}) {
  const body = document.body;
  const slot = $('#navigation-slot');
  const pullSlop = 6;
  const touchPullToOpen = 46;
  const wheelPullToOpen = 30;
  const swipeToClose = 52;
  const dismissTravel = swipeToClose + 20;
  const scrollToClose = 44;
  const wheelFreshGap = 190;
  const wheelPullIdle = 1400;
  const wheelSettleIdle = 115;
  let panelHeight = 0;
  let gesture = null;
  let lastWheelAt = -Infinity;
  let wheelGesture = null;
  let wheelReset = 0;
  let edgeDragPointer = null;
  let pendingTopPointer = null;
  let previousScroll = Math.max(0, window.scrollY);
  let downDistance = 0;

  const atTop = () => window.scrollY <= 2;
  const updateTopHint = () => body.classList.toggle('navigation-at-top', isCompact() && window.scrollY <= 0);
  const skipGesture = (target, closing) => sidebar.contains(target) || toggle.contains(target)
    || target.closest('#editor, .drag-handle, textarea, [contenteditable]')
    || (!closing && target.closest('input, select'))
    || document.querySelector('dialog[open]');

  function measureDrawer() {
    panelHeight = sidebar.getBoundingClientRect().height;
    slot.style.setProperty('--navigation-panel-height', `${panelHeight}px`);
  }
  const panelObserver = new ResizeObserver(measureDrawer);

  function previewPull(distance) {
    body.classList.toggle('navigation-pulling', distance > 0);
    if (distance) slot.style.setProperty('--navigation-pull', `${distance}px`);
    else slot.style.removeProperty('--navigation-pull');
  }
  function settlePull() {
    // Commit the last pull height as the starting point of the CSS transition.
    void slot.offsetHeight;
    open();
  }
  function resetTouch() {
    gesture = null;
    if (!wheelGesture) previewPull(0);
  }
  function resetWheel() {
    clearTimeout(wheelReset);
    wheelReset = 0;
    wheelGesture = null;
    if (!gesture) previewPull(0);
  }
  function resetPull() {
    resetTouch();
    resetWheel();
  }
  function dismissFromScroll(movement) {
    if (!movement.dismissed) {
      movement.dismissed = true;
      close();
    }
    // A short swipe closes the drawer. Continuing the same swipe then scrolls the items.
    const top = Math.max(0, movement.distance - dismissTravel);
    if (window.scrollY !== top) window.scrollTo({top, behavior: 'instant'});
  }

  document.addEventListener('touchstart', event => {
    resetPull();
    const closing = isOpen();
    if (!isCompact() || event.touches.length !== 1 || skipGesture(event.target, closing)) return;
    // Reaching the top with a normal scroll does not arm a pull.
    if (!closing && !atTop()) return;
    const {clientX, clientY} = event.touches[0];
    gesture = {x: clientX, y: clientY, closing, distance: 0};
  }, {passive: true});

  document.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (!isCompact() || event.touches.length !== 1 || (!gesture.dismissed && gesture.closing !== isOpen())) {
      resetTouch();
      return;
    }
    const {clientX, clientY} = event.touches[0];
    const dx = clientX - gesture.x;
    const dy = clientY - gesture.y;
    if (gesture.closing) {
      if (!gesture.dismissed && -dy <= Math.abs(dx)) return;
      if (event.cancelable) event.preventDefault();
      gesture.distance = Math.max(0, -dy);
      if (gesture.dismissed || gesture.distance >= swipeToClose) dismissFromScroll(gesture);
      return;
    }
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      resetTouch();
      return;
    }
    if (dy < -pullSlop || !atTop()) {
      resetTouch();
      return;
    }
    gesture.distance = dy > Math.max(pullSlop, Math.abs(dx)) ? dy : 0;
    if (gesture.distance && event.cancelable) event.preventDefault();
    previewPull(gesture.distance);
  }, {passive: false});

  document.addEventListener('touchend', () => {
    const ready = isCompact() && !gesture?.closing && gesture?.distance >= touchPullToOpen;
    if (ready) settlePull();
    resetTouch();
  }, {passive: true});
  document.addEventListener('touchcancel', resetTouch, {passive: true});

  function finishWheelPull() {
    if (isCompact() && !isOpen() && atTop() && !wheelGesture?.closing
      && wheelGesture?.distance >= wheelPullToOpen && !document.querySelector('dialog[open]')) settlePull();
    resetWheel();
  }
  function trackWheel(event) {
    const now = performance.now();
    const fresh = now - lastWheelAt >= wheelFreshGap;
    lastWheelAt = now;
    const {deltaMode, deltaX, deltaY} = event;
    if (!isCompact() || gesture || draggingItem || event.ctrlKey || event.shiftKey
      || Math.abs(deltaX) >= Math.abs(deltaY) || skipGesture(event.target, isOpen() || wheelGesture?.dismissed)) {
      if (wheelGesture) resetWheel();
      return;
    }
    if (wheelGesture?.dismissed && (fresh || deltaY < 0)) resetWheel();
    const closing = isOpen() || wheelGesture?.dismissed === true;
    if (wheelGesture && wheelGesture.closing !== closing) resetWheel();
    // Inertial events that started below the top still belong to that scroll.
    // An eligible pull can build up over much longer gaps between small deltas.
    if (!wheelGesture) {
      if (closing ? deltaY <= 0 : !fresh || !atTop() || deltaY >= 0) return;
      wheelGesture = {closing, distance: 0};
    }
    if (closing ? deltaY <= 0 : !atTop() || deltaY >= 0) {
      resetWheel();
      return;
    }
    if (event.cancelable) event.preventDefault();
    const scale = deltaMode === 1 ? 16 : deltaMode === 2 ? window.innerHeight : 1;
    const distance = Math.abs(deltaY) * scale;
    wheelGesture.distance += distance;
    if (closing) {
      if (wheelGesture.distance >= swipeToClose) dismissFromScroll(wheelGesture);
      clearTimeout(wheelReset);
      wheelReset = setTimeout(resetWheel, wheelFreshGap);
      return;
    }
    previewPull(wheelGesture.distance);
    // A strong single wheel step already expresses intent. Smaller steps
    // keep tracking the pull until that gesture pauses.
    if (distance >= wheelPullToOpen || (panelHeight > 0 && wheelGesture.distance >= panelHeight)) {
      finishWheelPull();
      return;
    }
    const ready = wheelGesture.distance >= wheelPullToOpen;
    clearTimeout(wheelReset);
    wheelReset = setTimeout(finishWheelPull, ready ? wheelSettleIdle : wheelPullIdle);
  }
  window.addEventListener('blur', () => {
    resetPull();
    pendingTopPointer = null;
    if (edgeDragPointer !== null) {
      edgeDragPointer = null;
      close();
    }
  });
  window.addEventListener('resize', () => {
    resetPull();
    pendingTopPointer = null;
    updateTopHint();
  });

  function openForDrag(pointerId) {
    pendingTopPointer = null;
    edgeDragPointer = pointerId;
    open();
  }
  function revealPendingTopDrag() {
    if (pendingTopPointer !== null && draggingItem && isCompact() && !isOpen() && atTop()) {
      openForDrag(pendingTopPointer);
    }
  }

  // A held card can reveal its collection drop targets without a second finger.
  document.addEventListener('pointermove', event => {
    if (!event.isPrimary || !draggingItem || isOpen()) return;
    if (isCompact()) {
      // Card dragging already scrolls the document when held in this edge zone.
      pendingTopPointer = event.clientY < 30 ? event.pointerId : null;
      revealPendingTopDrag();
    } else if (event.pointerType === 'touch' && body.classList.contains('landscape-navigation') && event.clientX <= 24) {
      openForDrag(event.pointerId);
    }
  }, {passive: true});
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    document.addEventListener(event, point => {
      if (point.pointerId === pendingTopPointer) pendingTopPointer = null;
      if (point.pointerId !== edgeDragPointer) return;
      edgeDragPointer = null;
      close();
    }, {passive: true});
  }

  window.addEventListener('scroll', () => {
    updateTopHint();
    const current = Math.max(0, window.scrollY);
    const delta = current - previousScroll;
    previousScroll = current;
    revealPendingTopDrag();
    // A collection column handles its own scrolling. Only the page can dismiss here.
    downDistance = isCompact() && isOpen() && !draggingItem && delta > 0 ? downDistance + delta : 0;
    if (downDistance >= scrollToClose) {
      downDistance = 0;
      close();
    }
  }, {passive: true});

  function refreshCompactInput() {
    updateTopHint();
    // Read scrollY before the browser applies the wheel delta. Keep the
    // non-passive listener off desktop so its scrolling stays independent.
    if (isCompact()) {
      measureDrawer();
      panelObserver.observe(sidebar);
      document.addEventListener('wheel', trackWheel, {passive: false});
    } else {
      panelObserver.disconnect();
      slot.style.removeProperty('--navigation-panel-height');
      document.removeEventListener('wheel', trackWheel);
      lastWheelAt = -Infinity;
      resetPull();
    }
  }
  refreshCompactInput();
  return refreshCompactInput;
}
function setNavigationWidth(width) {
  const available = document.querySelector('.library-layout').getBoundingClientRect().width;
  preferredNavigationWidth = Math.max(220, Math.min(600, available - 400, width));
  try { localStorage.setItem('personal-library-navigation-width', String(preferredNavigationWidth)); } catch {}
  syncWorkspaceLayout();
}
function setupNavigationDrawer() {
  const body = document.body;
  const sidebar = $('#library-sidebar');
  const toggle = $('#navigation-toggle');
  const library = browserLocalViewer && new URLSearchParams(location.search).get('library');
  const pinKey = 'personal-library-navigation-pinned' + (library ? ':' + library.toLowerCase() : '');
  const edge = 18;
  let pinned = false;
  try { pinned = localStorage.getItem(pinKey) === 'true'; } catch {}
  let mode = 'closed';
  let hideTimer = 0;
  let suppressEdge = false;
  let pointerBeyondLeft = false;
  const isCompact = () => body.classList.contains('compact-navigation');
  const layoutKind = () => isCompact() ? 'compact' : landscapePhone.matches ? 'landscape' : 'desktop';
  const isOpen = () => mode !== 'closed';

  function cancelHide() {
    clearTimeout(hideTimer);
    hideTimer = 0;
  }
  function show(nextMode) {
    cancelHide();
    mode = nextMode;
    const expanded = isOpen();
    if (!expanded && sidebar.contains(document.activeElement)) toggle.focus({preventScroll: true});
    sidebar.inert = !expanded;
    body.dataset.navigationDrawer = mode;
    toggle.setAttribute('aria-expanded', String(expanded));
    const action = {
      pinned: 'Unpin library navigation',
      open: 'Hide library navigation',
      hover: 'Pin library navigation',
      closed: 'Show library navigation'
    }[mode];
    toggle.setAttribute('aria-label', action);
    toggle.title = action;
    if (!expanded) sidebar.querySelectorAll('.collection-menu[open]').forEach(menu => { menu.open = false; });
  }
  function setPinned(value) {
    pinned = value;
    try { localStorage.setItem(pinKey, String(value)); } catch {}
    suppressEdge = !value;
    show(value ? 'pinned' : 'closed');
  }
  function close() {
    if (mode === 'pinned') return;
    suppressEdge = true;
    show('closed');
  }
  function scheduleHide() {
    if (mode !== 'hover' || hideTimer) return;
    hideTimer = setTimeout(() => {
      hideTimer = 0;
      if (!draggingItem && !draggingCollection && !body.classList.contains('resizing-navigation')
        && !sidebar.querySelector(':focus-visible') && !document.querySelector('dialog[open]')) show('closed');
    }, 190);
  }
  function revealFromEdge(event) {
    if (mode === 'closed' && !suppressEdge && (!event.buttons || draggingItem)
      && !document.querySelector('dialog[open]')) show('hover');
  }
  function leaveViewport(event) {
    if (isCompact() || event.pointerType !== 'mouse') return;
    pointerBeyondLeft = event.clientX <= edge && event.clientY >= 0 && event.clientY < window.innerHeight;
    if (pointerBeyondLeft) {
      cancelHide();
      revealFromEdge(event);
    } else scheduleHide();
  }
  function trackPointer(event) {
    if (isCompact() || event.pointerType !== 'mouse') return;
    const {clientX, clientY} = event;
    if (clientX < 0 || clientX >= window.innerWidth || clientY < 0 || clientY >= window.innerHeight) {
      leaveViewport(event);
      return;
    }
    pointerBeyondLeft = false;
    if (clientX > edge + 6) suppressEdge = false;
    if (mode === 'hover') {
      if (clientX <= sidebar.offsetWidth + 8 || sidebar.contains(event.target) || toggle.contains(event.target)) {
        cancelHide();
      } else scheduleHide();
    } else if (clientX <= edge) revealFromEdge(event);
  }

  document.addEventListener('pointermove', trackPointer, {passive: true});
  document.addEventListener('pointerup', trackPointer, {passive: true});
  document.documentElement.addEventListener('pointerenter', trackPointer);
  document.documentElement.addEventListener('pointerleave', leaveViewport);
  window.addEventListener('blur', () => { if (!pointerBeyondLeft) scheduleHide(); });
  toggle.addEventListener('click', () => {
    if (layoutKind() === 'desktop') {
      setPinned(mode !== 'pinned');
      return;
    }
    if (mode === 'open') {
      close();
      return;
    }
    if (isCompact()) window.scrollTo({top: 0, behavior: 'instant'});
    show('open');
  });
  document.addEventListener('click', event => {
    if (mode === 'open' && !isCompact() && !sidebar.contains(event.target) && !toggle.contains(event.target)
      && !event.target.closest('[data-skip-click]') && !document.querySelector('dialog[open]')) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isOpen() || cancelCurrentDrag
      || document.querySelector('dialog[open], .collection-menu[open], #browse-options[open], .card-actions-menu[open]')) return;
    if (mode === 'pinned') {
      if (document.activeElement !== toggle && !sidebar.contains(document.activeElement)) return;
      event.stopPropagation();
      setPinned(false);
      return;
    }
    event.stopPropagation();
    close();
  }, true);
  const refreshMobileNavigation = setupMobileNavigation({sidebar, toggle, isCompact, isOpen, open: () => show('open'), close});
  let currentLayout = layoutKind();
  show(currentLayout === 'desktop' && pinned ? 'pinned' : 'closed');
  requestAnimationFrame(() => body.classList.add('navigation-ready'));
  function refreshDrawerLayout() {
    const nextLayout = layoutKind();
    if (nextLayout === currentLayout) return;
    currentLayout = nextLayout;
    suppressEdge = false;
    show(currentLayout === 'desktop' && pinned ? 'pinned' : 'closed');
    refreshMobileNavigation();
  }
  new ResizeObserver(refreshDrawerLayout).observe($('.library-layout'), {box: 'border-box'});
  landscapePhone.addEventListener('change', refreshDrawerLayout);
}
setEditorWidth(preferredEditorWidth, false);
let observedWorkspaceWidth;
const workspaceObserver = new ResizeObserver(([entry]) => {
  const width = entry.borderBoxSize?.[0]?.inlineSize ?? entry.target.getBoundingClientRect().width;
  if (width === observedWorkspaceWidth) return;
  observedWorkspaceWidth = width;
  syncWorkspaceLayout();
});
workspaceObserver.observe(document.querySelector('.library-layout'), {box: 'border-box'});
landscapePhone.addEventListener('change', syncWorkspaceLayout);
setupNavigationDrawer();
let observedMainWidth;
const mainLayoutObserver = new ResizeObserver(([entry]) => {
  const {width} = entry.contentRect;
  if (width === observedMainWidth) return;
  observedMainWidth = width;
  entry.target.classList.toggle('narrow-content', width < 600);
  scheduleTitleFit();
});
mainLayoutObserver.observe(document.querySelector('main'));
function finishPanelResize(event, handle, className) {
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  document.body.classList.remove(className);
}
navigationDivider.addEventListener('pointerdown', event => { navigationDivider.setPointerCapture(event.pointerId); document.body.classList.add('resizing-navigation'); event.preventDefault(); });
navigationDivider.addEventListener('pointermove', event => { if (navigationDivider.hasPointerCapture(event.pointerId)) setNavigationWidth(event.clientX - $('#library-sidebar').getBoundingClientRect().left); });
navigationDivider.addEventListener('pointerup', event => finishPanelResize(event, navigationDivider, 'resizing-navigation'));
navigationDivider.addEventListener('pointercancel', event => finishPanelResize(event, navigationDivider, 'resizing-navigation'));
navigationDivider.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); setNavigationWidth($('#library-sidebar').getBoundingClientRect().width + (event.key === 'ArrowRight' ? 20 : -20)); });
divider.addEventListener('pointerdown', event => { divider.setPointerCapture(event.pointerId); document.body.classList.add('resizing-editor'); event.preventDefault(); });
divider.addEventListener('pointermove', event => { if (divider.hasPointerCapture(event.pointerId)) setEditorWidth(editor.getBoundingClientRect().right - event.clientX); });
divider.addEventListener('pointerup', event => finishPanelResize(event, divider, 'resizing-editor'));
divider.addEventListener('pointercancel', event => finishPanelResize(event, divider, 'resizing-editor'));
divider.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); setEditorWidth(editor.getBoundingClientRect().width + (event.key === 'ArrowLeft' ? 20 : -20)); });
window.addEventListener('resize', () => setEditorWidth(preferredEditorWidth, false));
window.addEventListener('beforeunload', event => {
  if (drafts.size || saving || pendingArchives.size || pendingImpacts.size) { event.preventDefault(); event.returnValue = ''; }
});
search.addEventListener('input', render);
$('#collection-filter').addEventListener('change', render);
$('#core-only').addEventListener('change', render);
$('#sort-by').addEventListener('change', () => {
  try { localStorage.setItem('personal-library-sort', $('#sort-by').value); } catch {}
  render();
});
try {
  const sort = localStorage.getItem('personal-library-sort');
  if (['newest', 'oldest', 'az', 'za', 'category', 'impact-high', 'impact-low', 'core', 'updated'].includes(sort)) $('#sort-by').value = sort;
} catch {}
$('#archive-filter').addEventListener('change', event => {
  const mode = event.currentTarget.value;
  if (mode === 'trash') showTrash(true);
  else if (trashReturn) showTrash(false, mode);
  else { updateFilters(); render(); actionStatus(''); }
});
function showTrash(show, returnMode) {
  const archive = $('#archive-filter');
  const selected = $('#collection-filter');
  const core = $('#core-only');
  if (show) {
    trashReturn = {collection: selected.value, search: search.value, category: activeCategory,
                   core: core.checked, mode: archive.value === 'trash' ? 'active' : archive.value};
    selected.value = '';
    search.value = '';
    activeCategory = '';
    core.checked = false;
    archive.value = 'trash';
  } else {
    if (trashReturn) {
      selected.value = trashReturn.collection;
      search.value = trashReturn.search;
      activeCategory = trashReturn.category;
      core.checked = trashReturn.core;
    }
    archive.value = returnMode || trashReturn?.mode || 'active';
    trashReturn = null;
  }
  updateFilters(); render(); actionStatus('');
}
$('#trash-back').addEventListener('click', () => showTrash(false));
function resetBrowseFilters() {
  if (trashReturn) {
    $('#collection-filter').value = trashReturn.collection;
    trashReturn = null;
  }
  activeCategory = ''; $('#core-only').checked = false; $('#archive-filter').value = 'active'; updateFilters(); render();
}
$('#clear-filters').addEventListener('click', resetBrowseFilters);
$('#cards-view').addEventListener('click', () => { view = 'cards'; saveViewPreference(); render(); });
$('#table-view').addEventListener('click', () => { view = 'table'; saveViewPreference(); render(); });
$('#card-size').addEventListener('change', () => { cardSize = $('#card-size').value; saveViewPreference(); render(); });
function persistDrafts() {
  if (!libraryId) return;
  try { localStorage.setItem(`personal-library-drafts-${libraryId}`, JSON.stringify([...drafts])); }
  catch { actionStatus('Draft backup is unavailable in this browser. Keep this tab open or use Copy draft.'); }
}

const captureDialog = $('#capture-dialog');
const captureForm = $('#capture-form');
const captureStatus = $('#capture-status');
const captureCollection = $('#capture-collection');
const captureCollectionButton = $('#capture-collection-button');
const captureCollectionOptions = $('#capture-collection-options');
let pendingCapture = null;
let captureSaving = false;
let captureReading = false;
let captureDestinationChanged = false;

function savePendingCapture(payload) {
  pendingCapture = payload;
  try {
    const key = `personal-library-capture-${libraryId}`;
    if (payload) sessionStorage.setItem(key, JSON.stringify(payload));
    else sessionStorage.removeItem(key);
  } catch {}
}

function showCaptureRetry() {
  const playlist = !pendingCapture && isYouTubePlaylist(captureForm.elements.url.value);
  $('#capture-fields').disabled = Boolean(pendingCapture);
  $('#capture-details').hidden = playlist;
  $('#capture-title').textContent = pendingCapture && !pendingCapture.url ? 'Save note' : 'Save link';
  $('#capture-save').textContent = pendingCapture ? 'Retry save' : playlist ? 'Import videos' : 'Save link';
}

function updateCaptureButtons() {
  $('#capture-open').disabled = !libraryId || captureSaving || captureReading;
  $('#capture-paste').disabled = !libraryId || captureSaving;
}

function sizeCaptureDialog() {
  if (window.visualViewport) captureDialog.style.setProperty('--capture-viewport-height', `${window.visualViewport.height}px`);
}
window.visualViewport?.addEventListener('resize', sizeCaptureDialog);

function restorePendingCapture() {
  if (!pendingCapture) {
    try { pendingCapture = JSON.parse(sessionStorage.getItem(`personal-library-capture-${libraryId}`)); } catch {}
  }
}

function captureLink(value) {
  const text = value.trim();
  if (text.length > 8192 || !/^https?:\/\/[^/?#]/i.test(text) || /[\s\x00-\x1f\x7f<>\\]/.test(text)) return null;
  const url = webLink(text);
  return url?.hostname && !url.username && !url.password ? inntakeLinkCleanup.cleanUrl(text) : null;
}

function isYouTubePlaylist(value) {
  const url = webLink(value.trim());
  return Boolean(url && /^(?:(?:www|m|music)\.)?youtube\.com$/.test(url.hostname) && /^\/playlist\/?$/.test(url.pathname));
}

function clipboardLink(text) {
  const urls = new Set(text.trim().split(/\s+/).map(part => captureLink(part.replace(/^<([^<>]+)>$/, '$1'))).filter(Boolean));
  return urls.size === 1 ? urls.values().next().value : null;
}

search.addEventListener('paste', event => {
  if (search.selectionStart !== 0 || search.selectionEnd !== search.value.length) return;
  const text = event.clipboardData?.getData('text/plain') || event.clipboardData?.getData('text/uri-list') || '';
  const url = clipboardLink(text);
  if (!url) return;
  event.preventDefault();
  search.value = url;
  render();
});

function captureCollectionLabel(name) {
  return [collectionIconNode(name, name ? undefined : 'icon:grid'), element('span', 'capture-choice-name', name ? collectionPath(name).join(' / ') : 'No collection')];
}

function selectCaptureCollection(name) {
  captureCollection.value = name;
  $('#capture-collection-value').replaceChildren(...captureCollectionLabel(name));
  for (const option of captureCollectionOptions.children) option.setAttribute('aria-selected', String(option.dataset.collection === name));
}

function renderCaptureCollections(selected) {
  const names = ['', ...sortedCollections()];
  if (selected && !names.includes(selected)) names.push(selected);
  captureCollectionOptions.replaceChildren(...names.map(name => {
    const option = element('button');
    option.type = 'button';
    option.tabIndex = -1;
    option.setAttribute('role', 'option');
    option.dataset.collection = name;
    option.append(...captureCollectionLabel(name));
    return option;
  }));
  selectCaptureCollection(selected || '');
}

function closeCaptureCollectionPicker(restoreFocus = false) {
  if (captureCollectionOptions.hidden) return;
  captureCollectionOptions.hidden = true;
  captureCollectionButton.setAttribute('aria-expanded', 'false');
  if (restoreFocus) captureCollectionButton.focus({preventScroll: true});
}

function focusCaptureCollection(option) {
  option.focus({preventScroll: true});
  const list = captureCollectionOptions.getBoundingClientRect();
  const row = option.getBoundingClientRect();
  if (row.top < list.top) captureCollectionOptions.scrollTop += row.top - list.top;
  if (row.bottom > list.bottom) captureCollectionOptions.scrollTop += row.bottom - list.bottom;
}

let captureTypeahead = '';
let captureTypeaheadAt = 0;
function openCaptureCollectionPicker() {
  captureTypeahead = '';
  captureCollectionOptions.hidden = false;
  captureCollectionButton.setAttribute('aria-expanded', 'true');
  focusCaptureCollection(captureCollectionOptions.querySelector('[aria-selected="true"]') || captureCollectionOptions.firstElementChild);
}

captureCollectionButton.addEventListener('click', () => {
  if (captureCollectionOptions.hidden) openCaptureCollectionPicker();
  else closeCaptureCollectionPicker(true);
});
captureCollectionButton.addEventListener('keydown', event => {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  event.preventDefault();
  openCaptureCollectionPicker();
});
captureCollectionOptions.addEventListener('click', event => {
  const option = event.target.closest('[role="option"]');
  if (!option) return;
  selectCaptureCollection(option.dataset.collection);
  captureDestinationChanged = true;
  closeCaptureCollectionPicker(true);
});
captureCollectionOptions.addEventListener('keydown', event => {
  if (event.key === 'Tab' || event.key === 'Escape') {
    closeCaptureCollectionPicker(true);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
    return;
  }
  const options = [...captureCollectionOptions.children];
  const index = options.indexOf(document.activeElement);
  let target;
  switch (event.key) {
    case 'ArrowDown': target = options[Math.min(index + 1, options.length - 1)]; break;
    case 'ArrowUp': target = options[Math.max(index - 1, 0)]; break;
    case 'Home': target = options[0]; break;
    case 'End': target = options.at(-1); break;
    default: {
      if (event.key.length !== 1 || event.key === ' ' || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLocaleLowerCase();
      captureTypeahead = event.timeStamp - captureTypeaheadAt > 600 ? key : captureTypeahead + key;
      captureTypeaheadAt = event.timeStamp;
      const prefix = [...captureTypeahead].every(char => char === key) ? key : captureTypeahead;
      target = [...options.slice(index + 1), ...options.slice(0, index + 1)]
        .find(option => (option.dataset.collection || 'No collection').toLocaleLowerCase().startsWith(prefix));
    }
  }
  if (target) { event.preventDefault(); focusCaptureCollection(target); }
});
captureDialog.addEventListener('click', event => {
  if (!$('#capture-collection-picker').contains(event.target)) closeCaptureCollectionPicker();
});
captureDialog.addEventListener('close', () => closeCaptureCollectionPicker());

function openCapture({message = '', url = '', collection = $('#collection-filter').value} = {}) {
  restorePendingCapture();
  const selection = pendingCapture ? pendingCapture.collection : captureDestinationChanged ? captureCollection.value : collection;
  renderCaptureCollections(selection);
  if (pendingCapture) {
    for (const key of ['url', 'title', 'note', 'category']) captureForm.elements[key].value = pendingCapture[key] || '';
    $('#capture-details').open = Boolean(pendingCapture.title || pendingCapture.note || pendingCapture.category);
  } else if (url && !captureForm.elements.url.value) {
    captureForm.elements.url.value = url;
  }
  showCaptureRetry();
  captureStatus.textContent = message || (pendingCapture ? 'Retry to confirm the previous save.' : '');
  sizeCaptureDialog();
  if (!captureDialog.open) captureDialog.showModal();
}
function quickCapture(url, collection, searchValue = null) {
  restorePendingCapture();
  if (pendingCapture) { openCapture(); return; }
  if (isYouTubePlaylist(url)) return savePlaylistCapture(url, collection, {quick: true, searchValue});
  return saveItemCapture({id: crypto.randomUUID(), url, collection}, {quick: true, searchValue});
}

$('#capture-open').addEventListener('click', () => {
  if (captureSaving || captureReading) return;
  restorePendingCapture();
  const searchValue = search.value;
  const note = searchValue.trim();
  if (pendingCapture || !note) { openCapture(); return; }
  const collection = $('#collection-filter').value;
  const url = captureLink(note);
  if (url) { quickCapture(url, collection, searchValue); return; }
  if (/^(?:https?:|www\.|[a-z][a-z\d+.-]*:\/\/)/i.test(note)) {
    actionStatus('Enter a valid HTTP or HTTPS link.');
    return;
  }
  saveItemCapture({id: crypto.randomUUID(), note, collection}, {quick: true, searchValue});
});
captureForm.elements.url.addEventListener('input', showCaptureRetry);
captureForm.elements.url.addEventListener('paste', event => {
  const field = captureForm.elements.url;
  if (field.selectionStart !== 0 || field.selectionEnd !== field.value.length) return;
  const url = clipboardLink(event.clipboardData?.getData('text/plain') || '');
  if (!url) return;
  event.preventDefault();
  field.value = url;
  showCaptureRetry();
});
captureForm.elements.url.addEventListener('change', () => {
  const field = captureForm.elements.url;
  const url = captureLink(field.value);
  if (url) field.value = url;
});
$('#capture-close').addEventListener('click', () => { if (!captureSaving) captureDialog.close(); });
captureDialog.addEventListener('cancel', event => { if (captureSaving) event.preventDefault(); });
enableBackdropDismiss(captureDialog, () => !captureSaving);

function beginCapture(message, quick) {
  captureSaving = true;
  captureDialog.setAttribute('closedby', 'none');
  closeCaptureCollectionPicker();
  updateCaptureButtons();
  $('#capture-fields').disabled = true;
  $('#capture-save').disabled = true;
  $('#capture-close').disabled = true;
  captureStatus.textContent = message;
  if (quick) actionStatus(message);
}

function endCapture() {
  captureSaving = false;
  captureDialog.setAttribute('closedby', 'any');
  updateCaptureButtons();
  $('#capture-save').disabled = false;
  $('#capture-close').disabled = false;
  showCaptureRetry();
}

function closeSavedCapture() {
  captureForm.reset();
  captureDestinationChanged = false;
  captureCollection.value = '';
  $('#capture-details').open = false;
  captureDialog.close();
}

async function savePlaylistCapture(url, collection, {quick = false, searchValue = null} = {}) {
  beginCapture('Importing playlist…', quick);
  let result;
  try {
    result = await requestPlaylistChange('import', url, collection);
    if (!quick) closeSavedCapture();
    if (search.value === searchValue) search.value = '';
  } catch (error) {
    if (quick) actionStatus(error.message);
    else captureStatus.textContent = error.message;
  } finally { endCapture(); }
  if (result) {
    await loadCatalog(true);
    successStatus(playlistImportMessage(result, collection));
  }
}

async function saveItemCapture(payload, {quick = false, searchValue = null} = {}) {
  if (captureSaving) return;
  if (payload.url) payload = {...payload, url: captureLink(payload.url) || payload.url};
  const kind = payload.url ? 'Link' : 'Note';
  savePendingCapture(payload);
  beginCapture(`Saving ${kind.toLowerCase()}…`, quick);
  try {
    const response = await libraryFetch('/api/items', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
    const result = await response.json();
    if (!response.ok) {
      if (response.status < 500) savePendingCapture(null);
      throw new Error(result.error || `Could not save this ${kind.toLowerCase()}.`);
    }
    annotations[result.source.id] = result.item;
    sources = [...sources.filter(source => source.id !== result.source.id), result.source];
    savePendingCapture(null);
    if (!quick) closeSavedCapture();
    if (search.value === searchValue) search.value = '';
    updateFilters();
    render();
    if (result.warning) actionStatus(result.warning);
    else successStatus(payload.collection ? `${kind} saved in ${payload.collection}.` : `${kind} saved.`);
    const open = element('button', 'secondary-action', 'Open item');
    open.addEventListener('click', () => { actionStatus(''); openEditor(result.source); });
    $('#action-status').append(document.createTextNode(' '), open);
  } catch (error) {
    const message = pendingCapture ? 'Couldn’t confirm the save. Retry to finish.' : error.message;
    if (quick && !pendingCapture && !payload.url) actionStatus(message);
    else if (quick) {
      actionStatus('');
      openCapture({message, url: payload.url, collection: payload.collection});
    } else captureStatus.textContent = message;
  } finally { endCapture(); }
}

captureForm.addEventListener('submit', event => {
  event.preventDefault();
  if (captureSaving) return;
  if (pendingCapture) {
    const value = pendingCapture.url || pendingCapture.note;
    saveItemCapture(pendingCapture, {searchValue: search.value.trim() === value ? search.value : null});
    return;
  }
  const fields = Object.fromEntries(new FormData(captureForm));
  if (isYouTubePlaylist(fields.url)) savePlaylistCapture(fields.url, fields.collection);
  else saveItemCapture({id: crypto.randomUUID(), ...fields});
});

async function readCaptureImage(file) {
  // Keep large photos practical within browser storage. Preserve animation in GIFs.
  if (browserLocalViewer && typeof createImageBitmap === 'function' && file.size > 600000 && ['image/png','image/jpeg'].includes(file.type)) {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1,Math.round(bitmap.width*scale));
      canvas.height = Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      const compact = canvas.toDataURL('image/webp',.88);
      if (compact.length < file.size*4/3) return compact;
    } finally { bitmap.close(); }
  }
  if (file.size > 12*1024*1024) throw new Error('Choose an image smaller than 12 MB.');
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read this image.'));
    reader.readAsDataURL(file);
  });
}
async function captureImages(files, collection) {
  if (captureSaving) { actionStatus('A save is in progress. Try again in a moment.'); return; }
  beginCapture('Saving image…',true);
  let saved = 0, errorMessage = '';
  try {
    for (const file of files) {
      if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)) throw new Error('Choose a PNG, JPEG, GIF or WebP image.');
      const image = await readCaptureImage(file);
      const response = await libraryFetch('/api/items',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:crypto.randomUUID(),title:(file.name || 'Pasted image').slice(0,200),image,collection})});
      if (!response.ok) throw new Error((await response.json()).error || 'Image save failed.');
      saved++;
    }
  } catch (error) { errorMessage = error.message; }
  finally { endCapture(); }
  if (saved) await loadCatalog(true);
  if (errorMessage) actionStatus((saved ? saved+' saved. ' : '')+errorMessage);
  else successStatus(saved===1 ? 'Image saved.' : saved+' images saved.');
}
function transferredImages(data) {
  return Array.from(data?.files || []).filter(file => file.type.startsWith('image/'));
}
function imageCaptureEnabled() {
  return libraryId && !document.querySelector('dialog[open]') && $('#archive-filter').value !== 'trash';
}
document.addEventListener('paste', event => {
  if (!imageCaptureEnabled() || (event.target !== search && event.target.closest('input,textarea,[contenteditable=true]'))) return;
  const files = transferredImages(event.clipboardData);
  if (!files.length) return;
  event.preventDefault();
  captureImages(files,$('#collection-filter').value);
},true);
document.addEventListener('dragover', event => {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
},true);
document.addEventListener('drop', event => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  if (!imageCaptureEnabled()) return;
  const files = transferredImages(event.dataTransfer);
  if (!files.length) { actionStatus('Drop an image file here.'); return; }
  event.stopPropagation();
  const target = event.target.closest('[data-drop-collection]');
  captureImages(files,target?.dataset.dropCollection ?? $('#collection-filter').value);
},true);

$('#capture-paste').addEventListener('click', async () => {
  if (captureSaving || captureReading) return;
  restorePendingCapture();
  if (pendingCapture) { openCapture(); return; }
  const collection = $('#collection-filter').value;
  captureReading = true;
  let text = '';
  try {
    updateCaptureButtons();
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      const images = [];
      for (const item of items) {
        const type = item.types.find(t => ['image/png','image/jpeg','image/gif','image/webp'].includes(t));
        if (type) images.push(await item.getType(type));
        else if (item.types.includes('text/plain')) text += await (await item.getType('text/plain')).text();
      }
      if (images.length) { await captureImages(images,collection); return; }
    } else text = await navigator.clipboard?.readText() || '';
  } catch {
    // Safari can require a native paste gesture even when a URL is copied.
  } finally {
    captureReading = false;
    updateCaptureButtons();
  }
  if (captureSaving) return;
  const url = clipboardLink(text);
  if (!url) {
    search.focus(); search.select();
    actionStatus('Paste an image here, or paste a link and choose Add.');
    return;
  }
  await quickCapture(url, collection);
});

let requestedItem = browserLocalViewer ? new URLSearchParams(location.search).get('item') : null;
function showSyncState(state) {
  const indicator = $('#sync-indicator');
  const labels = {local:'On device', pending:'Pending sync', syncing:'Syncing…', synced:'Synced', offline:'Offline · on device',
    waiting:'Will retry', conflict:'Review sync', auth:'Reconnect GitHub', paused:'Sync paused', checking:'Checking sync…'};
  const label = labels[state];
  indicator.hidden = !label;
  indicator.dataset.state = state || '';
  if (indicator.textContent !== (label || '')) indicator.textContent = label || '';
}
window.addEventListener('inntake-sync-state', event => showSyncState(event.detail));
async function loadCatalog(manual = false) {
  if (loading || saving || captureSaving || iconSaving || organizing || draggingItem || draggingCollection || document.querySelector('.collection-menu[open]') || pendingArchives.size || pendingImpacts.size) return false;
  loading = true;
  try {
    const response = await libraryFetch('/api/catalog', { cache: 'no-store' });
    if (!response.ok) throw new Error(browserLocalViewer
      ? (await response.json()).error || 'Could not read your browser library.'
      : 'Could not load the library. Keep the launcher window open and try Refresh.');
    const catalog = await response.json();
    if (!browserLocalViewer) showSyncState(catalog.syncStatus);
    libraryId = catalog.libraryId;
    updateCaptureButtons();
    if (!draftsLoaded) {
      draftsLoaded = true;
      try {
        const saved = JSON.parse(localStorage.getItem(`personal-library-drafts-${libraryId}`) || '[]');
        for (const [id, draft] of saved) if (draft && typeof draft === 'object') drafts.set(id, draft);
        if (drafts.size) actionStatus('Recovered an unsaved draft. Open Notes / edit for the entry to review it.');
      } catch { actionStatus('A saved browser draft could not be read. Existing library files are unaffected.'); }
    }
    if (catalogVersion === catalog.version && !manual) return;
    // A save can begin while the fetch is in flight. Let its result win.
    if (saving || captureSaving || iconSaving || organizing || draggingItem || draggingCollection || pendingArchives.size || pendingImpacts.size) return;
    catalogVersion = catalog.version;
    renderSharedRepositories(catalog.sharedRepositories);
    sources = catalog.sources;
    annotations = catalog.items;
    collectionParents = catalog.collectionParents || {};
    pinnedCollections = catalog.pinnedCollections || [];
    collectionAppearance = catalog.collectionAppearance || {};
    collectionOrder = catalog.collectionOrder || [];
    linkedPlaylists = catalog.youtubePlaylists || [];
    collectionIcons = catalog.collectionIcons || {};
    collectionIconRevision = catalog.collectionIconsRevision ?? null;
    const warning = $('#catalog-warning');
    warning.hidden = !catalog.errors.length;
    warning.textContent = catalog.errors.map(error => `${error.path}: ${error.error}`).join('\n');
    if (editing) {
      const previous = editing;
      editing = sources.find(source => source.id === editing.id) || editing;
      updatePanelCollection(editing);
      if (editing.title !== previous.title) $('#editor-title').textContent = editing.title;
      if (!$('#entry-overview').hidden && (editing.title !== previous.title || editing.summary !== previous.summary || ['title', 'description', 'image'].some(key => editing.linkPreview?.[key] !== previous.linkPreview?.[key]))) {
        showOverview(editing);
      }
      if (annotations[editing.id]) {
        const latest = itemData(editing);
        if (latest.revision !== editorRevision) $('#save-status').textContent = 'Entry changed elsewhere. Copy any draft, then load the latest entry to merge changes.';
      }
    }
    updateFilters();
    render();
    if (requestedItem) {
      const source = sources.find(item => item.id === requestedItem);
      requestedItem = null;
      if (source) await openEditor(source);
      else actionStatus('This item is unavailable in this browser.');
    }
  } catch (error) {
    if (!catalogVersion) count.textContent = 'Library unavailable';
    actionStatus(error.message);
  } finally { loading = false; window.dispatchEvent(new Event('inntake-viewer-ready')); }
}

$('#refresh').addEventListener('click', () => loadCatalog(true));
const settingsDialog = $('#settings-dialog');
$('#settings-open').addEventListener('click', () => settingsDialog.showModal());
$('#settings-close').addEventListener('click', () => settingsDialog.close());

const backupDownload = $('#backup-download');
const backupRestore = $('#backup-restore');
const backupStatus = $('#backup-status');

if (browserLocalViewer) {
  let exportingBackup = false;
  backupDownload.addEventListener('click', async event => {
    event.preventDefault();
    if (exportingBackup) return;
    exportingBackup = true;
    backupStatus.textContent = 'Preparing ZIP backup…';
    try {
      const response = await libraryFetch('/api/backup.zip');
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || 'Could not export this library.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = element('a');
      link.href = url;
      link.download = 'inntake-library-' + new Date().toISOString().slice(0, 10) + '.zip';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      backupStatus.textContent = 'ZIP download started.';
    } catch (error) { backupStatus.textContent = error.message; }
    finally { exportingBackup = false; }
  });
}

backupRestore.addEventListener('change', async () => {
  const file = backupRestore.files[0];
  if (!file) return;
  const type = /\.json$/i.test(file.name) || file.type === 'application/json' ? 'application/json' : 'application/zip';
  backupRestore.disabled = true;
  backupStatus.textContent = 'Importing backup…';
  try {
    const response = await libraryFetch('/api/restore', {
      method: 'POST', headers: {'Content-Type': type}, body: file
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !Number.isSafeInteger(result?.added)) throw new Error(result?.error || 'Could not import this backup.');
    await loadCatalog(true);
    backupStatus.textContent = result.added ? `Imported ${result.added} ${result.added === 1 ? 'item' : 'items'}.` : 'No new items to import.';
  } catch (error) { backupStatus.textContent = error.message; }
  finally {
    backupRestore.disabled = false;
    backupRestore.value = '';
  }
});

function enableBackdropDismiss(dialog, canClose = () => true) {
  if ('closedBy' in dialog) return;
  // Older browsers retarget backdrop events to the dialog, just like clicks on its padding.
  const onBackdrop = event => {
    if (event.target !== dialog) return false;
    const {left, right, top, bottom} = dialog.getBoundingClientRect();
    return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
  };
  let pressedOutside = false;
  dialog.addEventListener('pointerdown', event => {
    pressedOutside = event.isPrimary && event.button === 0 && onBackdrop(event);
  });
  for (const type of ['pointercancel', 'close']) {
    dialog.addEventListener(type, () => { pressedOutside = false; });
  }
  dialog.addEventListener('click', event => {
    if (pressedOutside && onBackdrop(event) && canClose()) dialog.close();
    pressedOutside = false;
  });
}
enableBackdropDismiss(settingsDialog);

const macSync = $('#mac-sync');
if (macSync) {
  $('#settings-open').addEventListener('click', async () => {
    try {
      const response = await libraryFetch('/api/workspace-sync');
      if (!response.ok) return;
      const {remote, connected, status, conflict} = await response.json();
      const states = {conflict, waiting: 'Changes saved locally. Sync will retry.', syncing: 'Syncing…'};
      $('#mac-sync-status').textContent = connected ? (states[status] || 'Automatic sync is on.') : '';
      macSync.hidden = !remote;
      if (remote) $('#mac-sync-repo').textContent = new URL(remote).pathname.slice(1).replace(/\.git$/, '') + ' · inntake-library';
    } catch { macSync.hidden = true; }
  });
  $('#mac-sync-now').addEventListener('click', async event => {
    const button = event.currentTarget;
    const status = $('#mac-sync-status');
    button.disabled = true;
    status.textContent = 'Syncing…';
    try {
      const response = await libraryFetch('/api/workspace-sync', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sync failed. Try again.');
      status.textContent = 'Up to date.';
      await loadCatalog(true);
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
}

const playlistLinkDialog = $('#link-playlist-dialog');
const playlistLinkForm = $('#link-playlist-form');
let playlistLinkCollection = '';

async function requestPlaylistChange(action, playlist, collection) {
  const response = await libraryFetch('/api/youtube-playlist', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, playlist, collection})
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result.changed !== 'number') {
    throw new Error(result?.error || 'Could not finish the playlist request. Try again.');
  }
  return result;
}

function playlistVideoCount(count) { return `${count} ${count === 1 ? 'video' : 'videos'}`; }
function playlistImportMessage(result, collection) {
  if (result.queued) return 'Queued for your connected Mac.';
  if (result.changed) return `Added ${playlistVideoCount(result.changed)}${collection ? ` to ${collection}` : ''}.`;
  return result.total ? 'All feed videos are already saved here.' : 'YouTube’s feed has no videos to import.';
}

function renderLinkedPlaylists(collection) {
  const list = $('#linked-playlists');
  const items = linkedPlaylists.filter(link => link.collection === collection);
  list.replaceChildren();
  list.hidden = !items.length;
  for (const link of items) {
    const row = element('li');
    const menu = element('details', 'collection-menu playlist-menu');
    const summary = element('summary');
    summary.setAttribute('aria-label', `${link.title}, ${playlistVideoCount(link.count)}`);
    summary.title = link.title;
    summary.append(element('span', 'playlist-name', link.title), element('span', 'playlist-size', link.error ? 'Retry' : link.queued ? 'Queued' : link.count.toString()));
    const options = element('div', 'collection-menu-options');
    const original = sourceLink({url: 'https://www.youtube.com/playlist?list=' + link.id}, link.title);
    original.setAttribute('aria-label', `Open ${link.title} on YouTube`);
    options.append(original);
    const refresh = element('button', '', link.error ? 'Retry' : 'Refresh');
    const unlink = element('button', '', link.queued && !link.video_ids ? 'Cancel' : 'Unlink');
    if (link.error) options.append(element('p', 'hint', link.error));
    for (const [button, action] of [[refresh, link.request || 'refresh'], [unlink, 'unlink']]) {
      if (button === refresh && link.queued && !link.error) button.disabled = true;
      button.setAttribute('aria-label', `${button.textContent} ${link.title}`);
      button.addEventListener('click', async () => {
        menu.open = false;
        refresh.disabled = unlink.disabled = true;
        actionStatus(action === 'unlink' ? 'Unlinking playlist…' : 'Checking playlist…');
        try {
          const result = await requestPlaylistChange(action, link.id, collection);
          await loadCatalog(true);
          successStatus(result.queued ? 'Queued for your connected Mac.' : action === 'unlink' ? 'Playlist unlinked. Videos kept.' : result.changed ? `Added ${playlistVideoCount(result.changed)}.` : 'Playlist is up to date.');
        } catch (error) { actionStatus(error.message); }
        finally { refresh.disabled = unlink.disabled = false; }
      });
    }
    options.append(refresh, unlink);
    attachMenu(menu, summary, options);
    row.append(menu);
    list.append(row);
  }
}

function openPlaylistLink(collection) {
  playlistLinkCollection = collection;
  playlistLinkForm.reset();
  playlistLinkForm.querySelector('[role="status"]').hidden = true;
  playlistLinkDialog.showModal();
}

const playlistLinkSubmit = playlistLinkForm.querySelector('[type="submit"]');
$('#link-playlist-close').addEventListener('click', () => { if (!playlistLinkSubmit.disabled) playlistLinkDialog.close(); });
playlistLinkDialog.addEventListener('cancel', event => { if (playlistLinkSubmit.disabled) event.preventDefault(); });
playlistLinkForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (playlistLinkSubmit.disabled) return;
  const input = playlistLinkForm.elements.playlist;
  const status = playlistLinkForm.querySelector('[role="status"]');
  const collection = playlistLinkCollection;
  playlistLinkSubmit.disabled = input.readOnly = true;
  status.textContent = 'Linking playlist…'; status.hidden = false;
  try {
    const result = await requestPlaylistChange('link', input.value.trim(), collection);
    await loadCatalog(true);
    playlistLinkDialog.close();
    chooseCollection(collection);
    successStatus(result.queued ? 'Queued for your connected Mac.' : `Playlist linked · ${playlistVideoCount(result.total)}.`);
  } catch (error) { status.textContent = error.message; }
  finally { playlistLinkSubmit.disabled = input.readOnly = false; }
});

$('#copy-draft').addEventListener('click', async () => {
  if (!editing) return;
  const data = drafts.get(editing.id) || itemData(editing);
  const text = [editing.title, ...Object.entries(data).filter(([key]) => key !== 'revision').map(([key, value]) => `${key}: ${value}`)].join('\n\n');
  try { await navigator.clipboard.writeText(text); $('#save-status').textContent = 'Draft copied'; }
  catch { $('#save-status').textContent = 'Clipboard unavailable. Select and copy the fields manually.'; }
});
$('#reload-entry').addEventListener('click', async () => {
  if (!editing || saving) return;
  if (drafts.has(editing.id) && !window.confirm('Discard this unsaved draft and load the latest saved entry? Use Copy draft first if you want to merge it.')) return;
  const id = editing.id;
  // Fetch successfully before discarding the draft.
  try {
    const response = await libraryFetch('/api/catalog', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load the latest entry. Your draft is still here.');
    const catalog = await response.json();
    const source = catalog.sources.find(value => value.id === id);
    if (!source) throw new Error('The entry is unavailable. Your draft is still here.');
    drafts.delete(id);
    persistDrafts();
    annotations = catalog.items;
    sources = catalog.sources;
    collectionParents = catalog.collectionParents || {};
    pinnedCollections = catalog.pinnedCollections || [];
    collectionAppearance = catalog.collectionAppearance || {};
    collectionOrder = catalog.collectionOrder || [];
    linkedPlaylists = catalog.youtubePlaylists || [];
    collectionIcons = catalog.collectionIcons || {};
    collectionIconRevision = catalog.collectionIconsRevision ?? null;
    catalogVersion = catalog.version;
    await openEditor(source, 'edit');
    updateFilters();
    render();
  } catch (error) { $('#save-status').textContent = error.message; }
});
let initialStyle;
try { initialStyle = localStorage.getItem(styleKey); } catch {}
selectLibraryStyle(initialStyle);
loadIconLibrary();
loadCatalog();
if (browserLocalViewer) {
  let refreshTimer;
  function queueLocalRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      if (await loadCatalog() === false) queueLocalRefresh();
    }, 250);
  }
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === 'inntake-local-library-v1') queueLocalRefresh();
  });
  window.addEventListener('inntake-metadata-saved', queueLocalRefresh);
  window.addEventListener('inntake-library-imported', () => loadCatalog(true));
} else {
  setInterval(() => { if (!document.hidden) loadCatalog(); }, 3500);
}
window.addEventListener('focus', () => loadCatalog());
