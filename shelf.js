'use strict';

const room = document.querySelector('.room');
const cabinet = room.querySelector('.cabinet');
const controls = cabinet.querySelector('.shelf-controls');
const label = cabinet.querySelector('.tag');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const fullMotionPreview = window.inntakeFullMotion;
const reduceMotion = () => reduced.matches && !fullMotionPreview;
const names = {
  field: ['Field notes', 'shelf'], guides: ['Field guides', 'book'], potion: ['Take with you', 'vial'],
  found: ['Found items', 'box'], references: ['References', 'page'], notes: ['Notes', 'note'],
  plant: ['Toughts_While_Outside', 'leaf'], workshop: ['Workshop', 'shelf'], mortar: ['Mixing recipes', 'bowl'],
  flowers: ['Material studies', 'leaf'], parts: ['Spare parts', 'box'], sketchbooks: ['Sketchbooks', 'book'],
  experiments: ['Experiments', 'vial'], finishes: ['Finishes', 'vial'], all: ['All items', 'drawer'],
  collections: ['Collections', 'shelf'], unfiled: ['Unfiled', 'page']
};
const icons = {
  shelf: ['100000001','101101101','101101101','111111111','100000001','101011101','111111111'],
  book: ['111110000','100001111','101001001','100001011','101001001','100001001','111111111'],
  vial: ['0011100','0001000','0011100','0010100','0100010','0111110','1111111','0111110'],
  box: ['011111110','111111111','100000001','111111111','100101001','100000001','111111111'],
  page: ['01111100','01000110','01000111','01000001','01011101','01000001','01111111'],
  note: ['01111100','11000100','01011100','11000100','01011100','11000100','01111100'],
  leaf: ['00001111','00011101','00111011','01110110','01101100','01111000','11000000','10000000'],
  bowl: ['00000110','00001110','00011100','11111111','01000010','00111100','00111100'],
  drawer: ['111111111','100000001','100111001','100000001','111111111','010000010']
};
const initialRows = [
  ['guides','potion','found','references','notes','plant'],
  ['mortar','flowers','parts','sketchbooks','experiments','finishes']
];
const fixed = {
  field: [130,412,1245,38], workshop: [66,725,1390,41],
  all: [148,784,386,181], collections: [571,784,398,181], unfiled: [1004,784,380,181]
};
const rails = ['field','workshop'];
const isRail = id => rails.includes(id);
const tones = [
  '#211914','#2a1c16','#312117','#3b271c','#50311f','#66391f','#804526','#9a542a',
  '#b46830','#cf813a','#e39a47','#f7b853','#ffd576','#ffe9ad',
  '#4e3432','#734941','#a15f4c','#ca7954','#e3936d','#eeb18b',
  '#303e31','#46533a','#5c6a46','#7c854d','#a3a460','#beba6e',
  '#425953','#638177','#8ba793','#78566a','#b58793','#be9270','#e8bd8b'
].map(hex => [1,3,5].map(k => parseInt(hex.slice(k,k+2),16)));
const swatches = new Map();
function pigment(r,g,b) {
  const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
  if (!swatches.has(key)) {
    let best = 0, distance = Infinity;
    tones.forEach(([red,green,blue],i) => {
      const d = (red-r)**2 + 1.2*(green-g)**2 + .8*(blue-b)**2;
      if (d < distance) { distance = d; best = i; }
    });
    swatches.set(key,tones[best]);
  }
  return swatches.get(key);
}
function bitmap(w,h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return canvas;
}
function imageAt(src) {
  const img = new Image();
  img.src = './assets/' + src;
  return img.decode().then(() => img);
}

// Each highlight comes from an existing lit surface in the illustration.
// Transparent pixels, cast shadows and recesses stay dark.
function material(image,crop,w,h) {
  const base = bitmap(w,h), light = bitmap(w,h);
  const ctx = base.getContext('2d'), lit = light.getContext('2d');
  ctx.drawImage(image,...crop,0,0,w,h);
  const diffuse = ctx.getImageData(0,0,w,h), shine = lit.createImageData(w,h);
  const d = diffuse.data, s = shine.data;
  for (let i=0;i<d.length;i+=4) {
    if (!d[i+3]) continue;
    const [r,g,b] = pigment(d[i],d[i+1],d[i+2]);
    d[i]=r; d[i+1]=g; d[i+2]=b;
    const local = Math.max(0,Math.min(1,(.29*r + .58*g + .13*b - 43) / 150));
    const warm = pigment(Math.min(255,r*1.20+19),Math.min(255,g*1.19+12),Math.min(255,b*1.12+5));
    s[i]=warm[0]; s[i+1]=warm[1]; s[i+2]=warm[2]; s[i+3]=Math.round(d[i+3]*local);
  }
  ctx.putImageData(diffuse,0,0); lit.putImageData(shine,0,0);
  return {base,light};
}
function drawIcon(type, canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,9,9); ctx.fillStyle = '#e9b779';
  const glyph = icons[type];
  glyph.forEach((row,y) => [...row].forEach((pixel,x) => {
    if (pixel === '1') ctx.fillRect(x, y + (glyph.length < 8 ? 1 : 0), 1, 1);
  }));
}
function loadOrder() {
  try {
    const order = JSON.parse(localStorage.getItem('inntake-shelf-order-v1'));
    const expected = [...initialRows.flat()].sort().join();
    if (Array.isArray(order) && order.length === 2 && order.every(r => Array.isArray(r) && r.every(id => typeof id === 'string')) &&
        order.flat().sort().join() === expected) return order;
  } catch {}
  return initialRows.map(r=>r.slice());
}

async function mount() {
  const [back,atlas,spec] = await Promise.all([
    imageAt('shelf-empty.png'), imageAt('shelf-objects.png'),
    fetch('./assets/shelf-objects.json').then(r=>r.json())
  ]);
  const {width:W,height:artHeight} = spec;
  // Extend the plain timber below the handles, giving the drawer plates their own space.
  const drawerBand = {top: 863, bottom: 897, extra: 64};
  const H = artHeight + drawerBand.extra;
  function cabinetY(y) {
    const part = Math.max(0, Math.min(1, (y - drawerBand.top) / (drawerBand.bottom - drawerBand.top)));
    return y + part * drawerBand.extra;
  }
  function tallerCabinet(image) {
    const result = bitmap(image.width, Math.round(image.height * H / artHeight));
    const painter = result.getContext('2d');
    painter.imageSmoothingEnabled = false;
    const cuts = [0, drawerBand.top, drawerBand.bottom, artHeight];
    for (let i = 1; i < cuts.length; i++) {
      const from = Math.round(cuts[i-1] * image.height / artHeight);
      const to = Math.round(cuts[i] * image.height / artHeight);
      const y = Math.round(cabinetY(cuts[i-1]) * result.height / H);
      const bottom = Math.round(cabinetY(cuts[i]) * result.height / H);
      painter.drawImage(image, 0, from, image.width, to-from, 0, y, result.width, bottom-y);
    }
    return result;
  }
  const shelf = cabinet.querySelector('.shelf-scene'), ctx = shelf.getContext('2d');
  const wall = room.querySelector('.wall'), wc = wall.getContext('2d');
  const sunlight = window.createInnSunlight(room.querySelector('.sunlight'));
  const held = bitmap(1,1);
  held.className = 'held'; held.ariaHidden = 'true'; room.append(held);
  const hc = held.getContext('2d');
  const wood = material(back,[0,0,back.width,back.height],540,360);
  const colors = {base: tallerCabinet(wood.base), light: tallerCabinet(wood.light)};
  // The first opaque pixel in a column is a real place to land, even on a
  // curved flask or an irregular stack of books with transparent padding.
  function upperEdge(canvas,fraction) {
    const x=Math.min(canvas.width-1,Math.floor(canvas.width*fraction));
    const column=canvas.getContext('2d').getImageData(x,0,1,canvas.height).data;
    for (let y=0;y<canvas.height;y++) {
      if (column[4*y+3]>190) return {x:(x+.5)/canvas.width,y:y/canvas.height};
    }
    return null;
  }
  const shapes = {};
  for (const [id,{atlas:crop,source}] of Object.entries(spec.objects)) {
    const size = source.slice(2).map(v=>Math.max(1,Math.round(v*540/W)));
    const sprite=material(atlas,crop,...size);
    shapes[id] = {...sprite,source,perch:upperEdge(sprite.base,.48)};
  }
  const buttons = {}, spots = {};
  const order = loadOrder();
  const storageKey = 'inntake-tucked-items-v1';
  const stored = {};
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey)) || {};
    let migrated = false;
    for (const [id, place] of Object.entries(saved)) {
      if (!Object.hasOwn(shapes,id) || !Object.hasOwn(fixed,place)) continue;
      if (!isRail(place)) { stored[id] = place; continue; }
      // Older previews stored hidden shelf items. Put each one back on its named shelf.
      const destination = order[rails.indexOf(place)];
      if (!destination.includes(id)) {
        const origin = order.find(row => row.includes(id));
        origin.splice(origin.indexOf(id),1);
        destination.push(id);
      }
      migrated = true;
    }
    if (migrated) {
      localStorage.setItem('inntake-shelf-order-v1',JSON.stringify(order));
      localStorage.setItem(storageKey,JSON.stringify(stored));
    }
  } catch {}
  const storageDialog = document.querySelector('.storage-dialog');
  const fly = window.createInnFly();
  const flyRoom = {perches:[],intensity:sunlight.intensity};
  function updatePerches() {
    if (!box || !roomBox.width || !roomBox.height) return;
    const perches=[];
    function add(id,x,y) {
      perches.push({id,x:(x-roomBox.left)/roomBox.width,y:(y-roomBox.top)/roomBox.height});
    }
    for (const [id,shape] of Object.entries(shapes)) {
      const edge=shape.perch;
      if (!edge || stored[id] || (pose?.dragging && pose.id===id)) continue;
      const [x,y,w,h]=spots[id];
      add('shelf-'+id,box.left+(x+w*edge.x)*box.width/W,box.top+(y+h*edge.y)*box.height/H);
    }
    for (const [selector,column] of [['.wall-painting',.68],['.grimoire',.56],['.mallet',.22],['.repo-map',.62]]) {
      const art=room.querySelector(selector), edge=upperEdge(art,column);
      if(!edge) continue;
      const rect=art.getBoundingClientRect();
      const css=getComputedStyle(art).transform;
      const matrix=css==='none'?null:new DOMMatrixReadOnly(css);
      const rotation=matrix?Math.atan2(matrix.b,matrix.a):0;
      const dx=(edge.x-.5)*art.offsetWidth, dy=(edge.y-.5)*art.offsetHeight;
      add(selector,rect.left+rect.width/2+dx*Math.cos(rotation)-dy*Math.sin(rotation),
        rect.top+rect.height/2+dx*Math.sin(rotation)+dy*Math.cos(rotation));
    }
    flyRoom.perches=perches;
  }
  const hint = cabinet.querySelector('.shelf-tip');
  const shiftHint = hint.textContent;
  let hintSeen = false;
  let hideHintTimer, tuckAnimation, depth;

  function hideHint() {
    clearTimeout(hideHintTimer);
    hint.hidden = true;
  }
  function showShiftHint() {
    if (hintSeen || document.hidden || document.querySelector('dialog[open]')) return;
    hintSeen = true;
    hint.textContent = shiftHint;
    hint.hidden = false;
    hideHintTimer = setTimeout(hideHint, 4200);
  }
  // Trace the cutouts under the wooden apron so the paving is visible between the feet.
  const apron = [[728,496],[676,496],[674,482],[670,476],[661,470],[603,470],
    [595,478],[557,478],[550,470],[430,470],[416,472],[402,477],[400,482],[368,482],
    [362,476],[351,474],[344,470],[223,470],[216,478],[180,478],[173,472],
    [169,470],[110,470],[100,474],[94,481],[91,496],[37,496]];
  const cabinetOutline = [[.031,.052],[.156,.048],[.166,.022],[.206,.018],[.226,.047],[.397,.046],[.416,.032],[.576,.032],[.594,.047],[.779,.047],[.792,.021],[.829,.019],[.850,.046],[.964,.049],[.972,.061],[.969,.094],[.954,.105],[.941,.107],[.941,.708],[.956,.712],[.957,.751],[.942,.753],[.942,.898],[.958,.902],...apron.map(([x,y]) => [x/768,y/512]),[.048,.905],[.056,.902],[.056,.754],[.041,.751],[.041,.715],[.059,.708],[.059,.109],[.039,.102],[.032,.094]];
  const fixedIDs = Object.keys(fixed);
  const plates = {};
  const plateLayer = cabinet.querySelector('.nameplates');
  for (const id of fixedIDs) {
    const isRail = id === 'field' || id === 'workshop';
    const [x, y, w, h] = fixed[id];
    const plate = document.createElement('span');
    const icon = bitmap(9,9);
    plate.className = 'plate' + (isRail ? '' : ' drawer');
    plate.style.left = (isRail ? (id === 'field' ? 137 : 112) : x + w/2) / W * 100 + '%';
    plate.style.top = (isRail ? y + h/2 : 916) / H * 100 + '%';
    drawIcon(names[id][1], icon);
    plate.append(icon, document.createTextNode(names[id][0]));
    plateLayer.append(plate);
    plates[id] = plate;
  }
  let hover = null, focus = null, pose = null, target = null;
  let box, roomBox, drag, raf = 0, lastAmbient = -Infinity, seconds = 0, tickFrame = 0;
  let sliding = new Map();
  const status = document.querySelector('#shelf-status');
  const active = () => pose?.id || hover || focus;
  const originalRow = id => initialRows[0].includes(id) ? 0 : 1;
  const rowOf = id => order[0].includes(id) ? 0 : 1;
  const surface = [413,726];

  function putButton(id) {
    const b = document.createElement('button');
    b.type='button'; b.className='prop' + (shapes[id] ? ' movable' : '');
    b.dataset.id=id;
    b.setAttribute('aria-label', names[id][0]);
    if (!isRail(id)) b.setAttribute('aria-haspopup','dialog');
    if (shapes[id]) b.setAttribute('aria-keyshortcuts','Enter Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown H');
    // The plant trails in front of a second shelf. Its transparent lower corners
    // must leave the glass bottles and drawer handles underneath reachable.
    if (id==='plant') b.style.clipPath='polygon(0 13%,12% 9%,16% 2%,52% 0,67% 9%,79% 10%,80% 20%,99% 27%,100% 44%,85% 44%,78% 67%,69% 100%,54% 100%,56% 77%,45% 60%,34% 47%,33% 38%,19% 37%,17% 24%,2% 25%)';
    controls.append(b); buttons[id]=b;
  }
  for (const id of [...fixedIDs,...order.flat().filter(id=>id!=='plant'),'plant']) putButton(id);
  // These are the load-bearing ends of each shelf. The upper foliage may
  // trail past the post in the original composition; its pot rests well inside.
  const shelfEnds=[[156,1378],[150,1378]], gap=12, smallestScale=.90;
  const pieceScale=(id,row)=>id==='plant'&&row===1 ? .64 : 1;
  const visible=(ids)=>ids.filter(id=>!stored[id]);
  const footprint=(ids,row,scale)=>ids.reduce((width,id)=>width+shapes[id].source[2]*pieceScale(id,row)*scale,0)
    + Math.max(0,ids.length-1)*gap;
  function fits(ids,row) {
    return footprint(ids,row,smallestScale)<=shelfEnds[row][1]-shelfEnds[row][0];
  }
  function hasRoomFor(ids,row,old) {
    // Imported layouts may pre-date capacity limits. Preserve them and allow
    // moves that reduce their load; a new move cannot make one more crowded.
    return fits(ids,row) || footprint(ids,row,1)<=footprint(old,row,1);
  }
  function capacityMessage(row) {
    const message='No room on '+names[rails[row]][0]+'. Move an object to a drawer first.';
    status.textContent=message;
    clearTimeout(hideHintTimer);
    setTimeout(()=>{
      hint.textContent=message; hint.hidden=false;
      hideHintTimer=setTimeout(hideHint,2500);
    },0);
  }
  function layout() {
    for (const [id,rect] of Object.entries(fixed)) spots[id] = rect.slice();
    for(const [id,shape] of Object.entries(shapes)) if(!spots[id]) spots[id]=shape.source.slice();
    order.forEach((all,row) => {
      const ids=visible(all);
      if (!ids.length) return;
      // Preserve exactly the artist's starting placement, including any gaps
      // from hidden stock, until this shelf's order actually changes.
      if (all.length === initialRows[row].length && all.every((id,i)=>id===initialRows[row][i])) {
        ids.forEach(id=>spots[id]=shapes[id].source.slice());
        return;
      }
      const [left,right]=shelfEnds[row], gaps=ids.length-1;
      const total=footprint(ids,row,1)-gaps*gap;
      const fit=Math.min(1,(right-left-gaps*gap)/total);
      const occupied=total*fit+gaps*gap;
      // Allow modest breathing room but avoid scattering a sparse pair to the
      // very ends. Symmetric margins keep all bases on timber.
      const spacing=gaps ? Math.min(62,gap+(right-left-occupied)/gaps) : 0;
      let x=left+(right-left-total*fit-spacing*gaps)/2;
      ids.forEach(id=>{
        const [,oy,w,h]=shapes[id].source, scale=fit*pieceScale(id,row);
        spots[id]=[x,surface[row]-(surface[originalRow(id)]-oy)*scale,w*scale,h*scale];
        x+=w*scale+spacing;
      });
    });
    for (const [id,[x,y,w,h]] of Object.entries(spots)) {
      const rail = id === 'field' || id === 'workshop';
      const left = rail ? 73 : x, top = rail ? y-55 : y;
      const hitWidth = rail ? x+w-left : w, hitHeight = rail ? h+95 : h;
      Object.assign(buttons[id].style,{left:left/W*100+'%',top:top/H*100+'%',width:hitWidth/W*100+'%',height:hitHeight/H*100+'%'});
      if (rail) buttons[id].style.clipPath = 'polygon(0 0,6% 0,6% 40%,100% 40%,100% 70%,6% 70%,6% 100%,0 100%)';
    }
    updatePerches();
  }
  function annotate() {
    const id = active();
    for (const key of fixedIDs) plates[key].classList.toggle('is-lit', key === (pose?.dragging ? target : id));
    if (!id || fixed[id] || pose) { label.hidden=true; return; }
    if (label.dataset.id !== id) {
      label.dataset.id=id; label.querySelector('span').textContent=names[id][0];
      drawIcon(names[id][1], label.querySelector('canvas'));
    }
    label.hidden=false;
    const [x,y,w]=spots[id];
    const rect = label.getBoundingClientRect();
    const anchorX=(x+w*.5)*box.width/W;
    const anchorY=y*box.height/H;
    const limitLeft = Math.max(1,-box.left+3), limitRight = Math.min(box.width-rect.width,innerWidth-box.left-rect.width-3);
    label.style.left=Math.round(Math.max(limitLeft,Math.min(limitRight,anchorX-rect.width/2)))+'px';
    label.style.top=Math.round(anchorY-rect.height-3)+'px';
  }
  function paintRoom() {
    const {width, height} = wall;
    const frame = {
      x: (box.left-roomBox.left)*width/roomBox.width,
      y: (box.top-roomBox.top)*height/roomBox.height,
      width: box.width*width/roomBox.width,
      height: box.height*height/roomBox.height
    };
    const seamY = Math.round(frame.y + frame.height * .89);
    window.paintInnSurfaces(wc, {width, height, seamY, cabinet:frame});
    sunlight.resize(width, height, seamY, frame);
  }
  function drawPiece(c,id,rect,highlight) {
    const item=shapes[id];
    c.drawImage(item.base,...rect);
    if (highlight>.01) {
      c.globalAlpha=highlight; c.drawImage(item.light,...rect); c.globalAlpha=1;
    }
  }
  function boundsAt(id,time) {
    const goal=spots[id], slide=sliding.get(id);
    if (!slide) return goal;
    const t=Math.min(1,(time-slide.start)/290);
    if (t>=1) { sliding.delete(id); return goal; }
    const ease=(1-t)**3;
    return goal.map((value,i)=>value+(slide.from[i]-value)*ease);
  }
  function renderShelf(time) {
    const width=shelf.width,height=shelf.height, id=active();
    ctx.setTransform(width/W,0,0,height/H,0,0);
    ctx.clearRect(0,0,W,H);
    ctx.drawImage(depth.behind,0,0,W,H);
    ctx.save(); ctx.beginPath();
    cabinetOutline.forEach(([x,y],i)=>i?ctx.lineTo(x*W,cabinetY(y*artHeight)):ctx.moveTo(x*W,cabinetY(y*artHeight)));
    ctx.closePath(); ctx.clip(); ctx.drawImage(colors.base,0,0,W,H);
    ctx.globalAlpha=.1; ctx.drawImage(colors.light,0,0,W,H); ctx.globalAlpha=1;
    const litPlace = pose?.dragging ? target : id;
    if (fixed[litPlace]) {
      const [x,y,w,h]=fixed[litPlace];
      ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
      ctx.drawImage(colors.light,0,0,W,H); ctx.restore();
    }
    ctx.restore();
    ctx.drawImage(depth.inset,0,0,W,H);
    const paintOrder=order.flat().filter(k=>k!=='plant').concat('plant');
    for (const key of paintOrder) {
      if (stored[key] || key===pose?.id) continue;
      const rect=boundsAt(key,time);
      const centerX = (box.left-roomBox.left + (rect[0]+rect[2]*.5)*box.width/W)/roomBox.width;
      const centerY = (box.top-roomBox.top + (rect[1]+rect[3]*.35)*box.height/H)/roomBox.height;
      const dapple = .06 + .53 * sunlight.intensity(centerX, centerY);
      const onLitShelf = isRail(litPlace) && rowOf(key) === rails.indexOf(litPlace);
      const highlight=key===id ? 1 : key===target ? .8 : onLitShelf ? Math.max(.43,dapple) : dapple;
      drawPiece(ctx,key,rect,highlight);
    }
    if (tuckAnimation) {
      const {id, from, end, start} = tuckAnimation;
      const t = Math.max(0, Math.min(1, (time-start)/190));
      if (t >= 1) tuckAnimation = null;
      else {
        const remaining = (1-t)**2;
        const cx = end[0] + (from[0]+from[2]/2-end[0])*remaining;
        const cy = end[1] + (from[1]+from[3]/2-end[1])*remaining;
        const w = from[2]*remaining, h = from[3]*remaining;
        drawPiece(ctx,id,[cx-w/2,cy-h/2,w,h],.22);
      }
    }
    hc.setTransform(1,0,0,1,0,0);
    hc.clearRect(0,0,held.width,held.height);
    if (pose && !stored[pose.id]) {
      const {id,x,y,pivotX,pivotY,angle}=pose, r=spots[id];
      const scale=box.width/W, px=held.width/roomBox.width, py=held.height/roomBox.height;
      hc.setTransform(px,0,0,py,0,0);
      hc.translate(box.left-roomBox.left+r[0]*scale+x+pivotX, box.top-roomBox.top+r[1]*scale+y+pivotY);
      hc.rotate(angle); hc.translate(-pivotX,-pivotY);
      drawPiece(hc,id,[0,0,r[2]*scale,r[3]*scale],1);
    }
    hc.setTransform(1,0,0,1,0,0);
    if (!reduceMotion() && !document.hidden) fly.draw(hc,time,flyRoom);
    window.refreshInnInspection?.(time);
  }
  function repaint() {
    if (!raf && !document.hidden) raf=requestAnimationFrame(t=>{
      raf=0; renderShelf(t);
      if (sliding.size || tuckAnimation) repaint();
    });
  }
  function animate(t) {
    if (t-lastAmbient>=1000/12) {
      seconds=t/1000; lastAmbient=t;
      sunlight.draw(seconds); repaint();
    }
    tickFrame=requestAnimationFrame(animate);
  }
  function syncMotion() {
    cancelAnimationFrame(tickFrame); tickFrame=0;
    if (document.hidden || reduceMotion()) fly.pause();
    if (document.hidden) return;
    if (reduceMotion()) { sliding.clear(); tuckAnimation=null; seconds=0; sunlight.draw(seconds); repaint(); }
    else tickFrame=requestAnimationFrame(animate);
  }
  function resize() {
    box=cabinet.getBoundingClientRect(); roomBox=room.getBoundingClientRect();
    const density=Math.max(1.65,box.width/540,roomBox.width/820);
    // Use square pixels at the cabinet artwork's 24:17 ratio, even on ultrawide screens.
    const units = Math.max(1, Math.round(Math.min(540, box.width / 1.65) / 24));
    shelf.width = 24 * units;
    shelf.height = 17 * units;
    held.width=Math.ceil(roomBox.width/density); held.height=Math.ceil(roomBox.height/density);
    const cell = Math.max(2.2, roomBox.width/540, roomBox.height/380);
    wall.width=Math.ceil(roomBox.width/cell);wall.height=Math.ceil(roomBox.height/cell);
    hc.imageSmoothingEnabled=ctx.imageSmoothingEnabled=false;
    depth = window.createCabinetDepth({width:shelf.width, height:shelf.height});
    paintRoom(); updatePerches(); sunlight.draw(seconds); annotate(); renderShelf(performance.now());
  }

  function changeSelection() { annotate(); repaint(); }
  function refreshStorage() {
    for (const id of Object.keys(shapes)) buttons[id].hidden = Boolean(stored[id]);
    for (const place of fixedIDs) {
      const count = Object.values(stored).filter(value => value === place).length;
      if (count) plates[place].dataset.count = '· ' + count;
      else delete plates[place].dataset.count;
      buttons[place].setAttribute('aria-label', names[place][0] + (count ? ', ' + count + ' tucked away' : ''));
    }
  }
  function saveStorage() {
    try { localStorage.setItem(storageKey, JSON.stringify(stored)); } catch {}
    refreshStorage();
  }
  const finds=window.innDrawerFinds();
  const floorItems=[
    ['guide-opener','Guidebook'],['library-entry','Library mallet'],['repo-entry','Find Source']
  ];
  function localInventory() {
    try {
      const data=JSON.parse(localStorage.getItem('inntake-local-library-v1'));
      if(data?.version!==1 || !Array.isArray(data.items)) return [];
      return data.items.filter(item=>typeof item?.id==='string'&&item.id&&!item.trashed&&!item.archived).map(item=>({
        id:item.id,name:typeof item.title==='string'&&item.title.trim()?item.title:String(item.url||'Untitled link'),
        location:Array.isArray(item.collections)&&item.collections.length ? item.collections.join(', ') : item.collection || 'All items',
        href:'./app/?item='+encodeURIComponent(item.id)
      }));
    } catch {return [];}
  }
  function inspectOnShelf(id) {
    hideHint();
    window.inspectShelfObject({id, name:names[id][0], origin:buttons[id], source:atlas,
      crop:spec.objects[id].atlas, putAway:()=>tuck(id,'unfiled')});
  }
  function openDrawer(place,selected=null) {
    const stage=storageDialog.querySelector('.drawer-stage');
    storageDialog.querySelector('#storage-title').textContent=names[place][0];
    const objects=order.flat().map(id=>({
      id,name:names[id][0],sprite:shapes[id].base,group:names[rails[rowOf(id)]][0],
      location:names[stored[id] || rails[rowOf(id)]][0],drawer:stored[id],
      visit:()=>stored[id] ? openDrawer(stored[id],id) :
        window.dismissInnDrawer(()=>inspectOnShelf(id))
    }));
    const findRecords=Object.values(finds).flat().map(find=>({...find,location:names[find.place][0],
      visit:()=>openDrawer(find.place,find.id)}));
    const floor=floorItems.map(([cls,name])=>({
      id:cls,name,location:'Room floor',visit:()=>window.dismissInnDrawer(()=>room.querySelector('.'+cls)?.click())
    }));
    const tray=[...objects.filter(item=>item.drawer===place),...findRecords.filter(item=>item.place===place)];
    const allItems=[...objects,...findRecords,...floor];
    const returnItem=id=>{
      const original=rowOf(id);
      let destination=original;
      const available=(row)=>fits([...visible(order[row]),id],row);
      if(!available(original)) {
        destination=1-original;
        if(!available(destination)) return 'Both shelves are full. Tuck away a larger object first.';
      }
      window.dismissInnDrawer(()=>{
        if(destination!==original) {
          order[original].splice(order[original].indexOf(id),1);order[destination].push(id);
          try{localStorage.setItem('inntake-shelf-order-v1',JSON.stringify(order));}catch{}
        }
        delete stored[id];
        layout();saveStorage();
        buttons[id].focus({preventScroll:true});
        status.textContent=names[id][0]+' returned to '+names[rails[destination]][0]+'.';
        changeSelection();
      });
      return '';
    };
    window.paintInnDrawer(stage,place,{tray,allItems,groups:rails.map(id=>names[id][0]),
      library:place==='all'?localInventory():[],selected,returnItem});
    hideHint();
    if(!storageDialog.open) window.presentInnDrawer(buttons[place]);
  }
  function tuck(id, place, clientX) {
    if (!shapes[id] || !fixed[place] || isRail(place) || stored[id]) return;
    const from = spots[id].slice();
    if (pose?.id === id) {
      from[0] += pose.x*W/box.width;
      from[1] += pose.y*H/box.height;
    }
    if (!reduceMotion()) {
      const [left,top,w,h] = fixed[place];
      const endX = Number.isFinite(clientX)
        ? Math.max(left, Math.min(left+w, (clientX-box.left)*W/box.width))
        : left+w/2;
      tuckAnimation = {id, from, start:performance.now(), end:[endX,top+h*.45]};
    }
    const hadFocus = document.activeElement === buttons[id];
    stored[id] = place;
    sliding.delete(id);
    layout();
    hover = focus = target = null;
    saveStorage();
    if (hadFocus) buttons[place].focus({preventScroll:true});
    status.textContent = names[id][0] + ' tucked away in ' + names[place][0] + '.';
    hideHint();
    changeSelection();
    return {stored:true};
  }
  function placeAt(cx,cy) {
    const x=(cx-box.left)*W/box.width, y=(cy-box.top)*H/box.height;
    // The projecting rails and drawer fronts are separate from the swap area.
    // Check the actual nameplates too: on a narrow phone their labels extend beyond the wood.
    for (const place of fixedIDs) {
      const plate = plates[place].getBoundingClientRect();
      if (cx >= plate.left && cx <= plate.right && cy >= plate.top && cy <= plate.bottom) return place;
      const [left,top,w,h] = fixed[place];
      if (x >= left && x <= left+w && y >= top && y <= top+h) return place;
    }
    // Bare wood inserts the object into that row. A direct hit on another object swaps them.
    if (x >= 145 && x <= 1380 && !document.elementFromPoint(cx,cy)?.closest('.movable')) {
      if (y > 115 && y < 412) return 'field';
      if (y > 455 && y < 725) return 'workshop';
    }
    return null;
  }
  function movableAt(id,cx,cy) {
    const hit = document.elementFromPoint(cx,cy)?.closest('.movable')?.dataset.id;
    if (hit) return hit === id ? null : hit;
    const x=(cx-box.left)/box.width*W,y=(cy-box.top)/box.height*H;
    const row=y>=135&&y<453 ? 0 : y>=456&&y<768 ? 1 : -1;
    if (row<0 || x<108 || x>1485) return null;
    let best=null,distance=Infinity;
    for (const key of visible(order[row])) {
      const [left,,width]=spots[key], d=Math.abs(x-left-width/2);
      if (d<distance) { distance=d;best=key; }
    }
    return best===id ? null : best;
  }
  function arrange(id, move) {
    const now=performance.now();
    const old=Object.fromEntries(order.flat().map(key=>[key,boundsAt(key,now).slice()]));
    move();
    layout();
    if (!reduceMotion()) {
      for (const key of order.flat()) {
        if (!stored[key] && key!==id && spots[key].some((v,i)=>Math.abs(v-old[key][i])>.1)) sliding.set(key,{from:old[key],start:now});
      }
    }
    try { localStorage.setItem('inntake-shelf-order-v1',JSON.stringify(order)); } catch {}
    const row = rowOf(id);
    status.textContent = names[id][0]+' moved to '+names[rails[row]][0]+', position '+(order[row].indexOf(id)+1)+'.';
    return {x:(spots[id][0]-old[id][0])*box.width/W,y:(spots[id][1]-old[id][1])*box.height/H};
  }
  function swap(a,b) {
    if (!b || a===b) return;
    const aRow=rowOf(a), bRow=rowOf(b), ai=order[aRow].indexOf(a), bi=order[bRow].indexOf(b);
    if(stored[a] || stored[b]) return;
    if(aRow!==bRow) {
      for(const [row,outgoing,incoming] of [[aRow,a,b],[bRow,b,a]]) {
        const old=visible(order[row]), next=old.map(id=>id===outgoing?incoming:id);
        if(!hasRoomFor(next,row,old)) { capacityMessage(row); return; }
      }
    }
    return arrange(a,()=>{ order[aRow][ai]=b; order[bRow][bi]=a; });
  }
  function placeOnShelf(id, row, x) {
    const source=rowOf(id), origin = order[source];
    if(source!==row && !fits([...visible(order[row]),id],row)) {capacityMessage(row);return;}
    return arrange(id,()=>{
      origin.splice(origin.indexOf(id),1);
      const destination = order[row];
      const next = destination.findIndex(key=>!stored[key] && x < spots[key][0] + spots[key][2]/2);
      destination.splice(next < 0 ? destination.length : next, 0, id);
    });
  }
  function nudge(id,direction) {
    const row=rowOf(id), ids=visible(order[row]), index=ids.indexOf(id);
    if(direction==='left'||direction==='right') return swap(id,ids[index+(direction==='left'?-1:1)]);
    if((row===0&&direction==='down')||(row===1&&direction==='up')) return placeOnShelf(id,1-row,spots[id][0]+spots[id][2]/2);
  }
  controls.addEventListener('pointerover',event=>{
    if(event.pointerType==='touch'||pose?.dragging) return;
    hover=event.target.closest('button')?.dataset.id || null;
    if (shapes[hover]) showShiftHint();
    changeSelection();
  });
  controls.addEventListener('pointerout',event=>{
    if(event.pointerType==='touch'||pose?.dragging) return;
    hover=event.relatedTarget?.closest?.('.prop')?.dataset.id || null; changeSelection();
  });
  controls.addEventListener('focusin',event=>{
    focus=event.target.matches(':focus-visible')?event.target.dataset.id:null;
    if (shapes[focus]) showShiftHint();
    changeSelection();
  });
  controls.addEventListener('focusout',()=>{focus=null;changeSelection();});
  controls.addEventListener('click',event=>{
    const id=event.target.closest('button')?.dataset.id;
    if(!id) return;
    if (isRail(id)) { focus=id; changeSelection(); return; }
    if (fixed[id]) { openDrawer(id); return; }
    if (!shapes[id] || stored[id]) return;
    inspectOnShelf(id);
    changeSelection();
  });
  room.addEventListener('pointerdown',event=>{
    if(!event.target.closest('.prop')) { focus=null; changeSelection(); }
  });
  room.addEventListener('keydown',event=>{
    if(event.key==='Escape') { hover=focus=null; hideHint(); changeSelection(); }
    const id = event.target.closest('.movable')?.dataset.id;
    if (id && event.key.toLowerCase() === 'h' && !event.repeat && !event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      drag.reset();
      tuck(id,'unfiled');
    }
  });
  controls.addEventListener('pointermove',event=>{
    if (!pose?.dragging) return;
    const place = placeAt(event.clientX,event.clientY);
    target = place || movableAt(pose.id,event.clientX,event.clientY);
    if (place) hint.textContent = (isRail(place) ? 'Place on ' : 'Put in drawer · ') + names[place][0];
    hint.hidden = !place;
    changeSelection();
  });
  refreshStorage();
  layout(); resize();
  if (document.readyState!=='complete') window.addEventListener('load',updatePerches,{once:true});
  drag=window.createShelfDrag({root:controls,fullMotionPreview,getItem:b=>shapes[b.dataset.id] && !stored[b.dataset.id] ? b.dataset.id : null,
    drop:(id,x,y,keyboardTarget)=>{
      if (keyboardTarget) return swap(id,keyboardTarget);
      const place = placeAt(x,y);
      if (isRail(place)) return placeOnShelf(id,rails.indexOf(place),(x-box.left)*W/box.width);
      return place ? tuck(id,place,x) : swap(id,movableAt(id,x,y));
    }, nudge, render:value=>{
      const wasHeld=pose?.dragging;
      pose=value;
      if (Boolean(wasHeld)!==Boolean(value?.dragging)) updatePerches();
      if (!wasHeld && value?.dragging) { hintSeen=true; hideHint(); }
      if (wasHeld && !value?.dragging) { target=null; hover=null; hideHint(); }
      cabinet.classList.toggle('is-dragging',Boolean(value?.dragging));
      changeSelection();
    }
  });
  shelf.hidden=false;
  setTimeout(showShiftHint, 4500);
  new ResizeObserver(()=>{drag.reset();resize();}).observe(room);
  document.fonts.ready.then(()=>{annotate();});
  room.addEventListener('inspectionchange',hideHint);
  document.addEventListener('visibilitychange',syncMotion);
  reduced.addEventListener('change',syncMotion);
  syncMotion();
}

mount().catch(error=>{
  console.error('Could not load the shelf scene.',error);
  const picture = new Image();
  picture.className = 'scene-art'; picture.alt = 'The Inntake shelf'; picture.src = './assets/shelf.png';
  cabinet.prepend(picture);
});
