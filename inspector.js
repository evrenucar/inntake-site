(() => {
  const room = document.querySelector('.room');
  const veil = room.querySelector('.room-veil');
  if (['localhost','127.0.0.1','[::1]'].includes(location.hostname)) {
    room.querySelector('.library-entry').href = 'http://127.0.0.1:4295/';
  }
  const guide = document.querySelector('#guidebook');
  const viewer = document.querySelector('.inspect-dialog');
  const drawer = document.querySelector('.storage-dialog');
  const title = viewer.querySelector('h2');
  const artButton = viewer.querySelector('.inspect-art');
  const canvas = artButton.querySelector('canvas');
  const caption = viewer.querySelector('.inspect-note');
  const interact = viewer.querySelector('.inspect-interact');
  const tuck = viewer.querySelector('.inspect-tuck');
  const link = viewer.querySelector('.inspect-link');
  const prev = guide.querySelector('.book-prev');
  const next = guide.querySelector('.book-next');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fullMotion = window.inntakeFullMotion;
  const allowMotion = () => fullMotion || !reduced.matches;
  document.documentElement.classList.toggle('full-motion',fullMotion);
  const duration = phase => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--inspect-'+phase));
  const ease = 'cubic-bezier(.33333,0,.66667,1)';
  let pickup, gesture, playFrame = 0, playAmount = 0, lastPlay = -Infinity, swallowClick = false;
  let showing, spread = 0, current, step = -1, afterClose;
  let geometry, layers = [], transition, amount = 0, lastPaint = -Infinity;

  // Notes belong to the illustrated demonstration collection, so each object
  // can be explored without fetching or exposing a visitor's saved library.
  const objects = {
    guides: ['book','Open field guide','Turn page','Three clothbound field guides, worn smooth at the corners.',[
      'A pressed leaf and its ink study. Drag the edge to lift the page.',
      'Ridge walk · The tallest peak sits just beyond the saddle.',
      'Night bearings · Match the brightest stars to the compass rose.']],
    sketchbooks: ['book','Open sketchbook','Turn page','A stack of workshop drawings.',[
      'An exploded drawing shows how the dovetail fits together. Drag the edge to lift the page.',
      'A marking knife picks out the measured cut.',
      'A hinge study marks the pivot in pencil.']],
    found: ['box','Open box','Look underneath','A small box of things picked up along the way.',[
      'A brass key lies on a ribbon. Slide the tray to peek underneath.',
      'A tiny compass lies beside two crystals.',
      'A wax-sealed letter and a little sprig lie at the bottom.']],
    parts: ['box','Lift the lid','Sort the parts','A workshop box for the pieces worth keeping.',[
      'A brass hinge and its screws. Slide the tray to look closer.',
      'Wooden pegs lie among the washers.',
      'A spring and cotter pins sit in the last compartment.']],
    potion: ['bottle','Uncork bottle','Tilt the bottle','A little glass flask for the trail.',[
      'The cork is out. Drag sideways to tip the blue flask.',
      'The liquid climbs one side as the bottle tips.',
      'A few bubbles rise when it tips the other way.']],
    references: ['bottle','Unstopper','Tilt the glass','Amber glass catches the window light.',[
      'Three marks on the amber glass. Tip it to meet the scale.',
      'The surface stays level while the glass tips.',
      'A glint travels across the shoulder of the bottle.']],
    notes: ['bottle','Lift the stopper','Tilt the jar','A squat little jar, sealed with a cork.',[
      'A folded note inside rose glass. Roll the jar to move it.',
      'Tilt the jar to bring its contents into the light.',
      'A little paper scroll catches on the glass.']],
    experiments: ['bottle','Open experiment','Swirl the flask','A workshop trial in a green glass flask.',[
      'Green flecks hang in the sample. Swirl the flask to stir them.',
      'Tilt the glass and watch the sample move.',
      'The last bubbles collect at the surface.']],
    finishes: ['bottle','Open varnish','Add a coat','A corked sample from the finishing bench.',[
      'Amber varnish beside a bare wood sample. Drag to try the brush.',
      'A first coat brings out the grain.',
      'The second coat deepens the amber.']],
    plant: ['plant','Tend the plant','Water again','A trailing plant with one long shoot reaching past the shelf.',[
      'A heart-leaf cutting. Brush the leaves to shake off a drop.',
      'A young shoot emerges between the leaves.',
      'The new leaves unfold toward the window.']],
    mortar: ['mortar','Grind a pinch','Grind again','A well-used mortar with its pestle still inside.',[
      'Ochre chips in the bowl. Drag the pestle through them.',
      'The pestle breaks the grains into smaller pieces.',
      'A fine powder gathers at the bottom.']],
    flowers: ['flowers','Unwrap specimen','Next specimen','A bundle of dried stems from the worktable.',[
      'A lavender spike, taped to the paper. Drag to shift the stem.',
      'Tiny florets have opened along the stem.',
      'Dry seed heads cling to the last stem.']]
  };

  // Sample the live room on a progressively coarser grid. Geometry is cached
  // until resize; the scene's own animation clock supplies updated light and dust.
  function measureRoom() {
    geometry = room.getBoundingClientRect();
    layers = [];
    for (const selector of ['.wall','.wall-painting','.shelf-scene','.grimoire','.mallet','.repo-map','.held','.sunlight']) {
      const source = room.querySelector(selector);
      if (!source || source.hidden || !source.width) continue;
      const rect = source.getBoundingClientRect();
      const transform = getComputedStyle(source).transform;
      const matrix = transform === 'none' ? null : new DOMMatrixReadOnly(transform);
      layers.push({source, x:rect.x+rect.width/2-geometry.x, y:rect.y+rect.height/2-geometry.y,
        angle:matrix ? Math.atan2(matrix.b,matrix.a) : 0,
        width:source.offsetWidth, height:source.offsetHeight, sun:selector === '.sunlight'});
    }
  }
  function refreshVeil(time = performance.now(), force = false) {
    if (!showing || !geometry || (!force && time-lastPaint < 55)) return;
    lastPaint = time;
    if (transition) {
      const t = Math.min(1,Math.max(0,(time-transition.start)/transition.duration));
      const ease = t*t*(3-2*t);
      amount = transition.from + (transition.to-transition.from)*ease;
      if (t === 1) transition = null;
    }
    const finalCell = Math.max(5,Math.min(geometry.width,geometry.height)/92);
    const cell = 2.2 + (finalCell-2.2)*amount;
    paintRoomSample(veil, cell);
  }
  function paintRoomSample(target, cell) {
    const w = Math.ceil(geometry.width/cell), h = Math.ceil(geometry.height/cell);
    if (target.width !== w || target.height !== h) { target.width=w; target.height=h; }
    const ctx=target.getContext('2d');
    ctx.setTransform(w/geometry.width,0,0,h/geometry.height,0,0);
    ctx.imageSmoothingEnabled=false;
    ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='#33271e'; ctx.fillRect(0,0,geometry.width,geometry.height);
    for (const layer of layers) {
      ctx.save();
      ctx.translate(layer.x,layer.y); ctx.rotate(layer.angle);
      ctx.globalCompositeOperation = layer.sun ? 'screen' : 'source-over';
      ctx.drawImage(layer.source,-layer.width/2,-layer.height/2,layer.width,layer.height);
      ctx.restore();
    }
  }
  window.revealInnRoom = () => {
    const cover = document.querySelector('.room-intro');
    if (!allowMotion() || getComputedStyle(cover).visibility === 'hidden') {
      cover.remove();
      return;
    }
    measureRoom();
    const start = performance.now();
    const durationMs = 1350;
    const levels = 24;
    let previous = -1;
    const fade = cover.animate([
      {filter:'brightness(0)', opacity:1},
      {filter:'brightness(1)', opacity:1, offset:.53},
      {filter:'brightness(1)', opacity:0}
    ], {duration:durationMs, fill:'both', easing:'ease-in-out'});
    function frame(time) {
      const progress = Math.max(0, (time-start)/(durationMs*.9));
      const step = Math.min(levels-1, Math.floor(progress*levels));
      if (step !== previous) {
        // Equal proportional changes keep the last few steps small.
        const cell = 32 * (2.6/32) ** (step/(levels-1));
        paintRoomSample(cover, cell);
        previous = step;
      }
      if (fade.playState === 'finished' || showing) cover.remove();
      else requestAnimationFrame(frame);
    }
    frame(start);
  };
  function changeVeil(to,duration) {
    if (allowMotion()) transition = {from:amount,to,duration,start:performance.now()};
    else { transition=null; amount=to; }
    refreshVeil(performance.now(),true);
  }
  window.refreshInnInspection = refreshVeil;
  new ResizeObserver(()=>{
    if (showing) { measureRoom(); refreshVeil(performance.now(),true); }
  }).observe(room);

  function present(dialog, source, focalPoint) {
    if (showing) return;
    showing = dialog;
    afterClose = null;
    measureRoom();
    const enterMs=duration('enter');
    amount=0; changeVeil(1,enterMs);
    room.classList.add('is-inspecting');
    room.dispatchEvent(new Event('inspectionchange'));
    dialog.classList.remove('leaving');
    dialog.showModal();
    dialog.querySelector('h2').focus({preventScroll:true});
    if (allowMotion() && focalPoint && source) {
      const start = source.getBoundingClientRect(), end = focalPoint.getBoundingClientRect();
      const x = start.x + start.width/2 - end.x - end.width/2;
      const y = start.y + start.height/2 - end.y - end.height/2;
      const scale = Math.min(1, start.width/Math.max(1,end.width), start.height/Math.max(1,end.height));
      pickup = focalPoint.animate([{transform:'translate('+x+'px,'+y+'px) scale('+scale+')'}, {transform:'none'}],
        {duration:enterMs,easing:ease});
    }
  }
  function dismiss(callback) {
    const dialog = showing;
    if (!dialog || dialog.classList.contains('leaving')) return;
    afterClose = callback || null;
    room.classList.remove('is-inspecting');
    dialog.classList.add('leaving');
    const leaveMs=duration('leave');
    changeVeil(0,leaveMs);
    const finish = () => {
      if (!dialog.open) return;
      dialog.close();
      finished(dialog);
    };
    if (!allowMotion()) finish();
    else setTimeout(finish,leaveMs);
  }
  function finished(dialog) {
    if (showing !== dialog || dialog.open) return;
    pickup?.cancel(); pickup = null;
    stopPlay();
    showing = null;
    current = null;
    transition=null; amount=0;
    dialog.classList.remove('leaving');
    room.classList.remove('is-inspecting');
    room.dispatchEvent(new Event('inspectionchange'));
    const callback = afterClose;
    afterClose = null;
    callback?.();
  }
  window.presentInnDrawer = origin => present(drawer,origin,drawer.querySelector('.drawer-stage'));
  window.dismissInnDrawer = callback => { if (showing === drawer) dismiss(callback); };
  for (const dialog of [viewer,guide,drawer]) {
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
    dialog.addEventListener('click', event => {
      if (dialog === drawer && event.target.matches('.drawer-stage canvas') && !touchesArt(event,event.target)) {
        dismiss(); return;
      }
      if (event.target === dialog || event.target.closest('[data-dismiss]') ||
          event.target.classList.contains('inspect-stage')) dismiss();
    });
    dialog.addEventListener('close', () => finished(dialog));
  }

  function turnBook(page) {
    spread = Math.max(0,Math.min(1,page));
    for (const leaf of guide.querySelectorAll('[data-spread]')) leaf.hidden = Number(leaf.dataset.spread) !== spread;
    prev.disabled = spread === 0;
    next.disabled = spread === 1;
    guide.querySelector('.folio').textContent = spread ? '3 – 4' : '1 – 2';
  }
  prev.addEventListener('click', () => { turnBook(spread-1); next.focus(); });
  next.addEventListener('click', () => { turnBook(spread+1); prev.focus(); });
  guide.addEventListener('keydown',event=>{
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      turnBook(spread + (event.key === 'ArrowRight' ? 1 : -1));
      (spread ? prev : next).focus();
    }
  });
  room.querySelector('.guide-opener').addEventListener('click',event=>{
    turnBook(0);
    present(guide,event.currentTarget,guide);
  });

  function drawCrop(source, crop) {
    const [x,y,width,height] = crop;
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source,x,y,width,height,0,0,width,height);
  }
  function paintObject(time=performance.now()) {
    const {id,kind,source,crop,floor} = current;
    if (floor && (id === 'mallet' || step >= 0)) window.paintInnFloorDetail(canvas,id,step);
    else if (step < 0) drawCrop(source,crop);
    else window.paintInnInterior(canvas,kind,step,{id,amount:playAmount,time});
  }
  function display() {
    const {id,intro,notes,first,nextAction,floor} = current;
    paintObject();
    artButton.style.setProperty('--shape',canvas.width/canvas.height);
    caption.textContent = step < 0 ? intro : notes[step];
    const last = step === notes.length-1;
    const action = step < 0 ? first : last ? (floor ? (id === 'map' ? 'Fold map' : 'See whole mallet') : 'See original') : nextAction;
    link.hidden = !current.href || (id === 'map' && step < 0);
    if (link.hidden) link.removeAttribute('href');
    else link.href=current.href;
    link.classList.toggle('library-glow',id === 'mallet');
    artButton.setAttribute('aria-label',action);
    interact.textContent = action;
  }

  function open(currentObject) {
    if (showing) return;
    current = currentObject;
    swallowClick = false;
    step = -1;
    title.textContent = current.name;
    tuck.hidden = !current.putAway;
    if (current.href) {
      link.textContent = current.linkText;
      link.target = current.id === 'map' ? '_blank' : '_self';
      link.rel = 'noopener noreferrer';
    } else link.removeAttribute('href');
    display();
    present(viewer,current.origin,artButton);
  }
  function advance() {
    if (!current) return;
    stopPlay();
    step = step + 1 >= current.notes.length ? -1 : step + 1;
    display();
    if (allowMotion()) canvas.animate([{opacity:.72, transform:'translateY(2px)'},{opacity:1,transform:'none'}],{duration:140});
  }
  // Drag the illustration itself. Only repaint while a hand is moving it
  // or during its short return to rest. Taps and keyboard activation still turn a page.
  function stopPlay() {
    cancelAnimationFrame(playFrame);
    playFrame=0; playAmount=0; gesture=null;
    artButton.classList.remove('is-playing');
  }
  function schedulePlay() {
    if (playFrame) return;
    function frame(time) {
      playFrame=0;
      if (!current || current.floor || step<0 || viewer.classList.contains('leaving')) return;
      if (time-lastPlay<1000/24) { playFrame=requestAnimationFrame(frame); return; }
      lastPlay=time;
      if (!gesture) playAmount=allowMotion()?playAmount*.65:0;
      if (Math.abs(playAmount)<.018) playAmount=0;
      paintObject(time);
      if (!gesture && playAmount) playFrame=requestAnimationFrame(frame);
    }
    playFrame=requestAnimationFrame(frame);
  }
  function touchesArt(event,surface=canvas) {
    const rect=surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const x=Math.floor((event.clientX-rect.left)*surface.width/rect.width);
    const y=Math.floor((event.clientY-rect.top)*surface.height/rect.height);
    return x>=0 && x<surface.width && y>=0 && y<surface.height &&
      surface.getContext('2d').getImageData(x,y,1,1).data[3]>=12;
  }
  artButton.addEventListener('pointerdown',event=>{
    swallowClick=false;
    if (!current || current.floor || !event.isPrimary || event.button!==0 || !touchesArt(event)) return;
    gesture={id:event.pointerId,x:event.clientX,width:Math.max(45,artButton.clientWidth*.35),moved:false};
    artButton.setPointerCapture(event.pointerId);
  });
  artButton.addEventListener('pointermove',event=>{
    if (!gesture || gesture.id!==event.pointerId) return;
    const dx=event.clientX-gesture.x;
    if (!gesture.moved && Math.abs(dx)<6) return;
    gesture.moved=true; artButton.classList.add('is-playing');
    if (step<0) { step=0; display(); }
    playAmount=Math.max(-1,Math.min(1,dx/gesture.width));
    schedulePlay();
  });
  function releasePlay(event) {
    if (!gesture || gesture.id!==event.pointerId) return;
    swallowClick=gesture.moved; gesture=null;
    artButton.classList.remove('is-playing');
    if (swallowClick) schedulePlay();
  }
  for (const event of ['pointerup','pointercancel','lostpointercapture']) artButton.addEventListener(event,releasePlay);
  interact.addEventListener('click',advance);
  artButton.addEventListener('click',event=>{
    if (event.detail && swallowClick) { swallowClick=false; return; }
    if (event.detail && !touchesArt(event)) { dismiss(); return; }
    advance();
  });
  tuck.addEventListener('click', () => dismiss(current?.putAway));

  for (const [selector,id] of [['.library-entry','mallet'],['.repo-entry','map']]) {
    const anchor = room.querySelector(selector);
    anchor.addEventListener('click',event=>{
      if (anchor.tagName === 'A' && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
      event.preventDefault();
      const source = anchor.querySelector('canvas');
      const mallet = id === 'mallet';
      open({id, floor:true, name:mallet?'Joiner’s mallet':'Find Source', source, crop:[0,0,source.width,source.height], origin:source,
        intro:mallet?'A battered wooden head on a long, hand-worn handle.':'A route marked in ink across the folds.',
        first:mallet?'Inspect the head':'Unfold map', nextAction:'', href:mallet ? anchor.href : anchor.dataset.repository,
        linkText:mallet?'Start your own Library':'Open GitHub repo',
        notes:[mallet?'A deep chip beside the socket exposes the grain. The striking face has rounded off with use.':'The map leads to the Inntake project repository.']});
    });
  }

  window.inspectShelfObject = function({id,name,origin,source,crop,putAway}) {
    const [kind,first,nextAction,intro,notes] = objects[id];
    open({id,name,origin,source,crop,putAway,kind,first,nextAction,intro,notes});
  };
})();
