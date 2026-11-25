'use strict';

window.createCabinetDepth = function createCabinetDepth({width, height}) {
  // Keep the 390 × 844 portrait view's eye point in the artwork's coordinates.
  // The room can reflow around the cabinet without rotating its side faces.
  const W = 1536, H = 1088;
  const eyeX = 512.004273;
  const eyeY = 33.438709;
  const leftSide = eyeX < W/2;
  const direction = leftSide ? -1 : 1;
  const nearPost = leftSide ? 89 : 1446;
  const edgeDistance = direction * (eyeX - nearPost);
  // Near a head-on view, only a slim return underneath the projecting cornice
  // shows. The wider faces inside the cabinet still follow the room perspective.
  const returnWidth = Math.min(49, Math.max(24, 44 + .10*edgeDistance));
  const depth = .091;
  const cabinetEye = nearPost + direction*returnWidth/depth;
  const mirror = x => leftSide ? x : W-x;
  const project = (x,y,t,outer=false) => [
    x + ((outer ? cabinetEye : eyeX)-x)*depth*t,
    y + (eyeY-y)*depth*t
  ];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const makePlane = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    return {canvas, ctx, image:ctx.createImageData(width,height)};
  };
  const back = makePlane(), front = makePlane();
  // Reuse wood tones from the front illustration, from deep crevice to cut edge.
  const swatches = ['#211914','#2a1c16','#312117','#3b271c','#50311f','#66391f',
    '#804526','#9a542a','#b46830','#cf813a'];
  const rgb = swatches.map(hex=>[1,3,5].map(p=>parseInt(hex.slice(p,p+2),16)));
  const texel = Math.max(W/width,H/height);
  function grain(x,y) {
    const seed = Math.imul(x|0,73856093) ^ Math.imul(y|0,19349663);
    return (Math.imul(seed ^ seed>>>13,1274126177)>>>22) / 1024;
  }
  const upper = [[266,139],[266,132],[1268,132],[1271,138],[1310,144],[1341,157],
    [1360,177],[1373,202],[1378,233],[1396,236],[1396,410],[134,410],[134,234],
    [155,231],[161,206],[170,181],[183,165],[205,152],[237,144]];
  function insideUpper(x,y) {
    if (y>=236) return x>=134 && x<=1396;
    let inside=false;
    for(let i=0,j=upper.length-1; i<upper.length; j=i++) {
      const [x0,y0]=upper[i], [x1,y1]=upper[j];
      if ((y0>y)!==(y1>y) && x<(x1-x0)*(y-y0)/(y1-y0)+x0) inside=!inside;
    }
    return inside;
  }
  // Scan a receding board. Front and rear edges remain parallel, so each pixel
  // can be mapped to its plank coordinate and depth without filtering the grain.
  function face(layer,axis,line,start,end,t0,t1,finish,{outer=false,clip=null}={}) {
    const isSide=axis==='vertical';
    const corner=(u,t)=>project(isSide ? line : u, isSide ? u : line,t,outer);
    const a=corner(start,t0), b=corner(end,t0), c=corner(start,t1), d=corner(end,t1);
    const run=isSide ? 0 : 1, span=1-run;
    if (Math.abs(c[run]-a[run])<.1) return;
    const xmin=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0],d[0])*width/W));
    const xmax=Math.min(width,Math.ceil(Math.max(a[0],b[0],c[0],d[0])*width/W));
    const ymin=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1],d[1])*height/H));
    const ymax=Math.min(height,Math.ceil(Math.max(a[1],b[1],c[1],d[1])*height/H));
    const data=layer.image.data;
    for (let py=ymin;py<ymax;py++) for (let px=xmin;px<xmax;px++) {
      const x=(px+.5)*W/width,y=(py+.5)*H/height;
      if (clip && !clip(x,y)) continue;
      const v=((isSide ? x:y)-a[run])/(c[run]-a[run]);
      if (v<0 || v>1) continue;
      const first=a[span]+(c[span]-a[span])*v,last=b[span]+(d[span]-b[span])*v;
      const u=((isSide ? y:x)-first)/(last-first);
      if (u<0 || u>1) continue;
      const tone=finish(start+u*(end-start),t0+v*(t1-t0),x,y,u,v);
      if (tone===null) continue;
      const color=rgb[clamp(Math.floor(tone),0,rgb.length-1)];
      const i=4*(py*width+px);
      data[i]=color[0]; data[i+1]=color[1]; data[i+2]=color[2]; data[i+3]=255;
    }
  }
  // Thin lines wander along the timber. Their intermittent ends follow a much
  // slower rhythm than the small flecks on the grain.
  function timber(length,cross,base,seed) {
    const lane=Math.floor(cross/3.8+1.15*Math.sin(length*.019+seed)+.75*Math.sin(length*.051));
    const nick=grain(lane+seed,Math.floor((length+seed)/28));
    const fleck=grain(Math.floor(length/5.4),Math.floor(cross/4.6)+seed);
    return base + (nick>.88 ? .9 : nick<.08 ? -.65 : 0) + (fleck>.95 ? .55 : 0);
  }
  function outsideBoard(start,end,line,kind) {
    face(back,'vertical',mirror(line),start,end,0,1,(length,t,x,y,u)=>{
      const edge=t*returnWidth, shade=leftSide ? 0.35 : -.3;
      if (t>.96) return 2;
      if (kind==='panel') {
        // A framed side with recessed boards, stiles and small pegs at the joints.
        const frame=t<.15 || t>.83 || u<.055 || u>.94;
        const bevel=Math.min(Math.abs(t-.15),Math.abs(t-.83))*returnWidth;
        if (bevel<texel*.85 && u>.05 && u<.95) return t<.5 ? 5 : 2;
        const joint=(length-142)%240;
        if (!frame && edge>returnWidth*.47 && edge<returnWidth*.47+texel) return 2;
        if (frame && (t<.09 || t>.9) && joint>=0 && joint<texel*1.7) return 2;
        return timber(length,edge, (frame ? 5.5:4.5)+shade - t*.7,17);
      }
      if (kind==='foot') return timber(length,edge,4.4+shade-t,9);
      if (u>.78) return 2.9;
      if (u<.17) return 7.3 - t*.85 + shade;
      return timber(edge,length,5.65 + shade - t,8);
    },{outer:true});
  }
  // The two back feet sit well inside the outer front feet. The paving shows
  // between them under the apron.
  face(back,'horizontal',1017,103,1419,.13,1,(u,t)=>timber(u,t*96,2.65,32));
  for (const [l,r] of [[102,181],[1340,1417]]) {
    const [x0,y0]=project(l,1000,.88), [x1,y1]=project(r,1051,.88);
    const data=back.image.data;
    for(let py=Math.max(0,Math.floor(y0*height/H));py<Math.min(height,Math.floor(y1*height/H));py++) {
      for(let px=Math.max(0,Math.floor(x0*width/W));px<Math.min(width,Math.floor(x1*width/W));px++) {
        const tone=rgb[Math.floor(timber(py,px,2.8,21))], i=4*(py*width+px);
        data[i]=tone[0]; data[i+1]=tone[1]; data[i+2]=tone[2]; data[i+3]=255;
      }
    }
  }
  outsideBoard(93,991,89,'panel');
  outsideBoard(957,1056,74,'foot');
  outsideBoard(725,770,64,'rail');
  outsideBoard(963,989,70,'rail');
  outsideBoard(52,99,49,'rail');
  // A projecting molding has a return across its width as well as an end.
  // Join the two faces at the same lip, so no wall shows through the corners.
  for (const [upper,lower,l,r] of [[52,99,49,1487],[725,770,64,1472],[963,989,70,1466]]) {
    if (eyeY<upper) {
      face(back,'horizontal',upper,l,r,0,1,(u,t)=>timber(u,t*85,6.6-t,12),{outer:true});
    } else if (eyeY>lower) {
      face(back,'horizontal',lower,l,r,0,1,(u,t)=>timber(u,t*85,3.6-t*.6,32),{outer:true});
    }
  }

  for (const [top,bottom] of [[133,411],[453,725]]) {
    const clip=top===133 ? insideUpper : (x,y)=>x>=133 && x<=1395 && y>=453 && y<725;
    const options={clip};
    for (const x of [133,1397]) {
      // Only the inner-facing jamb can be seen on each side of the eye line.
      if ((x===133 && eyeX<=x) || (x===1397 && eyeX>=x)) continue;
      face(front,'vertical',x,top,bottom,0,1,(l,t)=>{
        const dovetail=(l-top)%112;
        if (t>.955) return 1.9;
        if (t<.045) return x===1397 ? 5.1 : 4.25;
        if (dovetail<texel && t<.32) return 2.3;
        return timber(l,t*104,4.1+(x===1397 ? .45 : .0)-1.05*t,55);
      },options);
    }
    if (eyeY>top) face(front,'horizontal',top,133,1397,0,1,(l,t)=>{
      if (t>.91) return 1.85;
      if (t<.10) return 3.75;
      return timber(l,t*108,3.2-.65*t,2);
    },options);
    if (eyeY<bottom) face(front,'horizontal',bottom,133,1397,0,1,(l,t)=>{
      if (t>.95) return 1.9;
      // Narrow depth boards are mortised into the side of each shelf.
      if (Math.abs(t-.65)<.027) return 3.55;
      return timber(l,t*109,5.7-1.45*t,top);
    },options);
  }
  back.ctx.putImageData(back.image,0,0);
  front.ctx.putImageData(front.image,0,0);
  return {behind:back.canvas, inset:front.canvas};
};
