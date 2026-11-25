import {mounted, readValue} from './browser-store.js';
import {syncWorkspace} from './github-sync.js';

const panel = document.querySelector('#github-sync-panel');
const repo = panel.querySelector('[name=repository]');
const branch = panel.querySelector('[name=branch]');
const token = panel.querySelector('[name=token]');
const run = panel.querySelector('button');
const status = panel.querySelector('[role=status]');
const choices = panel.querySelector('.github-conflicts');
let resolutions = Object.create(null);
function report(message) { status.textContent = message; }
function showTime(iso) { return new Date(iso).toLocaleString(undefined, {dateStyle:'short', timeStyle:'short'}); }
if (mounted !== null) { repo.value = mounted; repo.readOnly = true; }
readValue('state', 'sync').then(state => {
  if (!state) return;
  repo.value = state.repo;
  repo.readOnly = true;
  branch.value = state.branch;
  branch.readOnly = true;
  report('Last synced ' + showTime(state.timestamp));
}).catch(() => report('Browser storage is unavailable.'));

run.addEventListener('click', async () => {
  run.disabled = true;
  const binding = {repo:repo.value, branch:branch.value.trim(), token:token.value};
  try {
    report('Checking repository…');
    const result = await syncWorkspace({...binding, report, resolutions});
    choices.replaceChildren();
    if (result.conflicts) {
      report('These changed on both devices. Choose each version, then sync again.');
      resolutions = Object.create(null);
      for (const {key, label, pair} of result.conflicts) {
        const field = document.createElement('label');
        field.className = 'field';
        field.append(label);
        const pick = document.createElement('select');
        for (const [caption, value] of [['Choose version',''], ['This device','local'], ['GitHub','remote']]) pick.add(new Option(caption, value));
        pick.addEventListener('change', () => { resolutions[key] = {pair, side:pick.value}; });
        field.append(pick);
        choices.append(field);
      }
      return;
    }
    resolutions = Object.create(null);
    repo.readOnly = true;
    branch.readOnly = true;
    report('Synced ' + result.items + (result.items === 1 ? ' item · ' : ' items · ') + showTime(result.timestamp));
    window.dispatchEvent(new Event('inntake-library-imported'));
  } catch (err) { report(err.message || 'Could not sync. Your local edits are saved.'); }
  finally { run.disabled = false; }
});
