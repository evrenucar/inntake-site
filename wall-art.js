(() => {
  // The lettering is drawn on the same pixel grid as the sign carving.
  const letters = {
    ' ': ['00'],
    A: ['00100','01010','01010','10001','11111','10001','10001'],
    a: ['0000','0000','0111','1001','1001','1011','0111'],
    b: ['1000','1000','1010','1101','1001','1001','1110'],
    e: ['0000','0000','0110','1001','1110','1000','0111'],
    f: ['0011','0100','1110','0100','0100','0100','0100'],
    g: ['0000','0000','0111','1001','1001','0111','0001','1110'],
    h: ['1000','1000','1010','1101','1001','1001','1001'],
    i: ['1','0','1','1','1','1','1'],
    k: ['1000','1000','1010','1100','1100','1010','1001'],
    l: ['10','10','10','10','10','10','01'],
    n: ['0000','0000','1010','1101','1001','1001','1001'],
    o: ['0000','0000','0110','1001','1001','1001','0110'],
    r: ['000','000','101','110','100','100','100'],
    s: ['0000','0000','0111','1000','0110','0001','1110'],
    t: ['010','010','111','010','010','010','001'],
    u: ['0000','0000','1001','1001','1001','1001','0111'],
    v: ['0000','0000','1001','1001','1001','1010','0100'],
    y: ['0000','0000','1001','1001','1001','0111','0001','0110'],
    '.': ['0','0','0','0','0','1','1'],
  };

  function inscription(ctx, text, center, top, scale, ink) {
    const advance = char => letters[char][0].length * scale + 1;
    const width = [...text].reduce((sum, char) => sum + advance(char), -1);
    let left = Math.round(center - width / 2);
    ctx.fillStyle = ink;
    for (const char of text) {
      const glyph = letters[char];
      glyph.forEach((row, y) => {
        // A restrained, right-leaning pen. Flat letter feet keep short copy clear.
        const lean = y < 2 ? scale : y < 5 ? 1 : 0;
        for (let x = 0; x < row.length; x++) {
          if (row[x] === '1') ctx.fillRect(left + x * scale + lean, top + y * scale, scale, scale);
        }
      });
      left += advance(char);
    }
  }

  function pixelTools(ctx) {
    function rect(x, y, width, height, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, width, height);
    }
    // All edges land on whole pixels, including diagonals.
    function line(x1, y1, x2, y2, color) {
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
      for (let i = 0; i <= steps; i++) {
        rect(Math.round(x1 + (x2 - x1) * i / steps), Math.round(y1 + (y2 - y1) * i / steps), 1, 1, color);
      }
    }
    function polygon(points, color) {
      const rows = points.map(point => point[1]);
      for (let y = Math.min(...rows); y < Math.max(...rows); y++) {
        const intersections = [];
        for (let i = 0; i < points.length; i++) {
          const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length];
          if ((ay > y + .5) === (by > y + .5)) continue;
          intersections.push(ax + (y + .5 - ay) * (bx - ax) / (by - ay));
        }
        intersections.sort((a,b) => a-b);
        for (let i = 0; i + 1 < intersections.length; i += 2) {
          const x = Math.ceil(intersections[i] - .5);
          rect(x, y, Math.ceil(intersections[i + 1] - .5) - x, 1, color);
        }
      }
    }
    return {rect, line, polygon};
  }

  // Growth rings follow the grain around the checks. Rain and iron stain the plank ends.
  function weatherSign(ctx) {
    const frame=ctx.getImageData(0,0,160,112), pixels=frame.data;
    const boardColors=new Set([0x6c452e,0x64412f,0x6a4531,0x5e3d2d,0x845332]);
    for(let y=10;y<106;y++) for(let x=1;x<158;x++) {
      const i=(160*y+x)*4;
      if(!boardColors.has(pixels[i]<<16 | pixels[i+1]<<8 | pixels[i+2])) continue;
      const end=Math.max(0,1-Math.min(x,158-x)/35);
      const bend=Math.sin(x*.063+y*.28)*1.16+Math.sin(x*.026-y*.19)*.86;
      const band=Math.sin((y+bend)*1.96), broad=Math.sin((y+bend)*.63);
      const stain=(cx,cy,w,h) => Math.max(0,1-((x-cx)/w)**2-((y-cy)/h)**2);
      const iron=stain(32,22,7,14)+stain(125,24,5,12);
      const rain=stain(15,74,14,24)+stain(146,46,13,20);
      const speck=(Math.imul(x>>1,193) ^ Math.imul(y>>1,541) ^ Math.imul(x>>2,y>>1))&15;
      let tone=band>.67 ? 1 : band<-.68 ? -1 : 0;
      tone*=3+end*7;
      tone+=broad*(2+4*end) - iron*(12+speck*.6) - rain*(5+speck*.35);
      if(speck===3 && end>.48) tone+=5;
      pixels[i]+=Math.round(tone); pixels[i+1]+=Math.round(tone*.71); pixels[i+2]+=Math.round(tone*.47);
    }
    ctx.putImageData(frame,0,0);
  }

  function paintWall(canvas) {
    canvas.width = 160;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const {rect, line, polygon} = pixelTools(ctx);
    const outline = [[2,35],[6,31],[5,23],[16,23],[20,18],[33,18],[40,14],[58,14],[63,10],[71,10],[78,6],[86,7],[92,11],[100,11],[106,15],[122,15],[131,19],[143,19],[146,24],[155,25],[154,32],[158,37],[155,44],[156,50],[153,55],[155,66],[154,74],[157,81],[154,88],[148,88],[144,94],[129,95],[123,99],[103,99],[96,103],[88,103],[80,108],[74,107],[68,103],[59,103],[51,100],[33,100],[27,96],[15,96],[12,90],[5,90],[6,84],[2,80],[5,72],[4,63],[6,58],[3,51],[4,43]];
    const shifted = (points, dx, dy) => points.map(([x,y]) => [x + dx,y + dy]);

    // A pair of short blacksmith's chain hangers, visible behind the oak.
    for (const [x,lean] of [[35,-1],[123,1]]) {
      rect(x - 2,1,6,3,'#32251e');
      rect(x - 1,0,3,2,'#a18966');
      for (let y = 3; y < 19; y += 4) {
        const cx = x + lean * Math.floor((y - 3) / 8);
        rect(cx - 1,y,4,3,'#342b25');
        rect(cx - 1,y,2,2,'#918068');
        rect(cx,y + 1,2,1,'#47392e');
        rect(cx,y + 3,2,2,'#76634c');
      }
    }
    polygon(shifted(outline,2,4), 'rgba(30,21,17,.64)');
    polygon(shifted(outline,1,2), '#39261e');
    polygon(outline, '#845332');

    function rim(color, dx, dy, upperOnly) {
      for (let i=0; i<outline.length; i++) {
        const [x1,y1]=outline[i], [x2,y2]=outline[(i+1)%outline.length];
        if (upperOnly && (x2 < x1 || y2 - y1 > 3)) continue;
        line(x1+dx,y1+dy,x2+dx,y2+dy,color);
      }
    }
    rim('#633f2b',0,0,false);
    rim('#b88855',0,0,true);

    // Each plank has an uneven cut end, a worn upper lip, and a dark heartwood seam.
    polygon([[5,36],[18,25],[37,21],[59,17],[79,11],[100,17],[121,20],[144,25],[152,33],[153,41],[6,41]], '#6c452e');
    polygon([[5,42],[154,40],[153,54],[150,59],[7,61],[5,54]], '#64412f');
    polygon([[7,62],[151,60],[153,76],[8,80],[6,74]], '#6a4531');
    polygon([[6,81],[152,77],[153,86],[144,89],[138,92],[125,93],[119,97],[100,97],[90,101],[80,105],[70,101],[62,101],[51,98],[31,97],[24,93],[15,93],[11,87],[6,87]], '#5e3d2d');
    weatherSign(ctx);
    line(7,42,151,40,'#4f3327'); line(9,43,37,42,'#8b5d3c');
    line(7,61,150,59,'#533729'); line(100,60,144,60,'#895d3f');
    line(8,80,151,76,'#523528'); line(8,81,38,80,'#875a3c');
    for (const [x,y,w] of [[11,35,12],[14,34,8],[37,22,9],[45,21,7],[104,24,11],[129,30,10],[140,31,4],[10,66,12],[20,65,5],[123,68,10],[137,65,9],[21,89,15],[34,90,13],[50,94,10],[105,93,10],[120,88,15]]) rect(x,y,w,1,'#80573d');
    for (const [x,y,w] of [[7,48,12],[15,47,8],[9,52,8],[130,47,13],[139,46,7],[14,86,8],[99,90,6],[114,95,6]]) rect(x,y,w,1,'#56392c');
    line(7,46,12,45,'#432d24'); line(12,45,18,46,'#432d24');
    rect(146,65,6,1,'#432d24'); line(142,68,146,65,'#432d24');

    // Old shakes run in from the exposed end grain. Each split has an open mouth and a raised lip.
    polygon([[3,50],[9,51],[18,50],[22,51],[32,50],[25,52],[17,52],[14,53],[6,54]],'#382a24');
    line(6,54,15,53,'#a47952'); line(17,52,22,52,'#966747');
    line(18,50,23,48,'#553a2b');
    polygon([[155,61],[145,62],[139,61],[134,64],[125,64],[132,65],[139,64],[144,64],[150,63],[155,63]],'#3b2d25');
    line(141,64,150,63,'#a77c53'); line(127,65,133,65,'#926546');
    polygon([[18,92],[26,91],[32,91],[37,89],[43,89],[36,92],[25,94]],'#805a40');
    // The iron tongues carry the short chains; their heads shed narrow streaks of rust.
    for(const [x,y,lean] of [[32,17,-1],[125,18,1]]) {
      polygon([[x-2,y],[x+3,y],[x+3,y+4],[x+lean+1,y+7],[x-2,y+5]],'#574336');
      rect(x-1,y,3,1,'#8c7860'); rect(x-1,y+2,2,2,'#382d28');
      rect(x+lean,y+6,2,3,'#745039'); rect(x+lean,y+9,1,3,'#79553c');
    }
    // Pull a few quarter-inch splinters out of the silhouette, down to the wall.
    ctx.save();
    ctx.globalCompositeOperation='destination-out';
    for(const notch of [
      [[1,48],[10,51],[4,53],[0,55]], [[155,60],[160,58],[159,65],[150,63]],
      [[13,96],[19,92],[23,94],[18,98]], [[92,105],[96,100],[100,103],[98,106]],
      [[48,13],[51,13],[53,15],[50,15]],
    ]) polygon(notch,'#000');
    ctx.restore();
    line(15,94,18,92,'#aa7b50'); line(94,102,96,100,'#9d7149');

    // The inn is painted directly on the plank, flanked by hand-letterer's scrollwork.
    function scroll(mirror) {
      const flip = x => mirror ? 158-x : x;
      const stroke = (points, color) => {
        for(let i=1; i<points.length; i++) line(flip(points[i-1][0]),points[i-1][1],flip(points[i][0]),points[i][1],color);
      };
      stroke([[13,41],[18,38],[27,38],[34,34],[38,29],[44,27],[48,28],[49,30],[47,31],[44,30]],'#c49358');
      stroke([[29,37],[36,37],[41,34],[45,34]],'#a97845');
      stroke([[21,37],[20,34],[16,33],[17,36],[21,37]],'#c49358');
      stroke([[49,37],[52,35],[55,35]],'#d6a466');
      rect(flip(53),29,1,2,'#d6a466');
    }
    scroll(false); scroll(true);

    // Gilt flakes along the scrollwork reveal the oak in horizontal slivers.
    for(const [x,y,w] of [[19,37,2],[31,35,2],[45,27,2],[113,28,2],[125,35,2],[140,38,1]]) rect(x,y,w,1,'#705039');

    // A slightly listing inn. Its clay roof sags between the peak and a tarred chimney.
    rect(86,15,4,10,'#4a392d'); rect(87,11,5,5,'#674d3c');
    rect(86,11,7,2,'#42372d'); rect(87,11,3,1,'#94785a');
    rect(86,16,2,2,'#907055'); rect(89,14,2,1,'#4b3a2d');
    polygon([[58,31],[70,18],[83,27],[97,26],[96,43],[80,45],[60,44]],'#47372b');
    polygon([[62,28],[71,18],[81,29],[80,43],[61,42]],'#c7a477');
    polygon([[81,28],[97,27],[95,41],[79,43]],'#ac825e');
    polygon([[53,32],[57,29],[60,27],[63,23],[66,22],[70,15],[73,14],[77,15],[80,20],[83,23],[88,26],[86,30],[81,30],[72,20],[68,25],[65,26],[60,32],[55,34]],'#4b392e');
    polygon([[54,31],[61,25],[67,21],[71,15],[74,15],[80,22],[85,26],[83,28],[78,23],[72,18],[68,23],[65,24],[60,30]],'#9e6044');
    line(55,31,61,26,'#c69160'); line(66,22,71,16,'#d3a074');
    line(76,19,80,23,'#be8056'); rect(60,27,2,1,'#b58058');
    polygon([[74,16],[80,16],[85,18],[90,17],[93,21],[100,25],[102,28],[96,28],[88,29],[83,25]],'#83553e');
    polygon([[76,17],[80,17],[86,19],[90,18],[95,23],[89,23],[85,22]],'#a36b4a');
    rect(88,19,4,2,'#694d38'); rect(88,20,2,1,'#624b38');
    line(86,28,92,28,'#56412f'); line(92,28,99,26,'#654731');
    for(const [x,y,w] of [[79,18,3],[82,21,3],[87,24,3],[94,24,3],[67,22,2],[62,26,2]]) rect(x,y,w,1,'#b27950');
    // Warm limewash survives in patches between smoke-darkened beams.
    rect(64,30,4,2,'#d4b486'); rect(67,28,2,2,'#c5aa80');
    rect(62,39,4,3,'#9a7957'); rect(77,40,3,2,'#9e7f5f');
    rect(89,30,4,2,'#ba9268'); rect(90,31,4,1,'#997655'); rect(92,39,3,2,'#927056');
    line(62,31,61,42,'#6a4b35'); line(72,21,71,42,'#5c4433');
    line(81,29,80,43,'#5f4735'); line(95,29,94,41,'#594332');
    line(63,33,79,34,'#6d4f37'); line(81,34,95,32,'#6c4d35');
    line(64,32,70,26,'#7f6041'); line(74,26,79,32,'#78583d');
    rect(64,34,6,7,'#745439'); rect(65,35,4,5,'#dfad69'); rect(66,35,1,4,'#f6c883');
    rect(67,35,1,5,'#986c41'); rect(63,35,1,5,'#88613e');
    rect(83,35,7,5,'#614932'); rect(84,36,5,3,'#e4ac60'); rect(86,36,1,3,'#8b633b');
    rect(73,35,5,8,'#654a34'); rect(74,35,3,3,'#bc8e53'); rect(76,40,1,1,'#d2aa72');
    line(97,31,102,30,'#4b372b'); rect(101,31,1,2,'#675038');
    rect(100,33,3,5,'#8b613b'); rect(100,34,3,3,'#efb866'); rect(101,34,1,2,'#ffd998');
    polygon([[59,42],[69,43],[76,42],[80,44],[94,41],[98,42],[92,44],[78,46],[64,45],[56,46]],'#65533d');
    line(57,45,65,44,'#98754d'); line(84,44,93,42,'#8a6b47');
    for(const [x,y] of [[48,40],[53,25],[106,42],[104,22]]) rect(x,y,1,1,'#c89d65');

    inscription(ctx, 'A library for', 79, 49, 2, '#f5daab');
    inscription(ctx, 'all your thoughts', 79, 69, 2, '#f5daab');
    for (const flip of [x=>x,x=>158-x]) {
      line(flip(52),92,flip(65),92,'#b0834f');
      line(flip(65),92,flip(70),94,'#b0834f');
      line(flip(70),94,flip(75),94,'#b0834f');
      rect(flip(72),91,2,1,'#bc925e');
    }
    polygon([[79,90],[82,94],[79,98],[76,94]],'#c2965e');
    rect(79,92,1,3,'#765135');
    for(const [x,y] of [[9,30],[148,31],[10,84],[149,82]]) {
      rect(x,y,3,3,'#443026'); rect(x,y,2,1,'#bd9765');
    }
    canvas.closest('.picture')?.classList.add('painted');
  }

  function floorDrawing(canvas, width = 80, height = 48) {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    return ctx && pixelTools(ctx);
  }

  // Paint in the material's own coordinates, so grain and wear turn with each face.
  function surface(drawing, corners, material) {
    const [[ax,ay],[bx,by],[cx,cy],[dx,dy]] = corners;
    function triangle(points, uv) {
      const [[x0,y0],[x1,y1],[x2,y2]] = points;
      const area = (y1-y2)*(x0-x2) + (x2-x1)*(y0-y2);
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      const xMin=Math.min(...xs), xMax=Math.max(...xs), yMax=Math.max(...ys);
      for (let y = Math.min(...ys); y < yMax; y++) {
        for (let x = xMin; x < xMax; x++) {
          const a = ((y1-y2)*(x+.5-x2) + (x2-x1)*(y+.5-y2)) / area;
          const b = ((y2-y0)*(x+.5-x2) + (x0-x2)*(y+.5-y2)) / area;
          const c = 1-a-b;
          if (Math.min(a,b,c) < -.00001) continue;
          const u = a*uv[0][0]+b*uv[1][0]+c*uv[2][0], v = a*uv[0][1]+b*uv[1][1]+c*uv[2][1];
          drawing.rect(x, y, 1, 1, material(u,v,x,y));
        }
      }
    }
    triangle([corners[0],corners[1],corners[2]], [[0,0],[1,0],[1,1]]);
    triangle([corners[0],corners[2],corners[3]], [[0,0],[1,1],[0,1]]);
    return (u, v) => [
      Math.round((1-u)*(1-v)*ax + u*(1-v)*bx + u*v*cx + (1-u)*v*dx),
      Math.round((1-u)*(1-v)*ay + u*(1-v)*by + u*v*cy + (1-u)*v*dy),
    ];
  }

  const malletImage = new Image();
  malletImage.src = './assets/mallet.png';
  const malletColors = [
    [58,37,25], [82,51,32], [101,61,34], [103,74,56], [123,72,37], [131,87,64],
    [149,85,40], [165,96,59], [182,108,64], [160,111,85], [177,122,90], [196,120,71],
    [189,136,101], [210,135,79], [212,151,104], [230,173,120],
  ];

  function paintMallet(canvas, view = 'floor') {
    const floor = view === 'floor', close = view === 'head';
    const room = document.querySelector('.room').getBoundingClientRect();
    const cell = Math.max(2.2, room.width / 540, room.height / 380);
    const width = floor ? Math.max(31, Math.round(canvas.getBoundingClientRect().width / cell)) : close ? 65 : 88;
    const crop = close ? [0,0,142,111] : [0,0,224,149];
    const height = Math.round(width * crop[3] / crop[2]);
    const spriteWidth = floor ? Math.round(width * .93) : width;
    const spriteHeight = Math.round(spriteWidth * crop[3] / crop[2]);
    canvas.width = width;
    canvas.height = height;
    function draw() {
      if (!malletImage.naturalWidth || canvas.width !== width || canvas.height !== height) return;
      const ctx = canvas.getContext('2d', {willReadFrequently:true});
      if (!ctx) return;
      // Average the photograph sprite into native room cells, then restore its original wood palette.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0,0,width,height);
      ctx.drawImage(malletImage,...crop,0,0,spriteWidth,spriteHeight);
      const body = ctx.getImageData(0,0,spriteWidth,spriteHeight).data;
      const frame = ctx.createImageData(width, height);
      const bottoms = new Int16Array(spriteWidth).fill(-1);
      const offsetX = floor ? Math.max(1,Math.round(width*.017)) : 0;
      for(let y=0;y<spriteHeight;y++) for(let x=0;x<spriteWidth;x++) {
        const i=(y*spriteWidth+x)*4;
        if(body[i+3]<108) continue;
        bottoms[x]=y;
        let nearest=malletColors[0], best=Infinity;
        for(const rgb of malletColors) {
          const delta=(body[i]-rgb[0])**2*.8+(body[i+1]-rgb[1])**2+(body[i+2]-rgb[2])**2*.6;
          if(delta<best) { best=delta; nearest=rgb; }
        }
        const dst=(y*width+x+offsetX)*4;
        frame.data.set(nearest,dst);
        frame.data[dst+3]=255;
      }
      if(floor) {
        // Project the raised wooden head onto the stones. Its full thickness throws
        // a wedge of shade. The slender handle sits close to its contact line.
        const shadow=new Uint8Array(width*height);
        function shade(x,y,alpha) {
          if(x>=0 && x<width && y>=0 && y<height) {
            const i=y*width+x;
            shadow[i]=Math.max(shadow[i],alpha);
          }
        }
        for(let x=0;x<spriteWidth;x++) {
          const foot=bottoms[x];
          if(foot<0) continue;
          for(let y=0;y<=foot;y++) {
            if(body[(y*spriteWidth+x)*4+3]<108) continue;
            const lift=foot-y;
            const sx=x+offsetX+1+Math.round(lift*.30), sy=foot+1+Math.round(lift*.16);
            shade(sx+1,sy+1,57);
            shade(sx,sy,105);
          }
          shade(x+offsetX,foot+1,157);
          shade(x+offsetX+1,foot+1,135);
        }
        for(let i=0;i<shadow.length;i++) {
          if(!shadow[i] || frame.data[i*4+3]) continue;
          frame.data.set([29,22,18,shadow[i]],i*4);
        }
      }
      ctx.putImageData(frame,0,0);
    }
    if (malletImage.complete) draw();
    else malletImage.addEventListener('load', draw, {once:true});
  }

  function paintGrimoire(canvas) {
    const d = floorDrawing(canvas, 112, 68);
    if (!d) return;
    const {rect, line, polygon} = d;
    polygon([[13,18],[64,7],[74,11],[101,37],[103,45],[96,49],[57,61],[42,63],[36,61],[11,30]],'rgba(29,22,20,.23)');
    polygon([[13,20],[65,8],[72,12],[99,37],[100,44],[94,48],[56,59],[41,62],[37,59],[11,29]],'rgba(33,24,20,.41)');
    polygon([[13,21],[66,9],[72,14],[98,38],[97,44],[91,47],[46,60],[40,59],[12,29]],'rgba(37,25,21,.61)');

    // Boards project over the text block. The near edge is gently concave from the binding.
    polygon([[9,18],[64,5],[71,10],[99,37],[97,43],[46,59],[39,58],[9,27]],'#4c342c');
    polygon([[12,20],[65,7],[96,38],[95,42],[45,57],[40,55]],'#865940');
    surface(d,[[65,9],[95,34],[95,41],[65,16]], (u,v,x,y) => {
      const row=(v+.04*Math.sin(u*9))*8.5;
      const shade=row-Math.floor(row);
      if(v<.2) return '#977a53';
      return shade<.18 ? '#ac9066' : shade<.63 ? '#bfaa7d' : '#cbb58a';
    });
    surface(d,[[40,47],[96,32],[95,41],[42,56]], (u,v,x,y) => {
      const wave=v+.045*Math.sin(u*12)+.037*Math.cos(u*25+v*9);
      const row=wave*8, phase=row-Math.floor(row);
      if(v<.13) return '#9f8259';
      if(u<.095) return phase<.36 ? '#a18b66':'#c6b18b';
      if(phase<.15 && ((x*13+y*7)%11)>1) return '#a99167';
      return phase<.46 ? '#ccb88c' : '#ddc99d';
    });
    // A woven sage bookmark slips between two gatherings and lies back on the floor.
    polygon([[61,48],[67,46],[69,50],[72,53],[76,55],[76,58],[72,57],[71,60],[66,56],[63,53]],'#4c6255');
    polygon([[62,48],[66,47],[67,51],[72,55],[74,56],[72,56],[71,58],[67,55],[64,53]],'#77856b');
    line(63,48,65,52,'#a2a58a');

    // Rolled leather gives the spine its own curved face, and each raised cord continues around it.
    surface(d,[[9,17],[40,48],[40,57],[10,26]], (u,v) => {
      const band=[.12,.34,.66,.88].some(k => Math.abs(u-k)<.018);
      if(v<.18) return band ? '#ad805d' : '#8f6349';
      if(v<.55) return band ? '#90654b' : '#76503e';
      return band ? '#805a44' : '#5f4235';
    });
    // Warm oxblood calfskin, rubbed lighter at its margins and creased at the joint.
    polygon([[9,14],[62,2],[67,4],[99,31],[98,35],[44,51],[38,50],[8,19]],'#54382e');
    polygon([[9,14],[62,2],[65,3],[98,31],[96,33],[43,49],[39,48],[9,18]],'#9c6d4f');
    const cover = surface(d,[[10,14],[63,3],[97,31],[41,48]], (u,v,x,y) => {
      const edge=Math.min(u,1-u,v,1-v);
      const wear=Math.sin(v*15+u*27)*.48+Math.sin(v*33-u*11)*.36;
      if(u<.035) return '#614036';
      if(u<.085) return wear>.28 ? '#99674e' : '#895741';
      if(u<.13) return '#764b39';
      if(u<.155) return '#553a30';
      if(u<.176) return '#98664b';
      if(edge<.05) return wear>.10 ? '#a06c4e' : '#8f5c43';
      if(wear>.48 && edge<.19) return '#905c46';
      if(((x*19+y*31+x*y*3)%57)===0 || wear<-.65) return '#7b503e';
      return '#82523f';
    });
    function tooling(loop, ink) {
      for(let i=1;i<loop.length;i++) line(...cover(...loop[i-1]),...cover(...loop[i]),ink);
    }
    tooling([[.221,.125],[.258,.076],[.905,.076],[.94,.126],[.94,.875],[.90,.927],[.255,.927],[.22,.878],[.221,.125]],'#644233');
    tooling([[.231,.132],[.262,.099],[.895,.099],[.916,.135]],'#a47350');
    tooling([[.244,.167],[.275,.131],[.884,.131],[.902,.163],[.902,.846],[.877,.88],[.278,.88],[.244,.849],[.244,.167]],'#976747');
    // Slight scrapes at the corners catch the light of the room.
    tooling([[.80,.19],[.84,.18],[.87,.19]],'#a47553');
    tooling([[.36,.83],[.40,.82]],'#986a4b');
    // Raised sewing bands turn across the rounded spine; their feet sink into the boards.
    for(const t of [.12,.34,.66,.88]) {
      const cross=(v,ink) => tooling([[.005,v],[.042,v-.016],[.095,v-.013],[.143,v]],ink);
      cross(t-.029,'#ae805d'); cross(t,'#9e7355'); cross(t+.035,'#624235');
      line(...cover(.005,t+.025),...cover(.005,t+.085),'#5f4134');
    }
    // Near end of the rounded spine, with the bound headband disappearing into the papers.
    polygon([[38,46],[41,48],[47,46],[47,50],[43,53],[43,56],[40,57],[37,53]],'#704c3c');
    line(39,48,42,50,'#a47a56'); line(42,50,45,49,'#b59765');
    rect(44,50,1,2,'#a7966a'); rect(46,49,1,2,'#92734f');
    line(46,55,60,51,'#8c6149'); line(71,48,93,42,'#93694e');
    // Small folded brass corner guards, burnished only on their most exposed ridges.
    for (const pts of [
      [[.84,.02],[.992,.02],[.99,.19],[.95,.142],[.93,.07]],
      [[.867,.98],[.99,.845],[.99,.98],[.867,.98]],
    ]) {
      polygon(pts.map(p => cover(...p)),'#af8857');
      line(...cover(...pts[0]),...cover(...pts[1]),'#d4ae71');
      const [x,y]=cover(...pts[2]); rect(x-1,y-1,2,1,'#876744');
    }
    // Clasp riveted to the fore-edge, held by a folded leather tab.
    polygon([[77,17],[81,16],[85,18],[84,21],[87,24],[86,27],[83,26],[81,22]],'#644534');
    polygon([[75,16],[80,15],[83,17],[83,19],[78,21],[75,19]],'#b08a53');
    polygon([[76,17],[80,16],[81,17],[79,19],[77,19]],'#d9b77d');
    rect(79,17,2,1,'#8a6a45');
    polygon([[81,19],[85,18],[88,21],[89,25],[87,27],[84,24]],'#856642');
    line(83,19,87,23,'#dab67c'); line(85,25,87,25,'#c29e66');
  }

  function paintMap(canvas) {
    const drawing = floorDrawing(canvas);
    if (!drawing) return;
    const {rect, line, polygon} = drawing;
    polygon([[4,16],[20,9],[32,10],[51,6],[63,9],[74,12],[78,36],[63,38],[48,36],[30,43],[19,42],[8,45]],'rgba(32,24,20,.24)');
    polygon([[4,17],[20,11],[32,12],[53,7],[70,11],[75,34],[62,37],[48,34],[30,41],[18,41],[8,43]],'rgba(35,24,19,.44)');
    polygon([[5,17],[31,11],[53,7],[69,11],[74,33],[62,35],[49,33],[30,40],[21,38],[8,42]],'rgba(41,29,20,.55)');

    // The valley fold darkens the western panel. The middle leaf catches the upper-left light.
    polygon([[3,14],[19,8],[29,10],[49,3],[52,4],[65,7],[70,6],[75,31],[62,35],[49,31],[29,39],[20,36],[8,41]],'#866644');
    polygon([[3,14],[19,9],[23,34],[8,39]],'#c4a977');
    polygon([[19,9],[29,10],[51,4],[49,29],[30,37],[23,34]],'#edd09a');
    polygon([[51,4],[63,8],[70,6],[74,30],[62,33],[49,30]],'#d0af78');
    line(4,14,18,9,'#e8cd96'); line(20,10,23,32,'#b69868');
    line(28,11,48,5,'#f5dda9'); line(51,6,49,29,'#b79361');
    line(52,6,50,28,'#ebc98e'); line(64,9,68,8,'#ead09b');
    line(8,39,13,37,'#dcc590'); line(27,35,30,36,'#c1a36e');
    // Contours, route waypoints and a small north star surround the cartographer's stamp.
    const contours=[
      [[5,18],[11,15],[16,15],[18,13]], [[6,20],[11,17],[16,18],[19,16]],
      [[8,25],[11,22],[14,23],[16,21],[20,21]], [[9,28],[12,25],[15,26],[18,23],[20,24]],
      [[53,11],[57,14],[62,14],[65,16],[70,14]], [[52,14],[56,17],[62,17],[65,20],[71,17]],
      [[55,27],[60,25],[64,26],[68,24],[72,25]],
    ];
    for(const curve of contours) {
      for(let i=1;i<curve.length;i++) line(...curve[i-1],...curve[i],'#a69369');
    }
    for(const [x,y] of [[11,32],[14,31],[17,31],[20,29],[23,28],[45,26],[48,25],[51,25],[54,23],[57,23],[60,21]]) rect(x,y,2,1,'#a26449');
    rect(60,20,3,3,'#9a654c'); rect(61,21,1,1,'#e7c184');
    line(65,11,65,15,'#7c7356'); line(63,13,67,13,'#7c7356'); rect(65,11,2,1,'#7c7356');

    printOctocat(drawing,24,12,24,12);
  }

  function printOctocat(drawing,left,top,size,shear) {
    // Pixel impression taken from GitHub's official Primer Octicons mark-github-16.
    const stamp=[
      '.........######.........','......############......','.....##############.....',
      '....################....','...##################...','..####..########..####..',
      '.#####...######...#####.','.#####............#####.','.#####............#####.',
      '#####..............#####','#####..............#####','#####..............#####',
      '#####..............#####','#####..............#####','######............######',
      '.######..........######.','.###.###........#######.','.###..####....#########.',
      '..###..##......#######..','...##..........######...','....###........#####....',
      '.....####......####.....','......###......###......','........................',
    ];
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
      if(stamp[Math.floor(y*24/size)][Math.floor(x*24/size)]==='#') {
        drawing.rect(left+x,top+y-Math.floor(x/shear),1,1,'#493936');
      }
    }
  }

  function paintOpenMap(canvas) {
    const d=floorDrawing(canvas,176,104);
    if(!d) return;
    const {rect,line,polygon}=d;
    const outline=[[5,17],[14,15],[22,13],[36,15],[56,12],[70,12],[83,9],[105,9],[118,7],[130,9],[146,7],[161,9],[166,7],[167,27],[165,38],[169,59],[168,74],[171,85],[162,89],[150,87],[132,91],[118,89],[99,93],[78,91],[58,96],[43,93],[26,96],[14,94],[11,80],[12,65],[8,47],[9,30]];
    polygon(outline.map(([x,y])=>[x+3,y+5]),'rgba(33,24,19,.22)');
    polygon(outline.map(([x,y])=>[x+2,y+3]),'rgba(36,26,20,.39)');
    polygon(outline.map(([x,y])=>[x+1,y+1]),'#a0865f');
    polygon(outline,'#dfc391');
    polygon([[5,17],[22,13],[36,15],[56,12],[59,49],[61,93],[56,95],[43,92],[25,94],[14,93],[12,66],[8,45],[9,30]],'#dcc18e');
    polygon([[57,13],[83,9],[105,9],[114,8],[116,48],[118,88],[99,92],[78,90],[61,93],[59,49]],'#ead2a0');
    polygon([[115,9],[130,9],[146,7],[161,9],[166,8],[165,35],[168,60],[167,74],[170,84],[162,87],[149,86],[132,89],[118,87],[116,47]],'#d9bc86');
    line(8,17,22,14,'#efd9a9'); line(37,16,55,13,'#e9cf9d');
    line(56,13,59,48,'#c6a975'); line(59,50,61,92,'#c3a470');
    line(57,13,60,48,'#f2dca8'); line(60,50,62,91,'#efdaa8');
    line(114,11,116,47,'#c0a271'); line(116,49,118,87,'#c0a271');
    line(115,11,117,46,'#e9cc98');
    line(10,51,58,49,'#d1b482'); line(61,49,115,47,'#d9c393'); line(118,47,165,44,'#c9aa79');
    line(20,88,53,88,'#cbb083'); line(63,17,100,14,'#f4dfb0');
    const stroke=(points,ink) => {
      for(let i=1;i<points.length;i++) line(...points[i-1],...points[i],ink);
    };
    // Inset rule and hand-inked contours, with small interruptions where paper was worn in the fold.
    stroke([[13,21],[35,18],[54,17]],'#b69b70');
    stroke([[64,17],[104,13],[111,13]],'#c7ab7d');
    stroke([[120,13],[144,11],[158,13],[161,35]],'#b0986d');
    stroke([[17,70],[19,88],[42,87],[55,90]],'#b69b70');
    stroke([[65,88],[98,86],[111,85]],'#bda578');
    stroke([[125,84],[146,81],[163,82],[163,68]],'#ad9469');
    for(const [cx,cy,rx,ry] of [[36,32,15,5],[56,39,15,4],[80,29,16,6],[139,67,13,6],[44,73,12,4]]) {
      for(let n=0;n<3;n++) {
        const arc=[];
        for(let j=0;j<12;j++) {
          const a=-2.8+j*.48;
          arc.push([Math.round(cx+(rx+2*n+Math.sin(j*1.7))*Math.cos(a)),Math.round(cy+(ry+n+Math.sin(j*.95))*Math.sin(a))]);
        }
        stroke(arc,'#bbaa7d');
      }
    }
    // Smoky mountains and the river downstream from them.
    for(const [x,y,h] of [[19,38,8],[25,36,12],[31,36,7],[34,32,12],[42,33,9],[48,32,6]]) {
      stroke([[x-4,y],[x,y-h],[x+5,y]],'#8c805f');
      stroke([[x,y-h+2],[x+1,y-5],[x+3,y-3]],'#ab956a');
    }
    const river=[[95,18],[93,24],[94,28],[91,33],[83,38],[84,43],[93,47],[96,54],[92,60],[81,65],[79,70],[86,76],[86,81],[82,86]];
    stroke(river,'#819b91'); stroke(river.map(([x,y])=>[x+1,y]),'#99aca0');
    for(const [x,y] of [[103,59],[108,56],[109,62],[114,60],[104,66],[118,64],[124,62]]) {
      line(x,y-5,x-2,y-1,'#879170'); line(x,y-5,x+2,y-1,'#879170');
      line(x,y-3,x-3,y,'#879170'); line(x,y-3,x+3,y,'#879170'); rect(x,y,1,2,'#8b8264');
    }
    // Tiny starting inn and a dotted vermilion track. The track crosses the bridge to the printed seal.
    polygon([[25,68],[31,61],[37,66],[36,73],[26,74]],'#ae956a');
    stroke([[23,68],[31,59],[38,66]],'#9c6b48'); rect(29,68,3,5,'#806948');
    rect(33,66,2,2,'#e6bf79');
    const route=[[36,70],[44,66],[50,61],[59,60],[66,54],[74,53],[81,48],[88,49],[98,47],[105,41],[113,40],[121,35],[125,34]];
    let walked=0;
    for(let i=1;i<route.length;i++) {
      const [x,y]=route[i-1], dx=route[i][0]-x, dy=route[i][1]-y, steps=Math.max(Math.abs(dx),Math.abs(dy));
      for(let j=0;j<steps;j++,walked++) if(walked%6<3) rect(Math.round(x+dx*j/steps),Math.round(y+dy*j/steps),2,1,'#a26145');
    }
    line(88,48,94,45,'#8b7356'); line(89,51,95,48,'#8b7356');
    printOctocat(d,125,20,29,28);
    // A small compass, etched in brown and indigo.
    polygon([[25,47],[28,52],[25,51],[22,54]],'#877b60');
    polygon([[25,58],[23,53],[25,54],[28,50]],'#9b9272');
    line(21,53,29,51,'#766f57');
    polygon([[154,86],[168,74],[170,84],[162,87]],'#e6cc9b');
    line(154,86,168,74,'#bfa476');
  }

  function illustrateGuidebook(canvas) {
    const book=canvas.closest('.guidebook');
    const spread=book.querySelector('.book-spread'), nav=book.querySelector('.book-navigation');
    let lastShape='';
    function render() {
      if(!book.open) return;
      const ctx=canvas.getContext('2d');
      if(!ctx) return;
      book.classList.add('illustrated');
      const bounds=book.getBoundingClientRect(), leaves=spread.getBoundingClientRect();
      const compact=matchMedia('(max-width: 600px)').matches;
      const cssHeight=Math.max(book.clientHeight,nav.offsetTop+nav.offsetHeight+parseFloat(getComputedStyle(book).paddingBottom));
      const cell=Math.max(1.75,bounds.width/390);
      const w=Math.round(bounds.width/cell), h=Math.round(cssHeight/cell);
      const l=Math.round((leaves.left-bounds.left+book.scrollLeft)/cell);
      const r=l+Math.round(leaves.width/cell);
      const t=Math.round((leaves.top-bounds.top+book.scrollTop)/cell);
      const b=t+Math.round(leaves.height/cell)-5;
      const fold=compact ? Math.round(l+Math.min(10,(r-l)*.042)) : Math.round((l+r)/2);
      const shape=[w,h,l,r,t,b,compact].join('/');
      if(shape===lastShape) return;
      lastShape=shape;
      canvas.width=w; canvas.height=h; canvas.style.height=cssHeight+'px';
      const {rect,line,polygon}=pixelTools(ctx);
      const cover=[[2,9],[5,5],[l+5,4],[Math.round(w*.28),1],[fold-4,4],[fold,6],[fold+4,4],[Math.round(w*.78),1],[w-6,4],[w-2,7],[w-1,h-9],[w-5,h-5],[Math.round(w*.78),h-4],[fold+4,h-1],[fold-4,h-1],[Math.round(w*.22),h-4],[5,h-4],[1,h-8]];
      polygon(cover,'#52382e');
      polygon(cover.map(([x,y])=>[Math.max(3,Math.min(w-4,x)),Math.max(4,Math.min(h-7,y))]),'#80543e');
      // Worn calfskin, corded hinge, and blind-tooled seams in the board.
      for(let x=5;x<w-4;x++) {
        const y=h-8+Math.round(1.4*Math.sin(x*.027));
        rect(x,y,1,1,(x%9<6) ? '#ae8156' : '#654634');
        if(x%7<3) rect(x,h-12+(x%3),1,1,'#956b49');
      }
      for(const side of [-1,1]) {
        const x=side<0?4:w-5;
        line(x,9,x,h-11,side<0?'#ae8055':'#563d31');
        for(let y=12;y<h-10;y+=6) rect(x+side,y,1,2,'#c09a67');
      }
      // Thick stocks of leaves, convex at the shoulder and dipping into the joint.
      const curves=(x,left,right,side) => {
        const u=side<0 ? (x-left)/(right-left) : (right-x)/(right-left);
        const arch=Math.sin(Math.max(0,Math.min(1,u))*Math.PI);
        const lift=compact && side<0 ? 1.4 : Math.min(6.4,(r-l)*.027);
        const edge=1-arch;
        return {
          top:Math.round(t+lift*edge+u*1.8),
          end:Math.round(b-lift*arch+u*1.5),
          u,arch,
        };
      };
      for(const [left,right,side] of [[l,fold,-1],[fold+1,r,1]]) {
        for(let x=left;x<=right;x++) {
          const {top,end,u,arch}=curves(x,left,right,side);
          const fore=Math.max(2,Math.round(2.5+arch*2+(.5+.5*Math.sin(x*.09))));
          rect(x+1,top+2,1,end-top+fore+1,'#70543c');
          for(let k=0;k<fore;k++) {
            const tone=(k+Math.floor(x*.023+Math.sin(x*.066)*.4))%4;
            rect(x,end+k,1,1,['#ead3a5','#a68d67','#c4ae86','#947956'][tone]);
          }
          const nearJoint=Math.max(0,1-(1-u)*(right-left)/(compact?10:19));
          const outer=Math.max(0,1-u*(right-left)/11);
          const dark=Math.round(outer*18+nearJoint*35+(side<0?4:0));
          ctx.fillStyle='rgb('+(237-dark)+','+(217-dark)+','+(180-Math.round(dark*.92))+')';
          ctx.fillRect(x,top,1,end-top);
          rect(x,top,1,1,nearJoint>.72?'#ad916c':'#f5e3b9');
          if(!compact && x%23<7) rect(x,end-1,1,1,'#d9bd90');
        }
      }
      // Fine laid-paper fibres collect at the margins. The continuous reading columns stay clear.
      const seed=(x,y) => (Math.imul(x,73856093)^Math.imul(y,19349663))>>>0;
      for(let y=t+8;y<b-6;y+=2) {
        for(const [edge,side] of [[l+1,1],[r-1,-1]]) {
          const n=seed(edge,y);
          if(n%5>2) continue;
          const x=edge+side*((n>>>5)%6);
          rect(x,y,(n>>>9)%3+1,1,n%4===0?'#c4aa80':'#dfc79e');
        }
      }
      // A pair of blind-stamped leaves on each board, with a burnished nick in the leather.
      for(const side of [-1,1]) {
        const x=side<0?l+2:r-2, dir=-side;
        line(x,h-13,x+dir*7,h-17,'#704c39');
        line(x+dir*2,h-14,x+dir*2,h-17,'#947052');
        line(x+dir*4,h-15,x+dir*7,h-14,'#a27b54');
      }
      // A woven marker lies between gatherings, emerging from the deckled fore edge.
      const tabX=Math.round(compact ? r-(r-l)*.15 : fold+(r-fold)*.49);
      const tabY=curves(tabX,fold+1,r,1).end;
      polygon([[tabX,tabY],[tabX+6,tabY-1],[tabX+9,tabY+9],[tabX+6,tabY+8],[tabX+4,tabY+12],[tabX+2,tabY+8]],'#4c665a');
      line(tabX+1,tabY+1,tabX+4,tabY+8,'#90a183'); line(tabX+5,tabY,tabX+8,tabY+7,'#385248');
      // Linen saddle stitches rise out of darker pierced holes, following the crease.
      line(fold,t+7,fold,b+1,'#a08461');
      for(const fraction of [.17,.50,.83]) {
        const y=Math.round(t+(b-t)*fraction);
        rect(fold-1,y,2,1,'#80694c'); rect(fold+1,y+5,2,1,'#80694c');
        line(fold,y+1,fold+2,y+4,'#d2b68a'); line(fold+1,y+1,fold+2,y+3,'#f0d5aa');
      }
      // Marginal pen flourishes and pockets of foxing live at the outside edges.
      for(const [outer,side] of [[l+3,1],[r-3,-1]]) {
        if(compact && side===1) continue;
        const y=side===1 ? t+12 : b-10, vertical=side===1 ? 1 : -1;
        line(outer,y,outer+side*9,y-vertical,'#b09469');
        line(outer,y,outer,y+vertical*7,'#aa8c61');
        line(outer+2*side,y+vertical*3,outer+6*side,y+vertical*2,'#bf9e6d');
        rect(outer+side*3,y+vertical*1,2,1,'#94774f');
        for(const [dx,dy] of [[1,10],[4,12],[1,15],[7,4],[12,2]]) rect(outer+side*dx,y+vertical*dy,1,1,'#c5ab7f');
      }
      // Tarnished corner caps wrap under the pages. A few bright pixels pick up the sun.
      for(const [x,flip] of [[3,1],[w-4,-1]]) {
        polygon([[x,h-14],[x+flip*2,h-11],[x+flip*9,h-6],[x+flip*4,h-5],[x,h-7]],'#a58257');
        line(x+flip,h-12,x+flip*7,h-7,'#cfaf77');
        rect(x+flip*3,h-8,1,1,'#68513b');
      }
    }
    const resize=new ResizeObserver(render);
    resize.observe(book);
    resize.observe(spread);
    new MutationObserver(render).observe(book,{attributes:true,attributeFilter:['open']});
    render();
  }

  window.paintInnFloorDetail=(canvas,id,step=0) => {
    if(id==='map') paintOpenMap(canvas);
    else if(id==='mallet') paintMallet(canvas, step < 0 ? 'inspect' : 'head');
    else return false;
    return true;
  };

  const bookArt=document.querySelector('canvas.guide-art');
  if(bookArt) illustrateGuidebook(bookArt);

  for (const [name,paint] of [['wall-painting',paintWall],['mallet',paintMallet],['grimoire',paintGrimoire],['repo-map',paintMap]]) {
    const canvas = document.querySelector('canvas.' + name);
    if (!canvas) continue;
    paint(canvas);
    if (name === 'mallet') {
      let lastWidth=canvas.getBoundingClientRect().width;
      const room=document.querySelector('.room');
      let lastRoomWidth=room.clientWidth, lastRoomHeight=room.clientHeight;
      const resize=new ResizeObserver(() => {
        const width=canvas.getBoundingClientRect().width;
        if(width===lastWidth && room.clientWidth===lastRoomWidth && room.clientHeight===lastRoomHeight) return;
        lastWidth=width; lastRoomWidth=room.clientWidth; lastRoomHeight=room.clientHeight;
        paintMallet(canvas);
      });
      resize.observe(canvas);
      resize.observe(room);
    }
  }
})();

/*
 * The GitHub mark on the map derives from Primer Octicons mark-github-16.
 * https://github.com/primer/octicons
 * MIT License. Copyright (c) 2026 GitHub Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
