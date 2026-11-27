import {checkNames, checkPath, maxBytes, readZip, writeZip} from './backup-zip.js';
import {decodeWorkspace, encodeWorkspace} from './github-codec.js';

const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8',{fatal:true});
const manifest = {format:'inntake-library-zip',version:1};
const entry = /^entries\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.md$/;
function allowed(path) {
  checkPath(path);
  if (path.split('/').some(part => part.startsWith('.')) ||
      !(entry.test(path) || path.startsWith('sources/') || ['collections.json','INDEX.md'].includes(path))) {
    throw new Error('Unexpected file in library backup: ' + path);
  }
}
export async function gitBlobId(bytes) {
  const data = await new Blob(['blob ' + bytes.length + '\0', bytes]).arrayBuffer();
  return hex(await crypto.subtle.digest('SHA-1', data));
}
function hex(buffer) { return [...new Uint8Array(buffer)].map(byte=>byte.toString(16).padStart(2,'0')).join(''); }
export async function readFiles(refs, getBlob) {
  const files = new Map();
  for (const [path,id] of Object.entries(refs)) {
    allowed(path);
    const content = await getBlob(id);
    if (!content) throw Error('Missing stored backup file: ' + path);
    files.set(path,content);
  }
  return files;
}
function checkSources(data, files) {
  for (const item of data.items) for (const path of item.sourcePaths || []) {
    if (!files.has(path)) throw Error('Missing source file: ' + path);
  }
}
export async function makeArchive(data, storage, index = undefined) {
  if (index === undefined) index = await storage.archiveIndex?.();
  const refs = {...index?.paths, ...index?.files};
  const files = await readFiles(refs, id => storage.getBlob(id));
  for (const [path,content] of encodeWorkspace(data,files)) files.set(path,content);
  checkSources(data, files);
  files.set('manifest.json',encoder.encode(JSON.stringify(manifest)));
  return writeZip(files);
}
async function legacyFiles(raw) {
  if (raw.format !== 'personal-reference-library' || raw.version !== 1 || !Array.isArray(raw.files) || raw.files.length > 10000) throw Error('Unsupported library backup.');
  const files = new Map(), paths = new Set();
  let total=0;
  for (const record of raw.files) {
    allowed(record.path);
    const key=record.path.normalize('NFC').toLowerCase();
    if (paths.has(key) || typeof record.content !== 'string') throw Error('Invalid backup file record.');
    paths.add(key);
    let bytes;
    if (record.encoding === 'utf-8') bytes = encoder.encode(record.content);
    else if (record.encoding === 'base64') bytes = Uint8Array.from(atob(record.content),c=>c.charCodeAt(0));
    else throw Error('Invalid backup file encoding.');
    total+=bytes.length;
    if (bytes.length > 64*1024*1024 || total > maxBytes ||
      hex(await crypto.subtle.digest('SHA-256',bytes)) !== record.sha256) throw Error('Invalid size or checksum for '+record.path);
    files.set(record.path,bytes);
  }
  checkNames(files.keys());
  return files;
}
export async function parseArchive(input, normalize) {
  const blob = input instanceof Blob ? input : new Blob([input]);
  if (!blob.size || blob.size > 128 * 1024 * 1024) throw Error('Choose a backup up to 128 MiB.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let files;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    files = await readZip(bytes);
    const meta = files.get('manifest.json');
    if (!meta || meta.length>4096) throw Error('The ZIP is missing its Inntake manifest.');
    const value = JSON.parse(decoder.decode(meta));
    if (value.format!==manifest.format || value.version!==manifest.version) throw Error('Unsupported Inntake ZIP version.');
    files.delete('manifest.json');
    for (const path of files.keys()) allowed(path);
  } else {
    const raw=JSON.parse(decoder.decode(bytes));
    if (raw.format==='inntake-local-library') {
      const backup=normalize(raw,true);
      return {backup,files:encodeWorkspace(backup,new Map())};
    }
    files=await legacyFiles(raw);
  }
  const backup=normalize(decodeWorkspace(files,true));
  checkSources(backup,files);
  return {backup,files};
}

// A restore merges IDs. Retain existing file bytes and canonical metadata.
// Incoming blobs and their visible library records are committed in one IndexedDB transaction.
export async function prepareFiles(storage, files, added, empty) {
  const index = await storage.archiveIndex?.() || {};
  const paths = {...index.paths}, originals = {...index.files}, pending = {...index.pending};
  const needs = new Set(added.flatMap(item=>item.sourcePaths || []));
  const entries = new Set(added.map(item=>'entries/'+item.id+'.md'));
  const blobs = new Map();
  for (const [path,content] of files) {
    const source = path.startsWith('sources/');
    if (!source && !entries.has(path) && !empty) continue;
    const id = await gitBlobId(content);
    const refs = source ? paths : originals;
    if (Object.hasOwn(refs,path)) {
      if (needs.has(path) && refs[path] !== id) throw Error('An attachment with different contents already exists: ' + path);
      continue;
    }
    refs[path] = id;
    blobs.set(id,content);
    if (source && !/^sources\/migrations(?:\/|$)/i.test(path) || entries.has(path)) pending[path]=id;
  }
  checkNames([...Object.keys(paths),...Object.keys(originals)]);
  for (const path of needs) {
    if (!Object.hasOwn(paths,path)) throw Error('This backup is missing an attachment: '+path);
  }
  if (blobs.size) {
    if (!storage.stageArchive) throw Error('Browser attachment storage is unavailable.');
    storage.stageArchive({head:crypto.randomUUID(), paths, files:originals, pending}, blobs);
  }
  return blobs.size;
}
