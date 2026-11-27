// Standard single-disk ZIP32, UTF-8 paths, STORE and raw DEFLATE members.
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal:true});
export const maxBytes = 256 * 1024 * 1024;
export const maxArchive = 128 * 1024 * 1024;
const memberLimit = 64 * 1024 * 1024;
const countLimit = 10000;
const table = Uint32Array.from({length:256}, (_, i) => {
  let crc = i;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255];
  return (crc ^ -1) >>> 0;
}
function check(ok, message = 'Invalid or unsupported ZIP backup.') {
  if (!ok) throw new Error(message);
}
function header(size) {
  const b = new Uint8Array(size), v = new DataView(b.buffer);
  return {b, short:(p,n) => v.setUint16(p,n,true), long:(p,n) => v.setUint32(p,n,true)};
}
export function checkPath(path) {
  check(typeof path === 'string' && path.length > 0 && path.length < 2048 &&
    !/[\\:\x00-\x1f\x7f]/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..'),
    'Invalid path in backup.');
  return path;
}
function pathKey(path) { return path.normalize('NFC').toUpperCase().toLowerCase(); }
export function checkNames(names) {
  const keys = new Set(), components = new Map();
  for (const path of names) {
    const key = pathKey(checkPath(path));
    for (let end=path.indexOf('/'); end>=0; end=path.indexOf('/',end+1)) {
      const prefix=path.slice(0,end), prefixKey=pathKey(prefix);
      check(!components.has(prefixKey) || components.get(prefixKey)===prefix, 'Ambiguous directory names in backup.');
      components.set(prefixKey,prefix);
    }
    check(!keys.has(key), 'Duplicate paths in backup.');
    keys.add(key);
  }
  for (const key of keys) {
    for (let i = key.indexOf('/'); i >= 0; i = key.indexOf('/', i+1)) {
      check(!keys.has(key.slice(0,i)), 'Conflicting paths in backup.');
    }
  }
}
function deflate() {
  try { return new CompressionStream('deflate-raw'); } catch { return null; }
}

export async function writeZip(files) {
  checkNames(files.keys());
  check(files.size <= countLimit, 'Too many files for a browser backup.');
  const body = [], directory = [];
  let offset = 0, centralSize = 0, total = 0;
  for (const [path, bytes] of files) {
    total += bytes.length;
    check(bytes.length <= memberLimit && total <= maxBytes, 'Library exceeds the browser backup size limit.');
    const name = encoder.encode(path);
    let method = 0, content = bytes;
    if (bytes.length > 256 && !/\.(png|jpe?g|gif|webp|avif|zip|gz|mp[34]|mov|pdf)$/i.test(path)) {
      const compressor = deflate();
      if (compressor) {
        const compressed = await new Response(new Blob([bytes]).stream().pipeThrough(compressor)).blob();
        if (compressed.size < bytes.length) { content = compressed; method = 8; }
      }
    }
    const size = content.size ?? content.length, crc = crc32(bytes);
    const local = header(30);
    local.long(0,0x04034b50); local.short(4,20); local.short(6,0x800); local.short(8,method);
    local.short(12,33); local.long(14,crc); local.long(18,size); local.long(22,bytes.length); local.short(26,name.length);
    body.push(local.b,name,content);
    const central = header(46);
    central.long(0,0x02014b50); central.short(4,20); central.b.set(local.b.subarray(4,28),6);
    central.long(42,offset);
    directory.push(central.b,name);
    centralSize += central.b.length + name.length;
    offset += local.b.length + name.length + size;
  }
  check(offset + centralSize + 22 <= maxArchive, 'Archive exceeds the browser backup size limit.');
  const end = header(22);
  end.long(0,0x06054b50); end.short(8,files.size); end.short(10,files.size); end.long(12,centralSize); end.long(16,offset);
  return new Blob([...body,...directory,end.b], {type:'application/zip'});
}

async function inflate(input, expected) {
  let transform;
  try { transform = new DecompressionStream('deflate-raw'); }
  catch { throw new Error('Update Safari or Chrome to open compressed ZIP backups on this device.'); }
  const reader = new Blob([input]).stream().pipeThrough(transform).getReader();
  const out = new Uint8Array(expected);
  let pos = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      check(pos + value.length <= expected, 'Compressed member exceeds its declared size.');
      out.set(value,pos); pos += value.length;
    }
    check(pos === expected);
    return out;
  } finally { await reader.cancel().catch(() => {}); }
}

export async function readZip(bytes) {
  check(bytes.length >= 22 && bytes.length <= maxArchive);
  const v = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16 = p => v.getUint16(p,true), u32 = p => v.getUint32(p,true);
  function extraFields(begin, length) {
    const end=begin+length;
    while (begin<end) {
      check(begin+4<=end && u16(begin)!==1, 'Unsupported ZIP extension.');
      begin+=4+u16(begin+2);
    }
    check(begin===end);
  }
  let end = bytes.length - 22;
  while (end >= Math.max(0,bytes.length-65557) && !(u32(end) === 0x06054b50 && end+22+u16(end+20) === bytes.length)) end--;
  check(end >= Math.max(0,bytes.length-65557));
  const count = u16(end+10), start = u32(end+16);
  check(u16(end+4) === 0 && u16(end+6) === 0 && u16(end+8) === count &&
    count <= countLimit && start+u32(end+12) === end);
  const rows = [], directories = new Set();
  let pos = start, total = 0;
  for (let i=0; i<count; i++) {
    check(pos+46 <= end && u32(pos) === 0x02014b50);
    const flags=u16(pos+8), method=u16(pos+10), crc=u32(pos+16), packed=u32(pos+20), size=u32(pos+24);
    const length=u16(pos+28), local=u32(pos+42), next=pos+46+length+u16(pos+30)+u16(pos+32);
    const type=(u32(pos+38) >>> 16) & 0xf000;
    check(next<=end && u16(pos+34)===0 && !(flags & ~0x80e) && [0,8].includes(method) &&
      [0,0x4000,0x8000].includes(type) && size <= memberLimit);
    extraFields(pos+46+length,u16(pos+30));
    const path=decoder.decode(bytes.subarray(pos+46,pos+46+length));
    check(local+30<=start && u32(local)===0x04034b50 && u16(local+6)===flags && u16(local+8)===method &&
      length===u16(local+26) && local+30+length<=start &&
      decoder.decode(bytes.subarray(local+30,local+30+length))===path);
    const payload = local+30+length+u16(local+28);
    check(payload+packed<=start && (method!==0 || packed===size));
    extraFields(local+30+length,u16(local+28));
    if (!(flags & 8)) check(u32(local+14)===crc && u32(local+18)===packed && u32(local+22)===size);
    total += size; check(total <= maxBytes, 'Expanded backup exceeds the browser size limit.');
    if (path.endsWith('/')) {
      const folder=pathKey(checkPath(path.slice(0,-1)));
      check(size===0 && !directories.has(folder)); directories.add(folder);
    } else {
      check(type!==0x4000);
      rows.push({path,method,crc,size,packed,payload});
    }
    pos=next;
  }
  check(pos===end);
  checkNames(rows.map(row=>row.path));
  const files=new Map();
  for (const {path,method,crc,size,packed,payload} of rows) {
    check(!directories.has(pathKey(path)));
    const compressed=bytes.subarray(payload,payload+packed);
    const content=method===8 ? await inflate(compressed,size) : compressed;
    check(crc32(content)===crc, 'Damaged file in backup: '+path);
    files.set(path,content);
  }
  return files;
}
