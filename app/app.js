import {cleanUrl, emptyLibrary, exportLibrary, libraryKey, mergeBackup, normalizeItem, readLibrary, writeLibrary} from './data.js';

const $ = selector => document.querySelector(selector);
const dialog = $('#editor');
const form = $('#link-form');
const formStatus = $('#form-status');
const collectionInput = $('#collection');
let library = emptyLibrary();
let selected = '';
let editing = null;

function node(tag, text = '', className = '') {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function status(message, undo) {
  const area = $('#status');
  area.textContent = message;
  if (undo) {
    const button = node('button', 'Undo');
    button.addEventListener('click', undo);
    area.append(button);
  }
}

function commit(next) {
  writeLibrary(next);
  library = next;
  render();
}

function openEditor(item = null, url = '', message = '') {
  if (dialog.open) return;
  editing = item;
  form.reset();
  $('#editor-title').textContent = item ? 'Edit link' : 'Add link';
  $('#url').value = item?.url || url;
  $('#title').value = item?.title || '';
  $('#note').value = item?.note || '';
  const options = ['', ...library.collections].map(name => {
    const option = node('option', name || 'No collection');
    option.value = name;
    return option;
  });
  collectionInput.replaceChildren(...options);
  collectionInput.value = item?.collection ?? selected;
  formStatus.textContent = message;
  dialog.showModal();
}

function removeItem(item) {
  try {
    const current = readLibrary();
    commit({...current, items: current.items.filter(saved => saved.id !== item.id)});
    status('Link removed.', () => {
      try {
        const latest = readLibrary();
        if (latest.items.some(saved => saved.url === item.url)) { status('This link is already saved.'); return; }
        commit({...latest, items: [...latest.items, item]});
        status('Link restored.');
      } catch (error) { status(error.message); }
    });
  } catch (error) { status(error.message); }
}

function renderItem(item) {
  const row = node('article', '', 'entry');
  const info = node('div', '', 'entry-info');
  const heading = node('h3');
  const link = node('a', item.title);
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  heading.append(link);
  const host = new URL(item.url).hostname;
  info.append(heading, node('p', [host, item.collection].filter(Boolean).join(' · '), 'entry-meta hint'));
  if (item.note) info.append(node('p', item.note, 'entry-note'));
  const actions = node('div', '', 'actions');
  const edit = node('button', 'Edit');
  edit.addEventListener('click', () => openEditor(item));
  const remove = node('button', 'Remove');
  remove.addEventListener('click', () => removeItem(item));
  actions.append(edit, remove);
  row.append(info, actions);
  return row;
}

function render() {
  if (selected && !library.collections.includes(selected)) selected = '';
  const query = $('#search').value.trim().toLowerCase();
  const counters = new Map();
  const shown = [];
  for (const item of library.items) {
    counters.set(item.collection, (counters.get(item.collection) || 0) + 1);
    if ((!selected || item.collection === selected) && `${item.title} ${item.url} ${item.note}`.toLowerCase().includes(query)) shown.push(item);
  }
  const filters = ['', ...library.collections].map(name => {
    const count = name ? counters.get(name) || 0 : library.items.length;
    const button = node('button');
    button.setAttribute('aria-pressed', String(name === selected));
    button.append(node('span', name || 'All items'), node('span', String(count), 'hint'));
    button.addEventListener('click', () => { selected = name; render(); });
    return button;
  });
  $('#collections').replaceChildren(...filters);
  $('#entries-title').textContent = selected || 'All items';
  $('#item-count').textContent = `${shown.length} ${shown.length === 1 ? 'link' : 'links'}`;
  shown.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  $('#items').replaceChildren(...(shown.length ? shown.map(renderItem) : [node('p', query ? 'No matching links.' : 'No links saved here yet.', 'empty hint')]));
}

$('#add').addEventListener('click', () => openEditor());
$('#paste').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    openEditor(null, cleanUrl(await navigator.clipboard.readText()));
  } catch {
    openEditor(null, '', 'Paste a link into the URL field.');
  } finally { button.disabled = false; }
});
$('#close').addEventListener('click', () => dialog.close());
$('#search').addEventListener('input', render);
form.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const current = readLibrary();
    const item = normalizeItem({
      id: editing?.id || crypto.randomUUID(), url: $('#url').value, title: $('#title').value,
      note: $('#note').value, collection: collectionInput.value, createdAt: editing?.createdAt || new Date().toISOString()
    });
    if (item.collection && !current.collections.includes(item.collection)) throw new Error('That collection is unavailable. Reopen the form and choose another.');
    if (current.items.some(saved => saved.url === item.url && saved.id !== item.id)) throw new Error('This link is already saved.');
    if (editing && JSON.stringify(current.items.find(saved => saved.id === editing.id)) !== JSON.stringify(editing)) {
      throw new Error('This link changed in another tab. Reopen it to edit the latest version.');
    }
    const items = editing ? current.items.map(saved => saved.id === item.id ? item : saved) : [...current.items, item];
    commit({...current, items});
    dialog.close();
    status(item.collection ? `Saved in ${item.collection}.` : 'Link saved.');
  } catch (error) { formStatus.textContent = error.message; }
});

$('#new-collection').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#collection-name');
  const name = input.value.trim();
  if (!name) return;
  try {
    const current = readLibrary();
    if (current.collections.includes(name)) throw new Error('That collection already exists.');
    commit({...current, collections: [...current.collections, name]});
    input.value = '';
    selected = name;
    render();
    status(`Created ${name}.`);
  } catch (error) { status(error.message); }
});

$('#export').addEventListener('click', () => {
  try {
    const blob = new Blob([exportLibrary(readLibrary())], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = node('a');
    link.href = url;
    link.download = 'inntake-library.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (error) { status(error.message); }
});
const fileInput = $('#import-file');
$('#import').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  try {
    if (file.size > 4_000_000) throw new Error('Choose a backup smaller than 4 MB.');
    const raw = await file.text();
    const merged = mergeBackup(readLibrary(), raw);
    commit(merged.library);
    status(merged.count ? `Imported ${merged.count} ${merged.count === 1 ? 'link' : 'links'}.` : 'All backup links are already saved.');
  } catch (error) { status(`Could not import this backup. ${error.message}`); }
  finally { fileInput.value = ''; }
});

function refresh() {
  try { library = readLibrary(); }
  catch { status('This browser could not read the saved library. Opening another tab may help.'); }
  render();
}
window.addEventListener('storage', event => { if (event.key === libraryKey || event.key === null) refresh(); });
refresh();
const requestedId = new URLSearchParams(location.search).get('item');
const requestedItem = library.items.find(item => item.id === requestedId);
if (requestedItem) openEditor(requestedItem);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
