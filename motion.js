// An explicit room preference survives a return to the plain landing URL.
(() => {
  const choice = new URLSearchParams(location.search).get('motion');
  const key = 'inntake-room-full-motion';
  let full = choice === 'on';
  try {
    if (full) localStorage.setItem(key, 'on');
    else if (choice === 'off') localStorage.removeItem(key);
    else full = localStorage.getItem(key) === 'on';
  } catch { /* The current URL still works when storage is unavailable. */ }
  window.inntakeFullMotion = full;
})();
