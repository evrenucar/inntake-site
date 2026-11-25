// The connected Mac reads the keyless YouTube feed and returns canonical cards via GitHub.
const playlistPattern = /^[A-Za-z0-9_-]{2,150}$/;
export function playlistId(value) {
  let id = String(value ?? '').trim();
  if (!playlistPattern.test(id)) {
    let url;
    try { url = new URL(id); } catch {}
    if (!url || !['http:', 'https:'].includes(url.protocol) || !['youtube.com','www.youtube.com','music.youtube.com','m.youtube.com','youtu.be'].includes(url.host) || url.searchParams.getAll('list').length !== 1) throw Error('Enter a YouTube playlist URL or ID.');
    id = url.searchParams.get('list');
  }
  if (!playlistPattern.test(id) || ['WL','HL'].includes(id)) throw Error('Choose a regular YouTube playlist.');
  return id;
}

export function playlistRows(settings) {
  const rows = (settings.youtubePlaylists || []).map(link => ({...link, count:link.video_ids.length}));
  for (const request of settings.youtubeRequests || []) {
    const existing = rows.find(row => row.id === request.id && row.collection === request.collection);
    const pending = {request:request.action, error:request.error || '', queued:true};
    if (existing) Object.assign(existing, pending);
    else rows.push({...pending, collection:request.collection, id:request.id, title:'YouTube playlist', count:0});
  }
  return rows;
}

export function queuePlaylist(data, input) {
  const {action, collection} = input;
  const id = playlistId(input.playlist);
  if (!['link','import','refresh','unlink'].includes(action) || typeof collection !== 'string' ||
      (collection && !data.collections.includes(collection)) || (!collection && ['link','refresh'].includes(action))) throw Error('Choose a valid collection.');
  const matching = row => row.id === id && row.collection === collection;
  const settings = data.settings;
  const links = settings.youtubePlaylists || [];
  const requests = settings.youtubeRequests || [];
  const before = requests.find(matching);
  const existing = links.find(matching);
  if (action === 'unlink') {
    settings.youtubeRequests = requests.filter(row => !matching(row));
    settings.youtubePlaylists = links.filter(row => !matching(row));
    return {total:0, changed:0};
  }
  if (action === 'refresh' && !existing) throw Error('This playlist is no longer linked.');
  if (!before || before.error || before.action !== action) {
    if (!before && requests.length >= 64) throw Error('Wait for earlier playlist imports to finish.');
    settings.youtubeRequests = [...requests.filter(row => !matching(row)), {id, collection, action, key:crypto.randomUUID()}];
  }
  return {total:existing?.video_ids.length || 0, changed:0, queued:true};
}
