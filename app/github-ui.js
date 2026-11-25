import {mounted, notifyConnectionChange, notifySyncOptions, readValue, writeValues} from './browser-store.js';
import {syncWorkspace} from './github-sync.js';
import {autoSync} from './github-schedule.js';

const panel = document.querySelector('#github-sync-panel');
const repo = panel.querySelector('[name=repository]');
const branch = panel.querySelector('[name=branch]');
const token = panel.querySelector('[name=token]');
const remember = panel.querySelector('[name=remember]');
const automatic = panel.querySelector('[name=automatic]');
const forget = panel.querySelector('#github-forget');
const run = panel.querySelector('#github-sync-now');
const status = panel.querySelector('[role=status]');
const choices = panel.querySelector('.github-conflicts');
let resolutions = Object.create(null);
let connected = false, sessionToken = '', busy = false;
const report = message => { status.textContent = message; };
const settingsButton = document.querySelector('#settings-open');
function attention(message) {
  settingsButton.dataset.syncAttention = message ? 'true' : 'false';
  settingsButton.title = message;
}
const showTime = iso => new Date(iso).toLocaleString(undefined, {dateStyle:'short', timeStyle:'short'});

async function saveCredential(secret) {
  // A non-extractable, origin-local key keeps the stored record from containing
  // a reusable plaintext token. Same-origin app code can still use the token.
  const key = await crypto.subtle.generateKey({name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, new TextEncoder().encode(secret));
  await writeValues('state', [['githubCredential', {key, iv, ciphertext}]]);
}
async function restoreConnection() {
  const [state, credential, options] = await Promise.all(['sync','githubCredential','githubOptions'].map(key => readValue('state',key)));
  if (state) {
    repo.value = state.repo; repo.readOnly = true;
    branch.value = state.branch; branch.readOnly = true;
    report('Last synced ' + showTime(state.timestamp));
  }
  automatic.checked = options?.automatic !== false;
  remember.checked = !!credential;
  if (credential) {
    sessionToken = new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:credential.iv}, credential.key, credential.ciphertext));
  } else sessionToken = '';
  connected = !!state && !!sessionToken;
  forget.hidden = !connected;
  if (connected) scheduler.resume();
}
function showConflicts(conflicts) {
  attention('Review sync conflicts in Settings');
  report('These changed on both devices. Choose each version, then sync again.');
  resolutions = Object.create(null);
  for (const {key, label, pair} of conflicts) {
    const field = document.createElement('label');
    field.className = 'field';
    field.append(label);
    const pick = document.createElement('select');
    for (const [caption,value] of [['Choose version',''], ['This device','local'], ['GitHub','remote']]) pick.add(new Option(caption, value));
    pick.addEventListener('change', () => { resolutions[key] = {pair,side:pick.value}; });
    field.append(pick);
    choices.append(field);
  }
}
async function options() {
  await writeValues('state', [['githubOptions', {automatic:automatic.checked}]]);
}
async function perform(manual) {
  if (busy) return {pending:true};
  if (!navigator.onLine) { report('Offline · changes saved on this device'); return; }
  busy = true; run.disabled = true;
  try {
    const secret = (manual && token.value.trim()) || sessionToken;
    const result = await syncWorkspace({repo:repo.value, branch:branch.value.trim(), token:secret, report, resolutions, automatic:!manual});
    choices.replaceChildren();
    if (result.conflicts) { showConflicts(result.conflicts); return {pause:true}; }
    if (result.retry) return {pending:true};
    resolutions = Object.create(null);
    if (manual) {
      sessionToken = secret;
      if (remember.checked) await saveCredential(secret);
      else await writeValues('state', [['githubCredential', null]]);
      token.value = '';
      connected = true; forget.hidden = false;
      repo.readOnly = true; branch.readOnly = true;
      await options();
    }
    attention('');
    if (!result.unchanged) window.dispatchEvent(new Event('inntake-library-imported'));
    report(result.unchanged ? 'Up to date' : 'Synced ' + result.items + (result.items === 1 ? ' item · ' : ' items · ') + showTime(result.timestamp));
    return result;
  } catch (err) {
    if (err.authRequired || err.status === 401 || err.status === 403) {
      attention('Reconnect to GitHub in Settings');
      report('Reconnect to GitHub in Settings. Your edits are saved.');
      return {pause:true};
    }
    if (manual) report(err.message || 'Could not sync. Your edits are saved.');
    else report('Changes saved on this device · retrying sync');
    throw err;
  } finally { busy = false; run.disabled = false; }
}
const scheduler = autoSync({
  available:() => connected && automatic.checked && navigator.onLine && !document.hidden,
  work:() => perform(false)
});
async function manualSync() {
  scheduler.stop();
  try {
    const result = await perform(true);
    if (result?.pause) scheduler.pause(); else scheduler.resume();
  } catch { scheduler.schedule(15000); }
}
if (mounted !== null) { repo.value = mounted; repo.readOnly = true; }
restoreConnection().catch(() => report('Reconnect to GitHub to sync this library.'));
run.addEventListener('click', manualSync);
window.addEventListener('inntake-local-edit', () => scheduler.schedule(1200));
window.addEventListener('online', () => scheduler.schedule());
window.addEventListener('offline', () => { scheduler.stop(); if (connected) report('Offline · changes saved on this device'); });
document.addEventListener('visibilitychange', () => scheduler.schedule());
window.addEventListener('pageshow', () => scheduler.schedule());
automatic.addEventListener('change', async () => { await options(); notifySyncOptions(); scheduler.schedule(); });
window.addEventListener('inntake-sync-options', async () => {
  automatic.checked = (await readValue('state','githubOptions'))?.automatic !== false;
  scheduler.schedule();
});
remember.addEventListener('change', async () => {
  if (!remember.checked) await writeValues('state', [['githubCredential',null]]);
  else if (connected && sessionToken) await saveCredential(sessionToken);
});
forget.addEventListener('click', async () => {
  connected = false; scheduler.stop(); sessionToken = ''; token.value = ''; remember.checked = false;
  await writeValues('state', [['githubCredential', null], ['githubOptions',{automatic:automatic.checked}]]);
  notifyConnectionChange();
  attention(''); forget.hidden = true; report('Disconnected on this device.');
});
window.addEventListener('inntake-connection-changed', () => { scheduler.stop(); restoreConnection().catch(() => {}); });
