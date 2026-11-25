// The drawer and its contents share one pixel grid. Buttons over the painted
// objects provide the same targets for touch, mouse and keyboard.
(() => {
  const width = 320, height = 190;
  const lining = {
    all: ['#34392e','#414837','#4b513c','#5b6046'],
    collections: ['#4c3530','#594038','#644a3d','#715442'],
    unfiled: ['#3f353b','#4d4044','#59494a','#66564f']
  };
  function paintWood(ctx, place) {
    let seed = 389 + Object.keys(lining).indexOf(place);
    const random = n => { seed = (Math.imul(1664525,seed)+1013904223) >>> 0; return Math.floor(seed/4294967296*n); };
    const rect = (x,y,w,h,color) => { ctx.fillStyle=color; ctx.fillRect(x,y,w,h); };
    // Fill on whole pixels, including the receding edges and bevels.
    function polygon(points,color) {
      ctx.fillStyle=color;
      const ys=points.map(point=>point[1]);
      for (let y=Math.min(...ys); y<Math.max(...ys); y++) {
        const cuts=[];
        for (let i=0;i<points.length;i++) {
          const [x1,y1]=points[i], [x2,y2]=points[(i+1)%points.length], cy=y+.5;
          if ((cy>=y1 && cy<y2) || (cy>=y2 && cy<y1)) cuts.push(Math.round(x1+(x2-x1)*(cy-y1)/(y2-y1)));
        }
        cuts.sort((a,b)=>a-b);
        for (let i=0;i+1<cuts.length;i+=2) ctx.fillRect(cuts[i],y,cuts[i+1]-cuts[i],1);
      }
    }
    polygon([[17,141],[300,141],[312,166],[304,177],[273,183],[27,183],[11,177]],'#221a18');
    polygon([[46,17],[269,17],[309,128],[303,169],[288,178],[27,175],[13,162],[9,127]],'#2a1d19');
    polygon([[48,17],[268,17],[267,24],[49,25]],'#b38457');
    polygon([[49,25],[267,24],[260,48],[57,49]],'#684833');
    polygon([[53,27],[264,26],[262,32],[55,33]],'#77503a');
    polygon([[55,37],[261,36],[260,48],[57,49]],'#51382a');
    polygon([[46,18],[52,26],[59,48],[30,121],[17,131],[10,126]],'#80583b');
    polygon([[45,20],[48,22],[17,126],[12,127]],'#cc9c63');
    polygon([[52,28],[59,48],[31,119],[21,124]],'#503629');
    polygon([[268,18],[308,127],[297,133],[280,121],[259,48],[264,25]],'#8b6142');
    polygon([[268,19],[306,126],[301,127],[265,23]],'#c59059');
    polygon([[263,29],[295,121],[281,120],[258,48]],'#5f4031');
    const cloth=lining[place];
    polygon([[59,46],[259,45],[285,121],[28,124]],cloth[0]);
    polygon([[62,50],[256,49],[280,117],[34,120]],cloth[1]);
    // A woven liner, scuffed most heavily at the front corners.
    for (let i=0;i<450;i++) {
      const y=51+random(66), spread=(y-49)*.35;
      const x=Math.round(63-spread+random(Math.floor(190+2*spread)));
      rect(x,y,1+random(4),1,cloth[1+random(3)]);
    }
    for (let i=0;i<39;i++) {
      const x=60+random(191), y=27+random(16);
      rect(x,y,2+random(12),1,random(3)?'#674530':'#8a5f40');
    }
    polygon([[10,123],[29,120],[282,118],[309,123],[306,134],[14,137]],'#483025');
    polygon([[12,124],[28,122],[284,120],[307,124],[302,129],[17,132]],'#c3915a');
    polygon([[15,132],[304,128],[300,167],[286,173],[29,172],[17,162]],'#754c33');
    polygon([[19,136],[299,132],[296,164],[284,168],[30,168],[21,159]],'#966a45');
    polygon([[26,139],[292,135],[289,161],[282,163],[31,164]],'#54392b');
    polygon([[28,140],[290,137],[286,159],[33,161]],'#805538');
    for (let i=0;i<105;i++) {
      const x=36+random(239), y=141+random(15);
      rect(x,y,2+random(13),1,['#916240','#795039','#714b34','#875a3a'][random(4)]);
    }
    for (const x of [21,295]) {
      for (let j=0;j<3;j++) rect(x,137+j*7,x===21?4:3,3,j%2?'#493327':'#b37d4d');
    }
    // Little gouges, one pegged repair and a missing chip on the worn front lip.
    for (const [x,y] of [[37,125],[83,124],[224,122],[268,123]]) {
      rect(x,y,5,1,'#876447'); rect(x+3,y+1,5,1,'#a37751');
    }
    for (const x of [33,281]) {
      rect(x,141,3,15,'#714a34'); rect(x-1,145,4,3,'#a57749');
      rect(x,145,2,1,'#b78b5b');
    }
    rect(71,149,18,1,'#a47246'); rect(68,150,5,2,'#9b6944');
    rect(73,152,10,1,'#6b4936'); rect(85,150,7,1,'#a47246');
    rect(76,150,6,1,'#694a37');
    // Two escutcheons and a drop handle, with its shadow on the drawer front.
    for (const x of [142,174]) {
      rect(x-3,142,8,7,'#422f24'); rect(x-2,141,6,6,'#a27b44');
      rect(x-1,142,3,2,'#d2a15c'); rect(x,144,3,3,'#49362b');
    }
    polygon([[142,146],[146,145],[149,153],[170,152],[174,145],[178,146],[173,158],[147,159]],'#483123');
    polygon([[142,144],[146,144],[150,151],[170,150],[174,143],[177,144],[172,155],[148,156]],'#946e42');
    rect(150,152,20,2,'#c2985c'); rect(143,145,2,4,'#cda76e');
  }

  function arrange(count) {
    // Three broad compartments per view keep even the little amber bottle
    // identifiable on a phone. Further objects use another tray page.
    const span=count===3?239:Math.min(220,count*116);
    return Array.from({length:count},(_,i)=>({
      x:160+((i+.5)/count-.5)*span, y:83+(i%2?2:-2),
      width:Math.min(102,span/count-3),height:70
    }));
  }
  // Bottles and books lie on the liner. Boxes keep their broad base down.
  const angles={guides:-.92, sketchbooks:.52, potion:1.04, references:-.78,
    experiments:.81, notes:-.34, finishes:.36, found:-.08, parts:.12, flowers:.78, mortar:-.15, plant:-.24};
  function paintSprite(ctx,sprite,id,slot) {
    const theta=angles[id] || 0, c=Math.abs(Math.cos(theta)), s=Math.abs(Math.sin(theta));
    const w=sprite.width,h=sprite.height, depth=Object.hasOwn(angles,id) ? .83 : .98;
    const scale=Math.min(slot.width/(c*w+s*h),slot.height/(depth*(s*w+c*h)));
    const shade=document.createElement('canvas');
    shade.width=w; shade.height=h;
    const ink=shade.getContext('2d'); ink.drawImage(sprite,0,0);
    ink.globalCompositeOperation='source-in'; ink.fillStyle='#2b2322'; ink.fillRect(0,0,w,h);
    ctx.save();
    ctx.translate(Math.round(slot.x),Math.round(slot.y)); ctx.scale(scale,scale*depth);
    ctx.rotate(theta);
    const offset=2/scale;
    ctx.globalAlpha=.55;
    ctx.drawImage(shade,-w/2+offset*Math.sin(theta),-h/2+offset*Math.cos(theta));
    ctx.globalAlpha=1; ctx.drawImage(sprite,-w/2,-h/2);
    ctx.restore();
  }
  function element(tag,className,text) {
    const node=document.createElement(tag);
    if(className) node.className=className;
    if(text!==undefined) node.textContent=text;
    return node;
  }
  function button(label,action) {
    const b=element('button','',label); b.type='button';b.addEventListener('click',action);
    return b;
  }
  function directory(panel,place,{allItems,library,groups}) {
    if(place==='unfiled') return;
    const content=element('div','drawer-scroll');
    const buildList=(records,title)=>{
      if(!records.length) return;
      const heading=element('h3','drawer-group',title);content.append(heading);
      const list=element('ul','drawer-records');
      records.forEach(item=>{
        const li=element('li');
        const control=item.href ? element('a') : button('',item.visit);
        if(item.href) control.href=item.href;
        control.append(element('span','drawer-name',item.name),element('small','drawer-place',item.location));
        li.append(control);list.append(li);
      });
      content.append(list);
    };
    if(place==='all') {
      const search=element('input','drawer-search');search.type='search';search.placeholder='Find an item';
      search.setAttribute('aria-label','Find an item');panel.append(search,content);
      const render=()=>{
        const query=search.value.trim().toLocaleLowerCase();
        const includes=item=>(item.name+' '+item.location).toLocaleLowerCase().includes(query);
        content.replaceChildren();
        buildList(library.filter(includes),'Your library');
        buildList(allItems.filter(includes),'Around the room');
        if(!content.children.length) content.append(element('p','drawer-empty','No matching items.'));
      };
      search.addEventListener('input',render);render();
    } else {
      let active=groups[0];const tabs=element('div','drawer-shelves');
      tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Shelves');
      function select(group) {
        active=group;
        for(const b of tabs.children) b.setAttribute('aria-pressed',String(b.dataset.group===active));
        const records=allItems.filter(item=>item.group===group);content.replaceChildren();
        if(records.length) buildList(records,group);
        else content.append(element('p','drawer-empty','This collection is empty.'));
      }
      for(const group of groups) {
        const tab=button(group,()=>select(group));tab.dataset.group=group;tabs.append(tab);
      }
      panel.append(tabs,content);select(active);
    }
  }
  window.paintInnDrawer = function(stage,place,model) {
    const canvas=stage.querySelector('canvas'), controls=stage.querySelector('.drawer-contents');
    const dialog=stage.parentElement, note=dialog.querySelector('.drawer-note');
    dialog.dataset.drawer=place;
    dialog.querySelector('.drawer-pages')?.remove();dialog.querySelector('.drawer-browser')?.remove();
    const {tray,selected,returnItem}=model;
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    const noteText=item=>item.drawer ? item.name+' · Return to shelf' : item.name+' · '+item.detail;
    let selection=selected?tray.find(item=>item.id===selected):null;
    const pages=Math.ceil(tray.length/3);
    let page=Math.max(0,Math.floor(tray.findIndex(item=>item===selection)/3));
    const pager=element('nav','drawer-pages');pager.setAttribute('aria-label','Drawer compartments');
    const pageNumber=element('span','drawer-pagenum');
    const previous=button('Previous',()=>{page--;selection=null;paint();});
    const next=button('Next',()=>{page++;selection=null;paint();});
    if(pages>1){pager.append(previous,pageNumber,next);note.after(pager);}
    const resetNote=()=>{note.textContent=selection?noteText(selection):'';};
    function paint() {
      ctx.clearRect(0,0,width,height);paintWood(ctx,place);controls.replaceChildren();
      const items=tray.slice(page*3,page*3+3), slots=arrange(items.length);
      items.forEach((item,i)=>{
        const slot=slots[i];paintSprite(ctx,item.sprite,item.id,slot);
        const target=button('',()=>{
          selection=item;
          if(item.drawer) {
            const message=returnItem(item.id);
            if(message) note.textContent=message;
          } else {
            resetNote();for(const b of controls.children) b.setAttribute('aria-pressed',String(b===target));
          }
        });
        target.dataset.id=item.id;
        target.setAttribute('aria-label',item.drawer?'Return '+item.name:item.name);
        if(!item.drawer) target.setAttribute('aria-pressed',String(item===selection));
        target.style.left=(slot.x-slot.width/2)/width*100+'%';target.style.top=(slot.y-slot.height/2)/height*100+'%';
        target.style.width=slot.width/width*100+'%';target.style.height=slot.height/height*100+'%';
        target.append(element('span','drawer-object-name',item.name));
        const describe=()=>{note.textContent=noteText(item);};
        target.addEventListener('pointerenter',describe);target.addEventListener('focus',describe);
        target.addEventListener('pointerleave',resetNote);target.addEventListener('blur',resetNote);
        controls.append(target);
      });
      resetNote();pageNumber.textContent=(page+1)+' / '+pages;
      previous.disabled=page===0;next.disabled=page+1>=pages;
    }
    paint();
    if(place!=='unfiled') {
      const panel=element('section','drawer-browser');panel.setAttribute('aria-label',place==='all'?'Item inventory':'Collection index');
      dialog.append(panel);directory(panel,place,model);
    }
    if(selected) Array.from(controls.children).find(node=>node.dataset.id===selected)?.focus({preventScroll:true});
  };
})();
