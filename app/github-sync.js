import {decodeWorkspace, encodeWorkspace} from './github-codec.js';
import {exclusive, libraryView, mounted, namespace, readValue, writeValues} from './browser-store.js';
import {load, normalizeLibrary, save} from './viewer-storage.js';

export const repoPattern = /^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i;
const oid = /^[a-f\d]{40}$/;
const branchPattern = /^[a-z\d][a-z\d._/-]{0,127}$/i;
const ownedFields = ['id','title','url','createdAt','updatedAt','body','category','impact','core','archived','trashed','collections','image'];
const text = new TextEncoder();
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const stringify = value => JSON.stringify(sorted(value));

function snapshot(library) {
  const rows = new Map();
  for (const item of library.items) rows.set('item:' + item.id, item);
  for (const name of library.collections) {
    const {parents, icons, appearance, pinned} = library.settings;
    rows.set('collection:' + name, {name, parent:parents[name] ?? null, icon:icons[name], appearance:appearance[name], pinned:pinned.includes(name)});
  }
  if (library.settings.order.length) rows.set('order', library.settings.order);
  return rows;
}
async function fingerprints(rows) {
  const output = Object.create(null);
  await Promise.all(Array.from(rows, async ([key, value]) => {
    const payload = key.startsWith('item:') ? Object.fromEntries(ownedFields.map(field => [field, value[field]])) : value;
    const hash = await crypto.subtle.digest('SHA-256', text.encode(stringify(payload)));
    output[key] = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }));
  return output;
}
export async function mergeLibraries(local, remote, base = {}, resolutions = {}) {
  const left = snapshot(local), right = snapshot(remote);
  const [localHashes, remoteHashes] = await Promise.all([fingerprints(left), fingerprints(right)]);
  const rows = new Map(), conflicts = [];
  for (const key of new Set([...left.keys(), ...right.keys(), ...Object.keys(base)])) {
    const l = localHashes[key], r = remoteHashes[key], prior = base[key];
    let picked;
    if (l === r) picked = right.get(key) ?? left.get(key);
    else if (r === prior) picked = left.get(key);
    else if (l === prior) picked = right.get(key);
    else {
      const pair = (l ?? '-') + '/' + (r ?? '-');
      const decision = resolutions[key];
      if (decision?.pair === pair && ['local','remote'].includes(decision.side)) {
        picked = decision.side === 'local' ? left.get(key) : right.get(key);
      } else {
        conflicts.push({key, pair, label:left.get(key)?.title || right.get(key)?.title || key.replace(/^collection:/, '')});
      }
    }
    if (picked !== undefined) rows.set(key, picked);
  }
  if (conflicts.length) return {conflicts};
  const items = [], collections = [];
  const parents = Object.create(null), icons = Object.create(null), appearance = Object.create(null), pinned = [];
  for (const [key, row] of rows) {
    if (key.startsWith('item:')) {
      const old = left.get(key), unchanged = localHashes[key] === remoteHashes[key] || row === old;
      items.push({...row, revision:unchanged && old ? old.revision : crypto.randomUUID(), captureHash:row.captureHash ?? old?.captureHash});
    } else if (key.startsWith('collection:')) {
      collections.push(row.name);
      parents[row.name] = row.parent;
      if (row.icon) icons[row.name] = row.icon;
      if (row.appearance) appearance[row.name] = row.appearance;
      if (row.pinned) pinned.push(row.name);
    }
  }
  const library = normalizeLibrary({version:1, collections, items, settings:{parents, icons, appearance, pinned, order:rows.get('order') || []}});
  return {library, hashes:await fingerprints(snapshot(library))};
}

export function github(repo, token, network = fetch) {
  if (!repoPattern.test(repo) || repo.split('/').some(part => ['.','..'].includes(part))) throw new Error('Enter a repository as owner/name.');
  if (!token.trim()) throw new Error('Enter a GitHub token for this repository.');
  const endpoint = 'https://api.github.com/repos/' + repo;
  const request = async (path, method = 'GET', body) => {
    const response = await network(endpoint + path, {method, signal:AbortSignal.timeout(20000), cache:'no-store', credentials:'omit', redirect:'error', referrerPolicy:'no-referrer',
      headers:{Authorization:'Bearer ' + token.trim(), Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28',
        ...(body ? {'Content-Type':'application/json'} : {})}, ...(body ? {body:JSON.stringify(body)} : {})});
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        const limited = response.status === 429 || response.headers.has('retry-after') || response.headers.get('x-ratelimit-remaining') === '0';
        const error = new Error(limited ? 'GitHub requested a pause. Sync will retry.' : 'GitHub denied access. Check your connection in Settings.');
        error.authRequired = !limited;
        error.retryAfter = Math.max(Number(response.headers.get('retry-after')) * 1000, Number(response.headers.get('x-ratelimit-reset')) * 1000 - Date.now(), 0);
        throw error;
      }
      if (response.status === 404) throw new Error('GitHub could not find this private repository or its data branch. Check the name and token access.');
      if ([409,422].includes(response.status)) throw new Error('GitHub could not update this branch. Sync again to pick up changes, or check branch protection.');
      throw new Error('GitHub request failed (' + response.status + '). Your local edits are saved.');
    }
    return response.json();
  };
  return {
    async verify() {
      const info = await request('');
      if (info.private !== true || info.visibility !== 'private' || info.full_name?.toLowerCase() !== repo.toLowerCase()) throw new Error('Choose a private repository with this exact owner and name.');
      return info;
    }, request
  };
}

function encodedBranch(branch) {
  if (!branchPattern.test(branch) || branch.includes('..') || branch.endsWith('.') || branch.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock'))) throw new Error('Enter a valid data branch.');
  return branch.split('/').map(encodeURIComponent).join('/');
}
function sha(value) {
  if (!oid.test(value)) throw new Error('GitHub returned an invalid revision.');
  return value;
}

function sourcePath(path) {
  return path.startsWith('sources/') && !/^sources\/migrations(?:\/|$)/i.test(path) && !/[\\\x00-\x1f]/.test(path) &&
    path.split('/').every(part => part && !part.startsWith('.'));
}
function dataPath(path) {
  return path === 'collections.json' || /^entries\/[0-9a-f-]{36}\.md$/.test(path) || sourcePath(path);
}
async function pool(inputs, work) {
  let next = 0, failure;
  await Promise.all(Array.from({length:Math.min(4, inputs.length)}, async () => {
    while (next < inputs.length && !failure) {
      const index = next++;
      try { await work(inputs[index]); } catch (err) { failure = err; }
    }
  }));
  if (failure) throw failure;
}
function toBase64(bytes) {
  let str = '';
  for (let i=0; i<bytes.length; i+=16384) str += String.fromCharCode(...bytes.subarray(i, i+16384));
  return btoa(str);
}

export async function readWorkspace(api, branch, readBlob, cacheBlob, report, ref) {
  ref ??= await api.request('/git/ref/heads/' + encodedBranch(branch));
  const head = sha(ref.object?.sha);
  const commit = await api.request('/git/commits/' + head);
  const tree = sha(commit.tree?.sha);
  const listing = await api.request('/git/trees/' + tree + '?recursive=1');
  if (listing.truncated || !Array.isArray(listing.tree)) throw new Error('GitHub returned an incomplete file list. No changes were made.');
  const paths = new Map();
  for (const entry of listing.tree) {
    if (entry.type === 'tree' && ['entries','sources'].includes(entry.path)) continue;
    if (entry.type === 'tree' && sourcePath(entry.path)) continue;
    if (entry.mode !== '100644' || entry.type !== 'blob' || !dataPath(entry.path)) throw new Error('This branch contains files outside the Inntake library. Choose its data-only branch.');
    paths.set(entry.path, sha(entry.sha));
  }
  const files = new Map(), blobs = new Map();
  const ids = Array.from(new Set(paths.values()));
  let count = 0;
  await pool(ids, async id => {
    let bytes = await readBlob(id);
    if (!bytes) {
      const blob = await api.request('/git/blobs/' + id);
      if (blob.sha !== id || blob.encoding !== 'base64') throw new Error('GitHub returned an unreadable file.');
      bytes = Uint8Array.from(atob(blob.content.replace(/\s/g, '')), ch => ch.charCodeAt(0));
      if (bytes.length !== blob.size) throw new Error('GitHub returned an incomplete file.');
      await cacheBlob(id, bytes);
    }
    blobs.set(id, bytes);
    count++;
    if (count % 20 === 0) report?.('Reading library files · ' + count + '/' + ids.length);
  });
  for (const [path, id] of paths) files.set(path, blobs.get(id));
  return {files, paths, tree, head};
}

export async function publish(api, branch, remote, changes, cacheBlob) {
  if (!changes.size) return remote.head;
  await api.verify();
  const tree = [];
  // GitHub recommends sequential writes to avoid secondary rate limits.
  for (const [path, bytes] of changes) {
    if (!dataPath(path) || !(bytes instanceof Uint8Array)) throw new Error('Refused an invalid library file.');
    const blob = await api.request('/git/blobs', 'POST', {encoding:'base64', content:toBase64(bytes)});
    const id = sha(blob.sha);
    await cacheBlob(id, bytes);
    remote.paths.set(path, id);
    tree.push({path, type:'blob', mode:'100644', sha:id});
  }
  const updated = await api.request('/git/trees', 'POST', {base_tree:remote.tree, tree});
  const commit = await api.request('/git/commits', 'POST', {message:'Sync Inntake library', tree:sha(updated.sha), parents:[remote.head]});
  await api.request('/git/refs/heads/' + encodedBranch(branch), 'PATCH', {sha:sha(commit.sha), force:false});
  return commit.sha;
}

export async function syncWorkspace({repo, branch, token, report, resolutions, automatic = false}) {
  repo = repo.trim().toLowerCase();
  if (mounted !== null && repo !== mounted.toLowerCase()) throw new Error('This shared library belongs to a different repository.');
  const api = github(repo, token);
  const binding = repo + '#' + branch;
  return navigator.locks.request('inntake-github:' + namespace, async () => {
    const prior = await readValue('state', 'sync');
    if (prior && prior.binding !== binding) throw new Error('This library is connected to ' + prior.binding + '. Open another library separately.');
    const dirty = await readValue('state', 'syncDirty');
    if (automatic && prior && dirty === false && Date.now() - (prior.checked || 0) < 12000) return {unchanged:true};
    const ref = await api.request('/git/ref/heads/' + encodedBranch(branch));
    if (prior && dirty === false && prior.head === sha(ref.object?.sha)) {
      await writeValues('state', [['sync', {...prior, checked:Date.now()}]]);
      return {unchanged:true};
    }
    await api.verify();
    report('Reading private library…');
    const cacheBlob = (id, bytes) => writeValues('blobs', [[id, bytes]]);
    const remote = await readWorkspace(api, branch, id => readValue('blobs', id), cacheBlob, report, ref);
    if (prior && prior.head !== remote.head) {
      const comparison = await api.request('/compare/' + sha(prior.head) + '...' + remote.head + '?per_page=1');
      if (!['ahead', 'identical'].includes(comparison.status) || comparison.merge_base_commit?.sha !== prior.head) {
        throw new Error('GitHub branch history was replaced. Your local library is intact. Restore the previous branch history before syncing.');
      }
    }
    const remoteLibrary = normalizeLibrary(decodeWorkspace(remote.files));
    const view = await libraryView();
    const local = load(view);
    const merged = await mergeLibraries(local, remoteLibrary, prior?.hashes, resolutions);
    if (merged.conflicts) return merged;
    const changes = encodeWorkspace(merged.library, remote.files);
    report(changes.size ? 'Saving changes to GitHub…' : 'Updating this device…');
    const head = await publish(api, branch, remote, changes, cacheBlob);
    for (const [path, bytes] of changes) remote.files.set(path, bytes);
    // Adopt the exact canonical representation so a retry starts from the same
    // data, including new attachment paths and normalized Markdown metadata.
    const canonical = normalizeLibrary(decodeWorkspace(remote.files));
    const oldItems = new Map(merged.library.items.map(item => [item.id,item]));
    for (const item of canonical.items) {
      const old = oldItems.get(item.id);
      item.revision = old?.revision ?? crypto.randomUUID();
      if (old?.captureHash) item.captureHash = old.captureHash;
    }
    const hashes = await fingerprints(snapshot(canonical));
    const timestamp = new Date().toISOString();
    const state = {binding, repo, branch, hashes, head, timestamp, checked:Date.now()};
    const paths = Object.fromEntries([...remote.paths].filter(([path]) => sourcePath(path)));
    // Network work leaves captures free to save. Reconcile any edits made while
    // the request was in flight before committing the new baseline.
    return exclusive(async () => {
      await view.refresh();
      const latest = load(view);
      let data = canonical, pending = false;
      if (latest.revision !== local.revision) {
        const rebase = await mergeLibraries(latest, canonical, await fingerprints(snapshot(local)));
        if (rebase.conflicts) return {retry:true};
        data = rebase.library;
        pending = stringify(rebase.hashes) !== stringify(hashes);
      }
      save(view, data, true);
      await view.flush([['sync', state], ['syncDirty', pending], ['assets', {head, paths}]], true);
      return {changed:changes.size, items:data.items.length, timestamp, pending};
    });
  });
}
