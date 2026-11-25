(() => {
  'use strict';
  // Painted on one 192 × 128 pixel grid. A lighter and a darker cut of each
  // material carries its shape even when the object is shown at phone size.
  const inks={
    shadow:'#30221e', dark:'#412b23', wood3:'#69412c', wood2:'#97623b', wood:'#b78953',
    edge:'#dcaf72', brass3:'#6c5636', brass2:'#9c8150', brass:'#c8a367', gold:'#eed098',
    paper3:'#9d815c', paper2:'#c4aa80', paper:'#dfc69d', cream:'#eedab8', ink:'#655e47',
    leaf3:'#424936', leaf2:'#65714b', leaf:'#84915c', mint:'#a3ac79', moss:'#b9b17d',
    teal3:'#3e5a50', teal2:'#588074', teal:'#7f9c87', glass:'#a9b9a2',
    wine:'#754f4b', mauve:'#a87777', rose:'#c49986', rust:'#9e6649', clay:'#c18960',
    amber3:'#79451e', amber:'#ad6a27', honey:'#d69942', sun:'#edbc72',
    blush3:'#975e4e', blush:'#be826a', blush2:'#dfaa8b',
    olive3:'#5f622f', olive:'#85864a', olive2:'#a9a55b',
    stone3:'#64594c', stone2:'#8a7864', stone:'#ad987b', pearl:'#d1b798'
  };
  const W=192,H=128;
  const colors=Object.fromEntries(Object.entries(inks).map(([key,hex]) =>
    [key,[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))]));
  const frames=new WeakMap();
  function painter(canvas) {
    if(canvas.width!==W) canvas.width=W;
    if(canvas.height!==H) canvas.height=H;
    const ctx=canvas.getContext('2d');
    let frame=frames.get(canvas);
    if(!frame) {frame=ctx.createImageData(W,H);frames.set(canvas,frame);}
    const pixels=frame.data;
    pixels.fill(0);
    function dot(x,y,color,opacity=255) {
      x=Math.round(x); y=Math.round(y);
      if(x<0||x>=W||y<0||y>=H) return;
      const i=(y*W+x)*4,rgb=colors[color]; if (!rgb) return;
      pixels[i]=rgb[0]; pixels[i+1]=rgb[1]; pixels[i+2]=rgb[2]; pixels[i+3]=opacity;
    }
    function rect(x,y,w,h,color,opacity) {
      for(let j=Math.ceil(y);j<y+h;j++) for(let i=Math.ceil(x);i<x+w;i++) dot(i,j,color,opacity);
    }
    function ellipse(x,y,rx,ry,color,opacity) {
      for(let j=Math.ceil(y-ry);j<=y+ry;j++) {
        const span=rx*Math.sqrt(Math.max(0,1-((j-y)/ry)**2));
        rect(Math.round(x-span),j,Math.round(x+span)-Math.round(x-span)+1,1,color,opacity);
      }
    }
    function poly(points,color,opacity) {
      const lo=Math.floor(Math.min(...points.map(p=>p[1]))),hi=Math.ceil(Math.max(...points.map(p=>p[1])));
      for(let y=lo;y<=hi;y++){
        const ints=[];
        for(let j=0,k=points.length-1;j<points.length;k=j++) {
          const [x1,y1]=points[j],[x2,y2]=points[k];
          if((y1>y+.5)!==(y2>y+.5)) ints.push(x1+(y+.5-y1)*(x2-x1)/(y2-y1));
        }
        ints.sort((a,b)=>a-b);
        for(let i=0;i+1<ints.length;i+=2){
          const x=Math.ceil(ints[i]-.5); rect(x,y,Math.ceil(ints[i+1]-.5)-x,1,color,opacity);
        }
      }
    }
    function line(a,b,color,thick=1) {
      const dx=b[0]-a[0],dy=b[1]-a[1],n=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))));
      for(let i=0;i<=n;i++) rect(Math.round(a[0]+dx*i/n),Math.round(a[1]+dy*i/n),thick,thick,color);
    }
    function stroke(points,color,thick=1) {
      for(let i=1;i<points.length;i++) line(points[i-1],points[i],color,thick);
    }
    function dots(polyline,count,color,seed) {
      // Small broken flecks stay inside the polygon and never soften its edge.
      const xs=polyline.map(p=>p[0]),ys=polyline.map(p=>p[1]);
      const x0=Math.min(...xs),y0=Math.min(...ys),x1=Math.max(...xs),y1=Math.max(...ys);
      let n=seed;
      const rnd=()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);
      for(let i=0;i<count;i++) {
        const x=x0+rnd()*(x1-x0),y=y0+rnd()*(y1-y0);
        let inside=false;
        for(let a=0,b=polyline.length-1;a<polyline.length;b=a++) {
          const [u,v]=polyline[a],[s,t]=polyline[b];
          if((v>y)!==(t>y)&&x<(s-u)*(y-v)/(t-v)+u) inside=!inside;
        }
        if(inside) dot(x,y,color);
      }
    }
    function foot(x,y,w,h) {ellipse(x,y,w,h,'shadow',44);ellipse(x-1,y-1,w*.76,h*.60,'shadow',71);}
    return {dot,rect,ellipse,poly,line,stroke,dots,foot,finish:()=>ctx.putImageData(frame,0,0)};
  }

  // Map the drawing primitives themselves. Each transformed stroke is rasterized
  // a second time on the native grid, so a swept page never develops pixel holes.
  function mapped(p,point) {
    const map=pts=>pts.map(([x,y])=>point(x,y));
    return {
      dot(x,y,c,o){const [a,b]=point(x,y);p.dot(a,b,c,o);},
      rect(x,y,w,h,c,o){p.poly(map([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]),c,o);},
      ellipse(x,y,rx,ry,c,o){
        const pts=Array.from({length:24},(_,i)=>{const a=i*Math.PI/12;return point(x+rx*Math.cos(a),y+ry*Math.sin(a));});
        p.poly(pts,c,o);
      },
      poly(pts,c,o){p.poly(map(pts),c,o);}, stroke(pts,c,n){p.stroke(map(pts),c,n);},
      line(a,b,c,n){p.line(point(...a),point(...b),c,n);},
      dots(pts,n,c,seed){p.dots(map(pts),n,c,seed);}
    };
  }

  function leaf(p,x,y,ex,ey,width,back='leaf2',lit='leaf',rib='mint') {
    const dx=ex-x,dy=ey-y,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
    const mid=[x+dx*.46,y+dy*.46], tip=[ex,ey], base=[x,y];
    const a=[mid[0]+nx*width,mid[1]+ny*width],b=[mid[0]-nx*width*.82,mid[1]-ny*width*.82];
    const lead=[x+dx*.7+nx*.67*width,y+dy*.7+ny*.67*width];
    const trail=[x+dx*.28-nx*.67*width,y+dy*.28-ny*.67*width];
    p.poly([base,a,lead,tip,b,trail],back);p.poly([base,a,lead,tip],lit);
    if(len>12) p.line(base,[x+dx*.79,y+dy*.79],rib);
  }
  function sprig(p,x,y,length,lean,palette=['leaf3','leaf2','leaf']) {
    const stem=[[x,y],[x+lean*.25,y-length*.33],[x+lean*.62,y-length*.65],[x+lean,y-length]];
    p.stroke(stem,palette[0]);
    for(let i=1;i<7;i++) {
      const f=i/8,bx=x+lean*f*.9,by=y-length*f;
      const reach=(1-.5*f)*length*.30,sgn=i%2 ? -1:1;
      leaf(p,bx,by,bx+sgn*reach,by-reach*.72,reach*.18,...palette);
    }
  }
  function blossom(p,x,y,r,dark='wine',petal='mauve',pollen='gold') {
    for(const [dx,dy] of [[0,-1],[-1,-.3],[-.65,.8],[.6,.8],[1,-.25]]) {
      p.ellipse(x+dx*r,y+dy*r,r*.56,r*.7,dark);
      p.ellipse(x+dx*r-0.4,y+dy*r-.6,r*.39,r*.52,petal);
    }
    p.ellipse(x,y,r*.49,r*.46,pollen);
  }

  function workshopDrawings(p,step) {
    const outline=(pts,c='ink')=>p.stroke(pts,c);
    if(step===0) {
      // Dovetail tails and their matching sockets are shown in exploded view.
      const board=[[35,55],[50,50],[52,55],[58,53],[57,48],[69,44],[74,51],
        [70,55],[75,61],[58,68],[56,64],[50,67],[52,70],[41,75]];
      p.poly(board,'edge');outline([...board,board[0]]);
      outline([[36,56],[42,75],[42,79],[76,65],[75,61]],'wood2');
      outline([[108,64],[114,61],[118,66],[124,64],[122,58],[130,54],[135,58],
        [142,55],[141,49],[145,48],[151,65],[115,80],[108,64]]);
      p.line([114,77],[147,63],'wood2');outline([[41,81],[61,74],[76,68]],'paper3');
      p.line([64,39],[72,36],'paper3');p.line([67,40],[74,37],'paper3');
    } else if(step===1) {
      p.poly([[34,66],[72,49],[80,62],[42,79]],'wood');outline([[34,66],[72,49],[80,62],[42,79],[34,66]]);
      p.line([42,73],[73,59],'wood2');p.line([53,58],[61,72],'wine',2);
      p.poly([[107,69],[146,40],[151,46],[112,76]],'brass');
      outline([[107,69],[146,40],[151,46],[112,76],[107,69]]);
      for(let i=0;i<9;i++) {const x=112+i*4,y=67-i*3;p.line([x,y],[x+(i%2?1:3),y+2],'ink');}
      p.stroke([[47,83],[72,73],[72,69]],'paper3');p.line([46,80],[46,85],'ink');p.line([73,70],[73,75],'ink');
    } else {
      const plate=[[37,51],[54,47],[61,73],[44,77]];
      p.poly(plate,'brass');outline([...plate,plate[0]]);
      p.poly([[57,47],[70,43],[79,69],[65,74]],'brass2');
      p.line([55,46],[63,75],'ink',3);
      for(const [x,y] of [[43,54],[49,70],[65,50],[71,65]]) {p.ellipse(x,y,2,2,'ink');p.dot(x,y,'paper2');}
      p.ellipse(132,59,14,14,'brass2');p.ellipse(132,59,10,10,'cream');p.ellipse(132,59,4,4,'ink');
      outline([[109,59],[127,59]],'ink');outline([[135,59],[154,59]],'ink');
      outline([[132,37],[132,49]],'ink');outline([[132,69],[132,80]],'ink');
      p.line([114,81],[126,79],'paper3');
    }
  }

  function pageCurl(p,amount) {
    const reach=Math.abs(amount);
    if(reach<.035) return;
    // Dragging right lifts the left fore-edge. The curved fold moves towards
    // the binding, revealing the underside before the spread is turned.
    const left=amount>0;
    const q=left?mapped(p,(x,y)=>[192-x,y+4]):p;
    const foldX=166-56*reach,lift=18*reach;
    const fold=[[166,89],[foldX,91],[foldX-3,82-lift],[foldX-2,63-lift],
      [foldX+3,42-lift],[161,30]];
    q.poly(fold,'paper3');
    q.poly([[166,88],[foldX+2,90],[foldX,79-lift],[foldX+1,59-lift],[foldX+5,43-lift],[161,31]],'paper');
    q.stroke([[foldX+2,89],[foldX,79-lift],[foldX+1,59-lift],[foldX+5,43-lift],[160,31]],'cream',2);
    q.line([foldX+7,54-lift],[foldX+11,49-lift],'paper2');
  }

  function book(p,step,{id,amount}) {
    p.foot(98,107,75,7);
    const cover=[[19,36],[41,28],[68,28],[91,35],[104,32],[133,23],[151,26],[166,33],[177,93],[173,100],[146,97],[125,101],[98,111],[92,111],[75,106],[45,103],[22,105],[15,101]];
    const workshop=id==='sketchbooks';
    p.poly(cover,'dark');
    p.poly([[17,37],[40,29],[76,30],[96,39],[125,28],[149,25],[164,33],[174,97],[151,94],[126,98],[96,108],[76,103],[43,100],[18,102]],workshop?'rust':'leaf3');
    p.stroke([[19,98],[46,97],[77,99],[95,105],[101,105],[125,95],[151,92],[170,94]],'brass2',2);
    const left=[[25,34],[40,27],[58,25],[76,27],[91,34],[96,39],[96,102],[78,96],[56,94],[33,95],[22,99]];
    const right=[[96,39],[108,29],[128,23],[149,24],[161,29],[170,92],[153,90],[130,92],[110,97],[96,104]];
    const shift=(a,dx,dy)=>a.map(([x,y])=>[x+dx,y+dy]);
    p.poly(shift(left,-1,4),'paper3');p.poly(shift(right,1,3),'paper3');
    p.stroke([[22,98],[40,93],[61,92],[80,95],[95,101],[103,99],[126,92],[151,88],[170,91]],'paper2');
    p.poly(left,'paper'); p.poly(right,'cream');
    p.poly([[25,34],[39,28],[33,32],[29,38],[27,88],[24,94]],'cream');
    p.poly([[73,27],[85,31],[96,39],[96,102],[86,98],[80,95],[81,80],[82,47]],'paper2');
    p.poly([[96,39],[108,29],[115,27],[104,38],[101,50],[101,99],[96,104]],'paper3');
    p.poly([[100,41],[110,32],[115,30],[105,39],[103,100],[99,101]],'paper2');
    p.stroke([[29,36],[42,31],[57,30]],'cream');
    p.stroke([[121,28],[136,26],[151,27],[157,30]],'paper');
    p.dots(left,75,'paper2',11);p.dots(right,65,'paper',13);
    const bookmarks=[[[111,98],[118,95],[122,108],[118,106],[116,111]],[[58,95],[65,95],[63,109],[60,106],[56,109]],[[137,92],[143,91],[149,103],[145,101],[143,105]]];
    p.poly(bookmarks[step],workshop?'teal3':'wine');
    if(workshop) workshopDrawings(p,step);
    else if(step===0) {
      sprig(p,59,85,39,-4,['wood3','leaf2','leaf']);sprig(p,57,85,23,15,['wood3','leaf2','mint']);
      p.stroke([[123,71],[133,61],[145,54],[151,47]],'ink');
      leaf(p,122,72,148,46,8,'leaf2','leaf','ink');
      p.stroke([[117,79],[126,76],[136,75]],'paper3');
      p.line([117,83],[133,80],'paper3');
    } else if(step===1) {
      p.stroke([[33,74],[44,61],[51,67],[62,46],[74,65],[84,71]],'ink',2);
      p.poly([[48,71],[62,47],[57,68],[51,75]],'leaf2');p.poly([[61,49],[65,52],[71,65],[64,59],[60,60]],'paper3');
      p.stroke([[34,80],[48,76],[57,77],[74,71],[84,73]],'leaf2');p.line([39,85],[69,81],'paper3');
      p.stroke([[115,54],[125,50],[129,56],[137,52],[148,56],[155,50]],'brass2');
      p.stroke([[115,59],[126,56],[130,61],[139,57],[151,62],[158,58]],'paper3');
      p.stroke([[115,71],[126,66],[133,68],[143,63]],'teal2');
      p.line([116,78],[141,74],'paper3');
    } else {
      const stars=[[39,58],[48,49],[63,52],[70,42],[77,57],[65,68],[48,73]];
      p.stroke(stars.slice(0,5),'paper3');p.stroke([stars[2],stars[5],stars[6]],'paper3');
      stars.forEach(([x,y])=>{p.line([x-2,y],[x+2,y],'ink');p.line([x,y-2],[x,y+2],'ink');});
      p.ellipse(134,59,15,14,'paper3');p.ellipse(134,59,13,12,'cream');
      p.stroke([[134,44],[137,55],[146,59],[138,62],[134,73],[131,63],[121,59],[131,56],[134,44]],'ink');
      p.poly([[134,47],[134,59],[124,59],[132,56]],'teal2');p.poly([[134,59],[143,59],[136,62],[134,69]],'teal2');
    }
    p.line([33,88],[40,87],'paper3');p.line([147,82],[155,82],'paper3');
    pageCurl(p,amount);
  }

  function key(p,x,y) {
    p.ellipse(x,y,7,6,'brass3');p.ellipse(x-1,y-1,6,5,'gold');p.ellipse(x-1,y-1,3,2,'wood3');
    p.line([x+4,y+3],[x+21,y+14],'brass3',3);p.line([x+4,y+2],[x+21,y+13],'brass',2);
    p.line([x+15,y+11],[x+12,y+15],'gold',2);p.line([x+19,y+13],[x+16,y+17],'brass',2);
  }
  function crystal(p,x,y,size) {
    p.poly([[x-size*.6,y],[x-size*.65,y-size*.9],[x,y-size*1.8],[x+size*.68,y-size],[x+size*.6,y]],'teal3');
    p.poly([[x-size*.53,y-size*.93],[x,y-size*1.7],[x-size*.12,y-size*.7],[x-size*.12,y]],'glass');
    p.poly([[x,y-size*1.7],[x+size*.59,y-size],[x+size*.28,y-size*.56],[x-size*.12,y-size*.7]],'teal');
    p.poly([[x-size*.12,y],[x-size*.12,y-size*.7],[x+size*.28,y-size*.56],[x+size*.2,y]],'teal2');
  }
  function hardware(p,step) {
    const wire=(pts,c='stone')=>p.stroke(pts,c,2);
    if(step===0) {
      p.poly([[61,65],[74,57],[83,65],[69,73]],'brass2');
      p.poly([[75,56],[86,52],[96,60],[85,66]],'brass');
      p.line([74,56],[83,67],'gold',3);
      for(const [x,y] of [[66,65],[74,67],[83,56],[89,59]]) p.dot(x,y,'dark');
      for(const [x,y] of [[105,61],[117,57],[128,59]]) {
        p.line([x,y],[x+8,y+7],'stone',2);p.line([x+3,y+3],[x+7,y+3],'stone3');
        p.ellipse(x,y,3,2,'pearl');p.line([x-1,y+1],[x+1,y-1],'stone3');
      }
    } else if(step===1) {
      for(const [x,y] of [[59,67],[69,72],[77,64]]) {
        p.line([x,y],[x+17,y-8],'wood3',4);p.line([x,y-1],[x+17,y-9],'edge',2);
        p.ellipse(x+18,y-7,2,3,'wood');
      }
      for(const [x,y] of [[105,63],[117,58],[128,63],[112,68]]) {
        p.ellipse(x,y,6,3,'stone3');p.ellipse(x,y-1,6,3,'stone');
        p.ellipse(x,y-1,2,1,'dark');p.dot(x-3,y-3,'pearl');
      }
    } else {
      p.line([61,68],[68,66],'stone',2);
      for(let i=0;i<6;i++) {
        const x=69+i*4,y=65-i;
        wire([[x-2,y+3],[x-3,y-2],[x,y-5],[x+3,y-4],[x+4,y+1],[x+3,y+4]]);
        p.dot(x-1,y-4,'pearl');
      }
      for(const [x,y] of [[106,60],[118,58]]) {
        wire([[x,y],[x+2,y-3],[x+5,y-3],[x+6,y],[x+3,y+2],[x+13,y+9]]);
        p.line([x+5,y+1],[x+17,y+6],'brass',2);
      }
    }
  }

  function box(p,step,{id,amount}) {
    p.foot(97,109,65,7);
    const q=mapped(p,(x,y)=>{const h=Math.max(0,60-y);return [x+amount*h*.18,y+amount*h*.43];});
    const lid=[[40,64],[30,26],[116,16],[137,44],[137,53],[51,70]];
    q.poly(lid,'dark');q.poly([[32,27],[116,18],[135,45],[48,62]],'wood2');
    q.poly([[38,30],[114,21],[129,43],[49,57]],'wood3');
    q.poly([[41,32],[113,23],[126,42],[50,55]],'wood2');
    q.stroke([[35,27],[116,18],[134,45]],'edge',2);
    q.stroke([[53,51],[63,48],[80,47]],'wood');q.line([77,40],[118,34],'wood');q.line([46,34],[67,31],'edge');
    p.poly([[41,60],[131,46],[158,66],[157,91],[68,112],[36,94]],'dark');
    p.poly([[42,59],[130,47],[152,65],[66,87],[40,70]],'wood');
    p.poly([[47,61],[129,50],[146,64],[67,83],[46,70]],'wood3');
    p.poly([[47,62],[126,51],[127,62],[65,77],[47,69]],'dark');
    p.poly([[67,77],[127,62],[145,65],[69,83]],'rust');
    const parts=id==='parts';
    // The tray, its rim, and the objects move as one piece beneath the lid.
    const qtray=mapped(p,(x,y)=>[x+amount*8,y-4*Math.abs(amount)+amount*1.2]);
    qtray.poly([[48,67],[126,52],[141,62],[65,80]],parts?'stone2':'wood2');
    qtray.line([50,68],[124,53],parts?'stone':'edge');
    if(parts) hardware(qtray,step);
    else if(step===0) {
      qtray.poly([[57,63],[78,57],[96,62],[78,76],[60,73]],'mauve');qtray.stroke([[59,64],[76,67],[88,60]],'rose');
      key(qtray,102,56);qtray.ellipse(136,65,6,3,'brass3');qtray.ellipse(136,64,3,2,'gold');
    } else if(step===1) {
      crystal(qtray,75,76,11);crystal(qtray,85,73,7);
      qtray.ellipse(113,62,13,8,'brass3');qtray.ellipse(113,60,12,7,'brass');qtray.ellipse(113,60,9,5,'paper2');
      qtray.poly([[106,63],[115,56],[115,60]],'wine');qtray.poly([[115,56],[113,62],[120,58]],'teal3');
      qtray.dot(113,60,'gold');
    } else {
      qtray.poly([[60,63],[101,55],[112,63],[74,74]],'paper3');qtray.poly([[60,61],[100,54],[111,61],[73,72]],'cream');
      qtray.stroke([[63,62],[77,65],[99,57]],'paper3');qtray.ellipse(78,65,4,3,'wine');qtray.dot(77,64,'rose');
      sprig(qtray,111,70,21,13,['leaf3','mint','leaf']);
    }
    p.poly([[36,70],[66,85],[67,109],[37,93]],'wood2');p.poly([[66,85],[156,65],[156,90],[67,110]],'wood');
    p.poly([[66,85],[156,65],[156,70],[67,90]],'edge');p.stroke([[39,72],[65,85],[66,108]],'wood3');
    p.stroke([[69,106],[154,87]],'wood2');p.line([92,95],[149,81],'wood2');p.line([43,80],[53,84],'wood');
    const front=[[68,91],[154,72],[152,89],[69,108]];p.dots(front,65,'wood2',59);
    p.poly([[41,73],[46,76],[46,94],[41,92]],'brass2');p.poly([[145,71],[149,70],[149,92],[145,93]],'brass2');
    p.poly([[102,79],[113,76],[114,83],[104,86]],'brass3');p.line([104,80],[111,78],'gold');p.dot(109,81,'dark');
  }

  // Measured half-profiles of the five vessels on the actual shelves. All
  // coordinates are local to the glass centre, prior to tipping the vessel.
  const vessels={
    potion:{radius:[[19,9],[47,9],[52,12],[58,25],[65,33],[75,38],[90,37],[101,31],[109,21],[112,13]],
      rim:13, level:77, tint:['teal3','teal2','teal','glass'], form:'round'},
    references:{radius:[[15,7],[42,7],[46,9],[51,17],[57,21],[103,21],[109,19],[112,14]],
      rim:11, level:64, tint:['amber3','amber','honey','sun'], form:'tall'},
    notes:{radius:[[40,17],[49,16],[54,18],[61,30],[68,34],[99,34],[108,30],[112,22]],
      rim:23, level:83, tint:['blush3','blush','blush2','gold'], form:'jar'},
    experiments:{radius:[[16,8],[44,8],[50,10],[56,21],[64,30],[75,35],[90,35],[101,30],[109,22],[112,15]],
      rim:12, level:72, tint:['olive3','olive','olive2','moss'], form:'round'},
    finishes:{radius:[[35,14],[49,14],[53,18],[59,27],[65,30],[102,30],[109,28],[112,22]],
      rim:19, level:75, tint:['amber3','amber','honey','sun'], form:'square'}
  };
  for(const {radius} of Object.values(vessels)) {
    const samples=new Float32Array(H);
    for(let i=1;i<radius.length;i++) {
      const [a,r]=radius[i-1],[b,s]=radius[i];
      for(let y=a;y<=b;y++) samples[y]=r+(s-r)*(y-a)/(b-a);
    }
    radius.samples=samples;
  }

  function foldedNote(p,x,y,fold) {
    p.poly([[x-11,y-2],[x+5,y-7],[x+10,y+6],[x-7,y+9]],'paper3');
    p.poly([[x-11,y-3],[x+5,y-8],[x+9,y+5],[x-7,y+8]],'paper');
    p.stroke([[x-11,y-3],[x-2,y],[x+4,y-7]],'paper3');
    if(fold) {p.line([x-3,y+3],[x+4,y+1],'wood2');p.dot(x+2,y-1,'wine');}
  }

  function bottle(p,step,{id,amount,time}) {
    const model=vessels[id]||vessels.potion;
    const {radius,rim,tint,level,form}=model;
    const [dark,base,lit,spark]=tint;
    const wet=id!=='notes';
    const lean=[0,-.18,.16][step]+amount*.36;
    const cos=Math.cos(lean),sin=Math.sin(lean), cx=92,baseY=107;
    const place=(u,v)=>[cx+u*cos-(v-baseY)*sin,baseY+u*sin+(v-baseY)*cos];
    const bottleSpace=mapped(p,(x,y)=>place(x,y));
    p.foot(cx+2,114,form==='tall'?26:39,4);
    if(id==='finishes') {
      p.poly([[123,98],[152,91],[170,103],[140,113]],'wood3');
      p.poly([[123,96],[152,90],[170,101],[139,110]],'wood');
      p.stroke([[127,96],[150,91],[163,99]],'edge');
      p.line([136,102],[157,96],'wood2');
      if(step>0) {
        p.poly([[131,97],[151,92],[164,100],[143,107]],'amber3');
        p.line([137,98],[155,94],'amber');
        if(step===2) {p.line([140,100],[159,96],'honey',2);p.line([145,104],[161,100],'sun');}
      }
    }
    const yTop=radius[0][0],ry=radius.samples;
    const surface=[];
    const wave=Math.abs(amount)*2.6;
    const fluidCenter=baseY+(level-baseY)*cos;
    for(let x=0;x<W;x++) surface[x]=fluidCenter+(x-cx)*amount*.065 +
      wave*Math.sin((x-cx)*.079+time*.008) +1.8*Math.cos((x-cx)*.067);
    // Inverse-map surface pixels. The glass, its facets and the etched marks
    // rotate around the base; the free liquid surface is measured in room space.
    for(let y=3;y<120;y++) for(let x=24;x<160;x++) {
      const dx=x-cx,dy=y-baseY;
      const u=dx*cos+dy*sin, v=Math.round(-dx*sin+dy*cos+baseY);
      const r=ry[v]||0;
      if(r<1||Math.abs(u)>r) continue;
      const s=u/r, edge=r-Math.abs(u);
      const dist=y-surface[x], heel=112-v;
      let color,alpha=255;
      if(wet && dist>=0 && edge>2 && heel>2) {
        color=dist<1.35?spark:dist<2.6?lit:(s>.65||heel<5)?dark:s<-.52?lit:base;
        if(form==='square' && s>.44) color=dist<2?lit:dark;
        if(id==='experiments' && v>103 && Math.abs(u)<22 && (x*13+y*23)%17<3) color=lit;
      } else if(edge<1.25 || heel<1) {
        color=s<0?'glass':dark; alpha=237;
      } else if(edge<3 || heel<3.5) {
        color=s<0?spark:lit;alpha=202;
      } else if (s<-.65 && s>-.79 && v>yTop+5) {
        color=(v%23<13)?'cream':spark;alpha=v%23<13?208:127;
      } else {
        color=s>.50?dark:lit;alpha=s>.50?102:id==='notes'?65:54;
      }
      p.dot(x,y,color,alpha);
    }

    // A narrow reflection follows the original glass shoulder down to the heel;
    // it bends across the broad flasks and breaks at the square jar's bevel.
    const shoulder={
      potion:[[-9,47],[-12,52],[-25,59],[-31,66],[-33,72]],
      experiments:[[-8,45],[-11,51],[-20,57],[-28,64],[-30,70]],
      references:[[-7,42],[-9,47],[-16,52],[-18,57],[-18,63]],
      notes:[[-15,51],[-18,55],[-27,62],[-30,67]],
      finishes:[[-13,50],[-17,55],[-25,62],[-26,69]]
    }[id]||[[-9,47],[-12,52],[-25,59],[-31,66],[-33,72]];
    bottleSpace.stroke(shoulder,spark,2);
    bottleSpace.stroke(shoulder.slice(2,4),'cream',2);
    if(form==='round') {
      bottleSpace.stroke([[-31,84],[-30,90],[-27,94]],spark);
      bottleSpace.stroke([[27,98],[21,104],[13,107],[6,109]],lit);
    } else {
      const w=radius.samples[85];
      bottleSpace.line([w-4,93],[w-4,103],lit);
      bottleSpace.line([-w+5,82],[-w+5,89],spark);
      bottleSpace.line([-w*.58,109],[w*.35,109],lit);
    }

    if(id==='notes') {
      // These are dry, loose slips seen through rose-tinted glass. They slide
      // towards the lowered wall instead of floating in liquid.
      const slide=amount*7 + [0,-4,4][step];
      const paper=mapped(p,(x,y)=>place(x+slide+(y-104)*amount*.15,y));
      foldedNote(paper,-5,94,step===2);
      if(step===1) foldedNote(paper,5,83,true);
      if(step===2) {
        paper.poly([[-8,87],[-8,68],[3,65],[11,86],[9,90]],'paper3');
        paper.poly([[-6,86],[-7,68],[3,66],[9,86],[2,89]],'paper');
        paper.ellipse(-2,67,5,2,'paper3');paper.ellipse(-2,67,2,1,'wood2');paper.line([-6,78],[7,76],'wine',2);
      }
    } else {
      const count=id==='experiments' ? 11 : 4;
      for(let i=0;i<count;i++) {
        const u=((i*11+3)%31-15)*(form==='tall'?.64:1);
        const v=109-((i*9+step*5)%Math.max(10,108-level-5));
        const [x,y]=place(u,v);
        if(y<surface[Math.round(x)]+3) continue;
        if(id==='experiments' && i%3===0) {
          p.poly([[x-2,y+1],[x+1,y-2],[x+3,y-2],[x,y+1]],'leaf3');
        } else {
          const rad=i%3===0?2:1;
          p.ellipse(x+amount*1.9,y,rad,rad,lit);p.dot(x+amount*1.9-1,y-1,spark);
        }
      }
    }
    if(id==='references') {
      for(let i=0;i<3;i++) bottleSpace.line([6,64+i*9],[15-(i%2)*3,64+i*9],spark);
    }
    if(id==='notes') {
      bottleSpace.stroke([[-26,66],[-29,70],[-29,87]],'cream',2);
      bottleSpace.stroke([[27,79],[27,99],[22,105]],'blush2');
    }
    if(form==='square') {
      bottleSpace.stroke([[15,58],[21,66],[21,100],[18,106]],'honey');
      bottleSpace.line([-22,69],[-22,90],'gold',2);
    }
    // The heavy lip and the rim are distinct from the translucent neck.
    bottleSpace.ellipse(0,yTop+4,rim,3,dark);
    bottleSpace.rect(-rim,yTop,rim*2,3,lit);bottleSpace.ellipse(0,yTop,rim,4,spark);
    bottleSpace.ellipse(0,yTop,rim-2,2.7,dark);bottleSpace.ellipse(.5,yTop-.45,Math.max(3,rim-4),1.5,'shadow');
    bottleSpace.line([-rim+1,yTop-1],[-rim/2,yTop-3],'cream');
    const corkX=id==='finishes'?126:141, corkY=id==='finishes'?111:107;
    const corkWidth=rim*.67;
    p.foot(corkX,corkY+3,corkWidth+6,2);
    const cork=mapped(p,(x,y)=>[corkX+x*(corkWidth/8),corkY+y]);
    cork.poly([[-11,-4],[-6,-13],[6,-10],[8,-4],[2,1],[-8,0]],'wood3');
    cork.poly([[-10,-5],[-5,-12],[5,-9],[0,-1],[-7,-1]],'wood');
    cork.ellipse(5,-5,3.5,4,'edge');cork.dots([[-9,-5],[-5,-11],[4,-9],[0,-2]],13,'wood2',54);
  }

  function heartLeaf(p,x,y,ex,ey,width,fresh=false) {
    // A notched base and a long taper are characteristic of the trailing vine.
    const dx=ex-x,dy=ey-y,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
    const pt=(t,w)=>[x+t*dx+nx*w,y+t*dy+ny*w];
    const outline=[pt(0,0),pt(-.12,width*.53),pt(.05,width*.95),pt(.33,width),
      pt(.62,width*.58),pt(1,0),pt(.65,-width*.59),pt(.32,-width*.87),
      pt(.03,-width*.85),pt(-.12,-width*.38)];
    p.poly(outline,'leaf3');
    p.poly([pt(0,0),pt(-.09,width*.49),pt(.05,width*.87),pt(.32,width*.92),pt(.64,width*.53),pt(.98,0)],
      fresh?'moss':'leaf');
    p.poly([pt(.03,0),pt(.05,-width*.77),pt(.29,-width*.83),pt(.65,-width*.5),pt(.97,0)],
      fresh?'leaf':'leaf2');
    p.stroke([pt(.06,0),pt(.40,width*.10),pt(.88,0)],fresh?'gold':'mint');
    p.line(pt(.34,0),pt(.15,width*.58),'mint');
  }
  function plant(p,step,{amount,time}) {
    p.foot(84,111,29,5);
    // Keep the stout, speckled cream pot and drooping heart-shaped foliage
    // visible in the original shelf illustration.
    const pot=[[57,66],[60,64],[102,64],[107,66],[109,73],[106,88],[101,99],
      [93,107],[84,110],[72,108],[64,103],[58,94],[55,82],[55,72]];
    p.poly(pot,'stone3');
    p.poly([[56,69],[63,65],[101,65],[106,69],[107,77],[103,90],[97,100],[88,106],
      [78,107],[67,104],[59,97],[56,85]],'paper2');
    p.poly([[57,69],[66,66],[74,73],[73,91],[79,104],[69,102],[62,97],[57,87]],'paper');
    p.poly([[99,69],[106,69],[107,77],[103,90],[97,100],[87,106],[84,105],[94,96],[99,83]],'stone');
    p.dots(pot,180,'wood',37);p.dots(pot,69,'cream',29);
    p.ellipse(82,68,26,6,'paper3');p.ellipse(82,66,23,5,'dark');p.stroke([[58,69],[64,71],[78,73]],'cream');
    const bend=(x,y)=>{
      const hanging=Math.max(0,x-105)/44, loft=Math.max(0,68-y)/52;
      return [x+amount*(loft*10+hanging*7),y+Math.abs(amount)*loft*1.8+amount*hanging*2.5];
    };
    const q=mapped(p,bend);
    for(const stem of [[[80,68],[76,52],[67,41],[55,37]],[[83,66],[82,48],[88,33],[98,24]],
      [[84,65],[93,51],[108,44],[122,49],[132,60],[135,74],[136,89],[140,103],[144,114]],
      [[79,66],[67,55],[52,55],[45,62]],[[84,66],[101,60],[114,65],[118,78]]]) {
      q.stroke(stem,'leaf3',2);q.stroke(stem,'leaf2');
    }
    const leaves=[[72,48,53,42,7],[66,40,51,28,7],[79,50,73,29,8],[84,42,86,24,7],
      [88,32,99,17,6],[96,27,108,22,5],[65,55,53,49,7],[58,56,44,61,6],[52,57,47,68,5],
      [91,54,98,38,6],[104,47,113,37,7],[113,46,123,46,5],[120,49,133,44,6],[127,55,140,56,6],
      [130,63,122,72,6],[134,69,147,72,6],[135,78,130,88,5],[137,88,146,93,5],
      [138,94,134,104,4],[142,105,151,109,4],[144,111,143,119,3.2],
      [102,60,110,54,6],[111,64,124,64,5],[117,73,113,82,5],[80,57,68,70,8],[88,58,89,77,8]];
    leaves.forEach(([x,y,u,v,w],i)=>heartLeaf(q,x,y,u,v,w,i%5===0));
    if(step===0) {
      q.stroke([[82,67],[88,57],[91,52]],'mint');q.ellipse(91,50,2,3,'moss');
    } else {
      const shoot=step===1 ? [[83,66],[90,53],[103,40],[115,29],[125,20]] :
        [[83,66],[90,52],[105,39],[117,26],[126,18]];
      q.stroke(shoot,'mint',2);
      if(step===1) {
        q.ellipse(125,19,4,5,'leaf2');q.stroke([[123,21],[124,16],[128,15],[128,20],[126,20]],'moss');
      } else {
        heartLeaf(q,117,26,123,10,7,true);heartLeaf(q,124,20,138,16,5.5,true);
      }
    }
    if(Math.abs(amount)>.12) {
      const fall=((time*.03)%8)*Math.abs(amount);
      for(const [x,y] of [[61,55],[126,76],[96,47]]) {
        const cx=x+amount*6,cy=y+fall;
        q.poly([[cx,cy-2.5],[cx+2,cy+.5],[cx+1,cy+2],[cx-1,cy+2],[cx-2,cy]],'teal');
        q.dot(cx-1,cy,'glass');
      }
    }
  }

  function mortar(p,step,{amount,time}) {
    p.foot(99,111,48,5);
    const colors=['amber3','honey','sun'];
    const bowl=[[47,64],[52,63],[145,64],[143,77],[137,86],[130,93],[119,100],[111,102],[84,102],[74,98],[63,91],[55,82],[50,73]];
    p.ellipse(96,104,23,6,'stone3');p.rect(73,103,46,4,'stone3');p.ellipse(96,102,24,5,'stone');p.ellipse(96,100,17,5,'stone2');
    p.poly(bowl,'stone3');p.poly([[50,65],[141,65],[138,77],[130,87],[117,95],[106,98],[89,99],[76,95],[63,86],[55,77]],'stone2');
    p.poly([[52,67],[67,69],[70,80],[78,89],[90,95],[86,97],[71,91],[61,82]],'stone');
    p.poly([[55,69],[62,70],[67,80],[70,84],[63,80]],'pearl');
    p.dots(bowl,180,'stone3',39);p.dots(bowl,75,'pearl',73);
    p.ellipse(96,64,50,13,'stone3');p.rect(46,61,101,4,'stone2');p.ellipse(96,60,50,13,'stone');
    p.ellipse(96,60,42,9,'stone3');p.ellipse(96,62,37,6,'wood3');
    p.ellipse(97,64,30,4,'amber3');
    p.ellipse(96,63,23+step*3,step===2?4:3,step===2?'honey':'amber');
    const count=[7,21,42][step];
    const ground=amount*5;
    for(let i=0;i<count;i++){
      const x=71+(i*17%52)+ground*Math.sin(i*1.6),y=60+(i*13%6);
      const size=step===0 ? 3+(i%2)*.7 : step===1 ? 1.9 : .8;
      p.poly([[x-size,y],[x-size*.6,y-size*1.1],[x+size*.28,y-size*1.5],
        [x+size,y-.5],[x+size*.3,y+size*.7],[x-size*.7,y+size*.4]],i%2?'amber3':'amber');
      p.line([x-size*.62,y-size],[x+size*.14,y-size*1.35],i%2?'honey':'sun');
    }
    if(step===2) {
      p.stroke([[76,64],[85,62],[97,61]],'sun');
      p.stroke([[105,65],[111,64],[118,64]],'amber');
    }
    const ends=[[117,21],[127,31],[116,27]], tips=[[89,60],[100,64],[99,65]];
    const hx=ends[step][0]+amount*30,hy=ends[step][1]+Math.abs(amount)*5;
    const tx=tips[step][0]+amount*13,ty=tips[step][1]+Math.sin(amount*3)*2;
    if(Math.abs(amount)>.35) {
      for(let i=0;i<4;i++) {
        const offset=(time*.015+i*3.4)%9;
        p.dot(tx+Math.sign(amount)*(3+i*2),ty-3-offset*Math.abs(amount),'honey');
      }
    }
    const dx=hx-tx,dy=hy-ty,L=Math.hypot(dx,dy),nx=-dy/L,ny=dx/L;
    const at=(u,w)=>[tx+dx*u+nx*w,ty+dy*u+ny*w];
    p.poly([at(0,-4),at(.07,-7),at(.24,-6),at(.32,-4),at(.78,-5),at(.85,-7),at(.96,-7),at(1.05,-4),at(1.09,0),at(1.04,5),at(.96,7),at(.85,7),at(.79,5),at(.35,4),at(.23,7),at(.10,7),at(.01,4)],'stone3');
    p.poly([at(.02,-3),at(.11,-6),at(.22,-5),at(.3,-3),at(.8,-4),at(.9,-6),at(1,-5),at(1.05,-1),at(1,4),at(.9,5),at(.78,3),at(.32,2),at(.2,5),at(.09,5)],'stone');
    p.stroke([at(.18,-4),at(.27,-3),at(.77,-3),at(.88,-5),at(.97,-5)],'pearl',2);
    p.line(at(.43,2),at(.75,3),'stone2');
    p.stroke([[47,60],[55,55],[70,51],[83,49]],'pearl',2);p.stroke([[54,66],[62,69],[77,72],[94,73]],'pearl');
    for(const [x,y] of [[140,103],[145,108],[138,111],[153,105],[149,101],[134,106]]) {
      p.ellipse(x,y,step===2?1:2,1,'wood3');p.dot(x,y-1,colors[step===0?1:2]);
    }
  }

  function flowers(p,step,{amount}) {
    p.foot(96,108,61,6);
    const paper=[[42,22],[140,14],[154,102],[61,114]];
    p.poly([[40,26],[138,15],[157,100],[62,116],[58,114]],'wood3');
    p.poly([[40,26],[139,16],[154,101],[61,114]],'paper3');p.poly(paper,'paper');
    p.poly([[47,27],[135,20],[146,95],[64,107]],'cream');
    p.stroke([[48,27],[135,20],[146,95]],'paper2');p.stroke([[48,28],[63,108],[146,96]],'paper3');
    p.dots(paper,190,'paper2',50);
    // The tape pins the stalk at the bottom. Dragging fans the loose upper
    // stems around it, while the study sheet itself stays on the bench.
    const q=mapped(p,(x,y)=>[x+amount*(88-y)*.24,y+Math.abs(amount)*(88-y)*.025]);
    const stems=[[[96,94],[87,72],[81,52],[76,40]],[[96,94],[95,70],[94,47],[93,32]],
      [[97,95],[104,77],[112,60],[123,45]]];
    if(step===1) stems[2]=[[97,95],[103,77],[115,58],[127,48]];
    if(step===2) stems[0]=[[96,94],[88,73],[82,60],[68,49]];
    for(const stem of stems) {
      q.stroke(stem,step===2?'wood3':'brass3',2);q.stroke(stem,step===2?'wood':'leaf2');
      const [x,y]=stem[3],[bx,by]=stem[2];
      const dx=bx-x,dy=by-y,L=Math.hypot(dx,dy),nx=dy/L,ny=-dx/L;
      for(let i=0;i<5;i++){
        const f=i*.22,sgn=i%2?1:-1;
        const a=x+dx*f+nx*sgn*2,b=y+dy*f+ny*sgn*2;
        if(step===0) {
          q.ellipse(a,b,2.6,3.2,'wine');q.ellipse(a-.5,b-1,1.55,2,'mauve');q.dot(a-1,b-1,'rose');
        } else if(step===1) {
          blossom(q,a+sgn,b,2.7,'wine','mauve','gold');
        } else {
          q.poly([[a-2,b-1],[a-3,b-4],[a-.8,b-3],[a+1,b-5],[a+3,b-3],[a+2,b],[a,b+2]],'wood2');
          q.line([a-2,b-3],[a,b],'brass');q.dot(a+1,b-2,'dark');
        }
      }
    }
    if(step===1) {
      leaf(q,93,75,84,66,2,'leaf3','leaf2','mint');leaf(q,104,72,113,65,2,'leaf3','leaf2','mint');
    } else if(step===2) {
      for(const [x,y] of [[110,86],[115,84],[119,88],[112,92],[122,81]]) {
        p.ellipse(x+amount*2,y,1.5,1,'wood3');p.dot(x-1+amount*2,y-1,'brass2');
      }
    }
    p.poly([[83,84],[104,81],[105,86],[83,90]],'paper2');p.line([85,85],[99,83],'gold');
    p.rect(128,84,9,2,'paper3');p.rect(130,88,5,1,'paper3');
    p.ellipse(50,28,2,2,'brass3');p.dot(50,27,'gold');
  }

  const styles={book,box,bottle,plant,mortar,flowers};
  window.paintInnInterior=(canvas,kind,step=0,detail={})=>{
    const object=styles[kind];
    if(!object) return;
    const p=painter(canvas), page=((Math.trunc(Number(step))||0)%3+3)%3;
    const value=Number(detail?.amount), clock=Number(detail?.time);
    object(p,page,{id:detail?.id || '',amount:Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0,
      time:Number.isFinite(clock)?clock:0});
    p.finish();
  };
})();
