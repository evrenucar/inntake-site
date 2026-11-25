// A bookmark carries a repository name. GitHub authenticates each visitor separately.
const bookmarkKey = 'inntake-shared-libraries-v1';
const repoPattern = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?\/[a-z0-9_.-]{1,100}$/i;

export function repositoryName(value) {
  const name = String(value).trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '').replace(/\.git$/i, '');
  if (!repoPattern.test(name) || /^\.{1,2}$/.test(name.split('/')[1])) {
    throw new Error('Enter a GitHub repository as owner/name.');
  }
  return name.toLowerCase();
}

function libraryURL(repository) {
  const url = new URL(location.pathname, location.origin);
  if (repository) url.searchParams.set('library', repository);
  return url.href;
}

function node(tag, text) {
  const result = document.createElement(tag);
  if (text) result.textContent = text;
  return result;
}

function renderMounts(root) {
  const current = new URL(location.href).searchParams.get('library');
  if (current !== null) {
    const brand = document.querySelector('.library-brand');
    const search = document.querySelector('#search');
    if (repoPattern.test(current)) {
      document.title = current + ' · Inntake';
      const subtitle = node('span', current);
      if (brand) brand.replaceChildren('Shared library', subtitle);
      if (search) {
        search.placeholder = 'Search ' + current + ' or paste a link…';
        search.setAttribute('aria-label', search.placeholder);
      }
    }
    const link = node('a', 'Back to my library');
    link.href = libraryURL();
    root.append(link);
    return;
  }
  const details = node('details');
  details.append(node('summary', 'Shared collections'));
  const label = node('label', 'Private collection repository');
  label.className = 'field';
  const input = node('input');
  input.placeholder = 'owner/collection';
  input.autocapitalize = 'none';
  input.spellcheck = false;
  input.required = true;
  label.append(input);
  const form = node('form');
  const button = node('button', 'Add shortcut');
  button.type = 'submit';
  const list = node('ul');
  const status = node('p');
  status.className = 'hint';
  status.setAttribute('role', 'status');
  form.append(label, button);
  details.append(list, form, status);
  root.append(details);

  function read() {
    const saved = JSON.parse(localStorage.getItem(bookmarkKey) || '[]');
    if (!Array.isArray(saved)) throw new Error('Could not read saved shortcuts.');
    return [...new Set(saved.map(repositoryName))];
  }
  function refresh() {
    list.replaceChildren();
    for (const name of read()) {
      const item = node('li');
      const link = node('a', name);
      link.href = libraryURL(name);
      const remove = node('button', 'Remove shortcut');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove shortcut to ' + name);
      remove.addEventListener('click', () => {
        try {
          localStorage.setItem(bookmarkKey, JSON.stringify(read().filter(value => value !== name)));
          refresh();
          status.textContent = 'Shortcut removed.';
        } catch (error) { status.textContent = error.message; }
      });
      item.append(link, document.createTextNode(' '), remove);
      list.append(item);
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const name = repositoryName(input.value);
      localStorage.setItem(bookmarkKey, JSON.stringify([...new Set([...read(), name])]));
      refresh();
      input.value = '';
      status.textContent = 'Open the shortcut to connect this collection.';
    } catch (error) { status.textContent = error.message; }
  });
  try { refresh(); } catch (error) { status.textContent = error.message; }
}

const root = document.querySelector('#github-mounts');
if (root) renderMounts(root);
