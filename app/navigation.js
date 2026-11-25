// Shared by the inn and viewer, including the two local development origins.
(() => {
  const page = new URL(location.href);
  const arriving = page.searchParams.get('_inn') === '1';
  if (arriving) {
    page.searchParams.delete('_inn');
    history.replaceState(history.state, '', page);
    if (document.documentElement.dataset.innPage === 'library') document.documentElement.classList.add('inn-arriving');
  }
  const root = document.documentElement;
  let busy = false;
  function reset() {
    busy = false;
    root.classList.remove('inn-arriving','inn-crossing');
    root.style.removeProperty('--inn-page-filter');
    document.querySelector('.inn-blackout')?.remove();
  }
  async function transition(out, href) {
    if (busy) return;
    busy = true;
    const overlay = document.createElement('div');
    overlay.className = 'inn-blackout';
    overlay.setAttribute('aria-hidden','true');
    overlay.setAttribute('popover','manual');
    document.body.append(overlay);
    overlay.showPopover?.();
    const duration = out ? 780 : 1120;
    root.classList.add('inn-crossing');
    const fade = overlay.animate([{opacity:out?0:1},{opacity:out?1:0}],{duration,easing:'ease-in-out',fill:'forwards'});
    root.classList.remove('inn-arriving');
    const start = performance.now();
    function step(now) {
      const t = Math.min(1,Math.max(0,(now-start)/duration));
      const cell = Math.round((out?t:1-t)*4);
      root.style.setProperty('--inn-page-filter', cell ? 'url("#inn-pixels-'+cell+'")' : 'none');
      if (t<1 && busy) requestAnimationFrame(step);
    }
    step(start);
    await fade.finished.catch(()=>{});
    if (out) location.assign(href);
    else reset();
  }
  document.addEventListener('DOMContentLoaded', () => {
    const brand = document.querySelector('.library-brand');
    if (brand && location.hostname === '127.0.0.1' && ['4201','4295'].includes(location.port)) {
      brand.href = 'http://127.0.0.1:4310/' + (location.port === '4201' ? '?library=4201' : '');
    }
    // Sample one pixel from each tile and expand it into a square.
    const ns='http://www.w3.org/2000/svg';
    const defs=document.createElementNS(ns,'svg');
    defs.setAttribute('width','0'); defs.setAttribute('height','0');
    defs.setAttribute('aria-hidden','true'); defs.classList.add('inn-filter-defs');
    for (const [i,size] of [2,4,8,14].entries()) {
      const filter=document.createElementNS(ns,'filter');
      filter.id='inn-pixels-'+(i+1);
      filter.setAttribute('primitiveUnits','userSpaceOnUse');
      for(const [tag,attrs] of [
        ['feFlood',{x:0,y:0,width:1,height:1,'flood-color':'white'}],
        ['feOffset',{dx:0,dy:0,x:0,y:0,width:size,height:size}],
        ['feTile',{result:'dots'}],['feComposite',{in:'SourceGraphic',in2:'dots',operator:'in'}],
        ['feMorphology',{operator:'dilate',radius:size/2}]
      ]) {
        const el=document.createElementNS(ns,tag);
        for(const [key,value] of Object.entries(attrs)) el.setAttribute(key,value);
        filter.append(el);
      }
      defs.append(filter);
    }
    document.body.append(defs);
    if(root.classList.contains('inn-arriving')) {
      const reveal=()=>{if(root.classList.contains('inn-arriving'))transition(false);};
      window.addEventListener('inntake-viewer-ready',reveal,{once:true});
      setTimeout(reveal,1800);
    }
  });
  document.addEventListener('click',event=>{
    const link=event.target.closest('a');
    if(!link || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target==='_blank')return;
    const url=new URL(link.href);
    const brand=link.matches('.library-brand') && url.pathname==='/' && (location.pathname.startsWith('/app/') || ['4295','4201'].includes(location.port));
    const enter=link.matches('.inspect-link,.storage-dialog a') && (url.pathname.startsWith('/app/') || ['4295','4201'].includes(url.port));
    if (!brand && !enter) return;
    event.preventDefault();
    url.searchParams.set('_inn','1');
    transition(true,url.href);
  });
  window.addEventListener('pageshow',event=>{if(event.persisted)reset();});
})();
