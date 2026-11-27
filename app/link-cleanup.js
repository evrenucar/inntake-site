// Shared by the local capture UI and the browser storage adapter.
(() => {
  const common = ['fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid'];
  const youtube = ['si', 'is', 'feature', 'pp'];
  const instagram = ['igsh', 'igshid', 'ig_rid', 'ig_mid', 'bqrl', 'xtok'];
  function cleanUrl(value) {
    let url;
    try { url = new URL(value); } catch { return value; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return value;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const within = domain => host === domain || host.endsWith('.' + domain);
    const tracking = new Set(common);
    if (within('youtube.com') || within('youtu.be') || within('youtube-nocookie.com')) youtube.forEach(key => tracking.add(key));
    if (within('instagram.com')) instagram.forEach(key => tracking.add(key));
    // Filter the original query rather than re-encoding timestamps, selectors or signed values.
    const hashAt = value.indexOf('#');
    const fragment = hashAt < 0 ? '' : value.slice(hashAt);
    const base = hashAt < 0 ? value : value.slice(0, hashAt);
    const queryAt = base.indexOf('?');
    if (queryAt < 0) return value;
    const fields = base.slice(queryAt + 1).split('&');
    const kept = fields.filter(field => {
      let key;
      try { key = decodeURIComponent(field.split('=', 1)[0].replace(/\+/g, ' ')).toLowerCase(); }
      catch { return true; }
      return !tracking.has(key) && !key.startsWith('utm_');
    });
    if (fields.length === kept.length) return value;
    return base.slice(0, queryAt) + (kept.join('&') ? '?' + kept.join('&') : '') + fragment;
  }
  function cleanText(text) {
    return text.replace(/https?:\/\/[^\s<>"'`\\]+/gi, match => {
      const url = match.replace(/[.,;:!?)\]}]+$/, '');
      return cleanUrl(url) + match.slice(url.length);
    });
  }
  globalThis.inntakeLinkCleanup = Object.freeze({cleanUrl, cleanText});
})();
